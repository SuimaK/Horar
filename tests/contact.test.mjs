import test from 'node:test';
import assert from 'node:assert/strict';
import {contactGate,moonRoles,analyzeContacts,staysInSign,nextMoonIngress,stationEvents,evaluateContact} from '../src/contact-semantics.mjs';
import {validate,verifyChartTrace} from '../src/engine.mjs';
const planets=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
const speeds={Sun:1,Moon:13,Mercury:1.5,Venus:1.2,Mars:.5,Jupiter:.1,Saturn:.04};
// Explicit synthetic fixtures: these event lists do not describe an actual chart.
const astro={position(jd,p){return {longitude_deg:10+jd*speeds[p],speed_deg_per_day:speeds[p]};}};
const ev=(a,b,d)=>({planet_a:a,planet_b:b,aspect:'TRINE',angle_deg:120,day_offset:d,valid_signs:true});
const analyze=(past=[],future=[],options={})=>analyzeContacts({astro,jd:0,a:'Venus',b:'Mars',past,future,ingress:1.5,...options});
const input={intent_kind:'CONTACT',relay_mode:'direct',roles_locked:true,house_path:[7],contact_options:{question_kind:'MESSAGE_FROM_NAMED_PERSON',relationship_kind:'UNRELATED_NAMED_PERSON',approve_l1_l7:true,horizon_days:14}};
const confirmed={status:'CONFIRMED'};
test('contact requires explicit topic, relationship, approval and exactly radical VII',()=>{
 assert.equal(contactGate(input,confirmed).status,'READY');
 assert.deepEqual(contactGate(input,confirmed).classification.primary_houses,[1,7]);
 for(const key of ['MEETING_WITH_NAMED_PERSON','CONTACT_WITH_NAMED_PERSON','MESSAGE_FROM_NAMED_PERSON']){
  const g=contactGate({...input,contact_options:{...input.contact_options,question_kind:key}},confirmed);
  assert.equal(g.status,'READY');assert.equal(g.classification.ordinary_radical_third_used,false);
 }
 for(const house_path of [[],[3],[7,1],[4,4]])assert.equal(contactGate({...input,house_path},confirmed).status,'NEEDS_CLARIFICATION');
 assert.equal(contactGate({...input,roles_locked:false},confirmed).status,'NEEDS_CLARIFICATION');
 assert.equal(contactGate({...input,contact_options:{...input.contact_options,approve_l1_l7:false}},confirmed).status,'NEEDS_CLARIFICATION');
 assert.equal(contactGate({...input,contact_options:{...input.contact_options,relationship_kind:'SISTER'}},confirmed).status,'TOPIC_MODULE_REQUIRED');
 assert.equal(contactGate(input,{status:'NEEDS_EXPERT_REVIEW'}).status,'NEEDS_EXPERT_REVIEW');
 assert.equal(contactGate({...input,relay_mode:'on_behalf'},confirmed).status,'NEEDS_EXPERT_REVIEW');
 assert.equal(contactGate({intent_kind:'CONTACT'},confirmed).status,'NEEDS_CLARIFICATION');
 assert.equal(contactGate({intent_kind:'EVENT'},confirmed),null);
});
test('parcel, sent letter and visitor are blocked before astronomical search',()=>{
 for(const question_kind of ['PHYSICAL_LETTER_OR_PARCEL','DID_THEY_RECEIVE_MY_LETTER','VISITOR_ARRIVAL_AT_HOME']){
  const p={...input,contact_options:{...input.contact_options,question_kind}};
  const r=evaluateContact({input:p,gate:contactGate(p,confirmed),search(){assert.fail('must not search');}});
  assert.equal(r.status,'TOPIC_MODULE_REQUIRED');assert.equal(r.analysis,null);assert.equal(r.final_prediction,null);
  assert.equal(r.can_issue_client_verdict,false);assert.deepEqual(r.question_classification.primary_houses,[]);
 }
});
test('Moon never duplicates a main significator',()=>{
 assert.equal(moonRoles('Venus','Moon').primary,'QUESITED');
 assert.equal(moonRoles('Venus','Moon').cosignificator_of_querent,false);
 assert.equal(moonRoles('Moon','Mars').cosignificator_of_querent,false);
 assert.equal(moonRoles('Venus','Mars').cosignificator_of_querent,true);
 const r=analyze([],[ev('Moon','Venus',.2)],{b:'Moon'});
 assert.equal(r.direct_candidates.length,1);assert.deepEqual(r.lunar_sequence.moon_to_quesited_candidates,[]);
});
test('lunar sequence uses current sign, nearest events and first ingress',()=>{
 const l=analyze([ev('Moon','Jupiter',-.2),ev('Moon','Sun',-.1)],[ev('Moon','Mercury',.1),ev('Moon','Mars',.25),ev('Moon','Sun',1.6)]).lunar_sequence;
 assert.equal(l.last_exact_in_current_sign.planet_b,'Sun');assert.equal(l.next_exact_in_current_sign.planet_b,'Mercury');
 assert.equal(l.future_exact_in_current_sign.length,2);assert.equal(l.moon_to_quesited_candidates.length,1);
 assert.equal(l.last_aspect_not_automatic_cause,true);
 assert.ok(Math.abs(nextMoonIngress(astro,0)-20/13)<1e-6);
 // A full zodiac cycle and return is not staying in the original sign.
 const cycle={position(t){return {longitude_deg:(10+t*360)%360,speed_deg_per_day:360};}};
 assert.equal(staysInSign(cycle,0,'Moon',1),false);
});
test('lunar absence is uncertain for missing ingress or insufficient horizon',()=>{
 assert.equal(analyze().lunar_sequence.void_status,'NO_EXACT_MOON_ASPECT_BEFORE_INGRESS');
 assert.equal(analyze([],[],{ingress:null}).lunar_sequence.void_status,'UNDETERMINED');
 assert.equal(analyze([],[],{horizon:1}).lunar_sequence.void_status,'UNDETERMINED');
});
test('third contacts are review candidates; Moon is not a blanket prohibitor',()=>{
 const d=analyze([],[ev('Moon','Venus',.1),ev('Mercury','Mars',.2),ev('Venus','Mars',.5)]).direct_candidates[0];
 assert.equal(d.status,'INTERVENING_CONTACTS_REVIEW');assert.equal(d.intervening[0].tag,'MOON_COSIGNIFICATOR_CONTACT');
 assert.equal(d.intervening[1].other_planet,'Mercury');
 assert.equal(analyze([],[ev('Venus','Mars',.5)]).direct_candidates[0].status,'GEOMETRIC_DIRECT_CANDIDATE');
});
test('station localization and sign transition remain contextual review',()=>{
 const stationAstro={position(t,p){return {longitude_deg:10,speed_deg_per_day:p==='Venus'?t-1:1};}};
 const stations=stationEvents(stationAstro,0,['Venus','Venus','Mars'],3);
 assert.equal(stations.length,1);assert.ok(Math.abs(stations[0].day_offset-1)<1e-6);
 const r=analyze([],[ev('Venus','Mars',1.4)],{stations});
 assert.equal(r.direct_candidates[0].status,'STATION_BEFORE_PERFECTION_REVIEW');
 const crossed=analyze([],[ev('Venus','Mars',.5)],{astro:{position(t,p){return {longitude_deg:p==='Venus'?29+t*4:10,speed_deg_per_day:1};}}});
 assert.deepEqual(crossed.direct_candidates[0].crossed_signs,['Venus']);
 assert.equal(crossed.direct_candidates[0].status,'SIGN_INGRESS_REVIEW');
});
test('past-to-future and two-future translations are distinct, with intermediate contacts',()=>{
 const r=analyze([ev('Moon','Venus',-.2)],[ev('Moon','Jupiter',.1),ev('Moon','Mars',.4)]);
 const t=r.translation_candidates.find(x=>x.translator==='Moon');
 assert.equal(t.from,'Venus');assert.equal(t.to,'Mars');assert.equal(t.intervening_contacts.length,1);
 assert.equal(t.status,'TRANSLATION_CANDIDATE_REQUIRES_RECEPTION_AND_CONTEXT_REVIEW');
 const future=analyze([],[ev('Moon','Venus',.1),ev('Moon','Mars',.4)]).translation_candidates[0];
 assert.equal(future.status,'TWO_FUTURE_CONTACTS_REQUIRE_SOURCE_REVIEW');
 assert.throws(()=>analyze([],[],{a:'Mars',b:'Mars'}),/сигнификаторы/);
});
test('collection requires two contacts to a third planet slower than both significators',()=>{
 const r=analyze([],[ev('Venus','Saturn',.2),ev('Mars','Saturn',.4)]);
 assert.equal(r.collection_candidates.length,1);assert.equal(r.collection_candidates[0].collector,'Saturn');
 assert.equal(analyze([],[ev('Venus','Moon',.2),ev('Mars','Moon',.4)]).collection_candidates.length,0);
});
