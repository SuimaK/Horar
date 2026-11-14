import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {arbitratePerfectionV22} from '../src/perfection-arbiter-v22.mjs';
import {readableInterpretation} from '../src/ux-readable.mjs';
import {build} from '../src/engine.mjs';
import {loadSwiss,payload,constants,rules} from './helpers/live-demo.mjs';

const hash='a'.repeat(64),id='arbit:r1';
function fixture(){
 const names=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
 const chart={schema_version:'1.0',data_kind:'REAL_EPHEMERIS',chart_id:id,source_chart_hash:hash,
  planets:names.map((name,i)=>({name,longitude_deg:10+i*35,house:i+1,speed_deg_per_day:1}))};
 const roles={status:'CONFIRMED',roles_locked:true,source_chart_hash:hash,assignments:[
  {actor_id:'q',role_kind:'QUERENT',effective_significator:'Mars',radical_house:1},
  {actor_id:'s',role_kind:'QUESITED',effective_significator:'Venus',radical_house:7}]};
 const direct={planet_a:'Mars',planet_b:'Venus',aspect:'TRINE',angle_deg:120,day_offset:2.5,
  status:'GEOMETRY_CANDIDATE_NEEDS_REVIEW',preceding_events:[],coincident_events:[]};
 const correction={schema_version:'2.0.1',chart_id:id,source_chart_hash:hash,source_chart_verified:true,
  can_issue_event_verdict:false,final_prediction:null,timing_prediction:null,
  geometry:{contacts:[direct],antiscion_candidates:[]},
  indirect:null,
  search_scope:{coverage:'SEARCH_INCOMPLETE',searched_until:5},
  accidentals:[{planet:'Mars',house_class:'STRONG_ANGULAR',motion:{direction:'DIRECT'},solar:{state:'OUTSIDE_BEAMS'}},
   {planet:'Venus',house_class:'WEAK',motion:{direction:'RETROGRADE'},solar:{state:'COMBUST'}}]};
 const semantic={schema_version:'2.1',chart_id:id,source_chart_hash:hash,roles_confirmed:true,
  can_issue_event_verdict:false,can_issue_client_verdict:false,final_prediction:null,timing_prediction:null,
  receptions:{certain:[{from_actor:'QUERENT',to_actor:'QUESITED',from_planet:'Mars',to_planet:'Venus',
    dignity_kind:'domicile',polarity:'POSITIVE',certainty:'CERTAIN'}],
   ambiguous:[{from_actor:'QUESITED',to_actor:'QUERENT',from_planet:'Venus',to_planet:'Mars',
    dignity_kind:'triplicity',polarity:'POSITIVE',certainty:'SECT_DEPENDENT'}]}};
 return {chart,roles,judgment:{processing_status:'NEEDS_EXPERT_REVIEW'},
  path_search:{source_chart_hash:hash,paths:[]},meta:{question_scope:{limited:false}},
  evidence:{method_correction:correction,interpretation_v21:semantic}};
}
const run=(r=fixture(),intent_kind='EVENT')=>arbitratePerfectionV22(r,{intent_kind});
test('V22-01 immutable chart identity and no event or timing verdict',()=>{
 const v=run();assert.equal(v.schema_version,'2.2');assert.equal(v.chart_id,id);
 assert.equal(v.source_chart_hash,hash);assert.equal(v.can_issue_event_verdict,false);
 assert.equal(v.can_issue_client_verdict,false);assert.equal(v.final_prediction,null);
 assert.equal(v.timing_prediction,null);assert.equal(v.synthesis.state,'REVIEW_REQUIRED');
});
test('V22-02 a clean direct aspect is only a geometry-ready candidate',()=>{
 const v=run();assert.equal(v.status,'CANDIDATES_WITH_OPEN_REVIEW');
 const c=v.candidates[0];assert.equal(c.candidate_id,'DIRECT:0');
 assert.equal(c.kind,'DIRECT');assert.equal(c.status,'GEOMETRY_READY_CONTEXT_PENDING');
 assert.equal(c.review_required,true);assert.equal(c.concerns.length,0);
});
test('V22-03 ingress strictly before perfection requires contextual review',()=>{
 const r=fixture();r.evidence.method_correction.geometry.contacts[0].preceding_events=[
  {event_type:'INGRESS',planet:'Mars',day_offset:2}];
 const v=run(r);assert.equal(v.candidates[0].status,'CHRONOLOGY_REVIEW');
 assert.ok(v.candidates[0].concerns.some(x=>x.code==='INGRESS_BEFORE_CONTACT'));
 assert.equal(v.final_prediction,null);
});
test('V22-04 a post-perfection ingress does not become a prior obstruction',()=>{
 const r=fixture();r.evidence.method_correction.geometry.events=[
  {event_type:'INGRESS',planet:'Mars',day_offset:3.1}];
 const v=run(r);assert.equal(v.candidates[0].status,'GEOMETRY_READY_CONTEXT_PENDING');
 assert.ok(!v.candidates[0].concerns.some(x=>x.code==='INGRESS_BEFORE_CONTACT'));
});
test('V22-05 station before exact cannot automatically be called refranation',()=>{
 const r=fixture();r.evidence.method_correction.geometry.contacts[0].preceding_events=[
  {event_type:'STATION',planet:'Venus',day_offset:1}];
 const v=run(r);assert.ok(v.candidates[0].concerns.some(x=>x.code==='STATION_BEFORE_CONTACT'));
 assert.equal(v.can_issue_event_verdict,false);
});
test('V22-06 coincident ingress and aspect are unresolved',()=>{
 const r=fixture();const c=r.evidence.method_correction.geometry.contacts[0];
 c.status='COINCIDENT_EVENT_REVIEW';
 c.coincident_events=[{event_type:'INGRESS',planet:'Venus',day_offset:2.5}];
 const v=run(r);assert.ok(v.candidates[0].concerns.some(x=>x.code==='EVENT_ORDER_UNRESOLVED'));
});
test('V22-07 reported ingress status remains review even if event list is absent',()=>{
 const r=fixture();r.evidence.method_correction.geometry.contacts[0].status='AFTER_INGRESS_REVIEW';
 const v=run(r);assert.ok(v.candidates[0].concerns.some(x=>x.code==='INGRESS_BEFORE_CONTACT'));
});
test('V22-08 a third-party contact is not an automatic prohibition',()=>{
 const r=fixture();r.path_search.paths=[{participants:['Mars','Venus'],geometry_status:'INTERVENING_CONTACT_REVIEW',
  contacts:[{aspect:'TRINE'}]}];
 const v=run(r);assert.ok(v.context_checks.some(x=>x.code==='THIRD_PARTY_CONTACT_CONTEXT'));
 assert.equal(v.candidates[0].status,'GEOMETRY_READY_CONTEXT_PENDING');
 assert.deepEqual(v.synthesis.rejected_path_ids,[]);
});
test('V22-09 absence of direct contact with incomplete search never becomes NO',()=>{
 const r=fixture();r.evidence.method_correction.geometry.contacts=[];
 const v=run(r);assert.equal(v.status,'NO_CANDIDATE_IN_INCOMPLETE_SCOPE');
 assert.match(v.synthesis.headline,/не означает отрицательного ответа/);
 assert.equal(v.final_prediction,null);
});
test('V22-10 exact antiscion is a separate symbolic path, not bodily aspect',()=>{
 const r=fixture();r.evidence.method_correction.geometry.antiscion_candidates=[
  {planet_a:'Mars',planet_b:'Venus',aspect:'ANTISCION_CONJUNCTION',day_offset:4}];
 const v=run(r);
 assert.ok(v.candidates.some(c=>c.kind==='ANTISCION'&&c.status==='SPECIAL_RULE_REVIEW'));
 assert.ok(v.candidates.some(c=>c.kind==='DIRECT'));
});
test('V22-11 genuine-sequence translation keeps role/reception context open',()=>{
 const r=fixture();r.evidence.method_correction.indirect={
  translation_candidates:[{translator:'Moon',from:'Mars',to:'Venus',past_contact:{day_offset:-.4},
   next_contact:{aspect:'SEXTILE',day_offset:1.7},relative_speeds:{translator:13,from:.5,to:1},
   recent_separation_status:'CONFIRMED',intervening_contacts:[]}],
  collection_candidates:[]};
 const v=run(r),c=v.candidates.find(c=>c.kind==='TRANSLATION');
 assert.ok(c);assert.equal(c.mediator,'Moon');
 assert.ok(c.concerns.some(x=>x.code==='TRANSLATION_RECEPTION_AND_ROLE_CONTEXT'));
 assert.equal(c.status,'INDIRECT_CONTEXT_REVIEW');
});
test('V22-12 translator too slow is flagged, not misrepresented as eligible',()=>{
 const r=fixture();r.evidence.method_correction.indirect={
  translation_candidates:[{translator:'Moon',from:'Venus',to:'Mars',past_contact:{day_offset:-.2},
   next_contact:{aspect:'CONJUNCTION',day_offset:2},relative_speeds:{translator:.1,from:1,to:1},
   recent_separation_status:'CONFIRMED',intervening_contacts:[]}],collection_candidates:[]};
 const v=run(r);assert.ok(v.candidates.find(c=>c.kind==='TRANSLATION').concerns.some(x=>x.code==='TRANSLATOR_SPEED_NOT_CERTIFIED'));
});
test('V22-13 transmission needs past-to-future ordering, not two future aspects',()=>{
 const r=fixture();r.evidence.method_correction.indirect={
  translation_candidates:[{translator:'Moon',from:'Mars',to:'Venus',past_contact:{day_offset:1},
   next_contact:{aspect:'TRINE',day_offset:2},relative_speeds:{translator:14,from:1,to:2},
   recent_separation_status:'CONFIRMED',intervening_contacts:[]}],collection_candidates:[]};
 const v=run(r);assert.ok(v.candidates.find(c=>c.kind==='TRANSLATION').concerns.some(x=>x.code==='PAST_FUTURE_SEQUENCE_INVALID'));
});
test('V22-14 intervening translator contacts remain explicit',()=>{
 const r=fixture();r.evidence.method_correction.indirect={
  translation_candidates:[{translator:'Mercury',from:'Mars',to:'Venus',past_contact:{day_offset:-.5},
   next_contact:{aspect:'SQUARE',day_offset:2},relative_speeds:{translator:5,from:1,to:1},
   recent_separation_status:'UNDETERMINED',intervening_contacts:['Mercury:Sun:TRINE:1']}],
  collection_candidates:[]};
 const v=run(r);const a=v.candidates.find(c=>c.kind==='TRANSLATION');
 assert.ok(a.concerns.some(x=>x.code==='TRANSLATOR_INTERMEDIATE_CONTACTS'));
 assert.ok(a.concerns.some(x=>x.code==='RECENT_SEPARATION_NOT_CERTIFIED'));
});
test('V22-15 collection reception absent does not automatically prohibit',()=>{
 const r=fixture();r.evidence.method_correction.indirect={translation_candidates:[],
  collection_candidates:[{collector:'Saturn',
   contacts:[{day_offset:2,aspect:'SQUARE'},{day_offset:3,aspect:'TRINE'}],
   collector_receives_both:false}]};
 const v=run(r);const c=v.candidates.find(c=>c.kind==='COLLECTION');
 assert.ok(c);assert.ok(c.concerns.some(x=>x.code==='COLLECTION_RECEPTION_CONTEXT'));
 assert.equal(c.status,'INDIRECT_CONTEXT_REVIEW');assert.equal(v.final_prediction,null);
});
test('V22-16 even positive collection receptions do not prove capacity',()=>{
 const r=fixture();r.evidence.method_correction.indirect={translation_candidates:[],
  collection_candidates:[{collector:'Jupiter',contacts:[{day_offset:1},{day_offset:3}],
   collector_receives_both:true}]};
 const v=run(r),c=v.candidates.find(c=>c.kind==='COLLECTION');
 assert.ok(c.concerns.some(x=>x.code==='COLLECTION_RECEPTION_NOT_SUFFICIENT'));
 assert.ok(c.concerns.some(x=>x.code==='COLLECTOR_CAPACITY_AND_ROLE_CONTEXT'));
 assert.equal(v.can_issue_event_verdict,false);
});
test('V22-17 Moon as main significator is not independent third party',()=>{
 const r=fixture();r.roles.assignments[0].effective_significator='Moon';
 r.evidence.interpretation_v21.roles_confirmed=true;
 r.evidence.method_correction.geometry.contacts[0].planet_a='Moon';
 const v=run(r);assert.ok(v.context_checks.some(x=>x.code==='MOON_ALREADY_PRINCIPAL_SIGNIFICATOR'));
 assert.ok(!v.context_checks.some(x=>x.code==='MOON_COSIGNIFICATOR_PATH_PENDING'));
});
test('V22-18 Moon as co-significator requires a separate verified path',()=>{
 const v=run();
 assert.ok(v.context_checks.some(x=>x.code==='MOON_COSIGNIFICATOR_PATH_PENDING'));
});
test('V22-19 strength and debility are contextual, not numeric YES/NO scores',()=>{
 const v=run();
 assert.deepEqual(v.capacity.map(x=>x.planet),['Mars','Venus']);
 assert.ok(v.capacity[1].observations.includes('WEAK_HOUSE_CONTEXT'));
 assert.ok(v.capacity[1].observations.includes('COMBUST'));
 assert.equal(v.synthesis.accepted_path_ids.length,0);
});
for(const intent of ['RELATIONSHIP','CAREER','RECOVERY','LOCATION','RETURN','STATUS','QUALITY','COMPARISON','TIMING','PAST_FACT','PRESERVATION']){
 test('V22-TOPIC-'+intent+' requires topic-specific semantics, not direct judgment',()=>{
  const v=run(fixture(),intent);assert.equal(v.status,'TOPIC_METHOD_REQUIRED');
  assert.equal(v.candidates.length,0);assert.equal(v.can_issue_event_verdict,false);
 });
}
test('V22-20 unrelated CONTACT scenario is not implicitly approved',()=>{
 const v=run(fixture(),'CONTACT');
 assert.equal(v.status,'TOPIC_METHOD_REQUIRED');
});
test('V22-21 an approved CONTACT route can be analyzed without verdict',()=>{
 const r=fixture();r.scenario_route={status:'READY_FOR_V16_EVIDENCE_ONLY'};
 const v=run(r,'CONTACT');
 assert.equal(v.status,'CANDIDATES_WITH_OPEN_REVIEW');
 assert.equal(v.can_issue_client_verdict,false);
});
test('V22-22 unconfirmed roles stop examination before path analysis',()=>{
 const r=fixture();r.roles.status='NEEDS_CLARIFICATION';r.roles.roles_locked=false;
 r.evidence.interpretation_v21.roles_confirmed=false;
 const v=run(r);assert.equal(v.status,'ROLES_REQUIRED');assert.equal(v.candidates.length,0);
});
test('V22-23 coincident L1/L7 cannot be made two independent actors',()=>{
 const r=fixture();r.roles.assignments[1].effective_significator='Mars';
 const v=run(r);assert.equal(v.status,'ROLES_REQUIRED');
});
test('V22-24 safety scope blocks event examination, even with direct geometry',()=>{
 const r=fixture();r.judgment.processing_status='SAFETY_LIMITED';
 const v=run(r);assert.equal(v.status,'SAFETY_LIMITED');
 assert.equal(v.candidates.length,0);
});
test('V22-25 forged source hash rejected',()=>{
 const r=fixture();r.evidence.interpretation_v21.source_chart_hash='b'.repeat(64);
 assert.throws(()=>run(r),/SOURCE_MISMATCH/);
});
test('V22-26 stale roles and paths rejected',()=>{
 const a=fixture();a.roles.source_chart_hash='b'.repeat(64);
 assert.throws(()=>run(a),/STALE_ROLES/);
 const b=fixture();b.path_search.source_chart_hash='b'.repeat(64);
 assert.throws(()=>run(b),/STALE_SEARCH/);
});
test('V22-27 forged upstream event verdict rejected',()=>{
 const a=fixture();a.evidence.method_correction.can_issue_event_verdict=true;
 assert.throws(()=>run(a),/UNTRUSTED_VERDICT/);
 const b=fixture();b.evidence.interpretation_v21.final_prediction='YES';
 assert.throws(()=>run(b),/UNTRUSTED_VERDICT/);
});
test('V22-28 impossible direct participant pair fails rather than being dropped',()=>{
 const r=fixture();r.evidence.method_correction.geometry.contacts[0].planet_b='Jupiter';
 assert.throws(()=>run(r),/INVALID_DIRECT_CANDIDATE/);
});
test('V22-29 out-of-range exact aspect offset fails closed',()=>{
 const r=fixture();r.evidence.method_correction.geometry.contacts[0].day_offset=366;
 assert.throws(()=>run(r),/INVALID_DIRECT_CANDIDATE/);
});
test('V22-30 more than hundred direct roots is not silently truncated',()=>{
 const r=fixture();r.evidence.method_correction.geometry.contacts=
  Array.from({length:101},()=>({...r.evidence.method_correction.geometry.contacts[0]}));
 assert.throws(()=>run(r),/TOO_MANY_DIRECT_PATHS/);
});
test('V22-31 output satisfies strict JSON schema and forbids verdict fields',()=>{
 const schema=JSON.parse(fs.readFileSync(new URL('../schemas/perfection_arbitration_v22.schema.json',import.meta.url)));
 const validate=new Ajv2020({strict:false}).compile(schema);
 for(const intent of ['EVENT','CAREER']){
  const v=run(fixture(),intent);
  assert.equal(validate(v),true,JSON.stringify(validate.errors));
 }
});
test('V22-32 readable output escapes hostile arbiter headline and path explanations',()=>{
 const r=fixture();const output=run(r);
 output.synthesis.headline='<img src=x onerror=alert(1)>';
 output.candidates[0].concerns=[{code:'DEMO',explanation:'<svg onload=alert(1)>',source_ref:'test.fixtures',disposition:'REQUIRES_REVIEW'}];
 r.evidence.perfection_arbitration_v22=output;
 r.evidence.interpretation_v21.cards=[{key:'K',title:'Наблюдение',text:'Без прогноза.',source_refs:['chart']}];
 const html=readableInterpretation(r,{intent_kind:'EVENT'});
 assert.doesNotMatch(html,/<img|<svg/i);assert.match(html,/&lt;img/);
 assert.match(html,/Развитие события/);
});
const swiss=await loadSwiss();
test('V22-33 actual Swiss/Moshier chart preserves legacy versions and adds v2.2',async()=>{
 const data=await build(payload,swiss,constants,rules),e=data.evidence.perfection_arbitration_v22;
 assert.equal(e.schema_version,'2.2');
 assert.equal(e.chart_id,data.chart.chart_id);
 assert.equal(e.source_chart_hash,data.chart.source_chart_hash);
 assert.equal(data.chart.schema_version,'1.0');
 assert.equal(data.evidence.interpretation_v21.schema_version,'2.1');
 assert.equal(data.evidence.method_correction.schema_version,'2.0.1');
 assert.equal(e.can_issue_event_verdict,false);assert.equal(e.final_prediction,null);
});
