import { supabase } from "@/lib/supabaseClient";

export type UserRole = "client" | "freelancer";

export interface AccountRoleStatus {
  userId: string;
  currentRole: UserRole;
  hasClientProfile: boolean;
  hasFreelancerProfile: boolean;
}

/* ==========================================================
   GET CURRENT USER ID
========================================================== */

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error("User not authenticated.");
  }

  return user.id;
}

/* ==========================================================
   GET CURRENT ACCOUNT ROLE STATUS
========================================================== */

export async function getAccountRoleStatus(): Promise<AccountRoleStatus> {
  const userId = await getCurrentUserId();

  /* ========================================================
     USERS
  ======================================================== */

  const {
    data: userData,
    error: userError,
  } = await supabase
    .from("Users")
    .select("user_id, role")
    .eq("user_id", userId)
    .single();

  if (userError) {
    throw userError;
  }

  if (
    userData.role !== "client" &&
    userData.role !== "freelancer"
  ) {
    throw new Error("Invalid user role.");
  }

  /* ========================================================
     CLIENT PROFILE
  ======================================================== */

  const {
    data: clientProfile,
    error: clientError,
  } = await supabase
    .from("client_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (clientError) {
    throw clientError;
  }

  /* ========================================================
     FREELANCER PROFILE
  ======================================================== */

  const {
    data: freelancerProfile,
    error: freelancerError,
  } = await supabase
    .from("freelancer_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (freelancerError) {
    throw freelancerError;
  }

  return {
    userId,
    currentRole: userData.role,
    hasClientProfile: !!clientProfile,
    hasFreelancerProfile: !!freelancerProfile,
  };
}

/* ==========================================================
   GET CURRENT USER ROLE
========================================================== */

export async function getCurrentUserRole(): Promise<UserRole> {
  const status = await getAccountRoleStatus();

  return status.currentRole;
}

/* ==========================================================
   SWITCH CURRENT USER ROLE
========================================================== */

export async function switchUserRole(
  role: UserRole,
): Promise<void> {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("Users")
    .update({
      role,
    })
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

/* ==========================================================
   CREATE CLIENT PROFILE
========================================================== */

export async function createClientProfile(): Promise<void> {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("client_profiles")
    .upsert(
      {
        user_id: userId,
      },
      {
        onConflict: "user_id",
      },
    );

  if (error) {
    throw error;
  }

  /* Activate client role */

  await switchUserRole("client");
}

/* ==========================================================
   ACTIVATE EXISTING CLIENT PROFILE
========================================================== */

export async function activateClientRole(): Promise<void> {
  const userId = await getCurrentUserId();

  const {
    data: clientProfile,
    error,
  } = await supabase
    .from("client_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!clientProfile) {
    throw new Error(
      "Client profile does not exist.",
    );
  }

  await switchUserRole("client");
}

/* ==========================================================
   ACTIVATE EXISTING FREELANCER PROFILE
========================================================== */

export async function activateFreelancerRole(): Promise<void> {
  const userId = await getCurrentUserId();

  const {
    data: freelancerProfile,
    error,
  } = await supabase
    .from("freelancer_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!freelancerProfile) {
    throw new Error(
      "Freelancer profile does not exist.",
    );
  }

  await switchUserRole("freelancer");
}