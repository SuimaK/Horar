import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {buildSemanticReadingV21} from '../src/interpretation-v21.mjs';
import {readableInterpretation} from '../src/ux-readable.mjs';
import {build} from '../src/engine.mjs';
import {loadSwiss,payload,constants,rules} from './helpers/live-demo.mjs';

const hash='a'.repeat(64),chartId='review-fixture:r1';
const names=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
const planet=(name,i)=>({name,longitude_deg:[10,40,70,100,285,160,190][i],house:[1,2,3,4,10,6,7][i],
 speed_deg_per_day:1,latitude_deg:0});
const baseline=()=>{
 const chart={schema_version:'1.0',data_kind:'REAL_EPHEMERIS',chart_id:chartId,
  source_chart_hash:hash,planets:names.map(planet),
  cusps:Array.from({length:12},(_,i)=>({house:i+1,longitude_deg:i*30}))};
 const roles={status:'CONFIRMED',roles_locked:true,assignments:[
  {actor_id:'querent',role_kind:'QUERENT',radical_house:1,effective_significator:'Mars'},
  {actor_id:'quesited',role_kind:'QUESITED',radical_house:7,effective_significator:'Venus'}]};
 const mkD=name=>({planet:name,owners:{triplicity:{status:'RESOLVED'}},
  own_essential_dignities:name==='Mars'?['exaltation']:[],
  own_essential_debilities:[]});
 const correction={schema_version:'2.0.1',chart_id:chartId,source_chart_hash:hash,
  source_chart_verified:true,can_issue_event_verdict:false,final_prediction:null,timing_prediction:null,
  essential:{placements:names.map(mkD)},
  house_placements:chart.planets.map(p=>({planet:p.name,raw_house:p.house,effective_house:p.house})),
  sect_resolution:{status:'DAY'},
  role_receptions:[{from_actor:'querent',to_actor:'quesited',evidence:[
    {from_planet:'Mars',to_planet:'Venus',dignity_kind:'term',polarity:'POSITIVE',evidence_certainty:'CERTAIN'},
    {from_planet:'Mars',to_planet:'Venus',dignity_kind:'triplicity',polarity:'POSITIVE',evidence_certainty:'SECT_DEPENDENT'}]},
    {from_actor:'quesited',to_actor:'querent',evidence:[
      {from_planet:'Venus',to_planet:'Mars',dignity_kind:'triplicity',polarity:'POSITIVE',evidence_certainty:'CERTAIN'},
      {from_planet:'Venus',to_planet:'Mars',dignity_kind:'fall',polarity:'NEGATIVE',evidence_certainty:'CERTAIN'}]}],
  geometry:{contacts:[{planet_a:'Venus',planet_b:'Mars',aspect:'TRINE',day_offset:3,
    status:'GEOMETRY_CANDIDATE_NEEDS_REVIEW',preceding_events:[],coincident_events:[]}]},
  indirect:{translation_candidates:[{translator:'Moon'}],collection_candidates:[]}};
 return {chart,roles,evidence:{method_correction:correction},
  path_search:{source_chart_hash:hash,paths:[]},
  judgment:{processing_status:'NEEDS_EXPERT_REVIEW'}};
};
const run=(result=baseline(),intent_kind='EVENT')=>buildSemanticReadingV21(result,{intent_kind});

test('V21-01 result has a strict non-predictive identity and full source trace',()=>{
 const v=run();
 assert.equal(v.schema_version,'2.1');
 assert.equal(v.status,'EVENT_PATHS_REVIEW_ONLY');
 assert.equal(v.source_chart_hash,hash);
 assert.equal(v.chart_id,chartId);
 assert.equal(v.provenance,'RECOMPUTED_REAL_EPHEMERIS');
 assert.equal(v.can_issue_client_verdict,false);
 assert.equal(v.can_issue_event_verdict,false);
 assert.equal(v.final_prediction,null);
 assert.equal(v.timing_prediction,null);
 assert.ok(v.cards.every(c=>Array.isArray(c.source_refs)&&c.source_refs.length));
});
test('V21-02 role narrative uses exact planet, sign and house, not a template promise',()=>{
 const v=run();
 assert.match(v.cards.find(c=>c.key==='QUERENT').text,/Марс в Козероге, 10 доме/);
 assert.match(v.cards.find(c=>c.key==='QUERENT').text,/экзальтации/);
 assert.match(v.cards.find(c=>c.key==='QUESITED').text,/Венера в Раке, 4 доме/);
 assert.ok(v.cards.find(c=>c.key==='QUESITED').text.includes('Венера'));
});
test('V21-03 directed receptions do not turn into real human feelings',()=>{
 const v=run();
 assert.equal(v.receptions.certain.length,3);
 assert.equal(v.receptions.ambiguous.length,1);
 assert.match(v.cards.find(c=>c.key==='RECEPTIONS').text,/Положительных: 2, отрицательных: 1/);
 assert.match(v.cards.find(c=>c.key==='RECEPTIONS').text,/не реальное отношение человека/);
});
test('V21-04 sect-dependent triplicity never becomes a certain double testimony',()=>{
 const r=baseline();r.evidence.method_correction.sect_resolution.status='UNRESOLVED';
 const v=run(r);
 assert.equal(v.receptions.certain.length,3);
 assert.equal(v.receptions.ambiguous.length,1);
 assert.ok(v.cards.some(c=>c.key==='SECT'));
});
test('V21-05 direct path is candidate only, never YES or timing',()=>{
 const v=run();
 assert.equal(v.direct.status,'CANDIDATES_REVIEW_ONLY');
 assert.equal(v.direct.count,1);
 assert.match(v.direct.summary,/геометрический кандидат/);
 assert.equal(v.final_prediction,null);
});
test('V21-06 after ingress stays a context-change review, not an automatic prohibition',()=>{
 const r=baseline(),c=r.evidence.method_correction.geometry.contacts[0];
 c.status='AFTER_INGRESS_REVIEW';c.preceding_events=[{event_type:'INGRESS',planet:'Venus',day_offset:1}];
 const v=run(r);
 assert.deepEqual(v.direct.review_flags,['INGRESS_BEFORE_EXACT']);
 assert.match(v.direct.summary,/изменившихся обстоятельств/);
 assert.equal(v.can_issue_event_verdict,false);
});
test('V21-07 station is not silently converted into refranation',()=>{
 const r=baseline();r.evidence.method_correction.geometry.contacts[0].preceding_events=[
  {event_type:'STATION',planet:'Venus',day_offset:2}];
 const v=run(r);
 assert.deepEqual(v.direct.review_flags,['STATION_BEFORE_EXACT']);
 assert.match(v.direct.summary,/не равна доказанной рефранации/);
});
test('V21-08 simultaneous root and ingress require ordering review',()=>{
 const r=baseline();const c=r.evidence.method_correction.geometry.contacts[0];
 c.status='COINCIDENT_EVENT_REVIEW';
 c.coincident_events=[{event_type:'INGRESS',planet:'Mars',day_offset:3}];
 const v=run(r);assert.ok(v.direct.review_flags.includes('COINCIDENT_EVENT'));
 assert.match(v.direct.summary,/порядок нельзя утверждать автоматически/);
});
test('V21-09 absence of aspect is never a negative event verdict',()=>{
 const r=baseline();r.evidence.method_correction.geometry.contacts=[];
 const v=run(r);
 assert.equal(v.direct.status,'NONE_IN_CHECKED_SCOPE');
 assert.match(v.direct.summary,/не означает ответ «нет»/);
 assert.equal(v.can_issue_event_verdict,false);
});
test('V21-10 absent search is not confused with evidence of no event',()=>{
 const r=baseline();r.evidence.method_correction.geometry=null;
 r.evidence.method_correction.indirect=null;
 const v=run(r);
 assert.equal(v.direct.status,'NOT_SEARCHED');
 assert.equal(v.indirect.status,'NOT_SEARCHED');
 assert.match(v.cards.find(c=>c.key==='DIRECT').text,/не проверено/);
});
test('V21-11 positive indirect candidate requires semantic review of intermediary',()=>{
 const v=run();
 assert.equal(v.indirect.translation_count,1);
 assert.equal(v.indirect.collection_count,0);
 assert.match(v.indirect.summary,/роль посредника/);
});
test('V21-12 legacy third-body contact is not automatically prohibition',()=>{
 const r=baseline();r.path_search.paths=[
  {geometry_status:'INTERVENING_CONTACT_REVIEW'},{geometry_status:'DIRECT_GEOMETRY'}];
 const v=run(r);
 assert.match(v.cards.find(c=>c.key==='INTERVENTIONS').text,/не доказанный запрет/);
});
test('V21-13 unconfirmed roles block an event-path interpretation',()=>{
 const r=baseline();r.roles.roles_locked=false;r.roles.status='NEEDS_CLARIFICATION';
 const v=run(r);
 assert.equal(v.status,'ROLES_REQUIRED');assert.equal(v.roles_confirmed,false);
 assert.equal(v.direct.status,'NOT_SEARCHED');assert.equal(v.receptions.certain.length,0);
 assert.ok(v.cards.some(c=>c.key==='ROLES'));
});
test('V21-14 identical L1 and L7 cannot be auto-resolved',()=>{
 const r=baseline();r.roles.assignments[1].effective_significator='Mars';
 const v=run(r);
 assert.equal(v.status,'ROLES_REQUIRED');
 assert.match(v.cards.find(c=>c.key==='ROLES').text,/одной планетой/);
});
for(const intent of ['RELATIONSHIP','CAREER','RECOVERY','LOCATION'])
 test('V21-TOPIC-'+intent+' specialized question never inherits generic direct verdict',()=>{
  const v=run(baseline(),intent);
  assert.equal(v.status,'TOPIC_METHOD_REQUIRED');
  assert.equal(v.direct.status,'NOT_SEARCHED');
  assert.ok(v.cards.some(c=>c.key==='LIMIT'));
  assert.ok(!v.cards.some(c=>c.key==='DIRECT'));
 });
test('V21-15 source chart mismatch and forged verdict fail closed',()=>{
 const r=baseline();r.evidence.method_correction.source_chart_hash='b'.repeat(64);
 assert.throws(()=>run(r),/IDENTITY/);
 const s=baseline();s.evidence.method_correction.can_issue_event_verdict=true;
 assert.throws(()=>run(s),/VERDICT_FORBIDDEN/);
 const t=baseline();t.chart.data_kind='USER_CLAIM';
 assert.throws(()=>run(t),/IDENTITY/);
});
test('V21-16 render escapes malicious card content before injecting HTML',()=>{
 const r=baseline(),v=run(r);
 v.cards[0].text='<img src=x onerror=alert(1)>';
 r.evidence.interpretation_v21=v;
 const rendered=readableInterpretation(r,{intent_kind:'EVENT'});
 assert.doesNotMatch(rendered,/<img/);
 assert.match(rendered,/&lt;img/);
 assert.match(rendered,/Что показывает карта/);
});
test('V21-17 semantic preview schema is satisfied',()=>{
 const schema=JSON.parse(fs.readFileSync(new URL('../schemas/semantic_reading_v21.schema.json',import.meta.url)));
 const validate=new Ajv2020({strict:false}).compile(schema);
 const v=run();
 assert.equal(validate(v),true,JSON.stringify(validate.errors));
});
const swiss=await loadSwiss();
test('V21-18 real ephemeris calculation attaches semantic review and keeps immutable old contracts',async()=>{
 const r=await build(payload,swiss,constants,rules);
 const v=r.evidence.interpretation_v21;
 assert.equal(v.schema_version,'2.1');
 assert.equal(v.source_chart_hash,r.chart.source_chart_hash);
 assert.equal(v.can_issue_event_verdict,false);
 assert.equal(v.final_prediction,null);
 assert.equal(r.evidence.method_correction.schema_version,'2.0.1');
 assert.equal(r.chart.schema_version,'1.0');
 assert.ok(v.cards.length>=3);
});
