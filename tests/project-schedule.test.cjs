/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const api = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("lib/projectSchedule.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports: api, require },
);
const now = new Date(2026, 8, 19);
const order = () => ({
  current_user_id: "f",
  order_id: "o",
  status: "active",
  client_profile: { user_id: "c" },
  freelancer_profile: { user_id: "f" },
  contract: {
    client_signed_at: "2026-09-18",
    freelancer_signed_at: "2026-09-19",
  },
  service: { service_type: "standard" },
  project: {
    project_id: "p",
    title: "Website",
    status: "active",
    due_date: "2026-09-21",
  },
  milestones: [],
});
test("shared project boards retain real progress and project date ranges without personal copies", () => {
  const row = order();
  row.project.start_date = "2026-09-19";
  row.service.service_type = "milestone";
  row.milestones = [
    {
      milestone_id: "a",
      title: "Design",
      due_date: "2026-09-21",
      status: "approved",
    },
    {
      milestone_id: "b",
      title: "Build",
      due_date: "2026-09-25",
      status: "pending",
    },
  ];
  const cards = api.buildProjectDeadlines([row], [], now);
  assert.equal(cards[0].startDate, "2026-09-19");
  assert.equal(cards[1].startDate, "2026-09-19");
  assert.equal(cards[1].entryType, "plan");
  const boards = api.buildProjectBoards(cards);
  assert.equal(boards.length, 1);
  assert.equal(boards[0].id, "linked-project:o");
  assert.equal(boards[0].cards.length, 2);
  assert.equal(boards[0].cards[0].listId, "Done");
  row.current_user_id = "c";
  assert.equal(
    JSON.stringify(
      api.buildProjectBoards(api.buildProjectDeadlines([row], [], now)),
    ),
    JSON.stringify(boards),
  );
  row.project.start_date = "2026-10-01";
  assert.equal(api.buildProjectDeadlines([row], [], now)[0].startDate, "");
  row.project.start_date = null;
  assert.equal(api.buildProjectDeadlines([row], [], now)[0].startDate, "");
  assert.equal(
    api.buildProjectBoards([{ ...cards[0], kind: "meeting" }]).length,
    0,
  );
});
test("legacy active and completed statuses map to the correct schedule stages", () => {
  const row = order();
  row.project.status = "in_progress";
  assert.equal(
    api.buildProjectDeadlines([row], [], now)[0].stage,
    "In progress",
  );
  row.service.service_type = "milestone";
  row.milestones = [
    { milestone_id: "m", title: "Delivered", status: "completed" },
  ];
  assert.equal(api.buildProjectDeadlines([row], [], now)[0].stage, "Done");
});
test("only both signers see agreed project tasks", () => {
  const row = order();
  assert.equal(api.buildProjectDeadlines([row], [], now).length, 1);
  row.current_user_id = "c";
  assert.equal(api.buildProjectDeadlines([row], [], now).length, 1);
  row.current_user_id = "other";
  assert.equal(api.buildProjectDeadlines([row], [], now).length, 0);
  row.current_user_id = "f";
  row.contract.freelancer_signed_at = null;
  assert.equal(api.buildProjectDeadlines([row], [], now).length, 0);
});
test("standard task and milestone lists use real dates and progress, with stable IDs", () => {
  const row = order();
  const standard = api.buildProjectDeadlines([row], [], now);
  assert.equal(standard[0].priority, "high");
  assert.equal(standard[0].dueDate, "2026-09-21");
  row.service.service_type = "milestone";
  row.milestones = [
    {
      milestone_id: "m1",
      title: "Design",
      due_date: "2026-09-25",
      status: "submitted",
      display_order: 1,
    },
    {
      milestone_id: "m2",
      title: "Build",
      due_date: "2026-10-01",
      status: "pending",
      display_order: 2,
    },
  ];
  const tasks = api.buildProjectDeadlines([row, row], [], now);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].stage, "In review");
  assert.equal(tasks[0].priority, "medium");
  assert.equal(tasks[1].priority, "low");
  row.milestones[0].status = "approved";
  assert.equal(api.buildProjectDeadlines([row], [], now)[0].stage, "Done");
  row.project.status = "cancelled";
  assert.equal(api.buildProjectDeadlines([row], [], now).length, 0);
});
test("deadline priority covers overdue, two-day and seven-day boundaries, missing dates", () => {
  for (const [date, priority] of [
    ["2026-09-18", "high"],
    ["2026-09-21", "high"],
    ["2026-09-22", "medium"],
    ["2026-09-26", "medium"],
    ["2026-09-27", "low"],
    ["", "low"],
  ])
    assert.equal(api.deadlinePriority(date, now), priority);
  const row = order();
  row.project.due_date = null;
  const task = api.buildProjectDeadlines([row], [], now)[0];
  assert.equal(task.dueDate, "");
  assert.equal(task.priority, "low");
});
