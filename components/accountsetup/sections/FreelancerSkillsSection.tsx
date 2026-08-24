import { useMemo, useState } from "react";

import type { Skill } from "@/services/serviceP/categoryService";

import { Input } from "@/components/ui/input";

type Industry = {
  id: string;
  name: string;
};

type Props = {
  industryIds: string[];

  // Industries selected by the freelancer
  industries: Industry[];

  // Skills recommended from selected industries
  recommendedSkills: Skill[];

  // Every skill from database
  allSkills: Skill[];

  selectedSkillIds: string[];
  error?: string;

  onChange: (skillIds: string[]) => void;
};

export function FreelancerSkillsSection({
  industryIds,
  industries,
  recommendedSkills,
  allSkills,
  selectedSkillIds,
  error,
  onChange,
}: Props) {
  const [search, setSearch] = useState("");

  const maxSkills = industryIds.length * 5;

  const toggleSkill = (skillId: string) => {
    const exists = selectedSkillIds.includes(skillId);

    if (exists) {
      onChange(
        selectedSkillIds.filter((id) => id !== skillId)
      );
      return;
    }

    if (selectedSkillIds.length >= maxSkills) {
      return;
    }

    onChange([...selectedSkillIds, skillId]);
  };

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return [];

    return allSkills
      .filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) &&
          !selectedSkillIds.includes(skill.id)
      )
      .sort((a, b) => {
        const aStart = a.name.toLowerCase().startsWith(query);
        const bStart = b.name.toLowerCase().startsWith(query);

        if (aStart && !bStart) return -1;
        if (!aStart && bStart) return 1;

        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }, [search, allSkills, selectedSkillIds]);

  const selectedSkills = useMemo(() => {
    return allSkills.filter((skill) =>
      selectedSkillIds.includes(skill.id)
    );
  }, [allSkills, selectedSkillIds]);

  const availableRecommendedSkills = useMemo(() => {
    return recommendedSkills.filter(
      (skill) => !selectedSkillIds.includes(skill.id)
    );
  }, [recommendedSkills, selectedSkillIds]);

  return (
    <div className="space-y-6">
      {/* Search */}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Search skills
          </p>

          <p className="text-xs text-muted-foreground">
            {selectedSkillIds.length} / {maxSkills} selected
          </p>
        </div>

        <Input
          placeholder="Search existing skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={maxSkills === 0}
        />

        {/* Search Results */}

        {search.trim() && (
          <>
            {searchResults.length > 0 ? (
              <div className="overflow-hidden rounded-lg border bg-background">
                {searchResults.map((skill) => {
                  const limitReached =
                    selectedSkillIds.length >= maxSkills;

                  return (
                    <button
                      key={skill.id}
                      type="button"
                      disabled={limitReached}
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
                        disabled:cursor-not-allowed
                        disabled:opacity-50
                      "
                    >
                      {skill.name}
                    </button>
                  );
                })}
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
            <p className="text-xs text-muted-foreground">
              Selected skills
            </p>

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
                  <span className="text-xs">✕</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recommended */}

      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">
            Recommended skills
          </p>

          {industries.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Based on your selected industries
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {availableRecommendedSkills.length > 0 ? (
            availableRecommendedSkills.map((skill) => {
              const limitReached =
                selectedSkillIds.length >= maxSkills;

              return (
                <button
                  key={skill.id}
                  type="button"
                  disabled={limitReached}
                  onClick={() => toggleSkill(skill.id)}
                  className="
                    rounded-md
                    border
                    px-3
                    py-2
                    text-sm
                    transition
                    hover:bg-muted
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                >
                  {skill.name}
                </button>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              No recommended skills loaded.
            </p>
          )}
        </div>
      </div>

      {/* No Industry Selected */}

      {industryIds.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Select at least one industry to choose skills.
        </p>
      )}

      {/* Error */}

      {error && (
        <p className="text-xs text-destructive">
          {error}
        </p>
      )}

      {/* Skill Limit */}

      {maxSkills > 0 && (
        <p className="text-xs text-muted-foreground">
          You can select up to {maxSkills} skills based on{" "}
          {industryIds.length} selected{" "}
          {industryIds.length === 1 ? "industry" : "industries"}.
        </p>
      )}
    </div>
  );
}
