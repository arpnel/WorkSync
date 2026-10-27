/* eslint-disable @typescript-eslint/no-require-imports -- Node TypeScript test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadAppUrl(env) {
  const exports = {};
  const source = fs.readFileSync("lib/appUrl.ts", "utf8");
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, process: { env }, URL },
  );
  return exports;
}

test("production return origin overrides a stale Vercel APP_URL", () => {
  const appUrl = loadAppUrl({
    VERCEL_ENV: "production",
    APP_URL: "https://old-deployment.vercel.app",
  });
  const origin = appUrl.getWorkSyncOrigin("https://old-deployment.vercel.app/api/payments");
  assert.equal(origin, "https://worksync.website");
  assert.equal(
    appUrl.getWorkSyncUrl("/home/payments/return?payment=project", "https://old-deployment.vercel.app/api/payments"),
    "https://worksync.website/home/payments/return?payment=project",
  );
  const subscriptionReturn = appUrl.getWorkSyncUrl(
    `/home/subscription?order=${encodeURIComponent("order-id")}`,
    "https://old-deployment.vercel.app/api/subscriptions/checkout",
  );
  assert.equal(subscriptionReturn, "https://worksync.website/home/subscription?order=order-id");
  assert.equal(`${subscriptionReturn}&cancelled=1`, "https://worksync.website/home/subscription?order=order-id&cancelled=1");
});

test("local checkout return origin stays on the local development host", () => {
  const appUrl = loadAppUrl({ VERCEL_ENV: "development", APP_URL: "" });
  assert.equal(appUrl.getWorkSyncOrigin("http://localhost:3000/api/payments"), "http://localhost:3000");
});

test("project, service-order, and subscription checkout return paths retain their identifiers", () => {
  const paymentServer = fs.readFileSync("services/payments/paymentServer.ts", "utf8");
  const subscriptionRoute = fs.readFileSync("app/api/subscriptions/checkout/route.ts", "utf8");
  const subscriptionServer = fs.readFileSync("services/subscriptions/subscriptionServer.ts", "utf8");
  assert.match(paymentServer, /\/home\/payments\/return\?payment=\$\{encodeURIComponent\(projectId\)\}/);
  assert.match(paymentServer, /cancel_url: `\$\{returnUrl\}&cancelled=1`/);
  assert.match(subscriptionRoute, /getWorkSyncOrigin\(request\.url\)/);
  assert.match(subscriptionServer, /\/home\/subscription\?order=\$\{encodeURIComponent\(orderId\)\}/);
  assert.match(subscriptionServer, /cancel_url: `\$\{returnUrl\}&cancelled=1`/);
});
