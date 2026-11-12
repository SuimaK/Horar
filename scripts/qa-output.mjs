import fs from 'node:fs';
import {build} from '../src/engine.mjs';
const s=JSON.parse(fs.readFileSync(new URL('../tests/reference.json',import.meta.url)))[0];
const rules=JSON.parse(fs.readFileSync(new URL('../rules_registry.json',import.meta.url)));
const P={Sun:0,Moon:1,Mercury:2,Venus:3,Mars:4,Jupiter:5,Saturn:6};
const inv=Object.fromEntries(Object.entries(P).map(([a,b])=>[b,a]));
const api={
  dateToJulianDay(dt){return dt.getTime()/86400000+2440587.5},
  calculateHouses(){return {cusps:[0,...s.cusps],ascendant:s.ascendant,mc:s.mc}},
  calculatePosition(jd,id){const p=s.planets[inv[id]],delta=jd-s.jd;return {longitude:p.longitude+p.longitudeSpeed*delta,latitude:p.latitude,longitudeSpeed:p.longitudeSpeed,flags:260}},
  version(){return '2.10.03 mock'}
};
const inp={question_id:'reference-qa',revision:1,raw_text:'Будет ли встреча?',context:'',question_owner_id:'я',speaker_id:'я',relay_mode:'direct',intent_kind:'EVENT',moment_local:s.moment.replace('Z','+00:00'),latitude_deg:s.latitude,longitude_deg:s.longitude,coordinate_source:'configured',house_system:'REGIOMONTANUS',method_profile:'frawley_early',house_path:[7],roles_locked:true};
const result=await build(inp,api,{planet:P,moshier:4,flags:260,regiomontanus:'R'},rules);
fs.writeFileSync(new URL('../tests/generated-output.json',import.meta.url),JSON.stringify(result,null,2));
console.log('Client output generated for schema QA');
