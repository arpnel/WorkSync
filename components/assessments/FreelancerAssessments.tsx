"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Info,
  ListChecks,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  listMyAssessments,
  assessmentAttempt,
} from "@/services/assessments/assessmentService";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import type {
  MemberAssessment,
  AttemptResponse,
} from "@/lib/assessments/types";
import { QuizQuestions } from "./QuizQuestions";
import { openSubscriptionLimitDialog } from "@/services/subscriptions/subscriptionLimitDialog";
const date = (s: string) => new Date(s).toLocaleString();
const formatCountdown = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};
export default function FreelancerAssessments() {
  const params = useSearchParams();
  const [items, setItems] = useState<MemberAssessment[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("available");
  const [selected, setSelected] = useState<MemberAssessment | null>(null),
    [attempt, setAttempt] = useState<AttemptResponse | null>(null),
    [answers, setAnswers] = useState<Record<string, string[]>>({}),
    [confirm, setConfirm] = useState(false),
    [saved, setSaved] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null),
    [offset, setOffset] = useState(0);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const expiryRequestedFor = useRef<string | null>(null);
  const leaveAttempt = () => {
    setSelected(null);
    setAttempt(null);
    setRemaining(null);
    setSaved("");
    expiryRequestedFor.current = null;
  };
  async function reload() {
    const rows = await listMyAssessments();
    setItems(rows);
    return rows;
  }
  useEffect(() => {
    let alive = true;
    void listMyAssessments()
      .then((rows) => {
        if (!alive) return;
        setItems(rows);
        const target = rows.find((r) => r.id === params.get("opening"));
        if (target) setSelected(target);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [params]);
  useEffect(() => {
    if (!attempt?.deadlineAt || attempt.status !== "started") return;
    const update = () =>
      setRemaining(
        Math.max(
          0,
          Math.ceil(
            (Date.parse(attempt.deadlineAt!) - (Date.now() + offset)) / 1000,
          ),
        ),
      );
    update();
    const t = window.setInterval(update, 1000);
    return () => window.clearInterval(t);
  }, [attempt, offset]);
  async function run(action: "start" | "save" | "submit") {
    if (!selected) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const r = await assessmentAttempt(action, selected.id, answers);
      if (r.serverNow) setOffset(Date.parse(r.serverNow) - Date.now());
      if (action === "start") {
        setAnswers(r.answers ?? {});
        setAttempt(r);
      } else if (r.status !== "started") {
        setAttempt(r);
        setConfirm(false);
      } else setSaved("Answers saved.");
      await reload();
    } catch (e) {
      if (!openSubscriptionLimitDialog(e))
        setError(
          e instanceof Error ? e.message : "Assessment could not be updated.",
        );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !selected ||
      !attempt ||
      attempt.status !== "started" ||
      remaining !== 0
    ) {
      return;
    }
    const deadlineKey = `${selected.id}:${attempt.deadlineAt ?? attempt.startedAt ?? "attempt"}`;
    if (expiryRequestedFor.current === deadlineKey) return;
    expiryRequestedFor.current = deadlineKey;
    void assessmentAttempt("save", selected.id, answers)
      .then((result) => {
        if (result.status === "expired" || result.status === "submitted") {
          setAttempt(result);
          return;
        }
        if (result.serverNow && attempt.deadlineAt) {
          const serverOffset = Date.parse(result.serverNow) - Date.now();
          const serverRemaining = Math.max(
            0,
            Math.ceil(
              (Date.parse(attempt.deadlineAt) - (Date.now() + serverOffset)) /
                1000,
            ),
          );
          setOffset(serverOffset);
          setRemaining(Math.max(1, serverRemaining));
          expiryRequestedFor.current = null;
          return;
        }
        setAttempt((current) =>
          current ? { ...current, status: "expired" } : current,
        );
      })
      .catch(() => {
        setAttempt((current) =>
          current ? { ...current, status: "expired" } : current,
        );
      });
  }, [answers, attempt, remaining, selected]);
  const group = (x: MemberAssessment) =>
    x.attempt?.status === "submitted"
      ? "completed"
      : x.status === "closed" || x.attempt?.status === "expired"
        ? "expired"
        : "available";
  if (loading)
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="space-y-2" aria-hidden="true">
          <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted" />
        </div>
        <ContentSkeleton label="Loading skill assessments" variant="list" />
      </div>
    );
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ClipboardCheck className="text-primary" />
          Skill assessments
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          WorkSync category knowledge checks, separate from identity
          verification.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-primary">
          {saved}
        </p>
      )}
      {selected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              disabled={busy}
              className="-ml-3"
              onClick={() => {
                if (!attempt?.quiz) leaveAttempt();
                else setConfirmLeave(true);
              }}
            >
              <ArrowLeft className="size-4" />
              All assessments
            </Button>
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                selected.status === "open"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : selected.status === "scheduled"
                    ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : "border-muted bg-muted/50 text-muted-foreground"
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${
                  selected.status === "open"
                    ? "bg-emerald-500"
                    : selected.status === "scheduled"
                      ? "bg-amber-500"
                      : "bg-muted-foreground"
                }`}
              />
              {selected.status === "open"
                ? "Open now"
                : selected.status === "scheduled"
                  ? "Scheduled"
                  : "Closed"}
            </span>
          </div>
          <Card className="gap-0 overflow-hidden rounded-2xl border p-0 shadow-sm">
            <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6">
              <CardTitle className="flex items-center gap-3 text-xl sm:text-2xl">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border bg-background/70 text-primary shadow-sm">
                  <ClipboardCheck className="size-5" aria-hidden="true" />
                </span>
                {selected.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-5 text-sm sm:p-6">
              <p className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {selected.category} · Version {selected.version}
              </p>
              <p className="max-w-3xl leading-6 text-muted-foreground">
                {selected.instructions}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <ListChecks className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">Questions</p>
                    <p className="mt-0.5 font-semibold">
                      {selected.questionCount}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Target className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Passing score
                    </p>
                    <p className="mt-0.5 font-semibold">
                      {selected.passingPercentage}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Clock className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">Time limit</p>
                    <p className="mt-0.5 font-semibold">
                      {selected.timeLimitMinutes
                        ? `${selected.timeLimitMinutes} minutes`
                        : "No separate timer"}
                    </p>
                  </div>
                </div>
              </div>
              <p className="flex flex-wrap items-center gap-x-2 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                Opens {date(selected.opensAt)} · Closes {date(selected.closesAt)}
              </p>
              <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4">
                <Info
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <p className="leading-6 text-muted-foreground">
                  {selected.timeLimitMinutes
                    ? "One attempt for this opening. Your timer continues if you leave. Submit before this opening closes or your attempt timer expires, whichever comes first. Expired attempts are not scored. Early Admin closure ends unsubmitted attempts. Save answers before refreshing."
                    : "One attempt for this opening, with no separate attempt timer. Work at your own pace, but submit before this opening closes. Expired attempts are not scored. Early Admin closure ends unsubmitted attempts. Save answers before refreshing."}
                </p>
              </div>
            </CardContent>
          </Card>
          {attempt?.status === "submitted" ||
          (!attempt && selected.attempt?.status === "submitted") ? (
            <Card>
              <CardContent className="pt-5">
                <h2 className="font-semibold">
                  {(attempt ?? selected.attempt)?.passed
                    ? "Assessment passed"
                    : "Assessment not passed"}
                </h2>
                <p className="mt-2">
                  Score: {(attempt ?? selected.attempt)?.percentage}% ·{" "}
                  {(attempt ?? selected.attempt)?.score}/
                  {(attempt ?? selected.attempt)?.total} points
                </p>
                <p className="text-sm text-muted-foreground">
                  Submitted{" "}
                  {(attempt ?? selected.attempt)?.submittedAt
                    ? date((attempt ?? selected.attempt)!.submittedAt!)
                    : "—"}
                  . Answer keys are not disclosed.
                </p>
              </CardContent>
            </Card>
          ) : attempt?.status === "expired" ||
            selected.status === "closed" ||
            selected.attempt?.status === "expired" ? (
            <p role="status">
              {attempt?.status === "expired" ||
              selected.attempt?.status === "expired"
                ? "Your attempt expired before submission. No score is recorded for it."
                : "This assessment is closed. Historical results remain available."}
            </p>
          ) : attempt?.quiz ? (
            <>
              <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3">
                {selected.timeLimitMinutes !== null && (
                  <p className="text-sm" role="timer">
                    Time remaining: {remaining === null ? "…" : formatCountdown(remaining)}
                  </p>
                )}
                <Button
                  variant="outline"
                  disabled={busy || remaining === 0}
                  onClick={() => void run("save")}
                >
                  Save progress
                </Button>
              </div>
              <QuizQuestions
                quiz={attempt.quiz}
                answers={answers}
                onChange={setAnswers}
                disabled={busy || remaining === 0}
              />
              {remaining === 0 ? (
                <p role="status">
                  The submission deadline has passed. No further answers can be
                  submitted.
                </p>
              ) : (
                <Button disabled={busy} onClick={() => setConfirm(true)}>
                  Submit assessment
                </Button>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <p className="font-semibold">
                  {selected.status === "scheduled"
                    ? "This assessment is not open yet"
                    : selected.attempt
                      ? "Your assessment is ready to resume"
                      : "Ready to begin?"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.status === "scheduled"
                    ? `It opens ${date(selected.opensAt)}.`
                    : "Review the details above before starting your attempt."}
                </p>
              </div>
              <Button
                size="lg"
                disabled={busy || selected.status === "scheduled"}
                onClick={() => void run("start")}
                className="w-full shrink-0 sm:w-auto"
              >
                {selected.status === "scheduled"
                  ? "Not open yet"
                  : selected.attempt
                    ? "Resume assessment"
                    : "Start assessment"}
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {["available", "completed", "expired"].map((t) => (
              <Button
                key={t}
                variant={tab === t ? "default" : "outline"}
                onClick={() => setTab(t)}
                className="capitalize"
              >
                {t}
              </Button>
            ))}
          </div>
          {!items.filter((x) => group(x) === tab).length && (
            <p className="rounded-lg border p-6 text-sm text-muted-foreground">
              No {tab} assessments. Invitations are based on your category,
              account age and eligibility when Admin publishes an opening.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {items
              .filter((x) => group(x) === tab)
              .map((item) => (
                <Card
                  key={item.id}
                  className="group max-w-sm gap-0 overflow-hidden rounded-2xl border bg-card p-0 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg"
                >
                  <div className="h-1 bg-gradient-to-r from-primary/80 via-primary/35 to-transparent" />
                  <CardHeader className="space-y-3 p-4 pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="grid size-9 place-items-center rounded-lg border bg-primary/10 text-primary">
                        <ClipboardCheck className="size-4" aria-hidden="true" />
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          item.attempt?.status === "expired"
                            ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : item.attempt?.status === "submitted"
                              ? item.attempt.passed
                                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                              : item.status === "open"
                                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : item.status === "scheduled"
                                  ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                  : "border-muted bg-muted/50 text-muted-foreground"
                        }`}
                      >
                        {item.attempt?.status === "expired"
                          ? "Expired"
                          : item.attempt?.status === "submitted"
                            ? item.attempt.passed
                              ? "Passed"
                              : "Completed"
                            : item.status === "open"
                              ? "Open now"
                              : item.status === "scheduled"
                                ? "Upcoming"
                                : "Closed"}
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-base leading-snug">
                        {item.category}
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Skill assessment{" "}
                        <span aria-hidden="true">/</span> Version {item.version}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 px-4 pb-4 pt-0">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border bg-muted/20 p-2.5">
                        <p className="text-xs text-muted-foreground">
                          Questions
                        </p>
                        <p className="mt-1 flex items-center gap-2 font-semibold">
                          <ListChecks
                            className="size-4 text-primary"
                            aria-hidden="true"
                          />
                          {item.questionCount}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-2.5">
                        <p className="text-xs text-muted-foreground">
                          Passing score
                        </p>
                        <p className="mt-1 flex items-center gap-2 font-semibold">
                          <Target
                            className="size-4 text-primary"
                            aria-hidden="true"
                          />
                          {item.passingPercentage}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg bg-muted/35 px-3 py-2.5 text-sm">
                      <CalendarDays
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {item.status === "scheduled" ? "Opens" : "Closes"}
                        </p>
                        <p className="mt-0.5 text-sm font-medium">
                          {date(
                            item.status === "scheduled"
                              ? item.opensAt
                              : item.closesAt,
                          )}
                        </p>
                      </div>
                    </div>
                    {item.attempt?.status === "submitted" && (
                      <p className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5 text-sm">
                        Result:{" "}
                        <span className="font-semibold">
                          {item.attempt.percentage}%
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          {item.attempt.passed
                            ? "Passing score achieved"
                            : "Passing score not reached"}
                        </span>
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant={tab === "available" ? "default" : "outline"}
                      className="w-full justify-between"
                      onClick={() => {
                        setSelected(item);
                        setAttempt(null);
                        setRemaining(null);
                        setError("");
                      }}
                    >
                      {tab === "completed"
                        ? "View result"
                        : tab === "expired"
                          ? "View details"
                          : "View assessment"}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
          </div>
        </>
      )}
      <Dialog
        open={confirm}
        onOpenChange={(v) => {
          if (!busy) setConfirm(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit your final answers?</DialogTitle>
            <DialogDescription>
              Unanswered questions receive zero points. You cannot retry or edit
              after submission.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button disabled={busy} onClick={() => void run("submit")}>
            {busy ? "Submitting…" : "Submit final answers"}
          </Button>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Leave this assessment?"
        description="Only saved answers are preserved. The timer continues while you are away."
        confirmLabel="Leave assessment"
        onConfirm={leaveAttempt}
      />
    </div>
  );
}
