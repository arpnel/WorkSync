"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
} from "@/components/ui/sidebar";

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
  BellRing,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { LogoIcon } from "../shared/logo";

export function AppSidebar() {
  const pathname = usePathname();

  const navItems = [
    {
      label: "Dashboard",
      icon: Home,
      href: "/home/dashboard",
    },
    {
      label: "Marketplace",
      icon: ShoppingCart,
      href: "/home/marketplace",
    },
    {
      label: "Projects",
      icon: Briefcase,
      href: "/home/projects",
    },
    {
      label: "Messages",
      icon: MessageCircle,
      href: "/home/messages",
    },
    {
      label: "My Listings",
      icon: Clipboard,
      href: "/home/my-listings",
    },
    {
      label: "Schedule",
      icon: Calendar,
      href: "/home/schedule",
    },
    {
      label: "Notifications",
      icon: BellRing,
      href: "/home/notifications",
    },
    {
      label: "Clients",
      icon: Users,
      href: "/home/Client",
    },
    {
      label: "Reports",
      icon: AlertCircle,
      href: "/home/reports",
    },
    {
      label: "Profile",
      icon: UserRound,
      href: "/home/profile",
    },
    {
      label: "Settings",
      icon: Settings,
      href: "/home/settings",
    },
  ];

  return (
    <Sidebar>
      {/* BRANDING */}
      <SidebarHeader className="px-4 py-4">
        <Link
          href="/home/dashboard"
          className="flex items-center justify-center gap-2 rounded-md px-2 py-2 transition hover:bg-accent hover:text-accent-foreground"
        >
          <LogoIcon className="h-7 w-auto" />

          <span className="text-lg font-bold tracking-tight">WorkSync</span>
        </Link>
      </SidebarHeader>

      <div className="mx-4 border-b" />

      {/* NAVIGATION */}
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
    </Sidebar>
  );
}
