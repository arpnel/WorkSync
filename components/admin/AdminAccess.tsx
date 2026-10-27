"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
export default function AdminAccess({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (alive) setChecking(true);
      try {
        const { data: result, error: accessError } = await supabase.rpc(
          "worksync_is_admin",
        );
        if (accessError) {
          if (accessError.code === "PGRST202" || accessError.code === "42883")
            throw new Error(
              "Administrator access is not configured in the database yet.",
            );
          throw new Error("WorkSync could not verify administrator access.");
        }
        if (alive) {
          setAllowed(result === true);
          setError(
            result === true
              ? ""
              : "This account does not have administrator access.",
          );
        }
      } catch (cause) {
        if (alive) {
          setAllowed(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "Cannot verify administrator access.",
          );
        }
      } finally {
        if (alive) setChecking(false);
      }
    };
    void check();
    const { data } = supabase.auth.onAuthStateChange(() => {
      if (alive) {
        setAllowed(false);
        setTimeout(() => void check(), 0);
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  if (checking && !allowed)
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center px-6">
        <ContentSkeleton label="Checking administrator access" variant="profile" />
      </div>
    );
  if (!allowed)
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 p-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Admin sign-in</h1>
          <p role={error ? "alert" : "status"} className="text-sm text-muted-foreground">
            {checking
              ? "Checking administrator access…"
              : error || "This account does not have administrator access."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {error && !checking && (
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
          )}
          <Button asChild>
            <Link href="/login?redirectTo=%2Fadmin">Sign in as administrator</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/home/dashboard">Return to WorkSync</Link>
          </Button>
        </div>
      </div>
    );
  return children;
}
