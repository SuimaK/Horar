import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {build} from '../src/engine.mjs';
import {loadSwiss,constants,rules,payload} from './helpers/live-demo.mjs';
import {renderAssembly,renderContactEvidence} from '../src/contact-view.mjs';
import {verifyArchive,verifyArchiveRecord} from '../src/archive.mjs';
const swe=await loadSwiss(),result=await build(payload,swe,constants,rules);
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
function open(records=[]){
 const dom=new JSDOM(html,{url:'https://example.test/Horar/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.renderAssembly=renderAssembly;w.renderContactEvidence=renderContactEvidence;
 w.verifyArchive=verifyArchive;w.verifyArchiveRecord=verifyArchiveRecord;
 w.horaryBuild=p=>build(p,swe,constants,rules);w.alert=()=>{};
 w.localStorage.setItem('horary-iphone-records-v1',JSON.stringify(records));
 w.eval(source);
 return {dom,w,$:id=>w.document.getElementById(id),change(id,value){const el=w.document.getElementById(id);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));}};
}
async function settle(check){for(let i=0;i<80;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('UI did not finish');}
test('contact form submits explicit scope, renders v1.3/v1.5, and preserves options on revision',async()=>{
 const {dom,w,$,change}=open();
 assert.equal($('contactOptions').hidden,true);
 change('intent','CONTACT');assert.equal($('contactOptions').hidden,false);
 change('contactKind','MESSAGE_FROM_NAMED_PERSON');change('relationshipKind','UNRELATED_NAMED_PERSON');change('subjectHouse','7');
 $('approveContactRoles').checked=true;$('lockRoles').checked=true;
 $('questionText').value=payload.raw_text;$('latitude').value='51.5074';$('longitude').value='-0.1278';
 $('momentLocal').value='2025-01-20T12:00:00';$('offset').value='+00:00';
 let sent;
 w.horaryBuild=async p=>{sent=p;return build(p,swe,constants,rules);};
 $('questionForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
 await settle(()=>sent&&$('buildBtn').disabled===false);
 assert.deepEqual(JSON.parse(JSON.stringify(sent.contact_options)),payload.contact_options);
 assert.match($('interpretationContent').textContent,/Лунная последовательность/);
 assert.match($('interpretationContent').textContent,/Свидетельства по участникам/);
 assert.match($('interpretationContent').textContent,/Передача света · 1/);
 const stored=JSON.parse(w.localStorage.getItem('horary-iphone-records-v1'));
 assert.equal(stored.length,1);assert.equal(stored[0].revisions[0].input.contact_options.horizon_days,14);
 w.document.querySelector('[data-action="revise"]').click();
 assert.equal($('questionText').readOnly,true);assert.equal($('contactKind').value,'MESSAGE_FROM_NAMED_PERSON');
 assert.equal($('approveContactRoles').checked,true);assert.equal($('contactHorizon').value,'14');
 change('relationshipKind','SPECIAL_RELATIONSHIP');assert.equal($('approveContactRoles').checked,false);
 dom.window.close();
});
test('legacy archive opens without new fields; revisions keep its original question',async()=>{
 const legacy=structuredClone(result);delete legacy.contact_evidence;delete legacy.evidence.role_assembly;delete legacy.evidence.numerical_trace;
 const input={...payload,intent_kind:'EVENT'};delete input.contact_options;
 const item={input,result:legacy,saved_at:'2025-01-20T12:00:00Z'};
 const {dom,w,$}=open([{question_id:input.question_id,revisions:[item]}]);
 w.document.querySelector('[data-action="open"]').click();
 await settle(()=>$('chartContent').textContent.includes('Учебный пример'));
 assert.match($('chartContent').textContent,/Учебный пример/);
 assert.doesNotMatch($('interpretationContent').textContent,/undefined|NaN/);
 w.document.querySelector('[data-action="revise"]').click();
 assert.equal($('questionText').value,input.raw_text);assert.equal($('questionText').readOnly,true);
 assert.equal($('contactOptions').hidden,true);assert.equal($('contactHorizon').disabled,true);
 dom.window.close();
});
test('view escapes stored question text and blocked scenarios stay distinct',()=>{
 const {dom,w,$,change}=open();
 change('intent','CONTACT');change('contactKind','PHYSICAL_LETTER_OR_PARCEL');
 assert.equal($('personContactFields').hidden,true);
 assert.match($('contactScenarioNote').textContent,/отдельный модуль/);
 const malicious=structuredClone(result);malicious.evidence.role_assembly.actors[0].actor_id='<img src=x onerror=alert(1)>';
 assert.doesNotMatch(renderAssembly(malicious.evidence.role_assembly,v=>String(v).replaceAll('<','&lt;')),/<img/);
 dom.window.close();
});
test('archive export/import preserves contact options and previous revisions',async()=>{
 const item={input:payload,result,saved_at:'2025-01-20T12:00:00Z'};
 const original=open([{question_id:payload.question_id,revisions:[item]}]);
 let blob;original.w.Blob=Blob;
 original.w.URL.createObjectURL=b=>{blob=b;return 'blob:test';};original.w.URL.revokeObjectURL=()=>{};
 original.w.HTMLAnchorElement.prototype.click=()=>{};
 original.w.document.querySelector('[data-action="export-all"]').click();
 await settle(()=>blob);
 const archive=JSON.parse(await blob.text());assert.equal(archive.format,'horary-iphone-archive-v1');
 const restored=open();let alertMessage='';restored.w.alert=m=>{alertMessage=m;};
 const file={size:blob.size,text:()=>blob.text()};
 Object.defineProperty(restored.$('importFile'),'files',{value:[file]});
 restored.$('importFile').dispatchEvent(new restored.w.Event('change',{bubbles:true}));
 await settle(()=>JSON.parse(restored.w.localStorage.getItem('horary-iphone-records-v1')).length===1);
 const saved=JSON.parse(restored.w.localStorage.getItem('horary-iphone-records-v1'));
 assert.deepEqual(saved[0].revisions[0].input.contact_options,payload.contact_options);
 assert.deepEqual(saved[0].revisions[0].result.contact_evidence,result.contact_evidence);
 assert.match(alertMessage,/Добавлено: 1/);
 original.dom.window.close();restored.dom.window.close();
});
test('BUG-002 UI: a poisoned local record is not rendered when reopened',async()=>{
 const poisoned=structuredClone(result);poisoned.judgment.client_text='ПОДСТАВЛЕННЫЙ ПРОГНОЗ';poisoned.judgment.judgment_status='YES';
 const item={input:payload,result:poisoned,saved_at:'2025-01-20T12:00:00Z'};
 const {dom,w,$}=open([{question_id:payload.question_id,revisions:[item]}]);
 let message='';w.alert=m=>{message=m;};
 w.document.querySelector('[data-action="open"]').click();await settle(()=>message);
 assert.match(message,/не прошла проверку/);
 assert.doesNotMatch(w.document.body.textContent,/ПОДСТАВЛЕННЫЙ ПРОГНОЗ/);
 assert.doesNotMatch($('interpretationContent').textContent,/Суждение готово/);
 dom.window.close();
});
test('BUG-001/002 UI: malicious import fails atomically and leaves storage unchanged',async()=>{
 const item={input:payload,result,saved_at:'2025-01-20T12:00:00Z'};
 const original=[{question_id:payload.question_id,revisions:[item]}];
 for(const mode of ['planet','hash','verdict']){
  const {dom,w,$}=open(original);let message='';w.alert=m=>{message=m;};
  const changed=structuredClone(item);
  if(mode==='planet')changed.result.chart.planets[0].longitude_deg+=1;
  if(mode==='hash')changed.result=JSON.parse(JSON.stringify(changed.result).replaceAll(result.chart.source_chart_hash,'c'.repeat(64)));
  if(mode==='verdict'){changed.result.judgment.client_text='ПОДСТАВЛЕННЫЙ ПРОГНОЗ';changed.result.judgment.judgment_status='YES';}
  const src={format:'horary-iphone-archive-v1',records:[{question_id:payload.question_id,revisions:[changed]}]};
  const before=w.localStorage.getItem('horary-iphone-records-v1');
  Object.defineProperty($('importFile'),'files',{value:[{size:5000,text:async()=>JSON.stringify(src)}]});
  $('importFile').dispatchEvent(new w.Event('change',{bubbles:true}));await settle(()=>message);
  assert.match(message,/Ошибка импорта/);assert.equal(w.localStorage.getItem('horary-iphone-records-v1'),before);
  assert.doesNotMatch(w.document.body.textContent,/ПОДСТАВЛЕННЫЙ ПРОГНОЗ/);
  dom.window.close();
 }
});
test('UI: demonstration provenance and sensitivity declarations survive revisions',async()=>{
 const {dom,w,$,change}=open();change('questionProvenance','DEMONSTRATION_NOT_ACTUAL_QUESTION');change('sensitiveTopic','MEDICAL');
 $('questionText').value=payload.raw_text;$('latitude').value='51.5074';$('longitude').value='-0.1278';
 $('momentLocal').value='2025-01-20T12:00:00';$('offset').value='+00:00';
 $('questionForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
 await settle(()=>$('chartContent').textContent.includes('Учебный пример — не реальный'));
 assert.match($('chartContent').textContent,/Медицинский вопрос/);
 w.document.querySelector('[data-action="revise"]').click();
 assert.equal($('questionProvenance').value,'DEMONSTRATION_NOT_ACTUAL_QUESTION');assert.equal($('sensitiveTopic').value,'MEDICAL');
 dom.window.close();
});
test('UI: storage failure cannot commit a partially imported archive',async()=>{
 const {dom,w,$}=open();let message='';w.alert=m=>{message=m;};
 const before=w.localStorage.getItem('horary-iphone-records-v1');
 const src={format:'horary-iphone-archive-v1',records:[{question_id:payload.question_id,revisions:[{input:payload,result,saved_at:'2025-01-20T12:00:00Z'}]}]};
 w.Storage.prototype.setItem=()=>{throw Error('storage full');};
 Object.defineProperty($('importFile'),'files',{value:[{size:5000,text:async()=>JSON.stringify(src)}]});
 $('importFile').dispatchEvent(new w.Event('change',{bubbles:true}));await settle(()=>message);
 assert.match(message,/Ошибка импорта/);assert.equal(w.localStorage.getItem('horary-iphone-records-v1'),before);
 assert.match($('archiveContent').textContent,/0 записей/);
 dom.window.close();
});
