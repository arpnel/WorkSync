import { useMemo, useState } from "react";

import type { Category } from "@/services/serviceP/categoryService";

import { Input } from "@/components/ui/input";

type Props = {
  selectedCategoryIds: string[];
  // Every category from database
  categories: Category[];
  error?: string;
  onChange: (categoryIds: string[]) => void;
};

export function FreelancerIndustrySection({
  selectedCategoryIds,
  categories,
  error,
  onChange,
}: Props) {
  const [search, setSearch] = useState("");

  const MAX_INDUSTRIES = 5;

  const toggleCategory = (categoryId: string) => {
    const exists = selectedCategoryIds.includes(categoryId);

    if (exists) {
      onChange(
        selectedCategoryIds.filter((id) => id !== categoryId),
      );
      return;
    }

    if (selectedCategoryIds.length >= MAX_INDUSTRIES) {
      return;
    }

    onChange([...selectedCategoryIds, categoryId]);
  };

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return [];

    return categories
      .filter(
        (category) =>
          category.name.toLowerCase().includes(query) &&
          !selectedCategoryIds.includes(category.id),
      )
      .sort((a, b) => {
        const aStart = a.name.toLowerCase().startsWith(query);
        const bStart = b.name.toLowerCase().startsWith(query);

        if (aStart && !bStart) return -1;
        if (!aStart && bStart) return 1;

        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }, [search, categories, selectedCategoryIds]);

  const selectedCategories = useMemo(() => {
    return categories.filter((category) =>
      selectedCategoryIds.includes(category.id),
    );
  }, [categories, selectedCategoryIds]);

  return (
    <div className="space-y-6">
      {/* Search */}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Search industries
          </p>

          <p className="text-xs text-muted-foreground">
            {selectedCategoryIds.length} / {MAX_INDUSTRIES} selected
          </p>
        </div>

        <Input
          placeholder="Search existing industries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Search Results */}

        {search.trim() && (
          <>
            {searchResults.length > 0 ? (
              <div className="overflow-hidden rounded-lg border bg-background">
                {searchResults.map((category) => {
                  const limitReached =
                    selectedCategoryIds.length >= MAX_INDUSTRIES;

                  return (
                    <button
                      key={category.id}
                      type="button"
                      disabled={limitReached}
                      onClick={() => {
                        toggleCategory(category.id);
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
                      {category.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No existing industry found.
              </p>
            )}
          </>
        )}

        {/* Selected Industries */}

        {selectedCategories.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Selected industries
            </p>

            <div className="flex flex-wrap gap-2">
              {selectedCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => toggleCategory(category.id)}
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
                  {category.name}

                  <span className="text-xs">
                    ✕
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}

      {error && (
        <p className="text-xs text-destructive">
          {error}
        </p>
      )}

      {/* Industry Limit */}

      <p className="text-xs text-muted-foreground">
        You can select up to {MAX_INDUSTRIES} industries.
      </p>
    </div>
  );
}
