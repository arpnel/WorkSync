/* eslint-disable @typescript-eslint/no-require-imports -- Node source harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function loadMarketplace(db) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("services/marketplace/MarketplaceServices.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      require(name) {
        if (name === "@/lib/supabaseClient") return { supabase: db };
        if (name === "@/lib/pageReadCache")
          return { readPageCache: (_key, fetch) => fetch() };
        if (name === "@/services/profile/publicIdentityService")
          return { getPublicIdentities: async () => new Map() };
        if (name === "@/services/platform/platformService")
          return { platformAction: async () => null };
        if (name === "./freelancerAvailability")
          return { assertFreelancerAvailable: async () => {} };
        return {};
      },
      console,
    },
  );
  return exports;
}
function queryDb(resultFor) {
  const queries = [];
  return {
    queries,
    from(table) {
      const entry = { table, filters: [], select: null };
      queries.push(entry);
      const q = {
        select(value, options) {
          entry.select = value;
          entry.options = options;
          return q;
        },
        eq(column, value) {
          entry.filters.push([column, value]);
          return q;
        },
        order() {
          return q;
        },
        in() {
          return q;
        },
        or() {
          return q;
        },
        gte() {
          return q;
        },
        lte() {
          return q;
        },
        then(resolve, reject) {
          return Promise.resolve(resultFor(entry)).then(resolve, reject);
        },
      };
      return q;
    },
  };
}

test("deep marketplace URLs apply category and skill constraints to service and job queries", async () => {
  for (const kind of ["service", "job"]) {
    const db = queryDb(() => ({ data: null, error: null }));
    const api = loadMarketplace(db);
    await api.getMarketplaceServices({
      guest: true,
      listingType: kind,
      categoryId: "category-1",
      skillId: "skill-1",
    });
    const table = db.queries.find(
      (item) => item.table === (kind === "service" ? "services" : "jobs"),
    );
    assert.ok(table);
    assert.match(
      table.select,
      kind === "service"
        ? /service_skills!inner\(skill_id\)/
        : /job_skills!inner\(skill_id\)/,
    );
    assert.deepEqual(table.filters, [
      ["status", kind === "service" ? "Active" : "open"],
      ["is_archived", false],
      ["category_id", "category-1"],
      [
        kind === "service" ? "service_skills.skill_id" : "job_skills.skill_id",
        "skill-1",
      ],
    ]);
  }
});

test("category explorer loads counts and sampled skills through one RPC", async () => {
  const rpcCalls = [];
  const db = {
    rpc(name) {
      rpcCalls.push(name);
      return Promise.resolve({
        data: [
          {
            category_id: "category-1",
            category_name: "Creative",
            listing_count: 120,
            subcategory_ids: Array.from(
              { length: 7 },
              (_, index) => `skill-${index}`,
            ),
          },
        ],
        error: null,
      });
    },
    from(table) {
      assert.equal(table, "skills");
      const query = {
        select() {
          return query;
        },
        in() {
          return Promise.resolve({
            data: Array.from({ length: 7 }, (_, index) => ({
              id: `skill-${index}`,
              name: `Skill ${index}`,
            })),
            error: null,
          });
        },
      };
      return query;
    },
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        "services/marketplace/categoryExplorerService.ts",
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      require: (name) =>
        name === "@/lib/supabaseClient" ? { supabase: db } : {},
      console,
    },
  );
  const result = await exports.getServiceCategoryExplorer();
  assert.equal(result[0].listingCount, 120);
  assert.equal(result[0].subcategories.length, 5);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0], "worksync_service_category_explorer");
});
