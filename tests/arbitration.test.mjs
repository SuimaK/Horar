import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {arbitrateEvidence,judgePath} from '../src/path-arbitration.mjs';
import {build} from '../src/engine.mjs';
import {loadSwiss,payload,constants,rules} from './helpers/live-demo.mjs';
const swe=await loadSwiss(),r=await build(payload,swe,constants,rules);
const jd=swe.dateToJulianDay(new Date(r.chart.moment_utc));
const astro={position(jd,name){const p=swe.calculatePosition(jd,constants.planet[name],constants.flags);return {longitude_deg:p.longitude,speed_deg_per_day:p.longitudeSpeed};}};
const opts={astro,jd,roleAssembly:r.evidence.role_assembly};
test('v1.6 real numerical pathways match the full Python arbitration result',async()=>{
 const expected=JSON.parse(fs.readFileSync(new URL('./fixtures/arbitration_v16_expected.json',import.meta.url)));
 assert.deepEqual(await arbitrateEvidence(r.contact_evidence,opts),expected);
});
test('v1.6 rejects unknown path IDs, fake contacts and incomplete review context',async()=>{
 const base={path_id:'fake',assessment:'SUPPORTS_PATH',reviewer_id:'declared-reviewer',rationale:'This is a sufficiently long declared rationale.',blind_to_outcome:true,receptions_considered:true,capacity_considered:true,interventions:[]};
 await assert.rejects(arbitrateEvidence(r.contact_evidence,{...opts,reviews:[base]}),/Unknown/);
 const bad=structuredClone(r.contact_evidence);bad.analysis.direct_candidates[0].event_id='Moon:Mars:120:5.4956620';
 await assert.rejects(arbitrateEvidence(bad,opts),/locked roles/);
 const original=await arbitrateEvidence(r.contact_evidence,opts),first=original.paths[0];
 const reviewed=await arbitrateEvidence(r.contact_evidence,{...opts,reviews:[{...base,path_id:first.path_id}]});
 assert.equal(reviewed.paths[0].review_result,'UNRESOLVED');
 assert.equal(reviewed.final_prediction,null);assert.equal(reviewed.can_issue_client_verdict,false);
});
test('v1.6 a complete declared assessment is distinct from a forecast or verified identity',()=>{
 const p={path_id:'direct-demo',required_intervention_ids:[],sign_change_planets:[],stations_before:[],issues:[]};
 const review={assessment:'SUPPORTS_PATH',reviewer_id:'self-declared',rationale:'Independent review rationale for a synthetic case.',blind_to_outcome:true,receptions_considered:true,capacity_considered:true,interventions:[]};
 assert.equal(judgePath(p,review).review_result,'EXPERT_ATTESTED_SUPPORTED');
 assert.equal(judgePath(p,{...review,blind_to_outcome:false}).review_result,'UNRESOLVED');
 assert.equal(judgePath(p,{...review,assessment:'BLOCKS_PATH'}).review_result,'UNRESOLVED');
 const station={...p,stations_before:[{day_offset:.1}]};
 assert.equal(judgePath(station,{...review,station_assessment:'PREVENTS'}).review_result,'UNRESOLVED');
});
