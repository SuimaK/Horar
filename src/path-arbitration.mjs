import validators from './generated/semantic-validators.mjs';
import {staysInSign} from './contact-semantics.mjs';
const PLANETS=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
const unique=a=>[...new Set(a)].sort();
export function parseEvent(id){
  if(typeof id!=='string'||!/^[A-Za-z]+:[A-Za-z]+:(?:0|60|90|120|180|240|270|300):[-+]?\d+(?:\.\d+)?$/.test(id))throw Error('Malformed astronomical event ID');
  const [a,b,angle,day]=id.split(':');
  if(!PLANETS.includes(a)||!PLANETS.includes(b)||a===b)throw Error('Invalid planet pair');
  return {planet_a:a,planet_b:b,angle_deg:Number(angle),day_offset:Number(day)};
}
const pair=(id,a,b)=>{const e=parseEvent(id);return e.planet_a===a&&e.planet_b===b||e.planet_a===b&&e.planet_b===a;};
async function pathId(prefix,...parts){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(parts.join('|')));
  return prefix+'-'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('').slice(0,14);
}
export async function candidatePaths(evidence,{astro=null,jd=null}={}){
  const a=evidence.analysis;if(!a)return [];
  const {querent:q,quesited:s}=a.significators,paths=[];
  const changed=ids=>{
    const out=[];if(!astro||jd===null)return out;
    for(const id of ids){const e=parseEvent(id);if(e.day_offset>0)for(const p of [e.planet_a,e.planet_b])if(!staysInSign(astro,jd,p,e.day_offset))out.push(p);}
    return unique(out);
  };
  for(const c of a.direct_candidates){
    const e=parseEvent(c.event_id);
    if(!pair(c.event_id,q,s)||Math.abs(e.day_offset-c.day_offset)>1e-5)throw Error('Direct event differs from locked roles/time');
    const serious=unique(c.intervening.filter(x=>x.tag!=='MOON_COSIGNIFICATOR_CONTACT').map(x=>x.event_id));
    const moon=unique(c.intervening.filter(x=>x.tag==='MOON_COSIGNIFICATOR_CONTACT').map(x=>x.event_id));
    const stations=c.stations_before.filter(x=>x.day_offset<c.day_offset);
    paths.push({path_id:await pathId('DIRECT',c.event_id),kind:'DIRECT',event_ids:[c.event_id],contact_day_offset:c.day_offset,first_future_event_id:c.event_id,status_v15:c.status,required_intervention_ids:serious,cosignificator_contact_ids:moon,sign_change_planets:c.crossed_signs,stations_before:stations,
      issues:[...(c.crossed_signs.length?['SIGN_CHANGE']:[]),...(stations.length?['STATION_BEFORE_EXACT_CONTACT']:[]),...(serious.length?['THIRD_PLANET_CONTACTS']:[])],source_rule_ids:['PF-101','OB-101','V16-01']});
  }
  for(const c of a.translation_candidates){
    const e0=c.past_event||c.first_future_event,e1=c.future_event||c.second_future_event;
    if(!e0||!e1)throw Error('Incomplete translation path');
    const t0=parseEvent(e0).day_offset,t1=parseEvent(e1).day_offset;
    if(t1<=0||t1<=t0)throw Error('Out-of-order translation');
    if(!((pair(e0,c.translator,q)&&pair(e1,c.translator,s))||(pair(e1,c.translator,q)&&pair(e0,c.translator,s))))throw Error('Translation does not connect locked roles');
    const change=changed([e0,e1]),inter=unique(c.intervening_contacts||[]),two=Object.hasOwn(c,'first_future_event');
    inter.forEach(parseEvent);
    paths.push({path_id:await pathId('TRANSFER',c.translator,e0,e1),kind:two?'TRANSLATION_TWO_FUTURE':'TRANSLATION_PAST_FUTURE',event_ids:[e0,e1],contact_day_offset:t1,required_intervention_ids:inter,cosignificator_contact_ids:[],sign_change_planets:change,stations_before:[],
      issues:[...(two?['TWO_FUTURE_TRANSLATION_UNCONFIRMED']:[]),...(change.length?['SIGN_CHANGE']:[]),...(inter.length?['INTERMEDIATE_CONTACTS']:[]),'INDIRECT_STATION_SEQUENCE_NOT_FULLY_CERTIFIED'],status_v15:c.status,source_rule_ids:['PF-102','V16-02']});
  }
  for(const c of a.collection_candidates){
    const e0=c.querent_event,e1=c.quesited_event,t0=parseEvent(e0).day_offset,t1=parseEvent(e1).day_offset;
    if(Math.min(t0,t1)<=0||[q,s].includes(c.collector)||!pair(e0,q,c.collector)||!pair(e1,s,c.collector))throw Error('Invalid collector pathway');
    const change=changed([e0,e1]);
    paths.push({path_id:await pathId('COLLECT',c.collector,e0,e1),kind:'COLLECTION',event_ids:[e0,e1],contact_day_offset:Math.max(t0,t1),required_intervention_ids:[],cosignificator_contact_ids:[],sign_change_planets:change,stations_before:[],issues:['INDIRECT_STATION_SEQUENCE_NOT_FULLY_CERTIFIED','COLLECTOR_CONTEXT_NOT_VERIFIED',...(change.length?['SIGN_CHANGE']:[])],status_v15:c.status,source_rule_ids:['PF-103','V16-03']});
  }
  if(new Set(paths.map(p=>p.path_id)).size!==paths.length)throw Error('Duplicate path identifier');
  return paths.sort((a,b)=>a.contact_day_offset-b.contact_day_offset||(a.path_id<b.path_id?-1:a.path_id>b.path_id?1:0));
}
function validateReviews(reviews,paths){
  if(!Array.isArray(reviews))throw Error('Reviews must be an array');
  const known=new Map(paths.map(p=>[p.path_id,p])),seen=new Map();
  for(const r of reviews){
    if(!validators.validateReviewV16(r))throw Error('Invalid path review: '+JSON.stringify(validators.validateReviewV16.errors));
    if(!known.has(r.path_id)||seen.has(r.path_id))throw Error('Unknown or duplicate path review');
    if(!r.reviewer_id.trim()||r.rationale.trim().length<20)throw Error('Meaningful reviewer/rationale required');
    const events=new Set();
    for(const e of r.interventions){
      if(!known.get(r.path_id).required_intervention_ids.includes(e.event_id)||events.has(e.event_id))throw Error('Unknown or duplicate intervention');
      if(e.role.trim().length<3||e.rationale.trim().length<12)throw Error('Meaningful intervention role/rationale required');
      events.add(e.event_id);
    }
    seen.set(r.path_id,r);
  }
  return seen;
}
export function judgePath(p,r){
  if(!r)return {...p,review_status:'UNREVIEWED',review_result:'UNRESOLVED',explanation_codes:['NO_EXPERT_REVIEW'],assessor:null};
  const risk=[],reasons=[];
  if(!r.blind_to_outcome)risk.push('OUTCOME_NOT_BLINDED');
  if(!r.receptions_considered)risk.push('RECEPTIONS_NOT_ASSESSED');
  if(!r.capacity_considered)risk.push('CAPACITY_NOT_ASSESSED');
  const by=new Map(r.interventions.map(e=>[e.event_id,e]));
  const missing=p.required_intervention_ids.filter(id=>!by.has(id));
  if(missing.length)risk.push('INTERVENTIONS_NOT_ALL_REVIEWED');
  if(r.interventions.some(e=>e.effect==='INDETERMINATE'))risk.push('INTERVENTIONS_INDETERMINATE');
  let blocker=r.interventions.some(e=>e.effect==='PROHIBITS');
  if(blocker)reasons.push('THIRD_PARTY_INTERVENTION_ATTESTED_AS_BLOCKER');
  if(p.sign_change_planets.length){
    const x=r.ingress_assessment||'INDETERMINATE';
    if(['INDETERMINATE','NOT_APPLICABLE'].includes(x))risk.push('SIGN_CHANGE_UNRESOLVED');
    if(x==='PREVENTS'){blocker=true;reasons.push('SIGN_CHANGE_ATTESTED_AS_BLOCKER');}
    if(x==='CONTEXT_CHANGE_POSSIBLY_SUPPORTS')risk.push('POST_INGRESS_EXCEPTION_NOT_METHODICALLY_CONFIRMED');
  }
  if(p.stations_before.length){
    const x=r.station_assessment||'INDETERMINATE';
    if(['INDETERMINATE','NOT_APPLICABLE'].includes(x))risk.push('STATION_REQUIRES_EXPERT_ASSESSMENT');
    if(x==='PREVENTS')risk.push('STATION_BLOCK_CLAIM_CONTRADICTS_LATER_EXACT_ROOT');
  }
  if(p.issues.includes('TWO_FUTURE_TRANSLATION_UNCONFIRMED'))risk.push('TWO_FUTURE_TRANSLATION_REQUIRES_SOURCE_AUDIT');
  if(p.issues.includes('INDIRECT_STATION_SEQUENCE_NOT_FULLY_CERTIFIED'))risk.push('INDIRECT_STATIONS_NOT_COMPLETE');
  if(p.issues.includes('COLLECTOR_CONTEXT_NOT_VERIFIED')&&(typeof r.context_role!=='string'||r.context_role.trim().length<6))risk.push('COLLECTOR_ROLE_NOT_GROUNDED');
  let status='UNRESOLVED';
  if(r.assessment==='BLOCKS_PATH'){
    if(!blocker)risk.push('BLOCKING_CONCLUSION_LACKS_SPECIFIC_BLOCKER');
    else if(!missing.length&&!risk.length)status='EXPERT_ATTESTED_BLOCKED';
  }else if(r.assessment==='SUPPORTS_PATH'){
    if(blocker)risk.push('SUPPORT_CONTRADICTS_ATTESTED_BLOCKER');
    if(!risk.length&&!blocker)status='EXPERT_ATTESTED_SUPPORTED';
  }
  if(!reasons.length&&status==='EXPERT_ATTESTED_SUPPORTED')reasons.push('GEOMETRIC_PATH_WITH_CONTEXTUAL_SUPPORT_ATTESTED');
  return {...p,review_status:r.assessment,review_result:status,explanation_codes:unique([...risk,...reasons]),assessor:{reviewer_id:r.reviewer_id,blind_to_outcome_declared:r.blind_to_outcome,rationale:r.rationale},interventions_evaluated:structuredClone(r.interventions)};
}
export async function arbitrateEvidence(evidence,{astro=null,jd=null,reviews=[],roleAssembly=null,provenance='RECOMPUTED_V15_REAL_EPHEMERIS'}={}){
  if(evidence.schema_version!=='1.5'||evidence.can_issue_client_verdict!==false||evidence.final_prediction!==null||evidence.timing_prediction!==null)throw Error('Forbidden upstream prediction or version');
  if(evidence.status==='TOPIC_MODULE_REQUIRED'){
    if(reviews.length)throw Error('Reviews not allowed for unsupported topic');
    return {schema_version:'1.6',status:'TOPIC_MODULE_REQUIRED',question_kind:evidence.question_kind,astronomical_source:provenance,paths:[],synthesis:'OUTSIDE_IMPLEMENTED_SCOPE',can_issue_client_verdict:false,final_prediction:null,timing_prediction:null,source_chart_hash:null,limitations:['TOPIC_MODULE_NOT_IMPLEMENTED']};
  }
  if(evidence.source_chart_verified!==true||evidence.data_kind!=='REAL_EPHEMERIS'||evidence.analysis?.semantic_certification!=='NEEDS_EXPERT_REVIEW'||!(/^[a-f0-9]{64}$/).test(evidence.source_chart_hash))throw Error('Source not recomputed from ephemerides');
  const paths=await candidatePaths(evidence,{astro,jd}),reviewed=validateReviews(reviews,paths),audited=paths.map(p=>judgePath(p,reviewed.get(p.path_id)));
  const n=audited.filter(p=>p.review_result==='EXPERT_ATTESTED_SUPPORTED').length,b=audited.filter(p=>p.review_result==='EXPERT_ATTESTED_BLOCKED').length,u=audited.length-n-b;
  const reception_snapshot={};
  for(const a of (roleAssembly||evidence.linked_role_evidence_v13)?.actors||[])reception_snapshot[a.actor_id]={planet:a.planet,dignities:a.own_essential_dignities||[],debilities:a.own_essential_debilities||[],house_class:a.accidental_house_class??null,motion:a.motion_direction??null,solar_state:a.solar_state??null,receptions_outbound:(a.receptions_outbound||[]).map(r=>({to:r.to_actor_id??null,observations:r.observations||[]}))};
  return {schema_version:'1.6',status:'EXPERT_EVIDENCE_ARBITRATION_ONLY',question_kind:evidence.question_kind,astronomical_source:provenance,source_chart_hash:evidence.source_chart_hash,source_chart_verified:true,paths:audited,summary:{total:audited.length,supported_by_review:n,blocked_by_review:b,unresolved:u},reception_snapshot,
    synthesis:n?'EXPERT_REVIEW_SUPPORTS_AT_LEAST_ONE_PATH_NO_FORECAST':audited.length&&b===audited.length?'KNOWN_PATHS_REVIEWED_AS_BLOCKED_SEARCH_NOT_EXHAUSTIVE':'UNRESOLVED_EVENT_PATHWAYS',can_issue_client_verdict:false,final_prediction:null,timing_prediction:null,
    text_interpretation:audited.length?`Выявлено ${audited.length} кандидатных путей: ${n} поддержаны экспертной разметкой, ${b} помечены как заблокированные, ${u} не разрешены. Результат является методическим разбором, а не подтверждением реального события; окончательный ответ и сроки не сформированы.`:'В исследованном интервале нет подтверждённых путей совершенствования. Это не доказывает, что событие не состоится.',
    limitations:['EXPERT_REVIEW_NOT_EMPIRICAL_OUTCOME','EXPERT_ATTESTATIONS_NOT_IDENTITY_VERIFIED','ASTRONOMICAL_SEARCH_WINDOW_LIMITED','2014_FRAWLEY_REVISION_NOT_FULLY_AUDITED','UNVALIDATED_ASTROLOGICAL_PREDICTIVE_ACCURACY']};
}
