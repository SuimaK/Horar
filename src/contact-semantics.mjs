/* Browser port of contact_semantics_v15.py, supplied with horary_update_v1_5.
 * Frawley early edition (provisional); Oleshko 1999 remains a separate source.
 * Geometry is evidence for review, never a client verdict or an event date.
 */
const PLANETS=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
export const PERSON_TOPICS=['MEETING_WITH_NAMED_PERSON','CONTACT_WITH_NAMED_PERSON','MESSAGE_FROM_NAMED_PERSON'];
const OUTSIDE={
  PHYSICAL_LETTER_OR_PARCEL:['PHYSICAL_DELIVERY','CT-103','Для доставки письма или посылки нужен отдельный тематический модуль.'],
  DID_THEY_RECEIVE_MY_LETTER:['LETTER_ALREADY_SENT','CT-104','Получение уже отправленного письма требует отдельного тематического модуля.'],
  VISITOR_ARRIVAL_AT_HOME:['VISITOR_ARRIVAL','CT-105','Прибытие посетителя требует назначения дома по его социальной роли.']
};
const sign=x=>Math.floor(((x%360)+360)%360/30);
const round=(x,n=8)=>Number(x.toFixed(n));
const pair=(e,a,b)=>e.planet_a===a&&e.planet_b===b||e.planet_a===b&&e.planet_b===a;
const involves=(e,p)=>e.planet_a===p||e.planet_b===p;
const eventId=e=>`${e.planet_a}:${e.planet_b}:${e.angle_deg}:${e.day_offset.toFixed(7)}`;
const ANGLES={CONJUNCTION:0,SEXTILE:60,SQUARE:90,TRINE:120,OPPOSITION:180};

// Gate before any event search. Never infer a person's relationship from prose.
export function contactGate(input,roles){
  const options=input.contact_options;
  if(!options)return input.intent_kind==='CONTACT'?{status:'NEEDS_CLARIFICATION',reason:'Выберите сценарий контакта, отношение к человеку и подтвердите I/VII.'}:null;
  const kind=options.question_kind;
  if(Object.hasOwn(OUTSIDE,kind)){
    const [branch,rule,reason]=OUTSIDE[kind];
    return {status:'TOPIC_MODULE_REQUIRED',reason,classification:{branch,primary_houses:[],ordinary_radical_third_used:false,message_delivery_house_assigned:false,rule_ids:[rule]}};
  }
  if(!PERSON_TOPICS.includes(kind))return {status:'NEEDS_CLARIFICATION',reason:'Выберите поддерживаемый сценарий контакта.'};
  if(options.relationship_kind!=='UNRELATED_NAMED_PERSON')return {status:'TOPIC_MODULE_REQUIRED',reason:'Для супруга, родственника, партнёра, начальника и других специальных ролей нужен отдельный модуль (CT-106).'};
  if((input.relay_mode||'direct')!=='direct'||(input.question_owner_id||'я').trim()!==(input.speaker_id||'я').trim())return {status:'NEEDS_EXPERT_REVIEW',reason:'Вопрос от третьего лица требует отдельной проверки кверента и роли Луны (MO-106).'};
  if(options.approve_l1_l7!==true||!input.roles_locked||input.house_path?.length!==1||input.house_path[0]!==7)return {status:'NEEDS_CLARIFICATION',reason:'Для этой ветки выберите VII дом без производного и подтвердите назначение I/VII и роли.'};
  if(roles?.status!=='CONFIRMED')return {status:'NEEDS_EXPERT_REVIEW',reason:'Сигнификаторы совпадают или роли требуют экспертной проверки.'};
  return {status:'READY',classification:{branch:kind==='MEETING_WITH_NAMED_PERSON'?'MEETING':'INTERPERSONAL_CONTACT',primary_houses:[1,7],ordinary_radical_third_used:false,message_delivery_house_assigned:false,rule_ids:kind==='MEETING_WITH_NAMED_PERSON'?['CT-101']:['CT-101','CT-102']}};
}

export function moonRoles(a,b){
  return b==='Moon'?{primary:'QUESITED',cosignificator_of_querent:false,reason:'MOON_MAIN_SIGNIFICATOR_OF_QUESITED',rule_id:'MO-101'}:
    a==='Moon'?{primary:'QUERENT',cosignificator_of_querent:false,reason:'MOON_ALREADY_L1',rule_id:'MO-101'}:
    {primary:'COSIGNIFICATOR_OF_QUERENT',cosignificator_of_querent:true,reason:'MOON_AVAILABLE_AS_QUERENT_COSIGNIFICATOR',rule_id:'MO-101'};
}

export function staysInSign(astro,jd,name,offset){
  const current=sign(astro.position(jd,name).longitude_deg),n=Math.max(1,Math.ceil(Math.abs(offset)*12));
  for(let i=1;i<=n;i++)if(sign(astro.position(jd+offset*i/n,name).longitude_deg)!==current)return false;
  return true;
}
export function nextMoonIngress(astro,jd){
  const current=sign(astro.position(jd,'Moon').longitude_deg);
  for(let i=1;i<=36;i++){
    const end=i/12;
    if(sign(astro.position(jd+end,'Moon').longitude_deg)===current)continue;
    let lo=end-1/12,hi=end;
    for(let k=0;k<32;k++){
      const mid=(lo+hi)/2;
      if(sign(astro.position(jd+mid,'Moon').longitude_deg)===current)lo=mid;else hi=mid;
    }
    return round((lo+hi)/2);
  }
  return null;
}
export function stationEvents(astro,jd,names,days){
  const out=[];
  for(const name of [...new Set(names)].sort()){
    let prev=astro.position(jd,name).speed_deg_per_day;
    for(let i=1;i<=days*4;i++){
      const end=i/4,current=astro.position(jd+end,name).speed_deg_per_day;
      if(prev*current<0||current===0&&prev!==0){
        let lo=end-.25,hi=end,fl=prev;
        for(let k=0;k<32;k++){
          const mid=(lo+hi)/2,fm=astro.position(jd+mid,name).speed_deg_per_day;
          if(fl*fm<=0)hi=mid;else{lo=mid;fl=fm;}
        }
        out.push({planet:name,day_offset:round((lo+hi)/2,7),status:'STATION_SPEED_ZERO_CROSSING',method:'RECALCULATED_EPHEMERIS'});
      }
      prev=current;
    }
  }
  return out.sort((a,b)=>a.day_offset-b.day_offset);
}

function normalize(contacts,delta,window){
  return contacts.flatMap(c=>{
    // Exact contacts at a sign boundary require separate review, as in Python.
    if([c.lon_a,c.lon_b].some(l=>l%30<1e-5||30-l%30<1e-5))return [];
    const day_offset=round(c.days-delta);
    if(window==='PREVIOUS'?day_offset>=-1e-7:day_offset<=1e-7)return [];
    const difference=((c.lon_b-c.lon_a)%360+360)%360;
    const angle=ANGLES[c.aspect],angle_deg=difference>180&&angle!==180&&angle!==0?360-angle:angle;
    return [{planet_a:c.a,planet_b:c.b,aspect:c.aspect,angle_deg,day_offset,longitude_a:c.lon_a,longitude_b:c.lon_b,valid_signs:true,requires_cusp_review:false,window,method:'REAL_EPHEMERIS_EXACT_ROOT'}];
  });
}

export function analyzeContacts({astro,jd,a,b,past,future,ingress,stations=[],horizon=30}){
  if(a===b||![a,b].every(p=>PLANETS.includes(p)))throw Error('Неразрешённые сигнификаторы контакта');
  past=[...past].sort((x,y)=>x.day_offset-y.day_offset);
  future=[...future].sort((x,y)=>x.day_offset-y.day_offset);
  // Memoized per analysis, not persisted across charts/revisions.
  const signs=new Map();
  const same=(p,e)=>{
    const key=`${p}:${e.day_offset}`;
    if(!signs.has(key))signs.set(key,staysInSign(astro,jd,p,e.day_offset));
    return signs.get(key);
  };
  const moon=moonRoles(a,b);
  const moonPast=past.filter(e=>involves(e,'Moon')&&same('Moon',e));
  const moonFuture=future.filter(e=>involves(e,'Moon')&&same('Moon',e)&&(ingress===null||e.day_offset<ingress));
  const result={significators:{querent:a,quesited:b,moon_role:moon},
    lunar_sequence:{last_exact_in_current_sign:moonPast.at(-1)||null,next_exact_in_current_sign:moonFuture[0]||null,
      moon_ingress_day_offset:ingress,past_exact_in_current_sign:moonPast.slice(-12),future_exact_in_current_sign:moonFuture.slice(0,12),
      void_status:moonFuture.length?'MOON_HAS_EXACT_ASPECT_BEFORE_INGRESS':ingress===null||ingress>horizon?'UNDETERMINED':'NO_EXACT_MOON_ASPECT_BEFORE_INGRESS',
      moon_to_quesited_candidates:moon.cosignificator_of_querent?moonFuture.filter(e=>pair(e,'Moon',b)).slice(0,10):[],last_aspect_not_automatic_cause:true},
    direct_candidates:[],translation_candidates:[],collection_candidates:[],unresolved_prohibition_candidates:[],station_events:stations,
    source_certification:'ASTRONOMY_RECOMPUTED_OR_EXPLICITLY_SYNTHETIC_INPUT',semantic_certification:'NEEDS_EXPERT_REVIEW'};
  for(const c of future.filter(e=>pair(e,a,b)).slice(0,20)){
    const intervening=future.filter(e=>e.day_offset<c.day_offset-1e-7&&(involves(e,a)||involves(e,b))&&!pair(e,a,b)).map(e=>{
      const other=[e.planet_a,e.planet_b].find(p=>p!==a&&p!==b);
      return {event_id:eventId(e),other_planet:other,tag:other==='Moon'&&moon.cosignificator_of_querent?'MOON_COSIGNIFICATOR_CONTACT':'UNASSESSED_THIRD_PLANET_CONTACT'};
    });
    const stations_before=stations.filter(s=>[a,b].includes(s.planet)&&s.day_offset<c.day_offset);
    const crossed_signs=[a,b].filter(p=>!same(p,c));
    result.direct_candidates.push({event_id:eventId(c),aspect:c.aspect,day_offset:c.day_offset,crossed_signs,intervening,stations_before,
      status:crossed_signs.length?'SIGN_INGRESS_REVIEW':stations_before.length?'STATION_BEFORE_PERFECTION_REVIEW':intervening.length?'INTERVENING_CONTACTS_REVIEW':'GEOMETRIC_DIRECT_CANDIDATE',rule_ids:['PF-101','OB-101']});
    result.unresolved_prohibition_candidates.push(...intervening);
  }
  const speed=p=>Math.abs(astro.position(jd,p).speed_deg_per_day);
  for(const x of PLANETS.filter(p=>p!==a&&p!==b)){
    if(speed(x)>Math.max(speed(a),speed(b))+.0001){
      const related=e=>involves(e,x)&&(pair(e,x,a)||pair(e,x,b))&&same(x,e);
      const prev=past.filter(related),next=future.filter(related),e0=prev.at(-1);
      if(e0){
        const from=pair(e0,x,a)?a:b,to=from===a?b:a,e1=next.find(e=>pair(e,x,to));
        if(e1)result.translation_candidates.push({translator:x,from,to,past_event:eventId(e0),future_event:eventId(e1),future_day_offset:e1.day_offset,
          intervening_contacts:[...past,...future].filter(e=>involves(e,x)&&e.day_offset>e0.day_offset+1e-7&&e.day_offset<e1.day_offset-1e-7).map(eventId),
          status:'TRANSLATION_CANDIDATE_REQUIRES_RECEPTION_AND_CONTEXT_REVIEW',rule_ids:['PF-102','OB-101']});
      }
      if(next.length>1){
        const first=next[0],from=pair(first,x,a)?a:b,to=from===a?b:a,second=next.slice(1).find(e=>pair(e,x,to));
        if(second)result.translation_candidates.push({translator:x,from,to,first_future_event:eventId(first),second_future_event:eventId(second),future_day_offset:second.day_offset,
          status:'TWO_FUTURE_CONTACTS_REQUIRE_SOURCE_REVIEW',rule_ids:['PF-102','AUDIT-201']});
      }
    }
    if(speed(x)+.0001<Math.min(speed(a),speed(b))){
      const toA=future.find(e=>pair(e,x,a)),toB=future.find(e=>pair(e,x,b));
      if(toA&&toB)result.collection_candidates.push({collector:x,querent_event:eventId(toA),quesited_event:eventId(toB),second_contact_days:Math.max(toA.day_offset,toB.day_offset),
        status:'COLLECTION_CANDIDATE_REQUIRES_RECEPTION_AND_CONTEXT_REVIEW',rule_ids:['PF-103']});
    }
  }
  result.translation_candidates.sort((x,y)=>x.future_day_offset-y.future_day_offset);
  result.collection_candidates.sort((x,y)=>x.second_contact_days-y.second_contact_days);
  result.unresolved_prohibition_candidates=result.unresolved_prohibition_candidates.slice(0,80);
  return result;
}

export function evaluateContact({input,chart,roles,astro,jd,search,gate}){
  if(!gate)return null;
  const kind=input.contact_options?.question_kind;
  const base={schema_version:'1.5',question_kind:PERSON_TOPICS.includes(kind)||Object.hasOwn(OUTSIDE,kind)?kind:null,
    question_provenance:input.question_provenance||'USER_CONFIRMED_MOMENT',
    question_classification:gate.classification||{branch:'UNASSIGNED',primary_houses:[],ordinary_radical_third_used:false,message_delivery_house_assigned:false,rule_ids:['CT-101']},status:gate.status,reason:gate.reason||null,
    can_issue_client_verdict:false,final_prediction:null,timing_prediction:null,analysis:null,data_kind:'NO_ASTRONOMICAL_EVALUATION'};
  if(gate.status!=='READY')return base;
  const days=input.contact_options.horizon_days??14;
  const [a,b]=roles.assignments.map(r=>r.effective_significator);
  const ingress=nextMoonIngress(astro,jd);
  const future=normalize(search(astro,jd,days,.125),0,'FUTURE');
  const past=normalize(search(astro,jd-4,4,.125),4,'PREVIOUS');
  const analysis=analyzeContacts({astro,jd,a,b,past,future,ingress,stations:stationEvents(astro,jd,[a,b],days),horizon:days});
  return {...base,status:'NEEDS_EXPERT_REVIEW',data_kind:'REAL_EPHEMERIS',source_chart_hash:chart.source_chart_hash,source_chart_verified:true,
    method_profile:{primary:'FRAWLEY_EARLY_PROVISIONAL',supplement:'OLESHKO_1999_SEPARATE',implementation:'PROJECT_V15_BROWSER_PORT'},
    source_coverage:{historical_lookback_days:4,future_horizon_days:days,sampling_hours:null,sampling_method:'ADAPTIVE_MIDPOINT_SPEED_CURVATURE',legacy_sampling_hours:3,tangential_roots_may_be_missed:true,transmission_collection_semantics_validated:false,'2014_revision_audited':false},analysis,
    text_interpretation:'Рассчитаны аспекты и геометрические кандидаты. Рецепции, смысл посредничества и действительные препятствия требуют экспертной проверки. Прогноз события и срок не сформированы.'};
}
