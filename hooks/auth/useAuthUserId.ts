"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Minimal auth helper to get current user id from Supabase.
 * Used for client-side dialogs.
 */
export function useAuthUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUserId(session?.user.id ?? null);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setUserId(data.session?.user.id ?? null);
      })
      .catch(() => {
        if (!mounted) return;
        setUserId(null);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return userId;
}

