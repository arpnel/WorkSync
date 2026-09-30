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
    api.parseAdminRecords({ rows: [], total: 0 }, "worksync_admin_records").rows
      .length,
    0,
  );
});
test("records accept the SQL nullable fields", () => {
  const result = api.parseAdminRecords(
    {
      rows: [
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
      total: 1,
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
