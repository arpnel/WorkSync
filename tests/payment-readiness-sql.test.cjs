/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
let PGlite;
try { ({ PGlite } = require('../.next/payment-audit/runtime/node_modules/@electric-sql/pglite')); } catch {}
const id = n => `00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
test('prepared payment migration: isolated PostgreSQL transactions and permissions', {skip: !PGlite && 'Install the isolated PGlite runtime per payment-readiness.md'}, async t => {
 const db = new PGlite();
 try {
  await db.exec(fs.readFileSync('tests/fixtures/payment-readiness-schema.sql','utf8'));
  const migration = fs.readFileSync('supabase/migrations/202609300001_payment_readiness.sql','utf8');
  await db.exec(migration);
  await db.exec(migration);
  // Install the two real guard triggers on the supplied column fixtures.
  await db.exec(`create trigger tr_worksync_guard_contract_update before update on contracts for each row execute function worksync_guard_contract_update();
  create trigger tr_worksync_guard_submission_update before update on project_submissions for each row execute function worksync_guard_submission_update();`);
  async function fixture() {
   try { await db.exec(`begin;
    insert into "Users" values ('${id(1)}'),('${id(2)}');
    insert into client_profiles(client_id,user_id) values('${id(3)}','${id(1)}');
    insert into freelancer_profiles(freelancer_id,user_id) values('${id(4)}','${id(2)}');
    insert into service_orders(order_id,client_id,freelancer_id,service_id,status) values('${id(5)}','${id(3)}','${id(4)}','${id(11)}','converted');
    insert into contracts(contract_id,order_id,final_price,delivery_time_days,revisions_count,status,client_signed_at,freelancer_signed_at)
      values('${id(6)}','${id(5)}',100,7,1,'active',now(),now());
    insert into projects(project_id,order_id,client_id,freelancer_id,title,budget,status,due_date)
      values('${id(7)}','${id(5)}','${id(3)}','${id(4)}','Fixture',100,'active',current_date-1);
    insert into project_submissions(submission_id,project_id,author_id,kind,status,body,created_at)
      values('${id(8)}','${id(7)}','${id(2)}','delivery','submitted','Fixture delivery',now()-interval '10 days');
    insert into payments(payment_id,project_id,order_id,payer_id,amount,status,provider,livemode,currency,provider_payment_id,transaction_reference)
      values('${id(9)}','${id(7)}','${id(5)}','${id(1)}',100,'paid','paymongo',false,'PHP','pay_fixture','cs_fixture');
    insert into freelancer_payout_accounts(user_id,mode,encrypted_destination,bank_label,account_last4)
      values('${id(2)}','test','fixture-ciphertext','Fixture Bank','1234');`); } catch(error) { await db.exec('rollback'); throw error; }
  }
  const settle = () => db.query(`select worksync_settle_project('${id(7)}','${id(9)}','test')`);
  const payouts = async () => (await db.query('select * from project_payouts')).rows;
  await t.test('automatic review, completion, and duplicate settlement produce one payout', async()=>{
   await fixture(); try {
    await settle(); await settle();
    const rows=await payouts(); assert.equal(rows.length,1); assert.equal(Number(rows[0].amount),100); assert.equal(rows[0].recipient_id,id(2));
    assert.equal((await db.query('select status from contracts')).rows[0].status,'completed');
    const first=await db.query(`select * from worksync_claim_payout('${rows[0].payout_id}')`);
    assert.equal(first.rows.length,1);
    assert.equal((await db.query(`select * from worksync_claim_payout('${rows[0].payout_id}')`)).rows.length,0);
   } finally { await db.exec('rollback'); }
  });
  for(const [name,change] of [
   ['unpaid',"update payments set status='pending'"],
   ['null payment status',"update payments set status=null"],
   ['wrong amount',"update payments set amount=99"],
   ['wrong payer',`update payments set payer_id='${id(2)}'`],
   ['wrong mode',"update payments set livemode=true"],
   ['cancelled project',"update projects set status='cancelled'"],
   ['accepted cancellation',`insert into project_cancellations(order_id,requested_by,reason,status) values('${id(5)}','${id(1)}','Fixture','accepted')`],
   ['open dispute',`insert into project_disputes(project_id,opened_by,category,description,status) values('${id(7)}','${id(1)}','delivery','Fixture','open')`],
   ['latest revision',`insert into project_submissions(project_id,author_id,kind,status,body,created_at) values('${id(7)}','${id(2)}','delivery','revision_requested','Newer fixture',now())`],
  ]) await t.test(name+' cannot produce a payout',async()=>{
   await fixture(); try{await db.exec(change);await settle();assert.equal((await payouts()).length,0);}finally{await db.exec('rollback');}
  });
  await t.test('milestone payout waits for every latest delivery and the full budget allocation',async()=>{
   await fixture();try{
    await db.exec(`delete from project_submissions;
      insert into milestones(milestone_id,project_id,title,amount,status) values
      ('${id(12)}','${id(7)}','First',40,'approved'),('${id(13)}','${id(7)}','Second',60,'revision_requested');
      insert into project_submissions(project_id,milestone_id,author_id,kind,status,body,created_at) values
      ('${id(7)}','${id(12)}','${id(2)}','delivery','approved','Fixture',now()),
      ('${id(7)}','${id(13)}','${id(2)}','delivery','revision_requested','Fixture',now());`);
    await settle();assert.equal((await payouts()).length,0);
    await db.exec(`insert into project_submissions(project_id,milestone_id,author_id,kind,status,body,created_at)
      values('${id(7)}','${id(13)}','${id(2)}','delivery','approved','Fixture',now()+interval '1 second');
      update milestones set status='approved',amount=50 where milestone_id='${id(13)}';`);
    await settle();assert.equal((await payouts()).length,0);
    await db.exec(`update milestones set amount=60 where milestone_id='${id(13)}'`);
    await settle();assert.equal((await payouts()).length,1);
   }finally{await db.exec('rollback');}
  });
  await t.test('claim refuses a payout assigned to the client instead of the freelancer',async()=>{
   await fixture();try{await settle();const [r]=await payouts();
    await db.exec(`update project_payouts set recipient_id='${id(1)}'`);
    assert.equal((await db.query(`select * from worksync_claim_payout('${r.payout_id}')`)).rows.length,0);
   }finally{await db.exec('rollback');}
  });
  await t.test('claimed payout blocks a late cancellation instead of silently racing the send',async()=>{
   await fixture();try{await settle();const [r]=await payouts();await db.query(`select * from worksync_claim_payout('${r.payout_id}')`);
    await assert.rejects(db.exec(`insert into project_cancellations(order_id,requested_by,reason,status) values('${id(5)}','${id(1)}','Fixture','requested')`),/payout has been claimed/);
   }finally{await db.exec('rollback');}
  });
  await t.test('provider payment ID uniqueness prevents attaching the same payment twice',async()=>{
   await fixture();try{await assert.rejects(db.exec(`insert into payments(payment_id,payer_id,provider_payment_id) values('${id(10)}','${id(1)}','pay_fixture')`),/unique/);}finally{await db.exec('rollback');}
  });
  await t.test('authenticated users cannot call settlement or read payout destinations',async()=>{
   await db.exec('begin; set local role authenticated;');
   try{await assert.rejects(db.query(`select worksync_settle_project('${id(7)}','${id(9)}','test')`),/permission denied/);}finally{await db.exec('rollback');}
   await db.exec('begin; set local role authenticated;');
   try{await assert.rejects(db.query('select * from freelancer_payout_accounts'),/permission denied/);}finally{await db.exec('rollback');}
  });
 } finally { await db.close(); }
});
