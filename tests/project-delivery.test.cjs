/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const api = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("lib/projectDelivery.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports: api },
);
const delivery = (
  id,
  status = "submitted",
  milestone = null,
  date = "2026-09-19",
) => ({
  submission_id: id,
  status,
  milestone_id: milestone,
  created_at: date,
  kind: "delivery",
});
test("only the newest delivery is reviewable, regardless of input ordering", () => {
  const ids = api.reviewableDeliveryIds(
    [delivery("old", "submitted", null, "2026-09-18"), delivery("new")],
    [],
  );
  assert.deepEqual([...ids], ["new"]);
});
test("revision requested and approved deliveries cannot be approved again", () => {
  for (const status of ["revision_requested", "approved"]) {
    assert.equal(
      api.reviewableDeliveryIds(
        [delivery("old"), delivery("new", status, null, "2026-09-20")],
        [],
      ).size,
      0,
    );
  }
});
test("milestone approvals stay independent and exclude finished or missing milestones", () => {
  const ids = api.reviewableDeliveryIds(
    [
      delivery("a", "submitted", "a"),
      delivery("b", "submitted", "b"),
      delivery("c", "submitted", "missing"),
      delivery("unscoped"),
    ],
    [
      { id: "a", status: "approved" },
      { id: "b", status: "submitted" },
    ],
  );
  assert.deepEqual([...ids], ["b"]);
});
test("progress updates do not replace a pending delivery", () => {
  const ids = api.reviewableDeliveryIds(
    [
      delivery("final"),
      {
        ...delivery("progress", "submitted", null, "2026-09-20"),
        kind: "progress",
      },
    ],
    [],
  );
  assert.deepEqual([...ids], ["final"]);
});

test("legacy database statuses keep finished milestones and active projects accessible", () => {
  const statuses = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync("types/project/status.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports: statuses },
  );
  assert.equal(statuses.milestoneStatus("completed"), "approved");
  assert.equal(
    statuses.workspaceStatus(
      "in_progress",
      "active",
      "active",
      "signed",
      "signed",
    ),
    "active",
  );
  assert.equal(
    statuses.workspaceStatus(
      "completed",
      "completed",
      "completed",
      "signed",
      "signed",
    ),
    "completed",
  );
  assert.equal(
    statuses.workspaceStatus("active", "draft", "accepted", null, null),
    "Pending agreement",
  );
});
