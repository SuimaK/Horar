/*
 * Horary v2.2 — review-grade arbiter of perfection routes.
 *
 * The 1999 Oleshko source distinguishes translation, collection, frustration,
 * prohibition and refranation. Frawley's early textbook requires contextual
 * evaluation of receptions (no fixed threshold for every translation/collection).
 * Geometry and chronology can be computed; event outcomes cannot be certified
 * by an unaudited blanket rule. Never return client YES/NO or timing.
 *
 * INPUTS: recomputed ChartSnapshot 1.0 + MethodCorrectionEvidence 2.0.1 +
 * SemanticReadingEvidence 2.1. No imported reviews or user-supplied verdicts.
 */
const NAMES=new Set(['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn']);
const ASPECTS=new Set(['CONJUNCTION','SEXTILE','SQUARE','TRINE','OPPOSITION']);
const TOPIC_SPECIFIC=new Set([
 'RELATIONSHIP','CAREER','RECOVERY','LOCATION','QUALITY','COMPARISON',
 'TIMING','PAST_FACT','STATUS'
]);
const EVENTS=new Set(['INGRESS','STATION']);
const list=value=>Array.isArray(value)?value:[];
const unique=arr=>[...new Set(arr)];
const source=(channel,i)=>'method_correction.'+channel+'['+i+']';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const rolePair=roles=>roles?.status==='CONFIRMED'&&roles.roles_locked===true&&
 list(roles.assignments).length===2&&list(roles.assignments).every(r=>NAMES.has(r.effective_significator))&&
 roles.assignments[0].effective_significator!==roles.assignments[1].effective_significator;
const safeDate=day=>finite(day)&&day>=0&&day<=365;
function checkIdentity(result){
 const chart=result?.chart,method=result?.evidence?.method_correction,semantic=result?.evidence?.interpretation_v21;
 if(chart?.schema_version!=='1.0'||chart?.data_kind!=='REAL_EPHEMERIS'||
    typeof chart.chart_id!=='string'||!(/^[a-f0-9]{64}$/i).test(chart.source_chart_hash||'')||
    method?.schema_version!=='2.0.1'||semantic?.schema_version!=='2.1'||
    method?.source_chart_verified!==true||
    method.chart_id!==chart.chart_id||semantic.chart_id!==chart.chart_id||
    method.source_chart_hash!==chart.source_chart_hash||
    semantic.source_chart_hash!==chart.source_chart_hash)
   throw Error('ARBITER_V22_SOURCE_MISMATCH');
 if(method.can_issue_event_verdict!==false||method.final_prediction!==null||method.timing_prediction!==null||
    semantic.can_issue_event_verdict!==false||semantic.can_issue_client_verdict!==false||
    semantic.final_prediction!==null||semantic.timing_prediction!==null)
   throw Error('ARBITER_V22_UNTRUSTED_VERDICT');
 if(result.path_search?.source_chart_hash!==undefined&&result.path_search.source_chart_hash!==chart.source_chart_hash)
   throw Error('ARBITER_V22_STALE_SEARCH');
 if(result.roles?.source_chart_hash!==undefined&&result.roles.source_chart_hash!==chart.source_chart_hash)
   throw Error('ARBITER_V22_STALE_ROLES');
 return {chart,method,semantic};
}
function issue(c,why,sourceRef,kind='REQUIRES_REVIEW'){
 return {code:c,explanation:why,source_ref:sourceRef,disposition:kind};
}
function asEvent(e,p,index,category){
 if(!e||!EVENTS.has(e.event_type)||!NAMES.has(e.planet)||!finite(e.day_offset))return null;
 return issue(category,
   (e.event_type==='INGRESS'?'Переход знака':'Станция')+' '+e.planet+
   ' относительно точного аспекта требует анализа изменения обстоятельств и порядка событий.',
   source(p,index));
}
function aspectCandidate(c,index,a,b){
 if(!c||!NAMES.has(c.planet_a)||!NAMES.has(c.planet_b)||
    !([a,b].includes(c.planet_a)&&[a,b].includes(c.planet_b))||
    !ASPECTS.has(c.aspect)||!safeDate(c.day_offset))
   throw Error('ARBITER_V22_INVALID_DIRECT_CANDIDATE');
 const concerns=[];
 const before=list(c.preceding_events),same=list(c.coincident_events);
 for(const e of before){const item=asEvent(e,'geometry.contacts',index,e.event_type==='INGRESS'?'INGRESS_BEFORE_CONTACT':'STATION_BEFORE_CONTACT');if(item)concerns.push(item);}
 for(const e of same){const item=asEvent(e,'geometry.contacts',index,'EVENT_ORDER_UNRESOLVED');if(item)concerns.push(item);}
 if(c.status==='AFTER_INGRESS_REVIEW'&&!concerns.some(x=>x.code==='INGRESS_BEFORE_CONTACT'))
  concerns.push(issue('INGRESS_BEFORE_CONTACT','Перед совершенствованием указан переход знака, требующий контекстной проверки.',source('geometry.contacts',index)));
 if(c.status==='COINCIDENT_EVENT_REVIEW'&&!concerns.some(x=>x.code==='EVENT_ORDER_UNRESOLVED'))
  concerns.push(issue('EVENT_ORDER_UNRESOLVED','Аспект и изменение обстоятельств совпадают в пределах численной точности.',source('geometry.contacts',index)));
 return {candidate_id:'DIRECT:'+index,kind:'DIRECT',status:concerns.length?'CHRONOLOGY_REVIEW':'GEOMETRY_READY_CONTEXT_PENDING',
  participants:[a,b],mediator:null,aspect:c.aspect,day_offset:c.day_offset,
  source_ref:source('geometry.contacts',index),concerns,review_required:true};
}
function legacyInterventions(result,a,b){
 const paths=list(result.path_search?.paths),flags=[];
 for(const [i,path] of paths.entries()){
  if(!path?.contacts?.length||!list(path.participants).includes(a)||!list(path.participants).includes(b))continue;
  if(!['INTERVENING_CONTACT_REVIEW','INTERRUPTION_REVIEW','SIGN_CHANGE_REVIEW','SPEED_REVIEW'].includes(path.geometry_status))continue;
  const codes={
   INTERVENING_CONTACT_REVIEW:'THIRD_PARTY_CONTACT_CONTEXT',
   INTERRUPTION_REVIEW:'POSSIBLE_INTERRUPTION_CONTEXT',
   SIGN_CHANGE_REVIEW:'SIGN_CHANGE_CONTEXT',
   SPEED_REVIEW:'STATION_CONTEXT'
  };
  flags.push(issue(codes[path.geometry_status],
   'Предшествующее вычисленное свидетельство требует определить, кто представлен третьей планетой и изменяет ли она исход дела. Любой контакт не равен запрету.',
   'path_search.paths['+i+']'));
 }
 return flags;
}
function indirectCandidates(indirect,a,b){
 const result=[];
 if(!indirect)return result;
 for(const [i,c] of list(indirect.translation_candidates).entries()){
  if(!c||!NAMES.has(c.translator)||[a,b].includes(c.translator)||
     !((c.from===a&&c.to===b)||(c.from===b&&c.to===a))||
     !c.past_contact||!c.next_contact||!safeDate(c.next_contact.day_offset))continue;
  const concerns=[];
  const speed=c.relative_speeds;
  if(!speed||!finite(speed.translator)||!finite(speed.from)||!finite(speed.to)||
    speed.translator<=Math.max(speed.from,speed.to))
   concerns.push(issue('TRANSLATOR_SPEED_NOT_CERTIFIED','Посредник должен двигаться быстрее обоих сигнификаторов; условие не доказано.','method_correction.indirect.translation_candidates['+i+']'));
  if(!finite(c.past_contact.day_offset)||c.past_contact.day_offset>=0||
     c.past_contact.day_offset>=c.next_contact.day_offset)
   concerns.push(issue('PAST_FUTURE_SEQUENCE_INVALID','Передача требует разделения с одним сигнификатором до будущего контакта с другим.','method_correction.indirect.translation_candidates['+i+']'));
  if(list(c.intervening_contacts).length)
   concerns.push(issue('TRANSLATOR_INTERMEDIATE_CONTACTS','До завершения посредничества имеются другие контакты, значение которых надо проверить.','method_correction.indirect.translation_candidates['+i+']'));
  if(c.recent_separation_status!=='CONFIRMED')
   concerns.push(issue('RECENT_SEPARATION_NOT_CERTIFIED','Давность или знак предыдущего контакта не подтверждены полностью.','method_correction.indirect.translation_candidates['+i+']'));
  // Reception threshold is contextual, not fixed.
  concerns.push(issue('TRANSLATION_RECEPTION_AND_ROLE_CONTEXT',
   'Нужно оценить рецепции между участниками и смысловую роль посредника; фиксированного универсального порога рецепций нет.','method_correction.indirect.translation_candidates['+i+']'));
  result.push({candidate_id:'TRANSLATION:'+i,kind:'TRANSLATION',status:'INDIRECT_CONTEXT_REVIEW',
   participants:[a,b],mediator:c.translator,aspect:c.next_contact.aspect,
   day_offset:c.next_contact.day_offset,source_ref:'method_correction.indirect.translation_candidates['+i+']',
   concerns,review_required:true});
 }
 for(const [i,c] of list(indirect.collection_candidates).entries()){
  if(!c||!NAMES.has(c.collector)||[a,b].includes(c.collector))continue;
  const contacts=list(c.contacts);
  if(contacts.length!==2||contacts.some(x=>!safeDate(x.day_offset)))continue;
  const concerns=[];
  if(c.collector_receives_both===false||c.collector_receives_both===null)
    concerns.push(issue('COLLECTION_RECEPTION_CONTEXT',
    'Отсутствует определённая рецепция обеих сторон по табличному критерию. Это требует анализа различий между школами Фроули и Олешко, а не автоматического отказа.',
    'method_correction.indirect.collection_candidates['+i+']'));
  else concerns.push(issue('COLLECTION_RECEPTION_NOT_SUFFICIENT',
    'Даже подтверждённые рецепции сами по себе не доказывают способность посредника завершить дело.',
    'method_correction.indirect.collection_candidates['+i+']'));
  concerns.push(issue('COLLECTOR_CAPACITY_AND_ROLE_CONTEXT',
    'Требуется подтвердить способность и смысловую роль собирающей планеты.','method_correction.indirect.collection_candidates['+i+']'));
  result.push({candidate_id:'COLLECTION:'+i,kind:'COLLECTION',status:'INDIRECT_CONTEXT_REVIEW',
   participants:[a,b],mediator:c.collector,aspect:'MULTIPLE',day_offset:Math.max(...contacts.map(x=>x.day_offset)),
   source_ref:'method_correction.indirect.collection_candidates['+i+']',
   concerns,review_required:true});
 }
 return result;
}
function antiscia(method,a,b){
 return list(method.geometry?.antiscion_candidates).flatMap((c,i)=>
  c?.planet_a===a&&c?.planet_b===b&&safeDate(c.day_offset)?[{
   candidate_id:'ANTISCION:'+i,kind:'ANTISCION',status:'SPECIAL_RULE_REVIEW',
   participants:[a,b],mediator:null,aspect:c.aspect,
   day_offset:c.day_offset,source_ref:source('geometry.antiscion_candidates',i),
   concerns:[issue('ANTISCION_METHOD_CONTEXT',
     'Антис использует отдельную традиционную трактовку; геометрическое совпадение не равно телесному аспекту.',
     source('geometry.antiscion_candidates',i))],review_required:true
  }]:[]);
}
function capacity(method,significator){
 const p=list(method.accidentals).find(x=>x.planet===significator);
 if(!p)return {planet:significator,condition:'NOT_ASSESSED',observations:[]};
 const obs=[];
 if(p.house_class==='STRONG_ANGULAR')obs.push('STRONG_ANGULAR_CONTEXT');
 if(p.house_class==='WEAK')obs.push('WEAK_HOUSE_CONTEXT');
 if(p.motion?.direction==='RETROGRADE')obs.push('RETROGRADE_CONTEXT');
 if(['COMBUST','UNDER_BEAMS'].includes(p.solar?.state))obs.push(p.solar.state);
 return {planet:significator,condition:obs.length?'CONTEXT_FACTORS_PRESENT':'NO_LISTED_FACTORS',observations:obs};
}
export function arbitratePerfectionV22(result,input={}){
 const {chart,method,semantic}=checkIdentity(result);
 const assignments=list(result.roles?.assignments),intent=input.intent_kind||'UNKNOWN';
 const contactReady=intent!=='CONTACT'||result.scenario_route?.status==='READY_FOR_V16_EVIDENCE_ONLY';
 const safeCase=['EVENT','CONTACT'].includes(intent)&&!TOPIC_SPECIFIC.has(intent)&&contactReady;
 const roleReady=rolePair(result.roles)&&semantic.roles_confirmed===true;
 const safetyLimited=result.judgment?.processing_status==='SAFETY_LIMITED'||
  result.meta?.question_scope?.limited===true;
 const reasons=[];
 if(safetyLimited)reasons.push('SAFETY_LIMITED');
 if(!roleReady)reasons.push('ROLES_NOT_CONFIRMED_OR_COLLIDING');
 if(!safeCase)reasons.push(contactReady?'TOPIC_REQUIRES_SPECIAL_METHOD':'CONTACT_SCENARIO_NOT_APPROVED');
 const canAnalyze=safeCase&&roleReady&&!safetyLimited;
 const a=assignments[0]?.effective_significator,b=assignments[1]?.effective_significator;
 const candidates=[],context=[];
 let receptions={certain:[],ambiguous:[]};
 if(canAnalyze){
  receptions={certain:list(semantic.receptions?.certain),ambiguous:list(semantic.receptions?.ambiguous)};
  const direct=list(method.geometry?.contacts);
  if(direct.length>100)throw Error('ARBITER_V22_TOO_MANY_DIRECT_PATHS');
  for(const [i,c] of direct.entries())candidates.push(aspectCandidate(c,i,a,b));
  candidates.push(...indirectCandidates(method.indirect,a,b),...antiscia(method,a,b));
  context.push(...legacyInterventions(result,a,b));
  if(assignments[0].effective_significator==='Moon'||assignments[1].effective_significator==='Moon')
   context.push(issue('MOON_ALREADY_PRINCIPAL_SIGNIFICATOR',
    'Луна уже обозначает основного участника и не считается независимым третьим посредником или внешней помехой.',
    'roles.assignments'));
  else context.push(issue('MOON_COSIGNIFICATOR_PATH_PENDING',
    'Лунный путь как сосигнификатора не прошёл полную независимую проверку относительно всех препятствий.',
    'method_correction.lunar'));
 }else context.push(issue('GATE_BLOCKED','Сначала нужно устранить ограничения по теме, ролям или безопасности.','judgment.processing_status'));
 const statuses=candidates.reduce((acc,c)=>(acc[c.kind]=(acc[c.kind]||0)+1,acc),{});
 const searchCoverage=method.search_scope?.coverage||'NOT_SEARCHED';
 const unresolved=[
  ...reasons,
  'SOURCE_2014_RECONCILIATION_REQUIRED',
  'RECEPTION_CONTEXT_REQUIRED',
  'ACTOR_CAPACITY_CONTEXT_REQUIRED',
  'THIRD_PARTY_MEANING_REQUIRED',
  'MOON_AND_ALL_CHANNELS_COVERAGE_INCOMPLETE',
  'TOPIC_EVENT_CRITERION_REQUIRED',
  ...(searchCoverage==='SEARCH_INCOMPLETE'?['SEARCH_INCOMPLETE']:[])
 ];
 const status=safetyLimited?'SAFETY_LIMITED':!roleReady?'ROLES_REQUIRED':!safeCase?'TOPIC_METHOD_REQUIRED':
   candidates.length?'CANDIDATES_WITH_OPEN_REVIEW':'NO_CANDIDATE_IN_INCOMPLETE_SCOPE';
 const headline=status==='CANDIDATES_WITH_OPEN_REVIEW'?
  'Найдены возможные пути совершенствования, но их смысл и препятствия требуют оценки.':
  status==='NO_CANDIDATE_IN_INCOMPLETE_SCOPE'?
  'В проверенных каналах путь не найден. Это не означает отрицательного ответа: поиск неполон.':
  status==='ROLES_REQUIRED'?'Для анализа события нужно подтвердить разные сигнификаторы участников.':
  status==='TOPIC_METHOD_REQUIRED'?'Для этой темы нужен отдельный алгоритм суждения.':
  'Автоматический событийный разбор ограничен условиями вопроса.';
 return {
  schema_version:'2.2',chart_id:chart.chart_id,source_chart_hash:chart.source_chart_hash,
  provenance:'RECOMPUTED_REAL_EPHEMERIS',method_profile:'FRAWLEY_EARLY_PLUS_OLESHKO_1999_SOURCE_DISTINGUISHED',
  status,question_intent:intent,roles_confirmed:roleReady,
  channel_counts:statuses,candidates:candidates.slice(0,80),context_checks:context,
  receptions,capacity:canAnalyze?[capacity(method,a),capacity(method,b)]:[],
  search_coverage:searchCoverage,
  unresolved_checks:unique(unresolved),
  synthesis:{state:'REVIEW_REQUIRED',headline,
   explanation:'Прямое совершенствование, передача и собирание света — разные механизмы. Препятствие, станция или рецепция требуют оценки ситуации; одно из них не позволяет автоматически объявить событие совершившимся или невозможным.',
   accepted_path_ids:[],rejected_path_ids:[],expert_assessments_applied:false},
  can_issue_client_verdict:false,can_issue_event_verdict:false,
  final_prediction:null,timing_prediction:null
 };
}
