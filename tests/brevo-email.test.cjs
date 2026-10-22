/* eslint-disable @typescript-eslint/no-require-imports -- Node TypeScript test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
function load(path, modules = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path, "utf8") && ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name) => name === "server-only" ? {} : (modules[name] ?? require(name)), Response, Request, URL, AbortSignal, process, console, ...globals });
  return exports;
}
const templates = load("lib/email/workSyncEmail.ts");
test("WorkSync email generation provides responsive HTML, text, escaped content, and stable Brevo idempotency keys", () => {
  const input = { kind: "payment_confirmed", eventId: "payment-confirmed:123", recipientEmail: "client@example.com", recipientName: "<Alex>", subject: "Payment & receipt", heading: "Payment received", message: "Project <one> paid", actionLabel: "View receipt", actionUrl: "https://worksync.test/home/projects?a=1&b=2" };
  const payload = templates.createBrevoEmailPayload(input, { email: "sender@example.com", name: "WorkSync" });
  assert.match(payload.htmlContent, /name="viewport"/);
  assert.match(payload.htmlContent, /&lt;Alex&gt;/);
  assert.match(payload.htmlContent, /Project &lt;one&gt; paid/);
  assert.match(payload.textContent, /View receipt: https:\/\/worksync.test/);
  assert.match(payload.headers["Idempotency-Key"], /^[a-f0-9-]{36}$/);
  assert.equal(payload.headers["Idempotency-Key"], templates.emailIdempotencyKey(input.eventId));
  assert.equal(payload.to[0].email, input.recipientEmail);
});
test("server email sender keeps API key in header and treats Brevo idempotent replay as accepted", async () => {
  const old = { ...process.env };
  Object.assign(process.env, { BREVO_API_KEY: "private-api-key", BREVO_SENDER_EMAIL: "sender@example.com", BREVO_SENDER_NAME: "WorkSync" });
  let request;
  const service = load("services/email/brevoEmailService.ts", { "@supabase/supabase-js": { createClient() { throw new Error("unexpected DB access"); } }, "@/lib/email/workSyncEmail": templates }, { fetch: async (url, options) => { request = { url, options }; return { ok: false, status: 400, json: async () => ({ code: "duplicate_parameter" }) }; } });
  await service.sendWorkSyncEmail({ kind: "payment_confirmed", eventId: "payment:1", recipientEmail: "person@example.com", subject: "Paid", heading: "Payment received", message: "Verified", actionLabel: "Receipt", actionUrl: "https://worksync.test/receipt" });
  assert.equal(request.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(request.options.headers["api-key"], "private-api-key");
  assert.equal(JSON.parse(request.options.body).to[0].email, "person@example.com");
  assert.equal(JSON.parse(request.options.body).headers["Idempotency-Key"], templates.emailIdempotencyKey("payment:1"));
  for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key];
  Object.assign(process.env, old);
});
test("application decision route rejects unauthorized requests and sends no email when the RPC rejects", async () => {
  let callbacks = [];
  let emailCount = 0;
  const module = load("app/api/applications/[applicationId]/respond/route.ts", {
    "next/server": { after: (fn) => callbacks.push(fn) },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "client" } }, error: null }) }, rpc: async () => ({ data: null, error: { message: "Only the job owner can respond" } }) }) },
    "@/services/email/applicationEmails": { notifyJobApplicationDecision: async () => { emailCount++; } },
  });
  const unauth = await module.POST(new Request("https://worksync.test/api/respond", { method: "POST", body: JSON.stringify({ accepted: true }) }), { params: Promise.resolve({ applicationId: "6e7a6aba-1d67-45e7-b839-8e4febff8494" }) });
  assert.equal(unauth.status, 401);
  const denied = await module.POST(new Request("https://worksync.test/api/respond", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify({ accepted: true }) }), { params: Promise.resolve({ applicationId: "6e7a6aba-1d67-45e7-b839-8e4febff8494" }) });
  assert.equal(denied.status, 400);
  assert.equal(callbacks.length, 0);
  assert.equal(emailCount, 0);
});
test("successful application response schedules one notification email after the authorized RPC", async () => {
  const callbacks = [];
  const sent = [];
  const route = load("app/api/applications/[applicationId]/respond/route.ts", {
    "next/server": { after: (fn) => callbacks.push(fn) },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "client" } }, error: null }) }, rpc: async () => ({ data: "conversation-id", error: null }) }) },
    "@/services/email/applicationEmails": { notifyJobApplicationDecision: async (...args) => sent.push(args) },
  });
  const response = await route.POST(new Request("https://worksync.test/api/respond", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify({ accepted: true }) }), { params: Promise.resolve({ applicationId: "6e7a6aba-1d67-45e7-b839-8e4febff8494" }) });
  assert.equal(response.status, 200);
  assert.equal(callbacks.length, 1);
  await callbacks[0]();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "6e7a6aba-1d67-45e7-b839-8e4febff8494");
  assert.equal(sent[0][1], true);
});

test("successful job application creation schedules email only after the existing RPC succeeds", async () => {
  const callbacks = [];
  const sent = [];
  const route = load("app/api/applications/route.ts", {
    "next/server": { after: (fn) => callbacks.push(fn) },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "freelancer" } }, error: null }) }, rpc: async () => ({ data: "app-id", error: null }) }) },
    "@/services/project/automaticScreeningServer": { screenNewApplication: async () => {} },
    "@/services/email/applicationEmails": { notifyJobApplicationReceived: async (...args) => sent.push(args) },
  });
  const response = await route.POST(new Request("https://worksync.test/api/applications", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify({ jobId: "6e7a6aba-1d67-45e7-b839-8e4febff8494", proposal: "I can deliver this work", price: 100, days: 5 }) }));
  assert.equal(response.status, 201);
  const emailCallback = callbacks.find((fn) => fn.constructor.name === "AsyncFunction");
  await emailCallback();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "app-id");
  assert.equal(sent[0][1], "freelancer");
});
test("missing Brevo configuration is reported by variable name without contacting Brevo", async () => {
  const oldValues = Object.fromEntries(["BREVO_API_KEY", "BREVO_SENDER_EMAIL", "BREVO_SENDER_NAME"].map((key) => [key, process.env[key]]));
  for (const key of Object.keys(oldValues)) delete process.env[key];
  const errors = [];
  const service = load("services/email/brevoEmailService.ts", { "@/lib/email/workSyncEmail": templates }, { console: { error: (...args) => errors.push(args) }, fetch: async () => { throw new Error("fetch should not be called"); } });
  await service.sendWorkSyncEmailSafely({ kind: "payment_confirmed", eventId: "payment:missing-config", recipientEmail: "safe@example.com", subject: "Paid", heading: "Paid", message: "Verified", actionLabel: "Receipt", actionUrl: "https://worksync.test/receipt" });
  assert.deepEqual(Array.from(errors[0][1].missing), ["BREVO_API_KEY", "BREVO_SENDER_EMAIL", "BREVO_SENDER_NAME"]);
  for (const [key, value] of Object.entries(oldValues)) if (value !== undefined) process.env[key] = value;
});
test("Brevo 401 logging records only the sanitized status and provider code", async () => {
  const oldValues = Object.fromEntries(["BREVO_API_KEY", "BREVO_SENDER_EMAIL", "BREVO_SENDER_NAME"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { BREVO_API_KEY: "xkeysib-test-secret", BREVO_SENDER_EMAIL: "sender@example.com", BREVO_SENDER_NAME: "WorkSync" });
  const errors = [];
  const service = load("services/email/brevoEmailService.ts", { "@/lib/email/workSyncEmail": templates }, { console: { error: (...args) => errors.push(args) }, fetch: async () => ({ ok: false, status: 401, json: async () => ({ code: "unauthorized", message: "Invalid key" }) }) });
  await service.sendWorkSyncEmailSafely({ kind: "project_work_submitted", eventId: "submission:1", recipientEmail: "person@example.com", subject: "Submitted", heading: "Work submitted", message: "A submission is ready", actionLabel: "Review", actionUrl: "https://worksync.test/project" });
  assert.equal(errors.length, 1);
  assert.equal(errors[0][1].kind, "project_work_submitted");
  assert.equal(errors[0][1].status, 401);
  assert.equal(errors[0][1].code, "unauthorized");
  assert.equal(JSON.stringify(errors).includes("xkeysib-test-secret"), false);
  for (const [key, value] of Object.entries(oldValues)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});