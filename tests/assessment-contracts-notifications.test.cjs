/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
function load(path) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, require },
  );
  return exports;
}
const contracts = load("lib/assessments/contracts.ts");
const notifications = load("components/notifications/notification-data.ts");
test("assessment notification links to its opening without affecting existing project/message routes", () => {
  assert.equal(
    notifications.getNotificationHref("skill_assessment", "opening"),
    "/home/assessments?opening=opening",
  );
  assert.equal(
    notifications.getNotificationHref("skill_assessment", null),
    "/home/assessments",
  );
  assert.equal(
    notifications.getNotificationHref("project_update", "id"),
    "/home/projects",
  );
  assert.equal(
    notifications.getNotificationHref("message", "id"),
    "/home/messages",
  );
});
test("assessment contracts reject malformed successful responses", () => {
  for (const schema of [
    contracts.adminListSchema,
    contracts.memberListSchema,
    contracts.evidenceSchema,
  ]) {
    assert.equal(contracts.parseAssessment(schema, []).length, 0);
    assert.throws(
      () => contracts.parseAssessment(schema, { rows: [] }),
      /incompatible response/,
    );
    assert.throws(
      () => contracts.parseAssessment(schema, [{}]),
      /incompatible response/,
    );
  }
  assert.throws(
    () =>
      contracts.parseAssessment(contracts.attemptSchema, {
        status: "submitted",
        score: 100,
      }),
    /incompatible response/,
  );
  assert.equal(
    contracts.parseAssessment(contracts.attemptSchema, { status: "expired" })
      .status,
    "expired",
  );
});
test("safe attempt schema strips accidental answer keys from display data", () => {
  const id = "00000000-0000-4000-a000-000000000001";
  const result = contracts.parseAssessment(contracts.attemptSchema, {
    status: "started",
    serverNow: "2026-09-30T00:00:00+00:00",
    deadlineAt: "2026-09-30T00:10:00+00:00",
    quiz: {
      title: "Quiz",
      instructions: "",
      passingPercentage: 70,
      timeLimitMinutes: 10,
      questions: [
        {
          id,
          prompt: "Question",
          type: "single",
          points: 1,
          options: [{ id, text: "Choice" }],
          correctOptionIds: [id],
        },
      ],
    },
  });
  assert.ok(!JSON.stringify(result).includes("correctOptionIds"));
});
module.exports = { contracts };
