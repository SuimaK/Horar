import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createAppServer} from './server.mjs';

const KEY='horary-iphone-records-v1';
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),KEY);
const tab=(page,name)=>page.locator(`.tab[data-tab="${name}"]`).click();

async function fillQuestion(page,text='Учебная карта браузерной проверки'){
  await page.locator('#questionText').fill(text);
  await page.locator('#questionProvenance').selectOption('DEMONSTRATION_NOT_ACTUAL_QUESTION');
  await page.locator('#momentLocal').fill('2025-01-01T08:12:57');
  await page.locator('#offset').fill('+00:00');
  await page.locator('#latitude').fill('51.5074');
  await page.locator('#longitude').fill('-0.1278');
}
async function build(page){
  await page.locator('#buildBtn').click();
  await expect(page.locator('#screen-chart')).toHaveClass(/active/);
}
async function importJSON(page,data){
  await tab(page,'archive');
  const dialog=page.waitForEvent('dialog');
  await page.locator('#importFile').setInputFiles({name:'horary.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  const message=await dialog;const text=message.message();await message.accept();return text;
}
async function assertLayout(page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}

test('real WASM sunrise, offline reload and a new offline calculation',async({page,context,browserName},testInfo)=>{
  // A private origin can be shut down without disrupting parallel scenarios.
  const server=createAppServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/Horar/');await fillQuestion(page);await assertLayout(page);await build(page);
  await tab(page,'interpretation');
  await expect(page.locator('#interpretationContent')).toContainText('Секта не определена');
  await expect(page.locator('#interpretationContent')).not.toContainText(/undefined|NaN/);
  const method=(await stored(page))[0].revisions[0].result.evidence.method_correction;
  expect(method.sect_resolution.status).toBe('UNRESOLVED');
  expect(method.can_issue_event_verdict).toBe(false);expect(method.final_prediction).toBeNull();
  await page.locator('.method-evidence').first().evaluate(el=>el.open=true);
  await assertLayout(page);
  await page.screenshot({path:testInfo.outputPath('mobile-interpretation.png'),fullPage:true});
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
  const before=await stored(page);
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await expect(fetch(origin+'/Horar/')).rejects.toThrow();
  // WebKit's emulated offline mode blocks even literal SW responses:
  // https://github.com/microsoft/playwright/issues/42775
  // Stop the real origin in both engines; additionally emulate offline in Chromium.
  if(browserName==='chromium')await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#buildBtn')).toBeVisible();
  expect(await stored(page)).toEqual(before);
  await tab(page,'archive');await page.locator('[data-action="open"]').click();
  await expect(page.locator('#screen-chart')).toHaveClass(/active/);
  await tab(page,'question');await fillQuestion(page,'Вторая учебная карта без сети');await build(page);
  expect((await stored(page)).length).toBe(2);
  const fallback=await page.evaluate(async()=>{try{const r=await fetch('./assets/not-cached.wasm');return {ok:r.ok,type:r.headers.get('content-type')};}catch{return {networkError:true};}});
  expect(fallback.networkError===true||fallback.ok===false).toBe(true);
  expect(fallback.type||'').not.toContain('text/html');expect(errors).toEqual([]);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('old revision, card export/import, complete backup and duplicate handling',async({page},testInfo)=>{
  await page.goto('/Horar/');await fillQuestion(page);await build(page);
  const original=(await stored(page))[0].revisions[0];
  await page.locator('[data-action="revise"]').click();await build(page);
  await tab(page,'archive');await page.locator('[data-action="open"][data-revision="1"]').click();
  await expect(page.locator('#screen-chart')).toHaveClass(/active/);
  await page.locator('[data-action="revise"]').click();
  await expect(page.locator('#revisionMessage')).toContainText('Ревизия 3');
  await expect(page.locator('#questionText')).toHaveAttribute('readonly','');await build(page);
  const group=(await stored(page))[0];expect(group.revisions.map(r=>r.input.revision)).toEqual([1,2,3]);
  expect(group.revisions[0].result.chart).toEqual(original.result.chart);
  const downloadPromise=page.waitForEvent('download');await page.locator('#chartContent [data-action="download-record"]').click();
  const download=await downloadPromise;const file=testInfo.outputPath('card.json');await download.saveAs(file);
  const card=JSON.parse(await fs.readFile(file,'utf8'));
  expect(card.format).toBe('horary-iphone-record-v1');
  expect(await importJSON(page,card)).toContain('совпадающих ревизий проверено: 1');
  const fullDownload=page.waitForEvent('download');await page.locator('[data-action="export-all"]').click();
  const backup=await fullDownload;const backupFile=testInfo.outputPath('archive.json');await backup.saveAs(backupFile);
  const archive=JSON.parse(await fs.readFile(backupFile,'utf8'));
  expect(archive.records[0].revisions.length).toBe(3);
  await page.evaluate(key=>localStorage.removeItem(key),KEY);await page.reload();
  expect(await importJSON(page,card)).toContain('Добавлено: 1');
  expect(await importJSON(page,archive)).toContain('Добавлено: 2');
  expect(await importJSON(page,archive)).toContain('Добавлено: 0');
  expect((await stored(page))[0].revisions.map(r=>r.input.revision).sort()).toEqual([1,2,3]);
  await assertLayout(page);
});

test('bad input and full storage leave the previous archive and form intact',async({page})=>{
  await page.goto('/Horar/');await fillQuestion(page);await build(page);
  const before=await stored(page);const card={format:'horary-iphone-record-v1',...before[0].revisions[0]};
  const invalid=structuredClone(card);invalid.input.latitude_deg=65.0001;
  expect(await importJSON(page,invalid)).toContain('Ошибка импорта');expect(await stored(page)).toEqual(before);
  const forged=structuredClone(card);forged.result.evidence.method_correction.can_issue_event_verdict=true;
  expect(await importJSON(page,forged)).toContain('Ошибка импорта');expect(await stored(page)).toEqual(before);
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};});
  expect(await importJSON(page,card)).toContain('Ошибка импорта');expect(await stored(page)).toEqual(before);
  const opening=page.waitForEvent('dialog');await page.locator('[data-action="open"]').click();
  const error=await opening;expect(error.message()).toContain('Не удалось сохранить');await error.accept();
  await expect(page.locator('#screen-archive')).toHaveClass(/active/);
  await tab(page,'question');await fillQuestion(page,'Несохранённый учебный вопрос');await page.locator('#buildBtn').click();
  await expect(page.locator('#formError')).toContainText('Не удалось сохранить расчёт');
  await expect(page.locator('#questionText')).toHaveValue('Несохранённый учебный вопрос');expect(await stored(page)).toEqual(before);
});

test('service worker activation keeps other applications and other Horar scopes cached',async({page})=>{
  await page.goto('/');
  const keys=await page.evaluate(async()=>{
    const own='horary-pwa:'+location.origin+'/Horar/:old';
    const others=['another-app-v1','horary-pwa:'+location.origin+'/neighbor/:v1'];
    for(const key of [own,...others])await (await caches.open(key)).put('/marker',new Response('keep'));
    return {own,others};
  });
  await page.goto('/Horar/');await page.evaluate(()=>navigator.serviceWorker.ready);
  await expect.poll(()=>page.evaluate(()=>caches.keys())).not.toContain(keys.own);
  const remaining=await page.evaluate(()=>caches.keys());for(const key of keys.others)expect(remaining).toContain(key);
});

test('contact, relationship and career forms keep their own settings through reopen and revision',async({page})=>{
  await page.goto('/Horar/');
  const cases=[
    {intent:'CONTACT',fields:{contactKind:'MESSAGE_FROM_NAMED_PERSON',contactPredicate:'MESSAGE_RECEIVED',relationshipKind:'UNRELATED_NAMED_PERSON',subjectHouse:'7'},
      approval:'approveContactRoles',heading:'Лунная последовательность',key:'contact_evidence'},
    {intent:'RELATIONSHIP',fields:{relationshipScenario:'MUTUALITY',relationshipPredicate:'MUTUAL_ATTITUDE_SYMBOLIC',relationshipRole:'ROMANTIC_PARTNER',relationshipState:'CURRENT',subjectHouse:'7'},
      approval:'approveRelationshipRoles',heading:'ОТНОШЕНИЯ · v1.8',key:'relationship_evidence'},
    {intent:'CAREER',fields:{careerScenario:'SALARY_OUTLOOK',careerPredicate:'SALARY_CONDITIONS_ASSESSED',employmentState:'EMPLOYED',employmentRelation:'EMPLOYEE',moneyContext:'EMPLOYER_PAYROLL',subjectHouse:'10'},
      approval:'acknowledgeCareerRoles',heading:'РАБОТА И КАРЬЕРА · v1.9',key:'career_evidence'}
  ];
  for(const c of cases){
    await tab(page,'question');await fillQuestion(page,`Учебная проверка ${c.intent}`);
    await page.locator('#momentLocal').fill('2025-01-20T12:00');
    await page.locator('#intent').selectOption(c.intent);
    for(const [id,value] of Object.entries(c.fields))await page.locator('#'+id).selectOption(value);
    await page.locator('#lockRoles').check();await page.locator('#'+c.approval).check();await build(page);
    const saved=(await stored(page)).find(g=>g.revisions[0].input.intent_kind===c.intent).revisions[0];
    expect(saved.result[c.key].final_prediction).toBeNull();
    await tab(page,'interpretation');await expect(page.locator('#interpretationContent')).toContainText(c.heading);
    await expect(page.locator('#interpretationContent')).not.toContainText(/undefined|NaN/);await assertLayout(page);
    await tab(page,'archive');await page.locator(`[data-action="open"][data-id="${saved.input.question_id}"]`).click();
    await expect(page.locator('#screen-chart')).toHaveClass(/active/);
    await page.locator('[data-action="revise"]').click();
    await expect(page.locator('#intent')).toHaveValue(c.intent);
    for(const [id,value] of Object.entries(c.fields))await expect(page.locator('#'+id)).toHaveValue(value);
    await expect(page.locator('#'+c.approval)).toBeChecked();
    await page.locator('#resetBtn').click();
  }
  expect((await stored(page)).length).toBe(3);
});
