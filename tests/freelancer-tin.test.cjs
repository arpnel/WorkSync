/* eslint-disable @typescript-eslint/no-require-imports -- Node TypeScript test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");

class PaymentError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

function makeDb({ freelancer = true, failProfile = false, failTinRead = false, failWrite = false } = {}) {
  const rows = new Map();
  const writes = [];
  const db = {
    from(table) {
      let userId;
      const query = {
        select() { return query; },
        eq(column, value) { assert.equal(column, "user_id"); userId = value; return query; },
        async maybeSingle() {
          if (table === "freelancer_profiles") {
            if (failProfile) return { data: null, error: new Error("database failure") };
            return { data: freelancer ? { user_id: userId } : null, error: null };
          }
          if (failTinRead) return { data: null, error: new Error("database failure") };
          const row = rows.get(userId);
          return { data: row ? { user_id: row.user_id } : null, error: null };
        },
        async upsert(values, options) {
          writes.push({ table, values: { ...values }, options });
          if (failWrite) return { error: new Error("database failure") };
          const existing = rows.get(values.user_id);
          rows.set(values.user_id, {
            ...existing,
            ...values,
            created_at: existing?.created_at ?? "database-default-created-at",
          });
          return { error: null };
        },
      };
      return query;
    },
  };
  return { db, rows, writes };
}

function loadRoute(state) {
  const exports = {};
  const taxExports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/tax/taxIdentifier.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: taxExports,
    require: (id) => id === "server-only" ? {} : id === "node:crypto" ? crypto : id === "@/lib/payments/paymongo" ? { PaymentError } : null,
    process,
    Buffer,
  });
  const paymentResponse = (error) => Response.json({ error: error instanceof PaymentError ? error.message : "Payment service is temporarily unavailable." }, {
    status: error instanceof PaymentError ? error.status : 503,
    headers: { "Cache-Control": "no-store" },
  });
  const requireMock = (id) => {
    if (id === "@/lib/payments/paymongo") return { PaymentError };
    if (id === "@/lib/tax/taxIdentifier") return taxExports;
    if (id === "@/services/payments/paymentServer") return {
      paymentUser: async () => {
        if (state.authError) throw state.authError;
        return { db: state.db, user: { id: state.userId ?? "freelancer-1" } };
      },
      paymentResponse,
    };
    throw new Error(`Unexpected import: ${id}`);
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/api/freelancer-tax-profile/tin/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: requireMock, Response, process, Date });
  return exports;
}

function request(method, body) {
  return new Request("https://worksync.test/api/freelancer-tax-profile/tin", {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

test("TIN submission inserts encrypted data and self-attributed audit fields", async () => {
  const state = makeDb();
  const route = loadRoute(state);
  process.env.TAX_IDENTIFIER_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  const response = await route.PUT(request("PUT", { tin: "123-456-789-000", user_id: "someone-else" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { hasTin: true });
  assert.equal(state.writes[0].table, "freelancer_tax_identifiers");
  assert.equal(state.writes[0].options.onConflict, "user_id");
  assert.equal(state.writes[0].values.user_id, "freelancer-1");
  assert.equal(state.writes[0].values.created_by, "freelancer-1");
  assert.equal(state.writes[0].values.updated_by, "freelancer-1");
  assert.match(state.writes[0].values.encrypted_tin, /^[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.doesNotMatch(JSON.stringify(state.writes[0].values), /123456789000/);
});

test("TIN submission updates an existing row without changing original creation time", async () => {
  const state = makeDb();
  const route = loadRoute(state);
  process.env.TAX_IDENTIFIER_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  await route.PUT(request("PUT", { tin: "123456789" }));
  const originalCreatedAt = state.rows.get("freelancer-1").created_at;
  await route.PUT(request("PUT", { tin: "987654321" }));
  assert.equal(state.writes.length, 2);
  assert.equal(state.rows.get("freelancer-1").created_at, originalCreatedAt);
  assert.equal(state.rows.get("freelancer-1").updated_by, "freelancer-1");
});

test("only an authenticated freelancer can read or write their own TIN", async () => {
  const noSession = loadRoute({ authError: new PaymentError("Sign in.", 401) });
  assert.equal((await noSession.PUT(request("PUT", { tin: "123456789" }))).status, 401);
  const client = loadRoute(makeDb({ freelancer: false }));
  const response = await client.PUT(request("PUT", { tin: "123456789" }));
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /Only freelancers/);
});

test("invalid TIN input is rejected before any database write", async () => {
  const state = makeDb();
  const route = loadRoute(state);
  for (const tin of ["TIN-123", "TIN123456789"]) {
    const response = await route.PUT(request("PUT", { tin }));
    assert.equal(response.status, 400);
  }
  assert.equal(state.writes.length, 0);
});

test("missing encryption configuration fails closed without writing", async () => {
  const state = makeDb();
  const route = loadRoute(state);
  delete process.env.TAX_IDENTIFIER_ENCRYPTION_KEY;
  const response = await route.PUT(request("PUT", { tin: "123456789" }));
  assert.equal(response.status, 503);
  assert.equal(state.writes.length, 0);
});

test("database failures return an error without disclosing stored data", async () => {
  const route = loadRoute(makeDb({ failWrite: true }));
  process.env.TAX_IDENTIFIER_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  const response = await route.PUT(request("PUT", { tin: "123456789" }));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /123456789|encrypted_tin/);
});

test("TIN status response exposes only whether a value exists", async () => {
  const state = makeDb();
  state.rows.set("freelancer-1", { user_id: "freelancer-1", encrypted_tin: "secret-ciphertext" });
  const route = loadRoute(state);
  const response = await route.GET(request("GET"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { hasTin: true });
});
