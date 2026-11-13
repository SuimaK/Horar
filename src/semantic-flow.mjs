import {routeQuestion} from './scenario-router.mjs';
import {evaluateRelationshipCase,RELATIONSHIP_SCENARIOS} from './relationship-semantics.mjs';
import validators from './generated/semantic-validators.mjs';
const relationships=['UNRELATED_NAMED_PERSON','SPOUSE','EX_SPOUSE','ROMANTIC_PARTNER','EX_ROMANTIC_PARTNER','CHILD','PARENT','SIBLING','FRIEND','EMPLOYER','UNKNOWN'];
const provenance=v=>v.provenance==='DEMONSTRATION_NOT_ACTUAL_QUESTION'?v.provenance:v.provenance==='HISTORICAL_REFERENCE'?v.provenance:'REAL_QUESTION';
const closed=(value,keys)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error('Неизвестные поля сценария; готовые роли и свидетельства не принимаются.');
};
export const ROUTE_REASONS={EVENT_PREDICATE_NOT_DEFINED:'Уточните, какое событие требуется проверить.',EVENT_PREDICATE_MISMATCH:'Критерий события не соответствует выбранному сценарию.',MISSING_PERSON_SAFETY_ESCALATION:'Поиск пропавшего человека находится вне автоматизированного разбора.',SCENARIO_NOT_IMPLEMENTED_V16:'Для этого события нужен отдельный тематический модуль; встреча или сообщение его не заменяют.',RELATIONSHIP_HOUSE_ASSIGNMENT_NOT_APPROVED:'Социальная роль человека требует отдельного согласования домов.',L1_L7_ASSIGNMENT_NOT_LOCKED:'Подтвердите применимость I/VII и назначение ролей.',LOCKED_INTENT_AND_ROLES:'Сценарий и роли зафиксированы; разрешён только расчёт свидетельств.',LEGACY_ROLE_APPROVAL_MISMATCH:'Назначение ролей не подтверждено.',LEGACY_QUESTION_KIND_MISMATCH:'Тип контакта не соответствует выбранному событию.'};
function makeRoute(v,options){
  const relation=relationships.includes(options.relationship_kind)?options.relationship_kind:'UNKNOWN';
  const approved=v.roles_locked&&v.house_path.length===1&&v.house_path[0]===7&&options.approve_l1_l7===true&&v.relay==='direct'&&v.owner===v.speaker;
  const old={chart_id:`${v.qid}:r${v.revision}`,question_id:v.qid,question_kind:options.question_kind,question_provenance:provenance(v),relationship_kind:relation,approve_l1_l7:approved,moment_utc:v.moment_utc,latitude_deg:v.lat,longitude_deg:v.lon,house_system:'REGIOMONTANUS',horizon_days:options.horizon_days??14};
  return routeQuestion({schema_version:'1.7',question_id:v.qid,intent_code:options.intent_code,event_predicate:options.event_predicate,relationship_kind:relation,question_provenance:provenance(v),role_approval:{approved,method_profile:'FRAWLEY_EARLY_PROVISIONAL'},legacy_payload:old,question_text:v.input.raw_text,context_notes:v.context});
}
export function prepareSemantics(v){
  if(v.input.path_reviews!==undefined&&(!Array.isArray(v.input.path_reviews)||v.input.path_reviews.length>100||v.input.path_reviews.some(r=>!validators.validateReviewV16(r))))throw Error('Проверьте обязательные поля разметки путей.');
  for(const key of ['trusted_evidence','locked_roles','v17_route','arbitration_result'])if(Object.hasOwn(v.input,key))throw Error('Роли, маршруты и свидетельства формируются только текущим расчётом.');
  const opts=v.input.scenario_options,rel=v.input.relationship_options;
  if(opts!==undefined)closed(opts,['intent_code','event_predicate']);
  if(rel!==undefined)closed(rel,['scenario_code','event_predicate','relationship_kind','relationship_state','third_party_count','approve_l1_l7','outcome_description']);
  if(opts&&rel)throw Error('Выберите один сценарий вопроса.');
  if(opts){
    closed(opts,['intent_code','event_predicate']);
    if(v.intent!=='CONTACT'||!v.input.contact_options)throw Error('Маршрутизатор контактов требует выбранного сценария контакта.');
    const route=makeRoute(v,{...v.input.contact_options,...opts});
    if(['EVENT_PREDICATE_NOT_DEFINED','EVENT_PREDICATE_MISMATCH'].includes(route.reason_codes[0]))throw Error(ROUTE_REASONS[route.reason_codes[0]]);
    return {route,relationshipCase:null};
  }
  if(rel){
    closed(rel,['scenario_code','event_predicate','relationship_kind','relationship_state','third_party_count','approve_l1_l7','outcome_description']);
    if(v.intent!=='RELATIONSHIP'||typeof rel.approve_l1_l7!=='boolean')throw Error('Выберите тип «Отношения» и явное подтверждение применимости I/VII.');
    const c={schema_version:'1.8',question_id:v.qid,chart_id:`${v.qid}:r${v.revision}`,scenario_code:rel.scenario_code,event_predicate:rel.event_predicate,relationship_kind:rel.relationship_kind,relationship_state:rel.relationship_state,third_party_count:rel.third_party_count??0,evidence_refs:[]};
    if(!validators.validateRelationshipV18(c))throw Error('Проверьте сценарий отношений, его критерий, состояние союза и социальную роль.');
    if(RELATIONSHIP_SCENARIOS[c.scenario_code]!==c.event_predicate)throw Error('Критерий не соответствует выбранному сценарию отношений.');
    if(rel.outcome_description!==undefined&&(typeof rel.outcome_description!=='string'||rel.outcome_description.length>1000))throw Error('Критерий события — текст до 1000 символов.');
    // A description is a user proposal, not an expert-approved method criterion.
    c.outcome_criterion={defined:!!rel.outcome_description?.trim(),expert_reviewed:false,description:rel.outcome_description||''};
    const route=['RECONCILIATION','RETURN_TO_RELATIONSHIP'].includes(c.scenario_code)?makeRoute(v,{...rel,intent_code:c.scenario_code,question_kind:c.scenario_code}):null;
    if(route)c.v17_route={intent_code:route.intent_code,status:route.status};
    return {route,relationshipCase:c};
  }
  if(v.intent==='RELATIONSHIP')throw Error('Выберите сценарий отношений и критерий вопроса.');
  return {route:null,relationshipCase:null};
}
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
export function relationshipFromCalculation(c,input,result){
  if(!c)return {relationship_evidence:null,relationship_context:null};
  const {roles,chart,evidence}=result,opts=input.relationship_options;
  const approved=roles.status==='CONFIRMED'&&roles.roles_locked&&opts.approve_l1_l7===true&&input.house_path.length===1&&input.house_path[0]===7&&(input.relay_mode||'direct')==='direct'&&(input.question_owner_id||'я').trim()===(input.speaker_id||'я').trim();
  const assignments=roles.assignments,byId=new Map(assignments.map(a=>[a.actor_id,a.role_kind]));
  const registry=[];
  const add=e=>{registry.push({...e,id:`ev18:${chart.source_chart_hash.slice(0,16)}:${registry.length+1}`,chart_id:chart.chart_id,question_id:chart.question_id});};
  if(evidence.role_receptions?.source_chart_hash!==undefined&&evidence.role_receptions.source_chart_hash!==chart.source_chart_hash)throw Error('Свидетельства другой карты');
  const correction=evidence.method_correction;
  if(correction){
    // Compatibility records for the unchanged v1.8 protocol. Only certain
    // receptions cross this adapter; ambiguity remains in 2.0.1 separately.
    for(const r of correction.role_receptions)for(const o of r.evidence.filter(x=>x.evidence_certainty==='CERTAIN'))add({kind:'RECEPTION',source_module:'v1.1',calculation_adapter:'METHOD_2_0_1_CERTAIN_ONLY_TO_V18',from_role:byId.get(r.from_actor),toward_role:byId.get(r.to_actor),polarity:o.polarity,dignity_kind:o.dignity_kind});
    for(const role of assignments){
      const p=correction.accidentals.find(x=>x.planet===role.effective_significator),d=correction.essential.placements.find(x=>x.planet===role.effective_significator),flags=[];
      if(p.house_class==='WEAK')flags.push('CADENT_OR_WEAK_HOUSE');
      if(p.house_class==='STRONG_ANGULAR')flags.push('ANGULAR_CONTEXT');
      if(p.motion.direction==='RETROGRADE')flags.push('RETROGRADE_CONTEXT_DEPENDENT');
      if(p.motion.near_station_not_confirmed)flags.push('POSSIBLE_STATION_NOT_PROVEN');
      if(['COMBUST','UNDER_BEAMS'].includes(p.solar.state))flags.push(p.solar.state);
      if(d.own_essential_debilities.length)flags.push('ESSENTIAL_DEBILITY');
      for(const code of flags)add({kind:'CONDITION',source_module:'v1.3',calculation_adapter:'METHOD_2_0_1_CONDITIONS_TO_V18',condition_code:code,actor_role:byId.get(role.actor_id)});
    }
  }else{
    for(const r of evidence.role_receptions?.reception_evidence_by_actor||[])for(const o of r.observations)add({kind:'RECEPTION',source_module:'v1.1',from_role:byId.get(r.from_actor_id),toward_role:byId.get(r.to_actor_id),polarity:o.polarity,dignity_kind:o.dignity_kind});
    for(const a of evidence.role_assembly?.actors||[])for(const code of a.context_flags)add({kind:'CONDITION',source_module:'v1.3',condition_code:code,actor_role:byId.get(a.actor_id)});
  }
  const locked=approved?freeze({approved:true,question_id:chart.question_id,chart_id:chart.chart_id,relationship_kind:c.relationship_kind,querent:assignments[0].effective_significator,quesited:assignments[1].effective_significator}):null;
  // No registry, approval or source record is accepted from the imported result.
  const trusted=freeze(registry),request={...c,evidence_refs:trusted.map(e=>e.id)};
  const out=evaluateRelationshipCase(request,{locked_roles:locked,trusted_evidence:trusted});
  return {relationship_evidence:out,relationship_context:{case:request,role_authority:'LOCAL_USER_CONFIRMED_NOT_EXPERT_IDENTITY_VERIFIED',source_chart_hash:chart.source_chart_hash,
    axes:{INTEREST:trusted.filter(e=>e.kind==='RECEPTION'),EVENT_PATH:[],QUALITY:trusted.filter(e=>e.kind==='CONDITION')},
    source_records:trusted,scope_note:'Символические рецепции не устанавливают реальные чувства. Критерии событий и экспертная авторизация не подтверждены.'}};
}
