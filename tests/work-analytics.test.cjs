/* eslint-disable @typescript-eslint/no-require-imports -- Test pure analytics without a browser. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const api = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("lib/workAnalytics.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports: api, require },
);
const project = (id, party = "freelancer") => ({
  id,
  party,
  createdAt: "2026-08-01",
  startedAt: "2026-09-02",
  completedAt: "2026-09-18",
  status: "completed",
});
test("short analytics ranges use inclusive daily buckets without double counting", () => {
  const rows = api.trendAnalytics(
    [project("p")],
    {},
    "2026-09-01",
    "2026-09-07",
  );
  assert.equal(rows.length, 7);
  assert.equal(rows[0].month, "2026-09-01");
  assert.equal(rows[6].month, "2026-09-07");
  assert.equal(rows[1].started, 1);
  assert.equal(
    rows.reduce((total, row) => total + row.started, 0),
    1,
  );
});
test("long analytics ranges use monthly buckets and invalid ranges are empty", () => {
  assert.equal(
    api.trendAnalytics([], {}, "2026-01-01", "2026-03-31").length,
    3,
  );
  assert.equal(
    api.trendAnalytics([], {}, "2026-09-02", "2026-09-01").length,
    0,
  );
  assert.equal(api.trendAnalytics([], {}, "invalid", "2026-09-01").length, 0);
});
test("earnings exclude test, unpaid, undated, and out-of-period payments; client spending stays separate", () => {
  const projects = [
    project("live"),
    project("test"),
    project("client", "client"),
    project("pending"),
    project("undated"),
    project("old"),
  ];
  const paid = {
    status: "paid",
    mode: "live",
    amount: 100,
    paidAt: "2026-09-10",
  };
  const summary = api.summarize(
    projects,
    {
      live: paid,
      test: { ...paid, mode: "test" },
      client: paid,
      pending: { ...paid, status: "pending" },
      undated: { ...paid, paidAt: null },
      old: { ...paid, paidAt: "2026-08-10" },
    },
    "2026-09-01",
    "2026-09-30",
  );
  assert.equal(summary.earnings, 100);
  assert.equal(summary.spending, 100);
  assert.equal(summary.testPayments, 100);
  assert.equal(summary.requests, 0);
  assert.equal(summary.started, 6);
  assert.equal(summary.completed, 6);
  assert.equal(summary.completionRate, null);
});
test("month buckets include empty months and clip partial date ranges", () => {
  const rows = api.monthlyAnalytics(
    [project("a")],
    { a: { status: "paid", mode: "live", amount: 100, paidAt: "2026-09-20" } },
    "2026-08-15",
    "2026-10-05",
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].requests, 0);
  assert.equal(rows[1].started, 1);
  assert.equal(rows[1].earnings, 100);
  assert.equal(rows[2].earnings, 0);
});
test("previous period uses inclusive day counts across leap-year boundaries", () => {
  const period = api.previousPeriod("2024-03-01", "2024-03-31");
  assert.equal(period.from, "2024-01-30");
  assert.equal(period.to, "2024-02-29");
});
test("growth handles a zero baseline and declines without infinity", () => {
  assert.equal(api.growth(3, 0), "New this period");
  assert.equal(api.growth(0, 0), "No change");
  assert.equal(api.growth(0, 4), "-100.0% vs previous period");
  assert.equal(api.growth(6, 4), "+50.0% vs previous period");
});
