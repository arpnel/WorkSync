"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { platformAction } from "@/services/platform/platformService";
export default function AdminAccess({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const result = await platformAction("worksync_is_admin", {});
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
  if (!allowed)
    return (
      <div className="p-8">
        <p role={error ? "alert" : "status"}>
          {error || "Checking administrator access…"}
        </p>
        <Link className="mt-4 block underline" href="/home/dashboard">
          Return to WorkSync
        </Link>
      </div>
    );
  return children;
}
