/* Method 2.0.1: numerical candidates with explicit coverage, never a verdict.
   Adaptive sampling is bounded engineering work, not a proof for arbitrary curves. */
export const mod=x=>(x%360+360)%360;
export const sign=x=>Math.floor(mod(x)/30);
export const unwrap=(x,ref)=>ref+mod(x-ref+180)-180;
export const PRECISION_SECONDS=2;
const EPS=1e-9; // root localization target, limited by ephemeris floating-point precision
const diff=(a,b)=>Math.abs(unwrap(a,b)-b);
const targetAngles=[[0,'CONJUNCTION'],[60,'SEXTILE'],[90,'SQUARE'],[120,'TRINE'],[180,'OPPOSITION'],[240,'TRINE'],[270,'SQUARE'],[300,'SEXTILE']];
export function cachedAstronomy(astro){
 const cache=new Map();
 return {position(t,p){const k=`${t}:${p}`;if(!cache.has(k)){const v=astro.position(t,p);if(!Number.isFinite(v.longitude_deg)||!Number.isFinite(v.speed_deg_per_day))throw Error('NUMERICAL_FAILURE');cache.set(k,v);}return cache.get(k);}};
}
function bisect(fn,lo,hi){let fl=fn(lo);if(Math.abs(fl)<1e-11)return lo;for(let i=0;i<48&&hi-lo>EPS;i++){const mid=(lo+hi)/2,fm=fn(mid);if(fl*fm<=0)hi=mid;else{lo=mid;fl=fm;}}return (lo+hi)/2;}
export function curveSamples(at,start,end){
 if(![start,end].every(Number.isFinite)||end<start||end-start>730)throw Error('Invalid bounded search interval');
 const out=[{t:start,...at(start)}];let budget=200000;
 function visit(lo,hi,l,r,depth=0){
  if(--budget<0)throw Error('NUMERICAL_FAILURE');
  const mid=(lo+hi)/2,m=at(mid),rr=unwrap(r.value,l.value),mm=unwrap(m.value,l.value);
  const turn=l.speed*m.speed<0||m.speed*r.speed<0;
  const travel=Math.max(Math.abs(l.speed),Math.abs(m.speed),Math.abs(r.speed))*(hi-lo);
  const nonlinear=Math.abs(mm-(l.value+rr)/2)>.0002;
  if(depth<22&&hi-lo>EPS*2&&(travel>2||nonlinear||turn)){
   visit(lo,mid,l,m,depth+1);visit(mid,hi,m,r,depth+1);
  }else{out.push({t:mid,...m},{t:hi,...r});}
 }
 for(let lo=start;lo<end;){const hi=Math.min(end,lo+.5);visit(lo,hi,at(lo),at(hi));lo=hi;}
 return out;
}
export function periodicRoots(at,start,end,targets){
 const samples=curveSamples(at,start,end),out=[];
 const add=(t,label,target)=>{if(!out.some(x=>x.label===label&&Math.abs(x.day_offset-t)*86400<PRECISION_SECONDS))out.push({day_offset:t,label,target});};
 for(let i=1;i<samples.length;i++){
  const l=samples[i-1],r=samples[i],rv=unwrap(r.value,l.value);
  for(const [target,label] of targets){
   const low=Math.min(l.value,rv),high=Math.max(l.value,rv);
   for(let n=Math.ceil((low-target-1e-8)/360);n<=Math.floor((high-target+1e-8)/360);n++){
    const goal=target+360*n,fn=t=>unwrap(at(t).value,l.value)-goal;
    if(Math.abs(rv-l.value)<1e-12){if(Math.abs(l.value-goal)<1e-8&&Math.abs(l.speed)+Math.abs(r.speed)>1e-10)add(l.t,label,target);continue;}
    const t=bisect(fn,l.t,r.t);if(Math.abs(fn(t))<1e-5)add(t,label,target);
   }
   // A relative station can touch an exact aspect without changing its sign.
   if(l.speed*r.speed<0){const t=bisect(t=>at(t).speed,l.t,r.t);if(diff(at(t).value,target)<1e-7)add(t,label,target);}
  }
 }
 return out.sort((a,b)=>a.day_offset-b.day_offset);
}
export function trajectoryEvents(astro,jd,names,start,end){
 const out=[];
 for(const planet of [...new Set(names)]){
  const at=t=>{const p=astro.position(jd+t,planet);return {value:p.longitude_deg,speed:p.speed_deg_per_day};};
  for(const x of periodicRoots(at,start,end,Array.from({length:12},(_,i)=>[30*i,'INGRESS']))){
   const before=at(x.day_offset-PRECISION_SECONDS/86400),after=at(x.day_offset+PRECISION_SECONDS/86400);
   if(sign(before.value)!==sign(after.value))out.push({event_type:'INGRESS',planet,day_offset:x.day_offset,old_sign:sign(before.value),new_sign:sign(after.value),precision_seconds:PRECISION_SECONDS});
  }
  const samples=curveSamples(at,start,end);
  for(let i=1;i<samples.length;i++){
   const l=samples[i-1],r=samples[i];
   if(l.speed*r.speed<0||l.speed===0&&r.speed!==0||r.speed===0&&l.speed!==0){
    const t=l.speed===0?l.t:r.speed===0?r.t:bisect(t=>at(t).speed,l.t,r.t);
    if(out.some(x=>x.planet===planet&&x.event_type==='STATION'&&Math.abs(x.day_offset-t)*86400<PRECISION_SECONDS))continue;
    const before=at(t-PRECISION_SECONDS/86400).speed,after=at(t+PRECISION_SECONDS/86400).speed;
    if(before*after<0)out.push({event_type:'STATION',planet,day_offset:t,station_type:after>0?'DIRECT':'RETROGRADE',precision_seconds:PRECISION_SECONDS});
   }
  }
 }
 return out.sort((a,b)=>a.day_offset-b.day_offset);
}
export function relativeEvents(events,perfection,precision=PRECISION_SECONDS){
 return events.map(e=>{const delta=(e.day_offset-perfection)*86400,coincident=Math.abs(delta)<=Math.max(precision,e.precision_seconds||0);return {...e,before_perfection:coincident?null:delta<0,timing_relation:coincident?'COINCIDENT_EVENT_REVIEW':delta<0?'BEFORE_PERFECTION':'AFTER_PERFECTION'};});
}
export function directRoots(astro,jd,a,b,start,end){
 const at=t=>{const x=astro.position(jd+t,a),y=astro.position(jd+t,b);return {value:mod(y.longitude_deg-x.longitude_deg),speed:y.speed_deg_per_day-x.speed_deg_per_day};};
 return periodicRoots(at,start,end,targetAngles).filter(x=>Math.abs(x.day_offset)>EPS).map(x=>({planet_a:a,planet_b:b,aspect:x.label,angle_deg:x.target,day_offset:x.day_offset}));
}
export const antiscion=x=>mod(180-x);
export function antiscionRoots(astro,jd,a,b,start,end){
 const out=[];
 for(const [moving,fixed] of [[a,b],[b,a]]){
  const anchor=antiscion(astro.position(jd,fixed).longitude_deg);
  const at=t=>{const p=astro.position(jd+t,moving);return {value:p.longitude_deg,speed:p.speed_deg_per_day};};
  for(const x of periodicRoots(at,start,end,[[anchor,'ANTISCION_CONJUNCTION'],[mod(anchor+180),'ANTISCION_OPPOSITION']])){
   if(x.day_offset<-EPS)continue;
   const existing=out.find(e=>e.aspect===x.label&&Math.abs(e.day_offset-x.day_offset)*86400<=PRECISION_SECONDS);
   const witness={moving_planet:moving,fixed_planet:fixed,fixed_antiscion_longitude_deg:anchor,target_longitude_deg:x.target};
   if(existing)existing.witnesses.push(witness);
   else out.push({channel:'ANTISCION',aspect:x.label,planet_a:a,planet_b:b,day_offset:x.day_offset,witnesses:[witness],status:'GEOMETRY_CANDIDATE_NEEDS_REVIEW',dignity_position:'BODILY_POSITION'});
  }
 }
 return out.sort((a,b)=>a.day_offset-b.day_offset);
}
export function searchScope({searched_until,earliest_ingress=null,candidate=null,max_search_days=365,unchecked_channels=[]}){
 const reason=candidate!==null&&candidate<=Math.min(earliest_ingress??Infinity,max_search_days)?'PERFECTION_FOUND':earliest_ingress!==null&&earliest_ingress<=searched_until?'SIGN_BOUNDARY':searched_until>=max_search_days?'TECHNICAL_CAP':'UNSEARCHED_CHANNEL';
 return {coverage:'SEARCH_INCOMPLETE',status:'SEARCH_INCOMPLETE',stop_reason:reason,earliest_ingress,searched_until,max_search_days,unchecked_channels,can_issue_NO:false,can_issue_event_verdict:false};
}
export function searchPair(astro,jd,a,b,{max_search_days=365,preview_days=30}={}){
 if(!Number.isFinite(max_search_days)||max_search_days<=0||max_search_days>365)throw Error('Technical search cap must be within 365 days');
 const events=trajectoryEvents(astro,jd,[a,b],0,max_search_days);
 const ingress=events.find(e=>e.event_type==='INGRESS'&&e.day_offset>EPS)?.day_offset??null;
 const end=ingress===null?max_search_days:Math.min(max_search_days,Math.max(preview_days,ingress+preview_days));
 const contacts=directRoots(astro,jd,a,b,0,end).map(c=>{
  const prior=relativeEvents(events,c.day_offset).filter(e=>e.before_perfection===true||e.timing_relation==='COINCIDENT_EVENT_REVIEW');
  return {...c,status:prior.some(e=>e.timing_relation==='COINCIDENT_EVENT_REVIEW')?'COINCIDENT_EVENT_REVIEW':prior.some(e=>e.event_type==='INGRESS')?'AFTER_INGRESS_REVIEW':'GEOMETRY_CANDIDATE_NEEDS_REVIEW',preceding_events:prior.filter(e=>e.before_perfection===true),coincident_events:prior.filter(e=>e.before_perfection===null),automatic_perfection_of_original_state:false};
 });
 const boundary=Math.min(ingress??max_search_days,max_search_days),first=contacts.find(c=>c.day_offset<=boundary)?.day_offset??null;
 return {scope:searchScope({searched_until:first??boundary,earliest_ingress:ingress,candidate:first,max_search_days,unchecked_channels:['TRANSLATION','COLLECTION']}),contacts,antiscion_candidates:antiscionRoots(astro,jd,a,b,0,end),events,context_searched_until:end,numerical_method:'ADAPTIVE_MIDPOINT_SPEED_AND_CURVATURE_WITH_BRACKETED_ROOTS',precision_seconds:PRECISION_SECONDS};
}
