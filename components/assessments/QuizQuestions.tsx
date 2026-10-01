"use client";
import type { PublicQuiz } from "@/lib/assessments/types";
import { Card, CardContent } from "@/components/ui/card";

export function QuizQuestions({
  quiz,
  answers,
  onChange,
  disabled = false,
}: {
  quiz: PublicQuiz;
  answers: Record<string, string[]>;
  onChange: (answers: Record<string, string[]>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      {quiz.questions.map((q, index) => (
        <Card key={q.id}>
          <CardContent className="pt-5">
            <fieldset disabled={disabled} className="space-y-3">
              <legend className="font-medium">
                {index + 1}. {q.prompt}{" "}
                <span className="text-xs text-muted-foreground">
                  ({q.points} points)
                </span>
              </legend>
              <p className="text-xs text-muted-foreground">
                {q.type === "multiple"
                  ? "Choose all correct answers. Exact matches earn points."
                  : "Choose one answer."}
              </p>
              {q.options.map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40"
                >
                  <input
                    className="mt-1 accent-primary"
                    type={q.type === "multiple" ? "checkbox" : "radio"}
                    name={q.id}
                    checked={(answers[q.id] ?? []).includes(o.id)}
                    onChange={(e) =>
                      onChange({
                        ...answers,
                        [q.id]:
                          q.type === "multiple"
                            ? e.target.checked
                              ? [...(answers[q.id] ?? []), o.id]
                              : (answers[q.id] ?? []).filter(
                                  (id) => id !== o.id,
                                )
                            : [o.id],
                      })
                    }
                  />
                  <span className="text-sm">{o.text}</span>
                </label>
              ))}
            </fieldset>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
