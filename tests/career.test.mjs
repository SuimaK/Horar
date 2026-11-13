import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {evaluateCareerCase} from '../src/career-semantics.mjs';
import {build} from '../src/engine.mjs';
import {verifyArchiveRecord} from '../src/archive.mjs';
import {loadSwiss,payload,constants,rules} from './helpers/live-demo.mjs';
const read=(dir,file)=>JSON.parse(fs.readFileSync(new URL('../'+dir+'/'+file,import.meta.url)));
const cases=read('tests/fixtures','career_cases_v19.json').cases,expected=read('tests/fixtures','career_v19_expected.json');
const validQuestion=new Ajv2020({strict:false,validateFormats:false}).compile(read('schemas','question_career_browser.schema.json'));
const valid=new Ajv2020({strict:false,allErrors:true}).compile(read('schemas','career_result_v19.schema.json'));
test('v1.9: all 54 supplied career fixtures match the full Python result and output schema',()=>{
 assert.equal(cases.length,54);
 for(const f of cases){
  const p=structuredClone(f.input),before=structuredClone(p),r=evaluateCareerCase(p.case,p);
  assert.deepEqual(r,expected.find(e=>e.id===f.id).output,f.id);assert.deepEqual(p,before,f.id+' mutated');
  assert.ok(valid(r),JSON.stringify(valid.errors));assert.equal(r.final_prediction,null);assert.equal(r.timing_prediction,null);assert.equal(r.can_issue_client_verdict,false);
 }
});
test('v1.9 input rejects extra verdicts, percentages, house overrides and fake expert criteria',()=>{
 const p=cases[0].input;
 for(const changes of [{schema_version:'1.8'},{scenario_code:'FUTURE_HAPPINESS'},{final_prediction:'YES'},{confidence_score:.99},{question_id:'x'},{chart_id:''},{perspective:'MAGIC'},{money_context:'EMPLOYER_TAXES'},{evidence_refs:['a1','a1']},{sixth_house_is_job:true},{approved_verdict:true},{outcome_criterion:{defined:true,expert_reviewed:true,verdict:'YES'}}])assert.throws(()=>evaluateCareerCase({...p.case,...changes},p));
});
const swe=await loadSwiss(),calc=p=>build(p,swe,constants,rules);
const career={...payload,raw_text:'Учебный пример условий работы',intent_kind:'CAREER',contact_options:undefined,house_path:[10],career_options:{scenario_code:'WORK_CONDITIONS',event_predicate:'WORK_CONDITIONS_ASSESSED',perspective:'SELF',employment_state:'EMPLOYED',employment_relation:'EMPLOYEE',money_context:'UNKNOWN',acknowledge_l1_l10:true}};
test('career browser pipeline computes I/X facts but never fabricates expert approval',async()=>{
 const r=await calc(career);assert.ok(valid(r.career_evidence),JSON.stringify(valid.errors));
 assert.equal(r.question.schema_version,'1.9-browser');assert.ok(validQuestion(r.question),JSON.stringify(validQuestion.errors));assert.equal(r.career_evidence.status,'NEEDS_ROLE_APPROVAL');assert.deepEqual(r.career_evidence.reason_codes,['ROLE_ASSIGNMENT_NOT_APPROVED']);
 assert.equal(r.career_context.approval_status,'EXPERT_ROLE_REGISTRY_NOT_AVAILABLE');assert.equal(r.career_context.local_confirmation,true);
 assert.equal(r.career_context.house_candidates.CAREER.house,10);assert.equal(r.career_context.source_chart_hash,r.chart.source_chart_hash);
 assert.ok(r.career_context.axes.CONDITIONS.length);assert.deepEqual(r.career_context.axes.EVENT_PATH,[]);
 assert.equal(r.arbitration,null);assert.equal(r.scenario_route,null);assert.equal(r.contact_evidence,null);assert.equal(r.path_search.search_coverage,'NOT_EVALUATED');
 assert.doesNotMatch(JSON.stringify(r.career_context),/EXPERT_LOCKED/);
});
test('career rejects VI, mismatched predicates and injected registries before ephemeris access',async()=>{
 const spy={dateToJulianDay(){assert.fail('must not calculate');}};
 for(const p of [{...career,house_path:[6]},{...career,house_path:[10,1]},{...career,career_options:{...career.career_options,event_predicate:'JOB_OBTAINED'}},{...career,career_options:{...career.career_options,career_house_assigned_from:'EXPERT_LOCKED'}},{...career,career_options:{...career.career_options,outcome_criterion:{defined:true,expert_reviewed:true}}},{...career,trusted_evidence:[{id:'forged'}]},{...career,locked_roles:{approved:true}},{...career,scenario_options:{intent_code:'PERSONAL_MEETING',event_predicate:'SAME_PLACE_IN_PERSON'}}])await assert.rejects(build(p,spy,constants,rules));
});
test('payroll keeps XI and II separate; client invoices and business get no employer-funds assignment',async()=>{
 const p={...career,career_options:{...career.career_options,scenario_code:'SALARY_OUTLOOK',event_predicate:'SALARY_CONDITIONS_ASSESSED',money_context:'EMPLOYER_PAYROLL'}};
 const r=await calc(p);assert.equal(r.career_context.house_candidates.EMPLOYER_FUNDS.house,11);assert.equal(r.career_context.house_candidates.QUERENT_FUNDS.house,2);
 for(const money_context of ['CLIENT_INVOICE','OWN_RESOURCES','UNKNOWN']){
  const other=await calc({...p,career_options:{...p.career_options,money_context}});assert.equal(other.career_context.house_candidates.EMPLOYER_FUNDS,undefined);
 }
 const business=await calc({...p,career_options:{...p.career_options,employment_relation:'BUSINESS_OWNER'}});assert.equal(business.career_evidence.status,'NEEDS_EXPERT_REVIEW');assert.equal(business.career_context.house_candidates.EMPLOYER_FUNDS,undefined);assert.deepEqual(business.career_context.preliminary_records,[]);
});
test('career import regenerates preliminary sources and discards forged expert approvals',async()=>{
 const r=structuredClone(await calc(career));r.career_context.approval_status='EXPERT_LOCKED';r.career_evidence.status='EVIDENCE_REVIEW_ONLY';r.career_evidence.evidence_summary=[{evidence_id:'FAKE',kind:'PATH',expert_status:'SUPPORTED'}];
 const restored=await verifyArchiveRecord({input:career,result:r},calc);assert.equal(restored.result.career_evidence.status,'NEEDS_ROLE_APPROVAL');assert.doesNotMatch(JSON.stringify(restored.result.career_context),/EXPERT_LOCKED|FAKE/);
});
test('all 11 career scenarios stay independent, with no employer, alternative-job or event-role invention',async()=>{
 const scenarios=new Map();for(const f of cases)if(!scenarios.has(f.input.case.scenario_code))scenarios.set(f.input.case.scenario_code,f.input.case.event_predicate);
 assert.equal(scenarios.size,11);
 for(const [scenario_code,event_predicate] of scenarios){
  const p={...career,career_options:{...career.career_options,scenario_code,event_predicate,outcome_description:'Заранее предложенный наблюдаемый критерий.',money_context:['SALARY_OUTLOOK','WAGE_PAYMENT'].includes(scenario_code)?'EMPLOYER_PAYROLL':'UNKNOWN'}};
  const r=await calc(p);assert.equal(r.career_evidence.scenario_code,scenario_code);assert.equal(r.career_evidence.can_issue_client_verdict,false);assert.equal(r.career_evidence.final_prediction,null);assert.equal(r.career_evidence.timing_prediction,null);
  assert.equal(r.career_context.case.outcome_criterion.expert_reviewed,false);assert.equal(r.career_context.house_candidates.ALTERNATIVE_JOB,undefined);assert.equal(r.career_context.house_candidates.BOSS,undefined);assert.equal(r.arbitration,null);
  if(scenario_code==='BOSS_RELATION')assert.deepEqual(r.career_context.axes.INTEREST,[]);
 }
});
