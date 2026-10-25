import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getR2BucketName, getR2Client } from "@/lib/cloudflare/r2";
import { PaymentError } from "@/lib/payments/paymongo";
import { isUuid, requireR2User, storageResponse } from "@/services/storage/r2Server";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ uploadId: string }> }) {
  try {
    const { db, user } = await requireR2User(request);
    const { uploadId } = await context.params;
    if (!isUuid(uploadId)) throw new PaymentError("Invalid upload reference.", 400);
    const { data: ticket, error } = await db.from("r2_upload_tickets")
      .select("upload_id,owner_id,object_key,multipart_upload_id,status")
      .eq("upload_id", uploadId).eq("owner_id", user.id).maybeSingle();
    if (error || !ticket) throw new PaymentError("Upload not found.", 404);
    if (ticket.status === "attached")
      throw new PaymentError("This file is already attached to a WorkSync record.", 409);
    if (ticket.status !== "aborted" && ticket.status !== "cleanup_pending") {
      const claim = await db.from("r2_upload_tickets").update({ status: "cleanup_pending" })
        .eq("upload_id", uploadId).eq("owner_id", user.id)
        .in("status", ["uploading", "ready"]).select("upload_id").maybeSingle();
      if (claim.error) throw new PaymentError("The upload could not be safely cancelled.");
      if (!claim.data) {
        const current = await db.from("r2_upload_tickets").select("status")
          .eq("upload_id", uploadId).eq("owner_id", user.id).maybeSingle();
        if (current.data?.status !== "aborted" && current.data?.status !== "cleanup_pending")
          throw new PaymentError("This file is already attached to a WorkSync record.", 409);
      }
    }

    const reference = `r2:${ticket.object_key}`;
    const [message, submission, dispute] = await Promise.all([
      db.from("messages").select("message_id").eq("attachment_url", reference).limit(1),
      db.from("project_submissions").select("submission_id").eq("attachment_path", reference).limit(1),
      db.from("project_disputes").select("dispute_id").eq("evidence_path", reference).limit(1),
    ]);
    if (message.error || submission.error || dispute.error)
      throw new PaymentError("File attachment status could not be verified.");
    if (message.data?.length || submission.data?.length || dispute.data?.length)
      throw new PaymentError("This file is already attached to a WorkSync record.", 409);

    const claimed = await db.from("r2_upload_tickets").update({ status: "cleanup_pending" })
      .eq("upload_id", uploadId).eq("owner_id", user.id).in("status", ["uploading", "ready", "aborted", "cleanup_pending"]);
    if (claimed.error) throw new PaymentError("The upload could not be safely cancelled.");
    const client = getR2Client();
    await client.send(new AbortMultipartUploadCommand({
      Bucket: getR2BucketName(), Key: ticket.object_key, UploadId: ticket.multipart_upload_id,
    })).catch(() => undefined);
    await client.send(new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: ticket.object_key }));
    const finished = await db.from("r2_upload_tickets").update({ status: "aborted" })
      .eq("upload_id", uploadId).eq("owner_id", user.id).eq("status", "cleanup_pending");
    if (finished.error) throw new PaymentError("The cancelled upload could not be recorded.");
    return Response.json({ ok: true });
  } catch (error) {
    return storageResponse(error);
  }
}
