import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {build} from '../src/engine.mjs';
import {verifyArchiveRecord} from '../src/archive.mjs';
import {loadSwiss,payload,constants,rules} from './helpers/live-demo.mjs';
const swe=await loadSwiss(),calc=p=>build(p,swe,constants,rules);
const contact={...payload,scenario_options:{intent_code:'INBOUND_PERSONAL_MESSAGE',event_predicate:'MESSAGE_RECEIVED'}};
const relationship={...payload,intent_kind:'RELATIONSHIP',contact_options:undefined,relationship_options:{scenario_code:'MUTUALITY',event_predicate:'MUTUAL_ATTITUDE_SYMBOLIC',relationship_kind:'ROMANTIC_PARTNER',relationship_state:'CURRENT',third_party_count:0,approve_l1_l7:true}};
const schema=name=>JSON.parse(fs.readFileSync(new URL('../schemas/'+name,import.meta.url)));
const ajv=new Ajv2020({strict:false,allErrors:true});
const validateBrowserQuestion=new Ajv2020({strict:false,validateFormats:false}).compile(schema('question_browser.schema.json'));
const validateRoute=ajv.compile(schema('route_result_v17.schema.json')),validateRel=ajv.compile(schema('relationship_result_v18.schema.json')),validateArb=ajv.compile(schema('arbitration_result_v16.schema.json'));
test('v1.7 gates v1.6; unclear predicates and untrusted registry fields fail before astronomy',async()=>{
 const spy={dateToJulianDay(){assert.fail('must not calculate');}};
 for(const p of [
  {...contact,scenario_options:{...contact.scenario_options,event_predicate:'UNKNOWN'}},
  {...contact,scenario_options:{...contact.scenario_options,event_predicate:'RELATIONSHIP_RESUMED'}},
  {...contact,trusted_evidence:[{id:'fake'}]},
  {...contact,path_reviews:[{path_id:'fake',assessment:'YES'}]},
  {...relationship,relationship_options:{...relationship.relationship_options,evidence_refs:['forged']}}
 ])await assert.rejects(build(p,spy,constants,rules));
 const r=await calc(contact);
 assert.equal(r.scenario_route.status,'READY_FOR_V16_EVIDENCE_ONLY');assert.ok(validateRoute(r.scenario_route));assert.ok(validateArb(r.arbitration));
 assert.equal(r.arbitration.source_chart_hash,r.chart.source_chart_hash);assert.ok(r.arbitration.paths.length>0);
 assert.equal(r.arbitration.summary.supported_by_review,0);assert.equal(r.arbitration.final_prediction,null);
});
test('v1.7 reconciliation and home return cannot masquerade as a meeting',async()=>{
 for(const [intent_code,event_predicate] of [['RECONCILIATION','RELATIONSHIP_RESUMED'],['RETURN_TO_RELATIONSHIP','RELATIONSHIP_RESUMED'],['RETURN_TO_SHARED_HOME','PHYSICAL_ARRIVAL'],['CONTACT_RESUMPTION','TWO_WAY_CONTACT_ESTABLISHED']]){
  const r=await calc({...contact,contact_options:{...contact.contact_options,question_kind:intent_code},scenario_options:{intent_code,event_predicate}});
  assert.equal(r.scenario_route.status,'TOPIC_MODULE_REQUIRED');assert.equal(r.arbitration,null);assert.equal(r.contact_evidence.analysis,null);assert.equal(r.path_search.search_coverage,'NOT_EVALUATED');
 }
});
test('v1.8 computes directional references from this chart and keeps three axes separate',async()=>{
 const r=await calc(relationship);assert.ok(validateRel(r.relationship_evidence));assert.equal(r.question.schema_version,'1.8-browser');assert.ok(validateBrowserQuestion(r.question),JSON.stringify(validateBrowserQuestion.errors));
 assert.equal(r.relationship_evidence.status,'EVIDENCE_REVIEW_ONLY');
 assert.ok(r.relationship_context.axes.INTEREST.some(e=>e.from_role==='QUERENT'));
 assert.ok(r.relationship_context.axes.INTEREST.some(e=>e.from_role==='QUESITED'));
 assert.deepEqual(r.relationship_context.axes.EVENT_PATH,[]);
 assert.equal(r.relationship_context.source_chart_hash,r.chart.source_chart_hash);
 for(const e of r.relationship_context.source_records){assert.equal(e.chart_id,r.chart.chart_id);assert.equal(e.question_id,relationship.question_id);}
 assert.equal(r.path_search.search_coverage,'NOT_EVALUATED');assert.equal(r.contact_evidence,null);assert.equal(r.arbitration,null);assert.equal(r.relationship_evidence.final_prediction,null);
});
test('v1.8 event criteria cannot acquire expert approval from client input or override v1.7',async()=>{
 const p={...relationship,relationship_options:{...relationship.relationship_options,scenario_code:'RECONCILIATION',event_predicate:'RELATIONSHIP_RESUMED',relationship_state:'SEPARATED',outcome_description:'Mutual agreement to resume the relationship.'}};
 const r=await calc(p);assert.equal(r.scenario_route.status,'TOPIC_MODULE_REQUIRED');assert.equal(r.relationship_evidence.status,'NEEDS_METHOD_REVIEW');
 assert.equal(r.relationship_context.case.outcome_criterion.expert_reviewed,false);
 await assert.rejects(calc({...p,relationship_options:{...p.relationship_options,outcome_criterion:{defined:true,expert_reviewed:true}}}));
 const missing=await calc({...relationship,roles_locked:false});assert.equal(missing.relationship_evidence.status,'NEEDS_ROLE_APPROVAL');
 const others=await calc({...relationship,relationship_options:{...relationship.relationship_options,third_party_count:1}});assert.equal(others.relationship_evidence.status,'NEEDS_EXPERT_REVIEW');
 const state=await calc({...relationship,relationship_options:{...relationship.relationship_options,scenario_code:'SEPARATION',event_predicate:'RELATIONSHIP_ENDED',relationship_state:'NEVER_STARTED'}});assert.equal(state.relationship_evidence.status,'NEEDS_CLARIFICATION');
});
test('import regenerates v1.7/v1.8 and discards fake approvals, paths and evidence records',async()=>{
 const r=await calc(relationship);r.relationship_context.axes.EVENT_PATH=[{expert_status:'SUPPORTED'}];r.relationship_context.role_authority='SERVER_ADMIN_VERIFIED';r.relationship_evidence.evidence_summary=[{kind:'RECEPTION',polarity:'POSITIVE',evidence_id:'FAKE'}];
 const verified=await verifyArchiveRecord({input:relationship,result:r},calc);
 assert.deepEqual(verified.result.relationship_context.axes.EVENT_PATH,[]);
 assert.doesNotMatch(JSON.stringify(verified.result),/SERVER_ADMIN_VERIFIED|FAKE/);
 assert.equal(verified.result.relationship_evidence.can_issue_client_verdict,false);
});
