/* eslint-disable @typescript-eslint/no-require-imports -- Node regression harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const api = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("lib/projectNavigation.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: api },
);

test("dashboard links select the expected Projects tab after navigation", () => {
  for (const [status, tab] of [
    ["active", "Active"],
    ["in_progress", "Active"],
    ["Revision", "Active"],
    ["completed", "Completed"],
    ["pending", "Request"],
    ["In discussion", "In Discussion"],
    ["Agreement", "In Discussion"],
    ["Rejected", "Cancelled"],
  ]) {
    const url = new URL(api.projectHref(status), "https://worksync.test");
    assert.equal(url.pathname, "/home/projects");
    assert.equal(api.projectFilter(url.searchParams.get("status")), tab);
  }
});
test("missing and unsupported filters safely show all projects", () => {
  assert.equal(api.projectFilter(null), "All");
  assert.equal(api.projectFilter("unknown"), "All");
  assert.equal(api.projectHref("unknown"), "/home/projects");
});
