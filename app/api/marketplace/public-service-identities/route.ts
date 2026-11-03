import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z
  .object({ serviceIds: z.array(z.string().uuid()).max(10) })
  .strict();
const noStore = { "Cache-Control": "no-store" };

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: noStore });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return json({ error: "Invalid service profile request." }, 400);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey)
    return json({ error: "Freelancer profiles are unavailable." }, 503);

  const serviceIds = [...new Set(parsed.data.serviceIds)];
  if (!serviceIds.length) return json({ identities: [] });

  try {
    // Validate every requested service through the same anonymous RLS path as
    // public marketplace browsing before using its owner for profile lookup.
    const publicDb = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data: services, error: servicesError } = await publicDb
      .from("services")
      .select("service_id,freelancer_id")
      .in("service_id", serviceIds)
      .eq("status", "Active")
      .eq("is_archived", false)
      .limit(10);
    if (servicesError)
      return json({ error: "Freelancer profiles are unavailable." }, 503);

    const ownerByService = new Map(
      (services ?? [])
        .filter((service) => service.freelancer_id)
        .map((service) => [service.service_id, service.freelancer_id]),
    );
    const freelancerIds = [...new Set(ownerByService.values())];
    if (!freelancerIds.length) return json({ identities: [] });

    const privateDb = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data: freelancers, error: freelancersError } = await privateDb
      .from("freelancer_profiles")
      .select("freelancer_id,user_id,headline")
      .in("freelancer_id", freelancerIds);
    if (freelancersError)
      return json({ error: "Freelancer profiles are unavailable." }, 503);

    const userIds = [
      ...new Set((freelancers ?? []).map((freelancer) => freelancer.user_id)),
    ];
    const { data: profiles, error: profilesError } = userIds.length
      ? await privateDb
          .from("profiles")
          .select("user_id,display_name,first_name,last_name,avatar_url")
          .in("user_id", userIds)
      : { data: [], error: null };
    if (profilesError)
      return json({ error: "Freelancer profiles are unavailable." }, 503);

    const freelancerById = new Map(
      (freelancers ?? []).map((freelancer) => [
        freelancer.freelancer_id,
        freelancer,
      ]),
    );
    const profileByUserId = new Map(
      (profiles ?? []).map((profile) => [profile.user_id, profile]),
    );
    const identities = [...ownerByService].flatMap(
      ([service_id, freelancer_id]) => {
        const freelancer = freelancerById.get(freelancer_id);
        if (!freelancer) return [];
        const profile = profileByUserId.get(freelancer.user_id);
        return [
          {
            service_id,
            display_name: profile?.display_name ?? null,
            first_name: profile?.first_name ?? null,
            last_name: profile?.last_name ?? null,
            avatar_url: profile?.avatar_url ?? null,
            headline: freelancer.headline ?? null,
          },
        ];
      },
    );

    return json({ identities });
  } catch {
    return json({ error: "Freelancer profiles are unavailable." }, 503);
  }
}
