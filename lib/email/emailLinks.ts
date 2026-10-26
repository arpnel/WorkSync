export function workSyncUrl(path: string, _requestUrl?: string): string {
  void _requestUrl;
  const configured = process.env.APP_URL;
  const origin = configured
    ? new URL(configured).origin
    : "https://worksync.website";
  return new URL(path, origin).toString();
}
