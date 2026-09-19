import { supabase } from "@/lib/supabaseClient";
import type { VideoCall } from "@/lib/calls/callMessage";
export interface CallResponse {
  call: VideoCall;
  roomUrl?: string;
  token?: string;
}
export async function callRequest<T>(body?: {
  action: string;
  callId: string;
  conversationId?: string;
}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
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
      signal: AbortSignal.timeout(45000),
    });
  let response = await send(session.access_token);
  if (response.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
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
  const data = await response
    .json()
    .catch(() => ({
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
        }),
    );
    throw new Error(data.error || "Unable to connect the call.");
  }
  return data as T;
}
