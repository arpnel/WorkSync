const productionOrigin = "https://worksync.website";
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function getWorkSyncOrigin(requestUrl?: string): string {
  // The production deployment can have an old APP_URL/Vercel hostname during
  // a domain migration. Pin production returns to the canonical domain.
  if (process.env.VERCEL_ENV === "production") return productionOrigin;

  const configured = process.env.APP_URL?.trim();
  if (configured) return new URL(configured).origin;

  if (requestUrl) {
    const request = new URL(requestUrl);
    if (localHosts.has(request.hostname)) return request.origin;
  }

  return productionOrigin;
}

export function getWorkSyncUrl(path: string, requestUrl?: string): string {
  return new URL(path, getWorkSyncOrigin(requestUrl)).toString();
}
