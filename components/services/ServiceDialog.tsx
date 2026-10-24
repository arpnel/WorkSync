"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { MarketplaceItem } from "@/services/marketplace/MarketplaceServices";
import { invalidatePageReads } from "@/lib/pageReadCache";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { ServiceFormValues } from "./types/service-form.types";
import type {
  CreateListingPayload,
  CreateListingResult,
  ListingRole,
} from "@/services/serviceP/service.types";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  getAllSkills,
  getJobCategories,
  getSkillsByCategory,
  type Category,
  type Skill,
} from "@/services/serviceP/categoryService";
import {
  createListing,
  queueListingForModeration,
  updateServiceMedia,
} from "@/services/serviceP/serviceService";
import { validateListingCreationValues } from "@/lib/validation/service.creation.validation";
import { useAuthUserId } from "@/hooks/auth/useAuthUserId";
import { useProfile } from "@/hooks/profile/useProfile";
import { useDuplicateSubmissionLock } from "./utils/duplicateSubmission";

import { ServiceDeliverySection } from "./sections/AvailabilitySection";
import { ServiceCategorySection } from "./sections/CategorySection";
import { ServiceDetailsSection } from "./sections/DetailsSection";
import { ServiceImageSection } from "./sections/ImageSection";
import { JobExpertiseSection } from "./sections/ExpertiseSection";
import { ServicePricingSection } from "./sections/PricingSection";
import { ServiceSkillsSection } from "./sections/SkillsSection";

const defaultValues: ServiceFormValues = {
  title: "",
  categoryId: "",
  categoryText: "",
  description: "",
  price: undefined,
  serviceType: "standard",
  deliveryTimeDays: 3,
  revisionCount: 3,
  budgetMin: undefined,
  budgetMax: undefined,
  pricingType: "fixed",
  deadline: "",
  experienceLevel: "intermediate",
  skillIds: [],
  milestones: [],
  mediaFiles: [],
  mediaUrls: [],
};

type ServiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (result: CreateListingResult) => void | Promise<void>;
  listing?: MarketplaceItem;
};

function listingSubmissionErrorMessage(error: unknown, noun: string) {
  const value =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown })
      : null;
  const code = typeof value?.code === "string" ? value.code : "";
  const message =
    error instanceof Error
      ? error.message
      : typeof value?.message === "string"
        ? value.message
        : "";

  if (
    code === "P0001" &&
    /monthly .*submission limit reached/i.test(message)
  ) {
    const plan = message
      .match(/for the ([\w ]+) plan\.?$/i)?.[1]
      ?.trim()
      .toLowerCase();
    const planName =
      plan === "free"
        ? "Free"
        : plan === "pro" || plan === "pro plus"
          ? "Premium"
          : null;
    const planLabel = planName ? `the ${planName} plan` : "your current plan";
    return `You've reached the monthly ${noun.toLowerCase()} posting limit for ${planLabel}. The listing wasn't created. Check Settings > Subscription to review monthly limits.`;
  }

  return message || `The ${noun.toLowerCase()} could not be posted. Please try again.`;
}

export function ServiceDialog({
  open,
  onOpenChange,
  onCreated,
  listing,
}: ServiceDialogProps) {
  const [values, setValues] = useState<ServiceFormValues>(defaultValues);
  const [errors, setErrors] = useState<
    Partial<Record<keyof ServiceFormValues, string>>
  >({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [originalMediaUrls, setOriginalMediaUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionFailure, setSubmissionFailure] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const duplicateLock = useDuplicateSubmissionLock();
  const userId = useAuthUserId();
  const { profile, loading: profileLoading } = useProfile();

  const listingRole: ListingRole | null =
    profile?.role === "client" || profile?.role === "freelancer"
      ? profile.role
      : null;
  const isJob = listing
    ? listing.listing_type === "job"
    : listingRole === "client";
  const noun = isJob ? "Job" : "Service";

  useEffect(() => {
    if (!open) return;

    const initialValues: ServiceFormValues = listing
      ? {
          ...defaultValues,
          title: listing.title,
          description: listing.description,
          categoryId: listing.category_id,
          categoryText: listing.category?.name ?? "",
          ...(listing.listing_type === "job"
            ? {
                budgetMin: listing.budget_min,
                budgetMax: listing.budget_max,
                deadline: listing.deadline?.slice(0, 10) ?? "",
                experienceLevel:
                  listing.experience_level === "beginner" ||
                  listing.experience_level === "expert"
                    ? listing.experience_level
                    : "intermediate",
              }
            : {
                price: listing.price,
                serviceType:
                  listing.service_type === "milestone"
                    ? "milestone"
                    : "standard",
                deliveryTimeDays: listing.delivery_time_days,
                revisionCount: listing.revisions_count,
                mediaUrls: listing.cover_image_url
                  ? [listing.cover_image_url]
                  : [],
              }),
        }
      : defaultValues;
    setValues(initialValues);
    setOriginalMediaUrls(initialValues.mediaUrls);
    setErrors({});
    setDirty(false);
    setIsSubmitting(false);
  }, [open, listing]);

  useEffect(() => {
    if (!open) return;

    void Promise.all([getJobCategories(), getAllSkills()])
      .then(([categoryData, skillData]) => {
        setCategories(categoryData);
        setAllSkills(skillData);
      })
      .catch((error) => {
        console.error("Failed to load listing options:", error);
        toast.error("Categories and skills could not be loaded.");
      });
  }, [open]);

  useEffect(() => {
    if (!open || !values.categoryId) {
      setSkills([]);
      return;
    }

    void getSkillsByCategory(values.categoryId)
      .then(setSkills)
      .catch((error) => {
        console.error("Failed to load category skills:", error);
        setSkills([]);
        toast.error("Recommended skills could not be loaded.");
      });
  }, [open, values.categoryId]);

  useEffect(() => {
    if (!open || !listing) return;
    const isJobListing = listing.listing_type === "job";
    const idColumn = isJobListing ? "job_id" : "service_id";
    const relation = isJobListing ? "job_skills" : "service_skills";
    const listingId = isJobListing ? listing.job_id : listing.service_id;
    void supabase
      .from(relation)
      .select("skill_id")
      .eq(idColumn, listingId)
      .then(({ data, error }) => {
        if (error) {
          toast.error("Listing skills could not be loaded.");
          return;
        }
        setValues((current) => ({
          ...current,
          skillIds: (data ?? []).map((row) => String(row.skill_id)),
        }));
      });
  }, [open, listing]);

  useEffect(() => {
    if (!open || listing?.listing_type !== "service") return;
    void supabase
      .from("service_media")
      .select("media_url")
      .eq("service_id", listing.service_id)
      .order("display_order", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Service images could not be loaded.");
          return;
        }
        const urls = (data ?? []).map((item) => item.media_url);
        const loadedUrls =
          urls.length > 0
            ? urls
            : listing.cover_image_url
              ? [listing.cover_image_url]
              : [];
        setOriginalMediaUrls(loadedUrls);
        setValues((current) => ({
          ...current,
          mediaUrls: loadedUrls,
        }));
      });
  }, [open, listing]);

  const canSubmit = Boolean(userId && listingRole && !profileLoading);

  const previewPrice = useMemo(() => {
    const amount = isJob ? values.budgetMax : values.price;

    if (!amount) {
      return "PHP 0";
    }

    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 2,
    }).format(amount);
  }, [isJob, values.budgetMax, values.price]);

  const updateValues = (patch: Partial<ServiceFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setDirty(true);

    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch) as Array<keyof ServiceFormValues>) {
        delete next[key];
      }
      return next;
    });
  };

  const closeDialog = () => {
    if (dirty && !isSubmitting) {
      setConfirmClose(true);
      return;
    }

    onOpenChange(false);
  };

  const resetForm = () => {
    setValues(defaultValues);
    setErrors({});
    setDirty(false);
  };

  const handleSubmit = async () => {
    if (!userId || !listingRole) {
      toast.error("Your account is not ready to create a listing.");
      return;
    }

    if (!duplicateLock.lock()) return;

    const validationValues =
      listing?.listing_type === "job"
        ? {
            ...values,
            deadline: new Date(Date.now() + 86400000)
              .toISOString()
              .slice(0, 10),
          }
        : values;
    const validation = validateListingCreationValues(
      validationValues,
      listingRole,
    );

    if (!validation.ok) {
      setErrors(validation.errors);
      toast.error("Review the highlighted fields.");
      duplicateLock.unlock();
      return;
    }

    const data = {
      ...validation.data,
      ...(listing?.listing_type === "job" ? { deadline: values.deadline } : {}),
    };
    const payload: CreateListingPayload = {
      title: data.title,
      description: data.description,
      category_id: data.categoryId,
      skill_ids: data.skillIds,
      pricing_type: "fixed",
      ...(isJob
        ? {
            budget_min: 0,
            budget_max: data.budgetMax,
            deadline: data.deadline,
            experience_level: data.experienceLevel,
          }
        : {
            price: data.price,
            service_type: data.serviceType,
            delivery_time_days: data.deliveryTimeDays,
            revisions_count: data.revisionCount,
            media_files: data.mediaFiles,
            milestone_templates:
              data.serviceType === "milestone"
                ? data.milestones.map((milestone, index) => ({
                    title: milestone.title.trim(),
                    description: milestone.description.trim() || undefined,
                    amount: milestone.amount,
                    display_order: index + 1,
                  }))
                : undefined,
          }),
    };

    setIsSubmitting(true);
    setSubmissionFailure(null);

    try {
      if (listing) {
        const isJobListing = listing.listing_type === "job";
        const idColumn = isJobListing ? "job_id" : "service_id";
        const table = isJobListing ? "jobs" : "services";
        const listingId = isJobListing ? listing.job_id : listing.service_id;
        const ownerColumn = isJobListing ? "client_id" : "freelancer_id";
        const ownerId = isJobListing
          ? listing.client_id
          : listing.freelancer_id;
        const { error: beginEditError } = await supabase.rpc(
          "worksync_begin_listing_edit",
          {
            p_kind: listing.listing_type,
            p_listing: listingId,
          },
        );
        if (beginEditError) throw new Error(beginEditError.message);
        const update = isJobListing
          ? {
              title: data.title,
              description: data.description,
              category_id: data.categoryId,
              budget_min: data.budgetMin ?? 0,
              budget_max: data.budgetMax,
              deadline: data.deadline || null,
              experience_level: data.experienceLevel,
            }
          : {
              title: data.title,
              description: data.description,
              category_id: data.categoryId,
              price: data.price,
              service_type: data.serviceType,
              delivery_time_days: data.deliveryTimeDays,
              revisions_count: data.revisionCount,
            };
        const { data: saved, error } = await supabase
          .from(table)
          .update(update)
          .eq(idColumn, listingId)
          .eq(ownerColumn, ownerId)
          .select(idColumn)
          .maybeSingle();
        if (error) throw error;
        if (!saved) throw new Error("The listing could not be updated.");

        const skillTable = isJobListing ? "job_skills" : "service_skills";
        const { error: deleteSkillsError } = await supabase
          .from(skillTable)
          .delete()
          .eq(idColumn, listingId);
        if (deleteSkillsError) throw deleteSkillsError;
        if (data.skillIds.length) {
          const { error: addSkillsError } = await supabase
            .from(skillTable)
            .insert(
              data.skillIds.map((skillId) => ({
                [idColumn]: listingId,
                skill_id: skillId,
              })),
            );
          if (addSkillsError) throw addSkillsError;
        }
        const retainedMediaUrls = values.mediaUrls.filter(
          (url) => !url.startsWith("blob:"),
        );
        const mediaChanged =
          data.mediaFiles.length > 0 ||
          retainedMediaUrls.length !== originalMediaUrls.length ||
          retainedMediaUrls.some(
            (url, index) => url !== originalMediaUrls[index],
          );
        if (!isJobListing && mediaChanged) {
          await updateServiceMedia(
            listingId,
            data.mediaFiles,
            retainedMediaUrls,
          );
        }
        await queueListingForModeration(listing.listing_type, listingId);
        invalidatePageReads();
        setDirty(false);
        toast.success(
          `${noun} resubmitted for moderation. It will appear in the marketplace after approval.`,
        );
        await onCreated?.({ listingType: listing.listing_type, id: listingId });
      } else {
        const result = await createListing(payload);
        setDirty(false);
        toast.success(
          `${noun} submitted for moderation. It will appear in the marketplace after approval.`,
        );
        await onCreated?.(result);
      }
      onOpenChange(false);
    } catch (error) {
      console.error(
        listing ? "Failed to update listing:" : "Failed to create listing:",
        error,
      );
      setSubmissionFailure({
        title: listing ? "Listing could not be updated" : "Listing was not created",
        message: listing
          ? error instanceof Error
            ? error.message
            : `The ${noun.toLowerCase()} could not be updated. Please try again.`
          : listingSubmissionErrorMessage(error, noun),
      });
    } finally {
      setIsSubmitting(false);
      duplicateLock.unlock();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : closeDialog())}
    >
      <DialogContent className="h-[95vh] !w-[calc(100vw-1rem)] !max-w-[1000px] gap-0 overflow-hidden p-0">
        <div className="flex h-16 items-center border-b px-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold">
              {listing ? `Edit ${noun}` : `Post a ${noun}`}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {listing
                ? `Update the details for your ${noun.toLowerCase()}.`
                : `Enter the details for the ${noun.toLowerCase()} you want to post.`}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden lg:h-[calc(95vh-64px)] lg:flex-none lg:flex-row lg:overflow-hidden">
          <div className="min-w-0 flex-none p-4 sm:p-6 lg:flex-1 lg:overflow-y-auto lg:p-8">
            <div className="space-y-6">
              <section className="rounded-lg border bg-background p-5 sm:p-6">
                <div className="mb-5">
                  <h3 className="text-base font-semibold">Basic Information</h3>
                </div>
                <ServiceDetailsSection
                  values={values}
                  errors={errors}
                  listingRole={listingRole ?? "freelancer"}
                  onChange={updateValues}
                />
                <div
                  className={isJob ? "mt-6 grid gap-5 md:grid-cols-2" : "mt-6"}
                >
                  <ServicePricingSection
                    values={values}
                    errors={errors}
                    listingRole={listingRole ?? "freelancer"}
                    onChange={updateValues}
                  />
                  {isJob && (
                    <ServiceDeliverySection
                      values={values}
                      errors={errors}
                      listingRole="client"
                      onChange={updateValues}
                    />
                  )}
                  {isJob && (
                    <JobExpertiseSection
                      values={values}
                      errors={errors}
                      onChange={updateValues}
                    />
                  )}
                </div>
              </section>

              <section className="rounded-lg border bg-background p-5 sm:p-6">
                <div className="mb-5">
                  <h3 className="text-base font-semibold">Category & Skills</h3>
                </div>
                <ServiceCategorySection
                  values={values}
                  errors={errors}
                  categories={categories}
                  onChange={updateValues}
                />
                <h4 className="mb-3 mt-6 text-sm font-semibold">Skills</h4>
                <ServiceSkillsSection
                  values={values}
                  skills={skills}
                  allSkills={allSkills}
                  errors={errors}
                  onChange={updateValues}
                />
              </section>

              {!isJob && (
                <section className="rounded-lg border bg-background p-5 sm:p-6">
                  <div className="mb-5">
                    <h3 className="text-base font-semibold">
                      Delivery & Revisions
                    </h3>
                  </div>
                  <ServiceDeliverySection
                    values={values}
                    errors={errors}
                    listingRole="freelancer"
                    onChange={updateValues}
                  />
                </section>
              )}

              {!isJob && (
                <section className="rounded-lg border bg-background p-5 sm:p-6">
                  <div className="mb-5">
                    <h3 className="text-base font-semibold">Service Gallery</h3>
                  </div>
                  <ServiceImageSection
                    values={values}
                    errors={errors}
                    onChange={updateValues}
                  />
                </section>
              )}
            </div>
          </div>

          <aside className="w-full shrink-0 border-t bg-muted/20 p-4 sm:p-6 lg:w-[380px] lg:overflow-y-auto lg:border-l lg:border-t-0">
            <h3 className="text-lg font-semibold">Marketplace Preview</h3>

            <div className="mx-auto mt-5 w-full max-w-[320px] overflow-hidden rounded-xl border bg-background shadow-md">
              {!isJob && (
                <div className="flex h-44 items-center justify-center overflow-hidden bg-muted">
                  {values.mediaUrls[0] ? (
                    (values.mediaFiles[0]?.type.startsWith("video/") ??
                    /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(
                      values.mediaUrls[0],
                    )) ? (
                      <video
                        src={values.mediaUrls[0]}
                        className="h-full w-full object-contain"
                        controls
                        muted
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={values.mediaUrls[0]}
                        alt="Listing preview"
                        className="h-full w-full object-cover"
                      />
                    )
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Service Thumbnail
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-3 p-4">
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
                  <p className="truncate text-sm font-semibold">
                    {profile?.display_name ||
                      [profile?.first_name, profile?.last_name]
                        .filter(Boolean)
                        .join(" ") ||
                      "WorkSync user"}
                  </p>
                </div>

                <h4 className="line-clamp-2 text-sm font-medium">
                  {values.title || `Your ${noun.toLowerCase()} title`}
                </h4>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px]">
                    {values.categoryText || "Category"}
                  </span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                    {isJob
                      ? "Fixed Budget"
                      : values.serviceType === "milestone"
                        ? "Milestone"
                        : "Standard"}
                  </span>
                </div>

                <div className="border-t pt-3">
                  <p className="text-[10px] uppercase text-muted-foreground">
                    {isJob ? "Budget From" : "Starting From"}
                  </p>
                  <p className="text-xl font-bold text-primary">
                    {previewPrice}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <Button
                type="button"
                className="w-full"
                disabled={!canSubmit || isSubmitting}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {listing ? "Saving..." : "Posting..."}
                  </>
                ) : listing ? (
                  `Save ${noun}`
                ) : (
                  `Post ${noun}`
                )}
              </Button>
              {!listing && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={isSubmitting}
                  onClick={resetForm}
                >
                  Reset
                </Button>
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
      <ConfirmActionDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={`Discard ${noun.toLowerCase()} changes?`}
        description={`Your unsaved ${noun.toLowerCase()} details will be lost.`}
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          setDirty(false);
          setConfirmClose(false);
          onOpenChange(false);
        }}
      />
      <AlertDialog
        open={Boolean(submissionFailure)}
        onOpenChange={(open) => {
          if (!open) setSubmissionFailure(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {submissionFailure?.title ?? "Listing could not be saved"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {submissionFailure?.message ?? "Please try again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setSubmissionFailure(null)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
