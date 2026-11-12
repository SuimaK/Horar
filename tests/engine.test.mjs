import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build,validate,turned,canonicalHash,contactCandidates} from '../src/engine.mjs';
const ref=JSON.parse(fs.readFileSync(new URL('./reference.json',import.meta.url)));
const rules=JSON.parse(fs.readFileSync(new URL('../rules_registry.json',import.meta.url)));
const FLAGS=4|256; // SEFLG_MOSEPH | SEFLG_SPEED
const PLANETS={Sun:0,Moon:1,Mercury:2,Venus:3,Mars:4,Jupiter:5,Saturn:6};
const INVERSE=Object.fromEntries(Object.entries(PLANETS).map(([k,v])=>[v,k]));
const constants={planet:PLANETS,moshier:4,flags:FLAGS,regiomontanus:'R'};
function mock(scenario=ref[0]){
  // At epoch exactly match native PySwissEph; transit linear extrapolation is
  // *only* for testing event detection and must never be used in production.
  const epoch=scenario.jd;
  const api={
    dateToJulianDay(date){return date.getTime()/86400000+2440587.5;},
    calculateHouses(jd,lat,lon,system){
      assert.equal(system,'R');assert.equal(lat,scenario.latitude);assert.equal(lon,scenario.longitude);
      return {cusps:[0,...scenario.cusps],ascendant:scenario.ascendant,mc:scenario.mc};
    },
    calculatePosition(jd,id,flags){
      assert.equal(flags,FLAGS);const obj=scenario.planets[INVERSE[id]],t=jd-epoch;
      return {longitude:obj.longitude+t*obj.longitudeSpeed,latitude:obj.latitude,longitudeSpeed:obj.longitudeSpeed,flags:FLAGS};
    },
    version(){return '2.10.03 mock';}
  };return api;
}
const payload=(s=ref[0],override={})=>({question_id:'qatest-001',revision:1,raw_text:'Будет ли встреча?',context:'',question_owner_id:'я',speaker_id:'я',relay_mode:'direct',intent_kind:'EVENT',moment_local:s.moment.replace('Z','+00:00'),latitude_deg:s.latitude,longitude_deg:s.longitude,coordinate_source:'configured',house_system:'REGIOMONTANUS',method_profile:'frawley_early',house_path:[7],roles_locked:true,...override});
test('date/time zone validation and Gregorian roundtrip',()=>{
  const p=payload();const v=validate(p);
  assert.equal(v.moment_utc,ref[0].moment);
  assert.equal(validate({...p,moment_local:'2026-11-11T11:51+03:00'}).moment_utc,ref[0].moment);
  assert.throws(()=>validate({...p,moment_local:'2026-02-30T10:00:00+01:00'}),/Несуществующая/);
  assert.throws(()=>validate({...p,moment_local:'2026-11-11T11:51:00'}),/UTC/);
  assert.throws(()=>validate({...p,moment_local:'2026-11-11T11:51:00+15:00'}),/UTC|смещение/);
});
test('input validations reject impossible coordinates and missing roles metadata',()=>{
  assert.throws(()=>validate(payload(ref[0],{latitude_deg:91})),/широту/);
  assert.throws(()=>validate(payload(ref[0],{latitude_deg:NaN})),/широту/);
  assert.throws(()=>validate(payload(ref[0],{roles_locked:'true'})),/логическим/);
  assert.throws(()=>validate(payload(ref[0],{house_system:'PLACIDUS'})),/Региомонтануса/);
  assert.throws(()=>validate(payload(ref[0],{raw_text:''})),/обязательно/);
  assert.throws(()=>validate(payload(ref[0],{house_path:[0]})),/производных/);
  assert.throws(()=>validate(payload(ref[0],{method_profile:'unapproved'})),/профиль/);
});
test('turned houses start at the selected radical house, not at the querent',()=>{
  assert.equal(turned(7,4),10);assert.equal(turned(4,10),1);assert.equal(turned(12,2),1);
  assert.throws(()=>turned(13,1));
});
for(const scenario of ref){
  test(`same input map as Swiss Ephemeris reference at ${scenario.moment}`,async()=>{
    const r=await build(payload(scenario,{house_path:[],roles_locked:false}),mock(scenario),constants,rules);
    assert.equal(r.chart.planets.length,7);
    for(const x of r.chart.planets){
      assert.ok(Math.abs(x.longitude_deg-scenario.planets[x.name].longitude)<1e-7,`planet ${x.name}`);
      assert.ok(Math.abs(x.speed_deg_per_day-scenario.planets[x.name].longitudeSpeed)<1e-7);
    }
    for(let i=0;i<12;i++)assert.ok(Math.abs(r.chart.cusps[i].longitude_deg-scenario.cusps[i])<1e-7);
    assert.ok(Math.abs(r.meta.ascendant_deg-scenario.ascendant)<1e-7);
    assert.ok(Math.abs(r.meta.mc_deg-scenario.mc)<1e-7);
    assert.equal(r.chart.ephemeris.calculation_settings.house_code,'R');
    assert.equal(r.judgment.judgment_status,'NOT_APPLICABLE');
    assert.equal(r.path_search.search_coverage,'NOT_EVALUATED');
  });
}
test('roles, signals, source chart link and strict no YES/NO/TIMING',async()=>{
  const r=await build(payload(),mock(),constants,rules);
  assert.equal(r.roles.assignments.length,2);
  assert.equal(r.roles.status,'CONFIRMED');
  assert.equal(r.roles.assignments[1].radical_house,7);
  assert.equal(r.judgment.human_review,true);
  assert.equal(r.judgment.timing,null);
  assert.equal(r.judgment.judgment_status,'NOT_APPLICABLE');
  assert.equal(r.path_search.full_required_scope_implemented,false);
  assert.equal(r.chart.source_chart_hash,r.judgment.source_chart_hash);
  assert.match(r.chart.source_chart_hash,/^[0-9a-f]{64}$/);
  for(const e of r.judgment.key_evidence)assert.equal(e.input_hash,r.chart.source_chart_hash);
});
test('sensitive topics never run predictive search',async()=>{
  const r=await build(payload(ref[0],{intent_kind:'LOCATION'}),mock(),constants,rules);
  assert.equal(r.judgment.processing_status,'TOPIC_MODULE_REQUIRED');
  assert.equal(r.path_search.paths.length,0);
  const risk=await build(payload(ref[0],{raw_text:'Когда умрет человек?'}),mock(),constants,rules);
  assert.equal(risk.judgment.processing_status,'SAFETY_LIMITED');
  assert.equal(risk.path_search.paths.length,0);
});
test('revision alters source hash while retaining question id',async()=>{
  const a=await build(payload(),mock(),constants,rules);
  const b=await build(payload(ref[0],{revision:2}),mock(),constants,rules);
  assert.notEqual(a.chart.source_chart_hash,b.chart.source_chart_hash);
  assert.equal(a.chart.question_id,b.chart.question_id);
});
test('direct contacts refine exact angle roots on linear mock trajectories',()=>{
  const s=ref[0];const astro={
    positions(jd){return Object.fromEntries(Object.entries(s.planets).map(([n,p])=>[n,{longitude_deg:(p.longitude+p.longitudeSpeed*(jd-s.jd)+720)%360,speed_deg_per_day:p.longitudeSpeed}]));},
    position(jd,n){const p=s.planets[n];return {longitude_deg:(p.longitude+p.longitudeSpeed*(jd-s.jd)+720)%360,speed_deg_per_day:p.longitudeSpeed};}
  };
  const c=contactCandidates(astro,s.jd,30);
  assert.ok(Array.isArray(c));
  for(const x of c){
    assert.ok(x.days>0&&x.days<=30);
    const d=(x.lon_b-x.lon_a+360)%360;
    const target={CONJUNCTION:[0],SEXTILE:[60,300],SQUARE:[90,270],TRINE:[120,240],OPPOSITION:[180]}[x.aspect];
    assert.ok(target.some(t=>Math.min(Math.abs(d-t),Math.abs(d-t-360),Math.abs(d-t+360))<.003),JSON.stringify(x));
  }
});
test('no network API remains in client source or deployment template',()=>{
  const js=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.doesNotMatch(js,/fetch\(['"]\/api\/|\/api\/build/);
  assert.match(js,/window\.horaryBuild/);
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/type="module"/);
  const workflow=fs.readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(workflow,/deploy-pages/);
});
