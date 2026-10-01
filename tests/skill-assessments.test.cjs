/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const contracts = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/assessments/contracts.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:contracts,require});
const banks = require("../scripts/assessment-starter-bank.cjs");
let PGlite;
try {
  ({
    PGlite,
  } = require("../.next/payment-audit/runtime/node_modules/@electric-sql/pglite"));
} catch {}
const id = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
test(
  "skill assessments: real SQL fixture and role boundaries",
  { skip: !PGlite && "Optional isolated PGlite runtime is missing" },
  async (t) => {
    const db = new PGlite();
    try {
      await db.exec(
        fs.readFileSync("tests/fixtures/skill-assessment-schema.sql", "utf8"),
      );
      const categories = banks.flatMap((b) => b.categories);
      assert.equal(new Set(categories).size, 56);
      for (const [i, name] of categories.entries())
        await db.query("insert into job_categories values($1,$2)", [
          id(1000 + i),
          name,
        ]);
      const migration = fs.readFileSync(
        "supabase/migrations/202609300003_skill_assessments.sql",
        "utf8",
      );
      await db.exec(migration);
      await db.exec(migration);
      const admin = async (action, payload = {}) =>
        (
          await db.query(
            "select worksync_skill_assessment_admin($1,$2::jsonb) result",
            [action, JSON.stringify(payload)],
          )
        ).rows[0].result;
      const member = async (action, opening = id(500), answers = {}) =>
        (
          await db.query(
            "select worksync_skill_assessment_member($1,$2,$3::jsonb) result",
            [action, opening, JSON.stringify(answers)],
          )
        ).rows[0].result;
      const actor = async (n) => {
        await db.exec("reset role");
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          n ? id(n) : "",
        ]);
        await db.exec("set role authenticated");
      };
      const root = () => db.exec("reset role");
      const scalar = async (sql) => (await db.query(sql)).rows[0].n;
      for (let n = 1; n <= 8; n++) {
        await db.query(
          "insert into \"Users\" values($1,$2,now()-($3::int*interval '1 day'))",
          [
            id(n),
            n === 1 ? "admin" : n === 4 ? "client" : "freelancer",
            n === 3 ? 29 : 40,
          ],
        );
        await db.query("insert into profiles values($1,$2)", [
          id(n),
          `Fixture ${n}`,
        ]);
        if (n !== 1) {
          await db.query("insert into freelancer_profiles values($1,$2)", [
            id(100 + n),
            id(n),
          ]);
          if (n !== 5)
            await db.query("insert into freelancer_categories values($1,$2)", [
              id(100 + n),
              id(1000),
            ]);
        }
      }
      await db.query("insert into test_suspended values($1)", [id(6)]);
      let quiz = {
        title: "Fixture knowledge",
        instructions: "Choose carefully",
        passingPercentage: 75,
        timeLimitMinutes: 10,
        questions: ["single", "multiple", "boolean"].map((type, i) => ({
          id: id(200 + i),
          type,
          prompt: `Question ${i}`,
          points: i === 1 ? 2 : 1,
          skillIds: [],
          options: [
            { id: id(300 + i * 2), text: type === "boolean" ? "True" : "A" },
            { id: id(301 + i * 2), text: type === "boolean" ? "False" : "B" },
          ],
          correctOptionIds: i === 1 ? [id(302), id(303)] : [id(300 + i * 2)],
        })),
      };
      const answers = Object.fromEntries(
        quiz.questions.map((q) => [q.id, q.correctOptionIds]),
      );
      await t.test(
        "starter drafts persist once with ten valid questions; no automatic notifications",
        async () => {
          assert.equal(
            Number(await scalar("select count(*) n from skill_assessments")),
            56,
          );
          assert.equal(
            Number(
              await scalar(
                "select count(*) n from skill_assessments where jsonb_array_length(quiz->'questions')=10",
              ),
            ),
            56,
          );
          assert.equal(
            Number(await scalar("select count(*) n from notifications")),
            0,
          );
        },
      );
      await t.test(
        "non-admin and anonymous cannot manage or read keys",
        async () => {
          await actor(2);
          await assert.rejects(admin("list"), /Administrator/);
          await assert.rejects(
            db.query("select * from skill_assessments"),
            /permission denied/,
          );
          await root();
          await db.exec("set role anon");
          await assert.rejects(admin("list"), /permission denied/);
          await assert.rejects(member("list"), /permission denied/);
          await root();
        },
      );
      await t.test(
        "save validates questions, skills and optimistic draft version",
        async () => {
          await actor(1);
          assert.equal(
            (
              await admin("save", {
                categoryId: id(1000),
                expectedVersion: 1,
                quiz,
              })
            ).version,
            2,
          );
          await assert.rejects(
            admin("save", { categoryId: id(1000), expectedVersion: 1, quiz }),
            /Draft changed/,
          );
          const invalid = structuredClone(quiz);
          invalid.questions[0].skillIds = [id(999)];
          await assert.rejects(
            admin("save", {
              categoryId: id(1000),
              expectedVersion: 2,
              quiz: invalid,
            }),
            /Skill does not belong/,
          );
        },
      );
      await t.test(
        "publication freezes age/category/role/moderation eligibility and sends notifications once",
        async () => {
          const payload = {
            categoryId: id(1000),
            openingId: id(500),
            expectedVersion: 2,
            closesAt: new Date(Date.now() + 3600000).toISOString(),
          };
          assert.equal(
            (await admin("eligible", { categoryId: id(1000) })).count,
            3,
          );
          assert.equal((await admin("open", payload)).eligible, 3);
          assert.equal((await admin("open", payload)).reused, true);
          await root();
          assert.equal(
            Number(await scalar("select count(*) n from notifications")),
            3,
          );
          const users = (
            await db.query(
              "select user_id from skill_assessment_eligible order by user_id",
            )
          ).rows.map((r) => r.user_id);
          assert.deepEqual(users, [id(2), id(7), id(8)]);
          await db.query(
            "update \"Users\" set created_at=now()-interval '60 days' where user_id=$1",
            [id(3)],
          );
          await actor(3);
          assert.deepEqual(await member("list"), []);
          await assert.rejects(member("start"), /unavailable/);
        },
      );
      await t.test(
        "editing preserves the opened version and frozen question keys",
        async () => {
          await actor(1);
          const changed = structuredClone(quiz);
          changed.questions[0].correctOptionIds = [id(301)];
          await admin("save", {
            categoryId: id(1000),
            expectedVersion: 2,
            quiz: changed,
          });
          await root();
          const row = (
            await db.query("select version,quiz from skill_assessment_openings")
          ).rows[0];
          assert.equal(row.version, 2);
          assert.deepEqual(row.quiz, quiz);
        },
      );
      await t.test(
        "start/resume creates one attempt with server deadline and no answer keys",
        async () => {
          await actor(2);
      const first = await member("start");
      contracts.parseAssessment(contracts.attemptSchema,first);
      contracts.parseAssessment(contracts.memberListSchema,await member("list"));
          const second = await member("start");
          assert.equal(first.attemptId, second.attemptId);
          assert.equal(first.deadlineAt, second.deadlineAt);
          assert.ok(
            Date.parse(first.deadlineAt) - Date.parse(first.serverNow) <=
              600000,
          );
          assert.ok(!JSON.stringify(first).includes("correctOptionIds"));
          assert.ok(
            !JSON.stringify(await member("list")).includes("correctOptionIds"),
          );
          await assert.rejects(member("submit", id(501)), /unavailable/);
        },
      );
      await t.test(
        "forged score, invalid options and duplicate selections are rejected",
        async () => {
          await assert.rejects(
            member("submit", id(500), { score: 100 }),
            /Invalid/,
          );
          await assert.rejects(
            member("save", id(500), { [id(200)]: [id(999)] }),
            /Invalid/,
          );
          await assert.rejects(
            member("submit", id(500), { [id(201)]: [id(302), id(302)] }),
            /Invalid/,
          );
        },
      );
      await t.test(
        "save persists selections; exact single/multiple/boolean grading and duplicate submit",
        async () => {
          await member("save", id(500), answers);
          assert.deepEqual((await member("start")).answers, answers);
          const result = await member("submit", id(500), answers);
          assert.equal(result.score, 4);
          assert.equal(result.percentage, 100);
          assert.equal(result.passed, true);
          assert.deepEqual(await member("submit", id(500), {}), result);
          assert.ok(!JSON.stringify(result).includes("correctOptionIds"));
        },
      );
      await t.test(
        "partial multiple choice earns zero; missing answers do not earn points",
        async () => {
          await actor(7);
          await member("start");
          const result = await member("submit", id(500), {
            [id(200)]: [id(300)],
            [id(201)]: [id(302)],
            [id(202)]: [id(305)],
          });
          assert.equal(result.score, 1);
          assert.equal(result.percentage, 25);
          assert.equal(result.passed, false);
        },
      );
      await t.test(
        "only passed evidence is public and category scoped",
        async () => {
          await root();
          await db.exec("set role anon");
          const evidence = async (user, cat) =>
            (
              await db.query(
                "select worksync_skill_assessment_evidence($1,$2) e",
                [id(user), cat],
              )
            ).rows[0].e;
          assert.equal((await evidence(2, id(1000))).length, 1);
          assert.deepEqual(await evidence(7, id(1000)), []);
          assert.deepEqual(await evidence(2, id(1001)), []);
          await assert.rejects(
            db.query("select answers from skill_assessment_attempts"),
            /permission denied/,
          );
        },
      );
      await t.test(
        "time limit rejects late submission without grading",
        async () => {
          await actor(8);
          await member("start");
          await root();
          await db.query(
            "update skill_assessment_attempts set deadline_at=now()-interval '1 second' where user_id=$1",
            [id(8)],
          );
          await actor(8);
          assert.equal(
            (await member("submit", id(500), answers)).status,
            "expired",
          );
        },
      );
      await t.test(
        "early close preserves history and prevents new work",
        async () => {
          await actor(1);
          await admin("close", { openingId: id(500) });
          const results = await admin("results", { openingId: id(500) });
          assert.equal(results.rows.length, 3);
          assert.equal(results.rows.filter((r) => r.passed === true).length, 1);
          await actor(2);
          assert.equal((await member("start")).status, "submitted");
          await actor(8);
          assert.equal((await member("start")).status, "expired");
        },
      );
      await t.test(
        "future opening cannot start, and closing time overrides a longer attempt timer",
        async () => {
          await actor(1);
          await admin("open", {
            categoryId: id(1000),
            openingId: id(501),
            expectedVersion: 3,
            opensAt: new Date(Date.now() + 600000).toISOString(),
            closesAt: new Date(Date.now() + 1200000).toISOString(),
          });
          await actor(2);
          await assert.rejects(member("start", id(501)), /not opened/);
          await root();
          await db.query(
            "update skill_assessment_openings set opens_at=now()-interval '1 minute',closes_at=now()+interval '1 minute' where opening_id=$1",
            [id(501)],
          );
          await actor(2);
          const start = await member("start", id(501));
          assert.ok(
            Date.parse(start.deadlineAt) - Date.parse(start.serverNow) <= 60000,
          );
          await root();
          await db.query(
            "update skill_assessment_openings set closes_at=now()-interval '1 second' where opening_id=$1",
            [id(501)],
          );
          await actor(2);
          assert.equal(
            (await member("submit", id(501), answers)).status,
            "expired",
          );
        },
      );
    } finally {
      await db.close();
    }
  },
);
