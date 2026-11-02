type SubscriptionLimitListener = (message: string) => void;
const listeners = new Set<SubscriptionLimitListener>();
let pendingMessage: string | null = null;

function messageFrom(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

export function getSubscriptionLimitMessage(error: unknown): string | null {
  const message = messageFrom(error).replace(/^.*?failed \(P0001\):\s*/i, "").trim();
  if (!/free plan.*(?:allows|includes|only|limit|quota)|free (?:ai )?.*limit reached|(?:premium|subscription|plan).*(?:required|limit reached|quota reached)|upgrade to premium/i.test(message))
    return null;
  return message;
}

export function openSubscriptionLimitDialog(error: unknown): boolean {
  const message = getSubscriptionLimitMessage(error);
  if (!message) return false;
  if (listeners.size) listeners.forEach((listener) => listener(message));
  else pendingMessage = message;
  return true;
}

export function subscribeToSubscriptionLimitDialog(listener: SubscriptionLimitListener) {
  listeners.add(listener);
  if (pendingMessage) {
    listener(pendingMessage);
    pendingMessage = null;
  }
  return () => {
    listeners.delete(listener);
  };
}
