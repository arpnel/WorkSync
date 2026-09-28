"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Secondary information stays one tap away on phones and visible on desktop. */
export function PhoneDisclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 text-left text-sm font-medium md:hidden"
      >
        {title}
        <ChevronDown
          aria-hidden="true"
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div className={`${open ? "mt-3" : "hidden"} md:mt-0 md:block`}>
        {children}
      </div>
    </div>
  );
}
