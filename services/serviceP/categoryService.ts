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

type CategorySkillRelation = {
  skill_id: string;
  skills: Skill | Skill[] | null;
};

export async function getJobCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from(JOB_CATEGORIES_TABLE)
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getSkillsByCategory(
  categoryId: string,
): Promise<Skill[]> {
  const { data, error } = await supabase
    .from(CATEGORY_SKILLS_TABLE)
    .select(
      `
      skill_id,
      skills (
        id,
        name
      )
    `,
    )
    .eq("category_id", categoryId);

  if (error) {
    throw error;
  }

  return ((data ?? []) as CategorySkillRelation[]).flatMap((item) => {
    if (!item.skills) return [];
    return Array.isArray(item.skills) ? item.skills : [item.skills];
  });
}

export async function getAllSkills(): Promise<Skill[]> {
  const { data, error } = await supabase
    .from(SKILLS_TABLE)
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}
