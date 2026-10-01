/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
let PGlite;
try {
  ({
    PGlite,
  } = require("../.next/payment-audit/runtime/node_modules/@electric-sql/pglite"));
} catch {}
const id = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
test(
  "milestone payouts, refund reservations and review policy SQL",
  { skip: !PGlite && "Optional PGlite runtime missing" },
  async (t) => {
    const db = new PGlite();
    try {
      await db.exec(
        fs.readFileSync("tests/fixtures/payment-readiness-schema.sql", "utf8"),
      );
      await db.exec(
        fs.readFileSync(
          "supabase/migrations/202609300001_payment_readiness.sql",
          "utf8",
        ),
      );
      const upgrade = fs.readFileSync(
        "supabase/migrations/202609300004_milestone_settlement.sql",
        "utf8",
      );
      await db.exec(upgrade);
      await db.exec(upgrade);
      await db.exec(
        "create trigger guard_submission before update on project_submissions for each row execute function worksync_guard_submission_update(); create trigger guard_contract before update on contracts for each row execute function worksync_guard_contract_update();",
      );
      async function fixture(milestones = true) {
        await db.exec(`begin;
 insert into "Users" values('${id(1)}'),('${id(2)}');
 insert into client_profiles(client_id,user_id) values('${id(3)}','${id(1)}');
 insert into freelancer_profiles(freelancer_id,user_id) values('${id(4)}','${id(2)}');
 insert into service_orders(order_id,client_id,freelancer_id,service_id,status) values('${id(5)}','${id(3)}','${id(4)}','${id(11)}','converted');
 insert into contracts(contract_id,order_id,final_price,status,client_signed_at,freelancer_signed_at) values('${id(6)}','${id(5)}',100,'active',now(),now());
 insert into projects(project_id,order_id,client_id,freelancer_id,title,budget,status,due_date) values('${id(7)}','${id(5)}','${id(3)}','${id(4)}','Fixture',100,'active',current_date-30);
 insert into payments(payment_id,project_id,order_id,payer_id,amount,status,provider,livemode,currency,provider_payment_id,transaction_reference) values('${id(9)}','${id(7)}','${id(5)}','${id(1)}',100,'paid','paymongo',false,'PHP','pay_fixture','cs_fixture');
 insert into freelancer_payout_accounts(user_id,mode,encrypted_destination,bank_label,account_last4) values('${id(2)}','test','ciphertext','Bank','1234');`);
        if (milestones)
          await db.exec(
            `insert into milestones(milestone_id,project_id,title,amount,display_order,due_date) values('${id(20)}','${id(7)}','First',40,1,current_date-30),('${id(21)}','${id(7)}','Final',60,2,current_date-30);`,
          );
      }
      const submit = (sid, mid, days, status = "submitted") =>
        db.query(
          `insert into project_submissions(submission_id,project_id,milestone_id,author_id,kind,status,body,created_at) values($1,$2,$3,$4,'delivery',$5,'Delivery',now()-$6::int*interval '1 day')`,
          [id(sid), id(7), mid ? id(mid) : null, id(2), status, days],
        );
      const settle = () =>
        db.query("select worksync_settle_project($1,$2,$3)", [
          id(7),
          id(9),
          "test",
        ]);
      const rows = async (table) =>
        (await db.query(`select * from ${table}`)).rows;
      const claim = (payout) =>
        db.query("select * from worksync_claim_payout($1)", [payout]);
      const refund = () =>
        db.query("select * from worksync_claim_project_refund($1,$2)", [
          id(9),
          "test",
        ]);
      async function scenario(name, fn, milestones = true) {
        await t.test(name, async () => {
          await fixture(milestones);
          try {
            await fn();
          } finally {
            await db.exec("rollback");
          }
        });
      }
      await scenario(
        "intermediate review waits three full days even when planned date is past",
        async () => {
          await submit(30, 20, 2);
          await settle();
          assert.equal((await rows("project_payouts")).length, 0);
        },
      );
      await scenario(
        "first milestone pays independently; final work remains editable and gets seven days",
        async () => {
          await submit(30, 20, 4);
          await submit(31, 21, 4);
          await settle();
          await settle();
          let payouts = await rows("project_payouts");
          assert.equal(payouts.length, 1);
          assert.equal(Number(payouts[0].amount), 40);
          assert.equal(payouts[0].milestone_id, id(20));
          assert.equal((await rows("projects"))[0].status, "active");
          assert.equal((await claim(payouts[0].payout_id)).rows.length, 1);
          assert.equal((await claim(payouts[0].payout_id)).rows.length, 0);
          await db.exec(
            `update project_payouts set status='paid' where payout_id='${payouts[0].payout_id}'`,
          );
          // A later revision/new final delivery remains possible after the first payout.
          await submit(32, 21, 8); // newest delivery is still the four-day-old one, so no payout yet.
          await settle();
          assert.equal((await rows("project_payouts")).length, 1);
        },
      );
      await scenario(
        "all mature milestones create two payouts, complete project and never duplicate",
        async () => {
          await submit(30, 20, 8);
          await submit(31, 21, 8);
          await settle();
          await settle();
          const payouts = await rows("project_payouts");
          assert.equal(payouts.length, 2);
          assert.equal(
            payouts.reduce((n, r) => n + Number(r.amount), 0),
            100,
          );
          assert.equal((await rows("projects"))[0].status, "completed");
          for (const p of payouts)
            assert.equal((await claim(p.payout_id)).rows.length, 1);
        },
      );
      await scenario(
        "standard project gets seven days rather than immediate overdue approval",
        async () => {
          await submit(30, null, 4);
          await settle();
          assert.equal((await rows("project_payouts")).length, 0);
        },
        false,
      );
      await scenario(
        "standard mature delivery still completes and pays full amount",
        async () => {
          await submit(30, null, 8);
          await settle();
          assert.equal(Number((await rows("project_payouts"))[0].amount), 100);
        },
        false,
      );
      await scenario(
        "client auto-accept applies only to future deliveries",
        async () => {
          await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
            id(1),
          ]);
          await db.query("select worksync_set_auto_accept($1,true)", [id(7)]);
          await submit(30, 20, 1);
          await settle();
          assert.equal((await rows("project_payouts")).length, 0);
          await db.query(
            `insert into project_submissions(submission_id,project_id,milestone_id,author_id,kind,status,body,created_at) values($1,$2,$3,$4,'delivery','submitted','New',clock_timestamp())`,
            [id(31), id(7), id(20), id(2)],
          );
          await settle();
          assert.equal((await rows("project_payouts")).length, 1);
        },
      );
      await scenario("freelancer cannot opt into auto-accept", async () => {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
          id(2),
        ]);
        await assert.rejects(
          db.query("select worksync_set_auto_accept($1,true)", [id(7)]),
          /Only the assigned client/,
        );
      });
      await scenario(
        "accepted cancellation refunds remainder excluding claimed payout, exactly once",
        async () => {
          await submit(30, 20, 4);
          await settle();
          const payout = (await rows("project_payouts"))[0];
          await claim(payout.payout_id);
          await db.query(
            `insert into project_cancellations(order_id,requested_by,reason,status) values($1,$2,'Cancel remaining work','accepted')`,
            [id(5), id(1)],
          );
          const first = await refund();
          assert.equal(first.rows.length, 1);
          assert.equal(Number(first.rows[0].amount), 60);
          assert.equal((await refund()).rows.length, 0);
          await settle();
          assert.equal((await rows("project_payouts")).length, 1);
        },
      );
      await scenario(
        "unclaimed payout is cancelled and full remaining amount reserved for refund",
        async () => {
          await submit(30, 20, 4);
          await settle();
          const payout = (await rows("project_payouts"))[0];
          await db.query(
            `insert into project_cancellations(order_id,requested_by,reason,status) values($1,$2,'Cancel','accepted')`,
            [id(5), id(1)],
          );
          assert.equal(Number((await refund()).rows[0].amount), 100);
          assert.equal((await claim(payout.payout_id)).rows.length, 0);
          assert.equal((await rows("project_payouts"))[0].status, "cancelled");
        },
      );
      await scenario(
        "requested cancellation blocks release without authorizing a refund",
        async () => {
          await submit(30, 20, 4);
          await db.query(
            `insert into project_cancellations(order_id,requested_by,reason,status) values($1,$2,'Cancel','requested')`,
            [id(5), id(1)],
          );
          await settle();
          assert.equal((await rows("project_payouts")).length, 0);
          assert.equal((await refund()).rows.length, 0);
        },
      );
      await scenario(
        "unresolved dispute prevents both payout and accepted-cancellation refund",
        async () => {
          await submit(30, 20, 4);
          await db.query(
            `insert into project_disputes(project_id,opened_by,category,description,status) values($1,$2,'delivery','Disputed delivery','open')`,
            [id(7), id(1)],
          );
          await db.query(
            `insert into project_cancellations(order_id,requested_by,reason,status) values($1,$2,'Cancel','accepted')`,
            [id(5), id(1)],
          );
          await settle();
          assert.equal((await rows("project_payouts")).length, 0);
          assert.equal((await refund()).rows.length, 0);
        },
      );
      await scenario(
        "refund reservation prevents cancellation reversal and new payouts",
        async () => {
          await db.query(
            `insert into project_cancellations(order_id,requested_by,reason,status) values($1,$2,'Cancel','accepted')`,
            [id(5), id(1)],
          );
          await refund();
          await assert.rejects(
            db.exec("update project_cancellations set status='rejected'"),
            /Refund is reserved/,
          );
        },
      );
      await scenario(
        "invalid allocation cannot trigger automatic approval or a payout",
        async () => {
          await db.exec("update milestones set amount=30");
          await submit(30, 20, 8);
          await settle();
          assert.equal((await rows("project_payouts")).length, 0);
          assert.equal(
            (await rows("project_submissions"))[0].status,
            "submitted",
          );
        },
      );
      await scenario(
        "no delivery means no auto payout even if work date is overdue",
        async () => {
          await settle();
          assert.equal((await rows("project_payouts")).length, 0);
        },
      );
      await scenario(
        "reserved milestone delivery cannot be replaced or tampered with",
        async () => {
          await submit(30, 20, 4);
          await settle();
          await assert.rejects(submit(31, 20, 0), /Paid or reserved delivery/);
        },
      );
      await scenario(
        "browser role cannot call money movement RPCs",
        async () => {
          await db.exec("set local role authenticated");
          await assert.rejects(refund(), /permission denied/);
        },
      );
    } finally {
      await db.close();
    }
  },
);
