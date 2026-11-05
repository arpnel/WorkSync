import "server-only";
import { createClient, type User } from "@supabase/supabase-js";
import { z } from "zod";
import {
  VerificationError,
  assertDiditDatabaseEnvironment,
  decisionSchema,
  diditRequest,
  getDiditEnvironment,
  getDiditWorkflowId,
  hasDiditSessionConfig,
  verificationStatusFor,
  verificationUrl,
} from "@/lib/verification/didit";
import {
  ensureVerificationRequest,
  findVerificationRequest,
  persistVerificationResult,
} from "./verificationPersistence";

// Compatibility/session association only; verification_requests owns workflow state.
// app_metadata is admin-writable; NEVER read a decision from user_metadata.
const stateSchema = z.object({
  session_id: z.string().uuid(),
  workflow_id: z.string().uuid(),
  environment: z.enum(["live", "sandbox"]).optional(),
  url: z.string(),
  status: z.string(),
  verified: z.boolean(),
  created_at: z.number(),
  last_event_id: z.string().optional(),
  last_event_at: z.number().optional(),
});
type State = z.infer<typeof stateSchema>;
function stateOf(user: User): State | null {
  const parsed = stateSchema.safeParse(user.app_metadata?.worksync_didit);
  if (!parsed.success) return null;
  const environment = parsed.data.environment ?? "live";
  if (
    environment !== getDiditEnvironment() ||
    parsed.data.workflow_id !== getDiditWorkflowId()
  )
    return null;
  return { ...parsed.data, environment };
}
function admin() {
  assertDiditDatabaseEnvironment();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new VerificationError("Identity verification is not configured.");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function verificationUser(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!token)
    throw new VerificationError("Sign in to verify your identity.", 401);
  const {
    data: { user },
    error,
  } = await admin().auth.getUser(token);
  if (error || !user)
    throw new VerificationError(
      "Your session expired. Please sign in again.",
      401,
    );
  return user;
}
async function freshUser(id: string) {
  const {
    data: { user },
    error,
  } = await admin().auth.admin.getUserById(id);
  if (error?.status === 404 || (!error && (!user || user.id !== id)))
    throw new VerificationError("Unknown WorkSync verification account.", 404);
  if (error || !user)
    throw new VerificationError("Verification account could not be loaded.");
  return user;
}
async function save(user: User, state: State) {
  const { error } = await admin().auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, worksync_didit: state },
  });
  if (error)
    throw new VerificationError(
      "Verification status could not be saved. Please refresh your status.",
    );
}
async function decisionFor(userId: string, state: State) {
  const parsed = decisionSchema.safeParse(
    await diditRequest(`session/${state.session_id}/decision/`),
  );
  if (
    !parsed.success ||
    parsed.data.vendor_data !== userId ||
    parsed.data.session_id !== state.session_id ||
    parsed.data.workflow_id !== getDiditWorkflowId()
  )
    throw new VerificationError(
      "Verification session does not match this account.",
      409,
    );
  return parsed.data;
}
export async function getAdminDiditIdentity(
  requestId: string,
  expectedUserId: string,
) {
  const db = admin();
  const { data: request, error } = await db
    .from("verification_requests")
    .select(
      "user_id,provider,provider_session_id,workflow_id,status,is_current",
    )
    .eq("request_id", requestId)
    .maybeSingle();
  if (error)
    throw new VerificationError("Verification details could not be loaded.");
  if (
    !request ||
    request.user_id !== expectedUserId ||
    request.provider !== "didit" ||
    request.status !== "approved" ||
    request.is_current !== true
  )
    return null;

  const user = await freshUser(expectedUserId);
  const state = stateOf(user);
  if (
    !state ||
    state.session_id !== request.provider_session_id ||
    state.workflow_id !== request.workflow_id
  )
    return null;

  const decision = await decisionFor(expectedUserId, state);
  if (decision.status !== "Approved") return null;
  const idResult = decision.id_verifications?.find(
    (item) =>
      item.status === "Approved" &&
      (!item.verification_method || item.verification_method === "document"),
  );
  if (!idResult) return null;

  return {
    fullName: idResult.full_name?.trim() || null,
    documentType: idResult.document_type?.trim() || null,
    issuingCountry:
      idResult.issuing_state_name?.trim() ||
      idResult.issuing_state?.trim() ||
      null,
    documentStatus: idResult.status,
    livenessStatuses: (decision.liveness_checks ?? []).map(
      (item) => item.status,
    ),
    faceMatchStatuses: (decision.face_matches ?? []).map(
      (item) => item.status,
    ),
    environment: state.environment,
  };
}
export async function getVerification(user: User) {
  const state = stateOf(user);
  if (!state)
    return {
      status: "Not Started",
      verified: false,
      canStart: hasDiditSessionConfig(),
    };
  const request = await findVerificationRequest(admin(), user.id, state);
  if (request?.status === "revoked")
    return {
      status: "Revoked",
      verified: false,
      canStart: hasDiditSessionConfig(),
    };
  const decision = await decisionFor(user.id, state);
  // A browser callback/poll can show progress, but only the signed webhook
  // can grant verified status. Revocation is reflected immediately on reads.
  return {
    status: decision.status,
    verified:
      request?.is_current === true &&
      request.status === "approved" &&
      verificationStatusFor(decision).profileStatus === "approved",
    canStart: hasDiditSessionConfig(),
  };
}
const running = new Map<string, Promise<unknown>>();
async function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = running.get(key);
  const current = (
    previous ? previous.catch(() => undefined) : Promise.resolve()
  ).then(operation);
  running.set(key, current);
  try {
    return await current;
  } finally {
    if (running.get(key) === current) running.delete(key);
  }
}
export function startVerification(userId: string) {
  return serial(userId, async () => {
    const environment = getDiditEnvironment();
    const workflowId = getDiditWorkflowId();
    if (!hasDiditSessionConfig())
      throw new VerificationError(
        "Identity verification is not fully configured for the selected environment.",
      );
    const user = await freshUser(userId);
    let state = stateOf(user);
    if (state) {
      const previousRequest = await findVerificationRequest(
        admin(),
        user.id,
        state,
      );
      if (
        previousRequest?.status === "revoked" &&
        !previousRequest.is_current
      ) {
        state = null;
      } else {
        await ensureVerificationRequest(admin(), user.id, state);
        const decision = await decisionFor(userId, state);
        if (decision.status !== "Approved") {
          await persistVerificationResult(
            admin(),
            user.id,
            state,
            decision.status,
            verificationStatusFor(decision, false),
          );
        }
        if (decision.status === "Approved")
          throw new VerificationError(
            "Your verification has been submitted. Refresh its status to confirm the result.",
            409,
          );
        if (
          [
            "Not Started",
            "In Progress",
            "Awaiting User",
            "Resubmitted",
          ].includes(decision.status)
        )
          return {
            url: verificationUrl(state.url),
            session_id: state.session_id,
          };
        if (decision.status === "In Review")
          throw new VerificationError(
            "Your identity verification is being reviewed.",
            409,
          );
        if (Date.now() - state.created_at < 60000)
          throw new VerificationError(
            "Please wait a minute before starting another verification.",
            429,
          );
      }
    }
    const conflicts = await admin()
      .from("verification_requests")
      .select("request_id,provider,status,is_current")
      .eq("user_id", user.id)
      .or("is_current.eq.true,status.eq.pending");
    if (conflicts.error)
      throw new VerificationError(
        "Existing verification requests could not be checked.",
      );
    if (
      conflicts.data?.some(
        (row) => row.status === "pending" || row.provider !== "didit",
      )
    )
      throw new VerificationError(
        "An existing verification request must be resolved before starting another.",
        409,
      );
    const callback = process.env.APP_URL
      ? new URL("/verify/done", process.env.APP_URL).toString()
      : undefined;
    const session = z
      .object({ session_id: z.string().uuid(), url: z.string() })
      .parse(
        await diditRequest("session/", {
          workflow_id: workflowId,
          vendor_data: user.id,
          ...(callback ? { callback } : {}),
        }),
      );
    const url = verificationUrl(session.url);
    const nextState: State = {
      session_id: session.session_id,
      workflow_id: workflowId,
      environment,
      url,
      status: "Not Started",
      verified: false,
      created_at: Date.now(),
    };
    // Persist association first so a failed table write is recoverable on retry.
    await save(user, nextState);
    await persistVerificationResult(
      admin(),
      user.id,
      nextState,
      "Not Started",
      {
        requestStatus: "pending",
        profileStatus: "pending",
      },
    );
    return { url, session_id: session.session_id };
  });
}
export const eventSchema = z.object({
  event_id: z.string().uuid(),
  webhook_type: z.string(),
  session_id: z.string().uuid(),
  vendor_data: z.string().uuid(),
  workflow_id: z.string().uuid().optional(),
  timestamp: z.number().finite().int().nonnegative(),
  created_at: z.number().finite().int().nonnegative().optional(),
  environment: z.enum(["live", "sandbox"]),
  sandbox_scenario: z.unknown().optional(),
});
export async function applyVerificationEvent(
  event: z.infer<typeof eventSchema>,
) {
  event = eventSchema.parse(event);
  if (event.webhook_type !== "status.updated")
    throw new VerificationError("Unsupported verification event.", 400);
  if (event.environment !== getDiditEnvironment())
    throw new VerificationError(
      "Verification event environment does not match this application.",
      409,
    );
  return serial(event.vendor_data, async () => {
    let user = await freshUser(event.vendor_data);
    let state = stateOf(user);
    if (
      !state ||
      state.session_id !== event.session_id ||
      state.environment !== event.environment ||
      (event.workflow_id && event.workflow_id !== getDiditWorkflowId())
    )
      throw new VerificationError(
        "Unknown or mismatched verification session.",
        409,
      );
    const storedRequest = await findVerificationRequest(
      admin(),
      user.id,
      state,
    );
    if (
      storedRequest?.status === "revoked" ||
      storedRequest?.is_current === false
    )
      return;
    const eventTime = event.created_at ?? event.timestamp;
    if (
      state.last_event_id === event.event_id ||
      (state.last_event_at ?? 0) > eventTime
    )
      return;
    const decision = await decisionFor(user.id, state);
    // Re-read after the network call so an old session cannot replace a new one.
    user = await freshUser(user.id);
    state = stateOf(user);
    if (
      !state ||
      state.session_id !== event.session_id ||
      state.environment !== event.environment ||
      state.last_event_id === event.event_id ||
      (state.last_event_at ?? 0) > eventTime
    )
      return;
    const mapped = verificationStatusFor(decision);
    await persistVerificationResult(
      admin(),
      user.id,
      state,
      decision.status,
      mapped,
    );
    if (
      state.last_event_id === event.event_id &&
      state.status === decision.status &&
      state.verified === (mapped.profileStatus === "approved")
    )
      return;
    await save(user, {
      ...state,
      status: decision.status,
      verified: mapped.profileStatus === "approved",
      last_event_id: event.event_id,
      last_event_at: event.created_at ?? event.timestamp,
    });
    // Metadata decision/event marker are last: failed table persistence stays retryable.
  });
}
export function verificationResponse(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof VerificationError
          ? error.message
          : "Identity verification is temporarily unavailable.",
    },
    {
      status: error instanceof VerificationError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
