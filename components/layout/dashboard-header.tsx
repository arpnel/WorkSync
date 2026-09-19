"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  BriefcaseBusiness,
  ChevronDown,
  LogOut,
  MessageCircle,
  Settings,
  User,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { LogoIcon } from "@/components/shared/logo";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  getAccountRoleStatus,
  switchUserRole,
  createClientProfile,
  type UserRole,
} from "@/services/marketplace/AccountServices";

import type { Profile } from "@/types/profile/profile";
import { getCurrentProfile } from "@/services/profile/profileservice";
import { NotificationOverview } from "@/components/notifications/NotificationOverview";
import { logout } from "@/services/auth/signinService";
import { toast } from "sonner";

const subscribeToClient = () => () => {};

export function DashboardHeader() {
  const isClient = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );
  const router = useRouter();

  /* ==========================================================
     STATE
  ========================================================== */

  const [profile, setProfile] = useState<Profile | null>(null);

  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);

  const [roleLoading, setRoleLoading] = useState(true);

  const [switchingRole, setSwitchingRole] = useState(false);

  const [loggingOut, setLoggingOut] = useState(false);

  const [showClientDialog, setShowClientDialog] = useState(false);

  const [showFreelancerDialog, setShowFreelancerDialog] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadHeaderData() {
      try {
        const [currentProfile, status] = await Promise.all([
          getCurrentProfile(),
          getAccountRoleStatus(),
        ]);

        if (active) {
          setProfile(currentProfile);
          setCurrentRole(status.currentRole);
        }
      } catch (error) {
        console.error("Failed to load dashboard header:", error);
      } finally {
        if (active) {
          setRoleLoading(false);
        }
      }
    }

    void loadHeaderData();

    return () => {
      active = false;
    };
  }, []);

  /* ==========================================================
     PROFILE DISPLAY
  ========================================================== */

  const fullName = profile ? `${profile.first_name} ${profile.last_name}` : "";

  const initials = profile
    ? `${profile.first_name} ${profile.last_name}`
        .split(" ")
        .filter(Boolean)
        .map((name) => name[0].toUpperCase())
        .join("")
        .slice(0, 2)
    : "";

  async function handleLogout() {
    if (loggingOut) return;

    try {
      setLoggingOut(true);
      await logout();
      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Failed to log out:", error);
      toast.error("Unable to log out. Please try again.");
      setLoggingOut(false);
    }
  }

  /* ==========================================================
     ROLE CHANGE EVENT
  ========================================================== */

  function notifyRoleChanged(role: UserRole) {
    window.dispatchEvent(
      new CustomEvent("account-role-changed", {
        detail: {
          role,
        },
      }),
    );
  }

  /* ==========================================================
     ROLE SWITCH
  ========================================================== */

  async function handleRoleSwitch(targetRole: UserRole) {
    if (roleLoading || switchingRole) {
      return;
    }

    if (currentRole === targetRole) {
      return;
    }

    try {
      setSwitchingRole(true);

      const status = await getAccountRoleStatus();

      /* ======================================================
         SWITCH TO CLIENT
      ====================================================== */

      if (targetRole === "client") {
        if (status.hasClientProfile) {
          await switchUserRole("client");

          setCurrentRole("client");

          notifyRoleChanged("client");

          return;
        }

        setShowClientDialog(true);

        return;
      }

      /* ======================================================
         SWITCH TO FREELANCER
      ====================================================== */

      if (targetRole === "freelancer") {
        if (status.hasFreelancerProfile) {
          await switchUserRole("freelancer");

          setCurrentRole("freelancer");

          notifyRoleChanged("freelancer");

          return;
        }

        setShowFreelancerDialog(true);

        return;
      }
    } catch (error) {
      console.error("Failed to switch account role:", error);
    } finally {
      setSwitchingRole(false);
    }
  }

  /* ==========================================================
     BECOME CLIENT
  ========================================================== */

  async function handleBecomeClient() {
    try {
      setSwitchingRole(true);

      await createClientProfile();

      setCurrentRole("client");

      notifyRoleChanged("client");

      setShowClientDialog(false);
    } catch (error) {
      console.error("Failed to become client:", error);
    } finally {
      setSwitchingRole(false);
    }
  }

  /* ==========================================================
     RETURN
  ========================================================== */

  if (!isClient) {
    return <header className="h-16 border-b bg-card" aria-hidden="true" />;
  }

  return (
    <>
      <header className="relative z-30 flex h-16 min-w-0 items-center border-b bg-card px-3 sm:px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-1 sm:gap-3">
          <Link
            href="/home/dashboard"
            className="flex shrink-0 items-center gap-2 rounded-lg"
            aria-label="WorkSync dashboard"
          >
            <LogoIcon className="h-8 w-8 shrink-0" />
            <span className="text-base font-bold tracking-tight sm:text-xl">
              WorkSync
            </span>
          </Link>
        </div>

        {/* ===================================================
            RIGHT SECTION
        =================================================== */}

        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2 sm:gap-2 sm:pl-6">
          {/* =================================================
              ROLE SWITCHER
          ================================================= */}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={roleLoading}
                className="
                  flex h-9 items-center gap-2
                  rounded-md
                  border border-primary/30
                  bg-primary/10
                  px-2.5
                  text-sm font-medium
                  text-primary
                  transition
                  hover:bg-primary/15
                  focus-visible:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-primary/40
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                  sm:px-3
                "
                aria-label="Switch role"
              >
                {currentRole === "freelancer" ? (
                  <BriefcaseBusiness className="h-4 w-4 shrink-0" />
                ) : (
                  <Users className="h-4 w-4 shrink-0" />
                )}

                <span className="hidden md:inline">
                  {roleLoading
                    ? "Loading..."
                    : currentRole === "freelancer"
                      ? "Freelancer"
                      : "Client"}
                </span>

                <ChevronDown className="hidden h-4 w-4 shrink-0 sm:block" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                disabled={switchingRole || currentRole === "freelancer"}
                onClick={() => handleRoleSwitch("freelancer")}
              >
                <BriefcaseBusiness className="mr-2 h-4 w-4" />
                Freelancer
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={switchingRole || currentRole === "client"}
                onClick={() => handleRoleSwitch("client")}
              >
                <Users className="mr-2 h-4 w-4" />
                Client
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* =================================================
              NOTIFICATIONS
          ================================================= */}

          <NotificationOverview />

          {/* =================================================
              MESSAGES
          ================================================= */}

          <Link
            href="/home/messages"
            className="
              flex h-9 w-9 shrink-0
              items-center justify-center
              rounded-md transition
              hover:bg-accent
              hover:text-accent-foreground
            "
            aria-label="Messages"
          >
            <MessageCircle className="h-5 w-5" />
          </Link>

          {/* =================================================
              PROFILE
          ================================================= */}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="
                  ml-1 flex shrink-0
                  items-center gap-1.5
                  rounded-md p-1.5
                  transition hover:bg-accent
                  sm:ml-2
                "
                aria-label="Open profile menu"
              >
                <Avatar className="h-9 w-9 border">
                  <AvatarImage
                    src={profile?.avatar_url ?? undefined}
                    alt={fullName}
                  />

                  <AvatarFallback className="font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="z-[100] w-48">
              <DropdownMenuItem asChild>
                <Link href="/home/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link href="/home/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                disabled={loggingOut}
                className="text-destructive focus:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {loggingOut ? "Logging out..." : "Logout"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* =====================================================
          CLIENT CONFIRMATION DIALOG
      ===================================================== */}

      {showClientDialog && (
        <div
          className="
            fixed inset-0 z-[200]
            flex items-center justify-center
            bg-black/50 p-4
          "
        >
          <div
            className="
              w-full max-w-md
              rounded-xl border
              bg-background
              p-6 shadow-xl
            "
          >
            <h2 className="text-lg font-semibold">Become a Client?</h2>

            <p className="mt-2 text-sm text-muted-foreground">
              You do not have a client profile yet. Would you like to become a
              client?
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={switchingRole}
                onClick={() => setShowClientDialog(false)}
                className="
                  rounded-md border
                  px-4 py-2
                  text-sm
                  transition
                  hover:bg-accent
                  disabled:opacity-50
                "
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={switchingRole}
                onClick={handleBecomeClient}
                className="
                  rounded-md
                  bg-primary
                  px-4 py-2
                  text-sm font-semibold
                  text-primary-foreground
                  transition
                  hover:opacity-90
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
              >
                {switchingRole ? "Creating..." : "Yes, become a client"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          FREELANCER SETUP DIALOG
      ===================================================== */}

      {showFreelancerDialog && (
        <div
          className="
            fixed inset-0 z-[200]
            flex items-center justify-center
            bg-black/50 p-4
          "
        >
          <div
            className="
              w-full max-w-md
              rounded-xl border
              bg-background
              p-6 shadow-xl
            "
          >
            <h2 className="text-lg font-semibold">Become a Freelancer?</h2>

            <p className="mt-2 text-sm text-muted-foreground">
              You do not have a freelancer profile yet. Complete freelancer
              setup to start offering services.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFreelancerDialog(false)}
                className="
                  rounded-md border
                  px-4 py-2
                  text-sm
                  transition
                  hover:bg-accent
                "
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowFreelancerDialog(false);
                  router.push("/account-setup/freelancer");
                }}
                className="
                  rounded-md
                  bg-primary
                  px-4 py-2
                  text-sm font-semibold
                  text-primary-foreground
                  transition
                  hover:opacity-90
                "
              >
                Continue Setup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
