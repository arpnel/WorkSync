import { useEffect, useMemo, useRef, useState } from "react";

import type { ServiceFormValues } from "../types/service-form.types";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Category = {
  id: string;
  name: string;
};

type ServiceDetailsSectionProps = {
  values: ServiceFormValues;
  errors: Partial<Record<keyof ServiceFormValues, string>>;
  categories: Category[];
  onChange: (values: Partial<ServiceFormValues>) => void;
};

export function ServiceDetailsSection({
  values,
  errors,
  categories,
  onChange,
}: ServiceDetailsSectionProps) {
  const [showCategories, setShowCategories] = useState(false);

  const categoryRef = useRef<HTMLDivElement>(null);

  const search = values.categoryText.trim();

  const normalize = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]/g, "");

  const filteredCategories = useMemo(() => {
    if (!search) return [];

    const query = normalize(search);

    const startsWith = categories
      .filter((category) => normalize(category.name).startsWith(query))
      .sort((a, b) => a.name.localeCompare(b.name));

    const contains = categories
      .filter(
        (category) =>
          normalize(category.name).includes(query) &&
          !normalize(category.name).startsWith(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    return [...startsWith, ...contains].slice(0, 20);
  }, [categories, search]);

  const isCategoryInvalid =
    values.categoryText.trim().length > 0 && !values.categoryId;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        categoryRef.current &&
        !categoryRef.current.contains(event.target as Node)
      ) {
        setShowCategories(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Service Title */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="title">Service Title</Label>

            <span className="text-xs text-muted-foreground">
              {values.title.length}/20
            </span>
          </div>

          <Input
            id="title"
            maxLength={20}
            value={values.title}
            placeholder="I will design a modern landing page"
            onChange={(e) =>
              onChange({
                title: e.target.value,
              })
            }
          />

          {errors.title && (
            <p className="text-xs text-destructive">{errors.title}</p>
          )}
        </div>

        {/* Category */}
        <div className="space-y-2" ref={categoryRef}>
          <Label htmlFor="category">Category</Label>

          <div className="relative">
            <Input
              id="category"
              value={values.categoryText}
              placeholder="Search for a category..."
              autoComplete="off"
              aria-invalid={isCategoryInvalid}
              className={
                isCategoryInvalid
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              onFocus={() => {
                if (!values.categoryId && search) {
                  setShowCategories(true);
                }
              }}
              onChange={(e) => {
                onChange({
                  categoryText: e.target.value,
                  categoryId: "",
                  skillIds: [],
                });

                setShowCategories(true);
              }}
            />

            {showCategories && !!search && !values.categoryId && (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border bg-background shadow-lg">
                <div className="max-h-72 overflow-y-auto py-1">
                  {filteredCategories.length > 0 ? (
                    filteredCategories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        className="flex w-full items-center px-4 py-2 text-left text-sm transition-colors hover:bg-muted"
                        onClick={() => {
                          onChange({
                            categoryId: category.id,
                            categoryText: category.name,
                            skillIds: [],
                          });

                          setShowCategories(false);
                        }}
                      >
                        {category.name}
                      </button>
                    ))
                  ) : (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      No categories found.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {isCategoryInvalid && (
            <p className="text-xs text-destructive">
              Please select a valid category from the list.
            </p>
          )}

          {values.categoryId && (
            <p className="text-xs text-emerald-600">
              ✓ Selected: {values.categoryText}
            </p>
          )}

          {errors.categoryId && (
            <p className="text-xs text-destructive">{errors.categoryId}</p>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="description">Service Description</Label>

          <span className="text-xs text-muted-foreground">
            {values.description.length}/1200
          </span>
        </div>

        <Textarea
          id="description"
          rows={7}
          maxLength={1200}
          value={values.description}
          placeholder="Describe exactly what you will deliver, your process, turnaround time, revisions, and what clients should expect."
          onChange={(e) =>
            onChange({
              description: e.target.value,
            })
          }
        />

        {errors.description ? (
          <p className="text-xs text-destructive">{errors.description}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            A detailed description helps clients understand your service and
            improves visibility.
          </p>
        )}
      </div>
    </div>
  );
}
