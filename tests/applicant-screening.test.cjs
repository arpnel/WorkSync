/* eslint-disable @typescript-eslint/no-require-imports -- Node TypeScript test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(path, modules, extra = {}) {
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
      require: (name) => modules[name] ?? require(name),
      console: { error() {} },
      ...extra,
    },
  );
  return exports;
}
const rubric = load("lib/ai/screening.ts", {});
function submission({ authenticated = true, fail = false } = {}) {
  const queued = [],
    calls = [],
    screened = [];
  const db = {
    auth: {
      getUser: async () => ({
        data: { user: authenticated ? { id: "applicant" } : null },
        error: null,
      }),
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return fail
        ? { error: { code: "23505", message: "Already applied" }, data: null }
        : { error: null, data: "created-application" };
    },
  };
  const route = load(
    "app/api/applications/route.ts",
    {
      "next/server": { after: (callback) => queued.push(callback) },
      "@supabase/supabase-js": { createClient: () => db },
      "@/services/project/automaticScreeningServer": {
        screenNewApplication: async (...args) => screened.push(args),
      },
    },
    { Response, process: { env: {} } },
  );
  const run = () =>
    route.POST(
      new Request("https://worksync.test/api/applications", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: "11111111-1111-4111-8111-111111111111",
          proposal: "A relevant proposal",
          price: 500,
          days: 7,
        }),
      }),
    );
  return { run, queued, calls, screened };
}
test("submission returns success before screening and schedules only the created application", async () => {
  const f = submission();
  const response = await f.run();
  assert.equal(response.status, 201);
  assert.equal((await response.json()).applicationId, "created-application");
  assert.equal(f.screened.length, 0);
  assert.equal(f.queued.length, 1);
  assert.equal(f.calls[0].args.p_proposed_price, 500);
  assert.equal(f.calls[0].args.p_estimated_days, 7);
  assert.ok(f.calls[0].args.p_job_id);
  await f.queued[0]();
  assert.deepEqual(f.screened[0], ["created-application", "applicant"]);
});
test("unauthenticated or rejected applications never schedule screening", async () => {
  for (const options of [{ authenticated: false }, { fail: true }]) {
    const f = submission(options);
    const response = await f.run();
    assert.ok(response.status >= 400);
    assert.equal(f.queued.length, 0);
    if (!options.authenticated && !options.fail)
      assert.equal(f.calls.length, 0);
  }
});
test("background work verifies the applicant and derives the owner instead of accepting browser identities", async () => {
  for (const match of [true, false]) {
    const calls = [];
    const db = {
      from(table) {
        const q = {
          select() {
            return q;
          },
          eq() {
            return q;
          },
          single: async () => ({
            error: null,
            data: {
              job_applications: { job_id: "job", freelancer_id: "freelancer" },
              freelancer_profiles: {
                user_id: match ? "applicant" : "unrelated",
              },
              jobs: { client_id: "client" },
              client_profiles: { user_id: "real-owner" },
            }[table],
          }),
        };
        return q;
      },
    };
    const worker = load(
      "services/project/automaticScreeningServer.ts",
      {
        "server-only": {},
        "@supabase/supabase-js": { createClient: () => db },
        "./applicantScreeningServer": {
          screenApplicant: async (...args) => {
            calls.push(args);
            throw new Error("Provider failed");
          },
        },
      },
      {
        process: {
          env: { GEMINI_API_KEY: "test", SUPABASE_SERVICE_ROLE_KEY: "test" },
        },
      },
    );
    await worker.screenNewApplication("created-application", "applicant");
    assert.equal(calls.length, match ? 1 : 0);
    if (match)
      assert.deepEqual(calls[0].slice(1), [
        "real-owner",
        "created-application",
        "applicant",
      ]);
  }
});
const valid = () => ({
  dimensions: {
    skills: 100,
    experience: 75,
    proposal: 80,
    capability: 70,
    delivery: 50,
    pricing: 50,
  },
  strengths: ["Relevant skills"],
  weaknesses: ["Delivery not specified"],
  recommendation: "Review the submitted evidence.",
});
test("fixed rubric computes weighted integer job match and label", () => {
  const result = rubric.validateEvaluation(valid());
  assert.equal(result.score, 82);
  assert.equal(result.result, "Strong Match");
});
test("invalid, fractional, excessive and injected output is rejected", () => {
  for (const value of [-1, 101, 75.5, "90", null]) {
    const response = valid();
    response.dimensions.skills = value;
    assert.throws(() => rubric.validateEvaluation(response));
  }
  assert.throws(() => rubric.validateEvaluation({ ...valid(), score: 100 }));
  assert.throws(() =>
    rubric.validateEvaluation({ ...valid(), recommendation: "x".repeat(301) }),
  );
  assert.throws(() =>
    rubric.validateEvaluation({
      ...valid(),
      strengths: Array(5).fill("Skill"),
    }),
  );
});
test("legacy labels and metadata labels render; contacts are redacted", () => {
  assert.equal(rubric.screeningLabel("Strong Match"), "Strong Match");
  assert.equal(
    rubric.screeningLabel(
      JSON.stringify({
        version: rubric.RUBRIC_VERSION,
        label: "Potential Match",
        inputHash: "secret-hash",
      }),
    ),
    "Potential Match",
  );
  const text = rubric.redactScreeningText(
    "React developer: test@example.com https://private.example/resume +639171234567",
  );
  assert.ok(text.includes("React developer"));
  assert.ok(!text.includes("example") && !text.includes("9171234567"));
});
function fixture({
  owner = true,
  malformed = false,
  persistenceError = false,
  changeDuringEvaluation = false,
} = {}) {
  const calls = { evaluations: 0, saves: 0, input: null };
  let saved = null;
  const application = {
    application_id: "application",
    job_id: "job",
    freelancer_id: "freelancer",
    screening_id: null,
    proposal: "I build React applications",
    proposed_price: 500,
    estimated_days: 7,
    created_at: "2026-09-01",
    updated_at: "2026-09-01",
  };
  const job = {
    job_id: "job",
    client_id: "client",
    title: "React UI",
    description: "Build UI",
    category_id: "category",
    budget_min: 400,
    budget_max: 600,
    updated_at: "2026-09-01",
  };
  const db = {
    from(table) {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        in() {
          return q;
        },
        single() {
          return q;
        },
        maybeSingle() {
          return q;
        },
        then(resolve) {
          const data = {
            job_applications: { ...application },
            jobs: { ...job },
            client_profiles: owner ? { client_id: "client" } : null,
            freelancer_profiles: {
              headline: "Developer",
              years_of_experience: 3,
              employment_preference: "contract",
            },
            job_skills: [{ skill_id: "react" }],
            freelancer_skills: [{ skill_id: "react" }],
            skills: [{ id: "react", name: "React" }],
            job_categories: { name: "Development" },
            screening_results: saved,
          }[table];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  const service = load(
    "services/project/applicantScreeningServer.ts",
    {
      "server-only": {},
      "@/lib/ai/screening": rubric,
      "@/lib/ai/gemini": {
        screeningModel: () => "test-model",
        evaluateApplicant: async (input) => {
          calls.evaluations++;
          calls.input = input;
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (changeDuringEvaluation) application.proposal = "Changed proposal";
          return rubric.validateEvaluation(malformed ? {} : valid());
        },
      },
      "@supabase/supabase-js": {
        createClient: () => ({
          rpc: async (name, args) => {
            calls.saves++;
            if (persistenceError)
              return { error: { code: "42501" }, data: null };
            saved = {
              score: args.p_score,
              result: args.p_result,
              strengths: args.p_strengths,
              weaknesses: args.p_weaknesses,
              recommendation: args.p_recommendation,
              screened_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 86400000).toISOString(),
            };
            application.screening_id = "saved";
            return { data: saved, error: null };
          },
        }),
      },
    },
    {
      process: {
        env: {
          GEMINI_API_KEY: "test",
          SUPABASE_SERVICE_ROLE_KEY: "test",
          NEXT_PUBLIC_SUPABASE_URL: "test",
        },
      },
    },
  );
  return {
    calls,
    application,
    run: () => service.screenApplicant(db, "owner", "application"),
  };
}
test("non-owner cannot call Gemini or save a screening", async () => {
  const f = fixture({ owner: false });
  await assert.rejects(f.run, /Only the job owner/);
  assert.equal(f.calls.evaluations, 0);
  assert.equal(f.calls.saves, 0);
});
test("simultaneous requests coalesce; unchanged persisted results are reused", async () => {
  const f = fixture();
  await Promise.all([f.run(), f.run()]);
  assert.equal(f.calls.evaluations, 1);
  assert.equal(f.calls.saves, 1);
  assert.equal((await f.run()).cached, true);
  assert.equal(f.calls.evaluations, 1);
  assert.ok(!JSON.stringify(f.calls.input).includes("freelancer_id"));
  f.application.proposal = "Updated professional proposal";
  await f.run();
  assert.equal(f.calls.evaluations, 2);
});
test("malformed output and changed input are never saved", async () => {
  for (const options of [
    { malformed: true },
    { changeDuringEvaluation: true },
  ]) {
    const f = fixture(options);
    await assert.rejects(f.run);
    assert.equal(f.calls.saves, 0);
  }
});
test("save failure does not return an unsaved score and can be retried", async () => {
  const f = fixture({ persistenceError: true });
  await assert.rejects(f.run, /could not be saved/);
  await assert.rejects(f.run, /could not be saved/);
  assert.equal(f.application.screening_id, null);
  assert.equal(f.calls.saves, 2);
});

test("Gemini adapter can load without credentials and checks them only when screening", async () => {
  const adapter = load(
    "lib/ai/gemini.ts",
    {
      "server-only": {},
      "@google/genai": { GoogleGenAI: class {} },
      "./screening": rubric,
    },
    { process: { env: {} } },
  );
  assert.equal(typeof adapter.screeningModel, "function");
  assert.equal(typeof adapter.evaluateApplicant, "function");
  await assert.rejects(
    adapter.evaluateApplicant({}),
    /SCREENING_CONFIGURATION/,
  );
});

test("Gemini adapter validates structured output and computes the score locally", async () => {
  let request;
  const adapter = load(
    "lib/ai/gemini.ts",
    {
      "server-only": {},
      "@google/genai": {
        GoogleGenAI: class {
          models = {
            generateContent: async (input) => {
              request = input;
              return {
                text: JSON.stringify({
                  dimensions: Object.fromEntries(
                    Object.keys(rubric.weights).map((key) => [key, 80]),
                  ),
                  strengths: ["Relevant skills"],
                  weaknesses: [],
                  recommendation: "Review the proposal.",
                }),
              };
            },
          };
        },
      },
      "./screening": rubric,
    },
    {
      process: { env: { GEMINI_API_KEY: "test", GEMINI_MODEL: "test-model" } },
    },
  );
  const result = await adapter.evaluateApplicant({ proposal: "Example" });
  assert.equal(request.model, "test-model");
  assert.equal(request.config.responseMimeType, "application/json");
  assert.equal(result.score, 80);
  assert.equal(result.result, "Strong Match");
});
