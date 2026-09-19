import {
  verificationUser,
  getVerification,
  startVerification,
  verificationResponse,
} from "@/services/verification/verificationServer";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return Response.json(
      await getVerification(await verificationUser(request)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return verificationResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await verificationUser(request);
    // No browser-supplied user ID, session ID, workflow, or verification decision.
    return Response.json(await startVerification(user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return verificationResponse(error);
  }
}
