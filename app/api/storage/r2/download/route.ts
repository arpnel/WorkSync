import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2BucketName, getR2Client } from "@/lib/cloudflare/r2";
import { PaymentError } from "@/lib/payments/paymongo";
import { isUuid, requireR2User, storageResponse, type R2Purpose } from "@/services/storage/r2Server";

export const runtime = "nodejs";
const SAFE_INLINE_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);

async function projectParticipant(db: Awaited<ReturnType<typeof requireR2User>>["db"], userId: string, projectId: string) {
  const { data: project, error } = await db.from("projects")
    .select("client_id,freelancer_id").eq("project_id", projectId).maybeSingle();
  if (error || !project) return false;
  const [client, freelancer] = await Promise.all([
    db.from("client_profiles").select("user_id").eq("client_id", project.client_id).maybeSingle(),
    db.from("freelancer_profiles").select("user_id").eq("freelancer_id", project.freelancer_id).maybeSingle(),
  ]);
  if (client.error || freelancer.error) throw new PaymentError("Project file access could not be verified.");
  return client.data?.user_id === userId || freelancer.data?.user_id === userId;
}

export async function POST(request: Request) {
  try {
    const { db, user } = await requireR2User(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const purpose = body?.purpose;
    if (!(purpose === "message" || purpose === "submission" || purpose === "dispute") || !isUuid(body?.recordId))
      throw new PaymentError("Invalid file reference.", 400);

    let reference: string | null = null;
    let targetId: string;
    if (purpose === "message") {
      const { data: row, error } = await db.from("messages").select("conversation_id,attachment_url")
        .eq("message_id", body.recordId).maybeSingle();
      if (error || !row) throw new PaymentError("Attachment not found.", 404);
      const member = await db.from("conversation_participants").select("user_id")
        .eq("conversation_id", row.conversation_id).eq("user_id", user.id).maybeSingle();
      if (member.error || !member.data) throw new PaymentError("You cannot open this conversation attachment.", 403);
      reference = row.attachment_url;
      targetId = row.conversation_id;
    } else if (purpose === "submission") {
      const { data: row, error } = await db.from("project_submissions").select("project_id,attachment_path")
        .eq("submission_id", body.recordId).maybeSingle();
      if (error || !row) throw new PaymentError("Attachment not found.", 404);
      let allowed = await projectParticipant(db, user.id, row.project_id);
      if (!allowed) {
        const [admin, dispute] = await Promise.all([
          db.from("admin_members").select("user_id").eq("user_id", user.id).maybeSingle(),
          db.from("project_disputes").select("dispute_id").eq("project_id", row.project_id).limit(1),
        ]);
        if (admin.error || dispute.error)
          throw new PaymentError("Project file access could not be verified.");
        allowed = !!admin.data && !!dispute.data?.length;
      }
      if (!allowed) throw new PaymentError("You cannot open this project attachment.", 403);
      reference = row.attachment_path;
      targetId = row.project_id;
    } else {
      const { data: row, error } = await db.from("project_disputes").select("project_id,evidence_path")
        .eq("dispute_id", body.recordId).maybeSingle();
      if (error || !row) throw new PaymentError("Evidence not found.", 404);
      let allowed = await projectParticipant(db, user.id, row.project_id);
      if (!allowed) {
        const admin = await db.from("admin_members").select("user_id").eq("user_id", user.id).maybeSingle();
        if (admin.error) throw new PaymentError("Evidence access could not be verified.");
        allowed = !!admin.data;
      }
      if (!allowed) throw new PaymentError("You cannot open this dispute evidence.", 403);
      reference = row.evidence_path;
      targetId = row.project_id;
    }
    if (!reference?.startsWith("r2:")) throw new PaymentError("This is not an R2 file reference.", 400);
    const key = reference.slice(3);
    const ticket = await db.from("r2_upload_tickets")
      .select("upload_id,content_type,file_name,object_key,status,attached_record_id,target_id,purpose")
      .eq("object_key", key).eq("purpose", purpose as R2Purpose).eq("target_id", targetId)
      .eq("status", "attached").eq("attached_record_id", body.recordId).maybeSingle();
    if (ticket.error || !ticket.data)
      throw new PaymentError("The file is not linked to this WorkSync record.", 404);

    const type = ticket.data.content_type;
    const client = getR2Client();
    const url = await getSignedUrl(client, new GetObjectCommand({
      Bucket: getR2BucketName(),
      Key: ticket.data.object_key,
      ResponseContentType: type,
      ResponseContentDisposition: `${SAFE_INLINE_TYPES.has(type) ? "inline" : "attachment"}; filename="${ticket.data.file_name.replace(/["\\]/g, "_")}"`,
      ResponseCacheControl: "private, no-store",
    }), { expiresIn: 15 * 60 });
    return Response.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return storageResponse(error);
  }
}
