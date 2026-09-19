"use client";
import { useEffect, useState } from "react";
import { useSetupForm } from "./useSetupForm";
import {
  getJobCategories,
  getAllSkills,
  getSkillsByCategory,
  type Category,
  type Skill,
} from "../service/category.service";
export function useFreelancerSetup() {
  const form = useSetupForm("freelancer");
  const [categories, setCategories] = useState<Category[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [recommendedSkills, setRecommendedSkills] = useState<Skill[]>([]);
  const [isLoadingCategories, setLoading] = useState(true);
  const [categoryError, setCategoryError] = useState("");
  useEffect(() => {
    let alive = true;
    void Promise.all([getJobCategories(), getAllSkills()])
      .then(([categoryRows, skillRows]) => {
        if (alive) {
          setCategories(categoryRows);
          setAllSkills(skillRows);
        }
      })
      .catch(() => {
        if (alive)
          setCategoryError(
            "Industries and skills could not be loaded. Reload this page to retry.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    void Promise.all(form.values.industries.map(getSkillsByCategory))
      .then((groups) => {
        if (alive)
          setRecommendedSkills(
            [
              ...new Map(
                groups.flat().map((skill) => [skill.id, skill]),
              ).values(),
            ].sort((a, b) => a.name.localeCompare(b.name)),
          );
      })
      .catch(() => {
        if (alive) setRecommendedSkills([]);
      });
    return () => {
      alive = false;
    };
  }, [form.values.industries]);
  return {
    ...form,
    categories,
    allSkills,
    recommendedSkills,
    isLoadingCategories,
    isLoadingSkills: isLoadingCategories,
    categoryError,
  };
}
