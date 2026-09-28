/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function moduleAt(path, dependencies = {}) {
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
      require: (name) => {
        if (!(name in dependencies))
          throw new Error(`Unexpected import: ${name}`);
        return dependencies[name];
      },
      console,
      URL,
    },
  );
  return exports;
}
function cacheHarness() {
  let user = "alice",
    listener;
  const supabase = {
    auth: {
      getSession: async () => ({
        data: { session: user ? { user: { id: user } } : null },
        error: null,
      }),
      onAuthStateChange: (fn) => {
        listener = fn;
      },
    },
  };
  const cache = moduleAt("lib/pageReadCache.ts", {
    "./supabaseClient": { supabase },
    "./readCache": moduleAt("lib/readCache.ts"),
  });
  return {
    cache,
    account: (next) => {
      user = next;
      listener?.(
        next ? "SIGNED_IN" : "SIGNED_OUT",
        next ? { user: { id: next } } : null,
      );
    },
  };
}
test("page reads deduplicate and mutations invalidate recent data", async () => {
  const { cache } = cacheHarness();
  let calls = 0;
  const fetcher = async () => ++calls;
  const rows = await Promise.all([
    cache.readPageCache("profile", fetcher),
    cache.readPageCache("profile", fetcher),
  ]);
  assert.deepEqual(rows, [1, 1]);
  assert.equal(await cache.readPageCache("profile", fetcher), 1);
  cache.invalidatePageReads();
  assert.equal(await cache.readPageCache("profile", fetcher), 2);
});
test("account changes reject an outstanding private read and isolate subsequent data", async () => {
  const { cache, account } = cacheHarness();
  let resolve;
  const old = cache.readPageCache(
    "profile",
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await new Promise((done) => setImmediate(done));
  account("bob");
  resolve("alice-private");
  await assert.rejects(old, /account changed/);
  assert.equal(
    await cache.readPageCache("profile", async () => "bob-private"),
    "bob-private",
  );
  account(null);
  assert.equal(
    await cache.readPageCache("profile", async () => "signed-out"),
    "signed-out",
  );
});
test("40 marketplace cards use one batched identity read and one category query", async () => {
  const calls = [],
    identityCalls = [];
  const rows = Array.from({ length: 40 }, (_, index) => ({
    service_id: `service-${index}`,
    freelancer_id: `freelancer-${index % 8}`,
    category_id: `category-${index % 3}`,
    title: `Service ${index}`,
    description: "Work",
    price: "500",
    delivery_time_days: 3,
    revisions_count: 1,
    created_at: "2026-09-01",
  }));
  const supabase = {
    from(table) {
      calls.push(table);
      const builder = {};
      for (const method of ["select", "eq", "in", "order", "or", "gte", "lte"])
        builder[method] = () => builder;
      builder.then = (resolve, reject) =>
        Promise.resolve({
          data:
            table === "services"
              ? rows
              : [0, 1, 2].map((i) => ({
                  id: `category-${i}`,
                  name: `Category ${i}`,
                })),
          error: null,
        }).then(resolve, reject);
      return builder;
    },
  };
  const service = moduleAt("services/marketplace/MarketplaceServices.ts", {
    "@/lib/pageReadCache": { readPageCache: (_key, fetcher) => fetcher() },
    "@/lib/supabaseClient": { supabase },
    "@/services/platform/platformService": {},
    "@/services/profile/publicIdentityService": {
      getPublicIdentities: async (input) => {
        identityCalls.push(input);
        return {
          clients: [],
          freelancers: input.freelancerIds.map((id) => ({
            freelancer_id: id,
            user_id: id,
          })),
          profiles: input.freelancerIds.map((id) => ({
            user_id: id,
            display_name: id,
          })),
        };
      },
    },
  });
  const result = await service.getMarketplaceServices({
    listingType: "service",
  });
  assert.equal(result.length, 40);
  assert.equal(identityCalls.length, 1);
  assert.equal(identityCalls[0].freelancerIds.length, 8);
  assert.deepEqual(calls, ["services", "job_categories"]);
  assert.equal(result[39].freelancer.profile.display_name, "freelancer-7");
  assert.equal(result[39].category.name, "Category 0");
});
