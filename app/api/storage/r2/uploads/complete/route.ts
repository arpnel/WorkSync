import {
  CompleteMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
} from "@aws-sdk/client-s3";
import { getR2BucketName, getR2Client, R2_PART_BYTES } from "@/lib/cloudflare/r2";
import { PaymentError } from "@/lib/payments/paymongo";
import { isUuid, requireR2User, storageResponse } from "@/services/storage/r2Server";

export const runtime = "nodejs";
type UploadPart = { partNumber: number; etag: string };

function validFileHeader(type: string, bytes: Uint8Array): boolean {
  const starts = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  switch (type) {
    case "application/pdf": return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
    case "image/png": return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/jpeg": return starts(0xff, 0xd8, 0xff);
    case "image/gif": return new TextDecoder().decode(bytes.slice(0, 6)).startsWith("GIF8");
    case "image/webp": return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
    case "video/mp4":
    case "video/quicktime": return new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
    case "video/webm": return starts(0x1a, 0x45, 0xdf, 0xa3);
    case "audio/mpeg": return new TextDecoder().decode(bytes.slice(0, 3)) === "ID3" || starts(0xff, 0xfb);
    case "audio/mp4": return new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
    case "audio/wav":
    case "audio/x-wav": return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WAVE";
    case "audio/ogg": return new TextDecoder().decode(bytes.slice(0, 4)) === "OggS";
    case "application/zip":
    case "application/x-zip-compressed":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06);
    case "application/msword":
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
      return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    case "text/plain":
    case "text/csv": return !bytes.some((byte) => byte === 0);
    case "application/octet-stream": return true;
    default: return false;
  }
}

export async function POST(request: Request) {
  try {
    const { db, user } = await requireR2User(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!isUuid(body?.uploadId) || !Array.isArray(body?.parts))
      throw new PaymentError("Invalid large upload completion request.", 400);
    const parts = body.parts as UploadPart[];
    const { data: ticket, error } = await db.from("r2_upload_tickets")
      .select("upload_id,owner_id,purpose,target_id,object_key,multipart_upload_id,file_name,content_type,expected_size,status,expires_at")
      .eq("upload_id", body.uploadId).eq("owner_id", user.id).maybeSingle();
    if (error || !ticket) throw new PaymentError("Large upload not found.", 404);
    if (ticket.status !== "uploading" || Date.parse(ticket.expires_at) <= Date.now())
      throw new PaymentError("This upload expired or has already been completed.", 409);

    const client = getR2Client();
    const bucket = getR2BucketName();
    const list = await client.send(new ListPartsCommand({
      Bucket: bucket, Key: ticket.object_key, UploadId: ticket.multipart_upload_id,
    }));
    const remoteParts = list.Parts ?? [];
    const expectedCount = Math.ceil(Number(ticket.expected_size) / R2_PART_BYTES);
    if (list.IsTruncated || remoteParts.length !== expectedCount || parts.length !== expectedCount)
      throw new PaymentError("The upload is incomplete. Try uploading the file again.", 400);
    const completedParts = [];
    for (let index = 0; index < expectedCount; index++) {
      const number = index + 1;
      const remote = remoteParts[index];
      const clientPart = parts[index];
      const expectedPartBytes = Math.min(R2_PART_BYTES, Number(ticket.expected_size) - index * R2_PART_BYTES);
      if (remote.PartNumber !== number || clientPart?.partNumber !== number ||
          !remote.ETag || !clientPart.etag || remote.ETag.replaceAll('"', "") !== clientPart.etag.replaceAll('"', "") ||
          remote.Size !== expectedPartBytes)
        throw new PaymentError("The uploaded file parts did not match. Please retry.", 400);
      completedParts.push({ PartNumber: number, ETag: remote.ETag });
    }

    await client.send(new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: ticket.object_key,
      UploadId: ticket.multipart_upload_id,
      MultipartUpload: { Parts: completedParts },
    }));
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: ticket.object_key }));
      if (head.ContentLength !== Number(ticket.expected_size) || head.ContentType !== ticket.content_type)
        throw new PaymentError("The uploaded file size or type did not match the selected file.", 400);
      const first = await client.send(new GetObjectCommand({ Bucket: bucket, Key: ticket.object_key, Range: "bytes=0-15" }));
      const bytes = first.Body ? await first.Body.transformToByteArray() : new Uint8Array();
      if (!validFileHeader(ticket.content_type, bytes))
        throw new PaymentError("The uploaded file content does not match its file type.", 400);
      const saved = await db.from("r2_upload_tickets").update({ status: "ready" })
        .eq("upload_id", body.uploadId).eq("owner_id", user.id).eq("status", "uploading")
        .select("upload_id").maybeSingle();
      if (saved.error || !saved.data) throw new PaymentError("Upload metadata could not be finalized.");
      return Response.json({ reference: `r2:${ticket.object_key}`, fileName: ticket.file_name, contentType: ticket.content_type }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      let cleaned = false;
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: ticket.object_key }));
        cleaned = true;
      } catch { /* the scheduled cleanup will retry */ }
      await db.from("r2_upload_tickets").update({ status: cleaned ? "aborted" : "cleanup_pending" })
        .eq("upload_id", body.uploadId);
      throw error;
    }
  } catch (error) {
    return storageResponse(error);
  }
}
