import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  summarizePublicJobHiring,
  type PublicJobApplicationRow,
  type PublicJobContractRow,
} from "@/services/marketplace/jobPublicStats";

export const runtime = "nodejs";
const jobIdSchema = z.string().uuid();
const pageSize = 500;
const noStore = { "Cache-Control": "no-store" };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(request: Request) {
  const parsed = jobIdSchema.safeParse(
    new URL(request.url).searchParams.get("jobId"),
  );
  if (!parsed.success)
    return Response.json({ error: "Enter a valid job." }, { status: 400, headers: noStore });

  const db = serviceClient();
  if (!db)
    return Response.json(
      { error: "Job activity is unavailable." },
      { status: 503, headers: noStore },
    );

  const [job, submission] = await Promise.all([
    db
      .from("jobs")
      .select("job_id")
      .eq("job_id", parsed.data)
      .eq("status", "open")
      .eq("is_archived", false)
      .maybeSingle(),
    db
      .from("listing_submissions")
      .select("submission_id")
      .eq("listing_type", "job")
      .eq("listing_id", parsed.data)
      .eq("status", "approved")
      .is("archived_at", null)
      .is("owner_removed_at", null)
      .maybeSingle(),
  ]);
  if (job.error || submission.error)
    return Response.json(
      { error: "Job activity is unavailable." },
      { status: 503, headers: noStore },
    );
  if (!job.data || !submission.data)
    return Response.json({ error: "Job not found." }, { status: 404, headers: noStore });

  const applications: PublicJobApplicationRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await db
      .from("job_applications")
      .select("application_id,freelancer_id,status")
      .eq("job_id", parsed.data)
      .order("application_id")
      .range(offset, offset + pageSize - 1);
    if (page.error)
      return Response.json(
        { error: "Job activity is unavailable." },
        { status: 503, headers: noStore },
      );
    applications.push(...((page.data ?? []) as PublicJobApplicationRow[]));
    if ((page.data?.length ?? 0) < pageSize) break;
  }

  const applicationIds = applications.map((application) => application.application_id);
  const contracts: PublicJobContractRow[] = [];
  for (let offset = 0; offset < applicationIds.length; offset += 100) {
    const contractRows = await db
      .from("contracts")
      .select("application_id,status")
      .in("application_id", applicationIds.slice(offset, offset + 100))
      .in("status", ["active", "completed"]);
    if (contractRows.error)
      return Response.json(
        { error: "Job activity is unavailable." },
        { status: 503, headers: noStore },
      );
    contracts.push(...((contractRows.data ?? []) as PublicJobContractRow[]));
  }

  return Response.json(summarizePublicJobHiring(applications, contracts), {
    headers: noStore,
  });
}
