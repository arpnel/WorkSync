/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const vm = require("node:vm");
const api = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("lib/payments/refundEvidence.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: api },
);
const expected = {
  providerPaymentId: "pay_fixture",
  providerRefundId: "ref_fixture",
  amountCentavos: 10000,
  live: false,
};
const evidence = () => ({
  id: "ref_fixture",
  type: "refund",
  attributes: {
    payment_id: "pay_fixture",
    amount: 10000,
    currency: "PHP",
    livemode: false,
    status: "succeeded",
  },
});
test("refund evidence requires matching payment, refund, amount, currency and mode", () => {
  assert.equal(api.verifiedRefundStatus(evidence(), expected), "refunded");
  for (const [field, value] of [
    ["payment_id", "pay_other"],
    ["amount", 9999],
    ["currency", "USD"],
    ["livemode", true],
    ["amount", "10000"],
  ]) {
    const row = evidence();
    row.attributes[field] = value;
    assert.throws(() => api.verifiedRefundStatus(row, expected), /mismatch/);
  }
  assert.throws(
    () =>
      api.verifiedRefundStatus({ ...evidence(), id: "ref_other" }, expected),
    /mismatch/,
  );
  assert.throws(() => api.verifiedRefundStatus(null, expected), /unavailable/);
});
test("refund pending and failed states never become success; unknown states fail closed", () => {
  for (const [status, result] of [
    ["pending", "pending"],
    ["processing", "pending"],
    ["failed", "failed"],
  ]) {
    const row = evidence();
    row.attributes.status = status;
    assert.equal(api.verifiedRefundStatus(row, expected), result);
  }
  const row = evidence();
  row.attributes.status = "unknown";
  assert.throws(() => api.verifiedRefundStatus(row, expected), /Unknown/);
  for (const amountCentavos of [0, 99, 100.5, Infinity])
    assert.throws(
      () =>
        api.verifiedRefundStatus(evidence(), { ...expected, amountCentavos }),
      /Invalid/,
    );
});
