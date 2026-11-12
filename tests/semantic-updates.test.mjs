import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeQuestion} from '../src/scenario-router.mjs';
import {evaluateRelationshipCase} from '../src/relationship-semantics.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('./fixtures/'+name,import.meta.url)));
const expected=read('v17_v18_expected.json');
for(const [version,file,fn] of [['1_7','route_cases_v17.json',routeQuestion],['1_8','relationship_cases_v18.json',i=>evaluateRelationshipCase(i.case,{locked_roles:i.locked_roles,trusted_evidence:i.trusted_evidence})]]){
 const cases=read(file).cases;
 test(`v${version}: every supplied synthetic case matches the full Python result`,()=>{
  for(const c of cases){
   const exp=expected[version].find(x=>x.id===c.id),before=structuredClone(c.input);
   if(exp.error)assert.throws(()=>fn(c.input),undefined,c.id);else assert.deepEqual(fn(c.input),exp.output,c.id);
   assert.deepEqual(c.input,before,c.id+' input changed');
  }
 });
}
