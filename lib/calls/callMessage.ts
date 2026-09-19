export const CALL_PREFIX = "[WorkSync video call] ";
export type CallState =
  | "ringing"
  | "active"
  | "declined"
  | "cancelled"
  | "ended";
export interface VideoCall {
  id: string;
  conversationId: string;
  callerId: string;
  recipientId: string;
  callerName: string;
  recipientName: string;
  state: CallState;
  createdAt: number;
  ringingUntil: number;
  expiresAt: number;
  answeredAt?: number;
  endedAt?: number;
}
export function callState(call: VideoCall, now = Date.now()) {
  if (call.state === "ringing" && now >= call.ringingUntil) return "missed";
  if (call.state === "active" && now >= call.expiresAt) return "ended";
  return call.state;
}
// Display parsing is deliberately separate from server-side signature verification.
export function parseCallMessage(
  message: string,
): { call: VideoCall; signature: string } | null {
  if (!message.startsWith(CALL_PREFIX) || message.length > 4000) return null;
  try {
    const value = JSON.parse(message.slice(CALL_PREFIX.length));
    const c = value.call;
    if (
      !c ||
      typeof value.signature !== "string" ||
      !["ringing", "active", "declined", "cancelled", "ended"].includes(c.state)
    )
      return null;
    if (
      ![
        c.id,
        c.conversationId,
        c.callerId,
        c.recipientId,
        c.callerName,
        c.recipientName,
      ].every((v) => typeof v === "string")
    )
      return null;
    if (
      ![c.createdAt, c.ringingUntil, c.expiresAt].every(
        (v) => typeof v === "number" && Number.isFinite(v),
      )
    )
      return null;
    return { call: c, signature: value.signature };
  } catch {
    return null;
  }
}
export function callPreview(message: string) {
  const parsed = parseCallMessage(message);
  if (!parsed) return message;
  const labels = {
    ringing: "Calling…",
    active: "In progress",
    declined: "Declined",
    cancelled: "Cancelled",
    ended: "Ended",
    missed: "Missed",
  };
  return `Video call · ${labels[callState(parsed.call)]}`;
}
