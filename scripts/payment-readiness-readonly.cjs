/* eslint-disable @typescript-eslint/no-require-imports */
// Reads metadata only. Never creates sessions, transfers, or invokes settlement.
const { createRequire } = require("node:module");
const { loadEnvConfig } = createRequire(require.resolve("next/package.json"))(
  "@next/env",
);
loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const names = [
  "PAYMONGO_SECRET_KEY",
  "PAYMONGO_WEBHOOK_SECRET",
  "PAYMONGO_PAYMENT_METHODS",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "APP_URL",
  "PAYOUT_ACCOUNT_ENCRYPTION_KEY",
  "PAYMONGO_PAYOUT_SOURCE_NUMBER",
  "PAYMONGO_PAYOUT_SOURCE_NAME",
  "CRON_SECRET",
  "PROJECT_SETTLEMENT_ENABLED",
];
const result = {
  scope: "Local environment only; not Vercel configuration",
  environment: Object.fromEntries(
    names.map((n) => [n, Boolean(process.env[n]?.trim())]),
  ),
  mode: /^sk_live_/.test(process.env.PAYMONGO_SECRET_KEY || "")
    ? "live"
    : /^sk_test_/.test(process.env.PAYMONGO_SECRET_KEY || "")
      ? "test"
      : "invalid_or_missing",
  settlementEnabled: process.env.PROJECT_SETTLEMENT_ENABLED === "true",
  probes: {},
};
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const base = new URL(url);
    if (base.protocol !== "https:" || !base.hostname.endsWith(".supabase.co"))
      throw new Error("Unexpected database host");
    const headers = { apikey: key, Authorization: "Bearer " + key };
    const checks = {
      payments:
        "payment_id,project_id,order_id,payer_id,amount,status,transaction_reference,provider_payment_id,settlement_checked_at",
      projects:
        "project_id,order_id,application_id,client_id,freelancer_id,budget,status",
      project_submissions:
        "submission_id,project_id,milestone_id,author_id,kind,status,created_at,reviewed_at,auto_reviewed_at",
      freelancer_payout_accounts:
        "user_id,mode,encrypted_destination,bank_label,account_last4,updated_at",
      project_payouts:
        "payout_id,project_id,payment_id,recipient_id,mode,amount,status,encrypted_destination,provider_batch_id,provider_transfer_id,claimed_at,paid_at,updated_at",
    };
    await Promise.all(
      Object.entries(checks).map(async ([table, select]) => {
        try {
          const r = await fetch(
            new URL(
              "/rest/v1/" + table + "?select=" + select + "&limit=0",
              base,
            ),
            { headers, signal: AbortSignal.timeout(15000) },
          );
          const b = await r.json().catch(() => null);
          result.probes[table] = {
            http: r.status,
            code: !r.ok && typeof b?.code === "string" ? b.code : null,
          };
        } catch {
          result.probes[table] = { networkError: true };
        }
      }),
    );
    try {
      const r = await fetch(new URL("/rest/v1/", base), {
        headers: { ...headers, Accept: "application/openapi+json" },
        signal: AbortSignal.timeout(15000),
      });
      const b = await r.json();
      result.probes.rpcSchema = {
        http: r.status,
        functions: Object.fromEntries(
          [
            "worksync_payment_storage_ready",
            "worksync_settle_project",
            "worksync_claim_payout",
          ].map((n) => [
            n,
            b.paths?.["/rpc/" + n]?.post?.parameters
              ?.filter((p) => p.in === "body")
              .map((p) => p.schema) ?? null,
          ]),
        ),
      };
    } catch {
      result.probes.rpcSchema = { networkError: true };
    }
  }
  // Local key capability only. No wallet identities, balances, or body output.
  if (process.env.PAYMONGO_SECRET_KEY) {
    try {
      const r = await fetch("https://api.paymongo.com/v2/wallets", {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(process.env.PAYMONGO_SECRET_KEY.trim() + ":").toString(
              "base64",
            ),
        },
        signal: AbortSignal.timeout(15000),
      });
      result.probes.walletCapability = { http: r.status };
      await r.body?.cancel();
    } catch {
      result.probes.walletCapability = { networkError: true };
    }
  }
  console.log(JSON.stringify(result, null, 2));
}
main().catch(() => {
  console.error(
    "Read-only diagnostic failed; no credential or response payload printed.",
  );
  process.exitCode = 1;
});
