import fs from 'node:fs';
import {SwissEphemeris,Planet,HouseSystem,CalculationFlag} from '@swisseph/browser';
export const rules=JSON.parse(fs.readFileSync(new URL('../../rules_registry.json',import.meta.url)));
export const constants={planet:Planet,regiomontanus:HouseSystem.Regiomontanus,flags:CalculationFlag.MoshierEphemeris|CalculationFlag.Speed,moshier:CalculationFlag.MoshierEphemeris};
export async function loadSwiss(){
 const swe=new SwissEphemeris();
 const bytes=fs.readFileSync(new URL('../../node_modules/@swisseph/browser/dist/swisseph.wasm',import.meta.url));
 await swe.init('data:application/wasm;base64,'+bytes.toString('base64'));
 return swe;
}
export const payload={question_id:'demo-london',question_provenance:'DEMONSTRATION_NOT_ACTUAL_QUESTION',revision:1,raw_text:'Учебный пример: будет ли сообщение от человека?',context:'Синтетический вопрос с реальными эфемеридами; исход неизвестен.',question_owner_id:'я',speaker_id:'я',relay_mode:'direct',intent_kind:'CONTACT',moment_local:'2025-01-20T12:00:00+00:00',latitude_deg:51.5074,longitude_deg:-.1278,house_system:'REGIOMONTANUS',method_profile:'frawley_early',house_path:[7],roles_locked:true,contact_options:{question_kind:'MESSAGE_FROM_NAMED_PERSON',relationship_kind:'UNRELATED_NAMED_PERSON',approve_l1_l7:true,horizon_days:14}};
