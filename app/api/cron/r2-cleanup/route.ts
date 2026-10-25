import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { timingSafeEqual } from "node:crypto";
import { getR2BucketName, getR2Client } from "@/lib/cloudflare/r2";
import { paymentDatabase } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = paymentDatabase();
    const expired = await db.from("r2_upload_tickets")
      .select("upload_id,purpose,target_id,object_key,multipart_upload_id,status")
      .in("status", ["uploading", "ready", "cleanup_pending"])
      .lt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true })
      .limit(100);
    if (expired.error) throw expired.error;
    const client = getR2Client();
    let cleaned = 0;
    let preserved = 0;
    for (const ticket of expired.data ?? []) {
      if (ticket.status !== "cleanup_pending") {
        const claim = await db.from("r2_upload_tickets").update({ status: "cleanup_pending" })
          .eq("upload_id", ticket.upload_id).in("status", ["uploading", "ready"])
          .select("upload_id").maybeSingle();
        if (claim.error || !claim.data) continue;
      }
      const ref = `r2:${ticket.object_key}`;
      const [message, submission, dispute] = await Promise.all([
        db.from("messages").select("message_id").eq("attachment_url", ref).limit(1),
        db.from("project_submissions").select("submission_id").eq("attachment_path", ref).limit(1),
        db.from("project_disputes").select("dispute_id").eq("evidence_path", ref).limit(1),
      ]);
      if (message.error || submission.error || dispute.error) continue;
      const attachedId =
        ticket.purpose === "message" ? message.data?.[0]?.message_id :
        ticket.purpose === "submission" ? submission.data?.[0]?.submission_id :
        dispute.data?.[0]?.dispute_id;
      if (attachedId) {
        await db.from("r2_upload_tickets").update({ status: "attached", attached_record_id: attachedId })
          .eq("upload_id", ticket.upload_id).eq("status", "cleanup_pending");
        preserved += 1;
        continue;
      }
      await client.send(new AbortMultipartUploadCommand({
        Bucket: getR2BucketName(), Key: ticket.object_key, UploadId: ticket.multipart_upload_id,
      })).catch(() => undefined);
      await client.send(new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: ticket.object_key }));
      const done = await db.from("r2_upload_tickets").update({ status: "aborted" })
        .eq("upload_id", ticket.upload_id).eq("status", "cleanup_pending");
      if (done.error) throw done.error;
      cleaned += 1;
    }
    return Response.json({ cleaned, preserved }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("R2 cleanup failed", error);
    return Response.json({ error: "R2 cleanup failed." }, { status: 503 });
  }
}
