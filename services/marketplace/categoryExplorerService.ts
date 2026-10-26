import { supabase } from "@/lib/supabaseClient";

export type ExplorerSubcategory = {
  id: string;
  name: string;
  listingCount: number | null;
};
export type ExplorerCategory = {
  id: string;
  name: string;
  listingCount: number | null;
  subcategories: ExplorerSubcategory[];
};

export async function getServiceCategoryExplorer(): Promise<
  ExplorerCategory[]
> {
  const { data: categoryRows, error: categoryError } = await supabase
    .from("job_categories")
    .select("id,name")
    .order("name");
  if (categoryError) {
    const status =
      "status" in categoryError && typeof categoryError.status === "number"
        ? categoryError.status
        : null;
    console.error("Unable to load public categories:", {
      status,
      code: categoryError.code,
      message: categoryError.message,
    });
    throw new Error(
      status === 401
        ? "Category access was rejected (401). Check your sign-in and category read access."
        : categoryError.message || "Unable to load categories.",
    );
  }
  const categories: {
    id: string;
    name: string;
    listingCount: number | null;
  }[] = (categoryRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    listingCount: null,
  }));
  if (!categories.length) return [];

  // Keep the exact count for category ranking, but avoid the old exact-count
  // query for every category/specialty pair. Those multiplied into dozens of
  // requests even though the UI only displays a handful of specialties.
  const countResults = await Promise.all(
    categories.map(async (category) => {
      const { count, error } = await supabase
        .from("services")
        .select("service_id", { count: "exact", head: true })
        .eq("category_id", category.id)
        .eq("status", "Active")
        .eq("is_archived", false);
      if (error) {
        console.warn("Unable to count category services:", error.message);
        return { category, count: null };
      }
      category.listingCount = count ?? 0;
      return { category, count: count ?? 0 };
    }),
  );

  const totalActiveListings = countResults.reduce(
    (total, result) => total + (result.count ?? 0),
    0,
  );
  const hasUnknownCounts = countResults.some((result) => result.count === null);
  const serviceSampleLimit = totalActiveListings > 100 || hasUnknownCounts ? 1 : 2;
  const availableCategories = countResults.filter(
    ({ count }) => count === null || count > 0,
  );
  const samples = await Promise.all(
    availableCategories.map(async ({ category }) => {
      const { data, error } = await supabase
        .from("services")
        .select("service_id,service_skills(skill_id)")
        .eq("category_id", category.id)
        .eq("status", "Active")
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .order("service_id")
        .limit(serviceSampleLimit);
      if (error) {
        console.warn("Unable to load category specialty samples:", error.message);
        return { category, rows: [] as { service_skills: { skill_id: string }[] }[] };
      }
      return {
        category,
        rows: (data ?? []) as { service_skills: { skill_id: string }[] }[],
      };
    }),
  );

  const skillIds = [
    ...new Set(
      samples.flatMap(({ rows }) =>
        rows.flatMap((row) => row.service_skills.map((skill) => skill.skill_id)),
      ),
    ),
  ];
  const { data: skills, error: skillsError } = skillIds.length
    ? await supabase.from("skills").select("id,name").in("id", skillIds)
    : { data: [], error: null };
  if (skillsError) {
    console.warn("Unable to load sampled specialty names:", skillsError.message);
  }
  const skillMap = new Map((skills ?? []).map((skill) => [skill.id, skill]));

  return samples
    .filter(({ rows }) => rows.length > 0)
    .map(({ category, rows }) => {
      const sampledSkillIds = [
        ...new Set(rows.flatMap((row) => row.service_skills.map((skill) => skill.skill_id))),
      ];
      const subcategories = sampledSkillIds
        .map((id) => skillMap.get(id))
        .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 5)
        .map(
          (skill): ExplorerSubcategory => ({
            id: skill.id,
            name: skill.name,
            listingCount: null,
          }),
        );
      return {
        id: category.id,
        name: category.name,
        listingCount: category.listingCount,
        subcategories,
      };
    });
}
