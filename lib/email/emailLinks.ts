export function workSyncUrl(path: string, _requestUrl?: string): string {
  const configured = process.env.APP_URL;
  const origin = configured
    ? new URL(configured).origin
    : "https://work-sync-pi.vercel.app";
  return new URL(path, origin).toString();
}
