import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assembleRoleEvidence,liveGate} from '../src/assembly.mjs';
const f=JSON.parse(fs.readFileSync(new URL('./fixtures/assembly_v13.json',import.meta.url)));
test('v1.3 full assembly matches the supplied Python reference',()=>{
  assert.deepEqual(assembleRoleEvidence(f.dig,f.acc,f.roles,f.rec),f.out);
});
test('v1.3 rejects cross-chart evidence, collisions and role/reception mismatch',()=>{
  assert.throws(()=>assembleRoleEvidence(f.dig,{...f.acc,source_chart_hash:'other'},f.roles,f.rec),/хэш/);
  assert.throws(()=>assembleRoleEvidence(f.dig,f.acc,{...f.roles,roles_locked:false},f.rec),/подтверждены/);
  const bad=structuredClone(f.rec);bad.reception_evidence_by_actor[0].from_planet='INVALID';
  assert.throws(()=>assembleRoleEvidence(f.dig,f.acc,f.roles,bad),/Рецепции/);
});
test('v1.3 live gate never trusts a symbolic YES or asserted complete coverage',()=>{
  for(const all_channels_covered of [false,true])for(const semantic_perfection_review_complete of [false,true]){
    const g=liveGate({roles_locked:true,trace_recomputed_from_chart:true,all_channels_covered,semantic_perfection_review_complete,judgment_status:'YES'});
    assert.equal(g.can_issue_client_verdict,false);
  }
  assert.equal(liveGate({roles_locked:false}).status,'NEEDS_ROLE_REVIEW');
});
