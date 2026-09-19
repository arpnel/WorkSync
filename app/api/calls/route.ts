import { NextResponse } from "next/server";
import {
  actOnCall,
  CallError,
  callUser,
  listCalls,
  startCall,
} from "@/services/calls/callServer";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  return NextResponse.json(
    {
      code:
        error instanceof CallError ? error.code : "CALLS_UNEXPECTED_FAILURE",
      error:
        error instanceof CallError
          ? error.message
          : "Unable to process the video call. Please try again.",
    },
    { status: error instanceof CallError ? error.status : 500, headers },
  );
}
export async function GET(request: Request) {
  try {
    const ctx = await callUser(request);
    return NextResponse.json(
      { userId: ctx.user.id, calls: await listCalls(ctx) },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await callUser(request);
    const body = await request.json().catch(() => {
      throw new CallError("Invalid call request.");
    });
    if (
      !body ||
      !["start", "accept", "decline", "end", "join"].includes(body.action)
    )
      throw new CallError("Unknown call action.");
    const result =
      body.action === "start"
        ? { call: await startCall(ctx, body.conversationId, body.callId) }
        : await actOnCall(ctx, body.callId, body.action);
    return NextResponse.json(result, { headers });
  } catch (error) {
    return failure(error);
  }
}
