/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
test("guest marketplace reads listings without authenticated identity lookups",async()=>{
 let identities=0;const calls=[];
 const row={service_id:"service",freelancer_id:"freelancer",category_id:"category",title:"Actual service",description:"Actual description",price:200,delivery_time_days:3,revisions_count:1,status:"Active"};
 const db={from(table){calls.push(table);const q={select:()=>q,eq:()=>q,order:()=>q,in:()=>q,then(resolve){return Promise.resolve({data:table==="services"?[row]:[{id:"category",name:"Design"}],error:null}).then(resolve);}};return q;}};
 const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync("services/marketplace/MarketplaceServices.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,console,require(name){if(name==="@/lib/supabaseClient")return {supabase:db};if(name==="@/lib/pageReadCache")return {readPageCache:(_key,fn)=>fn()};if(name==="@/services/profile/publicIdentityService")return {getPublicIdentities:async()=>{identities++;throw Error("Authentication required");}};return {};} });
 const result=await api.getMarketplaceServices({guest:true,listingType:"service"});
 assert.equal(result[0].title,"Actual service");assert.equal(result[0].freelancer,null);assert.equal(result[0].category.name,"Design");assert.equal(identities,0);assert.deepEqual(calls,["services","job_categories"]);
 await assert.rejects(()=>api.getMarketplaceServices({listingType:"service"}),/Authentication required/);assert.equal(identities,1);
});
