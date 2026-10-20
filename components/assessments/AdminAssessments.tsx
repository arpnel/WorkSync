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
import type {
  AdminAssessment,
  OpeningResults,
  Quiz,
} from "@/lib/assessments/types";
const date = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
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
  if (loading) return <p role="status">Loading assessments…</p>;
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
        onOpenChange={(v) => {
          if (!v && !busy) setOpening(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader className="space-y-2">
            <DialogTitle>Open {opening?.item.category} assessment</DialogTitle>
            <DialogDescription>
              Choose which active freelancers qualify and when the assessment is
              available. The eligible group is fixed when you confirm; later
              account or category changes are not added automatically.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="text-sm">
            {opening?.item.quiz?.questions.length} questions · Pass{" "}
            {opening?.item.quiz?.passingPercentage}% ·{" "}
            {opening?.item.quiz?.timeLimitMinutes
              ? `${opening.item.quiz.timeLimitMinutes} minutes`
              : "No separate timer"}
          </p>
          <fieldset className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <legend className="text-sm font-medium">Who can take it?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant={audienceScope === "category" ? "default" : "outline"}
                aria-pressed={audienceScope === "category"}
                onClick={() => setAudienceScope("category")}
              >
                This category only
              </Button>
              <Button
                type="button"
                variant={
                  audienceScope === "all_freelancers" ? "default" : "outline"
                }
                aria-pressed={audienceScope === "all_freelancers"}
                onClick={() => setAudienceScope("all_freelancers")}
              >
                All active freelancers
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Category only includes freelancers who selected{" "}
              {opening?.item.category}. Suspended accounts are never eligible.
            </p>
          </fieldset>
          <label className="block space-y-2 text-sm font-medium">
            Minimum account age in days
            <Input
              type="number"
              min={0}
              max={3650}
              step={1}
              value={minimumAccountAgeDays}
              onChange={(event) => setMinimumAccountAgeDays(event.target.value)}
              aria-describedby="assessment-account-age-help"
            />
            <span
              id="assessment-account-age-help"
              className="block text-xs text-muted-foreground"
            >
              Set 0 to include newly created freelancer accounts.
            </span>
          </label>
          <p
            className="rounded-lg bg-background px-3 py-2 text-sm"
            role="status"
            aria-live="polite"
          >
            Eligible now: {count ?? "Checking…"}
            {count === 0 && ". No freelancers match these settings."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 text-sm font-medium">
              Opens at (local time; blank for immediately)
              <Input
                type="datetime-local"
                value={opens}
                onChange={(e) => setOpens(e.target.value)}
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Closes at (local time)
              <Input
                type="datetime-local"
                value={closes}
                onChange={(e) => setCloses(e.target.value)}
              />
            </label>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Change the passing score or timer in Edit assessment before
            publishing.
          </p>
          <Button
            className="h-11 w-full rounded-xl"
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
                  opens ? new Date(opens).toISOString() : null,
                  new Date(closes).toISOString(),
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
            Confirm opening
          </Button>
        </DialogContent>
      </Dialog>
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
