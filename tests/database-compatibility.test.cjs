/* eslint-disable @typescript-eslint/no-require-imports -- Test RPC payloads without live mutations. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, calls, modules = {}) {
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
      require: (name) =>
        modules[name] ?? {
          platformAction: async (name, args) =>
            calls.push({ name, args: JSON.parse(JSON.stringify(args)) }),
        },
    },
  );
  return api;
}
test("delivery review maps approval and revision to live boolean contract", async () => {
  const calls = [],
    api = load("services/project/projectDeliveryService.ts", calls);
  await api.reviewSubmission("submission", "approve", "  accepted  ");
  await api.reviewSubmission("submission", "revision", "  update files  ");
  assert.deepEqual(calls, [
    {
      name: "worksync_review_submission",
      args: {
        p_submission_id: "submission",
        p_approve: true,
        p_instructions: "accepted",
      },
    },
    {
      name: "worksync_review_submission",
      args: {
        p_submission_id: "submission",
        p_approve: false,
        p_instructions: "update files",
      },
    },
  ]);
  await assert.rejects(
    api.reviewSubmission("submission", "revision", "  "),
    /Explain the changes/,
  );
  assert.equal(calls.length, 2);
});

test("admin reads preserve live arguments, validate payloads, and retain database errors", async () => {
  const calls = [];
  const responses = load("services/admin/adminResponses.ts", [], {
    zod: require("zod"),
  });
  let result = { data: { rows: [], total: 0 }, error: null };
  const api = load("services/admin/adminService.ts", [], {
    "./adminResponses": responses,
    "@/lib/supabaseClient": {
      supabase: {
        rpc: async (name, args) => {
          calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
          return result;
        },
      },
    },
  });
  await api.getAdminRecords("users", "  sample  ", 2);
  assert.deepEqual(calls[0], {
    name: "worksync_admin_records",
    args: { p_module: "users", p_search: "sample", p_offset: 50 },
  });
  result = {
    data: {
      counts: {},
      completion_rate: null,
      average_project_value: null,
      average_rating: null,
      categories: [],
      activity: [],
    },
    error: null,
  };
  await api.getAdminAnalytics("from", "to", "all");
  assert.deepEqual(calls[1], {
    name: "worksync_admin_analytics",
    args: { p_from: "from", p_to: "to", p_status: "all" },
  });
  result = { data: {}, error: null };
  await assert.rejects(
    api.getAdminDisputeContext("dispute"),
    /incompatible response/,
  );
  result = {
    data: null,
    error: { code: "42703", message: "column is missing" },
  };
  await assert.rejects(
    api.getAdminRecords("users", "", 0),
    /worksync_admin_records, 42703.*column is missing/,
  );
});
test("meeting create, edit and cancellation retain live arguments and original cancellation details", async () => {
  const calls = [],
    api = load("services/project/projectMeetingService.ts", calls);
  const meeting = {
    meeting_id: null,
    title: "Review",
    starts_at: "2026-10-01T02:00:00Z",
    ends_at: "2026-10-01T03:00:00Z",
    link: null,
  };
  await api.saveProjectMeeting("project", meeting, "scheduled");
  await api.saveProjectMeeting(
    "project",
    { ...meeting, meeting_id: "meeting" },
    "scheduled",
  );
  await api.saveProjectMeeting(
    "project",
    { ...meeting, meeting_id: "meeting" },
    "cancelled",
  );
  for (const [i, call] of calls.entries()) {
    assert.equal(call.name, "worksync_save_meeting");
    assert.deepEqual(call.args, {
      p_meeting_id: i ? "meeting" : null,
      p_project_id: "project",
      p_title: "Review",
      p_starts_at: meeting.starts_at,
      p_ends_at: meeting.ends_at,
      p_link: null,
      p_status: i === 2 ? "cancelled" : "scheduled",
    });
  }
});
