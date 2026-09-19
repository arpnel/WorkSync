"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  databaseError,
  platformAction,
} from "@/services/platform/platformService";
import {
  parseSchedule,
  saveSchedule,
} from "@/services/schedule/scheduleService";
import { Button } from "@/components/ui/button";
export default function PlannerSync() {
  const [message, setMessage] = useState("Connecting planner sync…"),
    [conflict, setConflict] = useState(false);
  const actions = useRef<{
    download: () => void;
    remote: () => void;
    retry: () => void;
  } | null>(null);
  useEffect(() => {
    let alive = true,
      owner = "",
      revision = 0,
      ready = false,
      saving = false,
      applying = false,
      queued = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    const key = () => "worksync:schedule:v1:" + owner,
      baseKey = () => key() + ":cloud-base";
    const save = async () => {
      if (!alive || !ready || saving || applying) return;
      saving = true;
      try {
        do {
          queued = false;
          const raw = localStorage.getItem(key());
          if (!raw || raw === localStorage.getItem(baseKey())) break;
          const state = parseSchedule(JSON.parse(raw));
          revision = await platformAction("worksync_save_planner", {
            p_state: state,
            p_revision: revision,
          });
          localStorage.setItem(baseKey(), raw);
          if (alive) setMessage("Planner synced");
        } while (queued && alive);
      } catch (e) {
        ready = false;
        if (alive) {
          setMessage(
            e instanceof Error
              ? e.message
              : "Sync unavailable. Your planner is saved in this browser.",
          );
          setConflict(true);
        }
      } finally {
        saving = false;
      }
    };
    const read = async (force = false) => {
      if (!alive || !owner || saving) return;
      try {
        const { data, error } = await supabase
          .from("planner_documents")
          .select("state,revision")
          .eq("user_id", owner)
          .maybeSingle();
        if (error) throw databaseError(error);
        if (!alive) return;
        const raw = localStorage.getItem(key()),
          base = localStorage.getItem(baseKey());
        const remote = data ? JSON.stringify(parseSchedule(data.state)) : null;
        if (remote && raw && raw !== remote && raw !== base && !force) {
          ready = false;
          setConflict(true);
          setMessage(
            "This browser has changes that differ from the cloud copy. Download your local planner before choosing the cloud copy.",
          );
          return;
        }
        revision = data?.revision ?? 0;
        if (remote && raw !== remote) {
          applying = true;
          saveSchedule(owner, JSON.parse(remote));
          applying = false;
        }
        if (remote) localStorage.setItem(baseKey(), remote);
        ready = true;
        setConflict(false);
        setMessage("Planner synced");
        await save();
      } catch (e) {
        ready = false;
        if (alive) {
          setConflict(true);
          setMessage(
            `Cloud sync unavailable; local edits are retained. ${e instanceof Error ? e.message : "Try again."}`,
          );
        }
      }
    };
    const changed = () => {
      if (applying) return;
      queued = true;
      void save();
    };
    const focus = () => void read();
    actions.current = {
      retry: () => void read(),
      remote: () => void read(true),
      download: () => {
        const raw = localStorage.getItem(key());
        if (!raw) return;
        const url = URL.createObjectURL(
          new Blob([raw], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "worksync-planner-backup.json";
        a.click();
        URL.revokeObjectURL(url);
      },
    };
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!alive || !data.user) return;
      owner = data.user.id;
      await read();
      if (!alive) return;
      channel = supabase
        .channel("planner-sync:" + owner)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "planner_documents",
            filter: "user_id=eq." + owner,
          },
          () => {
            if (!saving) void read();
          },
        )
        .subscribe();
    });
    window.addEventListener("worksync:schedule-updated", changed);
    window.addEventListener("focus", focus);
    return () => {
      alive = false;
      window.removeEventListener("worksync:schedule-updated", changed);
      window.removeEventListener("focus", focus);
      if (channel) void supabase.removeChannel(channel);
      actions.current = null;
    };
  }, []);
  if (!conflict) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span role="status">{message}</span>
      {conflict && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.current?.retry()}
          >
            Retry sync
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.current?.download()}
          >
            Download local copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => actions.current?.remote()}
          >
            Use cloud copy
          </Button>
        </>
      )}
    </div>
  );
}
