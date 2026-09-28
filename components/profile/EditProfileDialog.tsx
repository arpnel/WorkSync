"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Upload } from "lucide-react";
import {
  getAllSkills,
  getJobCategories,
} from "@/services/serviceP/categoryService";
import {
  ENGLISH_PROFICIENCY,
  EMPLOYMENT_PREFERENCES,
} from "@/constants/account-setup.constants";
import Image from "next/image";
import ImageCropDialog from "./ImageCropDialog";
import { useImageCrop } from "@/hooks/profile/useImageCrop";
import type {
  Profile,
  UpdateProfilePayload,
} from "../../types/profile/profile";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  profile: Profile;

  onSave: (updates: UpdateProfilePayload) => Promise<boolean>;

  onAvatarUpdate?: (file: File) => Promise<boolean>;

  onBannerUpdate?: (file: File) => Promise<boolean>;
}

export default function EditProfileDialog(props: EditProfileDialogProps) {
  return props.open ? <EditProfileContent {...props} /> : null;
}

function EditProfileContent({
  open,
  onOpenChange,
  profile,
  onSave,
  onAvatarUpdate,
  onBannerUpdate,
}: EditProfileDialogProps) {
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState("");
  const [skills, setSkills] = useState<{ id: string; name: string }[]>([]);
  const [industries, setIndustries] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [industryIds, setIndustryIds] = useState(
    (profile.industries ?? []).map((row) => row.id),
  );
  const [skillIds, setSkillIds] = useState(
    (profile.skills ?? []).map((s) => s.id),
  );
  useEffect(() => {
    let alive = true;
    if (profile.role === "freelancer")
      void Promise.all([getAllSkills(), getJobCategories()])
        .then(([rows, categories]) => {
          if (alive) {
            setSkills(rows);
            setIndustries(categories);
          }
        })
        .catch(() => {
          if (alive)
            setError("Skills could not load. Reopen the editor to retry.");
        });
    return () => {
      alive = false;
    };
  }, [profile.role]);
  const [saving, setSaving] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [uploadingBanner, setUploadingBanner] = useState(false);

  const [form, setForm] = useState({
    first_name: profile.first_name,
    last_name: profile.last_name,
    province: profile.province ?? "",
    city: profile.city ?? "",
    english_proficiency: profile.english_proficiency ?? "",
    years_of_experience: String(profile.years_of_experience ?? 0),
    employment_preference: profile.employment_preference ?? "",
    portfolio_website: profile.portfolio_website ?? "",
    linkedin_url: profile.linkedin_url ?? "",
    github_url: profile.github_url ?? "",
    display_name: profile.display_name ?? "",
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    location: profile.location ?? "",
    hourly_rate: profile.hourly_rate?.toString() ?? "",
  });

  const [initialDraft] = useState(() =>
    JSON.stringify({
      form,
      skills: [...skillIds].sort(),
      industries: [...industryIds].sort(),
    }),
  );

  const {
    cropOpen,
    cropImage,
    cropType,

    avatarPreview,
    bannerPreview,

    pendingAvatar,
    pendingBanner,

    handleAvatarChange,
    handleBannerChange,

    handleCropComplete,
    closeCropper,

    resetImages,
  } = useImageCrop();

  const avatar = avatarPreview ?? profile.avatar_url ?? undefined;
  const initials = `${profile.first_name} ${profile.last_name}`
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const dirty =
    Boolean(pendingAvatar || pendingBanner) ||
    initialDraft !==
      JSON.stringify({
        form,
        skills: [...skillIds].sort(),
        industries: [...industryIds].sort(),
      });
  const requestClose = () => {
    if (saving || cropOpen) return;
    if (dirty) setConfirmClose(true);
    else onOpenChange(false);
  };
  const handleSave = async () => {
    if (saving) return;
    setError("");
    if (!form.first_name.trim() || !form.last_name.trim())
      return setError("First and last name are required.");
    if (
      form.hourly_rate &&
      (!Number.isFinite(Number(form.hourly_rate)) ||
        Number(form.hourly_rate) <= 0)
    )
      return setError("Enter an hourly rate greater than zero.");
    if (
      !Number.isInteger(Number(form.years_of_experience)) ||
      Number(form.years_of_experience) < 0 ||
      Number(form.years_of_experience) > 50
    )
      return setError("Experience must be a whole number from 0 to 50.");
    for (const url of [
      form.portfolio_website,
      form.linkedin_url,
      form.github_url,
    ]) {
      if (url.trim()) {
        try {
          if (!["http:", "https:"].includes(new URL(url).protocol))
            throw new Error();
        } catch {
          return setError("Use complete http or https website links.");
        }
      }
    }
    if (
      profile.role === "freelancer" &&
      skills.length &&
      (skillIds.length < 1 || skillIds.length > 25)
    )
      return setError("Select between 1 and 25 skills.");
    if (
      profile.role === "freelancer" &&
      industries.length &&
      (industryIds.length < 1 || industryIds.length > 10)
    )
      return setError("Select between 1 and 10 industries.");
    setSaving(true);
    try {
      if (pendingAvatar && onAvatarUpdate) {
        setUploadingAvatar(true);

        const ok = await onAvatarUpdate(pendingAvatar);

        setUploadingAvatar(false);

        if (!ok) {
          setError(
            "Unable to upload the image. Please retry; completed uploads are retained.",
          );
          return;
        }
      }

      if (pendingBanner && onBannerUpdate) {
        setUploadingBanner(true);

        const ok = await onBannerUpdate(pendingBanner);

        setUploadingBanner(false);

        if (!ok) {
          setError(
            "Unable to upload the image. Please retry; completed uploads are retained.",
          );
          return;
        }
      }

      const success = await onSave({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        province: form.province.trim() || null,
        city: form.city.trim() || null,
        location:
          [form.city.trim(), form.province.trim()].filter(Boolean).join(", ") ||
          form.location.trim() ||
          null,
        english_proficiency: form.english_proficiency || null,
        display_name: form.display_name.trim() || null,
        ...(profile.role === "freelancer"
          ? {
              years_of_experience: Number(form.years_of_experience),
              employment_preference: form.employment_preference || null,
              portfolio_website: form.portfolio_website.trim() || null,
              linkedin_url: form.linkedin_url.trim() || null,
              github_url: form.github_url.trim() || null,
              ...(skills.length &&
              !profile.unavailable_details?.includes("Skills")
                ? { skill_ids: skillIds }
                : {}),
              ...(industries.length &&
              !profile.unavailable_details?.includes("Industries")
                ? { category_ids: industryIds }
                : {}),
              headline: form.headline || null,
              hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
            }
          : {}),
        bio: form.bio || null,
      });

      setSaving(false);

      if (!success)
        setError(
          "Unable to save profile. Please retry; completed uploads are retained.",
        );
      if (success) {
        resetImages();

        onOpenChange(false);
      }
    } catch {
      setError(
        "Unable to save profile. Please retry; completed uploads are retained.",
      );
    } finally {
      setSaving(false);
      setUploadingAvatar(false);
      setUploadingBanner(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) requestClose();
      }}
    >
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(900px,92dvh)] sm:max-h-[92dvh] sm:max-w-6xl sm:rounded-2xl">
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-14 sm:px-8">
          <DialogTitle className="text-xl font-semibold">
            Edit profile
          </DialogTitle>

          <DialogDescription>
            Make your profile feel like you. Save your changes when you?re
            ready.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="personal" className="min-h-0 flex-1 gap-0">
          <div className="shrink-0 border-b bg-muted/20 px-5 py-3 sm:px-8">
            <TabsList
              className="h-auto w-full justify-start sm:w-auto"
              aria-label="Profile editor sections"
            >
              <TabsTrigger value="personal" className="px-4">
                Personal details
              </TabsTrigger>
              <TabsTrigger value="photos" className="px-4">
                Photos
              </TabsTrigger>
              {profile.role === "freelancer" && (
                <TabsTrigger value="work" className="px-4">
                  Work & skills
                </TabsTrigger>
              )}
              {profile.role === "freelancer" && (
                <TabsTrigger value="links" className="px-4">
                  Links
                </TabsTrigger>
              )}
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-8">
            <fieldset disabled={saving} className="mx-auto min-w-0 max-w-4xl">
              <TabsContent value="personal" className="space-y-7">
                <div>
                  <h2 className="text-lg font-semibold">Personal details</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your name, introduction, and where you?re based.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ["first_name", "First name"],
                      ["last_name", "Last name"],
                      ["province", "Province"],
                      ["city", "City"],
                    ] as const
                  ).map(([key, label]) => (
                    <div className="space-y-2" key={key}>
                      <Label htmlFor={key}>{label}</Label>
                      <Input
                        id={key}
                        value={form[key]}
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                      />
                    </div>
                  ))}
                  <div className="space-y-2">
                    <Label htmlFor="english">English proficiency</Label>
                    <select
                      id="english"
                      className="w-full rounded-md border bg-background p-2"
                      value={form.english_proficiency}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          english_proficiency: e.target.value,
                        })
                      }
                    >
                      <option value="">Select proficiency</option>
                      {ENGLISH_PROFICIENCY.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* display_name */}
                  <div className="space-y-2">
                    <Label htmlFor="display_name">Display Name</Label>

                    <Input
                      id="display_name"
                      placeholder="@johndoe"
                      value={form.display_name}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          display_name: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your public location uses your city and province.
                </p>
                {/* About */}
                <div className="space-y-2">
                  <Label htmlFor="bio">About Me</Label>

                  <Textarea
                    id="bio"
                    rows={8}
                    maxLength={500}
                    placeholder="Tell clients about yourself..."
                    value={form.bio}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        bio: e.target.value,
                      })
                    }
                  />
                </div>
              </TabsContent>
              <TabsContent value="photos" className="space-y-7">
                <div>
                  <h2 className="text-lg font-semibold">Profile photos</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add a recognizable photo and a cover that represents you.
                  </p>
                </div>
                {/* Banner */}
                <div className="space-y-3">
                  <Label>Banner</Label>

                  <div className="relative h-52 overflow-hidden rounded-xl border bg-muted">
                    {bannerPreview || profile.banner_url ? (
                      <Image
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 90vw, 800px"
                        src={bannerPreview ?? profile.banner_url!}
                        alt="Banner"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-600" />
                    )}

                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="absolute bottom-4 right-4"
                      disabled={saving || uploadingBanner}
                      onClick={() => bannerInputRef.current?.click()}
                    >
                      {uploadingBanner ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Change Banner
                        </>
                      )}
                    </Button>

                    <input
                      ref={bannerInputRef}
                      hidden
                      type="file"
                      accept="image/*"
                      onChange={handleBannerChange}
                    />
                  </div>
                </div>

                {/* Avatar */}
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <Avatar className="h-24 w-24 border">
                    <AvatarImage src={avatar} />

                    <AvatarFallback className="text-2xl font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="space-y-2">
                    <Label>Profile Picture</Label>

                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving || uploadingAvatar}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {uploadingAvatar ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Camera className="mr-2 h-4 w-4" />
                          Change Picture
                        </>
                      )}
                    </Button>

                    <input
                      ref={avatarInputRef}
                      hidden
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                    />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="work" className="space-y-7">
                <div>
                  <h2 className="text-lg font-semibold">Work & skills</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Help clients understand your experience and the work you do.
                  </p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  {/* Professional Title */}
                  <div className="space-y-2">
                    <Label htmlFor="headline">Professional Title</Label>

                    <Input
                      id="headline"
                      maxLength={120}
                      disabled={profile.role !== "freelancer"}
                      placeholder="Full Stack Developer"
                      value={form.headline}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          headline: e.target.value,
                        })
                      }
                    />
                  </div>
                  {/* Hourly Rate */}
                  <div className="space-y-2">
                    <Label htmlFor="hourly_rate">Hourly Rate (PHP)</Label>

                    <Input
                      id="hourly_rate"
                      disabled={profile.role !== "freelancer"}
                      min="0.01"
                      step="0.01"
                      type="number"
                      placeholder="25"
                      value={form.hourly_rate}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          hourly_rate: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="experience">Years of experience</Label>
                    <Input
                      id="experience"
                      type="number"
                      min={0}
                      max={50}
                      value={form.years_of_experience}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          years_of_experience: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employment">Employment preference</Label>
                    <select
                      id="employment"
                      className="w-full rounded-md border bg-background p-2"
                      value={form.employment_preference}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          employment_preference: e.target.value,
                        })
                      }
                    >
                      <option value="">Select preference</option>
                      {EMPLOYMENT_PREFERENCES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <fieldset className="sm:col-span-2">
                    <legend className="mb-2 text-sm font-medium">
                      Industries
                    </legend>
                    <div className="flex max-h-48 flex-wrap gap-2 overflow-auto">
                      {industries.map((industry) => (
                        <label
                          key={industry.id}
                          className="flex items-center gap-2 rounded-md border p-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={industryIds.includes(industry.id)}
                            onChange={(e) =>
                              setIndustryIds((ids) =>
                                e.target.checked
                                  ? [...ids, industry.id]
                                  : ids.filter((id) => id !== industry.id),
                              )
                            }
                          />
                          {industry.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="sm:col-span-2">
                    <legend className="mb-2 text-sm font-medium">Skills</legend>
                    <div className="flex max-h-48 flex-wrap gap-2 overflow-auto">
                      {skills.map((skill) => (
                        <label
                          key={skill.id}
                          className="flex items-center gap-2 rounded-md border p-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={skillIds.includes(skill.id)}
                            onChange={(e) =>
                              setSkillIds((ids) =>
                                e.target.checked
                                  ? [...ids, skill.id]
                                  : ids.filter((id) => id !== skill.id),
                              )
                            }
                          />
                          {skill.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </TabsContent>
              <TabsContent value="links" className="space-y-7">
                <div>
                  <h2 className="text-lg font-semibold">Around the web</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Let clients explore more of your work.
                  </p>
                </div>
                <div className="grid gap-5">
                  {" "}
                  {(
                    [
                      ["portfolio_website", "Portfolio website"],
                      ["linkedin_url", "LinkedIn"],
                      ["github_url", "GitHub"],
                    ] as const
                  ).map(([key, label]) => (
                    <div className="space-y-2" key={key}>
                      <Label htmlFor={key}>{label}</Label>
                      <Input
                        id={key}
                        type="url"
                        value={form[key]}
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
            </fieldset>
          </div>
        </Tabs>
        {error && (
          <p
            role="alert"
            className="shrink-0 border-t px-5 py-3 text-sm text-destructive sm:px-8"
          >
            {error}
          </p>
        )}
        <DialogFooter className="m-0 shrink-0 flex-col items-stretch justify-between sm:flex-row sm:items-center gap-3 rounded-none bg-background px-5 py-4 sm:justify-between sm:px-8">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {saving
              ? "Saving your profile..."
              : dirty
                ? "Unsaved changes"
                : "No changes yet"}
          </span>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" onClick={requestClose} disabled={saving}>
              Close
            </Button>

            <Button onClick={handleSave} disabled={saving || !dirty}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved profile changes. Save them before leaving, or
              discard them to quit editing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                setConfirmClose(false);
                void handleSave();
              }}
            >
              Save & close
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                resetImages();
                onOpenChange(false);
              }}
            >
              Discard & close
            </Button>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {cropImage && (
        <ImageCropDialog
          open={cropOpen}
          image={cropImage}
          aspect={cropType === "avatar" ? 1 : 16 / 5}
          title={cropType === "avatar" ? "Crop Profile Picture" : "Crop Banner"}
          onClose={closeCropper}
          onCropComplete={handleCropComplete}
        />
      )}
    </Dialog>
  );
}
