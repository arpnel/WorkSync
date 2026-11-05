import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export type DiditEnvironment = "sandbox" | "live";

export class VerificationError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}

export function getDiditEnvironment(): DiditEnvironment {
  const environment = process.env.DIDIT_ENVIRONMENT;
  if (environment === "sandbox" || environment === "live") return environment;
  throw new VerificationError(
    "Identity verification environment is not configured.",
  );
}

function diditVariable(suffix: "API_KEY" | "WORKFLOW_ID" | "WEBHOOK_SECRET") {
  const environment = getDiditEnvironment();
  const prefix = environment === "sandbox" ? "DIDIT_SANDBOX" : "DIDIT_LIVE";
  return process.env[`${prefix}_${suffix}`];
}

export function getDiditWorkflowId() {
  const workflowId = diditVariable("WORKFLOW_ID");
  if (!workflowId || !z.string().uuid().safeParse(workflowId).success)
    throw new VerificationError(
      "Identity verification is not configured for the selected environment.",
    );
  return workflowId;
}

export function hasDiditSessionConfig() {
  try {
    return (
      !!diditVariable("API_KEY") &&
      !!getDiditWorkflowId() &&
      !!diditVariable("WEBHOOK_SECRET")
    );
  } catch {
    return false;
  }
}

export function assertDiditDatabaseEnvironment() {
  if (getDiditEnvironment() !== "sandbox") return;

  const configuredProjectRef = process.env.DIDIT_SANDBOX_SUPABASE_PROJECT_REF;
  let connectedProjectRef: string | null = null;
  try {
    const hostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
      .hostname;
    if (hostname.endsWith(".supabase.co")) {
      connectedProjectRef = hostname.slice(0, -".supabase.co".length);
    } else if (["localhost", "127.0.0.1", "::1"].includes(hostname)) {
      connectedProjectRef = "local";
    }
  } catch {
    // Fail closed below when the configured database URL is missing or invalid.
  }

  if (
    process.env.VERCEL_ENV === "production" ||
    !configuredProjectRef ||
    connectedProjectRef !== configuredProjectRef ||
    !connectedProjectRef
  )
    throw new VerificationError(
      "Sandbox verification requires a matching Supabase project reference and a nonproduction deployment.",
      503,
    );
}
export const diditStatus = z.enum([
  "Not Started",
  "In Progress",
  "Awaiting User",
  "In Review",
  "Approved",
  "Declined",
  "Resubmitted",
  "Abandoned",
  "Expired",
  "Kyc Expired",
]);
export const decisionSchema = z.object({
  session_id: z.string().uuid(),
  workflow_id: z.string().uuid(),
  vendor_data: z.string(),
  status: diditStatus,
  session_kind: z.string().optional(),
  id_verifications: z
    .array(
      z.object({
        status: z.string(),
        verification_method: z.string().nullish(),
        document_type: z.string().nullish(),
        issuing_state: z.string().nullish(),
        issuing_state_name: z.string().nullish(),
        full_name: z.string().nullish(),
      }),
    )
    .nullish(),
  liveness_checks: z.array(z.object({ status: z.string() })).nullish(),
  face_matches: z.array(z.object({ status: z.string() })).nullish(),
});
export type DiditDecision = z.infer<typeof decisionSchema>;
export function hasApprovedDocument(decision: DiditDecision) {
  return (
    decision.status === "Approved" &&
    decision.session_kind !== "business" &&
    !!decision.id_verifications?.some(
      (item) =>
        item.status === "Approved" &&
        (!item.verification_method || item.verification_method === "document"),
    )
  );
}
export function verificationStatusFor(
  decision: DiditDecision,
  allowApproval = true,
) {
  if (decision.status === "Declined")
    return { requestStatus: "rejected", profileStatus: "rejected" } as const;
  if (["Expired", "Kyc Expired", "Abandoned"].includes(decision.status))
    return { requestStatus: "expired", profileStatus: "pending" } as const;
  if (allowApproval && hasApprovedDocument(decision))
    return { requestStatus: "approved", profileStatus: "approved" } as const;
  return { requestStatus: "pending", profileStatus: "pending" } as const;
}
export async function diditRequest(
  path: string,
  body?: Record<string, unknown>,
) {
  const operation = path.endsWith("/decision/")
    ? "decision_lookup"
    : "session_create";
  const key = diditVariable("API_KEY");
  if (!key)
    throw new VerificationError(
      "Identity verification is not available yet. Please try again later.",
    );
  let response: Response;
  try {
    response = await fetch(`https://verification.didit.me/v3/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "x-api-key": key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch (cause) {
    console.error("Didit request could not reach provider", {
      operation,
      error: cause instanceof Error ? cause.name : "unknown",
    });
    throw new VerificationError(
      "The identity verification service could not be reached. Please try again.",
    );
  }
  if (!response.ok) {
    const providerError = await safeDiditError(response);
    console.error("Didit request was rejected", {
      operation,
      providerStatus: response.status,
      providerCode: providerError.code,
      providerFields: providerError.fields,
    });
    const operationLabel =
      operation === "session_create"
        ? "session creation"
        : "session status check";
    const providerDetail = [
      `HTTP ${response.status}`,
      providerError.code ? `code ${providerError.code}` : null,
      providerError.fields.length
        ? `fields ${providerError.fields.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("; ");
    const message =
      response.status === 401 || response.status === 403
        ? `Didit rejected ${operationLabel} (${providerDetail}). Check the server API key and workflow permissions.`
        : response.status === 404
          ? `Didit could not find the workflow or session for ${operationLabel} (${providerDetail}). Check that the workflow and API key belong to the same Didit workspace.`
          : response.status === 400 || response.status === 422
            ? `Didit rejected ${operationLabel} (${providerDetail}). Check the workflow configuration and the reported fields.`
            : response.status === 429
              ? "The identity verification service is busy. Please wait a moment and try again."
              : response.status >= 500
                ? "The identity verification service is temporarily unavailable. Please try again shortly."
                : `The identity verification service could not accept ${operationLabel} (${providerDetail}). Please refresh and try again.`;
    throw new VerificationError(message);
  }
  return response.json();
}

async function safeDiditError(response: Response) {
  const allowedFieldNames = new Set([
    "workflow_id",
    "callback",
    "vendor_data",
    "callback_method",
    "features",
    "metadata",
  ]);
  try {
    const payload: unknown = await response.clone().json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return { code: null, fields: [] as string[] };

    const root = payload as Record<string, unknown>;
    const codeValue = root.error_code ?? root.code;
    const code =
      typeof codeValue === "string" && /^[a-z\d_.-]{1,64}$/i.test(codeValue)
        ? codeValue
        : null;
    const fields = new Set<string>();
    const collectFields = (value: unknown, depth: number) => {
      if (!value || typeof value !== "object" || depth > 2) return;
      if (Array.isArray(value)) {
        value.slice(0, 8).forEach((item) => collectFields(item, depth + 1));
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (allowedFieldNames.has(key)) fields.add(key);
        if (
          (key === "field" || key === "parameter" || key === "param") &&
          typeof child === "string" &&
          allowedFieldNames.has(child)
        )
          fields.add(child);
        if (fields.size >= 6) return;
        collectFields(child, depth + 1);
      }
    };
    collectFields(root.errors ?? root.details ?? root, 0);
    return { code, fields: [...fields] };
  } catch {
    return { code: null, fields: [] as string[] };
  }
}
export function verificationUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !(url.hostname === "didit.me" || url.hostname.endsWith(".didit.me"))
  )
    throw new VerificationError(
      "The verification service returned an invalid URL.",
    );
  return url.toString();
}
// Serialize explicitly: JSON.stringify(object) reorders integer-like keys even
// after sorting. Arrays retain order; JSON.parse normalizes whole-valued floats.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export function verifyDiditWebhook(
  raw: string,
  signature: string | null,
  timestamp: string | null,
  now = Date.now(),
  previousSignature: string | null = null,
) {
  const environment = getDiditEnvironment();
  const prefix = environment === "sandbox" ? "DIDIT_SANDBOX" : "DIDIT_LIVE";
  const secret = process.env[`${prefix}_WEBHOOK_SECRET`];
  const previousSecret = process.env[`${prefix}_WEBHOOK_SECRET_PREVIOUS`];
  if (!secret)
    throw new VerificationError("Verification webhook is not configured.");
  if (
    !/^\d+$/.test(timestamp ?? "") ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    (!/^[a-f\d]{64}$/i.test(signature ?? "") &&
      !/^[a-f\d]{64}$/i.test(previousSignature ?? ""))
  )
    throw new VerificationError("Invalid webhook signature.", 401);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new VerificationError("Invalid webhook JSON.", 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("timestamp" in body) ||
    body.timestamp !== Number(timestamp)
  )
    throw new VerificationError(
      "Webhook timestamp does not match its signed payload.",
      401,
    );
  const expected = createHmac("sha256", secret)
    .update(canonicalJson(body), "utf8")
    .digest();
  const currentMatches =
    /^[a-f\d]{64}$/i.test(signature ?? "") &&
    timingSafeEqual(expected, Buffer.from(signature!, "hex"));
  const previousMatches =
    !!previousSecret &&
    /^[a-f\d]{64}$/i.test(previousSignature ?? "") &&
    timingSafeEqual(
      createHmac("sha256", previousSecret)
        .update(canonicalJson(body), "utf8")
        .digest(),
      Buffer.from(previousSignature!, "hex"),
    );
  if (!currentMatches && !previousMatches)
    throw new VerificationError("Invalid webhook signature.", 401);
  return body;
}
