/* Browser port of the explicitly supplied v1.1/v1.2 Python evidence-only modules.
   Never produces a horary prediction; profiles are identified by their actual sources. */
import dignityProfile from './profiles/oleshko_1999_p55.json' with { type: 'json' };
import accidentalProfile from './profiles/accidental_rules_v1_2.json' with { type: 'json' };
import { canonicalHash, sha256 } from './engine.mjs';

export const PLANETS = Object.freeze(['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn']);
export const DIGNITY_PROFILE_ID = 'OLESHKO_1999_P55';
export const ACCIDENTAL_PROFILE_ID = 'FRAWLEY_EARLY_ACCIDENTAL_V1_2_WITH_OLESHKO_SPEED_REFERENCE';
const positive = ['domicile','exaltation','triplicity','term','face'];
const negative = ['detriment','fall'];
const rank = {domicile:0,exaltation:1,detriment:2,fall:3,triplicity:4,term:5,face:6};
const meaningLabels = {
  domicile:'STRONG_PRIORITY',exaltation:'IDEALIZATION_OR_HIGH_REGARD',
  triplicity:'EASE_OR_SHARED_AFFINITY',term:'MINOR_INTEREST',face:'TRACE_INTEREST',
  detriment:'REJECTION_OR_DISLIKE',fall:'DEVALUATION_OR_DISAPPOINTMENT'
};
const keysSame = (obj,expected) => obj !== null && typeof obj === 'object' && !Array.isArray(obj) &&
  Object.keys(obj).sort().join('|') === [...expected].sort().join('|');
const isNumber = n => typeof n==='number' && Number.isFinite(n);
const validHash = n => typeof n==='string' && /^[a-f0-9]{64}$/.test(n);
const validIdentity = obj => obj && typeof obj.chart_id==='string' && !!obj.chart_id && validHash(obj.source_chart_hash);
const sameNames = arr => arr.length===7 && new Set(arr.map(x=>x.name)).size===7 && arr.every(x=>PLANETS.includes(x.name));
const mod = x => (x%360+360)%360;
const round9 = x => Number(x.toFixed(9));


// The Python reference serializes explicitly typed float fields as 5.0, whereas
// JSON.stringify(5.0) emits 5. Preserve that canonical cross-runtime detail for
// these schema-defined floating-point fields, without changing chart data.
async function pythonCompatibleHash(obj, floatKeys=[]){
  const normalized=JSON.stringify(obj,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)
    ?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b,'en'))):v);
  const normalizedFloats=normalized.replace(/"(longitude_deg|speed_deg_per_day)":(-?\d+)(?=[,}\]])/g,
    (full,key,n)=>floatKeys.includes(key)?`"${key}":${n}.0`:full);
  return sha256(normalizedFloats);
}
export function validateDignityProfile(p = dignityProfile){
  if(p.profile_id!==DIGNITY_PROFILE_ID||p.frawley_revised_2014_verified!==false)throw Error('Профиль эссенциальных достоинств не подтверждён');
  const s=p.sign_order;
  if(!Array.isArray(s)||s.length!==12||new Set(s).size!==12)throw Error('Профиль должен содержать 12 знаков');
  for(const key of ['domiciles','exaltations','element_by_sign','terms'])if(!keysSame(p[key],s))throw Error(`Неполный справочник: ${key}`);
  if(!keysSame(p.triplicities,['fire','earth','air','water']))throw Error('Неверные триплицитеты');
  for(const item of Object.values(p.triplicities))if(!keysSame(item,['DAY','NIGHT'])||Object.values(item).some(x=>!PLANETS.includes(x)))throw Error('Неверная таблица секты');
  if(!Array.isArray(p.face_cycle)||p.face_cycle.length!==7||new Set(p.face_cycle).size!==7||p.face_cycle.some(x=>!PLANETS.includes(x)))throw Error('Неверный цикл фасов');
  for(const sign of s){
    if(!PLANETS.includes(p.domiciles[sign]) || (p.exaltations[sign]!==null&&!PLANETS.includes(p.exaltations[sign])))throw Error('Неверные управители');
    if(!p.triplicities[p.element_by_sign[sign]])throw Error('Неверная стихия');
    const terms=p.terms[sign];
    if(!Array.isArray(terms)||terms.length!==5)throw Error(`Неверные термы ${sign}`);
    let prev=0;const seen=new Set();
    for(const [end,owner] of terms){
      if(!isNumber(end)||end<=prev||end>30||!PLANETS.includes(owner)||['Sun','Moon'].includes(owner)||seen.has(owner))throw Error(`Неверные границы термов ${sign}`);
      prev=end;seen.add(owner);
    }
    if(prev!==30)throw Error(`Термы не покрывают знак ${sign}`);
  }
  return true;
}
export function dignityAt(lon,sect,p=dignityProfile){
  if(!isNumber(lon)||lon<0||lon>=360)throw Error('Долгота должна находиться в диапазоне [0,360)');
  if(!['DAY','NIGHT'].includes(sect))throw Error('Секта DAY/NIGHT должна быть установлена по положению Солнца');
  const index=Math.floor(lon/30),sign=p.sign_order[index],degree=lon-index*30;
  const term=p.terms[sign].find(([end])=>degree<end)?.[1];
  if(!term)throw Error('Нет управителя терма');
  const opposite=p.sign_order[(index+6)%12];
  return {sign,degree_in_sign:degree,owners:{domicile:p.domiciles[sign],
    exaltation:p.exaltations[sign],triplicity:p.triplicities[p.element_by_sign[sign]][sect],
    term,face:p.face_cycle[(3*index+Math.min(Math.floor(degree/10),2))%7],
    detriment:p.domiciles[opposite],fall:p.exaltations[opposite]}};
}
export function adaptDignityChart(chart,sect){
  if(chart?.schema_version!=='1.0')throw Error('Требуется ChartSnapshot 1.0');
  return {schema_version:'1.1',chart_id:chart.chart_id,source_chart_hash:chart.source_chart_hash,
    sect,dignity_table_profile:DIGNITY_PROFILE_ID,
    planets:chart.planets.map(x=>({name:x.name,longitude_deg:x.longitude_deg}))};
}
export async function calculateDignities(req,p=dignityProfile){
  validateDignityProfile(p);
  if(req?.schema_version!=='1.1'||req.dignity_table_profile!==p.profile_id||
     !validIdentity(req)||!['DAY','NIGHT'].includes(req.sect)||!Array.isArray(req.planets)||
     !sameNames(req.planets)||req.planets.some(x=>!keysSame(x,['name','longitude_deg'])||!isNumber(x.longitude_deg)||x.longitude_deg<0||x.longitude_deg>=360))
    throw Error('Неверный запрос эссенциальных достоинств 1.1');
  const planets=[...req.planets].sort((a,b)=>PLANETS.indexOf(a.name)-PLANETS.indexOf(b.name));
  const placements=planets.map(({name,longitude_deg})=>{
    const {sign,degree_in_sign,owners}=dignityAt(longitude_deg,req.sect,p);
    const own_essential_dignities=positive.filter(k=>owners[k]===name);
    const own_essential_debilities=negative.filter(k=>owners[k]===name);
    return {planet:name,longitude_deg,sign,degree_in_sign,dignity_owners:owners,
      own_essential_dignities,own_essential_debilities,peregrine:!own_essential_dignities.length,
      rule_ids:['DR-001','DR-002','DR-003']};
  });
  const edges=[],self=[];
  for(const row of placements)for(const kind of [...positive,...negative]){
    const owner=row.dignity_owners[kind];if(owner===null)continue;
    const isPos=positive.includes(kind);
    const item={from_planet:row.planet,to_planet:owner,dignity_kind:kind,
      polarity:isPos?'POSITIVE':'NEGATIVE',rule_id:isPos?'REC-011':'REC-012'};
    (owner===row.planet?self:edges).push(item);
  }
  const order=(a,b)=>PLANETS.indexOf(a.from_planet)-PLANETS.indexOf(b.from_planet)||
    PLANETS.indexOf(a.to_planet)-PLANETS.indexOf(b.to_planet)||rank[a.dignity_kind]-rank[b.dignity_kind];
  edges.sort(order);self.sort((a,b)=>PLANETS.indexOf(a.from_planet)-PLANETS.indexOf(b.from_planet)||rank[a.dignity_kind]-rank[b.dignity_kind]);
  const mutuals=[];
  for(let i=0;i<PLANETS.length;i++)for(let j=i+1;j<PLANETS.length;j++){
    const a=PLANETS[i],b=PLANETS[j],ab=edges.filter(x=>x.from_planet===a&&x.to_planet===b),ba=edges.filter(x=>x.from_planet===b&&x.to_planet===a);
    if(!ab.length||!ba.length)continue;
    const polarities=new Set([...ab,...ba].map(x=>x.polarity));
    mutuals.push({planet_a:a,planet_b:b,classification:polarities.size===1?
      (polarities.has('POSITIVE')?'MUTUAL_POSITIVE':'MUTUAL_NEGATIVE'):'MUTUAL_MIXED',
      a_to_b:ab,b_to_a:ba,does_not_perfect_event:true,rule_id:'REC-013'});
  }
  const calculationInput={chart_id:req.chart_id,source_chart_hash:req.source_chart_hash,
    sect:req.sect,planets,dignity_table_profile:p.profile_id};
  return {schema_version:'1.1',module_version:'1.1.0',chart_id:req.chart_id,
    source_chart_hash:req.source_chart_hash,source_chart_hash_verified_by_this_module:false,
    sect:req.sect,dignity_table_profile:p.profile_id,profile_sha256:await canonicalHash(p),
    calculation_input_sha256:await pythonCompatibleHash(calculationInput,['longitude_deg']),table_is_verified_against_frawley_2014:false,
    placements,directional_receptions:edges,self_dignities_and_self_debilities:self,mutual_receptions:mutuals,
    judgment_status:'NOT_PERFORMED',warnings:['INTERPRETATION_REQUIRES_QUESTION_ROLES_AND_PERFECTION',
      'FRAWLEY_2014_TABLE_RECONCILIATION_PENDING'],
    rule_ids:['DR-001','DR-002','DR-003','REC-011','REC-012','REC-013','GATE-011']};
}
export function roleReceptionEvidence(result,roles,questionDomain){
  if(result?.schema_version!=='1.1'||result.judgment_status!=='NOT_PERFORMED')throw Error('Нужны факты v1.1');
  if(roles?.schema_version!=='1.0'||!roles.roles_locked||roles.status!=='CONFIRMED'||
     roles.chart_id!==result.chart_id||roles.source_chart_hash!==result.source_chart_hash)
    throw Error('Роли должны быть подтверждены, заблокированы и относиться к той же карте');
  if(!['RELATIONSHIP','JOB','TRANSACTION','PROPERTY','OTHER'].includes(questionDomain))throw Error('Неизвестная тема вопроса');
  const actors=(roles.assignments||[]).map(x=>({actor_id:x.actor_id,significator:x.effective_significator,role_kind:x.role_kind}));
  if(actors.some(x=>typeof x.actor_id!=='string'||!x.actor_id||!PLANETS.includes(x.significator))||
     new Set(actors.map(x=>x.actor_id)).size!==actors.length)throw Error('Неверные или повторяющиеся роли');
  const out=[],unresolved=[];
  for(const a of actors)for(const b of actors){
    if(a.actor_id===b.actor_id)continue;
    if(a.significator===b.significator){unresolved.push({from_actor_id:a.actor_id,to_actor_id:b.actor_id,reason:'SIGNIFICATOR_COLLISION_NEEDS_REVIEW'});continue;}
    const matched=result.directional_receptions.filter(x=>x.from_planet===a.significator&&x.to_planet===b.significator);
    out.push({from_actor_id:a.actor_id,to_actor_id:b.actor_id,from_planet:a.significator,to_planet:b.significator,
      observations:matched.map(x=>({dignity_kind:x.dignity_kind,polarity:x.polarity,meaning_hint:meaningLabels[x.dignity_kind]})),
      no_reception_evidence_in_current_profile:!matched.length,rule_id:'CTX-011'});
  }
  return {schema_version:'1.1',chart_id:result.chart_id,source_chart_hash:result.source_chart_hash,
    question_domain:questionDomain,reception_evidence_by_actor:out,unresolved_actor_pairs:unresolved,
    analysis_status:unresolved.length?'NEEDS_EXPERT_REVIEW':'EVIDENCE_ONLY_NO_VERDICT',
    caveats:['DOMICILE_ETC_SHOWS_ASTROLOGICAL_ORIENTATION_NOT_EMPIRICALLY_PROVEN_FEELING',
      'RECEPTION_DOES_NOT_PROVE_AN_EVENT_OR_CONSENT','METHOD_IS_TRADITIONAL_HORARY_NOT_SCIENTIFIC_PREDICTION'],
    rule_ids:['CTX-011','CTX-012','GATE-011']};
}
export function validateAccidentalProfile(p=accidentalProfile){
  if(p.profile_id!==ACCIDENTAL_PROFILE_ID||p.frawley_revised_2014_verified!==false)throw Error('Профиль 1.2 не подтверждён');
  if(!keysSame(p.house_classes,['STRONG_ANGULAR','MIDDLE_OR_NEUTRAL','WEAK'])||
     Object.values(p.house_classes).flat().sort((a,b)=>a-b).join(',')!==Array.from({length:12},(_,i)=>i+1).join(','))throw Error('Некорректные классы домов');
  if(!keysSame(p.house_joy,PLANETS)||Object.values(p.house_joy).some(x=>!Number.isInteger(x)||x<1||x>12))throw Error('Неверная таблица радостей');
  const t=p.solar_thresholds_deg,s=p.speed_comparison;
  if(!(0<t.cazimi&&t.cazimi<t.combust&&t.combust<t.under_beams&&t.under_beams<180))throw Error('Неверные солнечные пороги');
  if(s.source!=='OLESHKO_1999_P57'||!keysSame(s.references_deg_per_day,PLANETS)||
     Object.values(s.references_deg_per_day).some(x=>!isNumber(x)||x<=0||x>=360)||
     s.thresholds_are_project_convention_not_author_rule!==true||
     !(0<s.candidate_station_ratio_max&&s.candidate_station_ratio_max<s.slow_ratio_max&&s.slow_ratio_max<1&&s.fast_ratio_min>1))throw Error('Неверная таблица скоростей');
  return true;
}
export function adaptAccidentalChart(chart,{returnTheme=false}={}){
  if(chart?.schema_version!=='1.0'||!Array.isArray(chart.planets)||chart.planets.length!==7||
     chart.planets.some(x=>['name','longitude_deg','speed_deg_per_day','house'].some(k=>!(k in x))))throw Error('Требуется полный ChartSnapshot 1.0');
  if(typeof returnTheme!=='boolean')throw Error('returnTheme должен быть логическим');
  return {schema_version:'1.2',chart_id:chart.chart_id,source_chart_hash:chart.source_chart_hash,
    accidental_profile:ACCIDENTAL_PROFILE_ID,context:{return_theme:returnTheme},
    planets:chart.planets.map(x=>({name:x.name,longitude_deg:x.longitude_deg,speed_deg_per_day:x.speed_deg_per_day,house:x.house}))};
}
function angularSeparation(a,b){return Math.abs(mod(a-b+180)-180);}
function solarState(name,lon,speed,sun,p){
  if(name==='Sun')return {state:'NOT_APPLICABLE',distance_deg:0,same_sign:true,contact_trend:'NOT_APPLICABLE',qualifiers:[],rule_ids:['AC-030']};
  const dist=angularSeparation(lon,sun.longitude_deg),same=Math.floor(lon/30)===Math.floor(sun.longitude_deg/30);
  const {cazimi,combust,under_beams}=p.solar_thresholds_deg;
  const state=dist<=cazimi&&same?'CAZIMI':dist<=combust&&same?'COMBUST':dist<=under_beams?'UNDER_BEAMS':'OUTSIDE_BEAMS';
  const signed=mod(lon-sun.longitude_deg+180)-180;
  const derivative=(signed>=0?1:-1)*(speed-sun.speed_deg_per_day);
  const trend=derivative<-1e-10?'APPLYING':derivative>1e-10?'SEPARATING':'TREND_UNRESOLVED';
  const qualifiers=[];
  if(state==='COMBUST'){
    const dom=['Mars','Venus','Mercury','Moon','Sun','Mercury','Venus','Mars','Jupiter','Saturn','Saturn','Jupiter'];
    if(dom[Math.floor(sun.longitude_deg/30)]===name)qualifiers.push('SUN_IN_PLANET_DOMICILE_COMBUSTION_MITIGATION_REVIEW');
    qualifiers.push('VISIBILITY_CONCERN');
  }
  if(state==='UNDER_BEAMS')qualifiers.push('MILD_VISIBILITY_CONCERN');
  return {state,distance_deg:round9(dist),same_sign:same,contact_trend:trend,qualifiers,rule_ids:['AC-030','AC-031','AC-032']};
}
function motion(name,speed,p,returnTheme){
  const ref=p.speed_comparison.references_deg_per_day[name],ratio=Math.abs(speed)/ref,c=p.speed_comparison;
  if(['Sun','Moon'].includes(name)&&speed<=0)throw Error(`${name} не может иметь такую геоцентрическую скорость`);
  const direction=speed<0?'RETROGRADE':speed===0?'ZERO_INSTANTANEOUS_SPEED':'DIRECT';
  const relative_speed=name==='Sun'?'NOT_ASSESSED_FOR_SUN':ratio<=c.candidate_station_ratio_max?'POSSIBLE_STATION_NEEDS_EPHEMERIS_BRACKETING':
    ratio<=c.slow_ratio_max?'SLOW_BY_PROJECT_HEURISTIC':ratio>=c.fast_ratio_min?'FAST_BY_PROJECT_HEURISTIC':'NEAR_REFERENCE_SPEED';
  let retrograde_context=direction==='RETROGRADE'?
    (returnTheme?'RETURN_THEME_RELEVANT_NOT_AUTOMATIC_DEBILITY':'RETROGRADE_POSSIBLE_AFFLICTION_REVIEW'):
    'NO_RETROGRADE_IMPAIRMENT_INFERRED';
  if(name==='Saturn'&&relative_speed==='FAST_BY_PROJECT_HEURISTIC')retrograde_context+=';SATURN_FAST_CAUTION';
  return {zodiacal_speed_deg_per_day:speed,direction,reference_speed_deg_per_day:ref,speed_ratio_abs:round9(ratio),
    relative_speed,near_station_not_confirmed:ratio<=c.candidate_station_ratio_max,
    retrograde_context,station_confirmed:false,rule_ids:['AC-020','AC-021','AC-022','AC-023']};
}
export async function calculateAccidentals(req,p=accidentalProfile){
  validateAccidentalProfile(p);
  if(req?.schema_version!=='1.2'||req.accidental_profile!==p.profile_id||!validIdentity(req)||
     !keysSame(req.context,['return_theme'])||typeof req.context.return_theme!=='boolean'||
     !Array.isArray(req.planets)||!sameNames(req.planets)||req.planets.some(x=>
       !keysSame(x,['name','longitude_deg','speed_deg_per_day','house'])||!isNumber(x.longitude_deg)||x.longitude_deg<0||x.longitude_deg>=360||
       !isNumber(x.speed_deg_per_day)||!Number.isInteger(x.house)||x.house<1||x.house>12))
    throw Error('Неверный запрос акцидентальных свойств 1.2');
  const byName=Object.fromEntries(req.planets.map(x=>[x.name,x]));
  const sun=byName.Sun,moon=byName.Moon;
  const elongation=mod(moon.longitude_deg-sun.longitude_deg);
  const moonPhase=Math.abs(elongation)<=1e-9||Math.abs(elongation-360)<=1e-9?'NEW_MOON_BOUNDARY':
    Math.abs(elongation-180)<=1e-9?'FULL_MOON_BOUNDARY':elongation<180?'WAXING':'WANING';
  const placements=PLANETS.map(name=>{
    const {longitude_deg,house,speed_deg_per_day}=byName[name];
    const houseClass=Object.keys(p.house_classes).find(k=>p.house_classes[k].includes(house));
    return {planet:name,house,house_class:houseClass,is_in_house_joy:house===p.house_joy[name],
      house_joy_number:p.house_joy[name],motion:motion(name,speed_deg_per_day,p,req.context.return_theme),
      solar:solarState(name,longitude_deg,speed_deg_per_day,sun,p),moon_phase:name==='Moon'?moonPhase:null,
      rule_ids:['AC-010','AC-011','AC-020','AC-030']};
  });
  return {schema_version:'1.2',engine_version:'1.2.0',chart_id:req.chart_id,source_chart_hash:req.source_chart_hash,
    source_chart_hash_verified_by_this_module:false,accidental_profile:p.profile_id,
    profile_sha256:await canonicalHash(p),calculation_input_sha256:await pythonCompatibleHash(req,['speed_deg_per_day']),
    planets:placements,judgment_status:'NOT_PERFORMED',predictive_confidence:null,
    warnings:['Frawley revised 2014 has not been fully source-verified',
      'Oleshko 1999 p.57 mean speeds are comparisons, not a Frawley profile',
      'FAST/SLOW thresholds and possible-station band are project heuristics',
      'Station status cannot be confirmed from a single instant of speed',
      'No complete accidental score, event perfection or client verdict is produced',
      'House cusp proximity, besiegement, close aspects, nodes and stars are not assessed']};
}
export function mergeEvidence(d,a){
  if(d?.schema_version!=='1.1'||a?.schema_version!=='1.2'||d.chart_id!==a.chart_id||
     d.source_chart_hash!==a.source_chart_hash||
     new Set(d.placements?.map(x=>x.planet)).size!==7||new Set(a.planets?.map(x=>x.planet)).size!==7||
     !PLANETS.every(x=>d.placements.some(y=>y.planet===x)&&a.planets.some(y=>y.planet===x)))throw Error('Данные 1.1/1.2 относятся к разным картам или неполны');
  return {schema_version:'1.2',chart_id:a.chart_id,source_chart_hash:a.source_chart_hash,
    evidence_source_versions:['1.1','1.2'],essentials:d.placements,accidentals:a.planets,
    receptions:d.directional_receptions,judgment_status:'NOT_PERFORMED',note:'Joined evidence, no verdict or numeric sum'};
}
/* The Sun's *geometric* altitude determines sect, not clock hour or house alone.
   Near the horizon (±0.5°) human confirmation is needed; NO guessed sect. */
export function solarSect(jd,lat,lon,sunLon,sunLat=0){
  const r=Math.PI/180,t=(jd-2451545)/36525;
  const e=(23.439291-0.0130042*t)*r,lambda=sunLon*r,beta=sunLat*r;
  const alpha=Math.atan2(Math.sin(lambda)*Math.cos(e)-Math.tan(beta)*Math.sin(e),Math.cos(lambda));
  const delta=Math.asin(Math.sin(beta)*Math.cos(e)+Math.cos(beta)*Math.sin(e)*Math.sin(lambda));
  const gmst=280.46061837+360.98564736629*(jd-2451545)+.000387933*t*t-t*t*t/38710000;
  const hour=mod(gmst+lon-alpha/r+180)-180;
  const phi=lat*r;
  const altitude=Math.asin(Math.sin(phi)*Math.sin(delta)+Math.cos(phi)*Math.cos(delta)*Math.cos(hour*r))/r;
  if(!Number.isFinite(altitude))throw Error('Не удалось определить секту карты');
  return {sect:Math.abs(altitude)<=.5?'UNRESOLVED':altitude>0?'DAY':'NIGHT',
    solar_altitude_deg:round9(altitude),method:'SOLAR_GEOMETRIC_ALTITUDE',
    near_horizon_requires_review:Math.abs(altitude)<=.5};
}
