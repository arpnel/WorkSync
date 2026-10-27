import { getWorkSyncUrl } from "@/lib/appUrl";

export function workSyncUrl(path: string, requestUrl?: string): string {
  return getWorkSyncUrl(path, requestUrl);
}
