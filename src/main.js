import { SwissEphemeris, Planet, HouseSystem, CalculationFlag } from '@swisseph/browser';
import rules from '../rules_registry.json';
import { build } from './engine.mjs';

// All calculations stay on the phone. This is not an API client.
const swiss = new SwissEphemeris();
let initialized;
const path = `${import.meta.env.BASE_URL}assets/swisseph.wasm`;
function ready() {
  if(!initialized)initialized=swiss.init(path).catch(e=>{
    initialized=null;
    throw new Error(`Не удалось загрузить локальные эфемериды: ${e.message||e}`);
  });
  return initialized;
}
window.horaryBuild = async payload => {
  await ready();
  return build(payload,swiss,{
    planet:Planet,
    regiomontanus:HouseSystem.Regiomontanus,
    flags:CalculationFlag.MoshierEphemeris | CalculationFlag.Speed,
    moshier:CalculationFlag.MoshierEphemeris
  },rules);
};
// UI event listeners; preserves the existing archive key and JSON backups.
import '../app.js';
