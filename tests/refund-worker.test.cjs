/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
function load(file, modules = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (n) => (n === "server-only" ? {} : (modules[n] ?? require(n))),
      Date,
    },
  );
  return exports;
}
const proof = load("lib/payments/refundEvidence.ts");
class PaymentError extends Error {}
function fixture({
  timeout = false,
  externalRefund = false,
  mismatch = false,
  method = "gcash",
  providerStatus = "succeeded",
  saveFailure = false,
} = {}) {
  let row = null,
    posts = 0,
    claimed = false;
  const db = {
    rpc: async () => {
      if (claimed) return { data: [], error: null };
      claimed = true;
      row = {
        refund_id: "refund-local",
        payment_id: "payment",
        amount: 60,
        mode: "test",
        status: "processing",
        claimed_at: new Date().toISOString(),
      };
      return { data: [{ ...row }], error: null };
    },
    from(table) {
      const filters = [];
      let update = null;
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          filters.push((r) => r[k] === v);
          return q;
        },
        in(k, v) {
          filters.push((r) => v.includes(r[k]));
          return q;
        },
        lt(k, v) {
          filters.push((r) => r[k] < v);
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        update(v) {
          update = v;
          return q;
        },
        single() {
          return q;
        },
        then(resolve) {
          if (table === "payments")
            return Promise.resolve({
              data: { provider_payment_id: "pay_1" },
              error: null,
            }).then(resolve);
          const matches = row && filters.every((f) => f(row));
          if (update && matches) {
            if (saveFailure && update.provider_refund_id)
              return Promise.resolve({
                error: { code: "test" },
                data: null,
              }).then(resolve);
            Object.assign(row, update);
          }
          return Promise.resolve({
            data: update ? null : matches ? [{ ...row }] : [],
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
  };
  const receipt = () => ({
    id: "ref_1",
    type: "refund",
    attributes: {
      payment_id: mismatch ? "pay_other" : "pay_1",
      amount: 6000,
      currency: "PHP",
      livemode: false,
      status: providerStatus,
    },
  });
  const service = load("services/payments/refundServer.ts", {
    "./paymentServer": { paymentDatabase: () => db },
    "@/lib/payments/paymongo": { paymentMode: () => "test", PaymentError },
    "@/lib/payments/refundEvidence": proof,
    "@/lib/payments/payouts": {
      transferRequest: async (path, body) => {
        if (path.startsWith("/v1/payments/"))
          return {
            data: {
              id: "pay_1",
              attributes: {
                status: "paid",
                amount: 10000,
                currency: "PHP",
                livemode: false,
                disputed: false,
                refunds: externalRefund ? [{}] : [],
                source: { type: method },
              },
            },
          };
        if (body) {
          posts++;
          assert.equal(body.data.attributes.amount, 6000);
          assert.equal(body.data.attributes.payment_id, "pay_1");
          if (timeout) throw new Error("timeout");
        }
        return { data: receipt() };
      },
    },
  });
  return {
    row: () => row,
    posts: () => posts,
    send: () => service.refundCancelledPayment(db, "payment", "pay_1"),
    reconcile: () => service.reconcileRefunds(db, Date.now() + 60000),
  };
}
test("concurrent refund workers claim once; only independently retrieved evidence confirms refund", async () => {
  const h = fixture();
  await Promise.all([h.send(), h.send()]);
  assert.equal(h.posts(), 1);
  assert.equal(h.row().status, "pending");
  await h.reconcile();
  assert.equal(h.row().status, "refunded");
  assert.equal(await h.send(), false);
  assert.equal(h.posts(), 1);
});
test("ambiguous refund send or receipt persistence failure never automatically resends", async () => {
  for (const options of [{ timeout: true }, { saveFailure: true }]) {
    const h = fixture(options);
    await assert.rejects(h.send);
    assert.equal(h.row().status, "needs_review");
    assert.equal(await h.send(), false);
    assert.equal(h.posts(), 1);
  }
});
test("external refunds and indirect/unsupported payment methods are quarantined before sending", async () => {
  for (const options of [
    { externalRefund: true },
    { method: "brankas" },
    { method: "unknown" },
  ]) {
    const h = fixture(options);
    await assert.rejects(h.send);
    assert.equal(h.posts(), 0);
    assert.equal(h.row().status, "needs_review");
  }
});
test("mismatched provider receipts never confirm another payment refund", async () => {
  const h = fixture({ mismatch: true });
  await assert.rejects(h.send, /mismatch/);
  assert.equal(h.row().provider_refund_id, "ref_1");
  assert.equal(h.row().status, "needs_review");
});
test("pending and failed refunds do not become confirmed refunds", async () => {
  for (const providerStatus of ["pending", "processing", "failed"]) {
    const h = fixture({ providerStatus });
    await h.send();
    await h.reconcile();
    assert.equal(
      h.row().status,
      providerStatus === "failed" ? "failed" : "pending",
    );
    assert.equal(h.row().refunded_at, null);
  }
});
