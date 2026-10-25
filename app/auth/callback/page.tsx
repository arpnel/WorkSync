"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { completeSignin } from "@/services/auth/completeSignin";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";

// Use the same browser session store as sign-in and the authenticated pages.
export default function AuthCallbackPage() {
  const [error, setError] = useState("");
  const pending = useRef<Promise<string> | null>(null);
  const adminSignin =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("redirectTo") === "/admin";
  useEffect(() => {
    let active = true;
    async function finish() {
      try {
        pending.current ??= completeSignin(window.location.href);
        const destination = await pending.current;
        if (active) window.location.replace(destination);
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to finish sign-in. Please try again.",
          );
      }
    }
    void finish();
    return () => {
      active = false;
    };
  }, []);
  return error ? (
    <main className="mx-auto max-w-md space-y-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Unable to sign in</h1>
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
      <Link
        href={adminSignin ? "/login?redirectTo=%2Fadmin" : "/login"}
        className="underline"
      >
        Back to sign in
      </Link>
    </main>
  ) : (
    <AuthLoadingScreen />
  );
}
