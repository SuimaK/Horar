/* v1.3 evidence assembly. Symbolic fixture verdicts are intentionally excluded
 * from the live application: no Boolean fixture can certify a real event. */
export function liveGate(report){
  if(report.safety_tier==='HIGH')return {status:'SAFETY_LIMITED',can_issue_client_verdict:false,rule_id:'SEM13-SAFE'};
  if(['RETURN','RECOVERY','LOCATION'].includes(report.question_kind))return {status:'TOPIC_MODULE_REQUIRED',can_issue_client_verdict:false,rule_id:'QA09-03'};
  if(!report.roles_locked)return {status:'NEEDS_ROLE_REVIEW',can_issue_client_verdict:false,rule_id:'SEM13-ROLES'};
  if(!report.trace_recomputed_from_chart||!report.all_channels_covered)return {status:'SEARCH_INCOMPLETE',can_issue_client_verdict:false,rule_id:'QA09-04'};
  if(!report.semantic_perfection_review_complete)return {status:'NEEDS_EXPERT_REVIEW',can_issue_client_verdict:false,rule_id:'SEM13-EXPERT'};
  return {status:'NEEDS_EXPERT_REVIEW',can_issue_client_verdict:false,rule_id:'SEM13-NOT-FINAL',detail:'Semantic expert decision service not yet integrated'};
}
export function assembleRoleEvidence(dignity,accidental,roles,receptions){
  const inputs=[dignity,accidental,roles,receptions];
  if(inputs.some(x=>!x||typeof x!=='object'))throw Error('Нужны четыре объекта свидетельств');
  const id=dignity.chart_id,hash=dignity.source_chart_hash;
  if(!id||!hash||inputs.some(x=>x.chart_id!==id||x.source_chart_hash!==hash))throw Error('Различаются карта или исходный хэш свидетельств');
  if(inputs.some((x,i)=>x.schema_version!==['1.1','1.2','1.0','1.1'][i]))throw Error('Несовместимые версии модулей');
  if(!roles.roles_locked||roles.status!=='CONFIRMED')throw Error('Роли не подтверждены');
  if(dignity.judgment_status!=='NOT_PERFORMED'||accidental.judgment_status!=='NOT_PERFORMED'||receptions.analysis_status!=='EVIDENCE_ONLY_NO_VERDICT')throw Error('Ожидаются свидетельства без готового прогноза');
  if(dignity.dignity_table_profile!=='OLESHKO_1999_P55')throw Error('Неизвестный профиль достоинств');
  const d=new Map(dignity.placements.map(p=>[p.planet,p])),a=new Map(accidental.planets.map(p=>[p.planet,p]));
  if(dignity.placements.length!==7||accidental.planets.length!==7||d.size!==7||a.size!==7||[...d.keys()].some(p=>!a.has(p)))throw Error('Нужны семь уникальных планет');
  if(receptions.unresolved_actor_pairs?.length)throw Error('Коллизия ролей требует проверки');
  const byActor=new Map(roles.assignments.map(r=>[r.actor_id,r.effective_significator]));
  if(byActor.size!==roles.assignments.length)throw Error('Повторные участники в ролях');
  const refs=receptions.reception_evidence_by_actor||[];
  if(refs.some(e=>!byActor.has(e.from_actor_id)||!byActor.has(e.to_actor_id)||byActor.get(e.from_actor_id)!==e.from_planet||byActor.get(e.to_actor_id)!==e.to_planet))throw Error('Рецепции не соответствуют подтверждённым ролям');
  const actors=roles.assignments.map(role=>{
    const p=role.effective_significator,e=d.get(p),ac=a.get(p);
    if(!e||!ac)throw Error('Неизвестный сигнификатор роли');
    const flags=[];
    if(ac.house_class==='WEAK')flags.push('CADENT_OR_WEAK_HOUSE');
    if(ac.house_class==='STRONG_ANGULAR')flags.push('ANGULAR_CONTEXT');
    if(ac.motion.direction==='RETROGRADE')flags.push('RETROGRADE_CONTEXT_DEPENDENT');
    if(ac.motion.near_station_not_confirmed)flags.push('POSSIBLE_STATION_NOT_PROVEN');
    if(['COMBUST','UNDER_BEAMS'].includes(ac.solar.state))flags.push(ac.solar.state);
    if(e.own_essential_debilities.length)flags.push('ESSENTIAL_DEBILITY');
    return {actor_id:role.actor_id,planet:p,own_essential_dignities:e.own_essential_dignities,own_essential_debilities:e.own_essential_debilities,
      accidental_house_class:ac.house_class,motion_direction:ac.motion.direction,solar_state:ac.solar.state,context_flags:flags,
      receptions_outbound:refs.filter(r=>r.from_actor_id===role.actor_id),interpretive_warning:'Ability and consent NOT determined from these flags'};
  });
  return {schema_version:'1.3',engine_version:'1.3.0',chart_id:id,source_chart_hash:hash,evidence_status:'EVIDENCE_ASSEMBLED_NOT_JUDGED',source_chart_hash_verified:false,final_prediction:null,
    method_profile:'frawley_early_with_explicit_oleshko_1999_dignity_table',actors,actor_count:actors.length,
    limitations:['2014 Frawley revised table not verified','No human intention/consent inferred from reception','No geometric perfection asserted from dignity','Chart hash equality is not recomputation or provenance validation']};
}
