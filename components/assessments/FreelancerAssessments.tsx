"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type {
  MemberAssessment,
  AttemptResponse,
} from "@/lib/assessments/types";
import { QuizQuestions } from "./QuizQuestions";
const date = (s: string) => new Date(s).toLocaleString();
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
    let alive = true;
    const refresh = () =>
      void listMyAssessments()
        .then((rows) => {
          if (!alive) return;
          setItems(rows);
          setSelected((current) =>
            current
              ? (rows.find((row) => row.id === current.id) ?? current)
              : null,
          );
        })
        .catch(() => {
          /* Preserve saved selections; actions surface service errors. */
        });
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
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
      setError(
        e instanceof Error ? e.message : "Assessment could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  const group = (x: MemberAssessment) =>
    x.attempt?.status === "submitted"
      ? "completed"
      : x.status === "closed" || x.attempt?.status === "expired"
        ? "expired"
        : "available";
  if (loading) return <p role="status">Loading assessments…</p>;
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
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (
                !attempt?.quiz ||
                window.confirm(
                  "Leave this attempt? Only explicitly saved answers are preserved; the timer continues.",
                )
              ) {
                setSelected(null);
                setAttempt(null);
                setRemaining(null);
                setSaved("");
              }
            }}
          >
            <ArrowLeft className="size-4" />
            All assessments
          </Button>
          <Card>
            <CardHeader>
              <CardTitle>{selected.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                {selected.category} · Version {selected.version}
              </p>
              <p>{selected.instructions}</p>
              <p>
                {selected.questionCount} questions · Passing{" "}
                {selected.passingPercentage}% ·{" "}
                {selected.timeLimitMinutes
                  ? `${selected.timeLimitMinutes} minutes`
                  : "No separate timer"}
              </p>
              <p>
                Opens {date(selected.opensAt)} · Closes{" "}
                {date(selected.closesAt)}
              </p>
              <p className="text-muted-foreground">
                One attempt for this opening. The timer continues if you leave.
                Submit before closing or your timer expires, whichever comes
                first. Early Admin closure ends unsubmitted attempts. Save
                answers before refreshing.
              </p>
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
              This assessment is closed or your attempt has expired. Historical
              results remain available.
            </p>
          ) : attempt?.quiz ? (
            <>
              <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3">
                <p className="text-sm" role="timer">
                  Time remaining:{" "}
                  {remaining === null
                    ? "…"
                    : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
                </p>
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
            <Button
              disabled={busy || selected.status === "scheduled"}
              onClick={() => void run("start")}
            >
              {selected.status === "scheduled"
                ? "Not open yet"
                : selected.attempt
                  ? "Resume assessment"
                  : "Start assessment"}
            </Button>
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
          <div className="grid gap-4 sm:grid-cols-2">
            {items
              .filter((x) => group(x) === tab)
              .map((item) => (
                <Card key={item.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{item.category}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p>
                      {item.questionCount} questions · Passing{" "}
                      {item.passingPercentage}%
                    </p>
                    <p>Closes {date(item.closesAt)}</p>
                    {item.attempt?.status === "submitted" && (
                      <p>
                        {item.attempt.passed ? "Passed" : "Not passed"} ·{" "}
                        {item.attempt.percentage}%
                      </p>
                    )}
                    <Button
                      variant="outline"
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
    </div>
  );
}
