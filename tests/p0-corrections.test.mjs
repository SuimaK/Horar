import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateDignitiesPartial,calculateDignities,dignityAt} from '../src/evidence.mjs';
import {contactCandidates} from '../src/engine.mjs';

const names=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
const positions={Sun:0,Moon:102,Mercury:60,Venus:12,Mars:180,Jupiter:12,Saturn:90};
const chart={schema_version:'1.0',chart_id:'p0-horizon:r1',
  source_chart_hash:'a'.repeat(64),
  planets:names.map(name=>({name,longitude_deg:positions[name]}))};

test('P0 sect unresolved keeps domicile, exaltation, terms, faces, detriment and fall',async()=>{
  const d=await calculateDignitiesPartial(chart,'UNRESOLVED');
  assert.equal(d.schema_version,'2.0.1');
  assert.equal(d.judgment_status,'NOT_PERFORMED');
  assert.equal(d.can_issue_client_verdict,false);
  assert.equal(d.placements.length,7);
  const by=Object.fromEntries(d.placements.map(p=>[p.planet,p]));
  assert.equal(by.Venus.dignity_owners.domicile,'Mars');
  assert.equal(by.Venus.dignity_owners.exaltation,'Sun');
  assert.equal(by.Venus.dignity_owners.term,'Venus');
  assert.equal(by.Venus.triplicity.status,'AMBIGUOUS');
  assert.deepEqual(by.Venus.triplicity.possible_owners,['Sun','Jupiter']);
  assert.equal(by.Venus.dignity_owners.triplicity,null);
  assert.equal(by.Moon.triplicity.status,'INVARIANT');
  assert.equal(by.Moon.triplicity.owner,'Mars');
  assert.equal(by.Mars.dignity_owners.detriment,'Mars');
  assert.equal(by.Mars.peregrine_frawley,false);
  assert.equal(by.Jupiter.positive_dignity_unknown,true);
  assert.equal(by.Jupiter.peregrine_frawley,null);
  assert.ok(d.directional_receptions.some(r=>r.from_planet==='Venus'&&r.to_planet==='Mars'&&
    r.dignity_kind==='domicile'&&r.certainty==='CERTAIN'));
  assert.ok(d.directional_receptions.some(r=>r.from_planet==='Venus'&&r.to_planet==='Jupiter'&&
    r.dignity_kind==='triplicity'&&r.certainty==='SECT_DEPENDENT'));
});

test('P0 unresolved-credentials reject forged chart IDs and retain input',async()=>{
  const original=JSON.stringify(chart);
  await assert.rejects(()=>calculateDignitiesPartial({...chart,source_chart_hash:'wrong'},'UNRESOLVED'));
  await assert.rejects(()=>calculateDignitiesPartial({...chart,planets:[...chart.planets,chart.planets[0]]},'UNRESOLVED'));
  assert.equal(JSON.stringify(chart),original);
});

test('P0 strict 1.1 API still requires a definite sect',()=>{
  assert.throws(()=>dignityAt(12,'UNRESOLVED'),/DAY\/NIGHT/);
});

function mockMoving({sun,moon,moonSpeed,others={}}){
  const fixed={Mercury:73,Venus:129,Mars:178,Jupiter:235,Saturn:293,...others};
  function position(jd,name){
    if(name==='Sun')return {longitude_deg:sun(jd),speed_deg_per_day:0};
    if(name==='Moon')return {longitude_deg:moon(jd),speed_deg_per_day:moonSpeed(jd)};
    return {longitude_deg:fixed[name],speed_deg_per_day:0};
  }
  return {position,positions:jd=>Object.fromEntries(names.map(n=>[n,position(jd,n)]))};
}
const pair=events=>events.find(x=>x.a==='Sun'&&x.b==='Moon');

test('P0 ingress AFTER exact aspect but in same 3h bin is not a prior event',()=>{
  const astro=mockMoving({sun:()=>29.9,moon:t=>28.5+30*t,moonSpeed:()=>30});
  const hit=pair(contactCandidates(astro,0,.125,.125));
  assert.ok(hit,'Expected exact conjunction before sign ingress');
  assert.equal(hit.aspect,'CONJUNCTION');
  assert.ok(hit.days<.05);
  assert.equal(hit.sign_change,false);
  assert.equal(hit.station_review,false);
});

test('P0 ingress BEFORE exact aspect remains a prior event',()=>{
  const astro=mockMoving({sun:()=>30.2,moon:t=>29+30*t,moonSpeed:()=>30});
  const hit=pair(contactCandidates(astro,0,.125,.125));
  assert.ok(hit);
  assert.equal(hit.aspect,'CONJUNCTION');
  assert.ok(hit.days>.033);
  assert.equal(hit.sign_change,true);
});

test('P0 station AFTER exact conjunction in same 3h bin is not a prior station',()=>{
  const astro=mockMoving({
    sun:()=>10,
    moon:t=>9+30*t-200*Math.max(0,t-.04)**2,
    moonSpeed:t=>t<=.04?30:30-400*(t-.04)
  });
  const hit=pair(contactCandidates(astro,0,.125,.125));
  assert.ok(hit);
  assert.equal(hit.aspect,'CONJUNCTION');
  assert.ok(hit.days<.04);
  assert.equal(hit.station_review,false);
});

test('P0 geometry never authorizes final event verdict',async()=>{
  const result=await calculateDignitiesPartial(chart,'UNRESOLVED');
  assert.equal(result.can_issue_client_verdict,false);
  assert.equal(result.judgment_status,'NOT_PERFORMED');
});
