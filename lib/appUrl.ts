const productionOrigin = "https://worksync.website";

export function getWorkSyncOrigin(): string {
  return productionOrigin;
}

export function getWorkSyncUrl(path: string, _requestUrl?: string): string {
  return new URL(path, productionOrigin).toString();
}
