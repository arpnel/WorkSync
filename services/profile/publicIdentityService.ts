import { supabase } from "@/lib/supabaseClient";
export interface PublicIdentity {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  location: string | null;
  bio: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string;
}
export interface PublicIdentities {
  profiles: PublicIdentity[];
  clients: { client_id: string; user_id: string }[];
  freelancers: {
    freelancer_id: string;
    user_id: string;
    headline: string | null;
    hourly_rate: number | null;
    verification_status: string | null;
  }[];
}
export async function getPublicIdentities(input: {
  userIds?: string[];
  clientIds?: string[];
  freelancerIds?: string[];
}): Promise<PublicIdentities> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to view marketplace profiles.");
  const result: PublicIdentities = {
    profiles: [],
    clients: [],
    freelancers: [],
  };
  const length = Math.max(
    input.userIds?.length ?? 0,
    input.clientIds?.length ?? 0,
    input.freelancerIds?.length ?? 0,
  );
  for (let offset = 0; offset < length; offset += 40) {
    const response = await fetch("/api/profiles/identities", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userIds: input.userIds?.slice(offset, offset + 40) ?? [],
        clientIds: input.clientIds?.slice(offset, offset + 40) ?? [],
        freelancerIds: input.freelancerIds?.slice(offset, offset + 40) ?? [],
      }),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error || "Marketplace profiles could not be loaded.",
      );
    result.profiles.push(...data.profiles);
    result.clients.push(...data.clients);
    result.freelancers.push(...data.freelancers);
  }
  return result;
}
export function identityName(
  profile: PublicIdentity | undefined,
  fallback: string,
) {
  return (
    profile?.display_name?.trim() ||
    [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    fallback
  );
}
