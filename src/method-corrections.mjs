/* Additive MethodCorrectionEvidence 2.0.1. Legacy 1.0/1.1/1.2 are unchanged.
   Rule provenance is the supplied corrective review, not a claim of a new 2014 audit. */
import {dignityAt,PLANETS} from './evidence.mjs';
import accidentalProfile from './profiles/accidental_rules_v1_2.json' with {type:'json'};
import {mod,sign,cachedAstronomy,trajectoryEvents,directRoots,searchPair,searchScope} from './corrective-geometry.mjs';
const positive=['domicile','exaltation','triplicity','term','face'],negative=['detriment','fall'];
const iso=(moment,day)=>new Date(Date.parse(moment)+day*86400000).toISOString();
export const PROVENANCE=Object.freeze({
 'COR-01':{level:'PROJECT',source:'Sect ambiguity adapter; solar geometric altitude, boundary ±0.5°'},
 'COR-02':{level:'PROJECT',source:'Validated operating latitude ±65°, not an astronomical theorem'},
 'COR-03':{level:'PROJECT',source:'Chronological localization before the exact root, 2-second coincidence band'},
 'COR-04':{level:'PROJECT',source:'Sign-boundary search; 365-day resource cap, not Frawley timing'},
 'COR-05':{level:'F-EARLY',source:'Antiscia, pp.103–105, early edition pagination in supplied review'},
 'COR-06':{level:'F-EARLY',source:'Accidental Dignity, p.56; independent angularity is not a second score'},
 'COR-07':{level:'O-1999 / F-EARLY / PROJECT',source:'Oleshko p.57 direct means; Frawley pp.59,86 net vs typical speed; thresholds are project heuristics'},
 'COR-08':{level:'F-EARLY / REVIEW',source:'Aspects, pp.93–94; no universal four-day cutoff; context remains open'},
 'COR-09':{level:'F-EARLY',source:'Aspects, pp.93–94; reception of both is diagnostic, not a universal veto'},
 'COR-10':{level:'F-EARLY / PROJECT',source:'The Houses, p.17; approximate same-sign 5°; ±0.25° and unusual span bands are project review triggers'},
 'COR-11':{level:'F-EARLY / REVIEW',source:'Strict VOC and contextual long-gap review; no universal long-gap threshold or Lilly override'},
 'COR-12':{level:'PROJECT',source:'Explicit incomplete accidental feature coverage; no aggregate score'},
 'COR-13':{level:'PROJECT',source:'6° display convention, not Frawley orbs or event selection'},
 'COR-14':{level:'F-EARLY',source:'Essential Dignity, p.51; distinguish absence of positive dignity from peregrine'}
});
export function validateLatitude(lat){
 if(typeof lat!=='number'||!Number.isFinite(lat))throw Object.assign(Error('Введите широту конечным числом в диапазоне −65…65.'),{code:'INVALID_LATITUDE'});
 if(Math.abs(lat)>65)throw Object.assign(Error('LATITUDE_OUTSIDE_VALIDATED_REGION: введите широту в проверенном диапазоне −65…65°.'),{code:'LATITUDE_OUTSIDE_VALIDATED_REGION'});
 return lat;
}
export function validateCorrectionIdentity(chart,expectedHash,expectedId){
 if(!chart||chart.schema_version!=='1.0'||typeof chart.chart_id!=='string'||!chart.chart_id||chart.chart_id!==expectedId||!/^[a-f0-9]{64}$/.test(chart.source_chart_hash||'')||chart.source_chart_hash!==expectedHash)throw Error('CORRECTION_CHART_IDENTITY_MISMATCH');
 return true;
}
export function peregrineFlags(dignities,debilities,possibleOwnTriplicity=false){
 const no_positive_dignity=dignities.length?false:possibleOwnTriplicity?null:true;
 return {no_positive_dignity,peregrine_frawley:debilities.length?false:no_positive_dignity};
}
export function dignityCorrection(planet,longitude_deg,sect){
 if(!['DAY','NIGHT','UNRESOLVED'].includes(sect))throw Error('Invalid sect');
 const day=dignityAt(longitude_deg,'DAY'),night=dignityAt(longitude_deg,'NIGHT');
 const chosen=sect==='NIGHT'?night:day,possible=sect==='UNRESOLVED'?[...new Set([day.owners.triplicity,night.owners.triplicity])]:[chosen.owners.triplicity];
 const ambiguous=possible.length>1;
 const owners={...chosen.owners,triplicity:{status:ambiguous?'AMBIGUOUS':sect==='UNRESOLVED'?'INVARIANT':'RESOLVED',possible_owners:possible}};
 const own_essential_dignities=positive.filter(k=>k==='triplicity'?!ambiguous&&possible[0]===planet:owners[k]===planet);
 const own_essential_debilities=negative.filter(k=>owners[k]===planet);
 const receptions=[];
 for(const kind of [...positive,...negative])for(const to of kind==='triplicity'?possible:[owners[kind]]){
  receptions.push({from_planet:planet,to_planet:to,dignity_kind:kind,polarity:positive.includes(kind)?'POSITIVE':'NEGATIVE',evidence_certainty:to===null?'NOT_APPLICABLE':kind==='triplicity'&&ambiguous?'SECT_DEPENDENT':'CERTAIN'});
 }
 return {planet,longitude_deg,sign:chosen.sign,degree_in_sign:chosen.degree_in_sign,owners,own_essential_dignities,own_essential_debilities,...peregrineFlags(own_essential_dignities,own_essential_debilities,ambiguous&&possible.includes(planet)),receptions};
}
export const houseClass=h=>[1,4,7,10].includes(h)?'STRONG_ANGULAR':[6,8,12].includes(h)?'WEAK':'MIDDLE_OR_NEUTRAL';
export const angularity=h=>[1,4,7,10].includes(h)?'ANGULAR':[2,5,8,11].includes(h)?'SUCCEDENT':'CADENT';
export function housePlacement({raw_house,planet_lon_deg,next_cusp_lon_deg,house_span_deg=30}){
 if(!Number.isInteger(raw_house)||raw_house<1||raw_house>12||![planet_lon_deg,next_cusp_lon_deg,house_span_deg].every(Number.isFinite))throw Error('Invalid house placement');
 const distance=mod(next_cusp_lon_deg-planet_lon_deg),same=sign(planet_lon_deg)===sign(next_cusp_lon_deg),near=distance>1e-9&&distance<=5+1e-9&&same;
 const review=same&&distance<=5.25&&(Math.abs(distance-5)<=.25||house_span_deg<10||house_span_deg>60);
 const effective_house=near?raw_house%12+1:raw_house;
 return {raw_house,effective_house,degrees_before_next_cusp:distance,same_sign_as_next_cusp:same,applied:near,review_required:review,review_reason:review?'HOUSE_CUSP_EXPERT_REVIEW':null,house_class_frawley:houseClass(effective_house),house_class_source_house:effective_house,angularity_raw:angularity(raw_house),source_rule:'COR-10',threshold_deg:5,threshold_is_approximate:true};
}
export function speedReference(planet,source='OLESHKO_1999_P57'){
 if(!PLANETS.includes(planet))throw Error('Unknown speed planet');
 if(source==='OLESHKO_1999_P57')return {speed_reference_source:source,speed_reference_definition:'MEAN_DIRECT_MOTION',value_deg_per_day:accidentalProfile.speed_comparison.references_deg_per_day[planet],status:'AVAILABLE'};
 if(source==='FRAWLEY_EARLY_P59')return {speed_reference_source:source,speed_reference_definition:'NET_MEAN_FORWARD',value_deg_per_day:['Mercury','Venus'].includes(planet)?59/60:null,status:['Mercury','Venus'].includes(planet)?'APPROXIMATE_SOURCE_VALUE':'SOURCE_REVIEW_REQUIRED'};
 throw Error('Unsupported speed reference');
}
export function speedHeuristic(ratio){return {ratio_interpretation:ratio<=.8?'SLOW_HEURISTIC':ratio>=1.2?'FAST_HEURISTIC':'NEAR_REFERENCE_SPEED',source_claim:'PROJECT',status:'HEURISTIC_NOT_FRAWLEY'};}
export function lunarAssessment({complete=false,next=null,ingress=null,moonLongitude=null}){
 const degrees=next&&moonLongitude!==null?mod(next.moon_longitude_deg-moonLongitude):null;
 return {voc_strict:next?false:complete?true:null,status:next?'EXACT_ASPECT_BEFORE_INGRESS':complete?'VOC_STRICT':'UNDETERMINED',voc_contextual_long_gap_review:!!next,contextual_status:next?'VOC_CONTEXTUAL_LONG_GAP_REVIEW':'NOT_APPLICABLE',degrees_until_next_exact_aspect:degrees,contextual_threshold_deg:null,contextual_threshold_status:'NO_UNIVERSAL_THRESHOLD_CONTEXT_REQUIRED',lilly_exceptions_applied:false,ingress_day_offset:ingress,next_exact_aspect:next};
}
export function collectionReception(essential,collector,a,b){
 const get=p=>essential.directional_receptions.filter(e=>e.from_planet===p&&e.to_planet===collector&&e.polarity==='POSITIVE');
 const aa=get(a),bb=get(b),certain=es=>es.some(e=>e.evidence_certainty==='CERTAIN')?true:es.length?null:false;
 const ca=certain(aa),cb=certain(bb);
 return {collector_receives_a:ca,collector_receives_b:cb,collector_receives_both:ca===false||cb===false?false:ca===null||cb===null?null:true,reception_a:aa,reception_b:bb,direction_definition:'SIGNIFICATOR_IN_COLLECTOR_DIGNITY',automatic_reject:false,requires_context_review:true};
}
const eventKey=e=>`${e.planet_a}:${e.planet_b}:${e.aspect}:${e.day_offset.toFixed(7)}`;
export function transmissionSequences(events,a,b){
 const out=[];
 for(const [from,to] of [[a,b],[b,a]]){
  function visit(current,last,path,seen){
   if(path.length>=3)return;
   for(const e of events){
    if(e.day_offset<=last+1e-7||![e.planet_a,e.planet_b].includes(current))continue;
    const next=e.planet_a===current?e.planet_b:e.planet_a;
    if(seen.has(next))continue;
    const p=[...path,e];
    if(next===to&&p.length>=2)out.push({from,to,contacts:p,intermediaries:[...seen].filter(x=>x!==from),status:'GEOMETRY_CANDIDATE_NEEDS_REVIEW'});
    else if(next!==to)visit(next,e.day_offset,p,new Set([...seen,next]));
    if(out.length>=40)return;
   }
  }
  visit(from,-1e-7,[],new Set([from]));
 }
 return out.slice(0,40);
}
export function indirectCorrection(astro,jd,a,b,end,essential){
 const speed=p=>Math.abs(astro.position(jd,p).speed_deg_per_day),translation=[],collection=[],futureAll=[];
 for(const x of PLANETS.filter(p=>p!==a&&p!==b)){
  const future=[...directRoots(astro,jd,x,a,0,end),...directRoots(astro,jd,x,b,0,end)].sort((x,y)=>x.day_offset-y.day_offset);
  futureAll.push(...future);
  if(speed(x)>Math.max(speed(a),speed(b))){
   const ingress=trajectoryEvents(astro,jd,[x],-365,0).filter(e=>e.event_type==='INGRESS').at(-1)?.day_offset??-365;
   const prior=[...directRoots(astro,jd,x,a,ingress,0),...directRoots(astro,jd,x,b,ingress,0)].sort((x,y)=>x.day_offset-y.day_offset),last=prior.at(-1);
   if(last){
    const from=[last.planet_a,last.planet_b].find(p=>p!==x),to=from===a?b:a,next=future.find(e=>[e.planet_a,e.planet_b].includes(to));
    if(next){const separation=Math.abs(((astro.position(jd,from).longitude_deg-astro.position(jd,x).longitude_deg-last.angle_deg+540)%360)-180);
     translation.push({translator:x,from,to,past_contact:last,next_contact:next,separation_arc_deg:separation,recent_separation_status:ingress===-365?'UNDETERMINED':'CONFIRMED',historical_searched_from:ingress,technical_cap_days:365,relative_speeds:{translator:speed(x),from:speed(from),to:speed(to)},intervening_contacts:future.filter(e=>e.day_offset<next.day_offset).map(eventKey),status:'GEOMETRY_CANDIDATE_NEEDS_REVIEW',review_required:true});}
   }
  }
  if(speed(x)<Math.min(speed(a),speed(b))){
   const aa=future.find(e=>[e.planet_a,e.planet_b].includes(a)),bb=future.find(e=>[e.planet_a,e.planet_b].includes(b));
   if(aa&&bb)collection.push({collector:x,contacts:[aa,bb].sort((x,y)=>x.day_offset-y.day_offset),...collectionReception(essential,x,a,b),status:'GEOMETRY_CANDIDATE_NEEDS_REVIEW'});
  }
 }
 // Include intermediate/intermediate links for three-contact chain diagnostics.
 const others=PLANETS.filter(x=>x!==a&&x!==b);
 for(let i=0;i<others.length;i++)for(let k=i+1;k<others.length;k++)futureAll.push(...directRoots(astro,jd,others[i],others[k],0,end));
 return {translation_candidates:translation,collection_candidates:collection,future_transmission_sequences:transmissionSequences(futureAll,a,b),coverage:'BOUNDED_GEOMETRY_ONLY',chain_semantics:'NEEDS_EXPERT_REVIEW',calendar_separation_cutoff_used:false};
}
export async function calculateMethodCorrection({chart,expectedHash,expectedId,sect_info,accidental,roles,astro,jd,searchEnabled=false,indirectEnabled=false,previewDays=30}){
 validateCorrectionIdentity(chart,expectedHash,expectedId);
 const placements=chart.planets.map(p=>dignityCorrection(p.name,p.longitude_deg,sect_info.sect));
 const essential={schema_version:'2.0.1',chart_id:chart.chart_id,source_chart_hash:chart.source_chart_hash,sect:sect_info.sect,placements,directional_receptions:placements.flatMap(p=>p.receptions).filter(e=>e.to_planet!==null&&e.to_planet!==e.from_planet),judgment_status:'NOT_PERFORMED'};
 const house_placements=chart.planets.map(p=>({planet:p.name,...housePlacement({raw_house:p.house,planet_lon_deg:p.longitude_deg,next_cusp_lon_deg:chart.cusps[p.house%12].longitude_deg,house_span_deg:mod(chart.cusps[p.house%12].longitude_deg-chart.cusps[p.house-1].longitude_deg)})}));
 const accidentals=accidental.planets.map(p=>{const h=house_placements.find(x=>x.planet===p.planet);return {...p,house:h.effective_house,raw_house:h.raw_house,house_class:h.house_class_frawley,is_in_house_joy:h.effective_house===p.house_joy_number,speed_references:[speedReference(p.planet),speedReference(p.planet,'FRAWLEY_EARLY_P59')],speed_heuristic:speedHeuristic(p.motion.speed_ratio_abs)};});
 const assignments=roles.status==='CONFIRMED'&&roles.roles_locked?roles.assignments:[];
 const role_receptions=assignments.flatMap(a=>assignments.filter(b=>b.actor_id!==a.actor_id).map(b=>({from_actor:a.actor_id,to_actor:b.actor_id,evidence:essential.directional_receptions.filter(e=>e.from_planet===a.effective_significator&&e.to_planet===b.effective_significator)})));
 let geometry=null,indirect=null,lunar=null,search_scope=searchScope({searched_until:0,unchecked_channels:['DIRECT','TRANSLATION','COLLECTION','ANTISCION']});
 if(searchEnabled&&assignments.length===2&&assignments[0].effective_significator!==assignments[1].effective_significator){
  const cached=cachedAstronomy(astro),[a,b]=assignments.map(x=>x.effective_significator);
  try{
   geometry=searchPair(cached,jd,a,b,{preview_days:previewDays});search_scope=geometry.scope;
   const utc=e=>({...e,event_utc:iso(chart.moment_utc,e.day_offset)});
   geometry.contacts=geometry.contacts.map(c=>({...c,contact_utc:iso(chart.moment_utc,c.day_offset),preceding_events:c.preceding_events.map(utc),coincident_events:c.coincident_events.map(utc)}));
   geometry.events=geometry.events.map(utc);geometry.antiscion_candidates=geometry.antiscion_candidates.map(c=>({...c,contact_utc:iso(chart.moment_utc,c.day_offset)}));
   if(indirectEnabled)indirect=indirectCorrection(cached,jd,a,b,geometry.context_searched_until,essential);
   const ingress=trajectoryEvents(cached,jd,['Moon'],0,4).find(e=>e.event_type==='INGRESS')?.day_offset??null;
   const moonContacts=PLANETS.filter(p=>p!=='Moon').flatMap(p=>directRoots(cached,jd,'Moon',p,0,ingress??4)).filter(e=>e.day_offset>1e-6&&(ingress===null||e.day_offset<ingress-2/86400)).sort((a,b)=>a.day_offset-b.day_offset);
   const next=moonContacts[0];lunar=lunarAssessment({complete:ingress!==null,next:next?{...next,moon_longitude_deg:cached.position(jd+next.day_offset,'Moon').longitude_deg}:null,ingress,moonLongitude:chart.planets.find(p=>p.name==='Moon').longitude_deg});
  }catch(error){geometry=null;indirect=null;search_scope={...searchScope({searched_until:0,unchecked_channels:['DIRECT','TRANSLATION','COLLECTION','ANTISCION']}),stop_reason:'NUMERICAL_FAILURE',error_code:'NUMERICAL_FAILURE'};}
 }
 const checked_channels=geometry?['DIRECT','ANTISCION']:[];
 return {schema_version:'2.0.1',chart_id:chart.chart_id,source_chart_hash:chart.source_chart_hash,calculation_profile:'frawley_early',source_profile_status:'EARLY_REVIEW_REFERENCES_2014_PENDING',source_chart_verified:true,
 sect_resolution:{status:sect_info.sect,solar_altitude_deg:sect_info.solar_altitude_deg,boundary_deg:.5,atmospheric_refraction_used:false,source:'PROJECT'},dignity_status:placements.some(p=>p.owners.triplicity.status==='AMBIGUOUS')?'PARTIALLY_DETERMINED':'DETERMINED',essential,house_placements,accidentals,role_receptions,geometry,indirect,lunar,search_scope,checked_channels,unchecked_channels:['DIRECT','ANTISCION','TRANSLATION','COLLECTION'].filter(c=>!checked_channels.includes(c)),unresolved_rule_ids:['OPEN-2014','COR-12',...(!geometry?['COR-04','COR-05']:[]),...(!indirect?['COR-08','COR-09']:[])],accidental_completeness:'PARTIAL',uncalculated_features:['BESIEGEMENT','ASPECTS_TO_BENEFICS_MALEFICS','NODES','FIXED_STARS_REGULUS_SPICA_ALGOL','PART_OF_FORTUNE','ORIENTALITY','COMPLETE_CONTEXTUAL_STRENGTH'],display_aspects:{orb_deg:6,label:'DISPLAY_ORB_CONVENTION',drives_perfection:false},provenance:PROVENANCE,can_issue_event_verdict:false,final_prediction:null,timing_prediction:null};
}
