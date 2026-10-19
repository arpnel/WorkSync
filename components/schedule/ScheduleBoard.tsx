"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useProjectSchedule } from "@/hooks/schedule/useProjectSchedule";
import { useManualDeadlines } from "@/hooks/schedule/useManualDeadlines";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ManualDeadline } from "@/services/schedule/manualDeadlines";
import type { ScheduleCard, SchedulePriority } from "@/types/schedule/schedule";
import ScheduleCalendar from "./ScheduleCalendar";

type DeadlineDraft = Omit<ManualDeadline, "id"> & { id?: string };
const emptyDraft = (dueDate: string): DeadlineDraft => ({ title: "", description: "", dueDate, dueTime: "", priority: "medium" });

export default function ScheduleBoard({ initialDate }: { initialDate?: string }) {
  const { deadlines, error: projectError, loading: projectsLoading } = useProjectSchedule();
  const manual = useManualDeadlines();
  const router = useRouter();
  const [draft, setDraft] = useState<DeadlineDraft | null>(null);
  const projectDeadlines = deadlines.filter((item) => item.kind !== "meeting" && item.stage !== "Done");
  const cards: ScheduleCard[] = [
    ...projectDeadlines,
    ...manual.deadlines.map((item) => ({ ...item, id: `manual:${item.id}`, listId: "manual", entryType: "deadline" as const })),
  ];
  if (projectsLoading || manual.loading) return <ContentSkeleton label="Loading deadlines" variant="calendar" />;

  function openDeadline(date: string) {
    setDraft(emptyDraft(date));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !draft.title.trim() || !draft.dueDate) return;
    const { id, ...values } = draft;
    if (manual.saveDeadline({ ...values, title: values.title.trim() }, id)) setDraft(null);
  }
  function openCard(card: ScheduleCard) {
    if (card.id.startsWith("manual:")) {
      const item = manual.deadlines.find((deadline) => `manual:${deadline.id}` === card.id);
      if (item) setDraft(item);
    } else {
      const projectDeadline = deadlines.find((deadline) => deadline.id === card.id);
      if (projectDeadline) router.push(projectDeadline.href);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {(projectError || manual.error) && <p role="status" className="text-sm text-muted-foreground">{manual.error || projectError}</p>}
      <ScheduleCalendar
        initialDate={initialDate}
        cards={cards}
        status={projectError && !manual.deadlines.length ? "unavailable" : "ready"}
        onCreateDeadline={openDeadline}
        onOpen={openCard}
      />
      <Dialog open={!!draft} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit deadline" : "Add deadline"}</DialogTitle>
            <DialogDescription>Save a personal deadline in this browser.</DialogDescription>
          </DialogHeader>
          {draft && <form id="manual-deadline-form" className="space-y-4" onSubmit={submit}>
            <div className="space-y-2"><Label htmlFor="deadline-title">Title</Label><Input id="deadline-title" required maxLength={120} autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What is due?" /></div>
            <div className="space-y-2"><Label htmlFor="deadline-description">Notes</Label><Textarea id="deadline-description" maxLength={1000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Optional details" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="deadline-date">Due date</Label><Input id="deadline-date" type="date" required value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="deadline-time">Time (optional)</Label><Input id="deadline-time" type="time" value={draft.dueTime} onChange={(event) => setDraft({ ...draft, dueTime: event.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="deadline-priority">Priority</Label><select id="deadline-priority" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as SchedulePriority })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
          </form>}
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {draft?.id ? <Button type="button" variant="destructive" onClick={() => { if (manual.deleteDeadline(draft.id!)) setDraft(null); }}>Delete</Button> : <span />}
            <Button type="submit" form="manual-deadline-form" disabled={!draft?.title.trim() || !draft.dueDate}>Save deadline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}