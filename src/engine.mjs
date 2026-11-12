/* Horary browser engine. Runs Swiss Ephemeris Moshier in local WebAssembly.
 * Technical/factual output only: judgment always requires human review.
 * Protocol shape intentionally remains compatible with server MVP 1.0.
 */
import {solarSect, adaptDignityChart, adaptAccidentalChart, calculateDignities, calculateAccidentals, roleReceptionEvidence, mergeEvidence} from './evidence.mjs';
import {assembleRoleEvidence,liveGate} from './assembly.mjs';
export const ENGINE = 'horary-browser-2.1.0/moshier-wasm-v11-v12';
const NAMES = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
const LORDS = ['Mars','Venus','Mercury','Moon','Sun','Mercury','Venus','Mars','Jupiter','Saturn','Saturn','Jupiter'];
const TARGETS = [[0,'CONJUNCTION'],[60,'SEXTILE'],[90,'SQUARE'],[120,'TRINE'],[180,'OPPOSITION'],[240,'TRINE'],[270,'SQUARE'],[300,'SEXTILE']];
const SPECIAL = new Set(['RETURN','RECOVERY','LOCATION']);
const INTENTS = new Set(['EVENT','CONTACT','PRESERVATION','STATUS','QUALITY','COMPARISON','TIMING','RETURN','RECOVERY','LOCATION','PAST_FACT']);
const RISK = ['суицид','самоубийств','убью себя','покончить с собой','террористическ','когда умрет','выживет ли','умрет ли','пропал ребенок','пропала девочка','пропал мальчик'];
const MS_DAY = 86400000;
const iso = ms => new Date(ms).toISOString().slice(0,19)+'Z';
const mod = n => (n%360+360)%360;
const rnd = (x,d) => Number(x.toFixed(d));
const sign = x => Math.floor(mod(x)/30);
const lord = x => LORDS[sign(x)];
export const turned = (h,k) => {
  if(!Number.isInteger(h)||!Number.isInteger(k)||h<1||h>12||k<1||k>12)throw Error('Номера домов должны быть от 1 до 12');
  return ((h+k-2)%12)+1;
};
const uuid = () => globalThis.crypto?.randomUUID?.() || `h-${Math.random().toString(16).slice(2)}-${Date.now()}`;
const stable = o => JSON.stringify(o,(_,v)=>v && typeof v==='object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b,'en'))) : v);
export const sha256 = async s => {
  const bytes = new TextEncoder().encode(s);
  const sum = await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(sum),b=>b.toString(16).padStart(2,'0')).join('');
};
export const canonicalHash = async o => sha256(stable(o));
const requireStr = (o,key,max) => {
  if(typeof o[key]!=='string'||!o[key].trim()||o[key].length>max)throw Error(`Поле «${key}» обязательно (макс. ${max} символов)`);
};
export function validate(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Ожидается объект вопроса');
  requireStr(data,'raw_text',4000);
  if(typeof (data.context??'')!=='string'||(data.context??'').length>8000)throw Error('Контекст слишком длинный');
  const dt=data.moment_local;
  if(typeof dt!=='string'||dt.length>40||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?[+-](?:0\d|1[0-4]):[0-5]\d$/.test(dt))throw Error('Укажите дату и местное время с UTC-смещением');
  const year=Number(dt.slice(0,4));
  if(year<1800||year>2399)throw Error('Поддерживаются годы 1800–2399');
  const ms=Date.parse(dt);
  if(!Number.isFinite(ms))throw Error('Некорректные дата или смещение');
  const off=dt.slice(-6),signOff=off[0]==='-'?-1:1;
  const minutes=signOff*(Number(off.slice(1,3))*60+Number(off.slice(4)));
  if(Math.abs(minutes)>14*60)throw Error('Некорректное смещение UTC');
  const localPart=dt.slice(0,-6).length===16?dt.slice(0,-6)+':00':dt.slice(0,-6);
  const roundTrip=new Date(ms+minutes*60000).toISOString().slice(0,19);
  if(roundTrip!==localPart)throw Error('Несуществующая календарная дата или время');
  const lat=Number(data.latitude_deg),lon=Number(data.longitude_deg);
  if(data.latitude_deg===null||data.longitude_deg===null||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>89||Math.abs(lon)>180)throw Error('Введите широту −89…89 и долготу −180…180');
  if(data.house_system!=='REGIOMONTANUS')throw Error('Поддерживается только система Региомонтануса');
  if(data.method_profile!=='frawley_early')throw Error('Недоступный методический профиль');
  if(!INTENTS.has(data.intent_kind||'EVENT'))throw Error('Неизвестный тип вопроса');
  if(!['direct','on_behalf','about_other','unknown'].includes(data.relay_mode||'direct'))throw Error('Неверное посредничество');
  if(!['questioner','configured'].includes(data.coordinate_source||'configured'))throw Error('Неверный источник координат');
  if(!Array.isArray(data.house_path)||data.house_path.length>4||data.house_path.some(x=>!Number.isInteger(x)||x<1||x>12))throw Error('Некорректный путь производных домов');
  if(typeof data.roles_locked!=='boolean')throw Error('Подтверждение ролей должно быть логическим');
  if(!Number.isInteger(data.revision)||data.revision<1||data.revision>10000)throw Error('Некорректная ревизия');
  const qid=data.question_id||uuid();
  if(typeof qid!=='string'||qid.length<1||qid.length>100)throw Error('Некорректный идентификатор вопроса');
  const owner=data.question_owner_id??'я',speaker=data.speaker_id??'я';
  if([owner,speaker].some(x=>typeof x!=='string'||!x.trim()||x.length>80))throw Error('Псевдонимы участников не могут быть пустыми');
  const recorded=data.recorded_at_utc||iso(Date.now());
  if(!Number.isFinite(Date.parse(recorded))||!/(Z|[+-]\d\d:\d\d)$/.test(recorded))throw Error('Некорректное время фиксации');
  return {input:data,qid,year,lat,lon,ms,moment_utc:iso(ms),moment_local:localPart+off,recorded:iso(Date.parse(recorded)),owner:owner.trim(),speaker:speaker.trim(),intent:data.intent_kind||'EVENT',relay:data.relay_mode||'direct',profile:'frawley_early',revision:data.revision,house_path:data.house_path,roles_locked:data.roles_locked,coordinate_source:data.coordinate_source||'configured',location_label:String(data.location_label??'').slice(0,120),zone_name:String(data.zone_name??'').slice(0,120),context:data.context||''};
}
const houseFor = (lon,cusps) => {
  for(let i=0;i<12;i++){
    const span=mod(cusps[(i+1)%12]-cusps[i]);
    if(!(span>0&&span<180))throw Error('Некорректная сетка домов для выбранной широты');
    if(mod(lon-cusps[i])<span)return i+1;
  }
  throw Error('Планета не попала в дом; проверьте координаты');
};
const angleDiff = (a,b)=>Math.abs(mod(b-a+180)-180);
const signCompatible=(a,b,aspect)=> {
  const delta=(sign(b)-sign(a)+12)%12;
  const allowed={CONJUNCTION:[0],SEXTILE:[2,10],SQUARE:[3,9],TRINE:[4,8],OPPOSITION:[6]};
  return allowed[aspect].includes(delta);
};
function makeAstronomy(api,constants){
  const flags=constants.flags,bodyIds=Object.fromEntries(NAMES.map(n=>[n,constants.planet[n]]));
  function position(jd,name){
    const v=api.calculatePosition(jd,bodyIds[name],flags);
    if((v.flags & constants.moshier)!==constants.moshier)throw Error(`Неожиданный источник эфемерид: ${name}`);
    if(![v.longitude,v.latitude,v.longitudeSpeed].every(Number.isFinite))throw Error('Эфемериды вернули нечисловую позицию');
    return {longitude_deg:mod(v.longitude),latitude_deg:v.latitude,speed_deg_per_day:v.longitudeSpeed};
  }
  function positions(jd){return Object.fromEntries(NAMES.map(n=>[n,position(jd,n)]));}
  function houses(jd,lat,lon){
    const h=api.calculateHouses(jd,lat,lon,constants.regiomontanus);
    if(!Array.isArray(h.cusps)||h.cusps.length!==13)throw Error('Нужны 12 куспидов домов');
    const cusps=h.cusps.slice(1).map(mod);
    if(cusps.some((c,i)=>!(mod(cusps[(i+1)%12]-c)>0&&mod(cusps[(i+1)%12]-c)<180)))throw Error('Некорректная сетка домов для выбранной широты');
    return {cusps,asc:mod(h.ascendant),mc:mod(h.mc)};
  }
  return {position,positions,houses};
}
function question(v){
  const actors=[{actor_id:v.owner,relation_to_owner:'self'}];
  if(v.speaker!==v.owner)actors.push({actor_id:v.speaker,relation_to_owner:'speaker/relay'});
  return {schema_version:'1.0',question_id:v.qid,revision:v.revision,raw_text:v.input.raw_text,
    recorded_at_utc:v.recorded,question_owner_id:v.owner,relay_mode:v.relay,
    intent:{kind:v.intent,classification_status:'CONFIRMED',notes:'Тип выбран пользователем; семантическая классификация не выполнена'},
    actors,chart_time_policy:'user_confirmed_convention',moment_utc:v.moment_utc,
    location_source:v.coordinate_source,roles_locked:v.roles_locked,method_profile:v.profile,context:v.context};
}
function rolesFor(v,chart){
  const cusps=chart.cusps.map(x=>x.longitude_deg),l1=lord(cusps[0]);
  let target=v.house_path.length?v.house_path[0]:0;
  for(const step of v.house_path.slice(1))target=turned(target,step);
  const assignments=[{actor_id:v.owner,role_kind:'QUERENT',radical_house:1,house_path:[1],base_lord:l1,effective_significator:l1,rule_id:'SIG-001',reason:'Традиционный управитель знака на куспиде I дома',authority_status:'PENDING_2014'}];
  const reasons=[];
  if(target){
    const l2=lord(cusps[target-1]);
    assignments.push({actor_id:'quesited',role_kind:'QUESITED',radical_house:target,house_path:v.house_path,base_lord:l2,effective_significator:l2,rule_id:v.house_path.length>1?'SIG-004':'SIG-001',reason:'Дом выбран до анализа аспектов, управитель определяется по знаку на куспиде',authority_status:'PENDING_2014'});
    if(l1===l2)reasons.push('Совпадающие управители: выбор альтернативы не автоматизируется (SIG-006/007).');
  } else reasons.push('Дом предмета вопроса не выбран; второй сигнификатор не назначен.');
  if(v.relay!=='direct')reasons.push('Вопрос не прямой: требуется проверка подлинного кверента и производных домов.');
  if(!v.roles_locked)reasons.push('Назначение домов не подтверждено пользователем.');
  const status=v.roles_locked&&target&&!reasons.length?'CONFIRMED':!target||!v.roles_locked?'NEEDS_CLARIFICATION':'NEEDS_EXPERT_REVIEW';
  return {schema_version:'1.0',question_id:v.qid,chart_id:chart.chart_id,method_profile:v.profile,roles_locked:v.roles_locked,status,assignments,review_reasons:reasons,source_chart_hash:chart.source_chart_hash};
}
function currentAspects(chart){
  const ps=chart.planets,out=[];
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
    const a=ps[i],b=ps[j],sep=angleDiff(a.longitude_deg,b.longitude_deg);
    const [target,asp]=TARGETS.slice(0,5).reduce((acc,x)=>Math.abs(sep-x[0])<Math.abs(sep-acc[0])?x:acc);
    const orb=Math.abs(sep-target);if(orb>6)continue;
    const future=angleDiff(a.longitude_deg+a.speed_deg_per_day*.05,b.longitude_deg+b.speed_deg_per_day*.05);
    out.push({planet_a:a.name,planet_b:b.name,aspect:asp,orb_deg:rnd(orb,3),motion:Math.abs(future-target)<orb?'APPLYING':'SEPARATING',sign_compatible:signCompatible(a.longitude_deg,b.longitude_deg,asp)});
  }
  return out.sort((a,b)=>a.orb_deg-b.orb_deg);
}
const unwrap=(value,ref)=>ref+mod(value-ref+180)-180;
export function contactCandidates(astro,jd0,days=30,STEP=.125){
  const ticks=Array.from({length:Math.round(days/STEP)+1},(_,i)=>i*STEP);
  const samples=ticks.map(t=>astro.positions(jd0+t)),contacts=[];
  for(let ia=0;ia<NAMES.length;ia++)for(let ib=ia+1;ib<NAMES.length;ib++){
    const a=NAMES[ia],b=NAMES[ib];let prev=mod(samples[0][b].longitude_deg-samples[0][a].longitude_deg);
    for(let k=0;k<ticks.length-1;k++){
      const x1=ticks[k],x2=ticks[k+1];
      const cur=unwrap(mod(samples[k+1][b].longitude_deg-samples[k+1][a].longitude_deg),prev);
      const lo=Math.min(prev,cur),hi=Math.max(prev,cur);
      if(hi-lo>=180)throw Error('Слишком крупный шаг аспектного поиска');
      for(const [target,aspect] of TARGETS){
        const n1=Math.floor((lo-target)/360)-1,n2=Math.ceil((hi-target)/360)+1;
        for(let n=n1;n<=n2;n++){
          const goal=target+360*n;
          if(goal<lo-1e-9||goal>hi+1e-9||Math.abs(cur-prev)<1e-11)continue;
          let left=x1,right=x2,fl=prev-goal,root;
          if(Math.abs(fl)<1e-8)root=left;
          else{
            for(let iteration=0;iteration<24;iteration++){
              const mid=(left+right)/2;
              const am=astro.position(jd0+mid,a).longitude_deg;
              const bm=astro.position(jd0+mid,b).longitude_deg;
              const fm=unwrap(mod(bm-am),prev)-goal;
              if(fm*fl<=0)right=mid;
              else{left=mid;fl=fm;}
            }
            root=(left+right)/2;
          }
          if(root<=1e-6)continue;
          const pa=astro.position(jd0+root,a),pb=astro.position(jd0+root,b);
          if(!signCompatible(pa.longitude_deg,pb.longitude_deg,aspect))continue;
          if([pa.longitude_deg,pb.longitude_deg].some(l=>l%30<1e-5||30-l%30<1e-5))continue;
          if(contacts.some(x=>x.a===a&&x.b===b&&x.aspect===aspect&&Math.abs(x.days-root)<.0001))continue;
          let ingress=false,station=false;
          for(let j=0;j<=k;j++)for(const name of [a,b]){
            ingress ||= sign(samples[j][name].longitude_deg)!==sign(samples[j+1][name].longitude_deg);
            station ||= samples[j][name].speed_deg_per_day*samples[j+1][name].speed_deg_per_day<0;
          }
          contacts.push({a,b,aspect,days:rnd(root,8),lon_a:rnd(pa.longitude_deg,6),lon_b:rnd(pb.longitude_deg,6),sign_change:ingress,station_review:station});
        }
      }
      prev=cur;
    }
  }
  return contacts.sort((a,b)=>a.days-b.days);
}
export function verifyChartTrace(chart,astro,jd){
  const h=astro.houses(jd,chart.latitude_deg,chart.longitude_deg),p=astro.positions(jd);
  const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-7;
  return chart.cusps.length===12&&chart.cusps.every((c,i)=>c.house===i+1&&close(c.longitude_deg,h.cusps[i]))&&
    chart.planets.length===7&&new Set(chart.planets.map(x=>x.name)).size===7&&chart.planets.every(x=>p[x.name]&&
      close(x.longitude_deg,p[x.name].longitude_deg)&&close(x.latitude_deg,p[x.name].latitude_deg)&&
      close(x.speed_deg_per_day,p[x.name].speed_deg_per_day)&&x.house===houseFor(p[x.name].longitude_deg,h.cusps));
}
function pathSearch(v,chart,roles,astro,jd){
  const end=iso(v.ms+30*MS_DAY);
  const p={schema_version:'1.0',question_id:v.qid,chart_id:chart.chart_id,method_profile:v.profile,
    horizon:{start_utc:v.moment_utc,end_utc:end,basis:'Инженерный горизонт 30 суток; не хорарная шкала сроков'},
    searched_channels:[],unsearched_channels:['DIRECT','TRANSLATION','COLLECTION','SPECIAL_TOPIC'],search_coverage:'NOT_EVALUATED',full_required_scope_implemented:false,paths:[],source_chart_hash:chart.source_chart_hash,search_version:ENGINE,notes:'Нет полного поиска всех каналов; окончательное NO запрещено.'};
  if(RISK.some(s=>(v.input.raw_text+' '+v.context).toLowerCase().includes(s))){p.notes='Вопрос высокого риска: геометрический поиск отключён.';return p;}
  if(SPECIAL.has(v.intent)){p.notes='Для выбранной темы специализированный алгоритм не принят.';return p;}
  if(roles.assignments.length<2||roles.status!=='CONFIRMED')return p;
  const [a,b]=roles.assignments.slice(0,2).map(x=>x.effective_significator);
  if(a===b)return p;
  const all=contactCandidates(astro,jd);
  p.searched_channels=['DIRECT'];p.unsearched_channels=['TRANSLATION','COLLECTION','SPECIAL_TOPIC'];p.search_coverage='DIRECT_ONLY_FOR_SPECIFIED_PAIR';
  const direct=all.filter(c=>c.a===a&&c.b===b||c.a===b&&c.b===a);
  for(const [i,c] of direct.slice(0,50).entries()){
    const interfering=all.filter(x=>x.days<c.days-1e-6&&new Set([x.a,x.b,a,b]).size===3&&!(x.a===a&&x.b===b||x.a===b&&x.b===a));
    const status=c.sign_change||c.station_review?'SIGN_CHANGE_REVIEW':interfering.length?'INTERVENING_CONTACT_REVIEW':'DIRECT_GEOMETRY';
    p.paths.push({path_id:`path:${chart.chart_id}:${i+1}`,channel:'DIRECT',geometry_status:status,participants:[a,b],contacts:[{contact_utc:iso(v.ms+Math.round(c.days*MS_DAY)),aspect:c.aspect,planet_a:c.a,planet_b:c.b,sign_change_review:c.sign_change}],rule_ids:['G-001',interfering.length||c.sign_change?'G-006':'G-001'],review_reasons:[...(c.sign_change||c.station_review?['Смена знака/скорости до контакта']:[]),...(interfering.length?[`${interfering.length} других точных контактов с сигнификаторами до даты`]:[])]});
  }
  return p;
}
function judgment(v,chart,roles,paths,rulesHash,ids){
  const unsafe=RISK.some(s=>(v.input.raw_text+' '+v.context).toLowerCase().includes(s));let status,why;
  if(unsafe){status='SAFETY_LIMITED';why='Вопрос может касаться угрозы жизни или безопасности: не используйте хорар вместо экстренной помощи.';}
  else if(SPECIAL.has(v.intent)){status='TOPIC_MODULE_REQUIRED';why='Для поиска, местонахождения или возвращения требуется отдельный методический модуль.';}
  else if(!v.house_path.length||!v.roles_locked){status='NEEDS_CLARIFICATION';why='Выберите дом предмета вопроса и подтвердите назначение ролей.';}
  else if(roles.status!=='CONFIRMED'){status='NEEDS_EXPERT_REVIEW';why='Роли или посредничество требуют экспертного разрешения.';}
  else if(paths.paths.length){status='NEEDS_EXPERT_REVIEW';why='Найдены кандидаты на контакт, но рецепции, препятствия и смысловые условия не проверены.';}
  else {status='SEARCH_INCOMPLETE';why='Отсутствие прямого контакта в 30-дневном горизонте не исключает иных механизмов события.';}
  const evidence=(ruleId,desc,n)=>{
    if(!ids.has(ruleId))throw Error(`Отсутствует правило ${ruleId}`);
    return {evidence_id:`ev:${v.qid}:r${v.revision}:${n}`,rule_id:ruleId,source_kind:'REAL_EPHEMERIS',chart_fact:desc,calculation_version:ENGINE,input_hash:chart.source_chart_hash,strength:n<=2?'PRIMARY':'CONTEXTUAL'};
  };
  const a=roles.assignments[0],key=[evidence('SIG-001',`Управитель I дома: ${a.base_lord}`,1)];
  if(roles.assignments[1]){
    const b=roles.assignments[1];key.push(evidence(b.rule_id,`Дом предмета вопроса: ${b.radical_house}, управитель: ${b.base_lord}`,2));
  }
  for(const [i,p] of paths.paths.slice(0,5).entries()){
    const c=p.contacts[0];key.push(evidence('G-001',`Кандидат на ${c.aspect} ${c.planet_a}–${c.planet_b} ${c.contact_utc} (не итоговое суждение)`,i+3));
  }
  const unknowns=['Не проверены рецепции, достоинства, помехи и воля участников.','Не реализованы полные каналы передачи и собирания света.','Не проведены 88 семантических приёмочных тестов.'];
  if(status==='TOPIC_MODULE_REQUIRED')unknowns.unshift('Отсутствует утверждённый алгоритм выбранной темы.');
  return {schema_version:'1.0',question_id:v.qid,method_profile:v.profile,processing_status:status,judgment_status:'NOT_APPLICABLE',roles_locked:v.roles_locked,event_assessment:why,outcome_quality:'UNKNOWN',benefit_for_querent:'UNKNOWN',timing:null,key_evidence:key,counterevidence:[],conditions:[],unknowns,calculation_version:ENGINE,rule_set_hash:rulesHash,source_chart_hash:chart.source_chart_hash,search_coverage:paths.search_coverage,limitations:['Астрология не является научно подтверждённым методом прогноза.','Выводы YES/NO/TIMING заблокированы до методической приёмки.'],human_review:true,client_text:`${why} Карта и сигнификаторы рассчитаны технически; положительный или отрицательный прогноз не сформирован.`,expert_text:`Профиль: frawley_early. Семь традиционных планет; Региомонтанус; Moshier WASM. Статус ролей: ${roles.status}; прямых кандидатов: ${paths.paths.length}; покрытие: ${paths.search_coverage}. Текущая версия не является принятым смысловым интерпретатором.`};
}
export async function build(data,api,constants,rules){
  const v=validate(data),astro=makeAstronomy(api,constants);
  const now=new Date(v.ms),jd=api.dateToJulianDay(now);
  if(!Number.isFinite(jd))throw Error('Не удалось вычислить юлианскую дату');
  const {cusps,asc,mc}=astro.houses(jd,v.lat,v.lon),pos=astro.positions(jd);
  const planets=NAMES.map(n=>({name:n,longitude_deg:rnd(pos[n].longitude_deg,9),latitude_deg:rnd(pos[n].latitude_deg,9),speed_deg_per_day:rnd(pos[n].speed_deg_per_day,9),house:houseFor(pos[n].longitude_deg,cusps)}));
  const settings={flags:'MOSEPH|SPEED',house_code:'R',observer:'geocentric',longitude_positive:'east',zodiac:'tropical'};
  const hash=await canonicalHash({question_id:v.qid,revision:v.revision,moment_utc:v.moment_utc,latitude_deg:v.lat,longitude_deg:v.lon,coordinate_source:v.coordinate_source,house_system:'REGIOMONTANUS',profile:v.profile,ephemeris:settings});
  const chart={schema_version:'1.0',chart_id:`${v.qid}:r${v.revision}`,question_id:v.qid,moment_utc:v.moment_utc,latitude_deg:v.lat,longitude_deg:v.lon,location_source:v.coordinate_source,house_system:'REGIOMONTANUS',zodiac:'TROPICAL',ephemeris:{library:'Swiss Ephemeris/Moshier WebAssembly',version:String(api.version()),calculation_settings:settings},planets,cusps:cusps.map((x,i)=>({house:i+1,longitude_deg:rnd(x,9)})),data_kind:'REAL_EPHEMERIS',source_chart_hash:hash,calculation_utc:iso(Date.now()),notes:'Moshier в браузере, геоцентрически; экспертные трактовки не рассчитаны.'};
  if(!verifyChartTrace(chart,astro,jd))throw Error('Повторный расчёт карты не совпал с исходным снимком');
  const ruleHash=await canonicalHash(rules),ids=new Set(rules.rules.map(x=>x.rule_id));
  const roles=rolesFor(v,chart),paths=pathSearch(v,chart,roles,astro,jd),j=judgment(v,chart,roles,paths,ruleHash,ids);
  // Versions 1.1 and 1.2 are *additional evidence*, not amendments of ChartSnapshot 1.0.
  // The source hash and chart ID must be preserved across both independent modules.
  const sect_info=solarSect(jd,v.lat,v.lon,pos.Sun.longitude_deg,pos.Sun.latitude_deg);
  const accidental=await calculateAccidentals(adaptAccidentalChart(chart,{returnTheme:v.intent==='RETURN'}));
  const essential=sect_info.sect==='UNRESOLVED'?null:await calculateDignities(adaptDignityChart(chart,sect_info.sect));
  const joined=essential?mergeEvidence(essential,accidental):null;
  // The role/domain binding has strict preconditions; no inference from an unconfirmed role.
  const role_receptions=essential&&roles.roles_locked&&roles.status==='CONFIRMED'
    ?roleReceptionEvidence(essential,roles,'OTHER'):null;
  const role_assembly=role_receptions?.analysis_status==='EVIDENCE_ONLY_NO_VERDICT'
    ?assembleRoleEvidence(essential,accidental,roles,role_receptions):null;
  const live_gate=liveGate({question_kind:v.intent,roles_locked:roles.roles_locked,
    safety_tier:j.processing_status==='SAFETY_LIMITED'?'HIGH':'STANDARD',
    trace_recomputed_from_chart:true,all_channels_covered:false,semantic_perfection_review_complete:false});
  if(essential){
    j.unknowns=j.unknowns.filter(x=>!x.startsWith('Не проверены рецепции, достоинства'));
    j.unknowns.unshift('Эссенциальные достоинства и рецепции рассчитаны как факты v1.1, но их роль в итоговом суждении не проверена.');
  } else {
    j.unknowns.unshift('Солнце вблизи горизонта: секта и зависящие от неё достоинства требуют экспертного подтверждения.');
  }
  j.unknowns.unshift('Акцидентальные факторы v1.2 рассчитаны, но не являются полной оценкой силы сигнификатора.');
  j.expert_text+=` Модули 1.1/1.2: достоинства ${essential?'рассчитаны':'ожидают секты'}, акцидентальные факторы рассчитаны; синтез события отсутствует.`;
  return {question:question(v),chart,roles,path_search:paths,judgment:j,current_aspects:currentAspects(chart),
    evidence:{sect_info,essential,accidental,joined,role_receptions,role_assembly,live_gate,
      numerical_trace:{schema_version:'1.4',trace_recomputed_from_chart:true,source_chart_hash:hash,
        source_versions:{chart:'1.4',dignity:'1.1',accidental:'1.2',semantic:'1.3'},
        sampling_hours:3,all_channels_covered:false,can_issue_client_verdict:false,final_prediction:null,timing_prediction:null},
      limits:['Нет проверки совершенствования с учётом всех каналов и препятствий',
        'Версия Фроули 2014 не сверена с таблицами Олешко 1999',
        '88 семантических сценариев не реализованы']},
    meta:{location_label:v.location_label,zone_name:v.zone_name,moment_local:v.moment_local,ascendant_deg:rnd(asc,9),mc_deg:rnd(mc,9),rules_hash:ruleHash}};
}
