import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readableWheel,readableInterpretation} from '../src/ux-readable.mjs';
import {findCities,findCityForLiveGps,offsetForLocalMoment,selectLocationCoordinates} from '../src/city-lookup.mjs';

const names=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
const chart={schema_version:'1.0',chart_id:'test:r1',
  planets:names.map((name,i)=>({name,longitude_deg:112+i*.01,speed_deg_per_day:i===2?-1:1,house:4})),
  cusps:Array.from({length:12},(_,i)=>({house:i+1,longitude_deg:i*30}))};
const sample={chart,current_aspects:[{planet_a:'Sun',planet_b:'Moon',aspect:'CONJUNCTION',sign_compatible:true}]};
const mockFetch=body=>async (url)=>{
  assert.match(url,/^https:\/\//);
  return {ok:true,json:async()=>body};
};

test('UX-WHEEL: labels do not overlap even with seven planets at nearly identical longitudes',()=>{
  const dom=new JSDOM(readableWheel(sample));
  const doc=dom.window.document,svg=doc.querySelector('svg');
  assert.equal(svg.getAttribute('viewBox'),'0 0 520 520');
  const markers=[...doc.querySelectorAll('circle[r="21"]')];
  assert.equal(markers.length,7);
  const pts=markers.map(c=>[Number(c.getAttribute('cx')),Number(c.getAttribute('cy'))]);
  for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
    const distance=Math.hypot(pts[i][0]-pts[j][0],pts[i][1]-pts[j][1]);
    assert.ok(distance>41,'label circles overlap at '+i+' '+j+': '+distance);
  }
  assert.equal(doc.querySelectorAll('circle[r="3.7"]').length,7);
  assert.equal(doc.querySelectorAll('path[stroke-opacity]').length,0);
  assert.match(svg.getAttribute('aria-label'),/точк/i);
  dom.window.close();
});
test('UX-WHEEL: aspects are optional and exact positions are preserved',()=>{
  const plain=readableWheel(sample),withAspects=readableWheel(sample,{showAspects:true});
  assert.doesNotMatch(plain,/stroke="#6c8391"/);
  assert.match(withAspects,/stroke="#6c8391"/);
  assert.equal(chart.planets[0].longitude_deg,112);
});
test('UX-READING: paragraphs distinguish facts from unapproved verdicts',()=>{
  const evidence={schema_version:'2.0.1',sect_resolution:{status:'UNRESOLVED'},role_receptions:[
    {from_actor:'me',to_actor:'other',evidence:[{evidence_certainty:'CERTAIN'}]}
  ],geometry:{contacts:[{aspect:'TRINE',status:'AFTER_INGRESS_REVIEW'}]}};
  const result={...sample,
    roles:{assignments:[{radical_house:1,effective_significator:'Mars'},
      {radical_house:7,effective_significator:'Venus'}]},
    evidence:{method_correction:evidence},
    judgment:{processing_status:'NEEDS_EXPERT_REVIEW'}};
  const html=readableInterpretation(result,{intent_kind:'RELATIONSHIP'});
  assert.match(html,/Что показывает карта/);
  assert.match(html,/вблизи горизонта|около горизонта/);
  assert.match(html,/после смены знака/);
  assert.match(html,/нельзя обоснованно ответить/);
  assert.match(html,/не доказывают реальные чувства/);
  assert.doesNotMatch(html,/итоговый прогноз готов/i);
});
test('UX-CITY: city search returns validated timezone, coordinates and rejects invalid entries',async()=>{
  const calls=[];
  const fetcher=async url=>{calls.push(url);return {ok:true,json:async()=>({results:[
    {name:'Берлин',admin1:'Берлин',country:'Германия',latitude:52.52,longitude:13.405,timezone:'Europe/Berlin'},
    {name:'bad',latitude:Infinity,longitude:3},
  ]})};};
  const items=await findCities('Берлин',fetcher);
  assert.equal(items.length,1);
  assert.equal(items[0].place_label,'Берлин, Берлин, Германия');
  assert.equal(items[0].timezone,'Europe/Berlin');
  assert.equal(selectLocationCoordinates(items[0].latitude_deg,items[0].longitude_deg).longitude_deg,13.405);
  assert.match(calls[0],/geocoding-api\.open-meteo\.com/);
  await assert.rejects(findCities(' ',fetcher),/двух букв/);
  assert.throws(()=>selectLocationCoordinates(66,10),/65/);
});
test('UX-CITY: GPS reverse city uses only supplied live coordinates',async()=>{
  let actual;
  const result=await findCityForLiveGps(48.8566,2.3522,async url=>{
    actual=url;return {ok:true,json:async()=>({city:'Париж',countryName:'Франция'})};
  });
  assert.equal(result.place_label,'Париж, Франция');
  assert.match(actual,/latitude=48.8566/);
  assert.match(actual,/longitude=2.3522/);
});
test('UX-TIME: time-zone offset uses moment date, not current DST',()=>{
  assert.equal(offsetForLocalMoment('2026-01-20T12:00:00','Europe/Berlin'),'+01:00');
  assert.equal(offsetForLocalMoment('2026-07-20T12:00:00','Europe/Berlin'),'+02:00');
  assert.equal(offsetForLocalMoment('2026-01-20T12:00:00','Europe/Moscow'),'+03:00');
  assert.equal(offsetForLocalMoment('2026-01-20T12:00:00','Untrusted/Bad'),null);
});
