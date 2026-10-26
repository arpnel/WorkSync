"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { databaseError } from "@/services/platform/platformService";
import { saveProjectMeeting } from "@/services/project/projectMeetingService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
}: {
  projectId: string;
  active: boolean;
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
    if (rounded.getTime() < threshold) rounded.setMinutes(rounded.getMinutes() + 1);
    return local(rounded.toISOString());
  };
  const save = async (cancelledMeeting?: Meeting) => {
    setBusy(true);
    setError("");
    try {
      if (!cancelledMeeting && new Date(start).getTime() < Date.now() + 20 * 60_000)
        throw new Error("Schedule the meeting at least 20 minutes in advance.");
      await saveProjectMeeting(
        projectId,
        cancelledMeeting ?? {
          meeting_id: editing === false ? null : editing,
          title,
          starts_at: new Date(start).toISOString(),
          ends_at: new Date(new Date(start).getTime() + 30 * 60_000).toISOString(),
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Project meetings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
            <Button variant="ghost" onClick={() => void load()}>
              Retry
            </Button>
          </p>
        )}
        {loading ? (
          <ContentSkeleton label="Loading meetings" variant="list" />
        ) : (
          !rows.length && (
            <p className="text-sm text-muted-foreground">
              No meetings scheduled.
            </p>
          )
        )}
        {rows.map((m) => (
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
                  Start a video call from your project conversation when it is time to meet.
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
        {active &&
          (editing === false ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setTitle("");
                setStart("");
              }}
            >
              Schedule meeting
            </Button>
          ) : (
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label className="text-sm sm:col-span-2">
                Meeting title
                <Input
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Starts
                <Input
                  type="datetime-local"
                  required
                  min={minimumStart()}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <div className="flex gap-2">
                <Button disabled={busy}>Save meeting</Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Close
                </Button>
              </div>
            </form>
          ))}
      </CardContent>
    </Card>
  );
}
