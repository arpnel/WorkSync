import { z } from "zod";

export const RUBRIC_VERSION = "worksync-match-v1";
export const weights = {
  skills: 40,
  experience: 20,
  proposal: 15,
  capability: 10,
  delivery: 10,
  pricing: 5,
} as const;
const dimension = z.number().int().min(0).max(100);
export const evaluationSchema = z
  .object({
    dimensions: z
      .object({
        skills: dimension,
        experience: dimension,
        proposal: dimension,
        capability: dimension,
        delivery: dimension,
        pricing: dimension,
      })
      .strict(),
    strengths: z.array(z.string().trim().min(1).max(200)).max(4),
    weaknesses: z.array(z.string().trim().min(1).max(200)).max(4),
    recommendation: z.string().trim().min(1).max(300),
  })
  .strict();

export function validateEvaluation(value: unknown) {
  const evaluation = evaluationSchema.parse(value);
  const score = Math.round(
    Object.entries(weights).reduce(
      (sum, [key, weight]) =>
        sum + evaluation.dimensions[key as keyof typeof weights] * weight,
      0,
    ) / 100,
  );
  return {
    ...evaluation,
    score,
    result:
      score >= 80
        ? "Strong Match"
        : score >= 60
          ? "Potential Match"
          : "Limited Match Evidence",
  };
}

// Existing result TEXT stores a versioned envelope; legacy plain labels still render.
export function screeningLabel(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed?.version === RUBRIC_VERSION &&
      typeof parsed.label === "string"
      ? parsed.label
      : value;
  } catch {
    return value;
  }
}

export function redactScreeningText(
  value: unknown,
  limit = 10000,
): string | null {
  if (typeof value !== "string") return null;
  return value
    .slice(0, limit)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[contact removed]")
    .replace(/https?:\/\/\S+/gi, "[link removed]")
    .replace(/(?:\+?\d[\d ()-]{8,}\d)/g, "[contact removed]");
}
