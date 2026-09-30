/* eslint-disable @typescript-eslint/no-require-imports -- Exercise RPC contracts without a browser. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const api = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("services/admin/adminResponses.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: api, require },
);

test("records reject incompatible successful RPC payloads before rendering", () => {
  for (const value of [
    null,
    {},
    [],
    { total: 0 },
    { rows: null, total: 0 },
    { rows: [{}], total: 1 },
  ]) {
    assert.throws(
      () => api.parseAdminRecords(value, "worksync_admin_records"),
      /incompatible response/,
    );
  }
  assert.equal(
    api.parseAdminRecords(
      { records: [], limit: 25, offset: 0 },
      "worksync_admin_records",
    ).rows.length,
    0,
  );
});
test("records accept the SQL nullable fields", () => {
  const result = api.parseAdminRecords(
    {
      records: [
        {
          id: "id",
          title: "Title",
          status: "active",
          detail: "",
          created_at: null,
          owner_id: null,
          document_paths: null,
        },
      ],
      limit: 25,
      offset: 0,
    },
    "worksync_admin_records",
  );
  assert.equal(result.rows[0].created_at, "");
  assert.equal(result.rows[0].document_paths, undefined);
});
test("analytics rejects missing formatting and chart fields, while allowing SQL null aggregates", () => {
  const valid = {
    counts: {},
    completion_rate: null,
    average_project_value: null,
    average_rating: null,
    categories: [],
    activity: [],
  };
  assert.equal(api.parseAdminAnalytics(valid).average_project_value, null);
  for (const key of Object.keys(valid)) {
    const value = { ...valid };
    delete value[key];
    assert.throws(
      () => api.parseAdminAnalytics(value),
      /incompatible response/,
    );
  }
  assert.throws(
    () => api.parseAdminAnalytics({ ...valid, average_project_value: "100" }),
    /incompatible response/,
  );
  assert.equal(
    api
      .parseAdminAnalytics({ ...valid, average_project_value: 100 })
      .average_project_value.toLocaleString(),
    "100",
  );
});

test("dispute context rejects missing arrays and invalid nested rows instead of rendering them", () => {
  const valid = {
    project: { title: "Project", status: "active" },
    contract: null,
    dispute: { evidence_path: null, resolution: null },
    parties: [],
    milestones: [],
    submissions: [],
    revisions: [],
    messages: [],
  };
  assert.equal(api.parseAdminDisputeContext(valid).messages.length, 0);
  for (const key of [
    "parties",
    "milestones",
    "submissions",
    "revisions",
    "messages",
  ]) {
    for (const value of [undefined, null, {}, [{}]]) {
      assert.throws(
        () => api.parseAdminDisputeContext({ ...valid, [key]: value }),
        /worksync_dispute_context.*incompatible response/,
      );
    }
  }
  for (const value of [
    null,
    {},
    [],
    { ...valid, project: null },
    { ...valid, dispute: null },
  ]) {
    assert.throws(
      () => api.parseAdminDisputeContext(value),
      /incompatible response/,
    );
  }
});

test("analytics never treats invalid numeric metrics as business values", () => {
  const valid = {
    counts: {},
    completion_rate: null,
    average_project_value: null,
    average_rating: null,
    categories: [],
    activity: [],
  };
  for (const field of [
    "completion_rate",
    "average_project_value",
    "average_rating",
  ]) {
    for (const value of [undefined, "0", {}, NaN, Infinity]) {
      assert.throws(
        () => api.parseAdminAnalytics({ ...valid, [field]: value }),
        /incompatible response/,
      );
    }
  }
});

test("deployed report and audit envelopes normalize without losing inspection fields", () => {
  const result = api.parseAdminRecords(
    {
      records: [
        {
          record_type: "listing_report",
          report: {
            report_id: "report",
            listing_type: "job",
            reason: "spam",
            status: "pending",
            created_at: null,
            owner_id: "owner",
            reporter_id: "reporter",
            job_id: "job",
            description: "description",
            admin_notes: "notes",
          },
        },
        {
          record_type: "audit",
          audit: {
            audit_id: "audit",
            action: "review",
            created_at: null,
            admin_id: "admin",
            target_id: "target",
            details: { action: "approved" },
          },
        },
      ],
      limit: 50,
      offset: 100,
    },
    "worksync_admin_records",
  );
  assert.equal(result.rows[0].id, "report");
  assert.equal(result.rows[0].owner_id, "owner");
  assert.match(result.rows[0].detail, /description/);
  assert.equal(result.rows[1].id, "audit");
  assert.match(result.rows[1].detail, /approved/);
  assert.equal(result.offset, 100);
  assert.equal(result.limit, 50);
  assert.equal(result.hasNext, false);
});
test("pagination uses returned limits without requiring or fabricating totals", () => {
  const row = {
    id: "id",
    title: "Title",
    status: "active",
    detail: "",
    created_at: null,
  };
  const parse = (value) =>
    api.parseAdminRecords(value, "worksync_admin_records");
  assert.equal(parse({ records: [row], limit: 1, offset: 12 }).hasNext, true);
  assert.equal(parse({ records: [], limit: 50, offset: 50 }).hasNext, false);
  for (const value of [
    { records: [], limit: 0, offset: 0 },
    { records: [], limit: 50, offset: -1 },
    { rows: [], total: 0 },
    { records: [row, row], limit: 1, offset: 0 },
  ])
    assert.throws(() => parse(value), /incompatible response/);
  const disputes = api.parseAdminRecords([], "worksync_list_disputes", 25);
  assert.equal(disputes.hasNext, false);
  assert.equal(disputes.offset, 25);
});

test("deployed SETOF disputes preserves action IDs and uses 100-row pagination", () => {
  const row = {
    dispute_id: "dispute",
    project_id: "project",
    status: "open",
    category: "delivery",
    description: "Details",
    created_at: null,
    opened_by: "user",
    admin_notes: null,
    evidence_name: "evidence.pdf",
  };
  const parse = (rows) =>
    api.parseAdminRecords(rows, "worksync_list_disputes", 100);
  const result = parse([row]);
  assert.equal(result.rows[0].id, "dispute");
  assert.equal(result.rows[0].owner_id, "user");
  assert.match(result.rows[0].title, /project/);
  assert.match(result.rows[0].detail, /evidence.pdf/);
  assert.equal(result.limit, 100);
  assert.equal(result.offset, 100);
  assert.equal(result.hasNext, false);
  assert.equal(parse(Array(100).fill(row)).hasNext, true);
  for (const rows of [
    null,
    {},
    [{}],
    { rows: [], total: 0 },
    Array(101).fill(row),
  ])
    assert.throws(() => parse(rows), /incompatible response/);
});
test("deployed moderation analytics preserves real counts and marks absent metrics unavailable", () => {
  const valid = {
    from: "2026-09-01",
    to: "2026-10-01",
    status: null,
    users: 3,
    listing_reports: 2,
    listing_reports_by_status: { pending: 2 },
    disputes: 1,
    disputes_by_status: { open: 1 },
    suspended_accounts: 4,
    hidden_listings: 5,
    audit_actions: 6,
  };
  const result = api.parseAdminAnalytics(valid);
  assert.equal(result.scope, "moderation");
  assert.equal(result.counts.users, 3);
  assert.equal(result.counts.hidden_listings, 5);
  assert.equal(result.moderation.reports.pending, 2);
  assert.equal(result.moderation.disputes.open, 1);
  assert.equal(result.activity, null);
  assert.equal(result.categories, null);
  assert.equal(result.completion_rate, null);
  assert.equal(result.average_project_value, null);
  for (const key of Object.keys(valid)) {
    const missing = { ...valid };
    delete missing[key];
    assert.throws(
      () => api.parseAdminAnalytics(missing),
      /incompatible response/,
    );
  }
  for (const users of ["3", -1, NaN, Infinity])
    assert.throws(
      () => api.parseAdminAnalytics({ ...valid, users }),
      /incompatible response/,
    );
  assert.equal(
    api.parseAdminAnalytics({ ...valid, status: "open" }).scope,
    "moderation",
  );
});
