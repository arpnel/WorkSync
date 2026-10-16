import { supabase } from "@/lib/supabaseClient";

export type ExplorerSubcategory = {
  id: string;
  name: string;
  listingCount: number;
};
export type ExplorerCategory = {
  id: string;
  name: string;
  listingCount: number;
  subcategories: ExplorerSubcategory[];
  totalSubcategories: number;
};
type CategoryRow = {
  id: string;
  name: string;
  listingCount: number;
  category_skills: Array<{
    skill_id: string;
    skills: { id: string; name: string } | null;
  }>;
};

export async function getServiceCategoryExplorer(): Promise<
  ExplorerCategory[]
> {
  const { data, error } = await supabase
    .from("job_categories")
    .select("id,name,category_skills(skill_id,skills(id,name))")
    .order("name");
  if (error) throw error;
  const categories = (data ?? []) as unknown as CategoryRow[];
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
      subcategories: skills
        .slice(0, 5)
        .map((skill) => ({ id: skill.id, name: skill.name, listingCount: 0 })),
    };
  });
  const countTasks = tasks.flatMap(({ category, subcategories }) =>
    [
      {
        categoryId: category.id,
        subcategory: null,
        setCategoryCount: (count: number) => {
          category.listingCount = count;
        },
      },
      ...subcategories.map((subcategory) => ({
        categoryId: category.id,
        subcategory,
        setCategoryCount: () => undefined,
      })),
    ],
  );
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
          if (countError) throw countError;
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
