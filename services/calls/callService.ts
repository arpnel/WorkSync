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
  const response = await fetch("/api/calls", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Unable to connect the call.");
  return data as T;
}
