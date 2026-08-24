import { supabase } from "@/lib/supabaseClient";

const JOB_CATEGORIES_TABLE = "job_categories";
const CATEGORY_SKILLS_TABLE = "category_skills";
const SKILLS_TABLE = "skills";

export type Category = {
  id: string;
  name: string;
};

export type Skill = {
  id: string;
  name: string;
};

export async function getJobCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from(JOB_CATEGORIES_TABLE)
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("Category fetch error:", error);
    throw error;
  }

  return data ?? [];
}

export async function getSkillsByCategory(
  categoryId: string,
): Promise<Skill[]> {
  const { data, error } = await supabase
    .from(CATEGORY_SKILLS_TABLE)
    .select(`
      skill_id,
      skills (
        id,
        name
      )
    `)
    .eq("category_id", categoryId);

  if (error) {
    console.error("Category skills fetch error:", error);
    throw error;
  }

  return (
    data
      ?.flatMap((item: any) => item.skills ?? [])
      .filter(Boolean) as Skill[]
  ) ?? [];
}

export async function getAllSkills(): Promise<Skill[]> {
  console.log("===== getAllSkills called =====");
  const { data, error } = await supabase
    .from(SKILLS_TABLE)
    .select("id, name")
    .order("name", { ascending: true });

  console.log("getAllSkills:", data);
  console.log("getAllSkills error:", error);

  if (error) {
    console.error("Skills fetch error:", error);
    throw error;
  }

  return data ?? [];
}