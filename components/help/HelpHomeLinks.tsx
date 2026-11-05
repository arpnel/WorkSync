"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MouseEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { LogoIcon } from "@/components/shared/logo";
import { supabase } from "@/lib/supabaseClient";
import { getPostSigninPath } from "@/services/auth/completeSignin";

export function HelpHomeLinks() {
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);

  async function returnToWorkSync(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (navigating) return;
    setNavigating(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const destination = data.session
        ? await getPostSigninPath(data.session.user.id)
        : "/";
      router.push(destination);
    } catch {
      // A failed profile lookup should not send a signed-in user to the public landing page.
      router.push("/home/dashboard");
    } finally {
      setNavigating(false);
    }
  }

  return (
    <>
      <Link
        href="/"
        onClick={returnToWorkSync}
        aria-label="Return to WorkSync home"
        aria-busy={navigating}
        className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LogoIcon className="size-8 shrink-0" />
        <span className="text-base font-bold tracking-tight">WorkSync</span>
        <span className="h-5 w-px bg-border" aria-hidden="true" />
        <span className="text-sm font-medium text-muted-foreground">Support</span>
      </Link>
      <Link
        href="/"
        onClick={returnToWorkSync}
        aria-label="Back to WorkSync"
        aria-busy={navigating}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4 sm:hidden" />
        <span className="hidden sm:inline">Back to WorkSync</span>
        <ArrowUpRight className="hidden size-4 sm:inline" />
      </Link>
    </>
  );
}
