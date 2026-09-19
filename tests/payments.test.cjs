/* eslint-disable @typescript-eslint/no-require-imports -- Node TypeScript test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");
function load(path, modules = {}, globals = {}) {
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
      require: (name) =>
        name === "server-only" ? {} : (modules[name] ?? require(name)),
      Buffer,
      URL,
      Response,
      AbortSignal,
      process: {
        env: {
          PAYMONGO_SECRET_KEY: "sk_test_placeholder",
          PAYMONGO_WEBHOOK_SECRET: "signing_secret",
          SUPABASE_SERVICE_ROLE_KEY: "placeholder",
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        },
      },
      ...globals,
    },
  );
  return exports;
}
const provider = load("lib/payments/paymongo.ts");
test("amounts use exact PHP centavos and reject invalid/minimum amounts", () => {
  assert.equal(provider.centavos("120.25"), 12025);
  for (const amount of [-1, 0, 19.99, 20.001, "bad", Infinity, 1e20])
    assert.throws(() => provider.centavos(amount));
});
test("reservations are stable, valid UUIDs, isolated by project and mode", () => {
  const id = provider.paymentId("project");
  assert.match(
    id,
    /^[a-f\d]{8}-[a-f\d]{4}-5[a-f\d]{3}-a[a-f\d]{3}-[a-f\d]{12}$/,
  );
  assert.equal(id, provider.paymentId("project"));
  assert.notEqual(id, provider.paymentId("project", "live"));
  assert.notEqual(id, provider.paymentId("another"));
  assert.equal(provider.paymentId("ABC"), provider.paymentId("abc"));
});

function checkoutHarness({ ready = true, signed = true, onHold = false, existing = null, conflict = false } = {}) {
  const calls = [];
  const db = {
    rpc: async () => ({ data: ready, error: null }),
    from(table) {
      let operation = "select", values;
      const query = {
        select() { return query; }, eq() { return query; }, in() { return query; }, is() { return query; }, limit() { return query; },
        insert(value) { operation = "insert"; values = value; return query; },
        update(value) { operation = "update"; values = value; return query; },
        single() { return result(true); }, maybeSingle() { return result(true); },
        then(resolve, reject) { return result(false).then(resolve, reject); },
      };
      async function result(single) {
        if (operation !== "select") { calls.push({ table, operation, values }); return { error: conflict && operation === "insert" ? { code: "23505" } : null }; }
        let data;
        if (table === "projects") data = { project_id: "project", order_id: "order", client_id: "cp", freelancer_id: "fp", title: "Project", status: "active" };
        if (table === "client_profiles") data = { user_id: "client" };
        if (table === "freelancer_profiles") data = { user_id: "freelancer" };
        if (table === "contracts") data = { final_price: 150, client_signed_at: signed ? "date" : null, freelancer_signed_at: "date", status: "active" };
        if (table === "project_disputes") data = onHold ? [{ dispute_id: "d" }] : [];
        if (table === "project_cancellations") data = [];
        if (table === "payments") data = single ? existing : [];
        return { data, error: null };
      }
      return query;
    },
  };
  const server = load("services/payments/paymentServer.ts", {
    "@supabase/supabase-js": {},
    "@/lib/payments/paymongo": { ...provider, paymongo: async (path, attributes) => { calls.push({ provider: path, attributes }); return { id: "cs_example", attributes: { checkout_url: "https://checkout.paymongo.com/example" } }; } },
  });
  return { server, db, calls };
}
test("unrelated users and freelancers cannot start a client checkout", async () => {
  for (const user of ["attacker", "freelancer"]) {
    const h = checkoutHarness();
    await assert.rejects(h.server.createProjectCheckout(h.db, "project", user, "http://localhost:3000"), { status: 403 });
    assert.equal(h.calls.length, 0);
  }
  const h = checkoutHarness();
  await assert.rejects(h.server.getProjectPayment(h.db, "project", "attacker"), { status: 403 });
});
test("security setup, unsigned agreement, and project hold prevent checkout", async () => {
  for (const options of [{ ready: false }, { signed: false }, { onHold: true }]) {
    const h = checkoutHarness(options);
    await assert.rejects(h.server.createProjectCheckout(h.db, "project", "client", "http://localhost:3000"));
    assert.equal(h.calls.length, 0);
  }
});
test("checkout reserves storage first and charges only the server agreement amount", async () => {
  const h = checkoutHarness();
  const result = await h.server.createProjectCheckout(h.db, "project", "client", "http://localhost:3000");
  assert.equal(result.checkoutUrl, "https://checkout.paymongo.com/example");
  assert.equal(h.calls[0].operation, "insert");
  assert.equal(h.calls[0].values.amount, 150);
  assert.equal(h.calls[1].attributes.line_items[0].amount, 15000);
  assert.equal(h.calls[2].values.transaction_reference, "cs_example");
});
test("concurrent reservation conflict and ambiguous pending reservation never create a second checkout", async () => {
  for (const options of [{ conflict: true }, { existing: { ...row, transaction_reference: null } }]) {
    const h = checkoutHarness(options);
    await assert.rejects(h.server.createProjectCheckout(h.db, "project", "client", "http://localhost:3000"));
    assert.equal(h.calls.filter(c => c.provider).length, 0);
  }
});
test("webhook requires exact raw-body HMAC, correct mode, and recent timestamp", () => {
  const raw = '{"data":{"type":"checkout_session.payment.paid"}}';
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto
    .createHmac("sha256", "signing_secret")
    .update(`${t}.${raw}`)
    .digest("hex");
  assert.doesNotThrow(() =>
    provider.verifyWebhook(raw, `t=${t},te=${sig},li=`),
  );
  assert.throws(() => provider.verifyWebhook(raw + " ", `t=${t},te=${sig}`));
  assert.throws(() => provider.verifyWebhook(raw, `t=${t},li=${sig}`));
  assert.throws(() =>
    provider.verifyWebhook(raw, `t=${t},te=${sig}`, (t + 301) * 1000),
  );
  assert.throws(() => provider.verifyWebhook(raw, "t=NaN,te=abcd"));
});
test("checkout redirects are restricted to PayMongo HTTPS", () => {
  assert.equal(
    provider.checkoutUrl({
      attributes: { checkout_url: "https://checkout.paymongo.com/test" },
    }),
    "https://checkout.paymongo.com/test",
  );
  for (const url of [
    "javascript:alert(1)",
    "https://checkout.paymongo.com.attacker.com",
    "http://checkout.paymongo.com/test",
  ])
    assert.throws(() =>
      provider.checkoutUrl({ attributes: { checkout_url: url } }),
    );
});
const row = {
  payment_id: "reservation",
  project_id: "project",
  payer_id: "client",
  amount: 100,
  transaction_reference: "cs_example",
  status: "pending",
};
function session() {
  return {
    id: "cs_example",
    attributes: {
      reference_number: "reservation",
      metadata: { project_id: "project", payer_id: "client" },
      livemode: false,
      payments: [
        {
          id: "pay_example",
          attributes: {
            status: "paid",
            amount: 10000,
            currency: "PHP",
            source: { type: "gcash" },
          },
        },
      ],
    },
  };
}
function serverWithWrites(fail = false) {
  const writes = [];
  const db = {
    from: () => ({
      update: (value) => ({
        eq: async () => {
          writes.push(value);
          return { error: fail ? {} : null };
        },
      }),
    }),
  };
  return {
    writes,
    db,
    server: load("services/payments/paymentServer.ts", {
      "@/lib/payments/paymongo": provider,
      "@supabase/supabase-js": {},
    }),
  };
}
test("only matching verified paid evidence persists payment, including webhook replay", async () => {
  const { server, db, writes } = serverWithWrites();
  assert.equal(await server.reconcilePayment(db, row, session()), true);
  assert.equal(await server.reconcilePayment(db, row, session()), true);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].status, "paid");
  assert.equal(writes[0].payment_method, "gcash");
});
test("unpaid or failed provider attempts never become paid", async () => {
  const { server, db, writes } = serverWithWrites();
  const s = session();
  s.attributes.payments[0].attributes.status = "failed";
  assert.equal(await server.reconcilePayment(db, row, s), false);
  assert.equal(writes.length, 0);
});
test("mismatched amount, currency, payer, project, mode, reference, session cannot persist", async () => {
  const mutations = [
    (s) => (s.attributes.payments[0].attributes.amount = 9000),
    (s) => (s.attributes.payments[0].attributes.currency = "USD"),
    (s) => (s.attributes.metadata.payer_id = "attacker"),
    (s) => (s.attributes.metadata.project_id = "another"),
    (s) => (s.attributes.livemode = true),
    (s) => (s.attributes.reference_number = "another"),
    (s) => (s.id = "cs_other"),
  ];
  for (const mutate of mutations) {
    const { server, db, writes } = serverWithWrites();
    const s = session();
    mutate(s);
    await assert.rejects(server.reconcilePayment(db, row, s));
    assert.equal(writes.length, 0);
  }
});
test("a signed provider session can recover an unsaved reference; DB failure requests retry", async () => {
  const { server, db } = serverWithWrites();
  assert.equal(
    await server.reconcilePayment(
      db,
      { ...row, transaction_reference: null },
      session(),
    ),
    true,
  );
  const failing = serverWithWrites(true);
  await assert.rejects(
    failing.server.reconcilePayment(failing.db, row, session()),
  );
});
test("API rejects browser amounts and unauthenticated requests before checkout", async () => {
  let creates = 0;
  const route = load("app/api/payments/route.ts", {
    "@/lib/payments/paymongo": provider,
    "@/services/payments/paymentServer": {
      paymentUser: async (request) => {
        if (!request.headers.get("authorization"))
          throw new provider.PaymentError("Sign in", 401);
        return { db: {}, user: { id: "client" } };
      },
      createProjectCheckout: async () => {
        creates++;
        return {};
      },
      paymentResponse: (error) =>
        Response.json(
          { error: error.message },
          { status: error.status || 503 },
        ),
    },
  });
  const Request = globalThis.Request;
  const denied = await route.POST(
    new Request("http://localhost:3000/api/payments", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(denied.status, 401);
  const altered = await route.POST(
    new Request("http://localhost:3000/api/payments", {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({
        projectId: "11111111-1111-4111-a111-111111111111",
        amount: 1,
      }),
    }),
  );
  assert.equal(altered.status, 400);
  assert.equal(creates, 0);
});
