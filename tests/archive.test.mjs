import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../src/engine.mjs';
import {verifyArchiveRecord,verifyArchive} from '../src/archive.mjs';
import {payload,loadSwiss,constants,rules} from './helpers/live-demo.mjs';
const swe=await loadSwiss();
const calculate=input=>build(input,swe,constants,rules);
const result=await calculate(payload);
const record={input:payload,result,saved_at:'2025-01-20T12:00:00Z'};
const source=item=>({format:'horary-iphone-archive-v1',records:[{question_id:item.input.question_id,revisions:[item]}]});
const mutate=fn=>{const r=structuredClone(record);fn(r);return r;};
test('BUG-001: imported numerical changes and a consistent forged hash are rejected',async()=>{
 for(const item of [
  mutate(r=>r.result.chart.planets[0].longitude_deg+=1),
  mutate(r=>r.result.chart.planets[1].house=12),
  mutate(r=>r.result.chart.cusps[0].longitude_deg+=1),
  mutate(r=>r.result.chart.latitude_deg+=1),
  mutate(r=>r.result.chart.ephemeris.calculation_settings.flags='FAKE'),
  JSON.parse(JSON.stringify(record).replaceAll(result.chart.source_chart_hash,'a'.repeat(64))),
  mutate(r=>r.result.evidence.essential.source_chart_hash='b'.repeat(64))
 ])await assert.rejects(verifyArchiveRecord(item,calculate),/карт|хэш|эфемерид/i);
});
test('BUG-002: YES, event dates and forged verdict permissions are rejected before calculation',async()=>{
 for(const item of [
  mutate(r=>r.result.judgment.judgment_status='YES'),
  mutate(r=>r.result.judgment.processing_status='RESULT_READY'),
  mutate(r=>r.result.judgment.timing={date:'2027-01-01'}),
  mutate(r=>r.result.contact_evidence.final_prediction='YES'),
  mutate(r=>r.result.contact_evidence.can_issue_client_verdict=true)
 ])await assert.rejects(verifyArchiveRecord(item,()=>assert.fail('must reject before calculation')),/прогноз|суждени|статус/);
});
test('BUG-002: imported prose and evidence flags are discarded even with otherwise valid status',async()=>{
 const bad=mutate(r=>{
  r.result.judgment.client_text='ПОДСТАВЛЕННЫЙ ПРОГНОЗ';
  r.result.judgment.expert_text='ПОДСТАВЛЕННЫЙ ПРОГНОЗ';
  r.result.contact_evidence.text_interpretation='ПОДСТАВЛЕННЫЙ ПРОГНОЗ';
  r.result.roles.assignments[0].effective_significator='Moon';
  r.result.path_search.paths=[];
 });
 const verified=await verifyArchiveRecord(bad,calculate);
 assert.doesNotMatch(JSON.stringify(verified),/ПОДСТАВЛЕННЫЙ ПРОГНОЗ/);
 assert.equal(verified.result.roles.assignments[0].effective_significator,result.roles.assignments[0].effective_significator);
 assert.equal(verified.verification.kind,'RECOMPUTED_FROM_INPUT');
});
test('archive import is atomic: a bad later revision cannot commit a valid earlier one',async()=>{
 const existing=[];
 const src=source(record);src.records[0].revisions.push(mutate(r=>{r.input.revision=2;r.result.chart.planets[0].longitude_deg=123;}));
 await assert.rejects(verifyArchive(src,existing,calculate));assert.deepEqual(existing,[]);
});
test('legacy records without newer evidence fields are recomputed and duplicate inputs must match',async()=>{
 const old=mutate(r=>{delete r.result.contact_evidence;delete r.result.evidence;delete r.input.question_provenance;delete r.result.question.question_provenance;});
 const verified=await verifyArchiveRecord(old,calculate);
 assert.equal(verified.result.judgment.timing,null);assert.equal(verified.result.contact_evidence.can_issue_client_verdict,false);
 const first=await verifyArchive(source(record),[],calculate);
 const second=await verifyArchive(source(record),first.records,calculate);assert.equal(second.duplicates,1);
 const renamed=mutate(r=>{r.input.raw_text='Другой вопрос';r.result.question.raw_text='Другой вопрос';});
 await assert.rejects(verifyArchive(source(renamed),first.records,calculate),/Конфликт/);
});
