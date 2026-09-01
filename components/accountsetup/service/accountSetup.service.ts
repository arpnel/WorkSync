import { supabase } from "@/lib/supabaseClient";

import type {
  ClientSetupValues,
  FreelancerSetupValues,
} from "@/types/account-setup.types";

/* ==========================================================
   TABLES
========================================================== */

const PROFILES_TABLE = "profiles";
const CLIENT_PROFILES_TABLE = "client_profiles";
const FREELANCER_PROFILES_TABLE = "freelancer_profiles";

/* ==========================================================
   STORAGE
========================================================== */

const AVATARS_BUCKET = "avatars";
const RESUMES_BUCKET = "resumes";
const VERIFICATION_BUCKET = "verification";

/* ==========================================================
   DEBUG LOGGER
========================================================== */

function logStep(step: string, data?: unknown) {
  console.log(
    `%c[ACCOUNT SETUP] ${step}`,
    "color: #22c55e; font-weight: bold;",
    data ?? "",
  );
}

function logError(step: string, error: unknown) {
  console.error(
    `%c[ACCOUNT SETUP ERROR] ${step}`,
    "color: #ef4444; font-weight: bold;",
    error,
  );
}

/* ==========================================================
   HELPERS
========================================================== */

async function getCurrentUserId(): Promise<string> {
  logStep("Getting current authenticated user...");

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    logError("Auth error", authError);
    throw authError;
  }

  if (!user) {
    const error = new Error("User not authenticated.");
    logError("No authenticated user", error);
    throw error;
  }

  logStep("Authenticated user found", {
    userId: user.id,
    email: user.email,
  });

  return user.id;
}

async function uploadFile(
  bucket: string,
  folder: string,
  file: File,
): Promise<string> {
  logStep("Uploading file", {
    bucket,
    folder,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  });

  const extension = file.name.split(".").pop();

  const filePath = `${folder}/${crypto.randomUUID()}.${extension}`;

  logStep("Generated storage path", {
    bucket,
    filePath,
  });

  const { error } = await supabase.storage.from(bucket).upload(filePath, file);

  if (error) {
    logError("File upload failed", {
      bucket,
      filePath,
      error,
    });

    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

  logStep("File uploaded successfully", {
    bucket,
    filePath,
    publicUrl: data.publicUrl,
  });

  return data.publicUrl;
}

async function uploadFiles(
  bucket: string,
  folder: string,
  files: File[],
): Promise<string[]> {
  logStep("Uploading multiple files", {
    bucket,
    folder,
    count: files.length,
  });

  const urls: string[] = [];

  for (const file of files) {
    urls.push(await uploadFile(bucket, folder, file));
  }

  logStep("Multiple files uploaded", {
    bucket,
    folder,
    count: urls.length,
  });

  return urls;
}

/* ==========================================================
   CLIENT SETUP
========================================================== */

export async function submitClientSetup(
  payload: ClientSetupValues,
): Promise<void> {
  try {
    logStep("Starting CLIENT account setup");

    console.log("Client payload:", payload);

    const userId = await getCurrentUserId();

    /* ---------------- Profile Photo ---------------- */

    const avatarUrl = payload.profilePhoto
      ? await uploadFile(AVATARS_BUCKET, userId, payload.profilePhoto)
      : null;

    /* ---------------- Profile ---------------- */

    const profilePayload = {
      user_id: userId,

      first_name: payload.firstName,
      last_name: payload.lastName,

      // Database column is displayName
      display_name: payload.display_name,

      province: payload.province,
      city: payload.city,
      english_proficiency: payload.englishProficiency,

      avatar_url: avatarUrl,
      bio: payload.shortBio,

      // Account setup completion
      account_setup_completed: true,
    };

    logStep("Inserting/upserting client profile", profilePayload);

    const { error: profileError } = await supabase
      .from(PROFILES_TABLE)
      .upsert(profilePayload);

    if (profileError) {
      logError("Client profile upsert failed", profileError);
      throw profileError;
    }

    logStep("Client profile saved successfully");

    /* ---------------- Client Profile ---------------- */

    const clientPayload = {
      client_id: crypto.randomUUID(),
      user_id: userId,
    };

    logStep("Inserting/upserting client profile record", clientPayload);

    const { data: existingClient, error: clientLookupError } = await supabase
      .from(CLIENT_PROFILES_TABLE)
      .select("client_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (clientLookupError) {
      logError("Client profile lookup failed", clientLookupError);
      throw clientLookupError;
    }

    const { error: clientError } = existingClient
      ? { error: null }
      : await supabase.from(CLIENT_PROFILES_TABLE).insert(clientPayload);

    if (clientError) {
      logError("Client profile record failed", {
        code: clientError.code,
        message: clientError.message,
        details: clientError.details,
        hint: clientError.hint,
      });

      throw clientError;
    }

    logStep("CLIENT account setup completed successfully");
  } catch (error) {
    logError("Failed to submit client setup", error);
    throw error;
  }
}

/* ==========================================================
   FREELANCER SETUP
========================================================== */

export async function submitFreelancerSetup(
  payload: FreelancerSetupValues,
): Promise<void> {
  try {
    logStep("========================================");
    logStep("Starting FREELANCER account setup");
    logStep("========================================");

    console.log("FULL FREELANCER PAYLOAD:", payload);

    /* ======================================================
       USER
    ====================================================== */

    const userId = await getCurrentUserId();

    logStep("User ID confirmed", userId);

    /* ======================================================
       PROFILE PHOTO
    ====================================================== */

    const avatarUrl = payload.profilePhoto
      ? await uploadFile(AVATARS_BUCKET, userId, payload.profilePhoto)
      : null;

    logStep("Avatar processing completed", {
      avatarUrl,
    });

    /* ======================================================
       RESUME
    ====================================================== */

    const resumeUrl = payload.resume
      ? await uploadFile(RESUMES_BUCKET, userId, payload.resume)
      : null;

    logStep("Resume processing completed", {
      resumeUrl,
    });

    /* ======================================================
       GOVERNMENT ID
    ====================================================== */

    const governmentIdUrl = payload.governmentId
      ? await uploadFile(VERIFICATION_BUCKET, userId, payload.governmentId)
      : null;

    logStep("Government ID processing completed", {
      governmentIdUrl,
    });

    /* ======================================================
       PORTFOLIO SAMPLES
    ====================================================== */

    const portfolioSampleUrls = await uploadFiles(
      VERIFICATION_BUCKET,
      `${userId}/portfolio`,
      payload.portfolioSamples,
    );

    logStep("Portfolio samples completed", {
      count: portfolioSampleUrls.length,
      urls: portfolioSampleUrls,
    });

    /* ======================================================
       CERTIFICATIONS
    ====================================================== */

    const certificationUrls = await uploadFiles(
      VERIFICATION_BUCKET,
      `${userId}/certifications`,
      payload.certifications,
    );

    logStep("Certifications completed", {
      count: certificationUrls.length,
      urls: certificationUrls,
    });

    /* ======================================================
       PROFILE
    ====================================================== */

    const profilePayload = {
      user_id: userId,

      first_name: payload.firstName,
      last_name: payload.lastName,

      // IMPORTANT:
      // Your database column is displayName
      display_name: payload.display_name,

      province: payload.province,
      city: payload.city,
      english_proficiency: payload.englishProficiency,

      avatar_url: avatarUrl,
      bio: payload.shortBio,

      // Automatically mark setup as complete
      account_setup_completed: true,
    };

    console.log("========================================");

    console.log("PROFILE PAYLOAD BEING SENT TO SUPABASE:");

    console.log(profilePayload);

    console.log("========================================");

    logStep("Saving profiles row...");

    const { data: profileData, error: profileError } = await supabase
      .from(PROFILES_TABLE)
      .upsert(profilePayload)
      .select()
      .single();

    if (profileError) {
      logError("PROFILES INSERT FAILED", profileError);

      console.error("Supabase profile error code:", profileError.code);

      console.error("Supabase profile error message:", profileError.message);

      console.error("Supabase profile error details:", profileError.details);

      console.error("Supabase profile error hint:", profileError.hint);

      throw profileError;
    }

    logStep("PROFILES saved successfully", profileData);

    /* ======================================================
       FREELANCER PROFILE
    ====================================================== */

    const freelancerPayload = {
      user_id: userId,

      years_of_experience: payload.yearsOfExperience,

      employment_preference: payload.employmentPreference,

      portfolio_website: payload.portfolioWebsite,

      linkedin_url: payload.linkedIn,

      github_url: payload.github,

      resume_url: resumeUrl,

      government_id_url: governmentIdUrl,

      portfolio_sample_urls: portfolioSampleUrls,

      certification_urls: certificationUrls,

      // created_at intentionally omitted
      // because the database handles it automatically
    };

    console.log("========================================");

    console.log("FREELANCER PROFILE PAYLOAD:");

    console.log(freelancerPayload);

    console.log("========================================");

    logStep("Saving freelancer_profiles row...");

    const { data: existingFreelancer, error: freelancerLookupError } =
      await supabase
        .from(FREELANCER_PROFILES_TABLE)
        .select("freelancer_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (freelancerLookupError) {
      logError("Freelancer profile lookup failed", freelancerLookupError);
      throw freelancerLookupError;
    }

    const freelancerQuery = existingFreelancer
      ? supabase
          .from(FREELANCER_PROFILES_TABLE)
          .update(freelancerPayload)
          .eq("freelancer_id", existingFreelancer.freelancer_id)
      : supabase.from(FREELANCER_PROFILES_TABLE).insert(freelancerPayload);

    const { data: freelancerData, error: freelancerError } =
      await freelancerQuery.select().single();

    if (freelancerError) {
      logError("FREELANCER_PROFILES INSERT FAILED", freelancerError);

      console.error("Supabase freelancer error code:", freelancerError.code);

      console.error(
        "Supabase freelancer error message:",
        freelancerError.message,
      );

      console.error(
        "Supabase freelancer error details:",
        freelancerError.details,
      );

      console.error("Supabase freelancer error hint:", freelancerError.hint);

      throw freelancerError;
    }

    logStep("FREELANCER_PROFILES saved successfully", freelancerData);

    /* ======================================================
       INDUSTRIES
    ====================================================== */

    if (payload.industries.length > 0) {
      const industryRows = payload.industries.map((categoryId) => ({
        freelancer_id: freelancerData.freelancer_id,
        category_id: categoryId,
      }));

      console.log("Industry rows:", industryRows);

      logStep("Saving freelancer industries...");

      const { error } = await supabase
        .from("freelancer_categories")
        .insert(industryRows);

      if (error) {
        logError("Freelancer industries insert failed", error);

        throw error;
      }

      logStep("Freelancer industries saved");
    }

    /* ======================================================
       SKILLS
    ====================================================== */

    if (payload.skills.length > 0) {
      const skillRows = payload.skills.map((skillId) => ({
        freelancer_id: freelancerData.freelancer_id,
        skill_id: skillId,
      }));

      console.log("Skill rows:", skillRows);

      logStep("Saving freelancer skills...");

      const { error } = await supabase
        .from("freelancer_skills")
        .insert(skillRows);

      if (error) {
        logError("Freelancer skills insert failed", error);

        throw error;
      }

      logStep("Freelancer skills saved");
    }

    /* ======================================================
       COMPLETE
    ====================================================== */

    logStep("========================================");
    logStep("FREELANCER ACCOUNT SETUP COMPLETED SUCCESSFULLY");
    logStep("========================================");
  } catch (error) {
    logError("Failed to submit freelancer setup", error);

    throw error;
  }
}
