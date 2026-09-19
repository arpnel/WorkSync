import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CALL_PREFIX,
  callState,
  parseCallMessage,
  type VideoCall,
} from "@/lib/calls/callMessage";

export class CallError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validCallId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !uuid.test(value))
    throw new CallError("Invalid call or conversation.");
}
function dailyKey() {
  const key = process.env.DAILY_API_KEY?.trim();
  if (!key) throw new CallError("Video calling is not configured yet.", 503);
  return key;
}
export function signCall(call: VideoCall) {
  const signature = createHmac("sha256", dailyKey())
    .update(JSON.stringify(call))
    .digest("hex");
  return CALL_PREFIX + JSON.stringify({ call, signature });
}
export function verifiedCall(row: {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  message: string;
}): VideoCall | null {
  const value = parseCallMessage(row.message);
  if (!value || !/^[a-f0-9]{64}$/.test(value.signature)) return null;
  const { call } = value;
  if (
    call.id !== row.message_id ||
    call.conversationId !== row.conversation_id ||
    call.callerId !== row.sender_id
  )
    return null;
  const expected = createHmac("sha256", dailyKey())
    .update(JSON.stringify(call))
    .digest();
  return timingSafeEqual(expected, Buffer.from(value.signature, "hex"))
    ? call
    : null;
}
export async function daily(path: string, method = "GET", body?: unknown) {
  let response: Response;
  try {
    response = await fetch(`https://api.daily.co/v1${path}`, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${dailyKey()}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error instanceof CallError) throw error;
    throw new CallError(
      "The video service could not be reached. Please try again.",
      502,
    );
  }
  if (!response.ok)
    throw new CallError(
      response.status === 401 || response.status === 403
        ? "Video calling is not configured correctly. Please contact support."
        : response.status === 404
          ? "This call is no longer available."
          : "The video service could not complete this request. Please try again.",
      response.status === 404 ? 410 : 502,
    );
  return response.json();
}
export async function callUser(request: Request) {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) throw new CallError("Sign in to use video calling.", 401);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new CallError("Video calling is not configured yet.", 503);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const {
    data: { user },
    error,
  } = await db.auth.getUser(bearer);
  if (error || !user)
    throw new CallError("Your session expired. Sign in again.", 401);
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return { db, client, user };
}
type Context = Awaited<ReturnType<typeof callUser>>;
async function members(ctx: Context, conversationId: string) {
  validCallId(conversationId);
  const { data, error } = await ctx.db
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);
  if (error) throw new CallError("Unable to check conversation access.", 503);
  const ids = [...new Set<string>((data ?? []).map((p) => p.user_id))];
  if (!ids.includes(ctx.user.id))
    throw new CallError("You do not have access to this conversation.", 403);
  if (ids.length !== 2)
    throw new CallError(
      "Video calls currently support conversations between two people.",
    );
  return ids;
}
async function checkBlocks(ctx: Context, ids: string[]) {
  const { data, error } = await ctx.db
    .from("user_blocks")
    .select("blocker_id")
    .in("blocker_id", ids)
    .in("blocked_id", ids)
    .limit(1);
  // The optional block feature may not yet be installed. Other database errors fail closed.
  if (error && !["42P01", "PGRST205"].includes(error.code))
    throw new CallError("Unable to check calling permissions.", 503);
  if (data?.length)
    throw new CallError("Calling is unavailable for this conversation.", 403);
}
export async function listCalls(ctx: Context) {
  dailyKey();
  const { data: memberships, error } = await ctx.db
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", ctx.user.id);
  if (error) throw new CallError("Unable to load calls.", 503);
  const ids = (memberships ?? []).map((m) => m.conversation_id);
  if (!ids.length) return [];
  const { data: blocks, error: blockError } = await ctx.db
    .from("user_blocks")
    .select("blocker_id,blocked_id")
    .or(`blocker_id.eq.${ctx.user.id},blocked_id.eq.${ctx.user.id}`);
  if (blockError && !["42P01", "PGRST205"].includes(blockError.code))
    throw new CallError("Unable to check calling permissions.", 503);
  const blocked = new Set(
    (blocks ?? []).map((b) =>
      b.blocker_id === ctx.user.id ? b.blocked_id : b.blocker_id,
    ),
  );
  const { data, error: readError } = await ctx.db
    .from("messages")
    .select("message_id,conversation_id,sender_id,message")
    .in("conversation_id", ids)
    .like("message", CALL_PREFIX + "%")
    .gte("created_at", new Date(Date.now() - 3600000).toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  if (readError) throw new CallError("Unable to load calls.", 503);
  return (data ?? []).flatMap((row) => {
    const call = verifiedCall(row);
    return call &&
      !blocked.has(call.callerId) &&
      !blocked.has(call.recipientId) &&
      [call.callerId, call.recipientId].includes(ctx.user.id)
      ? [call]
      : [];
  });
}
const roomName = (call: VideoCall) => `ws-${call.id}`;
async function closeRoom(call: VideoCall) {
  // Expiry is the fallback if provider cleanup is temporarily unavailable.
  await daily(`/rooms/${roomName(call)}/eject`, "POST", {
    user_ids: [call.callerId, call.recipientId],
    ban: true,
  }).catch(() => undefined);
  await daily(`/rooms/${roomName(call)}`, "DELETE").catch(() => undefined);
}
export async function startCall(
  ctx: Context,
  conversationId: string,
  id: string,
) {
  validCallId(id);
  const ids = await members(ctx, conversationId);
  await checkBlocks(ctx, ids);
  const calls = await listCalls(ctx);
  const existing = calls.find((c) =>
    ["ringing", "active"].includes(callState(c)),
  );
  if (existing) {
    if (existing.conversationId === conversationId) return existing;
    throw new CallError("Finish your current call first.", 409);
  }
  // Bound call creation even when repeated requests come from different browser tabs.
  if (
    calls.filter(
      (c) => c.callerId === ctx.user.id && c.createdAt > Date.now() - 60000,
    ).length >= 3
  )
    throw new CallError("Please wait before calling again.", 429);
  const recipientId = ids.find((value) => value !== ctx.user.id)!;
  const { data: profiles, error } = await ctx.db
    .from("profiles")
    .select("user_id,display_name,first_name,last_name")
    .in("user_id", ids);
  if (error) throw new CallError("Unable to load call participants.", 503);
  const name = (userId: string) => {
    const p = profiles?.find((value) => value.user_id === userId);
    return String(
      p?.display_name ||
        [p?.first_name, p?.last_name].filter(Boolean).join(" ") ||
        "WorkSync user",
    ).slice(0, 100);
  };
  const now = Date.now();
  const call: VideoCall = {
    id,
    conversationId,
    callerId: ctx.user.id,
    recipientId,
    callerName: name(ctx.user.id),
    recipientName: name(recipientId),
    state: "ringing",
    createdAt: now,
    ringingUntil: now + 60000,
    expiresAt: now + 3600000,
  };
  await daily("/rooms", "POST", {
    name: roomName(call),
    privacy: "private",
    properties: {
      exp: Math.floor(call.expiresAt / 1000),
      eject_at_room_exp: true,
      max_participants: 2,
      enable_knocking: false,
      enable_prejoin_ui: true,
      enable_chat: false,
      start_video_off: true,
      start_audio_off: true,
      enforce_unique_user_ids: true,
    },
  });
  const { error: insertError } = await ctx.client.from("messages").insert({
    message_id: id,
    conversation_id: conversationId,
    sender_id: ctx.user.id,
    message: signCall(call),
  });
  if (insertError) {
    await closeRoom(call);
    throw new CallError(
      "Unable to send the call invitation. Please try again.",
      503,
    );
  }
  return call;
}
export function nextCallState(
  call: VideoCall,
  actor: string,
  action: string,
): VideoCall {
  if (![call.callerId, call.recipientId].includes(actor))
    throw new CallError("You cannot access this call.", 403);
  const state = callState(call);
  if (!["ringing", "active"].includes(state))
    throw new CallError("This call has already finished.", 410);
  if (action === "accept" || action === "decline") {
    if (actor !== call.recipientId || state !== "ringing")
      throw new CallError("Only the recipient can answer a ringing call.", 403);
    return {
      ...call,
      state: action === "accept" ? "active" : "declined",
      ...(action === "accept"
        ? { answeredAt: Date.now() }
        : { endedAt: Date.now() }),
    };
  }
  if (action === "end")
    return {
      ...call,
      state:
        state === "ringing"
          ? actor === call.callerId
            ? "cancelled"
            : "declined"
          : "ended",
      endedAt: Date.now(),
    };
  throw new CallError("Unknown call action.");
}
export async function actOnCall(ctx: Context, id: string, action: string) {
  validCallId(id);
  const { data: row, error } = await ctx.db
    .from("messages")
    .select("message_id,conversation_id,sender_id,message")
    .eq("message_id", id)
    .maybeSingle();
  if (error) throw new CallError("Unable to load the call.", 503);
  const call = row && verifiedCall(row);
  if (!call || ![call.callerId, call.recipientId].includes(ctx.user.id))
    throw new CallError("Call not found.", 404);
  const ids = await members(ctx, call.conversationId);
  if (
    ![call.callerId, call.recipientId].every((userId) => ids.includes(userId))
  )
    throw new CallError("Call participants have changed.", 403);
  if (action !== "end" && action !== "decline") await checkBlocks(ctx, ids);
  if (action === "join") {
    if (callState(call) !== "active")
      throw new CallError("This call is not active.", 409);
    const room = await daily(`/rooms/${roomName(call)}`);
    const url = new URL(room.url);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".daily.co"))
      throw new CallError("Invalid video room.", 502);
    const result = await daily("/meeting-tokens", "POST", {
      properties: {
        room_name: roomName(call),
        user_id: ctx.user.id,
        user_name:
          ctx.user.id === call.callerId ? call.callerName : call.recipientName,
        is_owner: false,
        exp: Math.floor(call.expiresAt / 1000),
        eject_at_token_exp: true,
      },
    });
    if (typeof result.token !== "string" || !result.token)
      throw new CallError(
        "Unable to authorize this video call. Please try again.",
        502,
      );
    // Reject a token if an end/decline won the race while the provider was contacted.
    const { data: current, error: currentError } = await ctx.db
      .from("messages")
      .select("message")
      .eq("message_id", id)
      .single();
    if (currentError || current.message !== row.message)
      throw new CallError("The call changed. Please try again.", 409);
    return { call, roomUrl: url.toString(), token: result.token };
  }
  const next = nextCallState(call, ctx.user.id, action);
  const { data: updated, error: writeError } = await ctx.db
    .from("messages")
    .update({ message: signCall(next) })
    .eq("message_id", id)
    .eq("message", row.message)
    .select("message_id")
    .maybeSingle();
  if (writeError)
    throw new CallError("Unable to update the call. Please try again.", 503);
  if (!updated)
    throw new CallError(
      "The call was answered or ended elsewhere. Please try again.",
      409,
    );
  if (next.state !== "active") await closeRoom(next);
  return { call: next };
}
