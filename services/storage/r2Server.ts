import "server-only";
import { paymentUser } from "@/services/payments/paymentServer";
import { PaymentError } from "@/lib/payments/paymongo";

export type R2Purpose = "message" | "submission" | "dispute";
export type R2Auth = Awaited<ReturnType<typeof paymentUser>>;

export async function requireR2User(request: Request): Promise<R2Auth> {
  try {
    return await paymentUser(request);
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError("Unable to verify your session. Sign in again.", 401);
  }
}

export function storageResponse(error: unknown): Response {
  if (error instanceof PaymentError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  console.error("R2 storage request failed", error);
  return Response.json(
    { error: "Secure file storage is temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function assertR2Target(
  db: R2Auth["db"],
  userId: string,
  purpose: R2Purpose,
  targetId: string,
): Promise<void> {
  if (purpose === "message") {
    const { data, error } = await db
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", targetId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data)
      throw new PaymentError("You cannot attach a file to this conversation.", 403);
    return;
  }
  const { data: project, error } = await db
    .from("projects")
    .select("project_id, client_id, freelancer_id, status")
    .eq("project_id", targetId)
    .maybeSingle();
  if (error || !project)
    throw new PaymentError("This project is unavailable.", 404);
  const [client, freelancer] = await Promise.all([
    db.from("client_profiles").select("user_id").eq("client_id", project.client_id).maybeSingle(),
    db.from("freelancer_profiles").select("user_id").eq("freelancer_id", project.freelancer_id).maybeSingle(),
  ]);
  if (client.error || freelancer.error)
    throw new PaymentError("Project access could not be verified.");
  const participant = userId === client.data?.user_id || userId === freelancer.data?.user_id;
  if (!participant)
    throw new PaymentError("You cannot attach a file to this project.", 403);
  if (purpose === "submission" &&
      (userId !== freelancer.data?.user_id || !["active", "in_progress", "revision"].includes(project.status)))
    throw new PaymentError("Only the project freelancer can submit work while the project is active.", 403);
  if (purpose === "dispute" && !["active", "in_progress", "revision"].includes(project.status))
    throw new PaymentError("Evidence can only be attached to an active project dispute.", 409);
}

export function safeFilename(value: string): string {
  const normalized = value.normalize("NFKC");
  const cleaned = [...normalized]
    .map((character) => {
      const code = character.charCodeAt(0);
      return character === "/" || character === "\\" || code < 32 || code === 127
        ? "_"
        : character;
    })
    .join("")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .trim()
    .slice(0, 180);
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "attachment";
}
