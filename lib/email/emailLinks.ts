export function workSyncUrl(path: string, requestUrl?: string): string {
  const configured = process.env.APP_URL;
  const vercelHost = process.env.VERCEL_URL;
  const origin = configured
    ? new URL(configured).origin
    : vercelHost
      ? `https://${vercelHost}`
      : requestUrl && process.env.NODE_ENV === "development"
        ? new URL(requestUrl).origin
        : "http://localhost:3000";
  return new URL(path, origin).toString();
}
