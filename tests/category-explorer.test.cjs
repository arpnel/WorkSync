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

test("category explorer only counts active, non-archived matching skill listings", async () => {
  const skills = Array.from({ length: 7 }, (_, index) => ({
    skill_id: `skill-${index}`,
    skills: { id: `skill-${index}`, name: `Skill ${index}` },
  }));
  const db = queryDb((entry) =>
    entry.table === "job_categories"
      ? {
          data: [
            { id: "category-1", name: "Creative", category_skills: skills },
          ],
          error: null,
        }
      : {
          count: entry.filters.some(
            ([column, value]) =>
              column === "service_skills.skill_id" && value === "skill-2",
          )
            ? 4
            : 0,
          error: null,
        },
  );
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
  assert.equal(result[0].totalSubcategories, 7);
  assert.equal(result[0].subcategories.length, 5);
  assert.equal(
    result[0].subcategories.find((item) => item.id === "skill-2").listingCount,
    4,
  );
  const counts = db.queries.filter((item) => item.table === "services");
  assert.equal(counts.length, 5);
  for (const query of counts) {
    assert.equal(query.options.count, "exact");
    assert.equal(query.options.head, true);
    assert.ok(
      query.filters.some(
        ([column, value]) => column === "status" && value === "Active",
      ),
    );
    assert.ok(
      query.filters.some(
        ([column, value]) => column === "is_archived" && value === false,
      ),
    );
    assert.ok(
      query.filters.some(
        ([column, value]) => column === "category_id" && value === "category-1",
      ),
    );
    assert.ok(
      query.filters.some(([column]) => column === "service_skills.skill_id"),
    );
  }
});
