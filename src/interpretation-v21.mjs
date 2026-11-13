/* Semantic reading v2.1: deterministic interpretation of recomputed evidence.
 * Traditional horary meanings are provisional; no automated event judgment.
 * Uses original chart, role registry and MethodCorrectionEvidence v2.0.1.
 */
const PLANETS={Sun:'Солнце',Moon:'Луна',Mercury:'Меркурий',Venus:'Венера',Mars:'Марс',Jupiter:'Юпитер',Saturn:'Сатурн'};
const SIGNS=['Овне','Тельце','Близнецах','Раке','Льве','Деве','Весах','Скорпионе','Стрельце','Козероге','Водолее','Рыбах'];
const ASPECTS={CONJUNCTION:'соединение',SEXTILE:'секстиль',SQUARE:'квадрат',TRINE:'трин',OPPOSITION:'оппозиция'};
const DIGNITIES={domicile:'обители',exaltation:'экзальтации',triplicity:'триплицитете',term:'терме',face:'фасе',detriment:'изгнании',fall:'падении'};
const mod=x=>(x%360+360)%360;
const list=(a)=>Array.isArray(a)?a:[];
const name=x=>PLANETS[x]||x;
const statusReview=(r)=>r?.status==='TOPIC_MODULE_REQUIRED'||r?.status==='NEEDS_EXPERT_REVIEW'||r?.status==='NEEDS_ROLE_APPROVAL';
function card(key,title,text,source_refs=[]){
 return {key,title,text,source_refs};
}
function roleDescription(role,correction,chart){
 const p=chart.planets.find(x=>x.name===role.effective_significator);
 const h=correction.house_placements.find(x=>x.planet===role.effective_significator);
 const d=correction.essential.placements.find(x=>x.planet===role.effective_significator);
 if(!p||!h||!d)throw Error('INTERPRETATION_ROLE_PLANET_MISSING');
 const sign=SIGNS[Math.floor(mod(p.longitude_deg)/30)];
 const house=h.effective_house;
 const good=list(d.own_essential_dignities).filter(x=>x!=='triplicity'||d.owners?.triplicity?.status!=='AMBIGUOUS');
 const weak=list(d.own_essential_debilities);
 const motion=p.speed_deg_per_day<0?' Планета движется ретроградно.':'';
 const positive=good.length?' Собственные достоинства: '+good.map(x=>DIGNITIES[x]||x).join(', ')+'.':'';
 const negative=weak.length?' Эссенциальные слабости: '+weak.map(x=>DIGNITIES[x]||x).join(', ')+'.':'';
 return name(p.name)+' в '+sign+', '+house+' доме.'+positive+negative+motion;
}
function receptionEvidence(roles,correction){
 const byId=new Map(roles.map(r=>[r.actor_id,r]));
 const certain=[],ambiguous=[];
 for(const link of list(correction.role_receptions)){
  const from=byId.get(link.from_actor),to=byId.get(link.to_actor);
  if(!from||!to)continue;
  for(const e of list(link.evidence)){
   if(e.from_planet!==from.effective_significator||e.to_planet!==to.effective_significator)continue;
   const row={from_actor:from.role_kind,to_actor:to.role_kind,
    from_planet:e.from_planet,to_planet:e.to_planet,
    dignity_kind:e.dignity_kind,polarity:e.polarity,certainty:e.evidence_certainty};
   if(e.evidence_certainty==='CERTAIN')certain.push(row);
   else if(e.evidence_certainty==='SECT_DEPENDENT')ambiguous.push(row);
  }
 }
 const unique=x=>[...new Map(x.map(e=>[[e.from_planet,e.to_planet,e.dignity_kind,e.polarity,e.certainty].join(':'),e])).values()];
 return {certain:unique(certain),ambiguous:unique(ambiguous)};
}
function receptionText(items){
 const visible=items.slice(0,3).map(x=>name(x.from_planet)+' находится в '+(DIGNITIES[x.dignity_kind]||x.dignity_kind)+' '+name(x.to_planet)+(x.polarity==='NEGATIVE'?' (отрицательное свидетельство)':''));
 return visible.join('; ');
}
function directEvidence(geometry){
 if(!geometry)return {status:'NOT_SEARCHED',candidates:[],review_flags:[],summary:'Прямое совершенствование здесь не проверено: нужны подтверждённые роли и подходящий тематический алгоритм.'};
 const candidates=list(geometry.contacts).filter(x=>Number.isFinite(x.day_offset)&&x.day_offset>=0).sort((a,b)=>a.day_offset-b.day_offset);
 const flags=[];
 for(const p of candidates){
  if(p.status==='AFTER_INGRESS_REVIEW'||list(p.preceding_events).some(e=>e.event_type==='INGRESS'))flags.push('INGRESS_BEFORE_EXACT');
  if(list(p.preceding_events).some(e=>e.event_type==='STATION'))flags.push('STATION_BEFORE_EXACT');
  if(p.status==='COINCIDENT_EVENT_REVIEW'||list(p.coincident_events).length)flags.push('COINCIDENT_EVENT');
 }
 const unique=[...new Set(flags)];
 let summary='';
 if(!candidates.length)summary='В проверенной области точный прямой аспект между управителями не обнаружен. Поиск остаётся неполным; отсутствие аспекта не означает ответ «нет».';
 else{
  const first=candidates[0];
  summary='Первый найденный прямой путь — '+(ASPECTS[first.aspect]||first.aspect)+' '+name(first.planet_a)+' и '+name(first.planet_b)+'. ';
  summary+='Это геометрический кандидат, а не подтверждённое совершение события.';
  if(first.status==='AFTER_INGRESS_REVIEW'||list(first.preceding_events).some(e=>e.event_type==='INGRESS'))
    summary+=' Аспект следует после перехода знака: нужны проверка изменившихся обстоятельств и их связи с вопросом.';
  if(list(first.preceding_events).some(e=>e.event_type==='STATION'))summary+=' До контакта обнаружена станция; сама по себе она не равна доказанной рефранации.';
  if(list(first.coincident_events).length)summary+=' Рядом с аспектом есть событие в пределах точности расчёта: порядок нельзя утверждать автоматически.';
 }
 return {status:candidates.length?'CANDIDATES_REVIEW_ONLY':'NONE_IN_CHECKED_SCOPE',
  candidates:candidates.slice(0,12).map(p=>({aspect:p.aspect,planet_a:p.planet_a,planet_b:p.planet_b,
    status:p.status,day_offset:p.day_offset,preceding_events:list(p.preceding_events).map(e=>({event_type:e.event_type,planet:e.planet,day_offset:e.day_offset})),
    coincident_events:list(p.coincident_events).map(e=>({event_type:e.event_type,planet:e.planet,day_offset:e.day_offset}))})),
  count:candidates.length,review_flags:unique,summary};
}
function indirectEvidence(indirect){
 if(!indirect)return {status:'NOT_SEARCHED',translation_count:0,collection_count:0,summary:'Передача и собирание света не прошли полную проверку; их отсутствие в этом разборе не является отрицательным свидетельством.'};
 const t=list(indirect.translation_candidates).length,c=list(indirect.collection_candidates).length;
 const text=t||c?
  'Дополнительная геометрия показывает кандидатов на передачу света: '+t+', на собирание света: '+c+'. Требуется проверить последовательность, роль посредника, рецепции и отсутствие препятствий. Геометрия не гарантирует действительного посредничества.':
  'В проверенной области кандидатов на передачу и собирание света не найдено, но полный поиск всех условий не подтверждён.';
 return {status:'GEOMETRY_REVIEW_ONLY',translation_count:t,collection_count:c,summary:text};
}
function scopeValid(chart,correction){
 return correction?.schema_version==='2.0.1'&&correction?.chart_id===chart?.chart_id&&
  correction?.source_chart_hash===chart?.source_chart_hash&&
  correction?.source_chart_verified===true&&chart?.data_kind==='REAL_EPHEMERIS';
}
export function buildSemanticReadingV21(result,input={}){
 const chart=result?.chart,correction=result?.evidence?.method_correction;
 if(!scopeValid(chart,correction))throw Error('INTERPRETATION_V21_CHART_IDENTITY_REQUIRED');
 if(correction.can_issue_event_verdict!==false||correction.final_prediction!==null||correction.timing_prediction!==null)
  throw Error('INTERPRETATION_V21_UPSTREAM_VERDICT_FORBIDDEN');
 const roles=result?.roles,all=list(roles?.assignments);
 const approved=roles?.status==='CONFIRMED'&&roles.roles_locked===true&&all.length===2&&
  all[0].effective_significator!==all[1].effective_significator;
 const cards=[],facts=[];
 if(all[0]){
  const text='Кверент: '+roleDescription(all[0],correction,chart);
  cards.push(card('QUERENT','Вы и ваша позиция',text,['chart.planets','roles.assignments[0]','method_correction.essential']));
  facts.push('QUERENT_SIGNIFICATOR');
 }
 if(all[1]){
  cards.push(card('QUESITED','Предмет вопроса',
    'Назначен '+all[1].radical_house+' дом: '+roleDescription(all[1],correction,chart)+
    ' Сам выбор дома требует методически корректного основания.',['chart.cusps','roles.assignments[1]']));
  facts.push('QUESITED_SIGNIFICATOR');
 }
 if(!approved)cards.push(card('ROLES','Что нужно уточнить',
   all.length===2&&all[0].effective_significator===all[1].effective_significator?
   'Оба участника обозначены одной планетой. Альтернативный сигнификатор без экспертного решения назначать нельзя.':
   'Роли и дома ещё не подтверждены. Поэтому связи между участниками и пути события не оцениваются как готовое суждение.',
   ['roles.status','roles.roles_locked']));
 const sect=correction.sect_resolution?.status;
 if(sect==='UNRESOLVED')cards.push(card('SECT','Неопределённая секта',
   'Солнце у горизонта. Достоинства, не зависящие от дневной или ночной секты, сохранены; возможные триплицитеты не считаются двумя достоверными рецепциями.',
   ['method_correction.sect_resolution','method_correction.essential']));
 const rec=approved?receptionEvidence(all,correction):{certain:[],ambiguous:[]};
 if(approved){
  const positive=rec.certain.filter(x=>x.polarity==='POSITIVE'),
        negative=rec.certain.filter(x=>x.polarity==='NEGATIVE');
  const text=rec.certain.length?
   'Установленные по таблице направленные рецепции: '+receptionText(rec.certain)+'. Положительных: '+positive.length+', отрицательных: '+negative.length+'.':
   'Определённых направленных рецепций между выбранными управителями нет.';
  const tail=rec.ambiguous.length?' Ещё '+rec.ambiguous.length+' свидетельств зависят от секты и не подтверждены.':'';
  cards.push(card('RECEPTIONS','Как связаны сигнификаторы',text+tail+
   ' Рецепция показывает символическую оценку в традиционной модели, а не реальное отношение человека.',
   ['method_correction.role_receptions']));
 }
 const eventIntent=['EVENT','CONTACT','RETURN','PRESERVATION'].includes(input?.intent_kind);
 const direct=approved&&eventIntent?directEvidence(correction.geometry):directEvidence(null);
 const indirect=approved&&eventIntent?indirectEvidence(correction.indirect):indirectEvidence(null);
 if(approved&&eventIntent){
  cards.push(card('DIRECT','Путь к событию',direct.summary,['method_correction.geometry']));
  cards.push(card('INDIRECT','Возможное посредничество',indirect.summary,['method_correction.indirect']));
 }
 const pathSearch=result?.path_search;
 if(approved&&eventIntent&&pathSearch?.source_chart_hash===chart.source_chart_hash){
  const reviews=list(pathSearch.paths).filter(x=>
    ['INTERVENING_CONTACT_REVIEW','INTERRUPTION_REVIEW','SPEED_REVIEW','SIGN_CHANGE_REVIEW'].includes(x.geometry_status));
  if(reviews.length)cards.push(card('INTERVENTIONS','Что может помешать',
    'В раннем поиске обнаружено '+reviews.length+' путей с дополнительными контактами, станциями или сменой знака. Это признаки для проверки, а не доказанный запрет или рефранация.',
    ['path_search.paths']));
 }
 const specialized=['RELATIONSHIP','CAREER','RECOVERY','LOCATION','QUALITY','COMPARISON','TIMING','PAST_FACT'].includes(input?.intent_kind);
 let limitText='Для итогового суждения требуется проверка совершенствования, значимости третьих лиц, рецепций, препятствий и условий вопроса.';
 if(specialized)limitText='Для выбранной темы нужен отдельный утверждённый критерий события или состояния; общая геометрия не заменяет тематическую интерпретацию.';
 if(!approved)limitText='Необходимо подтвердить роли, дома и их назначение, прежде чем анализировать возможность события.';
 cards.push(card('LIMIT','Чего пока нельзя заключить',limitText+
  ' Итоговые «да/нет» и сроки не вычисляются.',['judgment.processing_status','method_correction.search_scope']));
 return {schema_version:'2.1',chart_id:chart.chart_id,source_chart_hash:chart.source_chart_hash,
  provenance:'RECOMPUTED_REAL_EPHEMERIS',method_profile:'FRAWLEY_EARLY_PROVISIONAL',
  status:!approved?'ROLES_REQUIRED':specialized?'TOPIC_METHOD_REQUIRED':eventIntent?'EVENT_PATHS_REVIEW_ONLY':'EVIDENCE_REVIEW_ONLY',
  question_intent:input?.intent_kind||'UNKNOWN',roles_confirmed:approved,
  cards,fact_codes:facts,receptions:rec,direct,indirect,
  method_coverage:'PARTIAL',synthesis_state:'NOT_ADJUDICATED',
  can_issue_client_verdict:false,can_issue_event_verdict:false,
  final_prediction:null,timing_prediction:null};
}
