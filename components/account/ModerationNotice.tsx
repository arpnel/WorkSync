"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
type Restriction = {
  status: string;
  reason: string;
  expires_at: string | null;
};
export default function ModerationNotice() {
  const [restriction, setRestriction] = useState<Restriction | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive || error || !data.session?.user) return;
      const id = data.session.user.id;
      const load = async () => {
        const result = await supabase
          .from("account_moderation")
          .select("status,reason,expires_at")
          .eq("user_id", id)
          .maybeSingle();
        if (alive && !result.error)
          setRestriction(
            result.data?.expires_at &&
              new Date(result.data.expires_at).getTime() <= Date.now()
              ? null
              : result.data,
          );
      };
      void load();
    }).catch(() => {
      // The notice is optional UI; retry on a later page load if auth is offline.
    });
    return () => {
      alive = false;
    };
  }, []);
  if (restriction?.status !== "suspended") return null;
  return (
    <div role="status" className="mb-4 rounded-lg border bg-muted p-3 text-sm">
      <strong>Marketplace activity suspended</strong>
      <p>{restriction.reason}</p>
      {restriction.expires_at && (
        <p>Until {new Date(restriction.expires_at).toLocaleString()}</p>
      )}
      <p>
        Existing project delivery, messages and resolution remain available. New
        listings, applications and agreements are restricted.
      </p>
    </div>
  );
}
