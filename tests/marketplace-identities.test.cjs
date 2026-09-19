/* eslint-disable @typescript-eslint/no-require-imports -- Node TypeScript test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
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
      require: (name) => modules[name] ?? require(name),
      Response,
      console,
      process: {
        env: {
          SUPABASE_SERVICE_ROLE_KEY: "server-test",
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        },
      },
      ...globals,
    },
  );
  return exports;
}
const clientId = "11111111-1111-4111-a111-111111111111";
const freelancerId = "22222222-2222-4222-a222-222222222222";
const clientUser = "33333333-3333-4333-a333-333333333333";
const freelancerUser = "44444444-4444-4444-a444-444444444444";
const identities = {
  clients: [{ client_id: clientId, user_id: clientUser }],
  freelancers: [
    {
      freelancer_id: freelancerId,
      user_id: freelancerUser,
      headline: "Developer",
      hourly_rate: 100,
      verification_status: "pending",
    },
  ],
  profiles: [
    {
      user_id: clientUser,
      display_name: "Client Name",
      first_name: "Private first",
      last_name: "Client",
      avatar_url: "client.png",
      location: "Cebu",
    },
    {
      user_id: freelancerUser,
      display_name: "Freelancer Name",
      first_name: "Freelancer",
      last_name: "Name",
      avatar_url: "freelancer.png",
      location: "Cebu",
    },
  ],
};
function identityRoute(authenticated = true) {
  const selections = [];
  const db = {
    auth: {
      getUser: async () => ({
        data: { user: authenticated ? { id: clientUser } : null },
        error: null,
      }),
    },
    from(table) {
      const query = {
        select(fields) {
          selections.push({ table, fields });
          return query;
        },
        or() {
          return query;
        },
        in() {
          return query;
        },
        then(resolve) {
          return Promise.resolve({
            data:
              table === "profiles"
                ? identities.profiles
                : table === "client_profiles"
                  ? identities.clients
                  : identities.freelancers,
            error: null,
          }).then(resolve);
        },
      };
      return query;
    },
  };
  return {
    selections,
    route: load("app/api/profiles/identities/route.ts", {
      "@supabase/supabase-js": { createClient: () => db },
    }),
  };
}
test("public identity lookup requires authenticated session and bounded UUID input", async () => {
  const h = identityRoute();
  const unauthenticated = await h.route.POST(
    new Request("http://localhost/api/profiles/identities", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(unauthenticated.status, 401);
  for (const body of [
    { clientIds: ["not-uuid"] },
    { userIds: Array(41).fill(clientUser) },
    { email: "someone@example.test" },
  ]) {
    const response = await h.route.POST(
      new Request("http://localhost/api/profiles/identities", {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: JSON.stringify(body),
      }),
    );
    assert.equal(response.status, 400);
  }
  const expired = identityRoute(false);
  const response = await expired.route.POST(
    new Request("http://localhost/api/profiles/identities", {
      method: "POST",
      headers: { authorization: "Bearer expired" },
      body: "{}",
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(h.selections.length, 0);
  assert.equal(expired.selections.length, 0);
});
test("both role IDs resolve to public profile fields without querying private account/document fields", async () => {
  const h = identityRoute();
  const response = await h.route.POST(
    new Request("http://localhost/api/profiles/identities", {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({
        clientIds: [clientId],
        freelancerIds: [freelancerId],
      }),
    }),
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.profiles.length, 2);
  assert.equal(data.clients[0].user_id, clientUser);
  for (const selection of h.selections) {
    assert.notEqual(selection.table, "Users");
    assert.doesNotMatch(
      selection.fields,
      /email|resume|government|certification|\*/,
    );
  }
});
function requestsHarness(viewer) {
  const db = {
    auth: {
      getUser: async () => ({ data: { user: { id: viewer } }, error: null }),
    },
    from(table) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        in() {
          return query;
        },
        order() {
          return query;
        },
        maybeSingle: () => result(true),
        then: (resolve) => result(false).then(resolve),
      };
      async function result(single) {
        if (
          !single &&
          ["client_profiles", "freelancer_profiles"].includes(table)
        )
          return { data: [], error: null };
        if (table === "Users")
          throw new Error("Private account rows must not be requested");
        if (table === "client_profiles")
          return {
            data: viewer === clientUser ? { client_id: clientId } : null,
            error: null,
          };
        if (table === "freelancer_profiles")
          return {
            data:
              viewer === freelancerUser
                ? { freelancer_id: freelancerId }
                : null,
            error: null,
          };
        if (table === "jobs")
          return {
            data: [
              {
                job_id: "job",
                client_id: clientId,
                title: "Job",
                category_id: null,
              },
            ],
            error: null,
          };
        if (table === "job_applications")
          return {
            data: [
              {
                application_id: "application",
                job_id: "job",
                freelancer_id: freelancerId,
                status: "pending",
              },
            ],
            error: null,
          };
        return { data: [], error: null };
      }
      return query;
    },
  };
  // Public role rows can be filtered by RLS in the browser; identity lookup still resolves them.
  const service = load("services/project/projectRequestService.ts", {
    "@/lib/supabaseClient": { supabase: db },
    "@/services/platform/platformService": {},
    "@/lib/ai/screening": { screeningLabel: (v) => v },
    "@/services/profile/publicIdentityService": {
      getPublicIdentities: async () => identities,
      identityName: (profile, fallback) => profile?.display_name || fallback,
    },
  });
  return service;
}
test("client request inbox resolves the applicant name/avatar/user ID when browser profile rows are hidden", async () => {
  const result = await requestsHarness(clientUser).getProjectRequests();
  assert.equal(result.received[0].freelancerName, "Freelancer Name");
  assert.equal(result.received[0].freelancerAvatar, "freelancer.png");
  assert.equal(result.received[0].freelancerUserId, freelancerUser);
  assert.equal(result.received[0].currentParty, "client");
});
test("freelancer sent applications include the hiring client identity", async () => {
  // The freelancer enrichment query returns a list while the own-role lookup returns an object.
  const result = await requestsHarness(freelancerUser).getProjectRequests();
  assert.equal(result.sent[0].clientName, "Client Name");
  assert.equal(result.sent[0].clientUserId, clientUser);
  assert.equal(result.sent[0].currentParty, "freelancer");
});

test("Buy resolves hidden owner profiles and still rejects buying your own service", async () => {
  let viewer = clientUser;
  let writes = 0;
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: viewer } } }) },
    from(table) {
      assert.equal(table, "services");
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        maybeSingle: async () => ({
          data: {
            service_id: "service",
            freelancer_id: freelancerId,
            status: "Active",
            is_archived: false,
          },
          error: null,
        }),
      };
      return query;
    },
  };
  const service = load("services/marketplace/MarketplaceServices.ts", {
    "@/lib/supabaseClient": { supabase: db },
    "@/services/platform/platformService": {
      platformAction: async () => {
        writes++;
        return "order";
      },
    },
    "@/services/profile/publicIdentityService": {
      getPublicIdentities: async () => identities,
    },
  });
  const details = {
    projectTitle: "Project",
    description: "Requirements",
    budget: 100,
    deliveryTimeDays: 3,
    revisionsCount: 1,
    categoryId: "category",
    categoryName: "Development",
  };
  assert.equal(
    await service.createMarketplaceOrder(
      "service",
      clientId,
      freelancerId,
      details,
    ),
    "order",
  );
  viewer = freelancerUser;
  await assert.rejects(
    service.createMarketplaceOrder("service", clientId, freelancerId, details),
    /own service/,
  );
  assert.equal(writes, 1);
});

test("Apply retries only missing RPC signatures and never retries a rejected application", async () => {
  for (const code of ["PGRST202", "P0001"]) {
    const calls = [];
    const db = {
      auth: {
        getUser: async () => ({ data: { user: { id: freelancerUser } } }),
      },
      rpc: async (name, args) => {
        calls.push(args);
        return calls.length === 1
          ? { data: null, error: { code, message: "Rejected" } }
          : { data: "application", error: null };
      },
    };
    const route = load("app/api/applications/route.ts", {
      "next/server": { after: () => {} },
      "@supabase/supabase-js": { createClient: () => db },
      "@/services/project/automaticScreeningServer": {},
    });
    const response = await route.POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: JSON.stringify({
          jobId: clientId,
          proposal: "Proposal",
          price: 100,
          days: 3,
        }),
      }),
    );
    assert.equal(response.status, code === "PGRST202" ? 201 : 400);
    assert.equal(calls.length, code === "PGRST202" ? 2 : 1);
    if (calls.length === 2) assert.equal(calls[1].p_job, clientId);
  }
});
