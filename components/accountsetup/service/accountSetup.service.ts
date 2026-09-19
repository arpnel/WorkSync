import { supabase } from "@/lib/supabaseClient";
import {
  validateClientSetup,
  validateFreelancerSetup,
} from "@/lib/validation/account-setup.validation";
import type {
  ClientSetupValues,
  FreelancerSetupValues,
} from "@/types/account-setup.types";
function check(error: { message: string } | null, step: string) {
  if (error) throw new Error(`${step}: ${error.message}`);
}
async function currentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user)
    throw new Error("Sign in before setting up your account.");
  return user;
}
export async function loadAccountSetup(
  role: "client" | "freelancer",
): Promise<Partial<FreelancerSetupValues>> {
  const user = await currentUser();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "first_name,last_name,display_name,province,city,english_proficiency,avatar_url,bio",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  check(error, "Load your profile");
  const shared: Partial<FreelancerSetupValues> = {
    firstName: profile?.first_name ?? user.user_metadata.first_name ?? "",
    lastName: profile?.last_name ?? user.user_metadata.last_name ?? "",
    display_name: profile?.display_name ?? "",
    province: profile?.province ?? "",
    city: profile?.city ?? "",
    englishProficiency: profile?.english_proficiency ?? "",
    shortBio: profile?.bio ?? "",
    existingAvatarUrl: profile?.avatar_url ?? "",
  };
  if (role === "client") return shared;
  const { data: freelancer, error: roleError } = await supabase
    .from("freelancer_profiles")
    .select(
      "freelancer_id,headline,hourly_rate,years_of_experience,employment_preference,portfolio_website,linkedin_url,github_url,resume_url,portfolio_sample_urls,certification_urls",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  check(roleError, "Load your freelancer profile");
  if (!freelancer) return shared;
  const [categories, skills] = await Promise.all([
    supabase
      .from("freelancer_categories")
      .select("category_id")
      .eq("freelancer_id", freelancer.freelancer_id),
    supabase
      .from("freelancer_skills")
      .select("skill_id")
      .eq("freelancer_id", freelancer.freelancer_id),
  ]);
  check(categories.error, "Load industries");
  check(skills.error, "Load skills");
  return {
    ...shared,
    headline: freelancer.headline ?? "",
    hourlyRate:
      freelancer.hourly_rate == null ? "" : String(freelancer.hourly_rate),
    industries: categories.data?.map((row) => row.category_id) ?? [],
    skills: skills.data?.map((row) => row.skill_id) ?? [],
    yearsOfExperience: freelancer.years_of_experience ?? 0,
    employmentPreference: freelancer.employment_preference ?? "",
    portfolioWebsite: freelancer.portfolio_website ?? "",
    linkedIn: freelancer.linkedin_url ?? "",
    github: freelancer.github_url ?? "",
    existingResumeUrl: freelancer.resume_url ?? "",
    existingPortfolioSamples: freelancer.portfolio_sample_urls ?? [],
    existingCertifications: freelancer.certification_urls ?? [],
  };
}
// Retrying the same selected file does not create another upload. No ID images
// are sent here; Didit handles them. Supporting documents store paths, not public URLs.
const uploads = new WeakMap<File, Map<string, string>>();
async function upload(
  bucket: string,
  folder: string,
  file: File,
  publicFile = false,
) {
  const cacheKey = `${bucket}/${folder}`;
  const cached = uploads.get(file)?.get(cacheKey);
  if (cached) return cached;
  const extension = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[file.type];
  if (!extension) throw new Error("Unsupported upload type.");
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false, contentType: file.type });
  check(error, "Upload file");
  const value = publicFile
    ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
    : path;
  const values = uploads.get(file) ?? new Map<string, string>();
  values.set(cacheKey, value);
  uploads.set(file, values);
  return value;
}
async function saveProfile(userId: string, values: ClientSetupValues) {
  const avatar = values.profilePhoto
    ? await upload("avatars", userId, values.profilePhoto, true)
    : undefined;
  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: userId,
      first_name: values.firstName,
      last_name: values.lastName,
      display_name: values.display_name,
      province: values.province,
      city: values.city,
      location: [values.city, values.province].filter(Boolean).join(", "),
      english_proficiency: values.englishProficiency,
      bio: values.shortBio,
      ...(avatar ? { avatar_url: avatar } : {}),
    },
    { onConflict: "user_id" },
  );
  check(error, "Save basic profile");
}
async function finish(userId: string, role: "client" | "freelancer") {
  const roleResult = await supabase
    .from("Users")
    .update({ role })
    .eq("user_id", userId)
    .select("user_id")
    .single();
  check(roleResult.error, "Select account role");
  // Profile completion, not identity approval; this is deliberately the last write.
  const result = await supabase
    .from("profiles")
    .update({ account_setup_completed: true })
    .eq("user_id", userId)
    .select("user_id")
    .single();
  check(result.error, "Complete profile setup");
}
async function syncSelections(
  table: string,
  column: string,
  freelancerId: string,
  selected: string[],
) {
  const { data, error } = await supabase
    .from(table)
    .select(column)
    .eq("freelancer_id", freelancerId);
  check(error, `Load ${table}`);
  const previous = (data ?? []) as unknown as Record<string, string>[];
  const existing = new Set(previous.map((row) => row[column]));
  const desired = [...new Set(selected)];
  const additions = desired.filter((id) => !existing.has(id));
  if (additions.length) {
    const result = await supabase
      .from(table)
      .insert(
        additions.map((id) => ({ freelancer_id: freelancerId, [column]: id })),
      );
    check(result.error, `Save ${table}`);
  }
  const removed = [...existing].filter((id) => !desired.includes(id));
  if (removed.length) {
    const result = await supabase
      .from(table)
      .delete()
      .eq("freelancer_id", freelancerId)
      .in(column, removed);
    check(result.error, `Update ${table}`);
  }
}
export async function submitClientSetup(
  payload: ClientSetupValues,
): Promise<void> {
  const result = validateClientSetup(payload);
  if (!result.ok) throw new Error(Object.values(result.errors)[0]);
  const user = await currentUser();
  await saveProfile(user.id, result.data);
  const { data, error } = await supabase
    .from("client_profiles")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  check(error, "Find client profile");
  if (!data) {
    const inserted = await supabase
      .from("client_profiles")
      .insert({ client_id: crypto.randomUUID(), user_id: user.id });
    check(inserted.error, "Save client profile");
  }
  await finish(user.id, "client");
}
export async function submitFreelancerSetup(
  payload: FreelancerSetupValues,
): Promise<void> {
  const result = validateFreelancerSetup(payload);
  if (!result.ok) throw new Error(Object.values(result.errors)[0]);
  const values = result.data;
  const user = await currentUser();
  await saveProfile(user.id, values);
  const { data: existing, error } = await supabase
    .from("freelancer_profiles")
    .select("freelancer_id,portfolio_sample_urls,certification_urls")
    .eq("user_id", user.id)
    .maybeSingle();
  check(error, "Find freelancer profile");
  const resume = values.resume
    ? await upload("resumes", user.id, values.resume)
    : undefined;
  const samples = [];
  for (const file of values.portfolioSamples)
    samples.push(await upload("verification", `${user.id}/portfolio`, file));
  const certificates = [];
  for (const file of values.certifications)
    certificates.push(
      await upload("verification", `${user.id}/certifications`, file),
    );
  const data = {
    user_id: user.id,
    headline: values.headline || null,
    hourly_rate: values.hourlyRate ? Number(values.hourlyRate) : null,
    years_of_experience: values.yearsOfExperience,
    employment_preference: values.employmentPreference,
    portfolio_website: values.portfolioWebsite || null,
    linkedin_url: values.linkedIn || null,
    github_url: values.github || null,
    ...(resume ? { resume_url: resume } : {}),
    portfolio_sample_urls: [
      ...new Set([...(existing?.portfolio_sample_urls ?? []), ...samples]),
    ],
    certification_urls: [
      ...new Set([...(existing?.certification_urls ?? []), ...certificates]),
    ],
  };
  const query = existing
    ? supabase
        .from("freelancer_profiles")
        .update(data)
        .eq("freelancer_id", existing.freelancer_id)
    : supabase.from("freelancer_profiles").insert(data);
  const saved = await query.select("freelancer_id").single();
  check(saved.error, "Save freelancer profile");
  if (!saved.data)
    throw new Error("Freelancer profile could not be confirmed.");
  await syncSelections(
    "freelancer_categories",
    "category_id",
    saved.data.freelancer_id,
    values.industries,
  );
  await syncSelections(
    "freelancer_skills",
    "skill_id",
    saved.data.freelancer_id,
    values.skills,
  );
  await finish(user.id, "freelancer");
}
