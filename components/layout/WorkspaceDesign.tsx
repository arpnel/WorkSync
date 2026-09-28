"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import "./workspace-design.css";

/** Keep the reference design inside page content, away from the messenger. */
export function WorkspaceDesign({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/home/messages" || pathname.startsWith("/home/messages/"))
    return children;
  return (
    <div className="workspace-design min-w-0" data-workspace-design="shadboard">
      {children}
    </div>
  );
}
