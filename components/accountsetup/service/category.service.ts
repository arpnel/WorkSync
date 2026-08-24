/* ==========================================================
   CATEGORY / SKILL LOOKUP
   Re-exports the canonical category & skill services from the
   shared `@/services/serviceP` module to avoid duplication.
========================================================== */

export {
  getJobCategories,
  getAllSkills,
  getSkillsByCategory,
  type Category,
  type Skill,
} from "@/services/serviceP/categoryService";
