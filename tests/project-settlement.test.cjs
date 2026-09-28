/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(path, modules = {}, env = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (n) => (n === "server-only" ? {} : (modules[n] ?? require(n))),
      process: { env },
      Buffer,
      Date,
      URL,
      Response,
      AbortSignal,
      ...globals,
    },
  );
  return exports;
}
const timing = load("lib/projectSettlement.ts");
test("automatic review uses the earlier cutoff, never before submission", () => {
  assert.equal(
    timing.automaticReviewAt("2026-10-01T10:00:00Z", "2026-10-03T10:00:00Z"),
    "2026-10-03T10:00:00.000Z",
  );
  assert.equal(
    timing.automaticReviewAt("2026-10-01T10:00:00Z", "2026-11-01T10:00:00Z"),
    "2026-10-08T10:00:00.000Z",
  );
  assert.equal(
    timing.automaticReviewAt("2026-10-04T10:00:00Z", "2026-10-03T10:00:00Z"),
    "2026-10-04T10:00:00.000Z",
  );
  assert.equal(
    timing.automaticReviewAt("2026-10-01T10:00:00Z", null),
    "2026-10-08T10:00:00.000Z",
  );
  assert.equal(timing.automaticReviewAt("invalid", null), null);
});
test("overdue warning leaves terminal projects alone", () => {
  const now = Date.parse("2026-10-03T10:00:00Z");
  for (const state of ["active", "revision", "in_progress"])
    assert.equal(
      timing.projectIsOverdue(state, "2026-10-01T10:00:00Z", now),
      true,
    );
  for (const state of ["completed", "cancelled", "rejected"])
    assert.equal(
      timing.projectIsOverdue(state, "2026-10-01T10:00:00Z", now),
      false,
    );
  assert.equal(timing.projectIsOverdue("active", null, now), false);
});
class PaymentError extends Error {}
const env = { PAYOUT_ACCOUNT_ENCRYPTION_KEY: "ab".repeat(32) };
const payout = load(
  "lib/payments/payouts.ts",
  { "./paymongo": { PaymentError, paymentMode: () => "test" } },
  env,
);
const destination = {
  name: "Test Recipient",
  number: "1234567890",
  bic: "BNORPHMM",
  provider: "instapay",
  bankLabel: "Test Bank",
};
test("destination encryption authenticates ciphertext and hides account details", () => {
  const a = payout.encryptDestination(destination),
    b = payout.encryptDestination(destination);
  assert.notEqual(a, b);
  assert.ok(!a.includes(destination.number));
  assert.equal(payout.decryptDestination(a).number, destination.number);
  const pieces = a.split(".");
  const bytes = Buffer.from(pieces[2], "base64url");
  bytes[0] ^= 1;
  pieces[2] = bytes.toString("base64url");
  assert.throws(() => payout.decryptDestination(pieces.join(".")));
});
test("payout is paid only for independently matching succeeded evidence", () => {
  const t = {
    id: "tr_1",
    reference_number: "payout",
    amount: 10000,
    currency: "PHP",
    status: "pending",
    destination_account: destination,
  };
  assert.equal(
    payout.verifiedTransferStatus(t, "payout", 100, destination),
    "pending",
  );
  assert.equal(
    payout.verifiedTransferStatus(
      { ...t, status: "succeeded" },
      "payout",
      100,
      destination,
    ),
    "paid",
  );
  assert.equal(
    payout.verifiedTransferStatus(
      { ...t, status: "failed" },
      "payout",
      100,
      destination,
    ),
    "failed",
  );
  for (const change of [
    { amount: 9000 },
    { currency: "USD" },
    { reference_number: "other" },
    { destination_account: { ...destination, number: "9999999999" } },
  ])
    assert.throws(() =>
      payout.verifiedTransferStatus(
        { ...t, ...change },
        "payout",
        100,
        destination,
      ),
    );
});
function workerHarness({
  timeout = false,
  refund = false,
  mismatch = false,
} = {}) {
  const payment = {
    payment_id: "payment",
    project_id: "project",
    order_id: "order",
    payer_id: "client",
    amount: 100,
    status: "paid",
    transaction_reference: "cs_1",
    payment_method: "gcash",
  };
  const row = {
    payout_id: "payout",
    payment_id: "payment",
    project_id: "project",
    amount: 100,
    mode: "test",
    encrypted_destination: "encrypted",
    status: "ready",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
  const records = { payments: [payment], project_payouts: [row] };
  let posts = 0,
    reviews = 0;
  const db = {
    from(table) {
      let filters = [],
        mutation = null,
        one = false;
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          filters.push((r) => r[k] === v);
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
          mutation = v;
          return q;
        },
        single() {
          one = true;
          return q;
        },
        then(resolve, reject) {
          try {
            const rows = records[table].filter((r) =>
              filters.every((f) => f(r)),
            );
            if (mutation) rows.forEach((r) => Object.assign(r, mutation));
            return Promise.resolve({
              data: one ? rows[0] : rows,
              error: null,
            }).then(resolve, reject);
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        },
      };
      return q;
    },
    async rpc(name) {
      if (name === "worksync_settle_project") {
        reviews++;
        return { error: null };
      }
      if (row.status !== "ready") return { data: [], error: null };
      row.status = "processing";
      row.claimed_at = new Date().toISOString();
      return { data: [{ ...row }], error: null };
    },
  };
  const transfer = {
    id: "tr_1",
    reference_number: "payout",
    amount: 10000,
    currency: "PHP",
    status: "succeeded",
    destination_account: destination,
  };
  const worker = load("services/payments/settlementServer.ts", {
    "./paymentServer": {
      paymentDatabase: () => db,
      reconcilePayment: async () => true,
    },
    "@/lib/payments/paymongo": {
      paymentId: () => "payment",
      paymentMode: () => "test",
      PaymentError,
      paymongo: async () => ({
        attributes: {
          payments: [{ id: "pay_1", attributes: { status: "paid" } }],
        },
      }),
    },
    "@/lib/payments/payouts": {
      decryptDestination: () => destination,
      payoutSource: () => ({
        number: "wallet",
        name: "Test Merchant",
        bic: "PAEYPHM2XXX",
      }),
      verifiedTransferStatus: payout.verifiedTransferStatus,
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
                refunds: refund ? [{}] : [],
              },
            },
          };
        if (body) {
          posts++;
          if (timeout) throw new Error("timeout");
          return {
            data: {
              id: "btr_1",
              transfers: [{ ...transfer, status: "pending" }],
            },
          };
        }
        return {
          data: {
            ...transfer,
            reference_number: mismatch ? "wrong" : "payout",
          },
        };
      },
    },
  });
  return { worker, row, posts: () => posts, reviews: () => reviews };
}
test("repeated and concurrent workers send once and reconcile paid", async () => {
  const h = workerHarness();
  await Promise.all([h.worker.settleProjects(), h.worker.settleProjects()]);
  await h.worker.settleProjects();
  assert.equal(h.posts(), 1);
  assert.equal(h.row.status, "paid");
});
test("ambiguous provider POST is quarantined, never automatically retried", async () => {
  const h = workerHarness({ timeout: true });
  await h.worker.settleProjects();
  await h.worker.settleProjects();
  assert.equal(h.posts(), 1);
  assert.equal(h.row.status, "needs_review");
});
test("refunded funding does not auto-approve or send a payout", async () => {
  const h = workerHarness({ refund: true });
  await h.worker.settleProjects();
  assert.equal(h.posts(), 0);
  assert.equal(h.reviews(), 0);
  assert.equal(h.row.status, "ready");
});
test("mismatching provider evidence never marks payout paid", async () => {
  const h = workerHarness({ mismatch: true });
  await h.worker.settleProjects();
  assert.equal(h.posts(), 1);
  assert.equal(h.row.status, "pending");
});
test("cron rejects missing credentials and leaves disabled automation inert", async () => {
  let calls = 0;
  const modules = {
    "@/services/payments/settlementServer": {
      settleProjects: async () => {
        calls++;
        return {};
      },
    },
  };
  const disabled = load("app/api/cron/project-settlement/route.ts", modules, {
    CRON_SECRET: "secret",
  });
  assert.equal(
    (await disabled.GET(new Request("https://example.test"))).status,
    401,
  );
  assert.equal(
    (
      await disabled.GET(
        new Request("https://example.test", {
          headers: { authorization: "Bearer secret" },
        }),
      )
    ).status,
    200,
  );
  assert.equal(calls, 0);
});
