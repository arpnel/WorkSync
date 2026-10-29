/* eslint-disable @typescript-eslint/no-require-imports -- Node source regression test. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync(
  "supabase/migrations/202610280004_job_agreement_returns_order_id.sql",
  "utf8",
);
const functionDefinition = migration.match(
  /create or replace function public\.worksync_job_agreement[\s\S]*?\$\$;/i,
)?.[0];
const functionBody = functionDefinition?.match(/as \$\$([\s\S]*?)\$\$;/i)?.[1];

test("job agreement RPC returns the service order ID, not its contract ID", () => {
  assert.ok(functionBody, "migration must define the RPC body");
  assert.match(functionBody, /returning order_id into service_order_id/i);
  assert.match(functionBody, /returning contract_id into agreement_contract_id/i);
  assert.match(functionBody, /return service_order_id;/i);
  assert.doesNotMatch(functionBody, /return agreement_contract_id;/i);
  assert.match(migration, /position\('return k;' in deployed_definition\)/i);
});

test("the RPC result stays an order ID through navigation and workspace loading", () => {
  const button = fs.readFileSync(
    "components/project/JobAgreementButton.tsx",
    "utf8",
  );
  const route = fs.readFileSync(
    "app/home/projects/standard/[orderId]/page.tsx",
    "utf8",
  );
  const createContractPage = fs.readFileSync(
    "app/home/projects/create-contract/[applicationId]/page.tsx",
    "utf8",
  );
  const projectsPage = fs.readFileSync("app/home/projects/page.tsx", "utf8");
  const workspace = fs.readFileSync(
    "services/project/projectWorkspaceService.ts",
    "utf8",
  );

  assert.match(button, /\/home\/projects\/create-contract\/\$\{applicationId\}/);
  assert.match(createContractPage, /platformAction\("worksync_job_agreement"/);
  assert.match(createContractPage, /\.eq\("order_id", rpcResult\)/);
  assert.match(createContractPage, /router\.push\(`\/home\/projects\/standard\/\$\{serviceOrderId\}/);
  assert.match(route, /params: Promise<\{ orderId: string \}>/);
  assert.match(route, /const \[\{ orderId: serviceOrderId \}, query\] = await Promise\.all\(\[params, searchParams\]\)/);
  assert.match(route, /serviceOrderId=\{serviceOrderId\}/);
  assert.match(
    projectsPage,
    /serviceRequests=\{displayProjects\.filter\([\s\S]*?project\.status === "Request"/,
  );
  assert.match(workspace, /\.eq\("order_id", serviceOrderId\)/);
});

