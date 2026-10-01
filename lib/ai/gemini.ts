import "server-only";
import { GoogleGenAI } from "@google/genai";
import { validateEvaluation, weights, SCREENING_INSTRUCTION } from "./screening";

export const screeningModel = () =>
  process.env.GEMINI_MODEL || "gemini-3.6-flash";

export async function evaluateApplicant(input: unknown) {
  if (!process.env.GEMINI_API_KEY) throw new Error("SCREENING_CONFIGURATION");
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 45000 },
  });
  const response = await ai.models.generateContent({
    model: screeningModel(),
    contents: JSON.stringify(input),
    config: {
      temperature: 0,
      maxOutputTokens: 4096,
      systemInstruction: SCREENING_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          dimensions: {
            type: "object",
            additionalProperties: false,
            properties: Object.fromEntries(
              Object.keys(weights).map((key) => [
                key,
                { type: "integer", minimum: 0, maximum: 100 },
              ]),
            ),
            required: Object.keys(weights),
          },
          strengths: { type: "array", items: { type: "string", minLength: 1, maxLength: 200 }, maxItems: 4 },
          weaknesses: { type: "array", items: { type: "string", minLength: 1, maxLength: 200 }, maxItems: 4 },
          recommendation: { type: "string", minLength: 1, maxLength: 300 },
        },
        required: ["dimensions", "strengths", "weaknesses", "recommendation"],
      },
    },
  });
  const finish = response.candidates?.[0]?.finishReason;
  if (finish && finish !== "STOP")
    throw new Error("SCREENING_INCOMPLETE_RESPONSE");
  return validateEvaluation(JSON.parse(response.text || "null"));
}
