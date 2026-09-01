import { useEffect, useMemo, useRef, useState } from "react";

import type { ServiceFormValues } from "../types/service-form.types";
import type { Category } from "@/services/serviceP/categoryService";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  values: ServiceFormValues;
  errors: Partial<Record<keyof ServiceFormValues, string>>;
  categories: Category[];
  onChange: (values: Partial<ServiceFormValues>) => void;
};

export function ServiceCategorySection({
  values,
  errors,
  categories,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const query = values.categoryText.trim().toLowerCase();
  const matches = useMemo(
    () =>
      query
        ? categories
            .filter((category) => category.name.toLowerCase().includes(query))
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, 20)
        : categories.slice(0, 20),
    [categories, query],
  );

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={containerRef} className="space-y-2">
      <Label htmlFor="category">Category</Label>
      <div className="relative">
        <Input
          id="category"
          value={values.categoryText}
          placeholder="Search for a category..."
          autoComplete="off"
          aria-invalid={Boolean(errors.categoryId)}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange({
              categoryText: event.target.value,
              categoryId: "",
              skillIds: [],
            });
            setOpen(true);
          }}
        />
        {open && !values.categoryId && (
          <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border bg-background shadow-lg">
            <div className="max-h-72 overflow-y-auto py-1">
              {matches.length ? (
                matches.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className="flex w-full px-4 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      onChange({
                        categoryId: category.id,
                        categoryText: category.name,
                        skillIds: [],
                      });
                      setOpen(false);
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
      {values.categoryId && (
        <p className="text-xs text-emerald-600">
          Selected: {values.categoryText}
        </p>
      )}
      {errors.categoryId && (
        <p className="text-xs text-destructive">{errors.categoryId}</p>
      )}
    </div>
  );
}
