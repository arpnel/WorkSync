"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Eye, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { QuizQuestions } from "./QuizQuestions";
import type { Quiz, QuizQuestion, QuestionType } from "@/lib/assessments/types";
import type { Skill } from "@/services/serviceP/categoryService";

export function AssessmentEditor({
  quiz,
  onChange,
  onSave,
  busy,
  skills,
}: {
  quiz: Quiz;
  onChange: (q: Quiz) => void;
  onSave: () => void;
  busy: boolean;
  skills: Skill[];
}) {
  const [preview, setPreview] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const update = (index: number, patch: Partial<QuizQuestion>) =>
    onChange({
      ...quiz,
      questions: quiz.questions.map((q, i) =>
        i === index ? { ...q, ...patch } : q,
      ),
    });
  const changeType = (index: number, type: QuestionType) => {
    const q = quiz.questions[index];
    update(index, {
      type,
      correctOptionIds: [],
      options:
        type === "boolean"
          ? [
              { id: crypto.randomUUID(), text: "True" },
              { id: crypto.randomUUID(), text: "False" },
            ]
          : q.options,
    });
  };
  const move = (index: number, delta: number) => {
    const questions = [...quiz.questions];
    [questions[index], questions[index + delta]] = [
      questions[index + delta],
      questions[index],
    ];
    onChange({ ...quiz, questions });
  };
  return (
    <fieldset disabled={busy} className="min-w-0 space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setPreview(!preview)}>
          <Eye className="size-4" />
          {preview ? "Edit questions" : "Preview quiz"}
        </Button>
        <Button disabled={busy} onClick={onSave}>
          <Save className="size-4" />
          Save draft
        </Button>
      </div>
      {preview ? (
        <>
          <p className="text-sm text-muted-foreground">
            Preview only. No attempt or result is created.
          </p>
          <QuizQuestions quiz={quiz} answers={answers} onChange={setAnswers} />
        </>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
              <label className="space-y-1 text-sm sm:col-span-2">
                Assessment title
                <Input
                  maxLength={160}
                  value={quiz.title}
                  onChange={(e) => onChange({ ...quiz, title: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                Instructions
                <Textarea
                  maxLength={4000}
                  value={quiz.instructions}
                  onChange={(e) =>
                    onChange({ ...quiz, instructions: e.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                Passing percentage
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={quiz.passingPercentage}
                  onChange={(e) =>
                    onChange({
                      ...quiz,
                      passingPercentage: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                Time limit (minutes; blank for no timer)
                <Input
                  type="number"
                  min={1}
                  max={240}
                  value={quiz.timeLimitMinutes ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...quiz,
                      timeLimitMinutes: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                />
              </label>
            </CardContent>
          </Card>
          {quiz.questions.map((q, index) => (
            <Card key={q.id}>
              <CardContent className="space-y-4 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Question {index + 1}</h3>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Move question ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Move question ${index + 1} down`}
                      disabled={index === quiz.questions.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete question ${index + 1}`}
                      onClick={() =>
                        onChange({
                          ...quiz,
                          questions: quiz.questions.filter(
                            (x) => x.id !== q.id,
                          ),
                        })
                      }
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <label className="block text-sm">
                  Question
                  <Textarea
                    value={q.prompt}
                    maxLength={2000}
                    onChange={(e) => update(index, { prompt: e.target.value })}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Question type
                    <select
                      className="mt-1 block w-full rounded-md border bg-background p-2"
                      value={q.type}
                      onChange={(e) =>
                        changeType(index, e.target.value as QuestionType)
                      }
                    >
                      <option value="single">Single answer</option>
                      <option value="multiple">Multiple answers</option>
                      <option value="boolean">True / False</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Points
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={q.points}
                      onChange={(e) =>
                        update(index, { points: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mark the correct answer{q.type === "multiple" ? "s" : ""}.
                  Multiple-answer questions use exact-set grading.
                </p>
                {q.options.map((o, oi) => (
                  <div className="flex items-center gap-2" key={o.id}>
                    <input
                      aria-label={`Option ${oi + 1} is correct`}
                      type={q.type === "multiple" ? "checkbox" : "radio"}
                      name={`correct-${q.id}`}
                      checked={q.correctOptionIds.includes(o.id)}
                      onChange={(e) =>
                        update(index, {
                          correctOptionIds:
                            q.type === "multiple"
                              ? e.target.checked
                                ? [...q.correctOptionIds, o.id]
                                : q.correctOptionIds.filter((id) => id !== o.id)
                              : [o.id],
                        })
                      }
                    />
                    <Input
                      aria-label={`Answer option ${oi + 1}`}
                      disabled={q.type === "boolean"}
                      value={o.text}
                      maxLength={500}
                      onChange={(e) =>
                        update(index, {
                          options: q.options.map((x) =>
                            x.id === o.id ? { ...x, text: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    {q.type !== "boolean" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete option ${oi + 1}`}
                        disabled={q.options.length <= 2}
                        onClick={() =>
                          update(index, {
                            options: q.options.filter((x) => x.id !== o.id),
                            correctOptionIds: q.correctOptionIds.filter(
                              (id) => id !== o.id,
                            ),
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {q.type !== "boolean" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={q.options.length >= 8}
                    onClick={() =>
                      update(index, {
                        options: [
                          ...q.options,
                          { id: crypto.randomUUID(), text: "" },
                        ],
                      })
                    }
                  >
                    Add option
                  </Button>
                )}
                {skills.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-sm">
                      Optional skill tags
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {skills.map((s) => (
                        <label key={s.id} className="flex gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={q.skillIds.includes(s.id)}
                            onChange={(e) =>
                              update(index, {
                                skillIds: e.target.checked
                                  ? [...q.skillIds, s.id]
                                  : q.skillIds.filter((id) => id !== s.id),
                              })
                            }
                          />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          ))}
          <Button
            variant="outline"
            disabled={quiz.questions.length >= 50}
            onClick={() =>
              onChange({
                ...quiz,
                questions: [
                  ...quiz.questions,
                  {
                    id: crypto.randomUUID(),
                    prompt: "",
                    type: "single",
                    points: 1,
                    skillIds: [],
                    correctOptionIds: [],
                    options: [
                      { id: crypto.randomUUID(), text: "" },
                      { id: crypto.randomUUID(), text: "" },
                    ],
                  },
                ],
              })
            }
          >
            <Plus className="size-4" />
            Add question
          </Button>
        </>
      )}
    </fieldset>
  );
}
