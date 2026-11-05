const productionOrigin = "https://worksync.website";

export function getWorkSyncOrigin(requestUrl?: string): string {
  if (process.env.VERCEL_ENV === "production") return productionOrigin;

  const configured = process.env.APP_URL?.trim();
  if (configured) return new URL(configured).origin;

  if (requestUrl) {
    const request = new URL(requestUrl);
    if (["localhost", "127.0.0.1", "[::1]"].includes(request.hostname))
      return request.origin;
  }

  return productionOrigin;
}

export function getWorkSyncUrl(path: string, _requestUrl?: string): string {
  return new URL(path, productionOrigin).toString();
}
