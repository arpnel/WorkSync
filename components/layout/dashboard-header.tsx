"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  BriefcaseBusiness,
  ChevronDown,
  LogOut,
  MessageCircle,
  Settings,
  User,
  Users,
} from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

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

export function DashboardHeader() {
  const pathname = usePathname();
  const router = useRouter();

  /* ==========================================================
     STATE
  ========================================================== */

  const [profile, setProfile] = useState<Profile | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);

  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);

  const [roleLoading, setRoleLoading] = useState(true);

  const [switchingRole, setSwitchingRole] = useState(false);

  const [showClientDialog, setShowClientDialog] = useState(false);

  const [showFreelancerDialog, setShowFreelancerDialog] = useState(false);

  /* ==========================================================
     LOAD PROFILE
  ========================================================== */

  useEffect(() => {
    async function loadProfile() {
      try {
        const currentProfile = await getCurrentProfile();

        setProfile(currentProfile);
      } catch (error) {
        console.error("Failed to load profile:", error);
      }
    }

    loadProfile();
  }, []);

  /* ==========================================================
     LOAD ACCOUNT ROLE
  ========================================================== */

  useEffect(() => {
    async function loadAccountRole() {
      try {
        setRoleLoading(true);

        const status = await getAccountRoleStatus();

        setCurrentRole(status.currentRole);
      } catch (error) {
        console.error("Failed to load account role:", error);
      } finally {
        setRoleLoading(false);
      }
    }

    loadAccountRole();
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

  /* ==========================================================
     SEARCH ITEMS
  ========================================================== */

  const searchItems = [
    {
      label: "Dashboard",
      href: "/home/dashboard",
    },
    {
      label: "Marketplace",
      href: "/home/marketplace",
    },
    {
      label: "My Listings",
      href: "/home/my-listings",
    },
    {
      label: "Messages",
      href: "/home/messages",
    },
    {
      label: "Notifications",
      href: "/home/notifications",
    },
    {
      label: "Projects",
      href: "/home/projects",
    },
    {
      label: "Schedule",
      href: "/home/schedule",
    },
    {
      label: "Clients",
      href: "/home/Client",
    },
    {
      label: "Reports",
      href: "/home/reports",
    },
    {
      label: "Settings",
      href: "/home/settings",
    },
    {
      label: "Profile",
      href: "/home/profile",
    },
  ];

  /* ==========================================================
     PAGE TITLES
  ========================================================== */

  const pageTitles: Record<string, string> = {
    "/home/dashboard": "Dashboard",
    "/home/marketplace": "Marketplace",
    "/home/my-listings": "My Listings",
    "/home/messages": "Messages",
    "/home/projects": "Projects",
    "/home/schedule": "Schedule",
    "/home/Client": "Clients",
    "/home/reports": "Reports",
    "/home/settings": "Settings",
    "/home/profile": "Profile",
    "/home/notifications": "Notifications",
  };

  const currentPage =
    pageTitles[pathname] ??
    (pathname.startsWith("/home/marketplace/")
      ? "Marketplace"
      : pathname.startsWith("/home/projects/")
        ? "Projects"
        : pathname.startsWith("/home/messages/")
          ? "Messages"
          : "WorkSpace");

  /* ==========================================================
     SEARCH SELECT
  ========================================================== */

  const handleSearchSelect = (href: string) => {
    setSearchOpen(false);
    router.push(href);
  };

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

  return (
    <>
      <header className="relative z-50 flex h-14 min-w-0 items-center border-b px-3 sm:px-4 lg:px-6">
        {/* ===================================================
            LEFT SECTION
        =================================================== */}

        <div className="flex min-w-0 shrink-0 items-center">
          <SidebarTrigger className="shrink-0 cursor-pointer" />

          <div className="ml-3 hidden items-center sm:flex lg:ml-4">
            <div className="h-5 w-px bg-border" />

            <div className="ml-4 flex items-center">
              <span
                className="
                  relative max-w-[220px] truncate
                  text-xl font-bold tracking-tight
                  after:absolute
                  after:-bottom-1
                  after:left-0
                  after:h-0.5
                  after:w-1/2
                  after:rounded-full
                  after:bg-primary
                  sm:text-2xl
                  lg:text-3xl
                  xl:text-4xl
                "
              >
                {currentPage}
              </span>
            </div>
          </div>
        </div>

        {/* ===================================================
            SEARCH
        =================================================== */}

        <div className="relative ml-5 min-w-0 flex-1 sm:ml-7 lg:ml-10">
          <div className="relative w-full max-w-[560px]">
            <Command onFocus={() => setSearchOpen(true)}>
              <CommandInput placeholder="Search..." className="h-9 border-0" />
              {searchOpen && (
                <div
                  className="
            absolute left-0 right-0 top-full z-[100]
            mt-1 overflow-hidden
            rounded-md border
            bg-popover
            shadow-lg
          "
                >
                  <CommandList className="max-h-80">
                    <CommandEmpty>No results found.</CommandEmpty>

                    <CommandGroup heading="Navigation">
                      {searchItems.map((item) => (
                        <CommandItem
                          key={item.href}
                          value={item.label}
                          onSelect={() => handleSearchSelect(item.href)}
                        >
                          {item.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </div>
              )}
            </Command>
          </div>
        </div>
        {/* ===================================================
            RIGHT SECTION
        =================================================== */}

        <div className="ml-3 flex shrink-0 items-center gap-1 sm:ml-6 sm:gap-2">
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

                <ChevronDown className="h-4 w-4 shrink-0" />
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
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  // Add logout logic here
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
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
