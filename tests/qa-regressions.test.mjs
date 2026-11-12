import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {build,validate} from '../src/engine.mjs';
import {questionScope} from '../src/question-scope.mjs';
import {payload,loadSwiss,constants,rules} from './helpers/live-demo.mjs';
const swe=await loadSwiss();
const calculate=p=>build(p,swe,constants,rules);
const schema=JSON.parse(fs.readFileSync(new URL('../schemas/contact_judgement_v15.schema.json',import.meta.url)));
const validateContact=new Ajv2020({strict:false,allErrors:true}).compile(schema);
test('BUG-003: coordinates reject coercible booleans, empty strings, arrays, numeric strings and non-finite values',()=>{
 for(const key of ['latitude_deg','longitude_deg'])for(const value of [true,false,'',' ','51.5074',[],{},null,undefined,NaN,Infinity]){
  assert.throws(()=>validate({...payload,[key]:value}),/числами|широту/,`${key}: ${String(value)}`);
 }
 assert.equal(validate({...payload,latitude_deg:0,longitude_deg:0}).lat,0);
});
test('BUG-006: Z timestamps and explicit UTC inputs match equivalent local offsets',async()=>{
 const a=await calculate({...payload,moment_local:'2025-01-20T12:00:00Z'});
 const b=await calculate({...payload,moment_local:'2025-01-20T15:00:00+03:00'});
 const c=await calculate({...payload,moment_local:undefined,moment_utc:'2025-01-20T12:00:00Z'});
 assert.equal(a.chart.source_chart_hash,b.chart.source_chart_hash);
 assert.equal(a.chart.source_chart_hash,c.chart.source_chart_hash);
 assert.deepEqual(a.chart.planets,b.chart.planets);
 assert.equal(c.meta.moment_local,'2025-01-20T12:00:00+00:00');
 assert.throws(()=>validate({...payload,moment_local:'2025-02-30T12:00:00Z'}),/Несуществующая/);
 assert.throws(()=>validate({...payload,moment_utc:'2025-01-20T13:00:00Z'}),/не совпадает/);
});
test('BUG-004: numerical and every restricted contact response satisfy the shipped schema',async()=>{
 const cases=[payload,
  {...payload,roles_locked:false},
  {...payload,relay_mode:'on_behalf'},
  {...payload,house_path:[1]},
  {...payload,contact_options:undefined},
  {...payload,raw_text:'Выживет ли человек?'},
  {...payload,contact_options:{...payload.contact_options,approve_l1_l7:false}},
  {...payload,contact_options:{...payload.contact_options,relationship_kind:'SISTER'}},
  ...['PHYSICAL_LETTER_OR_PARCEL','DID_THEY_RECEIVE_MY_LETTER','VISITOR_ARRIVAL_AT_HOME',''].map(question_kind=>({...payload,contact_options:{...payload.contact_options,question_kind}}))
 ];
 for(const p of cases){
  const r=(await calculate(p)).contact_evidence;
  assert.ok(validateContact(r),JSON.stringify(validateContact.errors));
  if(r.data_kind==='NO_ASTRONOMICAL_EVALUATION'){
   assert.equal(r.analysis,null);assert.equal(r.source_chart_verified,undefined);
  }
  for(const patch of [{can_issue_client_verdict:true},{final_prediction:'YES'},{timing_prediction:5}])assert.equal(validateContact({...r,...patch}),false);
 }
});
test('BUG-005: explicit sensitive scope and representative Russian/English formulations stop event search',async()=>{
 const cases=[
  ['Излечусь ли я от рака?','MEDICAL'],['Успешно ли пройдёт операция?','MEDICAL'],['Стоит ли отменять лекарства?','MEDICAL'],
  ['КОГДА ОН УМРЁТ?','LIFE_SAFETY'],['Выживет ли ребёнок?','LIFE_SAFETY'],['Will I survive?','LIFE_SAFETY'],
  ['Где мой пропавший сын?','MISSING_PERSON'],['Найдётся ли пропавшая девушка?','MISSING_PERSON'],
  ['Посадят ли меня в тюрьму?','CRIMINAL_LEGAL'],['Какой будет приговор?','CRIMINAL_LEGAL']
 ];
 for(const [raw_text,topic] of cases){
  const r=await calculate({...payload,raw_text});
  assert.equal(r.judgment.processing_status,'SAFETY_LIMITED',raw_text);
  assert.equal(r.meta.question_scope.topic,topic,raw_text);
  assert.equal(r.path_search.search_coverage,'NOT_EVALUATED');assert.equal(r.contact_evidence.analysis,null);
  assert.equal(r.evidence.live_gate.can_issue_client_verdict,false);
 }
 for(const sensitive_topic of ['MEDICAL','LIFE_SAFETY','MISSING_PERSON','CRIMINAL_LEGAL']){
  const r=await calculate({...payload,sensitive_topic});assert.equal(r.judgment.processing_status,'SAFETY_LIMITED');
 }
 assert.equal((await calculate({...payload,safety_tier:'HIGH'})).judgment.processing_status,'SAFETY_LIMITED');
 for(const raw_text of ['Напишет ли мне врач?','Получит ли мама мою посылку?','Будет ли встреча?','Найдётся ли пропавшая книга?'])assert.equal(questionScope({raw_text}).limited,false,raw_text);
});
test('CHART-08: demonstration provenance is explicit and never inferred from real ephemerides',async()=>{
 const demo=await calculate(payload);assert.equal(demo.question.question_provenance,'DEMONSTRATION_NOT_ACTUAL_QUESTION');
 assert.equal(demo.contact_evidence.question_provenance,'DEMONSTRATION_NOT_ACTUAL_QUESTION');
 const user=await calculate({...payload,question_provenance:undefined});
 assert.equal(user.question.question_provenance,'USER_CONFIRMED_MOMENT');
 assert.notEqual(user.question.question_provenance,'DOCUMENTED_ASTROLOGER_MOMENT');
});
