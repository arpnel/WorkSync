export type GuestServiceIdentity = {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  headline: string | null;
};

type GuestServiceIdentitiesResponse = {
  identities?: Array<GuestServiceIdentity & { service_id: string }>;
};

export async function getGuestServiceIdentities(
  serviceIds: string[],
): Promise<Map<string, GuestServiceIdentity>> {
  const uniqueIds = [...new Set(serviceIds)].slice(0, 10);
  if (!uniqueIds.length) return new Map();

  const response = await fetch("/api/marketplace/public-service-identities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serviceIds: uniqueIds }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to load freelancer profiles.");

  const result = (await response.json()) as GuestServiceIdentitiesResponse;
  return new Map(
    (result.identities ?? []).map(({ service_id, ...identity }) => [
      service_id,
      identity,
    ]),
  );
}
