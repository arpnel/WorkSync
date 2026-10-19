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
  totalSubcategories: number;
};
type CategoryRow = {
  id: string;
  name: string;
  listingCount: number | null;
  category_skills: Array<{
    skill_id: string;
    skills: { id: string; name: string } | null;
  }>;
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
  const categories: CategoryRow[] = (categoryRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    listingCount: null,
    category_skills: [] as CategoryRow["category_skills"],
  }));
  if (!categories.length) return [];

  const { data: categorySkills, error: categorySkillsError } =
    await supabase.from("category_skills").select("category_id,skill_id");
  if (categorySkillsError) {
    console.warn(
      "Unable to load category specialties:",
      categorySkillsError.message,
    );
  }
  const skillIds = [
    ...new Set((categorySkills ?? []).map((row) => row.skill_id)),
  ];
  const { data: skills, error: skillsError } = skillIds.length
    ? await supabase.from("skills").select("id,name").in("id", skillIds)
    : { data: [], error: null };
  if (skillsError) {
    console.warn("Unable to load specialty names:", skillsError.message);
  }
  const skillMap = new Map((skills ?? []).map((skill) => [skill.id, skill]));
  const skillsByCategory = new Map<string, CategoryRow["category_skills"]>();
  for (const row of categorySkills ?? []) {
    const skill = skillMap.get(row.skill_id);
    if (!skill) continue;
    const rows = skillsByCategory.get(row.category_id) ?? [];
    rows.push({ skill_id: row.skill_id, skills: skill });
    skillsByCategory.set(row.category_id, rows);
  }
  categories.forEach((category) => {
    category.category_skills = skillsByCategory.get(category.id) ?? [];
  });
  const tasks = categories.map((category) => {
    const skills = [
      ...new Map(
        category.category_skills
          .map((row) => row.skills)
          .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
          .map((skill) => [skill.id, skill]),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name));
    return {
      category,
      skills,
      subcategories: skills.slice(0, 5).map(
        (skill): ExplorerSubcategory => ({
          id: skill.id,
          name: skill.name,
          listingCount: null,
        }),
      ),
    };
  });
  const countTasks = tasks.flatMap(({ category, subcategories }) => [
    {
      categoryId: category.id,
      subcategory: null,
      setCategoryCount: (count: number | null) => {
        category.listingCount = count;
      },
    },
    ...subcategories.map((subcategory) => ({
      categoryId: category.id,
      subcategory,
      setCategoryCount: (count: number | null) => {
        subcategory.listingCount = count;
      },
    })),
  ]);
  for (let offset = 0; offset < countTasks.length; offset += 8) {
    await Promise.all(
      countTasks
        .slice(offset, offset + 8)
        .map(async ({ categoryId, subcategory, setCategoryCount }) => {
          const { count, error: countError } = subcategory
            ? await supabase
                .from("services")
                .select("service_id,service_skills!inner(skill_id)", {
                  count: "exact",
                  head: true,
                })
                .eq("category_id", categoryId)
                .eq("service_skills.skill_id", subcategory.id)
                .eq("status", "Active")
                .eq("is_archived", false)
            : await supabase
                .from("services")
                .select("service_id", { count: "exact", head: true })
                .eq("category_id", categoryId)
                .eq("status", "Active")
                .eq("is_archived", false);
          if (countError) {
            console.warn(
              "Unable to load category service count:",
              countError.message,
            );
            setCategoryCount(null);
            return;
          }
          if (subcategory) subcategory.listingCount = count ?? 0;
          else setCategoryCount(count ?? 0);
        }),
    );
  }
  return tasks.map(({ category, skills, subcategories }) => ({
    id: category.id,
    name: category.name,
    listingCount: category.listingCount,
    subcategories,
    totalSubcategories: skills.length,
  }));
}
