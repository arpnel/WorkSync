"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { databaseError } from "@/services/platform/platformService";
import { saveProjectMeeting } from "@/services/project/projectMeetingService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogClose } from "@/components/ui/dialog";
import { CalendarDays } from "lucide-react";
type Meeting = {
  meeting_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  link: string | null;
  status: string;
};
export default function ProjectMeetings({
  projectId,
  active,
  inDialog = false,
}: {
  projectId: string;
  active: boolean;
  inDialog?: boolean;
}) {
  const [rows, setRows] = useState<Meeting[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<string | null | false>(false),
    [title, setTitle] = useState(""),
    [start, setStart] = useState("");
  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("project_meetings")
        .select("meeting_id,title,starts_at,ends_at,link,status")
        .eq("project_id", projectId)
        .order("starts_at");
      if (error) throw databaseError(error);
      setRows(data ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load meetings.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
    const ch = supabase
      .channel("meetings:" + projectId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_meetings",
          filter: "project_id=eq." + projectId,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load, projectId]);
  const local = (v: string) => {
    const d = new Date(v);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const minimumStart = () => {
    const threshold = Date.now() + 20 * 60_000;
    const rounded = new Date(threshold);
    rounded.setSeconds(0, 0);
    if (rounded.getTime() < threshold)
      rounded.setMinutes(rounded.getMinutes() + 1);
    return local(rounded.toISOString());
  };
  const visibleRows = rows.filter((meeting) => meeting.status !== "cancelled");
  const save = async (cancelledMeeting?: Meeting) => {
    setBusy(true);
    setError("");
    try {
      if (
        !cancelledMeeting &&
        new Date(start).getTime() < Date.now() + 20 * 60_000
      )
        throw new Error("Schedule the meeting at least 20 minutes in advance.");
      await saveProjectMeeting(
        projectId,
        cancelledMeeting ?? {
          meeting_id: editing === false ? null : editing,
          title,
          starts_at: new Date(start).toISOString(),
          ends_at: new Date(
            new Date(start).getTime() + 30 * 60_000,
          ).toISOString(),
          link: null,
        },
        cancelledMeeting ? "cancelled" : "scheduled",
      );
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save meeting.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {editing === false ? (
        <>
          <div className="space-y-2">
            <h2 className="text-base font-semibold">Project meetings</h2>
            <p className="text-sm text-muted-foreground">
              View scheduled meeting times, or schedule a conversation with your
              project partner. Use the project conversation to start a video
              call.
            </p>
          </div>
          <div className="space-y-4">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
                <Button variant="ghost" onClick={() => void load()}>
                  Retry
                </Button>
              </p>
            )}
            <div className="border-t pt-4">
              <h3 className="mb-2 text-sm font-semibold">Scheduled meetings</h3>
              {loading ? (
                <ContentSkeleton label="Loading meetings" variant="list" />
              ) : !visibleRows.length ? (
                <div className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl bg-muted/60 px-4 py-5 text-center">
                  <CalendarDays className="mb-1 h-5 w-5 text-muted-foreground" />
                  <p className="text-sm font-medium">No meetings scheduled</p>
                  {active && (
                    <p className="text-xs text-muted-foreground">
                      Schedule a meeting to get started.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            {visibleRows.map((m) => (
              <div
                key={m.meeting_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {m.title} · {m.status}
                  </p>
                  <p>Starts {new Date(m.starts_at).toLocaleString()}</p>
                  {m.status === "scheduled" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Start a video call from your project conversation when it
                      is time to meet.
                    </p>
                  )}
                </div>
                {active && m.status === "scheduled" && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setEditing(m.meeting_id);
                        setTitle(m.title);
                        setStart(local(m.starts_at));
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void save(m)}
                    >
                      Cancel meeting
                    </Button>
                  </div>
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2 border-t pt-4">
              {inDialog && (
                <DialogClose asChild>
                  <Button variant="outline">Close</Button>
                </DialogClose>
              )}
              {active && (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setTitle("");
                    setStart("");
                  }}
                >
                  Schedule meeting
                </Button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <h2 className="text-base font-semibold">
              {editing ? "Edit meeting" : "Schedule meeting"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Set a title and choose when you want to meet with your project
              partner.
            </p>
          </div>
          <div>
            {error && (
              <p role="alert" className="mb-4 text-sm text-destructive">
                {error}
              </p>
            )}
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label className="grid gap-1.5 text-sm font-medium">
                Meeting title
                <Input
                  required
                  maxLength={200}
                  placeholder="Enter meeting title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Date and time
                <Input
                  type="datetime-local"
                  required
                  min={minimumStart()}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setError("");
                  }}
                >
                  Back
                </Button>
                <Button disabled={busy}>
                  {busy ? "Saving…" : "Save meeting"}
                </Button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
