"use client";

import { useEffect, useMemo, useState } from "react";

import type { ServiceFormValues } from "./types/service-form.types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";

import { createService } from "@/services/serviceP/serviceService";
import type { CreateServicePayload } from "@/services/serviceP/service.types";
import { toast } from "sonner";
import {
  getSkillsByCategory,
  getAllSkills,
  type Skill,
} from "@/services/serviceP/categoryService";

import { useProfile } from "../../hooks/profile/useProfile";

import { ServicePricingSection } from "./sections/PricingSection";
import { ServiceDetailsSection } from "./sections/DetailsSection";
import { ServiceSkillsSection } from "./sections/SkillsSection";
import { ServiceDeliverySection } from "./sections/AvailabilitySection";
import { ServiceImageSection } from "./sections/ImageSection";

import { ServiceCreationFormFooter } from "./sections/ServiceFormFooter";

import { validateServiceCreationValues } from "@/lib/validation/service.creation.validation";

import { mapFormValuesToCreatePayload } from "./types/service.types";

import { useDuplicateSubmissionLock } from "./utils/duplicateSubmission";

import { useAuthUserId } from "@/hooks/auth/useAuthUserId";

import {
  getJobCategories,
  type Category,
} from "@/services/serviceP/categoryService";

const defaultValues: ServiceFormValues = {
  title: "",

  categoryId: "",

  categoryText: "",

  description: "",

  price: undefined,

  serviceType: "standard",

  deliveryTimeDays: 3,

  revisionCount: 3,

  skillIds: [],

  // Default empty milestones
  milestones: [],

  // Uploaded media
  mediaFiles: [],
  mediaUrls: [],
};

type ServiceDialogProps = {
  open: boolean;

  onOpenChange: (open: boolean) => void;
};

export function ServiceDialog({ open, onOpenChange }: ServiceDialogProps) {
  const [values, setValues] = useState<ServiceFormValues>(defaultValues);

  const [errors, setErrors] = useState<
    Partial<Record<keyof ServiceFormValues, string>>
  >({});

  const [categories, setCategories] = useState<Category[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [dirty, setDirty] = useState(false);

  const dupLock = useDuplicateSubmissionLock();

  const userId = useAuthUserId();

  const { profile } = useProfile();

  useEffect(() => {
    if (!open) return;

    setValues(defaultValues);

    setErrors({});

    setDirty(false);

    setIsSubmitting(false);
  }, [open]);

  /*
    Load categories
  */

  useEffect(() => {
    async function loadCategories() {
      try {
        const data = await getJobCategories();

        console.log("Loaded categories:", data);

        setCategories(data);
      } catch (error) {
        console.error("Failed loading categories", error);

        toast.error("Failed to load categories");
      }
    }

    if (open) {
      loadCategories();
    }
  }, [open]);

  /*
  Load ALL skills
*/
  useEffect(() => {
    if (!open) return;

    async function loadAllSkills() {
      try {
        const data = await getAllSkills();

        console.log("Loaded ALL skills:", data);

        setAllSkills(data);
      } catch (error) {
        console.error("Failed loading all skills:", error);

        toast.error("Failed to load all skills");

        setAllSkills([]);
      }
    }

    loadAllSkills();
  }, [open]);

  useEffect(() => {
    console.log("Category ID:", values.categoryId);
    console.log("Category Text:", values.categoryText);

    async function loadSkills() {
      if (!values.categoryId) {
        console.log("No category selected");

        setSkills([]);
        return;
      }

      try {
        const data = await getSkillsByCategory(values.categoryId);

        console.log("Loaded skills:", data);

        setSkills(data);
      } catch (error) {
        console.error("Failed loading skills:", error);

        toast.error("Failed to load skills");

        setSkills([]);
      }
    }

    loadSkills();
  }, [values.categoryId, values.categoryText]);
  const canSubmit = useMemo(() => {
    return Boolean(userId);
  }, [userId]);

  const handleClose = () => {
    if (dirty && !isSubmitting) {
      const ok = window.confirm("Discard changes?");

      if (!ok) return;
    }

    onOpenChange(false);
  };

  const handleSubmit = async () => {
    console.log("Create button clicked");
    console.log(values);
    if (!userId) {
      toast.error("You must be logged in to create a service.");

      return;
    }

    if (!dupLock.lock()) return;

    const res = validateServiceCreationValues(values);

console.log("Validation result:", res);

if (!res.ok) {
  console.log("Validation errors:", res.errors);

  toast.error("Validation failed");

  setErrors(res.errors as any);

  dupLock.unlock();

  return;
}

    setErrors({});

    setIsSubmitting(true);

    try {
      const payload: CreateServicePayload = {
        title: res.data.title,

        description: res.data.description,

        category_id: res.data.categoryId,

        price: res.data.price ?? 0,

        service_type: res.data.serviceType,

        delivery_time_days: res.data.deliveryTimeDays,

        revisions_count: res.data.revisionCount,

        skill_ids: res.data.skillIds,

        media_files: res.data.mediaFiles,

        milestone_templates:
          res.data.serviceType === "milestone"
            ? res.data.milestones.map((m, index) => ({
                title: m.title,
                description: m.description,
                amount: m.amount,
                display_order: index + 1,
              }))
            : undefined,
      };

      await createService(payload);

      toast.success("Service created successfully.");

      setDirty(false);

      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create service.");
    } finally {
      setIsSubmitting(false);

      dupLock.unlock();
    }
  };


  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : handleClose())}>
      <DialogContent className="!max-w-[1000px] !w-[98vw] h-[95vh] overflow-hidden p-0">
        <div className="flex h-16 items-center justify-between border-b px-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold">
              Create a Service
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex h-[calc(95vh-64px)] overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto p-8">
            <div className="space-y-6">
              {/* Basic Information */}
              <section className="rounded-2xl border bg-background p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <h3 className="text-sm font-semibold">Basic Information</h3>

                  <div className="h-px flex-1 bg-border" />
                </div>

                <ServiceDetailsSection
                  values={values}
                  errors={errors}
                  categories={categories}
                  onChange={(patch) => {
                    setValues((v) => ({
                      ...v,
                      ...patch,
                    }));

                    setDirty(true);
                  }}
                />
              </section>

              {/* Pricing */}
              <section className="rounded-2xl border bg-background p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <h3 className="text-sm font-semibold">Pricing</h3>

                  <div className="h-px flex-1 bg-border" />
                </div>

                <ServicePricingSection
                  values={values}
                  errors={errors}
                  onChange={(patch) => {
                    setValues((v) => ({
                      ...v,
                      ...patch,
                    }));

                    setDirty(true);
                  }}
                />
              </section>

              {/* Delivery */}
              <section className="rounded-2xl border bg-background p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <h3 className="text-sm font-semibold">
                    Delivery & Revisions
                  </h3>

                  <div className="h-px flex-1 bg-border" />
                </div>

                <ServiceDeliverySection
                  values={values}
                  errors={errors}
                  onChange={(patch) => {
                    setValues((v) => ({
                      ...v,
                      ...patch,
                    }));

                    setDirty(true);
                  }}
                />
              </section>

              {/* Skills */}
              <section className="rounded-2xl border bg-background p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <h3 className="text-sm font-semibold">Skills</h3>

                  <div className="h-px flex-1 bg-border" />
                </div>

                <ServiceSkillsSection
                  values={values}
                  skills={skills}
                  allSkills={allSkills}
                  errors={errors}
                  onChange={(patch) => {
                    setValues((v) => ({
                      ...v,
                      ...patch,
                    }));

                    setDirty(true);
                  }}
                />
              </section>

              {/* Media */}
              <section className="rounded-2xl border bg-background p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <h3 className="text-sm font-semibold">Service Gallery</h3>

                  <div className="h-px flex-1 bg-border" />
                </div>

                <ServiceImageSection
                  values={values}
                  errors={errors}
                  onChange={(patch) => {
                    setValues((v) => ({
                      ...v,
                      ...patch,
                    }));

                    setDirty(true);
                  }}
                />
              </section>
            </div>
          </div>

          <aside className="w-[380px] shrink-0 border-l bg-muted/20 p-6">
            <div>
              <h3 className="text-lg font-semibold">Marketplace Preview</h3>

              <p className="mt-1 text-xs text-muted-foreground">
                This is how your service will appear to clients.
              </p>
            </div>

            <div className="mx-auto mt-5 w-full max-w-[320px] overflow-hidden rounded-3xl border bg-background shadow-md">
              {/* Service Media Preview */}
              <div className="flex h-44 items-center justify-center overflow-hidden rounded-xl border bg-muted">
                {values.mediaUrls?.length > 0 ? (
                  values.mediaFiles?.[0]?.type.startsWith("video") ? (
                    <video
                      src={values.mediaUrls[0]}
                      className="max-h-full max-w-full object-contain"
                      controls
                      muted
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={values.mediaUrls[0]}
                      alt="Service preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  )
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Service Thumbnail
                  </span>
                )}
              </div>

              <div className="space-y-3 p-4">
                {/* Freelancer */}
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />

                    <AvatarFallback>
                      {(
                        profile?.display_name?.[0] ??
                        profile?.first_name?.[0] ??
                        "U"
                      ).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {profile?.display_name ??
                        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      ★ New Seller
                    </p>
                  </div>
                </div>

                {/* Service Title */}
                <h4 className="line-clamp-2 text-sm font-medium leading-5">
                  {values.title || "Your service title will appear here"}
                </h4>

                {/* Category + Service Type */}
                <div className="flex gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px]">
                    {values.categoryText || "Category"}
                  </span>

                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                    {values.serviceType === "milestone"
                      ? "Milestone"
                      : "Standard"}
                  </span>
                </div>

                {/* Skills */}
                <div className="flex flex-wrap gap-1.5">
                  {allSkills
                    .filter((skill) => values.skillIds.includes(skill.id))
                    .slice(0, 3)
                    .map((skill) => (
                      <span
                        key={skill.id}
                        className="rounded-md bg-muted px-2 py-1 text-[11px]"
                      >
                        {skill.name}
                      </span>
                    ))}

                  {values.skillIds.length > 3 && (
                    <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
                      +{values.skillIds.length - 3}
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t pt-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Starting From
                      </p>

                      <p className="text-xl font-bold text-primary">
                        ₱{values.price?.toLocaleString() ?? "—"}
                      </p>
                    </div>

                    <div className="text-right text-xs text-muted-foreground">
                      <p>{values.deliveryTimeDays} Days</p>

                      <p>
                        {values.revisionCount} Revision
                        {values.revisionCount !== 1 && "s"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
             
            </div>
             <Button
                type="button"
                disabled={isSubmitting || !canSubmit}
                onClick={handleSubmit}
              >
                {isSubmitting ? "Creating..." : "Create Service"}
              </Button>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
