/* eslint-disable @typescript-eslint/no-require-imports -- Node regression harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(path, modules) {
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
      require: (name) => modules[name],
      Date,
      Map,
      Set,
      crypto: { randomUUID: () => "evidence-id" },
    },
  );
  return exports;
}
function resolution(fail = false) {
  const calls = [],
    uploads = [],
    removed = [],
    queries = [];
  const supabase = {
    storage: {
      from: () => ({
        upload: async (path) => {
          uploads.push(path);
          return { error: null };
        },
        remove: async (paths) => {
          removed.push(...paths);
          return { error: null };
        },
      }),
    },
    from: (table) => ({
      select() {
        return this;
      },
      eq(column, value) {
        queries.push([table, column, value]);
        return this;
      },
      order() {
        return Promise.resolve({ data: [], error: null });
      },
    }),
  };
  const service = load("services/project/resolutionService.ts", {
    "@/lib/supabaseClient": { supabase },
    "@/services/platform/platformService": {
      requireUser: async () => ({ id: "participant" }),
      databaseError: (e) => new Error(e.message),
      platformAction: async (name, args) => {
        calls.push({ name, args });
        if (fail) throw new Error("permission denied");
      },
    },
  });
  return { service, calls, uploads, removed, queries };
}
test("cancellation and dispute eligibility preserves completed and unsigned stages", () => {
  const { service: s } = resolution();
  for (const state of ["completed", "cancelled", "rejected", "unknown"]) {
    assert.equal(s.canRequestCancellation(state), false);
    assert.equal(s.canOpenDispute(state), false);
  }
  assert.equal(s.canRequestCancellation("accepted"), true);
  assert.equal(s.canOpenDispute("accepted"), false);
  assert.equal(s.canOpenDispute("Active"), true);
});
test("empty cancellation responses never call a mutation", async () => {
  const h = resolution();
  await assert.rejects(h.service.requestCancellation("o", "  "), /reason/);
  await assert.rejects(h.service.respondCancellation("c", true, ""), /reason/);
  assert.equal(h.calls.length, 0);
});
test("cancellation sends order identity and counterpart response separately", async () => {
  const h = resolution();
  await h.service.requestCancellation("order", " reason ");
  await h.service.respondCancellation("request", false, " keep working ");
  assert.equal(h.calls[0].args.p_order, "order");
  assert.equal(h.calls[0].args.p_reason, "reason");
  assert.equal(h.calls[1].args.p_id, "request");
  assert.equal(h.calls[1].args.p_accept, false);
});
test("dispute rejection cleans up evidence without retaining an orphan", async () => {
  const h = resolution(true);
  await assert.rejects(
    h.service.openDispute("project", "milestone", "delivery", "Missing work", {
      name: "evidence (1).pdf",
      size: 50,
    }),
    /permission denied/,
  );
  assert.equal(
    h.uploads[0],
    "project/participant/evidence-id/evidence__1_.pdf",
  );
  assert.equal(h.removed[0], h.uploads[0]);
  assert.equal(h.calls[0].args.p_milestone, "milestone");
});
test("oversize evidence and unknown dispute categories cannot upload", async () => {
  const h = resolution();
  await assert.rejects(
    h.service.openDispute("p", null, "unknown", "reason"),
    /category/,
  );
  await assert.rejects(
    h.service.openDispute("p", null, "scope", "reason", {
      name: "file",
      size: 10485761,
    }),
    /10 MB/,
  );
  assert.equal(h.uploads.length, 0);
  assert.equal(h.calls.length, 0);
});
test("resolution history scopes cancellations to the order and disputes to the project", async () => {
  const h = resolution();
  await h.service.getResolutionHistory("o", "p");
  assert.deepEqual(h.queries, [
    ["project_cancellations", "order_id", "o"],
    ["project_disputes", "project_id", "p"],
  ]);
});
test("restoration clears expiry and account moderation calls the checked routine", async () => {
  const calls = [];
  const s = load("services/admin/adminService.ts", {
    "@/services/platform/platformService": {
      platformAction: async (name, args) => calls.push({ name, args }),
    },
  });
  await s.reviewAdminRecord(
    "users",
    "u",
    "restore",
    "Appeal accepted",
    "2020-01-01",
  );
  assert.equal(calls[0].name, "worksync_moderate_account");
  assert.equal(calls[0].args.p_status, "active");
  assert.equal(calls[0].args.p_expires, null);
  await assert.rejects(
    s.reviewAdminRecord("users", "u", "suspend", ""),
    /reason/,
  );
  assert.equal(calls.length, 1);
});
test("calendar deduplicates source IDs and preserves finished projects in Done", async () => {
  const p = {
    order_id: "o",
    contract: { client_signed_at: "signed", freelancer_signed_at: "signed" },
    current_user_id: "u",
    client_profile: { user_id: "u" },
    freelancer_profile: { user_id: "f" },
    project: {
      project_id: "p",
      title: "Project",
      status: "active",
      due_date: "2026-10-01",
    },
    service: { service_type: "standard" },
    milestones: [
      {
        milestone_id: "m",
        title: "Done",
        status: "approved",
        due_date: "2026-09-30",
      },
      {
        milestone_id: "c",
        title: "Approved",
        status: "approved",
        due_date: "2026-09-30",
      },
    ],
  };
  const q = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    gte() {
      return Promise.resolve({
        data: [
          {
            meeting_id: "meeting",
            project_id: "p",
            title: "Review",
            starts_at: "2026-09-30T10:00:00Z",
          },
        ],
        error: null,
      });
    },
  };
  const s = load("services/schedule/projectDeadlines.ts", {
    "@/lib/projectSchedule": load("lib/projectSchedule.ts", {}),
    "@/services/project/projectService": {
      getProjects: async () => [
        p,
        p,
        {
          ...p,
          order_id: "finished",
          project: { ...p.project, project_id: "done", status: "completed" },
        },
      ],
    },
    "@/lib/supabaseClient": { supabase: { from: () => q } },
    "@/services/platform/platformService": { databaseError: (e) => e },
  });
  const { deadlines: rows, warning } = await s.getProjectDeadlines();
  assert.equal(warning, "");
  assert.equal(rows.find((row) => row.id === "project:done").stage, "Done");
  assert.deepEqual(Array.from(rows, (r) => r.id).sort(), [
    "meeting:meeting",
    "project:done",
    "project:p",
  ]);
});
test("prepared SQL uses valid dollar delimiters and signing changes status before persistence", () => {
  for (const name of fs.readdirSync("supabase/migrations")) {
    const s = fs.readFileSync("supabase/migrations/" + name, "utf8");
    assert.doesNotMatch(s, /as \$\r?\n|(?:^|\n)(?:end; )?\$;/, name);
  }
  const s = fs.readFileSync(
    "supabase/migrations/202609140002_contract_lifecycle.sql",
    "utf8",
  );
  const before = s.slice(
    0,
    s.indexOf("create or replace function public.worksync_activate_contract"),
  );
  assert.match(before, /new.status:='active'/);
  assert.match(s, /service_orders set status='active'/);
});

test("converted cancellation checks project state and never treats an active order as valid", () => {
  const { service: s } = resolution();
  assert.equal(s.canRequestCancellation("converted", "active"), true);
  assert.equal(s.canRequestCancellation("converted", "pending"), false);
  assert.equal(s.canRequestCancellation("converted", "completed"), false);
  assert.equal(s.canRequestCancellation("accepted", "cancelled"), false);
  assert.equal(s.canRequestCancellation("active"), false);
});
test("agreement status requires signatures and server activation, and preserves waiting parties", () => {
  const s = load("types/project/status.ts", {});
  assert.equal(
    s.workspaceStatus("pending", "active", "accepted", "signed", "signed"),
    "Awaiting activation",
  );
  assert.equal(
    s.workspaceStatus("active", "pending", "accepted", null, null),
    "Pending agreement",
  );
  assert.equal(
    s.workspaceStatus("active", "active", "converted", "signed", "signed"),
    "active",
  );
  assert.equal(
    s.workspaceStatus("revision", "active", "converted", "signed", "signed"),
    "revision",
  );
  assert.equal(
    s.workspaceStatus("pending", "pending_client", "accepted", null, null),
    "Awaiting client confirmation",
  );
  assert.equal(
    s.workspaceStatus("pending", "pending_freelancer", "accepted", null, null),
    "Awaiting freelancer confirmation",
  );
  assert.equal(s.milestoneStatus("approved"), "approved");
  assert.equal(s.milestoneStatus("completed"), "approved");
  assert.throws(() => s.milestoneStatus("invalid"), /Unsupported/);
  assert.throws(() => s.orderStatus("in_progress"), /Unsupported/);
});
