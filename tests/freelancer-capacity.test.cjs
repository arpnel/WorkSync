/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function availabilityService(rpc) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('services/marketplace/freelancerAvailability.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,require:()=>({supabase:{rpc}})});
 return exports;
}
test('availability batches unique IDs and preserves fully booked results',async()=>{
 const sizes=[];
 const api=availabilityService(async(_name,{p_freelancers})=>{
  sizes.push(p_freelancers.length);return {data:p_freelancers.map(freelancer_id=>({freelancer_id,available:false})),error:null};
 });
 const ids=Array.from({length:205},(_,i)=>String(i));
 const result=await api.getFreelancerAvailability([...ids,...ids]);
 assert.deepEqual(sizes,[200,5]);assert.equal(result.size,205);assert.equal(result.get('0'),false);
 await assert.rejects(api.assertFreelancerAvailable('0'),/fully booked/);
});
test('missing or malformed availability never permits a new commitment',async()=>{
 for(const response of [{data:null,error:{code:'PGRST202'}},{data:[{freelancer_id:'f',available:'true'}]},{data:[]}]) {
  await assert.rejects(availabilityService(async()=>response).assertFreelancerAvailable('f'),/could not be checked/);
 }
});
let PGlite;
try { ({ PGlite } = require('../.next/payment-audit/runtime/node_modules/@electric-sql/pglite')); } catch {}
const id = n => `00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
test('freelancer capacity database enforcement', { skip: !PGlite && 'Requires optional PGlite runtime documented in freelancer-capacity.md' }, async t => {
 const db=new PGlite();
 try {
  await db.exec(fs.readFileSync('tests/fixtures/payment-readiness-schema.sql','utf8'));
  await db.exec('create table job_applications(application_id uuid primary key default gen_random_uuid(),freelancer_id uuid,status text);');
  const sql=fs.readFileSync('supabase/migrations/202609300002_freelancer_capacity.sql','utf8');
  await db.exec(sql); await db.exec(sql);
  async function setup() { await db.exec(`begin; insert into freelancer_profiles(freelancer_id,user_id) values('${id(1)}','${id(2)}');`); }
  const fill = n => db.exec(`insert into projects(project_id,application_id,freelancer_id,status) select gen_random_uuid(),gen_random_uuid(),'${id(1)}','active' from generate_series(1,${n});`);
  const available = async () => (await db.query(`select available from worksync_freelancer_availability(array['${id(1)}'::uuid])`)).rows[0].available;
  const rejects = async query => {
    await db.exec('savepoint attempt');
    await assert.rejects(db.exec(query),/fully booked/);
    await db.exec('rollback to attempt');
  };
  await t.test('10 active commitments block applications, client requests and direct project creation',async()=>{
   await setup();try {
    await fill(9); assert.equal(await available(),true);await fill(1);assert.equal(await available(),false);
    await rejects(`insert into job_applications(freelancer_id,status) values('${id(1)}','pending')`);
    await rejects(`insert into service_orders(freelancer_id,service_id,status) values('${id(1)}','${id(3)}','pending')`);
    await rejects(`insert into projects(freelancer_id,application_id,status) values('${id(1)}','${id(4)}','active')`);
    await db.exec(`update projects set status='cancelled' where project_id=(select project_id from projects limit 1)`);
    assert.equal(await available(),true);
   }finally{await db.exec('rollback');}
  });
  await t.test('10 completed projects raise the limit to 15; completed work is not occupied capacity',async()=>{
   await setup();try {
    await db.exec(`insert into projects(application_id,freelancer_id,status) select gen_random_uuid(),'${id(1)}','completed' from generate_series(1,10)`);
    await fill(14);assert.equal(await available(),true);await fill(1);assert.equal(await available(),false);
    await rejects(`insert into job_applications(freelancer_id,status) values('${id(1)}','pending')`);
   }finally{await db.exec('rollback');}
  });
  await t.test('existing pending service request and job application cannot be accepted at capacity, but can be rejected',async()=>{
   await setup();try {
    await db.exec(`insert into service_orders(order_id,freelancer_id,service_id,status) values('${id(3)}','${id(1)}','${id(4)}','pending');
      insert into job_applications(application_id,freelancer_id,status) values('${id(5)}','${id(1)}','pending');`);
    await fill(10);
    await rejects(`update service_orders set status='accepted'`);
    await rejects(`update job_applications set status='accepted'`);
    await db.exec(`update service_orders set status='rejected';update job_applications set status='rejected'`);
   }finally{await db.exec('rollback');}
  });
  await t.test('accepted application to order to project uses one slot; completion releases it',async()=>{
   await setup();try {
    await fill(9);
    await db.exec(`insert into job_applications(application_id,freelancer_id,status) values('${id(5)}','${id(1)}','accepted');`);
    assert.equal(await available(),false);
    await db.exec(`insert into service_orders(order_id,application_id,job_id,freelancer_id,status) values('${id(3)}','${id(5)}','${id(6)}','${id(1)}','accepted');
      insert into projects(order_id,freelancer_id,status) values('${id(3)}','${id(1)}','active');
      update service_orders set status='converted';`);
    assert.equal((await db.query(`select count(*)::int n from worksync_freelancer_commitments('${id(1)}')`)).rows[0].n,10);
    await db.exec(`update projects set status='completed' where order_id='${id(3)}'`);
    assert.equal(await available(),true);
   }finally{await db.exec('rollback');}
  });
  await t.test('public availability exposes only the boolean projection; internal workload is private',async()=>{
   await setup();try {
    await db.exec('set local role anon');
    const r=await db.query(`select * from worksync_freelancer_availability(array['${id(1)}'::uuid])`);
    assert.deepEqual(Object.keys(r.rows[0]).sort(),['available','freelancer_id']);
    await assert.rejects(db.query(`select * from worksync_freelancer_commitments('${id(1)}')`),/permission denied/);
   }finally{await db.exec('rollback');}
  });
 }finally{await db.close();}
});
