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
function failure(
  error: unknown,
  request: Request,
  method: "GET" | "POST",
  started: number,
) {
  if (request.signal.aborted)
    return new Response(null, { status: 499, headers });
  const status = error instanceof CallError ? error.status : 500;
  const code =
    error instanceof CallError ? error.code : "CALLS_UNEXPECTED_FAILURE";
  if (status >= 500) {
    console.error(
      "[WorkSync API] " +
        JSON.stringify({
          endpoint: "/api/calls",
          method,
          status,
          code:
            typeof code === "string" && /^[A-Z0-9_]{1,80}$/.test(code)
              ? code
              : "CALLS_UNCLASSIFIED_FAILURE",
          elapsedMs: Date.now() - started,
          upstreamStatus:
            error instanceof CallError ? error.upstreamStatus ?? null : null,
          databaseCode:
            error instanceof CallError ? error.databaseCode ?? null : null,
        }),
    );
  }
  return NextResponse.json(
    {
      upstreamStatus:
        error instanceof CallError ? error.upstreamStatus : undefined,
      databaseCode: error instanceof CallError ? error.databaseCode : undefined,
      code:
        error instanceof CallError ? error.code : "CALLS_UNEXPECTED_FAILURE",
      error:
        error instanceof CallError
          ? error.message
          : "Unable to process the video call. Please try again.",
    },
    { status, headers },
  );
}
export async function GET(request: Request) {
  const started = Date.now();
  try {
    const ctx = await callUser(request);
    return NextResponse.json(
      { userId: ctx.user.id, calls: await listCalls(ctx) },
      { headers },
    );
  } catch (error) {
    return failure(error, request, "GET", started);
  }
}
export async function POST(request: Request) {
  const started = Date.now();
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
    return failure(error, request, "POST", started);
  }
}
