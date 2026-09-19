/* eslint-disable @typescript-eslint/no-require-imports -- Node regression harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(path, supabase) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, require: () => ({ supabase }), URL, URLSearchParams, console },
  );
  return exports;
}
function auth({ session = true, setup = true, exchangeError = null } = {}) {
  const calls = [];
  const api = load("services/auth/completeSignin.ts", {
    auth: {
      exchangeCodeForSession: async (code) => {
        calls.push(code);
        return { error: exchangeError };
      },
      getSession: async () => ({
        data: { session: session ? { user: { id: "u" } } : null },
        error: null,
      }),
    },
    from: () => ({
      select() {
        return this;
      },
      eq(field, id) {
        assert.equal(id, "u");
        return this;
      },
      maybeSingle: async () => ({
        data: { account_setup_completed: setup },
        error: null,
      }),
    }),
  });
  return { ...api, calls };
}
test("optional profile read failures preserve available details and identify unavailable sections", async () => {
  const api = load("services/profile/profileDetails.ts", {
    from: (table) => {
      const result =
        table === "freelancer_skills"
          ? { data: null, error: { message: "permission denied" } }
          : {
              data:
                table === "freelancer_profiles"
                  ? { years_of_experience: 3 }
                  : [],
              error: null,
              count: 2,
            };
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve(result);
        },
        then(resolve) {
          return Promise.resolve(result).then(resolve);
        },
      };
    },
  });
  const details = await api.getFreelancerDetails("f");
  assert.deepEqual(Array.from(details.unavailable_details), ["Skills"]);
  assert.equal(details.years_of_experience, 3);
  assert.equal(details.services_count, 2);
});
test("portfolio deletion cannot report success when no record was deleted", async () => {
  const api = load("services/profile/profileservice.ts", {
    from: () => ({
      delete() {
        return this;
      },
      eq() {
        return this;
      },
      select: async () => ({ data: [], error: null }),
    }),
  });
  assert.equal(await api.deletePortfolioProject("missing"), false);
});
test("callback rejects provider errors and absent sessions", async () => {
  for (const suffix of ["?error=access_denied", "#error=access_denied"]) {
    await assert.rejects(
      auth().completeSignin("https://app.test/auth/callback" + suffix),
      /cancelled/,
    );
  }
  await assert.rejects(
    auth({ session: false }).completeSignin("https://app.test/auth/callback"),
    /Unable to complete/,
  );
});
test("callback uses browser sessions and routes incomplete accounts to setup", async () => {
  assert.equal(
    await auth().completeSignin("https://app.test/auth/callback"),
    "/home/marketplace",
  );
  assert.equal(
    await auth({ setup: false }).completeSignin(
      "https://app.test/auth/callback",
    ),
    "/account-setup",
  );
});
test("callback exchanges codes, rejects failed exchanges, and ignores arbitrary redirect targets", async () => {
  const api = auth();
  assert.equal(
    await api.completeSignin(
      "https://app.test/auth/callback?code=code&next=https://evil.test",
    ),
    "/home/marketplace",
  );
  assert.deepEqual(api.calls, ["code"]);
  await assert.rejects(
    auth({ exchangeError: new Error("expired code") }).completeSignin(
      "https://app.test/auth/callback?code=code",
    ),
    /expired/,
  );
});
test("portfolio loading surfaces database errors instead of returning an empty portfolio", async () => {
  const error = new Error("permission denied");
  const api = load("services/profile/profileservice.ts", {
    from: (table) => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: async () => ({ data: { freelancer_id: "f" }, error: null }),
      order: async () => {
        assert.equal(table, "portfolio");
        return { data: null, error };
      },
    }),
  });
  await assert.rejects(api.getPortfolioProjects("u"), /permission denied/);
});
test("portfolio edits target the selected record and propagate write errors", async () => {
  let failure = false;
  const api = load("services/profile/profileservice.ts", {
    from: (table) => ({
      update(values) {
        assert.equal(table, "portfolio");
        assert.equal(values.title, "Website");
        return this;
      },
      eq(field, id) {
        assert.equal(field, "portfolio_id");
        assert.equal(id, "p");
        return this;
      },
      select() {
        return this;
      },
      single: async () => ({
        data: { portfolio_id: "p" },
        error: failure ? new Error("write failed") : null,
      }),
    }),
  });
  const values = { title: "Website", description: null, project_url: null };
  assert.equal(
    (await api.updatePortfolioProject("p", values)).portfolio_id,
    "p",
  );
  failure = true;
  await assert.rejects(api.updatePortfolioProject("p", values), /write failed/);
});
