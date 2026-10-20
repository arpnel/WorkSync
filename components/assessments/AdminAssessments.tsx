"use client";
import { useEffect, useState } from "react";
import { ClipboardCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AssessmentEditor } from "./AssessmentEditor";
import {
  listAdminAssessments,
  saveAssessment,
  eligibleCount,
  openAssessment,
  closeAssessment,
  assessmentResults,
} from "@/services/assessments/assessmentService";
import {
  getSkillsByCategory,
  type Skill,
} from "@/services/serviceP/categoryService";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import type {
  AdminAssessment,
  OpeningResults,
  Quiz,
} from "@/lib/assessments/types";
const assessmentTimeZone = "Asia/Manila";
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: assessmentTimeZone,
      }).format(new Date(value))
    : "—";
const philippinesDateTimeToIso = (value: string) =>
  new Date(`${value}:00+08:00`).toISOString();
export default function AdminAssessments() {
  const [items, setItems] = useState<AdminAssessment[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<AdminAssessment | null>(null),
    [quiz, setQuiz] = useState<Quiz | null>(null),
    [skills, setSkills] = useState<Skill[]>([]),
    [dirty, setDirty] = useState(false);
  const [opening, setOpening] = useState<{
      item: AdminAssessment;
      id: string;
    } | null>(null),
    [count, setCount] = useState<number | null>(null),
    [opens, setOpens] = useState(""),
    [closes, setCloses] = useState(""),
    [audienceScope, setAudienceScope] = useState<
      "category" | "all_freelancers"
    >("category"),
    [minimumAccountAgeDays, setMinimumAccountAgeDays] = useState("30");
  const [results, setResults] = useState<OpeningResults | null>(null),
    [search, setSearch] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [closeTarget, setCloseTarget] = useState<string | null>(null);
  const discardEditor = () => {
    setSelected(null);
    setQuiz(null);
    setDirty(false);
  };
  async function reload() {
    const rows = await listAdminAssessments();
    setItems(rows);
    return rows;
  }
  useEffect(() => {
    void reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assessment operation failed.");
    } finally {
      setBusy(false);
    }
  }
  async function edit(item: AdminAssessment) {
    await action(async () => {
      const tags = await getSkillsByCategory(item.categoryId);
      setSkills(tags);
      setSelected(item);
      setQuiz(
        item.quiz ?? {
          title: `${item.category} Skill Assessment`,
          instructions:
            "Answer each question independently. One attempt per opening.",
          passingPercentage: 70,
          timeLimitMinutes: null,
          questions: [],
        },
      );
      setDirty(false);
    });
  }
  async function showOpening(item: AdminAssessment) {
    setCount(null);
    setOpens("");
    setCloses("");
    setAudienceScope("category");
    setMinimumAccountAgeDays("30");
    setOpening({ item, id: crypto.randomUUID() });
  }
  useEffect(() => {
    if (!opening) return;
    const ageDays = Number(minimumAccountAgeDays);
    if (
      minimumAccountAgeDays.trim() === "" ||
      !Number.isInteger(ageDays) ||
      ageDays < 0 ||
      ageDays > 3650
    ) {
      setCount(null);
      return;
    }
    let active = true;
    setCount(null);
    void eligibleCount(opening.item.categoryId, audienceScope, ageDays)
      .then(({ count: eligible }) => {
        if (active) setCount(eligible);
      })
      .catch((cause) => {
        if (!active) return;
        setCount(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to calculate assessment eligibility.",
        );
      });
    return () => {
      active = false;
    };
  }, [
    opening?.id,
    opening?.item.categoryId,
    audienceScope,
    minimumAccountAgeDays,
  ]);
  if (loading)
    return (
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="space-y-2" aria-hidden="true">
          <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted" />
        </div>
        <ContentSkeleton label="Loading skill assessments" variant="table" />
      </div>
    );
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ClipboardCheck className="text-primary" />
          Skill assessments
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Category knowledge checks. These do not change identity verification.
        </p>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {selected && quiz ? (
        <>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (!dirty) discardEditor();
              else setConfirmDiscard(true);
            }}
          >
            <ArrowLeft className="size-4" />
            All categories
          </Button>
          <p className="text-sm text-muted-foreground">
            {selected.category} · Draft version {selected.version ?? 0} ·
            Changes apply to future openings only.
          </p>
          <AssessmentEditor
            quiz={quiz}
            busy={busy}
            skills={skills}
            onChange={(q) => {
              setQuiz(q);
              setDirty(true);
            }}
            onSave={() =>
              void action(async () => {
                const saved = await saveAssessment(
                  selected.categoryId,
                  selected.version ?? 0,
                  quiz,
                );
                setSelected({ ...selected, version: saved.version, quiz });
                setDirty(false);
                await reload();
                setNotice("Draft saved. Existing openings are unchanged.");
              })
            }
          />
        </>
      ) : (
        <>
          <Input
            className="h-11 rounded-xl bg-card"
            aria-label="Search categories"
            placeholder="Search categories"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items
              .filter((x) =>
                x.category.toLowerCase().includes(search.toLowerCase()),
              )
              .map((item) => {
                const active = item.openings.find((o) => o.status !== "closed");
                return (
                  <Card
                    key={item.categoryId}
                    className="flex h-full flex-col rounded-xl shadow-sm"
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        {item.category}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col space-y-4">
                      <p className="text-sm">
                        {item.quiz?.questions.length ?? 0} questions · Passing:{" "}
                        {item.quiz?.passingPercentage ?? 70}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {active
                          ? `${active.status === "scheduled" ? "Scheduled" : "Open"} until ${date(active.closesAt)}`
                          : "Closed"}
                      </p>
                      <div className="mt-auto flex flex-wrap gap-2 border-t pt-4">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void edit(item)}
                        >
                          Edit assessment
                        </Button>
                        {active ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => setCloseTarget(active.id)}
                          >
                            Close assessment
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={busy || !item.quiz}
                            onClick={() => void showOpening(item)}
                          >
                            Open assessment
                          </Button>
                        )}
                      </div>
                      {item.openings.length > 0 && (
                        <details>
                          <summary className="cursor-pointer text-sm">
                            Openings & results ({item.openings.length})
                          </summary>
                          <div className="mt-2 space-y-2">
                            {item.openings.map((o) => (
                              <Button
                                key={o.id}
                                variant="outline"
                                size="sm"
                                className="h-auto w-full whitespace-normal"
                                disabled={busy}
                                onClick={() =>
                                  void action(async () => {
                                    setResults(await assessmentResults(o.id));
                                    setSearch("");
                                  })
                                }
                              >
                                Version {o.version} · {date(o.openedAt)} ·{" "}
                                {o.status} · {o.eligibleCount ?? 0} eligible ·{" "}
                                {o.audienceScope === "all_freelancers"
                                  ? "all active freelancers"
                                  : "category freelancers"}{" "}
                                · {o.minimumAccountAgeDays ?? 30}+ day account
                                age
                              </Button>
                            ))}
                          </div>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </>
      )}
      <Dialog
        open={!!opening}
        onOpenChange={(value) => {
          if (!value && !busy) setOpening(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90dvh] gap-5 overflow-y-auto rounded-2xl p-5 sm:max-w-lg sm:p-6">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="pr-8 text-xl tracking-tight">
              Open {opening?.item.category} assessment
            </DialogTitle>
            <DialogDescription className="leading-5">
              Choose who can take this assessment and set its availability
              window in Philippine time (PHT). The eligible group is saved when
              you confirm.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border bg-muted/30 px-3 py-1.5">
              {opening?.item.quiz?.questions.length} questions
            </span>
            <span className="rounded-full border bg-muted/30 px-3 py-1.5">
              Pass {opening?.item.quiz?.passingPercentage}%
            </span>
            <span className="rounded-full border bg-muted/30 px-3 py-1.5">
              {opening?.item.quiz?.timeLimitMinutes
                ? `${opening.item.quiz.timeLimitMinutes} minutes`
                : "No timer"}
            </span>
          </div>
          <fieldset className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
            <legend className="px-1 text-sm font-semibold">
              Who can take it?
            </legend>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                className="h-11 min-w-0 whitespace-normal rounded-lg px-3"
                variant={audienceScope === "category" ? "default" : "outline"}
                aria-pressed={audienceScope === "category"}
                onClick={() => setAudienceScope("category")}
              >
                This category only
              </Button>
              <Button
                type="button"
                className="h-11 min-w-0 whitespace-normal rounded-lg px-3"
                variant={
                  audienceScope === "all_freelancers" ? "default" : "outline"
                }
                aria-pressed={audienceScope === "all_freelancers"}
                onClick={() => setAudienceScope("all_freelancers")}
              >
                All active freelancers
              </Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {audienceScope === "category"
                ? `Includes freelancers who selected ${opening?.item.category}.`
                : "Includes active freelancers across every category."}{" "}
              Suspended accounts are never eligible.
            </p>
          </fieldset>
          <label className="block min-w-0 space-y-2 text-sm font-medium">
            Minimum account age in days
            <Input
              className="h-11 w-full rounded-lg bg-background"
              type="number"
              min={0}
              max={3650}
              step={1}
              value={minimumAccountAgeDays}
              onChange={(event) => setMinimumAccountAgeDays(event.target.value)}
              aria-invalid={
                minimumAccountAgeDays.trim() === "" ||
                !Number.isInteger(Number(minimumAccountAgeDays)) ||
                Number(minimumAccountAgeDays) < 0 ||
                Number(minimumAccountAgeDays) > 3650
              }
              aria-describedby="assessment-account-age-help"
            />
            <span
              id="assessment-account-age-help"
              className="block text-xs font-normal leading-5 text-muted-foreground"
            >
              Set 0 to include newly created accounts.
            </span>
          </label>
          <p
            className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 text-sm"
            role="status"
            aria-live="polite"
          >
            <span className="text-muted-foreground">Eligible freelancers</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {count ?? "Checking…"}
            </span>
          </p>
          {count === 0 && (
            <p className="-mt-3 text-xs text-muted-foreground">
              No freelancers match these settings yet.
            </p>
          )}
          <div className="grid min-w-0 gap-4">
            <label className="block min-w-0 space-y-2 text-sm font-medium">
              Opens at (PHT)
              <span className="block text-xs font-normal text-muted-foreground">
                Leave blank to open immediately.
              </span>
              <Input
                className="h-11 w-full min-w-0 rounded-lg bg-background"
                type="datetime-local"
                value={opens}
                onChange={(event) => setOpens(event.target.value)}
              />
            </label>
            <label className="block min-w-0 space-y-2 text-sm font-medium">
              Closes at (PHT)
              <Input
                className="h-11 w-full min-w-0 rounded-lg bg-background"
                type="datetime-local"
                value={closes}
                onChange={(event) => setCloses(event.target.value)}
              />
            </label>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Change the passing score or timer in Edit assessment before opening.
          </p>
          <Button
            className="h-11 w-full rounded-lg"
            disabled={
              busy || !closes || !opening || count === null || count === 0
            }
            onClick={() =>
              void action(async () => {
                if (!opening) return;
                await openAssessment(
                  opening.item.categoryId,
                  opening.item.version!,
                  opening.id,
                  opens ? philippinesDateTimeToIso(opens) : null,
                  philippinesDateTimeToIso(closes),
                  audienceScope,
                  Number(minimumAccountAgeDays),
                );
                setOpening(null);
                await reload();
                setNotice(
                  "Assessment published and eligible freelancers notified.",
                );
              })
            }
          >
            {busy ? "Opening assessment…" : "Confirm opening"}
          </Button>
        </DialogContent>
      </Dialog>{" "}
      <Dialog
        open={!!results}
        onOpenChange={(v) => {
          if (!v) setResults(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{results?.category} results</DialogTitle>
            <DialogDescription>
              Opened {date(results?.openedAt ?? null)} · Closes{" "}
              {date(results?.closesAt ?? null)}
              {results?.closedAt ? ` · Closed ${date(results.closedAt)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {results && (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {[
                  ["Eligible", results.rows.length],
                  ["Attempted", results.rows.filter((r) => r.startedAt).length],
                  [
                    "Passed",
                    results.rows.filter((r) => r.passed === true).length,
                  ],
                  [
                    "Failed",
                    results.rows.filter((r) => r.passed === false).length,
                  ],
                  [
                    "Not attempted",
                    results.rows.filter((r) => !r.startedAt).length,
                  ],
                  [
                    "Expired attempts",
                    results.rows.filter((r) => r.status === "expired").length,
                  ],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-lg bg-muted p-3">
                    {label}: <strong>{n}</strong>
                  </div>
                ))}
              </div>
              <Input
                aria-label="Search assessment results"
                placeholder="Search freelancer name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {[
                        "Freelancer",
                        "Score",
                        "Result",
                        "Started",
                        "Submitted",
                      ].map((h) => (
                        <th className="p-2" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows
                      .filter((r) =>
                        r.name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((r) => (
                        <tr key={r.userId} className="border-t">
                          <td className="p-2">{r.name}</td>
                          <td>
                            {r.percentage === null ? "—" : `${r.percentage}%`}
                          </td>
                          <td>
                            {r.passed === null
                              ? r.status.replaceAll("_", " ")
                              : r.passed
                                ? "Passed"
                                : "Failed"}
                          </td>
                          <td>{date(r.startedAt)}</td>
                          <td>{date(r.submittedAt)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard assessment changes?"
        description="Your unsaved assessment edits will be lost."
        confirmLabel="Discard changes"
        destructive
        onConfirm={discardEditor}
      />
      <ConfirmActionDialog
        open={closeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCloseTarget(null);
        }}
        title="Close this assessment opening?"
        description="Unsubmitted attempts will expire when this opening is closed."
        confirmLabel="Close opening"
        destructive
        onConfirm={() => {
          if (closeTarget) {
            void action(async () => {
              await closeAssessment(closeTarget);
              await reload();
            });
          }
          setCloseTarget(null);
        }}
      />
    </div>
  );
}
