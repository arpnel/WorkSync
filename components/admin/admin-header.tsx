"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun, Loader2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { LogoIcon } from "@/components/shared/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCurrentProfile } from "@/services/profile/profileservice";
import { logout } from "@/services/auth/signinService";
import type { Profile } from "@/types/profile/profile";
import { toast } from "sonner";

export default function AdminHeader() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setMounted(true);
    let active = true;
    void getCurrentProfile()
      .then((nextProfile) => {
        if (active) setProfile(nextProfile);
      })
      .catch(() => {
        if (active) setProfile(null);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/");
      router.refresh();
    } catch {
      toast.error("Unable to log out. Please try again.");
      setLoggingOut(false);
    }
  }

  const name =
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.email ||
    "Administrator";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-card px-3 sm:px-4 lg:px-6">
      {loggingOut && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/75 p-4" role="status" aria-live="assertive" aria-busy="true">
          <div className="flex min-w-48 flex-col items-center gap-3 rounded-2xl border bg-card px-8 py-7 shadow-xl">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold">Logging you out...</p>
          </div>
        </div>
      )}
      <SidebarTrigger className="md:hidden" aria-label="Open admin navigation" />
      <Link
        href="/admin"
        className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
        aria-label="WorkSync admin workspace"
      >
        <LogoIcon className="size-8 shrink-0" />
        <span className="text-base font-bold tracking-tight sm:text-xl">
          WorkSync
        </span>
      </Link>
      <Badge variant="secondary" className="ml-auto rounded-full px-3 py-1">
        Admin workspace
      </Badge>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1.5 rounded-md p-1.5 transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={`Open ${name} profile menu`}
          >
            <Avatar className="size-9 border">
              <AvatarImage src={profile?.avatar_url ?? undefined} alt={name} />
              <AvatarFallback className="font-semibold">{initials || "A"}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[100] w-56">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium">{name}</p>
            {profile?.email && <p className="truncate text-xs text-muted-foreground">{profile.email}</p>}
          </div>
          <DropdownMenuSeparator />
          <div className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
            <span className="flex items-center gap-2">
              {mounted && resolvedTheme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
              Dark mode
            </span>
            <Switch
              checked={mounted && resolvedTheme === "dark"}
              onCheckedChange={(enabled) => setTheme(enabled ? "dark" : "light")}
              aria-label="Dark mode"
            />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={loggingOut}
            className="text-destructive focus:text-destructive"
            onClick={() => void handleLogout()}
          >
            <LogOut className="mr-2 size-4" />
            {loggingOut ? "Logging out..." : "Logout"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
