import {validate,canonicalHash,ENGINE} from './engine.mjs';

const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const fail=message=>{throw Error(message);};
const near=(a,b)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<1e-7;

// Archive files and localStorage are data, never trusted calculation results.
// Hash equality alone cannot authenticate an imported chart or its prose.
function checkResultClaims(result,hash){
  let nodes=0;
  function visit(value,depth=0){
    if(++nodes>100000||depth>40)fail('Слишком сложная структура результата.');
    if(!value||typeof value!=='object')return;
    for(const [key,v] of Object.entries(value)){
      if(['source_chart_hash','input_hash'].includes(key)&&v!==hash)fail('Несовпадающий исходный хэш в архиве.');
      if(['final_prediction','timing_prediction','timing'].includes(key)&&v!==null)fail('Архив содержит запрещённый прогноз или срок.');
      if(['can_issue_client_verdict','can_issue_event_verdict','can_issue_NO'].includes(key)&&v!==false)fail('Архив разрешает запрещённый клиентский прогноз.');
      if(key==='judgment_status'&&!['NOT_APPLICABLE','NOT_PERFORMED'].includes(v))fail('Архив содержит запрещённое итоговое суждение.');
      visit(v,depth+1);
    }
  }
  visit(result);
  if(!object(result.judgment)||!['NEEDS_CLARIFICATION','NEEDS_EXPERT_REVIEW','TOPIC_MODULE_REQUIRED','SEARCH_INCOMPLETE','SAFETY_LIMITED','CALCULATION_ERROR'].includes(result.judgment.processing_status))fail('Недопустимый статус суждения в архиве.');
}

export function compareChartSnapshot(stored,fresh){
  if(!object(stored))fail('Отсутствует снимок карты.');
  for(const key of ['schema_version','chart_id','question_id','moment_utc','latitude_deg','longitude_deg','location_source','house_system','zodiac','data_kind','source_chart_hash']){
    if(stored[key]!==fresh[key])fail(`Карта не соответствует повторному расчёту: ${key}.`);
  }
  for(const [key,name,fields] of [['planets','name',['longitude_deg','latitude_deg','speed_deg_per_day']],['cusps','house',['longitude_deg']]]){
    const old=stored[key],now=fresh[key];
    if(!Array.isArray(old)||old.length!==now.length||new Set(old.map(p=>p?.[name])).size!==now.length)fail(`Повреждены данные карты: ${key}.`);
    for(const p of now){
      const s=old.find(x=>x?.[name]===p[name]);
      if(!s||fields.some(f=>!near(s[f],p[f]))||key==='planets'&&s.house!==p.house)fail(`Изменены численные данные карты: ${p[name]}.`);
    }
  }
  const a=stored.ephemeris?.calculation_settings,b=fresh.ephemeris.calculation_settings;
  if(!object(a)||Object.keys(a).length!==Object.keys(b).length||Object.entries(b).some(([k,v])=>a[k]!==v))fail('Изменены настройки эфемерид.');
}

export async function verifyArchiveRecord(item,calculate){
  if(!object(item)||!object(item.input)||!object(item.result))fail('Повреждена ревизия архива.');
  const input=structuredClone(item.input),v=validate(input),r=item.result;
  // An import must carry its original identity; never generate a new ID here.
  if(typeof input.question_id!=='string'||!input.question_id||r.question?.question_id!==v.qid||r.question?.revision!==v.revision||r.question?.raw_text!==input.raw_text)fail('Вопрос или ревизия не соответствуют данным архива.');
  if(!/^[a-f0-9]{64}$/.test(r.chart?.source_chart_hash||''))fail('Некорректный исходный хэш карты.');
  checkResultClaims(r,r.chart.source_chart_hash);
  const result=await calculate(input);
  compareChartSnapshot(r.chart,result.chart);
  // Keep the validated historical numerical snapshot byte-for-byte; all imported
  // conclusions are still discarded and the additive current method is recomputed.
  result.chart=structuredClone(r.chart);
  // Discard ALL imported prose, role flags, paths and evidence, including fields
  // whose strings claim that a forged result was previously "verified".
  return {input:{...input,moment_local:v.moment_local},result,
    saved_at:typeof item.saved_at==='string'&&Number.isFinite(Date.parse(item.saved_at))?item.saved_at:new Date().toISOString(),
    verification:{kind:'RECOMPUTED_FROM_INPUT',engine:ENGINE}};
}

export async function verifyArchive(source,existing,calculate){
  if(!object(source)||source.format!=='horary-iphone-archive-v1'||!Array.isArray(source.records))fail('Неизвестный формат архива.');
  if(source.records.length>5000)fail('Слишком много групп вопросов в архиве.');
  const draft=structuredClone(existing);
  let added=0,duplicates=0,total=0;
  for(const group of source.records){
    if(!object(group)||typeof group.question_id!=='string'||!group.question_id||group.question_id.length>100||!Array.isArray(group.revisions)||group.revisions.length>1000)fail('Повреждена группа записей.');
    let target=draft.find(x=>x.question_id===group.question_id);
    if(!target){target={question_id:group.question_id,revisions:[]};draft.push(target);}
    for(const item of group.revisions){
      if(++total>5000)fail('Слишком много ревизий в одном импорте.');
      if(item?.input?.question_id!==group.question_id)fail('Ревизия принадлежит другому вопросу.');
      const verified=await verifyArchiveRecord(item,calculate);
      const index=target.revisions.findIndex(x=>x.input.revision===verified.input.revision);
      if(index>=0){
        if(await canonicalHash(target.revisions[index].input)!==await canonicalHash(item.input))fail(`Конфликт: вопрос ${group.question_id} / ревизия ${item.input.revision} содержит другие исходные данные.`);
        target.revisions[index]=verified;duplicates++;
      }else{target.revisions.push(verified);added++;}
    }
  }
  return {records:draft,added,duplicates};
}
