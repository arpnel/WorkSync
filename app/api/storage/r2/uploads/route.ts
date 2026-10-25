import {
  AbortMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2BucketName, getR2Client, R2_PART_BYTES } from "@/lib/cloudflare/r2";
import { validateLargeAttachment } from "@/lib/storage/hybridStorage";
import {
  assertR2Target,
  isUuid,
  requireR2User,
  safeFilename,
  storageResponse,
  type R2Purpose,
} from "@/services/storage/r2Server";
import { PaymentError } from "@/lib/payments/paymongo";

export const runtime = "nodejs";
const URL_TTL_SECONDS = 2 * 60 * 60;

export async function POST(request: Request) {
  let multipart: { key: string; uploadId: string } | null = null;
  let db: Awaited<ReturnType<typeof requireR2User>>["db"] | null = null;
  try {
    const auth = await requireR2User(request);
    db = auth.db;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const purpose = body?.purpose;
    if (!(purpose === "message" || purpose === "submission" || purpose === "dispute") ||
        !isUuid(body?.targetId) || typeof body?.fileName !== "string" ||
        typeof body?.contentType !== "string" || typeof body?.size !== "number")
      throw new PaymentError("Invalid large file upload request.", 400);
    const size = body.size;
    const validation = validateLargeAttachment(size, body.fileName, body.contentType);
    if (validation) throw new PaymentError(validation, 400);
    await assertR2Target(auth.db, auth.user.id, purpose as R2Purpose, body.targetId);

    const client = getR2Client();
    const bucket = getR2BucketName();
    const ticketId = crypto.randomUUID();
    const fileName = safeFilename(body.fileName);
    const key = `${purpose}/${auth.user.id}/${body.targetId}/${ticketId}/${fileName}`;
    const created = await client.send(new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: body.contentType.toLowerCase(),
      ContentDisposition: `attachment; filename="${fileName.replace(/["\\]/g, "_")}"`,
      Metadata: { "worksync-upload-id": ticketId },
    }));
    if (!created.UploadId) throw new PaymentError("Unable to start a secure upload.");
    multipart = { key, uploadId: created.UploadId };
    const expiresAt = new Date(Date.now() + URL_TTL_SECONDS * 1000).toISOString();
    const saved = await auth.db.from("r2_upload_tickets").insert({
      upload_id: ticketId,
      owner_id: auth.user.id,
      purpose,
      target_id: body.targetId,
      object_key: key,
      multipart_upload_id: created.UploadId,
      file_name: fileName,
      content_type: body.contentType.toLowerCase(),
      expected_size: size,
      expires_at: expiresAt,
    });
    if (saved.error) throw new PaymentError("Secure upload tracking is not available. Apply the prepared storage migration first.");

    const partCount = Math.ceil(size / R2_PART_BYTES);
    const parts = await Promise.all(Array.from({ length: partCount }, async (_, index) => {
      const partNumber = index + 1;
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: created.UploadId,
        PartNumber: partNumber,
        ContentLength: Math.min(R2_PART_BYTES, size - (partNumber - 1) * R2_PART_BYTES),
      });
      return {
        partNumber,
        url: await getSignedUrl(client, command, { expiresIn: URL_TTL_SECONDS }),
      };
    }));
    return Response.json({ uploadId: ticketId, partSize: R2_PART_BYTES, parts }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    let cleaned = false;
    if (multipart) {
      try {
        await getR2Client().send(new AbortMultipartUploadCommand({
          Bucket: getR2BucketName(),
          Key: multipart.key,
          UploadId: multipart.uploadId,
        }));
        cleaned = true;
      } catch { /* the lifecycle/cron cleanup will retry */ }
    }
    if (db && multipart)
      await db.from("r2_upload_tickets").update({ status: cleaned ? "aborted" : "cleanup_pending" }).eq("object_key", multipart.key);
    return storageResponse(error);
  }
}
