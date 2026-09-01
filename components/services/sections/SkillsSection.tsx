import { useMemo, useState } from "react";

import type { ServiceFormValues } from "../types/service-form.types";
import type { Skill } from "@/services/serviceP/categoryService";

import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

type Props = {
  values: ServiceFormValues;

  // Skills based on selected category
  skills: Skill[];

  // Every skill from database
  allSkills: Skill[];

  errors: Partial<Record<keyof ServiceFormValues, string>>;

  onChange: (patch: Partial<ServiceFormValues>) => void;
};

export function ServiceSkillsSection({
  values,
  skills,
  allSkills,
  errors,
  onChange,
}: Props) {
  const [search, setSearch] = useState("");

  const toggleSkill = (skillId: string) => {
    const exists = values.skillIds.includes(skillId);

    if (exists) {
      onChange({
        skillIds: values.skillIds.filter((id) => id !== skillId),
      });
      return;
    }

    onChange({
      skillIds: [...values.skillIds, skillId],
    });
  };

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return [];

    return allSkills
      .filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) &&
          !values.skillIds.includes(skill.id),
      )
      .sort((a, b) => {
        const aStart = a.name.toLowerCase().startsWith(query);
        const bStart = b.name.toLowerCase().startsWith(query);

        if (aStart && !bStart) return -1;
        if (!aStart && bStart) return 1;

        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }, [search, allSkills, values.skillIds]);

  const selectedSkills = useMemo(() => {
    return allSkills.filter((skill) => values.skillIds.includes(skill.id));
  }, [allSkills, values.skillIds]);

  return (
    <div className="space-y-6">
      {/* Search */}

      <div className="space-y-3">
        <Input
          placeholder="Search existing skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Search Results */}

        {search.trim() && (
          <>
            {searchResults.length > 0 ? (
              <div className="overflow-hidden rounded-lg border bg-background">
                {searchResults.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => {
                      toggleSkill(skill.id);
                      setSearch("");
                    }}
                    className="
                      flex
                      w-full
                      items-center
                      px-3
                      py-2
                      text-left
                      text-sm
                      transition
                      hover:bg-muted
                    "
                  >
                    {skill.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No existing skill found.
              </p>
            )}
          </>
        )}

        {/* Selected Skills */}

        {selectedSkills.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {selectedSkills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => toggleSkill(skill.id)}
                  className="
                    inline-flex
                    items-center
                    gap-2
                    rounded-full
                    bg-primary
                    px-3
                    py-1.5
                    text-sm
                    text-primary-foreground
                    transition
                    hover:opacity-90
                  "
                >
                  {skill.name}
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {values.categoryId && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Recommended skills</p>

          <div className="flex flex-wrap gap-2">
            {skills.length > 0
              ? skills
                  .filter((skill) => !values.skillIds.includes(skill.id))
                  .map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => toggleSkill(skill.id)}
                      className="
                    rounded-md
                    border
                    px-3
                    py-2
                    text-sm
                    transition
                    hover:bg-muted
                  "
                    >
                      {skill.name}
                    </button>
                  ))
              : null}
          </div>
        </div>
      )}

      {errors.skillIds && (
        <p className="text-xs text-destructive">{errors.skillIds}</p>
      )}
    </div>
  );
}
