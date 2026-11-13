import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {dignityAt} from '../src/evidence.mjs';
import {dignityCorrection,validateLatitude,housePlacement,houseClass,angularity,speedReference,speedHeuristic,indirectCorrection,collectionReception,transmissionSequences,lunarAssessment,peregrineFlags,validateCorrectionIdentity} from '../src/method-corrections.mjs';
import {mod,antiscion,antiscionRoots,directRoots,trajectoryEvents,relativeEvents,searchScope,searchPair,cachedAstronomy} from '../src/corrective-geometry.mjs';
import {build,contactCandidates} from '../src/engine.mjs';
import {verifyArchiveRecord} from '../src/archive.mjs';
import {loadSwiss,payload,constants,rules} from './helpers/live-demo.mjs';
const acceptance=JSON.parse(fs.readFileSync(new URL('./fixtures/corrective_acceptance_v201.json',import.meta.url)));
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<=eps,`${a} vs ${b}`);
const names=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
const astronomy=fn=>({position(t,p){const q=fn(t,p);return {longitude_deg:mod(q[0]),speed_deg_per_day:q[1],latitude_deg:0};},positions(t){return Object.fromEntries(names.map(p=>[p,this.position(t,p)]));}});
function chronology(f){
 const aspectTime=f.exact_aspect_at_hours/24,ingressTime=f.ingress_at_hours/24,stationTime=f.station_at_hours/24;
 const station=Number.isFinite(stationTime);
 const moving=t=>station?[10+10*(t-stationTime)**2,20*(t-stationTime)]:[30+(t-ingressTime),1];
 const fixed=moving(aspectTime)[0];
 const astro=astronomy((t,p)=>p==='Mercury'?moving(t):p==='Venus'?[fixed,0]:[100+names.indexOf(p)*35,.00001]);
 const out=contactCandidates(astro,0,.125).find(c=>c.a==='Mercury'&&c.b==='Venus'&&c.aspect==='CONJUNCTION'&&Math.abs(c.days-aspectTime)<1e-5);
 assert.ok(out,'exact contact must be localized');return out;
}
for(const c of acceptance.cases)test(`${c.test_id}: ${c.title}`,()=>{
 const f=c.input_fixture,e=c.expected_assertions;
 switch(c.test_id){
 case 'COR-01-T01':{const p=dignityCorrection(f.planet,f.longitude_deg,f.sect);assert.equal(p.owners.domicile,e.domicile_owner);assert.ok(p.own_essential_dignities.includes('domicile'));assert.equal(p.owners.triplicity.status,'AMBIGUOUS');break;}
 case 'COR-01-T02':case 'COR-01-T03':{const p=dignityCorrection(f.planet,f.longitude_deg,f.sect);assert.equal(p.owners.triplicity.status,e.triplicity_status);assert.deepEqual(p.owners.triplicity.possible_owners,e.possible_owners);break;}
 case 'COR-01-T04':{const p=dignityCorrection('Venus',12,'UNRESOLVED');assert.equal(p.receptions.find(x=>x.dignity_kind==='domicile').evidence_certainty,e.domicile_reception_status);assert.equal(p.receptions.find(x=>x.dignity_kind==='triplicity').evidence_certainty,e.triplicity_reception_status);break;}
 case 'COR-01-T05':for(const sect of f.sect_values){const old=dignityAt(f.longitude_deg,sect),p=dignityCorrection(f.planet,f.longitude_deg,sect);for(const [kind,owner] of Object.entries(old.owners))assert.deepEqual(kind==='triplicity'?p.owners[kind].possible_owners[0]:p.owners[kind],owner);}break;
 case 'COR-02-T01':assert.equal(validateLatitude(f.latitude_deg),f.latitude_deg);assert.equal(validateLatitude(-f.latitude_deg),-f.latitude_deg);break;
 case 'COR-02-T02':case 'COR-02-T03':assert.throws(()=>validateLatitude(f.latitude_deg),x=>x.code===e.error_code);break;
 case 'COR-02-T04':assert.throws(()=>validateLatitude(f.latitude_deg));break;
 case 'COR-03-T01':case 'COR-03-T02':assert.equal(chronology(f).sign_change,e.sign_change_before_perfection);break;
 case 'COR-03-T03':case 'COR-03-T04':assert.equal(chronology(f).station_review,e.station_before_perfection);break;
 case 'COR-03-T05':{const r=relativeEvents([{event_type:'STATION',day_offset:f.station_at_seconds/86400}],f.exact_aspect_at_seconds/86400,f.tolerance_seconds)[0];assert.equal(r.timing_relation,e.timing_relation);assert.equal(r.before_perfection,null);break;}
 case 'COR-04-T01':{const r=searchScope({searched_until:f.searched_direct_days});assert.equal(r.coverage,e.coverage);assert.equal(r.can_issue_NO,e.can_issue_NO);break;}
 case 'COR-04-T02':case 'COR-04-T03':{const astro=astronomy((t,p)=>p==='Mercury'?[30-.001*f.days_to_first_ingress+.001*t,.001]:[30-.001*f.days_to_first_ingress+.001*f.days_to_exact,0]);const r=searchPair(astro,0,'Mercury','Venus');if(e.include_candidate)assert.ok(r.contacts.some(x=>Math.abs(x.day_offset-f.days_to_exact)<2/86400));else{assert.equal(r.scope.stop_reason,e.stop_reason);assert.equal(r.scope.coverage,e.coverage);}break;}
 case 'COR-04-T04':{const astro=astronomy((t,p)=>p==='Mercury'?[29.6+.1*t,.1]:[30.2,0]);const r=searchPair(astro,0,'Mercury','Venus');const c=r.contacts.find(x=>Math.abs(x.day_offset-6)<2/86400);assert.ok(c);assert.equal(c.status,e.path_status);assert.equal(c.automatic_perfection_of_original_state,e.automatic_perfection_of_original_state);break;}
 case 'COR-04-T05':{const r=searchScope({searched_until:30,unchecked_channels:f.unchecked_channels});assert.equal(r.coverage,e.coverage);assert.equal(r.can_issue_NO,e.can_issue_NO);break;}
 case 'COR-05-T01':case 'COR-05-T02':near(antiscion(f.longitude_deg),e.antiscion_longitude_deg);break;
 case 'COR-05-T03':near(antiscion(antiscion(f.longitude_deg)),e.double_antiscion_deg);break;
 case 'COR-05-T04':near(mod(antiscion(f.longitude_deg)+180),e.opposition_to_antiscion_deg);break;
 case 'COR-05-T05':{const astro=astronomy((t,p)=>[p==='Mercury'?92:208,0]);assert.equal(antiscionRoots(astro,0,'Mercury','Venus',0,1).some(x=>x.aspect==='TRINE'),e.candidate_created);break;}
 case 'COR-05-T06':{const astro=astronomy((t,p)=>[p==='Mercury'?92+.01*t:88+.01*t,.01]);const r=antiscionRoots(astro,0,'Mercury','Venus',0,1);assert.equal(r.length,e.distinct_evidence_count);assert.equal(r[0].witnesses.length,2);break;}
 case 'COR-05-T07':{const p=dignityCorrection(f.planet,102,'DAY');assert.equal(p.sign,f.bodily_sign);assert.ok(p.own_essential_dignities.includes('exaltation'));break;}
 case 'COR-06-T01':case 'COR-06-T02':assert.equal(houseClass(f.effective_house),e.frawley_house_class);assert.equal(angularity(f.effective_house),e.raw_angularity);break;
 case 'COR-07-T01':case 'COR-07-T02':{const r=speedReference(f.planet,f.source);assert.equal(r.speed_reference_definition,e.definition);near(r.value_deg_per_day,e.reference_deg_per_day??e.reference_deg_per_day_approx);break;}
 case 'COR-07-T03':{const r=speedHeuristic(f.speed_ratio);assert.equal(r.ratio_interpretation,e.ratio_interpretation);assert.equal(r.source_claim,e.source_claim);break;}
 case 'COR-08-T01':{const astro=astronomy((t,p)=>p==='Moon'?[10+.1*t,.1]:p==='Venus'?[9.6+.02*t,.02]:p==='Mars'?[10.4+.02*t,.02]:[180+names.indexOf(p)*15,.001]);const r=indirectCorrection(cachedAstronomy(astro),0,'Venus','Mars',10,{directional_receptions:[]});const candidate=r.translation_candidates.find(x=>x.translator==='Moon');assert.ok(candidate);near(candidate.past_contact.day_offset,-f.last_contact_days_ago,2/86400);near(candidate.separation_arc_deg,f.separation_arc_deg);assert.equal(candidate.review_required,e.review_required);break;}
 case 'COR-08-T02':{const r=transmissionSequences([{planet_a:'Venus',planet_b:'Moon',day_offset:1},{planet_a:'Moon',planet_b:'Mars',day_offset:2}],'Venus','Mars');assert.ok(r.length);break;}
 case 'COR-09-T01':{const r=collectionReception({directional_receptions:[{from_planet:'Venus',to_planet:'Saturn',polarity:'POSITIVE',dignity_kind:'domicile',evidence_certainty:'CERTAIN'}]},'Saturn','Venus','Mars');assert.equal(r.collector_receives_both,e.collector_receives_both);assert.equal(r.automatic_reject,e.automatic_reject);assert.equal(r.requires_context_review,e.requires_context_review);break;}
 case 'COR-10-T01':case 'COR-10-T02':case 'COR-10-T03':{const r=housePlacement(f);assert.equal(r.effective_house,e.effective_house);assert.equal(r.raw_house,f.raw_house);break;}
 case 'COR-10-T04':{const r=housePlacement({raw_house:8,planet_lon_deg:35.2,next_cusp_lon_deg:40});assert.equal(r.house_class_source_house,e.house_class_source_house);assert.equal(r.raw_house,8);break;}
 case 'COR-11-T01':{const r=lunarAssessment({complete:true});assert.equal(r.voc_strict,e.voc_strict);break;}
 case 'COR-11-T02':{const r=lunarAssessment({complete:true,next:{moon_longitude_deg:28},moonLongitude:10,ingress:2});assert.equal(r.voc_strict,e.voc_strict);assert.equal(r.voc_contextual_long_gap_review,e.voc_contextual_long_gap_review);near(r.degrees_until_next_exact_aspect,f.moon_degrees_until_next_exact_aspect);assert.equal(r.contextual_threshold_deg,null);break;}
 case 'COR-11-T03':assert.equal(lunarAssessment({complete:true}).lilly_exceptions_applied,false);break;
 case 'COR-13-T01':{assert.match(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),new RegExp(e.ui_label));break;}
 case 'COR-14-T01':case 'COR-14-T02':case 'COR-14-T03':{const r=peregrineFlags(f.own_positive_dignities,[...(f.in_detriment?['detriment']:[]),...(f.in_fall?['fall']:[])]);assert.equal(r.peregrine_frawley,e.peregrine_frawley);if('no_positive_dignity' in e)assert.equal(r.no_positive_dignity,e.no_positive_dignity);break;}
 case 'COR-ALL-T01':{assert.equal(searchScope({searched_until:30,candidate:2}).can_issue_event_verdict,e.can_issue_event_verdict);break;}
 case 'COR-ALL-T02':assert.throws(()=>validateCorrectionIdentity({schema_version:'1.0',...f},'a'.repeat(64),'q:r1'));break;
 default:assert.fail('Unimplemented acceptance case '+c.test_id);
 }
});
test('adaptive roots find two contacts around a station, tangency and distinct retrograde returns',()=>{
 const astro=astronomy((t,p)=>p==='Mercury'?[10+(t-1)**2,2*(t-1)]:[10.25,0]);const r=directRoots(astro,0,'Mercury','Venus',0,2).filter(x=>x.aspect==='CONJUNCTION');assert.equal(r.length,2);near(r[0].day_offset,.5,2/86400);near(r[1].day_offset,1.5,2/86400);
 const tangent=astronomy((t,p)=>p==='Mercury'?[10+(t-.731)**2,2*(t-.731)]:[10,0]);const rr=directRoots(tangent,0,'Mercury','Venus',0,2).filter(x=>x.aspect==='CONJUNCTION');assert.ok(rr.some(x=>Math.abs(x.day_offset-.731)<2/86400));
});
test('cusp boundary, narrow house, zodiac wrap and chain transmission remain explicit review',()=>{
 assert.equal(housePlacement({raw_house:4,planet_lon_deg:35,next_cusp_lon_deg:40}).review_required,true);
 assert.equal(housePlacement({raw_house:4,planet_lon_deg:35.2,next_cusp_lon_deg:40,house_span_deg:7}).review_required,true);
 assert.equal(housePlacement({raw_house:12,planet_lon_deg:355,next_cusp_lon_deg:358}).effective_house,1);
 const chain=transmissionSequences([{planet_a:'Venus',planet_b:'Moon',day_offset:1},{planet_a:'Moon',planet_b:'Mercury',day_offset:2},{planet_a:'Mercury',planet_b:'Mars',day_offset:3}],'Venus','Mars');assert.ok(chain.some(x=>x.contacts.length===3));
});
const swe=await loadSwiss();
test('actual browser pipeline serializes correction, rejects forged permissions, and preserves historical snapshot',async()=>{
 const r=await build(payload,swe,constants,rules),c=r.evidence.method_correction;
 const schema=JSON.parse(fs.readFileSync(new URL('../schemas/method_correction_v201.schema.json',import.meta.url)));const valid=new Ajv2020({strict:false}).compile(schema);assert.ok(valid(c),JSON.stringify(valid.errors));
 assert.equal(c.schema_version,'2.0.1');assert.equal(c.source_chart_hash,r.chart.source_chart_hash);assert.equal(c.can_issue_event_verdict,false);assert.equal(c.timing_prediction,null);assert.equal(c.accidental_completeness,'PARTIAL');assert.equal(c.display_aspects.drives_perfection,false);assert.equal(c.search_scope.coverage,'SEARCH_INCOMPLETE');assert.ok(c.geometry.contacts.length);
 const saved=structuredClone(r);saved.chart.calculation_utc='2020-01-01T00:00:00Z';const restored=await verifyArchiveRecord({input:payload,result:saved},p=>build(p,swe,constants,rules));assert.deepEqual(restored.result.chart,saved.chart);assert.deepEqual(saved.evidence.method_correction,c);
 saved.evidence.method_correction.can_issue_event_verdict=true;await assert.rejects(verifyArchiveRecord({input:payload,result:saved},()=>assert.fail('must reject before computation')));
 for(const latitude_deg of [65.0001,-65.0001,NaN])await assert.rejects(build({...payload,latitude_deg},{dateToJulianDay(){assert.fail('must validate before ephemeris');}},constants,rules));
});
const independent=JSON.parse(fs.readFileSync(new URL('./fixtures/corrective_independent_ephemeris.json',import.meta.url)));
const actualAstro={position(jd,name){const p=swe.calculatePosition(jd,constants.planet[name],constants.flags);return {longitude_deg:p.longitude,speed_deg_per_day:p.longitudeSpeed,latitude_deg:p.latitude};},positions(jd){return Object.fromEntries(names.map(n=>[n,this.position(jd,n)]));}};
for(const [index,ref] of independent.chronology_cases.entries())test(`independent Python/WASM chronology ${index+1}: ${ref.case}`,()=>{
 const found=contactCandidates(actualAstro,ref.start_jd,.125).find(e=>e.a===ref.a&&e.b===ref.b&&Math.abs(e.days-ref.aspect_day_offset)<independent.root_tolerance_seconds/86400);
 assert.ok(found);assert.equal(found.sign_change,ref.sign_change_before_perfection);assert.equal(found.station_review,ref.station_before_perfection);
 const events=trajectoryEvents(actualAstro,ref.start_jd,[ref.a,ref.b],0,.125);const event=events.find(e=>e.event_type===ref.event.type&&e.planet===ref.event.planet);assert.ok(event);near(event.day_offset,ref.event.day_offset,independent.root_tolerance_seconds/86400);
 assert.ok(found.preceding_events.every(e=>e.day_offset<found.days-2/86400));
 if(ref.case==='INGRESS_AFTER'){
  // Demonstrate the original three-hour endpoint comparison's false flag.
  const p=ref.event.planet;assert.notEqual(Math.floor(actualAstro.position(ref.start_jd,p).longitude_deg/30),Math.floor(actualAstro.position(ref.start_jd+.125,p).longitude_deg/30));assert.equal(found.sign_change,false);
 }
});
test('independent antiscion root uses a fixed original point and has no exact bodily aspect',()=>{
 const ref=independent.antiscion;const roots=antiscionRoots(cachedAstronomy(actualAstro),ref.start_jd,ref.a,ref.b,0,30);const c=roots.find(x=>x.aspect==='ANTISCION_CONJUNCTION'&&Math.abs(x.day_offset-ref.exact_day_offset)<2/86400);assert.ok(c);near(c.witnesses[0].fixed_antiscion_longitude_deg,ref.fixed_antiscion_longitude_deg,1e-7);assert.equal(c.status,'GEOMETRY_CANDIDATE_NEEDS_REVIEW');near(mod(actualAstro.position(ref.start_jd+c.day_offset,ref.b).longitude_deg-actualAstro.position(ref.start_jd+c.day_offset,ref.a).longitude_deg),ref.body_separation_at_exact,1e-5);
});
const inputAt=(jd,extra={})=>({...payload,moment_local:new Date((jd-2440587.5)*86400000).toISOString().slice(0,19)+'+00:00',intent_kind:'EVENT',contact_options:undefined,roles_locked:false,house_path:[],...extra});
test('independent sunrise retains certain dignity/reception facts while ambiguous triplicity stays unresolved',async()=>{
 const ref=independent.sunrise;const r=await build(inputAt(ref.jd,{latitude_deg:ref.latitude_deg,longitude_deg:ref.longitude_deg}),swe,constants,rules),c=r.evidence.method_correction;
 assert.equal(r.evidence.sect_info.sect,'UNRESOLVED');assert.equal(r.evidence.essential,null,'legacy 1.1 contract remains intact');assert.equal(c.essential.placements.length,7);assert.ok(c.essential.directional_receptions.some(e=>e.evidence_certainty==='CERTAIN'));assert.ok(c.essential.directional_receptions.some(e=>e.evidence_certainty==='SECT_DEPENDENT'));assert.equal(c.can_issue_event_verdict,false);
 const sameLongitudes=r.chart.planets.map(p=>p.longitude_deg);for(const sect of ['DAY','NIGHT','UNRESOLVED'])for(const [i,p] of c.essential.placements.entries()){const q=dignityCorrection(p.planet,sameLongitudes[i],sect);for(const kind of ['domicile','exaltation','term','face','detriment','fall'])assert.equal(q.owners[kind],p.owners[kind]);}
});
test('independent Regiomontanus cusp case changes only effective placement; ±65° grids remain finite',async()=>{
 const ref=independent.cusp;const r=await build(inputAt(ref.jd,{latitude_deg:ref.latitude_deg,longitude_deg:ref.longitude_deg}),swe,constants,rules);const p=r.chart.planets.find(x=>x.name===ref.planet),h=r.evidence.method_correction.house_placements.find(x=>x.planet===ref.planet);assert.equal(p.house,ref.raw_house);assert.equal(h.raw_house,ref.raw_house);assert.equal(h.effective_house,ref.effective_house);near(p.longitude_deg,ref.planet_longitude_deg,1e-5);
 for(const latitude_deg of [-65,65]){const result=await build(inputAt(ref.jd,{latitude_deg}),swe,constants,rules);assert.ok(result.chart.cusps.every(x=>Number.isFinite(x.longitude_deg)));assert.equal(result.chart.planets.length,7);}
});
