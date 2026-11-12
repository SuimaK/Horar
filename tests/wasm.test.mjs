import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {SwissEphemeris,Planet,HouseSystem,CalculationFlag} from '@swisseph/browser';
import {build,verifyChartTrace,validate} from '../src/engine.mjs';
const rules=JSON.parse(fs.readFileSync(new URL('../rules_registry.json',import.meta.url)));
const ref=JSON.parse(fs.readFileSync(new URL('./fixtures/contact_v15.json',import.meta.url)));
const chartRefs=JSON.parse(fs.readFileSync(new URL('./reference.json',import.meta.url)));
const bytes=fs.readFileSync(new URL('../node_modules/@swisseph/browser/dist/swisseph.wasm',import.meta.url));
const swe=new SwissEphemeris();
await swe.init('data:application/wasm;base64,'+bytes.toString('base64'));
const constants={planet:Planet,regiomontanus:HouseSystem.Regiomontanus,flags:CalculationFlag.MoshierEphemeris|CalculationFlag.Speed,moshier:CalculationFlag.MoshierEphemeris};
const payload={question_id:'demo-london',revision:1,raw_text:'Учебный пример: будет ли сообщение от человека?',context:'Синтетический вопрос с реальными эфемеридами; исход неизвестен.',question_owner_id:'я',speaker_id:'я',relay_mode:'direct',intent_kind:'CONTACT',moment_local:'2025-01-20T12:00:00+00:00',latitude_deg:51.5074,longitude_deg:-.1278,house_system:'REGIOMONTANUS',method_profile:'frawley_early',house_path:[7],roles_locked:true,contact_options:{question_kind:'MESSAGE_FROM_NAMED_PERSON',relationship_kind:'UNRELATED_NAMED_PERSON',approve_l1_l7:true,horizon_days:14}};
function approx(actual,expected,path='analysis'){
 if(typeof expected==='number'){assert.ok(Math.abs(actual-expected)<2e-6,`${path}: ${actual} vs ${expected}`);return;}
 if(expected===null||typeof expected!=='object'){
  if(typeof expected==='string'&&/^[A-Za-z]+:[A-Za-z]+:\d+:-?\d+\.\d+$/.test(expected)){
   const a=actual.split(':'),b=expected.split(':');assert.deepEqual(a.slice(0,3),b.slice(0,3),path);assert.ok(Math.abs(Number(a[3])-Number(b[3]))<2e-6,path);return;
  }
  assert.equal(actual,expected,path);return;
 }
 if(Array.isArray(expected))assert.equal(actual.length,expected.length,path);
 for(const [k,v] of Object.entries(expected)){
  if(['root_residual_deg','source'].includes(k))continue;
  approx(actual[k],v,`${path}.${k}`);
 }
}
let result;
test('v1.4/v1.5 actual WASM matches supplied Python lunar, direct and indirect reference',async()=>{
 result=await build(payload,swe,constants,rules);
 assert.equal(result.evidence.numerical_trace.trace_recomputed_from_chart,true);
 assert.equal(result.evidence.role_assembly.schema_version,'1.3');
 assert.equal(result.contact_evidence.source_chart_hash,result.chart.source_chart_hash);
 assert.equal(result.contact_evidence.final_prediction,null);
 assert.equal(result.contact_evidence.timing_prediction,null);
 assert.equal(result.contact_evidence.can_issue_client_verdict,false);
 approx(result.contact_evidence.analysis,ref.analysis);
 if(process.env.HORARY_QA_OUTPUT){
  fs.mkdirSync(process.env.HORARY_QA_OUTPUT,{recursive:true});
  fs.writeFileSync(path.join(process.env.HORARY_QA_OUTPUT,'wasm-demo.json'),JSON.stringify(result,null,2));
 }
});
test('all three supplied astronomical maps match real WASM, not linear mocks',async()=>{
 for(const r of chartRefs){
  const out=await build({...payload,intent_kind:'EVENT',contact_options:undefined,house_path:[],roles_locked:false,moment_local:r.moment.replace('Z','+00:00'),latitude_deg:r.latitude,longitude_deg:r.longitude},swe,constants,rules);
  for(const p of out.chart.planets)assert.ok(Math.abs(p.longitude_deg-r.planets[p.name].longitude)<2e-6,p.name);
  out.chart.cusps.forEach((c,i)=>assert.ok(Math.abs(c.longitude_deg-r.cusps[i])<2e-6,`cusp ${i+1}`));
 }
});
test('v1.4 rejects tampered numerical traces; v1.5 validates finite integer horizon',async()=>{
 const r=result||await build(payload,swe,constants,rules),jd=swe.dateToJulianDay(new Date(r.chart.moment_utc));
 const astro={houses(){return {cusps:r.chart.cusps.map(c=>c.longitude_deg)};},positions(){return Object.fromEntries(r.chart.planets.map(p=>[p.name,p]));}};
 assert.equal(verifyChartTrace(r.chart,astro,jd),true);
 const tampered=structuredClone(r.chart);tampered.planets[0].longitude_deg+=1;
 assert.equal(verifyChartTrace(tampered,astro,jd),false);
 for(const horizon_days of [0,31,1.5,NaN,'14',true])assert.throws(()=>validate({...payload,contact_options:{...payload.contact_options,horizon_days}}),/Горизонт/);
});
test('blocked contact categories and incomplete roles never run direct event search',async()=>{
 for(const p of [
  {...payload,contact_options:{...payload.contact_options,question_kind:'PHYSICAL_LETTER_OR_PARCEL'}},
  {...payload,contact_options:{...payload.contact_options,approve_l1_l7:false}},
  {...payload,roles_locked:false},
  {...payload,relay_mode:'on_behalf'},
  {...payload,raw_text:'Когда умрет человек?'}
 ]){
  const r=await build(p,swe,constants,rules);
  assert.equal(r.path_search.search_coverage,'NOT_EVALUATED');
  assert.equal(r.contact_evidence.analysis,null);
  assert.equal(r.contact_evidence.can_issue_client_verdict,false);
 }
});
