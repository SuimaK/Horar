import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {build} from '../src/engine.mjs';
import {verifyArchive,verifyArchiveRecord} from '../src/archive.mjs';
import {renderCorrectionEvidence} from '../src/correction-view.mjs';
import {loadSwiss,payload,constants,rules} from './helpers/live-demo.mjs';

const independent=JSON.parse(fs.readFileSync(
  new URL('./fixtures/corrective_independent_ephemeris.json',import.meta.url)));
const swiss=await loadSwiss();
const sunrise=independent.sunrise;
const input={...payload,
  question_id:'acceptance-v201-sunrise',
  revision:1,
  intent_kind:'EVENT',
  contact_options:undefined,
  house_path:[],
  roles_locked:false,
  moment_local:new Date((sunrise.jd-2440587.5)*86400000).toISOString().slice(0,19)+'+00:00',
  latitude_deg:sunrise.latitude_deg,
  longitude_deg:sunrise.longitude_deg};
const calculate=p=>build(p,swiss,constants,rules);
const original=await calculate(input);
const method=original.evidence.method_correction;
const escapeText=value=>String(value).replace(/[&<>"']/g,s=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[s]);

test('QA-201-UI: near-horizon correction is visible with certain and sect-dependent evidence',()=>{
  assert.equal(original.evidence.sect_info.sect,'UNRESOLVED');
  assert.equal(original.evidence.essential,null,'do not mutate historical 1.1 evidence');
  assert.equal(method.sect_resolution.status,'UNRESOLVED');
  assert.ok(method.essential.directional_receptions.some(e=>e.evidence_certainty==='CERTAIN'));
  assert.ok(method.essential.directional_receptions.some(e=>e.evidence_certainty==='SECT_DEPENDENT'));
  const markup=renderCorrectionEvidence(method,escapeText,s=>s);
  const dom=new JSDOM('<main id="root">'+markup+'</main>');
  const visible=dom.window.document.querySelector('#root').textContent;
  assert.match(visible,/КОРРЕКЦИЯ МЕТОДА · 2\.0\.1/);
  assert.match(visible,/Секта не определена/);
  assert.match(visible,/Зависит от секты/);
  assert.match(visible,/вариант, зависит от секты/);
  assert.match(visible,/Поиск неполный/);
  assert.doesNotMatch(visible,/\bundefined\b|\bNaN\b/);
  assert.equal(method.can_issue_event_verdict,false);
  assert.equal(method.final_prediction,null);
  dom.window.close();
});

test('QA-201-ARCHIVE: pre-v2.0.1 revision is reopened with original chart and recalculated correction',async()=>{
  const historical=structuredClone(original);
  delete historical.evidence.method_correction;
  historical.chart.calculation_utc='2025-01-21T00:00:00Z';
  const oldChart=structuredClone(historical.chart);
  const saved='2025-01-21T00:01:00Z';
  const revived=await verifyArchiveRecord({input,result:historical,saved_at:saved},calculate);
  assert.deepEqual(revived.result.chart,oldChart,'numerical chart must stay byte-for-byte');
  assert.equal(revived.result.evidence.method_correction.schema_version,'2.0.1');
  assert.equal(revived.result.evidence.method_correction.source_chart_hash,oldChart.source_chart_hash);
  assert.equal(revived.result.evidence.method_correction.can_issue_event_verdict,false);
  assert.equal(revived.result.evidence.essential,null);
  assert.equal(revived.saved_at,saved);
  assert.equal(revived.verification.kind,'RECOMPUTED_FROM_INPUT');
  assert.equal(historical.evidence.method_correction,undefined);
});

test('QA-201-ARCHIVE: repeated import deduplicates versions without losing original question',async()=>{
  const historic=structuredClone(original);
  delete historic.evidence.method_correction;
  const item={input,result:historic,saved_at:'2025-01-21T00:01:00Z'};
  const archive={format:'horary-iphone-archive-v1',
    records:[{question_id:input.question_id,revisions:[item]}]};
  const first=await verifyArchive(archive,[],calculate);
  assert.equal(first.added,1);
  assert.equal(first.duplicates,0);
  assert.equal(first.records[0].revisions[0].input.raw_text,input.raw_text);
  const second=await verifyArchive(archive,first.records,calculate);
  assert.equal(second.added,0);
  assert.equal(second.duplicates,1);
  assert.equal(second.records.length,1);
  assert.equal(second.records[0].revisions.length,1);
  assert.equal(second.records[0].revisions[0].result.chart.source_chart_hash,original.chart.source_chart_hash);
  assert.equal(second.records[0].revisions[0].result.evidence.method_correction.can_issue_event_verdict,false);
});

test('QA-201-SECURITY: a forged prediction or altered planet blocks archive before storage',async()=>{
  const wrongVerdict=structuredClone(original);
  wrongVerdict.evidence.method_correction.can_issue_event_verdict=true;
  let called=false;
  await assert.rejects(
    verifyArchiveRecord({input,result:wrongVerdict},async()=>{called=true;return original;}),
    /прогноз|запрещённ/i);
  assert.equal(called,false,'reject fabricated claims before recomputing');
  const wrongPlanet=structuredClone(original);
  wrongPlanet.chart.planets[0].longitude_deg+=.1;
  await assert.rejects(
    verifyArchiveRecord({input,result:wrongPlanet},calculate),
    /Карта не соответствует|Изменены численные данные/);
});

test('QA-201-SCOPE: restrictive latitude is applied before ephemeris, old archive remains immutable',async()=>{
  const archive={format:'horary-iphone-archive-v1',
    records:[{question_id:input.question_id,revisions:[{
      input:{...input,latitude_deg:65.0001},
      result:original
    }]}]};
  const existing=[{question_id:'safe',revisions:[{input:{question_id:'safe',revision:1}}]}];
  const before=structuredClone(existing);
  let called=false;
  await assert.rejects(verifyArchive(archive,existing,async()=>{called=true;return original;}));
  assert.equal(called,false);
  assert.deepEqual(existing,before);
});
