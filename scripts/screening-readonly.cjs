/* eslint-disable @typescript-eslint/no-require-imports */
// Metadata only: no applicant content, model generation or database mutations.
const {createRequire}=require('node:module');
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
async function main(){
 const result={localConfiguration:{geminiKey:!!process.env.GEMINI_API_KEY,serviceKey:!!process.env.SUPABASE_SERVICE_ROLE_KEY},checks:{}};
 const base=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
 if(base.protocol!=='https:'||!base.hostname.endsWith('.supabase.co'))throw Error('Invalid host');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const headers={apikey:key,Authorization:'Bearer '+key};
 for(const [table,columns] of Object.entries({job_applications:'application_id,status,updated_at,screening_id',screening_results:'screening_id,application_id,freelancer_id,score,result,strengths,weaknesses,recommendation,screened_at,expires_at'})){
  const r=await fetch(new URL('/rest/v1/'+table+'?select='+columns+'&limit=0',base),{headers,signal:AbortSignal.timeout(15000)});
  const data=await r.json();result.checks[table]={http:r.status,code:data?.code??null};
 }
 const schema=await fetch(new URL('/rest/v1/',base),{headers:{...headers,Accept:'application/openapi+json'},signal:AbortSignal.timeout(15000)});
 const data=await schema.json();
 const rpc=data.paths?.['/rpc/worksync_save_screening']?.post;
 result.checks.saveContract={http:schema.status,exposed:!!rpc,arguments:rpc?.parameters?.filter(x=>x.in==='body').map(x=>Object.keys(x.schema?.properties??{}))};
 if(process.env.GEMINI_API_KEY){
  const model=process.env.GEMINI_MODEL||'gemini-3.6-flash';
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model),{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY},signal:AbortSignal.timeout(15000)});
  const body=await r.json();result.checks.model={http:r.status,generationSupported:body.supportedGenerationMethods?.includes('generateContent')??false};
 }
 console.log(JSON.stringify(result,null,2));
}
main().catch(()=>{console.error('Read-only screening check could not reach the configured services.');process.exitCode=1;});
