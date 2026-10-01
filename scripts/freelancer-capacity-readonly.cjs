/* eslint-disable @typescript-eslint/no-require-imports */
// Only SELECT and the read-only availability RPC; no business values are printed.
const { createRequire } = require('node:module');
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
async function main(){
 const base=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
 if(base.protocol!=='https:' || !base.hostname.endsWith('.supabase.co')) throw Error('Unexpected host');
 const service=process.env.SUPABASE_SERVICE_ROLE_KEY,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 async function request(path,key,body){
  const r=await fetch(new URL('/rest/v1/'+path,base),{method:body?'POST':'GET',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  return {http:r.status,data:await r.json().catch(()=>null)};
 }
 const sample=await request('freelancer_profiles?select=freelancer_id&limit=3',service);
 const ids=Array.isArray(sample.data)?sample.data.map(x=>x.freelancer_id):[];
 const results={sampleRead:{http:sample.http,count:ids.length},checks:{}};
 for(const [role,key] of [['anon',anon],['service_role',service]]){
  for(const [label,values] of [['empty',[]],['sample',ids],['oversized',Array(201).fill('00000000-0000-4000-a000-000000000001')]]){
   const r=await request('rpc/worksync_freelancer_availability',key,{p_freelancers:values});
   results.checks[role+'_'+label]={http:r.http,code:r.data?.code??null,validShape:Array.isArray(r.data)&&r.data.every(x=>typeof x.freelancer_id==='string'&&typeof x.available==='boolean'),rows:Array.isArray(r.data)?r.data.length:null};
  }
  if(role==='anon') for(const name of ['worksync_freelancer_commitments','worksync_freelancer_project_limit']){
   const r=await request('rpc/'+name,key,{p_freelancer:'00000000-0000-4000-a000-000000000001'});
   results.checks[name]={http:r.http,code:r.data?.code??null};
  }
 }
 console.log(JSON.stringify(results,null,2));
}
main().catch(()=>{console.error('Read-only verification failed: network or configuration unavailable.');process.exitCode=1;});
