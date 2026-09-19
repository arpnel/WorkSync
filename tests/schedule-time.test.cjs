/* eslint-disable @typescript-eslint/no-require-imports -- Node storage compatibility regression tests. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(path, extra = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, require, ...extra },
  );
  return exports;
}
const times = load("components/schedule/schedule-time.ts");
test("deadline display handles midnight, noon, and cards without a time", () => {
  assert.equal(times.deadlineTime("00:00"), "12:00 AM");
  assert.equal(times.deadlineTime("12:30"), "12:30 PM");
  assert.equal(times.deadlineTime(), "No time set");
});
test("agenda sorts dates then times, with untimed cards last on each day", () => {
  const rows = [
    { title: "Untimed", dueDate: "2026-09-06" },
    { title: "Later", dueDate: "2026-09-07", dueTime: "00:00" },
    { title: "Afternoon", dueDate: "2026-09-06", dueTime: "15:00" },
    { title: "Morning", dueDate: "2026-09-06", dueTime: "09:00" },
  ];
  assert.deepEqual(
    rows.sort(times.compareDeadlines).map((r) => r.title),
    ["Morning", "Afternoon", "Untimed", "Later"],
  );
});
test("old saved cards load and new deadline times survive saving and reloading", () => {
  let raw = JSON.stringify({
    activeBoardId: "b",
    boards: [
      {
        id: "b",
        title: "Board",
        lists: [{ id: "l", title: "To do" }],
        cards: [
          {
            id: "c",
            listId: "l",
            title: "Deadline",
            description: "",
            dueDate: "2026-09-06",
            priority: "medium",
          },
        ],
      },
    ],
  });
  const api = load("services/schedule/scheduleService.ts", {
    localStorage: {
      getItem: () => raw,
      setItem: (key, value) => {
        raw = value;
      },
    },
    window: { dispatchEvent() {} },
    Event: class {},
  });
  const state = api.loadSchedule("user");
  assert.equal(state.boards[0].cards[0].dueTime, "");
  state.boards[0].cards[0].dueTime = "16:45";
  api.saveSchedule("user", state);
  assert.equal(api.loadSchedule("user").boards[0].cards[0].dueTime, "16:45");
});
