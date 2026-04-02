"use client"

import Link from "next/link"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader } from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Home, ShoppingCart, Briefcase, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePathname } from "next/navigation"

export function AppSidebar() {
  const pathname = usePathname()

  const navItems = [
    { label: "Dashboard", icon: Home, href: "/dashboard" },
    { label: "Marketplace", icon: ShoppingCart, href: "/dashboard/marketplace" },
    { label: "Projects", icon: Briefcase, href: "/dashboard/projects" },
    { label: "Clients", icon: Users, href: "/dashboard/clients" },
  ]

  return (
    <Sidebar>
      {/* Header */}
      <SidebarHeader>
        <span className="text-xl font-bold">WorkSync</span>
      </SidebarHeader>


      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground",
                pathname === item.href ? "bg-accent text-accent-foreground" : ""
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </SidebarGroup>
      </SidebarContent>


      {/* Footer with clickable avatar */}
      <SidebarFooter>
        <Link href="/dashboard/profile" className="flex items-center gap-2">
          <Avatar>
            <AvatarImage src="/avatar.png" alt="User Avatar" />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">User Name</span>
        </Link>
      </SidebarFooter>
    </Sidebar>
  )
}