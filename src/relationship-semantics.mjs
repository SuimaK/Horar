import validators from './generated/semantic-validators.mjs';
export const RELATIONSHIP_SCENARIOS={FEELINGS:'ATTITUDE_SYMBOLIC',MUTUALITY:'MUTUAL_ATTITUDE_SYMBOLIC',RELATIONSHIP_START:'RELATIONSHIP_STARTED',RELATIONSHIP_CONTINUATION:'RELATIONSHIP_MAINTAINED',SEPARATION:'RELATIONSHIP_ENDED',RECONCILIATION:'RELATIONSHIP_RESUMED',RETURN_TO_RELATIONSHIP:'RELATIONSHIP_RESUMED',RELATIONSHIP_QUALITY:'RELATIONSHIP_QUALITY_ASSESSED'};
const INITIAL={RELATIONSHIP_START:'NEVER_STARTED',RELATIONSHIP_CONTINUATION:'CURRENT',SEPARATION:'CURRENT',RECONCILIATION:'SEPARATED',RETURN_TO_RELATIONSHIP:'SEPARATED'};
const PLANETS=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
const PAIR_SCENARIOS=['RECONCILIATION','RETURN_TO_RELATIONSHIP'];
export function evaluateRelationshipCase(c,{locked_roles:roles=null,trusted_evidence:evidence=[]}={}){
  if(!validators.validateRelationshipV18(c))throw Error('CASE_SCHEMA_INVALID: '+JSON.stringify(validators.validateRelationshipV18.errors));
  const result=(status,reason,summary=[])=>({schema_version:'1.8',question_id:c.question_id,chart_id:c.chart_id,scenario_code:c.scenario_code,status,reason_codes:[reason],evidence_summary:summary,can_issue_client_verdict:false,final_prediction:null,timing_prediction:null,limitations:['RELATIONSHIP_SYMBOLISM_NOT_VERIFIED_HUMAN_FEELINGS','NO_INDEPENDENT_REAL_WORLD_OUTCOME_VALIDATION','FRAWLEY_2014_NOT_FULLY_VERIFIED']});
  const s=c.scenario_code;
  if(c.event_predicate!==RELATIONSHIP_SCENARIOS[s])return result('NEEDS_CLARIFICATION','SCENARIO_PREDICATE_MISMATCH');
  if(INITIAL[s]&&c.relationship_state!==INITIAL[s])return result('NEEDS_CLARIFICATION','RELATIONSHIP_STATE_NOT_SUITABLE');
  if(!['SPOUSE','EX_SPOUSE','ROMANTIC_PARTNER','EX_ROMANTIC_PARTNER','POTENTIAL_PARTNER'].includes(c.relationship_kind))return result('NEEDS_EXPERT_REVIEW','OTHER_HOUSE_SIGNIFICATOR_POSSIBLE');
  if((c.third_party_count||0)>0)return result('NEEDS_EXPERT_REVIEW','MULTIPLE_SEVENTH_HOUSE_PEOPLE');
  if(!roles?.approved)return result('NEEDS_ROLE_APPROVAL','ROLES_NOT_LOCKED');
  if(roles.question_id!==c.question_id||roles.chart_id!==c.chart_id)return result('NEEDS_ROLE_APPROVAL','ROLE_CONTEXT_MISMATCH');
  if(roles.relationship_kind!==c.relationship_kind)return result('NEEDS_ROLE_APPROVAL','ROLE_RELATIONSHIP_MISMATCH');
  if(roles.querent===roles.quesited)return result('NEEDS_EXPERT_REVIEW','SAME_PLANET_ROLE_COLLISION');
  if(![roles.querent,roles.quesited].every(p=>PLANETS.includes(p)))return result('NEEDS_ROLE_APPROVAL','INVALID_LOCKED_PLANET');
  if(INITIAL[s]&&(!c.outcome_criterion?.defined||!c.outcome_criterion?.expert_reviewed))return result('NEEDS_METHOD_REVIEW','EVENT_OUTCOME_CRITERION_OPEN');
  if(c.v17_route){
    if(!PAIR_SCENARIOS.includes(s)||c.v17_route.intent_code!==s)return result('NEEDS_CLARIFICATION','V17_INTENT_MISMATCH');
    if(c.v17_route.status!=='TOPIC_MODULE_REQUIRED')return result('NEEDS_EXPERT_REVIEW','V17_GATE_STATUS_UNEXPECTED');
  }else if(PAIR_SCENARIOS.includes(s))return result('NEEDS_METHOD_REVIEW','V17_ROUTE_EVIDENCE_MISSING');
  const idx=new Map();
  for(const e of evidence||[]){if(idx.has(e.id))return result('UNTRUSTED_EVIDENCE','DUPLICATE_TRUSTED_EVIDENCE_ID');idx.set(e.id,e);}
  if(!c.evidence_refs.length)return result('EVIDENCE_INCOMPLETE','NO_REFERENCED_EVIDENCE');
  const chosen=[];
  for(const id of c.evidence_refs){
    const e=idx.get(id);
    if(!e||e.chart_id!==c.chart_id||e.question_id!==c.question_id)return result('UNTRUSTED_EVIDENCE','UNVERIFIED_OR_CROSS_CHART_EVIDENCE');
    if(e.kind==='RECEPTION'){
      if(e.source_module!=='v1.1'||![e.from_role,e.toward_role].every(r=>['QUERENT','QUESITED'].includes(r)))return result('UNTRUSTED_EVIDENCE','RECEPTION_SOURCE_OR_ROLE_INVALID');
      if(e.from_role===e.toward_role||!['POSITIVE','NEGATIVE','MIXED'].includes(e.polarity))return result('UNTRUSTED_EVIDENCE','RECEPTION_DIRECTION_INVALID');
    }else if(e.kind==='PATH'){
      if(e.source_module!=='v1.6'||e.event_predicate!==c.event_predicate)return result('UNTRUSTED_EVIDENCE','PATH_SOURCE_OR_PREDICATE_INVALID');
      if(!['SUPPORTED','BLOCKED','UNRESOLVED'].includes(e.expert_status))return result('UNTRUSTED_EVIDENCE','PATH_REVIEW_STATUS_INVALID');
      if(['SUPPORTED','BLOCKED'].includes(e.expert_status)&&!e.reviewed_by)return result('UNTRUSTED_EVIDENCE','PATH_NO_EXPERT_REVIEW');
      if(e.expert_status==='BLOCKED'&&!e.obstacle_evidence_id)return result('UNTRUSTED_EVIDENCE','BLOCKED_PATH_WITHOUT_OBSTACLE');
    }else if(e.kind==='CONDITION'){
      if(!['v1.2','v1.3'].includes(e.source_module))return result('UNTRUSTED_EVIDENCE','CONDITION_SOURCE_INVALID');
    }else return result('UNTRUSTED_EVIDENCE','EVIDENCE_KIND_INVALID');
    chosen.push(e);
  }
  const rec=chosen.filter(e=>e.kind==='RECEPTION'),paths=chosen.filter(e=>e.kind==='PATH'),conditions=chosen.filter(e=>e.kind==='CONDITION');
  if(['FEELINGS','MUTUALITY'].includes(s)&&!rec.length)return result('EVIDENCE_INCOMPLETE','RECEPTION_EVIDENCE_REQUIRED');
  if(s==='FEELINGS'&&!rec.some(e=>e.from_role==='QUESITED'&&e.toward_role==='QUERENT'))return result('EVIDENCE_INCOMPLETE','QUESITED_TO_QUERENT_RECEPTION_REQUIRED');
  if(s==='MUTUALITY'&&new Set(rec.map(e=>e.from_role)).size<2)return result('EVIDENCE_INCOMPLETE','BOTH_RECEPTION_DIRECTIONS_REQUIRED');
  if(INITIAL[s]&&s!=='RELATIONSHIP_CONTINUATION'&&!paths.length)return result('EVIDENCE_INCOMPLETE','EVENT_PATH_REVIEW_REQUIRED');
  if(s==='RELATIONSHIP_CONTINUATION'&&!conditions.length&&!rec.length)return result('EVIDENCE_INCOMPLETE','CONTINUATION_STATE_EVIDENCE_REQUIRED');
  if(s==='RELATIONSHIP_QUALITY'&&!conditions.length)return result('EVIDENCE_INCOMPLETE','CONDITION_EVIDENCE_REQUIRED');
  if(s==='RELATIONSHIP_QUALITY'&&!rec.length)return result('EVIDENCE_INCOMPLETE','RELATIONSHIP_RECEPTION_EVIDENCE_REQUIRED');
  const summary=chosen.map(e=>{
    const r={evidence_id:e.id,kind:e.kind,source_module:e.source_module};
    if(e.kind==='RECEPTION')Object.assign(r,{from_role:e.from_role,toward_role:e.toward_role,polarity:e.polarity});
    if(e.kind==='PATH')Object.assign(r,{path_id:e.path_id??null,expert_status:e.expert_status,event_predicate:e.event_predicate});
    if(e.kind==='CONDITION')r.condition_code=e.condition_code??null;
    return r;
  });
  return result('EVIDENCE_REVIEW_ONLY','NO_AUTOMATED_RELATIONSHIP_VERDICT',summary);
}
