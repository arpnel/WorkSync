import { supabase } from "@/lib/supabaseClient";
import type { VideoCall } from "@/lib/calls/callMessage";
export interface CallResponse {
  call: VideoCall;
  roomUrl?: string;
  token?: string;
}
export interface CallListResponse {
  userId: string;
  calls: VideoCall[];
  conversationIds: string[];
}
export async function callRequest<T>(body?: {
  action: string;
  callId: string;
  conversationId?: string;
}, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  signal?.throwIfAborted();
  if (!session) throw new Error("Sign in to use video calling.");
  const started = Date.now();
  const send = (token: string) =>
    fetch("/api/calls", {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
        : AbortSignal.timeout(45000),
    });
  let response = await send(session.access_token);
  if (response.status === 401) {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.refreshSession();
    signal?.throwIfAborted();
    if (error || !data.session || data.session.user.id !== session.user.id) {
      console.error(
        "[WorkSync API] " +
          JSON.stringify({
            endpoint: "/api/calls",
            status: 401,
            code: "SESSION_REFRESH_FAILED",
          }),
      );
      throw new Error("Your session expired. Sign in again.");
    }
    response = await send(data.session.access_token);
  }
  signal?.throwIfAborted();
  const data = await response.json().catch(() => ({
    error: "The call server returned an unreadable response.",
    code: "NON_JSON_RESPONSE",
  }));
  if (!response.ok) {
    console.error(
      "[WorkSync API] " +
        JSON.stringify({
          endpoint: "/api/calls",
          method: body ? "POST" : "GET",
          status: response.status,
          code:
            typeof data?.code === "string" && /^[A-Z_]{1,80}$/.test(data.code)
              ? data.code
              : "UNCLASSIFIED_ERROR",
          elapsedMs: Date.now() - started,
          upstreamStatus:
            typeof data?.upstreamStatus === "number"
              ? data.upstreamStatus
              : null,
          databaseCode:
            typeof data?.databaseCode === "string" &&
            /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(data.databaseCode)
              ? data.databaseCode
              : null,
        }),
    );
    throw new Error(data.error || "Unable to connect the call.");
  }
  return data as T;
}
