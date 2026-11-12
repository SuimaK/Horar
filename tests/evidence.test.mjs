import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from '../src/engine.mjs';
import {validateDignityProfile,dignityAt,calculateDignities,roleReceptionEvidence,
  adaptDignityChart,validateAccidentalProfile,calculateAccidentals,adaptAccidentalChart,
  mergeEvidence,solarSect} from '../src/evidence.mjs';

const file=n=>JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`,import.meta.url),'utf8'));
const clone=x=>structuredClone(x);
const fakeHash='a'.repeat(64);
const dignityReq=file('dignity_request'),accReq=file('accidental_request');
const expectedDignity=file('dignity_response'),expectedAccidental=file('accidental_response');

test('both authenticated calculation profiles are valid',()=>{
  assert.equal(validateDignityProfile(),true);
  assert.equal(validateAccidentalProfile(),true);
});
test('v1.1 entire response matches Python 164-test fixture including hashes and edge ordering',async()=>{
  const d=await calculateDignities(dignityReq);
  assert.deepEqual(d,expectedDignity);
  assert.equal(d.judgment_status,'NOT_PERFORMED');
  assert.equal(d.table_is_verified_against_frawley_2014,false);
});
test('v1.2 entire response matches Python release fixture including hashes',async()=>{
  const a=await calculateAccidentals(accReq);
  assert.deepEqual(a,expectedAccidental);
  assert.equal(a.predictive_confidence,null);
  assert.equal(a.planets.every(p=>p.motion.station_confirmed===false),true);
});
test('confirmed role evidence v1.1 matches release fixture and does not predict',async()=>{
  const d=await calculateDignities(dignityReq),roles=file('roles');
  assert.deepEqual(roleReceptionEvidence(d,roles,'RELATIONSHIP'),file('role_reception_summary'));
  const changed=clone(roles);changed.source_chart_hash='b'.repeat(64);
  assert.throws(()=>roleReceptionEvidence(d,changed,'RELATIONSHIP'),/той же карте/);
  const invalid=clone(roles);invalid.roles_locked=false;
  assert.throws(()=>roleReceptionEvidence(d,invalid,'RELATIONSHIP'),/подтверждены/);
});
test('terms use half-open intervals and dignities avoid flattening positives vs negatives',()=>{
  assert.equal(dignityAt(5.999999,'DAY').owners.term,'Jupiter');
  assert.equal(dignityAt(6,'DAY').owners.term,'Venus');
  assert.equal(dignityAt(29.999999,'DAY').owners.term,'Saturn');
  assert.equal(dignityAt(12*30-0.0001,'NIGHT').sign,'Pisces');
  assert.equal(dignityAt(100,'DAY').owners.triplicity,'Mars');
  assert.throws(()=>dignityAt(360,'DAY'),/Долгота/);
  assert.throws(()=>dignityAt(6,'UNRESOLVED'),/Секта/);
});
test('v1.1 invalid profiles, duplicate planets and incorrect date-independent schema rejected',async()=>{
  const dup=clone(dignityReq);dup.planets[1].name='Sun';
  await assert.rejects(()=>calculateDignities(dup),/Неверный/);
  const bad=clone(dignityReq);bad.sect='EVENING';
  await assert.rejects(()=>calculateDignities(bad),/Неверный/);
  const badLongitude=clone(dignityReq);badLongitude.planets[0].longitude_deg=Infinity;
  await assert.rejects(()=>calculateDignities(badLongitude),/Неверный/);
});
test('solar boundaries: cazimi 17.5 minutes, combustion 8.5°, under rays across signs',async()=>{
  const sample=clone(accReq);
  const sun=sample.planets.find(x=>x.name==='Sun'),v=sample.planets.find(x=>x.name==='Venus');
  sun.longitude_deg=15;v.longitude_deg=15+17.5/60;
  let result=await calculateAccidentals(sample);
  assert.equal(result.planets.find(x=>x.planet==='Venus').solar.state,'CAZIMI');
  v.longitude_deg=23.5;
  result=await calculateAccidentals(sample);
  assert.equal(result.planets.find(x=>x.planet==='Venus').solar.state,'COMBUST');
  sun.longitude_deg=359;v.longitude_deg=1;
  result=await calculateAccidentals(sample);
  assert.equal(result.planets.find(x=>x.planet==='Venus').solar.state,'UNDER_BEAMS');
});
test('retrograde return, speed station and houses never produce verdict',async()=>{
  const sample=clone(accReq);
  sample.context.return_theme=true;
  const mer=sample.planets.find(x=>x.name==='Mercury');
  mer.speed_deg_per_day=-0.001;
  const result=await calculateAccidentals(sample);
  const m=result.planets.find(x=>x.planet==='Mercury');
  assert.equal(m.motion.direction,'RETROGRADE');
  assert.equal(m.motion.station_confirmed,false);
  assert.equal(m.motion.near_station_not_confirmed,true);
  assert.match(m.motion.retrograde_context,/RETURN_THEME/);
  const mars=result.planets.find(x=>x.planet==='Mars');
  assert.equal(mars.house_class,'STRONG_ANGULAR');
  const wrong=clone(sample);wrong.planets[2].house=0;
  await assert.rejects(()=>calculateAccidentals(wrong),/Неверный/);
});
test('different source revision or planets prevent merging results',async()=>{
  const d=await calculateDignities(dignityReq),a=await calculateAccidentals(accReq);
  assert.throws(()=>mergeEvidence(d,a),/разным/);
  const req=clone(accReq);req.chart_id=d.chart_id;
  const matched=await calculateAccidentals(req);
  const joined=mergeEvidence(d,matched);
  assert.equal(joined.receptions.length,d.directional_receptions.length);
  assert.equal(joined.judgment_status,'NOT_PERFORMED');
  assert.equal(joined.evidence_source_versions.join(','),'1.1,1.2');
});
test('adapter preserves source chart SHA and does not round positions',()=>{
  const chart={schema_version:'1.0',chart_id:'test',source_chart_hash:fakeHash,planets:accReq.planets};
  const d=adaptDignityChart(chart,'DAY'),a=adaptAccidentalChart(chart,{returnTheme:true});
  assert.equal(d.source_chart_hash,fakeHash);
  assert.equal(a.source_chart_hash,fakeHash);
  assert.equal(d.planets[0].longitude_deg,accReq.planets[0].longitude_deg);
  assert.equal(a.context.return_theme,true);
});
test('solar sect follows geometry, not local hour; near horizon must be reviewed',()=>{
  const jd=2451545; // 2000-01-01T12:00:00Z
  const day=solarSect(jd,0,0,280.4,0);
  assert.equal(day.sect,'DAY');
  const night=solarSect(jd,0,180,280.4,0);
  assert.equal(night.sect,'NIGHT');
  // At equator, scan longitudes to find a solar altitude within ±0.5°.
  const borderline=Array.from({length:3600},(_,i)=>solarSect(jd,0,i/10-180,280.4,0))
    .find(x=>x.near_horizon_requires_review);
  assert.equal(borderline.sect,'UNRESOLVED');
});
test('integrated browser v2.1 adds evidence but preserves source chart and blocked verdict',async()=>{
  const scenario=JSON.parse(fs.readFileSync(new URL('./reference.json',import.meta.url),'utf8'))[0];
  const planetary={Sun:0,Moon:1,Mercury:2,Venus:3,Mars:4,Jupiter:5,Saturn:6};
  const reverse=Object.fromEntries(Object.entries(planetary).map(([k,v])=>[v,k]));
  const flags=4|256;
  const api={dateToJulianDay:x=>x.getTime()/86400000+2440587.5,
    calculateHouses:()=>({cusps:[0,...scenario.cusps],ascendant:scenario.ascendant,mc:scenario.mc}),
    calculatePosition:(jd,id)=>{const x=scenario.planets[reverse[id]],dt=jd-scenario.jd;
      return {longitude:x.longitude+x.longitudeSpeed*dt,latitude:x.latitude,longitudeSpeed:x.longitudeSpeed,flags};},
    version:()=> 'mock'};
  const payload={question_id:'test-integration',revision:1,raw_text:'Будет ли встреча?',context:'',question_owner_id:'я',speaker_id:'я',
    relay_mode:'direct',intent_kind:'EVENT',moment_local:scenario.moment.replace('Z','+00:00'),latitude_deg:scenario.latitude,
    longitude_deg:scenario.longitude,coordinate_source:'configured',house_system:'REGIOMONTANUS',method_profile:'frawley_early',
    house_path:[7],roles_locked:true};
  const rules=JSON.parse(fs.readFileSync(new URL('../rules_registry.json',import.meta.url),'utf8'));
  const result=await build(payload,api,{planet:planetary,moshier:4,flags,regiomontanus:'R'},rules);
  const e=result.evidence;
  assert.equal(result.chart.schema_version,'1.0');
  assert.equal(e.accidental.source_chart_hash,result.chart.source_chart_hash);
  assert.equal(e.accidental.chart_id,result.chart.chart_id);
  assert.equal(e.accidental.judgment_status,'NOT_PERFORMED');
  assert.equal(result.judgment.timing,null);
  assert.equal(result.judgment.judgment_status,'NOT_APPLICABLE');
  if(e.essential){
    assert.equal(e.essential.source_chart_hash,result.chart.source_chart_hash);
    assert.equal(e.joined.judgment_status,'NOT_PERFORMED');
    assert.equal(e.role_receptions.analysis_status,'EVIDENCE_ONLY_NO_VERDICT');
  }
});
