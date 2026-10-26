/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadTypeScript(file, modules = {}, globals = {}) {
  const api = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports: api,
      require: (name) => modules[name] ?? {},
      ...globals,
    },
  );
  return api;
}

test("archived listings are queried only within the last 30 days", async () => {
  const now = Date.parse("2026-10-26T12:00:00.000Z");
  class FixedDate extends Date {
    static now() {
      return now;
    }
  }
  const gteFilters = [];
  const listingTypes = [];
  const query = {
    select() { return this; },
    eq(column, value) {
      if (column === "listing_type") listingTypes.push(value);
      return this;
    },
    not() { return this; },
    gte(column, value) { gteFilters.push([column, value]); return this; },
    is() { return this; },
    order() { return this; },
    then(resolve, reject) {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    },
  };
  const api = loadTypeScript(
    "services/marketplace/archiveService.ts",
    {
      "@/lib/supabaseClient": { supabase: { from: () => query } },
      "@/lib/pageReadCache": { invalidatePageReads() {} },
      "@/services/marketplace/AccountServices": {
        getActiveAccountContext: async () => ({ profileId: "profile", userId: "owner", role: "client" }),
      },
    },
    { Date: FixedDate },
  );
  await api.getArchivedListings();
  const freelancerApi = loadTypeScript(
    "services/marketplace/archiveService.ts",
    {
      "@/lib/supabaseClient": { supabase: { from: () => query } },
      "@/lib/pageReadCache": { invalidatePageReads() {} },
      "@/services/marketplace/AccountServices": {
        getActiveAccountContext: async () => ({ profileId: "profile", userId: "owner", role: "freelancer" }),
      },
    },
    { Date: FixedDate },
  );
  await freelancerApi.getArchivedListings();
  assert.deepEqual(listingTypes, ["job", "service"]);
  assert.deepEqual(gteFilters, [
    ["archived_at", new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()],
    ["archived_at", new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()],
  ]);
});

test("public job hiring counts deduplicate freelancers and hide private rows", () => {
  const api = loadTypeScript("services/marketplace/jobPublicStats.ts");
  const result = api.summarizePublicJobHiring(
    [
      { application_id: "a1", freelancer_id: "f1", status: "accepted" },
      { application_id: "a2", freelancer_id: "f1", status: "pending" },
      { application_id: "a3", freelancer_id: "f2", status: "accepted" },
      { application_id: "a4", freelancer_id: "f3", status: "rejected" },
      { application_id: "a5", freelancer_id: "f4", status: "withdrawn" },
    ],
    [
      { application_id: "a1", status: "completed" },
      { application_id: "a1", status: "active" },
    ],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    applicantCount: 4,
    discussionCount: 1,
    connectedCount: 2,
    hiredCount: 1,
  });
  assert.deepEqual(Object.keys(result).sort(), [
    "applicantCount",
    "connectedCount",
    "discussionCount",
    "hiredCount",
  ]);
});

test("public job stats only expose counts for public open listings", async () => {
  const applications = [
    { application_id: "a1", freelancer_id: "f1", status: "accepted" },
    { application_id: "a2", freelancer_id: "f2", status: "pending" },
  ];
  const contracts = [{ application_id: "a1", status: "active" }];
  const createClient = () => ({
    from(table) {
      const query = {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        in() { return this; },
        order() { return this; },
        maybeSingle() {
          return Promise.resolve({
            data: table === "jobs" ? { job_id: "job" } : { submission_id: "submission" },
            error: null,
          });
        },
        range() { return this; },
        then(resolve, reject) {
          const data = table === "job_applications" ? applications : contracts;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  });
  const api = loadTypeScript(
    "app/api/marketplace/job-stats/route.ts",
    {
      "server-only": {},
      "@supabase/supabase-js": { createClient },
      "@/services/marketplace/jobPublicStats": {
        summarizePublicJobHiring: loadTypeScript("services/marketplace/jobPublicStats.ts").summarizePublicJobHiring,
      },
      zod: require("zod"),
    },
    {
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key" } },
      URL,
      Response,
    },
  );
  const response = await api.GET(new Request("https://worksync.test/api/marketplace/job-stats?jobId=00000000-0000-4000-8000-000000000001"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    applicantCount: 2,
    discussionCount: 0,
    connectedCount: 1,
    hiredCount: 1,
  });
});
