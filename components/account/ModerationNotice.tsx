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
    let channel: ReturnType<typeof supabase.channel> | undefined;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive || !data.user) return;
      const id = data.user.id;
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
      channel = supabase
        .channel("account-moderation:" + id)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "account_moderation",
            filter: "user_id=eq." + id,
          },
          () => void load(),
        )
        .subscribe();
    });
    return () => {
      alive = false;
      if (channel) void supabase.removeChannel(channel);
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
