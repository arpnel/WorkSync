/* eslint-disable @typescript-eslint/no-require-imports -- Node TypeScript test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");
function load(path, modules = {}, extra = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (name) =>
        name === "server-only" ? {} : (modules[name] ?? require(name)),
      Buffer,
      URL,
      Response,
      AbortSignal,
      crypto,
      process: {
        env: {
          DIDIT_API_KEY: "test-key",
          DIDIT_WEBHOOK_SECRET: "signing-secret",
          SUPABASE_SERVICE_ROLE_KEY: "server-secret",
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        },
      },
      ...extra,
    },
  );
  return exports;
}
const didit = load("lib/verification/didit.ts");
const persistence = load("services/verification/verificationPersistence.ts", {
  "@/lib/verification/didit": didit,
});
const userId = "11111111-1111-4111-a111-111111111111";
const sessionId = "22222222-2222-4222-a222-222222222222";
const eventId = "33333333-3333-4333-a333-333333333333";
test("V2 webhook authenticates unicode/nested fields and binds signed timestamp", () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = {
    timestamp,
    vendor_data: userId,
    decision: { name: "José", score: 100.0, nested: { z: 1, a: 2 } },
  };
  const signature = crypto
    .createHmac("sha256", "signing-secret")
    .update(didit.canonicalJson(body))
    .digest("hex");
  assert.doesNotThrow(() =>
    didit.verifyDiditWebhook(
      JSON.stringify(body),
      signature,
      String(timestamp),
    ),
  );
  assert.throws(() =>
    didit.verifyDiditWebhook(
      JSON.stringify({ ...body, vendor_data: "attacker" }),
      signature,
      String(timestamp),
    ),
  );
  assert.throws(() =>
    didit.verifyDiditWebhook(
      JSON.stringify(body),
      signature,
      String(timestamp + 1),
    ),
  );
  assert.throws(() =>
    didit.verifyDiditWebhook(
      JSON.stringify(body),
      signature,
      String(timestamp),
      (timestamp + 301) * 1000,
    ),
  );
  assert.throws(() =>
    didit.verifyDiditWebhook("{broken", signature, String(timestamp)),
  );
  assert.throws(() =>
    didit.verifyDiditWebhook(JSON.stringify(body), "f", String(timestamp)),
  );
});
test("workflow approval alone, lookup-only checks, and business decisions do not verify an ID document", () => {
  const approved = {
    status: "Approved",
    id_verifications: [{ status: "Approved", verification_method: "document" }],
  };
  assert.equal(didit.hasApprovedDocument(approved), true);
  assert.equal(
    didit.hasApprovedDocument({ status: "Approved", id_verifications: [] }),
    false,
  );
  assert.equal(
    didit.hasApprovedDocument({ ...approved, status: "Declined" }),
    false,
  );
  assert.equal(
    didit.hasApprovedDocument({ ...approved, session_kind: "business" }),
    false,
  );
  assert.equal(
    didit.hasApprovedDocument({
      status: "Approved",
      id_verifications: [
        { status: "Approved", verification_method: "id_lookup" },
      ],
    }),
    false,
  );
});
test("verification URL rejects lookalikes and insecure origins", () => {
  assert.equal(
    didit.verificationUrl("https://verify.didit.me/session"),
    "https://verify.didit.me/session",
  );
  for (const url of [
    "http://verify.didit.me/session",
    "https://didit.me.attacker.test",
    "javascript:alert(1)",
  ])
    assert.throws(() => didit.verificationUrl(url));
});
function verificationHarness({
  failSave = false,
  vendor = userId,
  status = "Approved",
  verified = false,
  noSession = false,
} = {}) {
  let saves = 0;
  const user = {
    id: userId,
    user_metadata: { verified: true },
    app_metadata: {
      preserved: true,
      worksync_didit: {
        session_id: sessionId,
        workflow_id: didit.DIDIT_WORKFLOW_ID,
        status: "Not Started",
        verified,
        url: "https://verify.didit.me/session",
        created_at: 1,
      },
    },
  };
  const db = {
    ...require("./helpers/verification-db.cjs")(),
    auth: {
      admin: {
        getUserById: async () => ({ data: { user }, error: null }),
        updateUserById: async (_, update) => {
          saves++;
          if (failSave) return { error: {} };
          user.app_metadata = update.app_metadata;
          return { error: null };
        },
      },
    },
  };
  if (noSession) delete user.app_metadata.worksync_didit;
  const server = load("services/verification/verificationServer.ts", {
    "./verificationPersistence": persistence,
    "@supabase/supabase-js": { createClient: () => db },
    "@/lib/verification/didit": {
      ...didit,
      diditRequest: async (path) =>
        path === "session/"
          ? {
              session_id: eventId,
              url: "https://verify.didit.me/new-session",
            }
          : {
              session_id: sessionId,
              workflow_id: didit.DIDIT_WORKFLOW_ID,
              vendor_data: vendor,
              status,
              id_verifications: [
                { status: "Approved", verification_method: "document" },
              ],
            },
    },
  });
  const event = {
    event_id: eventId,
    session_id: sessionId,
    vendor_data: userId,
    workflow_id: didit.DIDIT_WORKFLOW_ID,
    webhook_type: "status.updated",
    timestamp: 1234,
    environment: "live",
  };
  return { user, server, event, db, saves: () => saves };
}
test("browser status poll cannot grant approval from SDK/user metadata", async () => {
  const h = verificationHarness();
  const status = await h.server.getVerification(h.user);
  assert.equal(status.status, "Approved");
  assert.equal(status.verified, false);
  assert.equal(h.saves(), 0);
});
test("webhook saves only minimal state and duplicate event is idempotent", async () => {
  const h = verificationHarness();
  await h.server.applyVerificationEvent(h.event);
  await h.server.applyVerificationEvent(h.event);
  assert.equal(h.saves(), 1);
  assert.equal(h.user.app_metadata.worksync_didit.verified, true);
  assert.equal(h.user.app_metadata.preserved, true);
  assert.equal(h.user.app_metadata.worksync_didit.decision, undefined);
});
test("failed persistence stays retryable without consuming event ID", async () => {
  const h = verificationHarness({ failSave: true });
  await assert.rejects(h.server.applyVerificationEvent(h.event));
  assert.equal(h.user.app_metadata.worksync_didit.last_event_id, undefined);
});
test("old sessions, wrong workflow/vendor, and sandbox events cannot approve", async () => {
  for (const changes of [{ session_id: eventId }, { workflow_id: eventId }]) {
    const h = verificationHarness();
    await assert.rejects(
      h.server.applyVerificationEvent({ ...h.event, ...changes }),
      /session/,
    );
    assert.equal(h.saves(), 0);
  }
  const wrong = verificationHarness({ vendor: "another-user" });
  await assert.rejects(wrong.server.applyVerificationEvent(wrong.event));
  assert.equal(wrong.saves(), 0);
  const sandbox = verificationHarness();
  await sandbox.server.applyVerificationEvent({
    ...sandbox.event,
    environment: "sandbox",
  });
  assert.equal(sandbox.user.app_metadata.worksync_didit.verified, false);
});
test("expired or declined decisions revoke a previously verified identity", async () => {
  for (const status of ["Kyc Expired", "Declined", "Resubmitted"]) {
    const h = verificationHarness({ status, verified: true });
    assert.equal((await h.server.getVerification(h.user)).verified, false);
    await h.server.applyVerificationEvent(h.event);
    assert.equal(h.user.app_metadata.worksync_didit.verified, false);
  }
});

test("provider results synchronize the request and freelancer using only supported statuses", async () => {
  for (const [status, requestStatus, profileStatus] of [
    ["Approved", "approved", "approved"],
    ["Declined", "rejected", "rejected"],
    ["In Review", "pending", "pending"],
    ["In Progress", "pending", "pending"],
    ["Expired", "expired", "pending"],
    ["Kyc Expired", "expired", "pending"],
  ]) {
    const h = verificationHarness({ status });
    h.db.profiles.push({ user_id: userId, verification_status: "pending" });
    await h.server.applyVerificationEvent(h.event);
    await h.server.applyVerificationEvent(h.event);
    assert.equal(h.db.requests.length, 1);
    assert.equal(h.db.requests[0].provider, "didit");
    assert.equal(h.db.requests[0].provider_session_id, sessionId);
    assert.equal(h.db.requests[0].provider_status, status);
    assert.equal(h.db.requests[0].status, requestStatus);
    assert.equal(h.db.requests[0].is_current, true);
    assert.equal(h.db.profiles[0].verification_status, profileStatus);
  }
});
test("profile failure is retryable without another request or consumed metadata event", async () => {
  const h = verificationHarness();
  h.db.profiles.push({ user_id: userId, verification_status: "pending" });
  h.db.failures.push({
    table: "freelancer_profiles",
    op: "update",
    code: "42501",
  });
  await assert.rejects(
    h.server.applyVerificationEvent(h.event),
    /synchronized/,
  );
  assert.equal(h.user.app_metadata.worksync_didit.last_event_id, undefined);
  await h.server.applyVerificationEvent(h.event);
  assert.equal(h.db.requests.length, 1);
  assert.equal(h.db.profiles[0].verification_status, "approved");
  assert.equal(h.saves(), 1);
});
test("request failure never changes freelancer status or marks rejection", async () => {
  const h = verificationHarness();
  h.db.profiles.push({ user_id: userId, verification_status: "pending" });
  h.db.failures.push({
    table: "verification_requests",
    op: "insert",
    code: "23514",
  });
  await assert.rejects(
    h.server.applyVerificationEvent(h.event),
    /synchronized/,
  );
  assert.equal(h.db.requests.length, 0);
  assert.equal(h.db.profiles[0].verification_status, "pending");
  assert.equal(h.saves(), 0);
});
test("new sessions are tracked and pending sessions are reused", async () => {
  const h = verificationHarness({ noSession: true });
  h.db.profiles.push({ user_id: userId, verification_status: "rejected" });
  await h.server.startVerification(userId);
  assert.equal(h.db.requests[0].provider_session_id, eventId);
  assert.equal(h.db.requests[0].status, "pending");
  assert.equal(h.db.profiles[0].verification_status, "pending");
  const resumed = verificationHarness({ status: "In Progress" });
  await resumed.server.startVerification(userId);
  await resumed.server.startVerification(userId);
  assert.equal(resumed.db.requests.length, 1);
});
test("expired sessions release the current slot and a pending manual review is preserved", async () => {
  const h = verificationHarness({ status: "Expired" });
  await h.server.startVerification(userId);
  assert.equal(h.db.requests.length, 2);
  assert.equal(h.db.requests[0].status, "expired");
  assert.equal(h.db.requests[0].is_current, false);
  assert.equal(h.db.requests[1].is_current, true);
  const blocked = verificationHarness({ noSession: true });
  blocked.db.requests.push({
    user_id: userId,
    provider: "manual",
    status: "pending",
    is_current: true,
  });
  await assert.rejects(
    blocked.server.startVerification(userId),
    /existing verification/,
  );
  assert.equal(blocked.saves(), 0);
  assert.equal(blocked.db.requests.length, 1);
});
test("concurrent registration uses the session unique key and rejects a mismatched owner", async () => {
  const db = require("./helpers/verification-db.cjs")();
  const session = {
    session_id: sessionId,
    workflow_id: didit.DIDIT_WORKFLOW_ID,
    url: "https://verify.didit.me/session",
  };
  await Promise.all([
    persistence.ensureVerificationRequest(db, userId, session),
    persistence.ensureVerificationRequest(db, userId, session),
  ]);
  assert.equal(db.requests.length, 1);
  await assert.rejects(
    persistence.ensureVerificationRequest(db, eventId, session),
    /association/,
  );
});
test("unknown sessions and unsupported events never write verification data", async () => {
  const h = verificationHarness({ noSession: true });
  await assert.rejects(h.server.applyVerificationEvent(h.event), /session/);
  await assert.rejects(
    h.server.applyVerificationEvent({ ...h.event, webhook_type: "other" }),
    /Unsupported/,
  );
  assert.equal(h.db.requests.length, 0);
});
test("signed malformed and invalid-signature webhook requests are rejected at the route", async () => {
  const h = verificationHarness();
  const route = load("app/api/webhooks/didit/route.ts", {
    "@/lib/verification/didit": didit,
    "@/services/verification/verificationServer": h.server,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const body = { timestamp, webhook_type: "status.updated" };
  const signature = crypto
    .createHmac("sha256", "signing-secret")
    .update(didit.canonicalJson(body))
    .digest("hex");
  for (const [signed, expected] of [
    [signature, 400],
    ["0".repeat(64), 401],
  ]) {
    const response = await route.POST(
      new Request("https://example.com/api/webhooks/didit", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "x-signature-v2": signed, "x-timestamp": String(timestamp) },
      }),
    );
    assert.equal(response.status, expected);
  }
  assert.equal(h.db.requests.length, 0);
});
const constants = load("constants/account-setup.constants.ts");
const validation = load("lib/validation/account-setup.validation.ts", {
  "@/constants/account-setup.constants": constants,
  "@jobuntux/psgc": {
    listProvinces: () => [{ provName: "Cebu", provCode: "CEB" }],
    listMuncities: () => [{ munCityName: "Cebu City" }],
  },
});
const profile = {
  firstName: " Ana ",
  lastName: " Cruz ",
  display_name: " Ana ",
  province: "Cebu",
  city: "Cebu City",
  englishProficiency: "fluent",
  shortBio: "Professional profile description.",
  profilePhoto: null,
  existingAvatarUrl: "saved-avatar",
  skills: ["skill"],
  industries: ["industry"],
  yearsOfExperience: 0,
  employmentPreference: "contract",
  portfolioWebsite: "",
  linkedIn: "",
  github: "",
  resume: null,
  existingResumeUrl: "saved-resume",
  portfolioSamples: [],
  existingPortfolioSamples: ["saved-sample"],
  certifications: [],
};
test("saved files and zero years of experience support resumed setup without reuploads", () => {
  const result = validation.validateFreelancerSetup(profile);
  assert.equal(result.ok, true);
  assert.equal(result.data.firstName, "Ana");
  assert.equal(result.data.yearsOfExperience, 0);
});
test("professional setup fields validate and preserve optional empty rates", () => {
  const valid = validation.validateFreelancerSetup({
    ...profile,
    headline: " Web developer ",
    hourlyRate: " 350.50 ",
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.data.headline, "Web developer");
  assert.equal(valid.data.hourlyRate, "350.50");
  for (const hourlyRate of ["-1", "0", "NaN", "Infinity"]) {
    const result = validation.validateFreelancerSetup({
      ...profile,
      hourlyRate,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.hourlyRate);
  }
  assert.equal(
    validation.validateFreelancerSetup({
      ...profile,
      headline: "a".repeat(121),
    }).ok,
    false,
  );
});
test("invalid location, dropdown values, fractional experience and lookalike URLs are rejected", () => {
  for (const changes of [
    { city: "Other city" },
    { province: "Fake" },
    { englishProficiency: "made-up" },
    { employmentPreference: "fake" },
    { yearsOfExperience: NaN },
    { yearsOfExperience: 0.5 },
    { github: "https://github.com.attacker.test" },
    { linkedIn: "javascript:alert(1)" },
  ])
    assert.equal(
      validation.validateFreelancerSetup({ ...profile, ...changes }).ok,
      false,
    );
});
test("files enforce allowed MIME, nonzero size and size limits", () => {
  assert.equal(
    validation.validateSetupFile(
      { type: "application/pdf", size: 123 },
      "resume",
    ),
    undefined,
  );
  assert.ok(
    validation.validateSetupFile({ type: "image/svg+xml", size: 123 }, "photo"),
  );
  assert.ok(
    validation.validateSetupFile(
      { type: "application/pdf", size: 0 },
      "resume",
    ),
  );
  assert.ok(
    validation.validateSetupFile(
      { type: "image/png", size: 6 * 1024 * 1024 },
      "photo",
    ),
  );
});
function setupHarness(failureTable) {
  const writes = [];
  const db = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from(table) {
      let operation = "select",
        values;
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        in() {
          return query;
        },
        upsert(v) {
          operation = "upsert";
          values = v;
          return query;
        },
        update(v) {
          operation = "update";
          values = v;
          return query;
        },
        insert(v) {
          operation = "insert";
          values = v;
          return query;
        },
        delete() {
          operation = "delete";
          return query;
        },
        single: () => result(),
        maybeSingle: () => result(),
        then: (resolve, reject) => result().then(resolve, reject),
      };
      async function result() {
        if (operation !== "select") {
          writes.push({ table, operation, values });
          if (table === failureTable)
            return { data: null, error: { message: "Simulated failure" } };
        }
        const data =
          table === "freelancer_profiles"
            ? {
                freelancer_id: "freelancer",
                portfolio_sample_urls: ["saved-sample"],
                certification_urls: [],
              }
            : table === "freelancer_categories"
              ? [{ category_id: "industry" }]
              : table === "freelancer_skills"
                ? [{ skill_id: "skill" }]
                : { user_id: userId };
        return { data, error: null };
      }
      return query;
    },
  };
  return {
    writes,
    service: load("components/accountsetup/service/accountSetup.service.ts", {
      "@/lib/supabaseClient": { supabase: db },
      "@/lib/validation/account-setup.validation": validation,
    }),
  };
}
test("setup completion is last, role matches selection, and existing relationships/files are preserved", async () => {
  const h = setupHarness();
  await h.service.submitFreelancerSetup(profile);
  assert.equal(h.writes.at(-1).values.account_setup_completed, true);
  assert.equal(h.writes.at(-2).values.role, "freelancer");
  assert.equal(
    h.writes.filter((w) =>
      ["freelancer_skills", "freelancer_categories"].includes(w.table),
    ).length,
    0,
  );
  assert.equal(h.writes[0].values.avatar_url, undefined);
  const freelancer = h.writes.find((w) => w.table === "freelancer_profiles");
  assert.equal(freelancer.values.resume_url, undefined);
  assert.equal(freelancer.values.government_id_url, undefined);
});
test("a failed role-profile save never marks setup complete", async () => {
  const h = setupHarness("freelancer_profiles");
  await assert.rejects(h.service.submitFreelancerSetup(profile));
  assert.equal(
    h.writes.some((w) => w.values?.account_setup_completed === true),
    false,
  );
});

test("setup writes location and professional fields to their profile tables", async () => {
  const h = setupHarness();
  await h.service.submitFreelancerSetup({
    ...profile,
    headline: " Web developer ",
    hourlyRate: "350.50",
  });
  const shared = h.writes.find((write) => write.values?.city === "Cebu City");
  const professional = h.writes.find(
    (write) => write.values?.headline === "Web developer",
  );
  assert.equal(shared.values.location, "Cebu City, Cebu");
  assert.equal(professional.values.hourly_rate, 350.5);
  assert.equal(shared.values.headline, undefined);
});
