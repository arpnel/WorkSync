/* eslint-disable @typescript-eslint/no-require-imports -- Node harness for TypeScript services. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(path, modules) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) =>
      name === "@/lib/projectProgress"
        ? load("lib/projectProgress.ts", {})
        : modules[name],
    URL,
    Response,
    process: { env: {} },
    crypto: { randomUUID: () => "submission-id" },
    window: { open() {} },
  });
  return exports;
}
function delivery({ fail = false, paid = true } = {}) {
  const calls = [],
    uploads = [],
    removals = [],
    queries = [];
  const supabase = {
    storage: {
      from(bucket) {
        return {
          async upload(path) {
            uploads.push({ bucket, path });
            return { error: null };
          },
          async remove(paths) {
            removals.push(...paths);
            return { error: null };
          },
        };
      },
    },
    from(table) {
      const q = {
        select() {
          return this;
        },
        eq(column, value) {
          queries.push([table, column, value]);
          return this;
        },
        order() {
          return this;
        },
        then(resolve) {
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  const service = load("services/project/projectDeliveryService.ts", {
    "@/services/payments/paymentService": {
      getProjectPayment: async () => ({ status: paid ? "paid" : "pending" }),
    },
    "./paidWorkService": {
      submitPaidWork: async (args) => {
        calls.push({ name: "worksync_submit_work", args });
        if (fail) throw new Error("Database unavailable");
      },
    },
    "@/lib/supabaseClient": { supabase },
    "@/services/platform/platformService": {
      requireUser: async () => ({ id: "freelancer" }),
      databaseError: (e) => new Error(e.message),
      platformAction: async (name, args) => {
        calls.push({ name, args });
        if (fail) throw new Error("Database unavailable");
      },
    },
  });
  return { service, calls, uploads, removals, queries };
}
test("rejects active-content links before uploading or writing", async () => {
  const h = delivery();
  await assert.rejects(
    h.service.submitProjectWork(
      "p",
      null,
      "work",
      "javascript:alert(1)",
      "delivery",
    ),
    /HTTP/,
  );
  assert.equal(h.calls.length, 0);
  assert.equal(h.uploads.length, 0);
});
test("oversized deliverables never upload", async () => {
  const h = delivery();
  await assert.rejects(
    h.service.submitProjectWork("p", null, "work", "", "delivery", {
      name: "large.pdf",
      size: 11 * 1024 * 1024,
    }),
    /10 MB/,
  );
  assert.equal(h.uploads.length, 0);
});
test("failed submission removes the uploaded orphan without masking failure", async () => {
  const h = delivery({ fail: true });
  await assert.rejects(
    h.service.submitProjectWork("p", "m", "work", "", "delivery", {
      name: "work draft.pdf",
      size: 42,
    }),
    /Database unavailable/,
  );
  assert.equal(h.uploads[0].bucket, "project-attachments");
  assert.equal(h.removals[0], "p/freelancer/submission-id/work_draft.pdf");
});
test("successful submission keeps immutable file and passes milestone identity", async () => {
  const h = delivery();
  await h.service.submitProjectWork(
    "p",
    "m",
    "work",
    "https://example.com/delivery",
    "delivery",
    { name: "work.pdf", size: 42 },
  );
  assert.equal(h.removals.length, 0);
  assert.equal(h.calls[0].args.p_project, "p");
  assert.equal(h.calls[0].args.p_milestone, "m");
  assert.equal(h.calls[0].args.p_id, "submission-id");
});
test("history reads scope every table to the selected project", async () => {
  const h = delivery();
  await h.service.getDeliveryHistory("selected-project");
  assert.equal(h.queries.length, 3);
  for (const [, column, value] of h.queries) {
    assert.equal(column, "project_id");
    assert.equal(value, "selected-project");
  }
});
test("revision requires instructions and reviews reject invalid stars", async () => {
  const h = delivery();
  await assert.rejects(
    h.service.reviewSubmission("s", "revision", " "),
    /Explain/,
  );
  for (const value of [0, 6, 2.5, NaN])
    await assert.rejects(
      h.service.leaveProjectReview("p", value, ""),
      /rating/,
    );
  assert.equal(h.calls.length, 0);
});
test("missing database routines surface a setup error rather than reporting success", async () => {
  const service = load("services/platform/platformService.ts", {
    "@/lib/supabaseClient": {
      supabase: {
        rpc: async () => ({ error: { code: "PGRST202", message: "missing" } }),
      },
    },
  });
  await assert.rejects(
    service.platformAction("worksync_submit_work", {}),
    /pending WorkSync database update/,
  );
});
test("project states keep planned agreements and cancelled work distinct", () => {
  const { getProjectStatus } = load("hooks/project/useProjects.ts", {
    react: {},
    "@/services/project/projectService": {},
  });
  assert.equal(
    getProjectStatus({ status: "accepted", project: { status: "pending" } }),
    "In Discussion",
  );
  assert.equal(
    getProjectStatus({ status: "accepted", project: { status: "active" } }),
    "Active",
  );
  assert.equal(
    getProjectStatus({ status: "cancelled", project: null }),
    "Cancelled",
  );
  assert.equal(
    getProjectStatus({ status: "accepted", project: { status: "completed" } }),
    "Completed",
  );
  assert.equal(
    getProjectStatus({ status: "pending", project: null }),
    "Request",
  );
});

test("active orders and signed projects leave discussion while draft agreements remain", () => {
  const { getProjectStatus, mapProject } = load(
    "hooks/project/useProjects.ts",
    {
      react: {},
      "@/services/project/projectService": {},
    },
  );
  const record = {
    order_id: "order",
    application_id: "application",
    current_user_id: "client",
    status: "accepted",
    project: null,
    contract: {
      client_signed_at: "2026-09-18T09:00:00Z",
      freelancer_signed_at: null,
      terms: JSON.stringify({
        projectTitle: "Build website",
        description: "Three pages",
      }),
    },
  };
  assert.equal(getProjectStatus(record), "In Discussion");
  const active = {
    ...record,
    status: "active",
    project: {
      project_id: "project",
      status: "active",
      description: "Final scope",
    },
    contract: {
      ...record.contract,
      freelancer_signed_at: "2026-09-18T10:00:00Z",
    },
  };
  const mapped = mapProject(active);
  assert.equal(mapped.status, "Active");
  assert.equal(mapped.applicationId, "application");
  assert.equal(mapped.freelancerSignedAt, "2026-09-18T10:00:00Z");
  assert.equal(mapped.requestDescription, "Final scope");
  assert.equal(getProjectStatus({ ...record, status: "active" }), "Active");
  assert.equal(
    getProjectStatus({ ...active, status: "cancelled" }),
    "Cancelled",
  );
});

test("workspace accepts activated orders and keeps incomplete confirmation pending", () => {
  const { orderStatus, workspaceStatus } = load("types/project/status.ts");
  assert.equal(orderStatus("active"), "active");
  assert.equal(
    workspaceStatus(
      "active",
      "active",
      "active",
      "client-date",
      "freelancer-date",
    ),
    "active",
  );
  assert.equal(
    workspaceStatus(null, "draft", "accepted", "client-date", null),
    "Awaiting freelancer confirmation",
  );
});

test("unpaid work is blocked before uploading or saving", async () => {
  const h = delivery({ paid: false });
  await assert.rejects(
    h.service.submitProjectWork("p", null, "notes", "", "delivery", {
      name: "screenshot.png",
      size: 40,
    }),
    /client must pay/,
  );
  assert.equal(h.uploads.length, 0);
  assert.equal(h.calls.length, 0);
});

test("submission API rejects unpaid clients and unrelated freelancers before RPC execution", async () => {
  for (const [paid, userId, expected] of [
    [false, "freelancer", 409],
    [true, "client", 403],
    [true, "freelancer", 200],
  ]) {
    let writes = 0;
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
            data:
              table === "projects"
                ? { budget: 100, freelancer_id: "profile", status: "active" }
                : { user_id: "freelancer" },
            error: null,
          }),
        };
        return q;
      },
    };
    class PaymentError extends Error {
      constructor(message, status) {
        super(message);
        this.status = status;
      }
    }
    const route = load("app/api/project-work/route.ts", {
      zod: require("zod"),
      "@supabase/supabase-js": {
        createClient: () => ({
          rpc: async () => {
            writes++;
            return { error: null };
          },
        }),
      },
      "@/lib/payments/paymongo": { PaymentError },
      "@/services/payments/paymentServer": {
        paymentUser: async () => ({ db, user: { id: userId } }),
        getProjectPayment: async () => ({
          status: paid ? "paid" : "pending",
          amount: 100,
        }),
        paymentResponse: (error) =>
          Response.json(
            { error: error.message },
            { status: error.status || 500 },
          ),
      },
    });
    const body = {
      p_id: "11111111-1111-4111-a111-111111111111",
      p_project: "22222222-2222-4222-a222-222222222222",
      p_milestone: null,
      p_body: "Work",
      p_link: null,
      p_kind: "delivery",
      p_path: null,
      p_name: null,
    };
    const response = await route.POST({
      json: async () => body,
      headers: { get: () => "Bearer token" },
    });
    assert.equal(response.status, expected);
    assert.equal(writes, expected === 200 ? 1 : 0);
  }
});

test("progress follows equal milestone approvals and reserves completion for client approval", () => {
  const { projectProgress } = load("lib/projectProgress.ts", {});
  for (const total of [4, 10])
    assert.equal(
      projectProgress({
        completed: false,
        milestone: true,
        milestones: Array.from({ length: total }, (_, i) => ({
          status: i === 0 ? "approved" : "pending",
        })),
      }),
      100 / total,
    );
  assert.equal(
    projectProgress({
      completed: false,
      milestone: false,
      submissions: Array(5).fill({ kind: "progress" }),
    }),
    50,
  );
  assert.equal(
    projectProgress({
      completed: false,
      milestone: false,
      submissions: Array(20).fill({ kind: "progress" }),
    }),
    90,
  );
  assert.equal(
    projectProgress({
      completed: false,
      milestone: false,
      submissions: [{ kind: "delivery" }],
    }),
    0,
  );
  assert.equal(projectProgress({ completed: true, milestone: false }), 100);
});
