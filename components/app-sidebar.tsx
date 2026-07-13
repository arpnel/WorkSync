"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
} from "@/components/ui/sidebar";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  Home,
  ShoppingCart,
  Briefcase,
  Users,
  MessageCircle,
  Clipboard,
  Settings,
  Calendar,
  AlertCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { LogoIcon } from "./logo";

import type { Profile } from "@/app/Home/Profile/types/profile";
import { getCurrentProfile } from "@/app/Home/Profile/Services/profileservice";

export function AppSidebar() {
  const pathname = usePathname();

  const [profile, setProfile] = useState<Profile | null>(null);

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

  const capitalizeWords = (text?: string) =>
    (text ?? "")
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

  const fullName = profile
    ? `${capitalizeWords(profile.last_name)}, ${capitalizeWords(
        profile.first_name,
      )}`
    : "Loading...";

  const avatar = profile?.avatar_url ?? undefined;

  const initials = profile
    ? `${profile.first_name} ${profile.last_name}`
        .split(" ")
        .filter(Boolean)
        .map((name) => name[0].toUpperCase())
        .join("")
        .slice(0, 2)
    : "";
  const navItems = [
    { label: "Dashboard", icon: Home, href: "/Home" },
    {
      label: "Marketplace",
      icon: ShoppingCart,
      href: "/Home/MarketPlace",
    },
    {
      label: "My Listings",
      icon: Clipboard,
      href: "/Home/MyListings",
    },
    {
      label: "Messages",
      icon: MessageCircle,
      href: "/Home/Messages",
    },
    {
      label: "Projects",
      icon: Briefcase,
      href: "/Home/Project",
    },
    {
      label: "Schedule",
      icon: Calendar,
      href: "/Home/Schedule",
    },
    {
      label: "Clients",
      icon: Users,
      href: "/Home/Client",
    },
    {
      label: "Reports",
      icon: AlertCircle,
      href: "/Home/Reports",
    },
    {
      label: "Settings",
      icon: Settings,
      href: "/Home/Settings",
    },
  ];

  return (
    <Sidebar>
      {/* Profile */}
      <SidebarHeader className="px-4 py-3">
        <Link
          href="/Home/Profile"
          className={cn(
            "flex items-center gap-3 rounded-md px-2 py-2 transition",
            "hover:bg-accent hover:text-accent-foreground",
            pathname === "/Home/Profile" && "bg-accent text-accent-foreground",
          )}
        >
          <Avatar className="h-12 w-12 border">
            <AvatarImage src={avatar} alt={fullName} />

            <AvatarFallback className="text-lg font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{fullName}</p>

            <p className="text-xs text-muted-foreground">View Profile</p>
          </div>
        </Link>
      </SidebarHeader>
      <div className="mx-4 border-b" />

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 transition",
                "hover:bg-accent hover:text-accent-foreground",
                pathname === item.href && "bg-accent text-accent-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          ))}
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t px-4 py-6">
        <div className="flex items-center justify-center gap-2">
          <LogoIcon className="h-7 w-auto" />
          <span className="text-lg font-bold tracking-tight">WorkSync</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
