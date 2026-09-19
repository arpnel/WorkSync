import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/types/profile/profile";

export async function getFreelancerDetails(
  freelancerId: string,
): Promise<Partial<Profile>> {
  const [
    professional,
    skills,
    industries,
    services,
    portfolio,
    reviews,
    projects,
  ] = await Promise.all([
    supabase
      .from("freelancer_profiles")
      .select(
        "years_of_experience,employment_preference,portfolio_website,linkedin_url,github_url",
      )
      .eq("freelancer_id", freelancerId)
      .maybeSingle(),
    supabase
      .from("freelancer_skills")
      .select("skills(id,name)")
      .eq("freelancer_id", freelancerId),
    supabase
      .from("freelancer_categories")
      .select("job_categories(id,name)")
      .eq("freelancer_id", freelancerId),
    supabase
      .from("services")
      .select("service_id", { count: "exact", head: true })
      .eq("freelancer_id", freelancerId),
    supabase
      .from("portfolio")
      .select("portfolio_id", { count: "exact", head: true })
      .eq("freelancer_id", freelancerId),
    supabase
      .from("reviews")
      .select("rating")
      .eq("freelancer_id", freelancerId)
      .eq("reviewer_role", "client"),
    supabase
      .from("projects")
      .select("project_id", { count: "exact", head: true })
      .eq("freelancer_id", freelancerId)
      .eq("status", "completed"),
  ]);
  const unavailable_details = Object.entries({
    "Professional details": professional,
    Skills: skills,
    Industries: industries,
    Services: services,
    Portfolio: portfolio,
    Reviews: reviews,
    Projects: projects,
  })
    .filter(([, result]) => result.error)
    .map(([label]) => label);
  const names = (values: unknown[]): { id: string; name: string }[] =>
    values.flatMap((value) => {
      const rows = Array.isArray(value) ? value : value ? [value] : [];
      return rows.filter(
        (row): row is { id: string; name: string } =>
          typeof row?.id === "string" && typeof row?.name === "string",
      );
    });
  const ratings = (reviews.data ?? []).map((row) => Number(row.rating));
  return {
    unavailable_details,
    ...professional.data,
    skills: names((skills.data ?? []).map((row) => row.skills)),
    industries: names((industries.data ?? []).map((row) => row.job_categories)),
    services_count: services.count ?? 0,
    portfolio_count: portfolio.count ?? 0,
    reviews_count: ratings.length,
    rating: ratings.length
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : null,
    projects_completed: projects.count ?? 0,
  };
}
