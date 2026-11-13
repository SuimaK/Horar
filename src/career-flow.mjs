import validators from './generated/semantic-validators.mjs';
import {CAREER_SCENARIOS,evaluateCareerCase} from './career-semantics.mjs';
const LORDS=['Mars','Venus','Mercury','Moon','Sun','Mercury','Venus','Mars','Jupiter','Saturn','Saturn','Jupiter'];
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
export function prepareCareer(v){
  const o=v.input.career_options;
  if(o===undefined){if(v.intent==='CAREER')throw Error('Выберите сценарий работы и его критерий.');return null;}
  const keys=['scenario_code','event_predicate','perspective','employment_state','employment_relation','money_context','outcome_description','acknowledge_l1_l10'];
  if(v.intent!=='CAREER'||!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k)))throw Error('Проверьте поля сценария работы. Готовые роли, реестры и флаги экспертного утверждения не принимаются.');
  if(v.input.relationship_options!==undefined||v.input.scenario_options!==undefined||v.input.contact_options!==undefined)throw Error('Работа рассматривается отдельным сценарием, без маршрута контактов или отношений.');
  if(typeof o.acknowledge_l1_l10!=='boolean')throw Error('Подтверждение предварительного назначения I/X должно быть логическим.');
  if(v.house_path.length&&(v.house_path.length!==1||v.house_path[0]!==10))throw Error('Для карьеры выберите X дом без производного. VI дом не является работой по умолчанию.');
  if(v.input.path_reviews?.length)throw Error('Разметку пути контакта нельзя переносить на карьерное событие.');
  const c={schema_version:'1.9',question_id:v.qid,chart_id:`${v.qid}:r${v.revision}`,scenario_code:o.scenario_code,event_predicate:o.event_predicate,perspective:o.perspective,employment_state:o.employment_state,employment_relation:o.employment_relation,money_context:o.money_context,evidence_refs:[]};
  if(!validators.validateCareerV19(c))throw Error('Уточните сценарий, критерий события, состояние занятости, вид работы и источник денег.');
  if(c.event_predicate!==CAREER_SCENARIOS[c.scenario_code])throw Error('Критерий не соответствует выбранному сценарию работы.');
  if(c.perspective==='SELF'&&(v.relay!=='direct'||v.owner!==v.speaker))throw Error('Вопрос посредника требует отдельной проверки: укажите перспективу третьего лица.');
  if(o.outcome_description!==undefined&&(typeof o.outcome_description!=='string'||o.outcome_description.length>1000))throw Error('Критерий события — текст до 1000 символов.');
  c.outcome_criterion={defined:!!o.outcome_description?.trim(),expert_reviewed:false,description:o.outcome_description||''};
  return c;
}
export function careerFromCalculation(c,input,result){
  const {chart,roles,evidence}=result;
  if(c.question_id!==chart.question_id||c.chart_id!==chart.chart_id)throw Error('Карьерный вопрос и карта не совпадают.');
  for(const e of [evidence.essential,evidence.accidental])if(e&&(e.chart_id!==chart.chart_id||e.source_chart_hash!==chart.source_chart_hash))throw Error('Карьерные свидетельства относятся к другой карте.');
  const house=n=>{
    const longitude=chart.cusps.find(x=>x.house===n).longitude_deg;
    return {house:n,cusp_longitude_deg:longitude,lord:LORDS[Math.floor(((longitude%360)+360)%360/30)]};
  };
  const employeeScope=['EMPLOYEE','APPLICANT'].includes(c.employment_relation)&&c.perspective==='SELF';
  const querent=house(1),career=house(10),payroll=employeeScope&&['SALARY_OUTLOOK','WAGE_PAYMENT'].includes(c.scenario_code)&&c.money_context==='EMPLOYER_PAYROLL';
  const candidates={QUERENT:querent,CAREER:career};
  if(payroll){candidates.EMPLOYER_FUNDS=house(11);candidates.QUERENT_FUNDS=house(2);}
  const localConfirmed=employeeScope&&input.roles_locked&&roles.status==='CONFIRMED'&&input.house_path.length===1&&input.house_path[0]===10&&input.career_options.acknowledge_l1_l10&&(input.relay_mode||'direct')==='direct'&&(input.question_owner_id||'я').trim()===(input.speaker_id||'я').trim();
  const pending=['EXPERT_ROLE_REGISTRY_NOT_AVAILABLE'];
  if(!localConfirmed)pending.push('LOCAL_ROLE_SELECTION_NOT_CONFIRMED');
  if(querent.lord===career.lord)pending.push('SHARED_SIGNIFICATOR_UNRESOLVED');
  if(['GET_JOB','JOB_LOSS','CHANGE_JOB','PROMOTION','WAGE_PAYMENT'].includes(c.scenario_code))pending.push('EVENT_CRITERION_NOT_APPROVED');
  if(['CHANGE_JOB','COMPARE_JOBS'].includes(c.scenario_code))pending.push('ALTERNATIVE_JOB_ROLE_OPEN');
  if(c.scenario_code==='BOSS_RELATION')pending.push('BOSS_ROLE_OPEN');
  if(c.scenario_code==='PROMOTION')pending.push('PROMOTION_ROLE_OPEN');
  if(['SALARY_OUTLOOK','WAGE_PAYMENT'].includes(c.scenario_code)&&c.money_context!=='EMPLOYER_PAYROLL')pending.push(c.money_context==='UNKNOWN'?'PAYMENT_SOURCE_UNKNOWN':'CLIENT_OR_OWNER_PAYMENT_DIFFERENT_HOUSES');
  const source=[],add=e=>source.push({...e,id:`local19:${chart.source_chart_hash.slice(0,16)}:${source.length+1}`,question_id:chart.question_id,chart_id:chart.chart_id,source_chart_hash:chart.source_chart_hash});
  if(localConfirmed&&querent.lord!==career.lord){
    const actorByPlanet=new Map([[querent.lord,'QUERENT'],[career.lord,'CAREER']]);
    if(c.scenario_code!=='BOSS_RELATION')for(const e of evidence.essential?.directional_receptions||[])if(actorByPlanet.has(e.from_planet)&&actorByPlanet.has(e.to_planet))add({kind:'RECEPTION',source_module:'v1.1',from_role:actorByPlanet.get(e.from_planet),toward_role:actorByPlanet.get(e.to_planet),polarity:e.polarity,dignity_kind:e.dignity_kind});
    for(const [role,h] of Object.entries(candidates)){
      const a=evidence.accidental.planets.find(x=>x.planet===h.lord),d=evidence.essential?.placements.find(x=>x.planet===h.lord);
      add({kind:'CONDITION',source_module:'v1.2',essential_source_module:'v1.1',actor_role:role,planet:h.lord,dimension:role==='CAREER'?(c.employment_state==='EMPLOYED'?'CURRENT_JOB':'JOB_QUALITY'):role,house:a.house,house_class:a.house_class,motion:a.motion.direction,solar_state:a.solar.state,own_dignities:d?.own_essential_dignities||[],own_debilities:d?.own_essential_debilities||[]});
    }
  }
  // No authenticated expert role registry exists in this browser-only app.
  // A local confirmation is never converted into approved/EXPERT_LOCKED.
  const report=evaluateCareerCase(c,{locked_roles:null,trusted_evidence:[]});
  return {career_evidence:report,career_context:freeze({case:c,source_chart_hash:chart.source_chart_hash,approval_status:'EXPERT_ROLE_REGISTRY_NOT_AVAILABLE',local_confirmation:!!localConfirmed,house_candidates:candidates,pending_reasons:pending,preliminary_records:source,axes:{INTEREST:source.filter(e=>e.kind==='RECEPTION'),CONDITIONS:source.filter(e=>e.kind==='CONDITION'),EVENT_PATH:[]}})};
}
