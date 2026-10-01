"use client";
import { useEffect, useState } from "react";
import { ClipboardCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    [closes, setCloses] = useState("");
  const [results, setResults] = useState<OpeningResults | null>(null),
    [search, setSearch] = useState("");
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
    setOpening({ item, id: crypto.randomUUID() });
    await action(async () =>
      setCount((await eligibleCount(item.categoryId)).count),
    );
  }
  if (loading) return <p role="status">Loading assessments…</p>;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
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
              if (
                !dirty ||
                window.confirm("Discard unsaved assessment changes?")
              ) {
                setSelected(null);
                setQuiz(null);
                setDirty(false);
              }
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
            aria-label="Search categories"
            placeholder="Search categories"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items
              .filter((x) =>
                x.category.toLowerCase().includes(search.toLowerCase()),
              )
              .map((item) => {
                const active = item.openings.find((o) => o.status !== "closed");
                return (
                  <Card key={item.categoryId}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {item.category}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm">
                        {item.quiz?.questions.length ?? 0} questions · Passing:{" "}
                        {item.quiz?.passingPercentage ?? 70}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {active
                          ? `${active.status === "scheduled" ? "Scheduled" : "Open"} until ${date(active.closesAt)}`
                          : "Closed"}
                      </p>
                      <div className="flex flex-wrap gap-2">
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
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Close this opening now? Unsubmitted attempts will expire.",
                                )
                              )
                                void action(async () => {
                                  await closeAssessment(active.id);
                                  await reload();
                                });
                            }}
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
                                {o.status}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open {opening?.item.category} assessment</DialogTitle>
            <DialogDescription>
              Publishing freezes this version and the eligible cohort now.
              Scheduling a later start does not add newly eligible accounts.
              Notifications are sent once.
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
          <p className="text-sm">
            Eligible now: {count ?? "Checking…"}. Final eligibility is checked
            when you confirm.
          </p>
          <label className="text-sm">
            Opens at (local time; blank for immediately)
            <Input
              type="datetime-local"
              value={opens}
              onChange={(e) => setOpens(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Closes at (local time)
            <Input
              type="datetime-local"
              value={closes}
              onChange={(e) => setCloses(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Change the passing score or timer in Edit assessment before
            publishing.
          </p>
          <Button
            disabled={busy || !closes || !opening}
            onClick={() =>
              void action(async () => {
                if (!opening) return;
                await openAssessment(
                  opening.item.categoryId,
                  opening.item.version!,
                  opening.id,
                  opens ? new Date(opens).toISOString() : null,
                  new Date(closes).toISOString(),
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
    </div>
  );
}
