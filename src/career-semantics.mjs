/* v1.9 contract port. The pure gate does not certify the supplied registries.
 * Production callers must resolve expert approval independently of client JSON. */
import validators from './generated/semantic-validators.mjs';
export const CAREER_SCENARIOS={GET_JOB:'JOB_OBTAINED',ACCEPT_OFFER:'OFFER_SUITABILITY_SYMBOLIC',KEEP_JOB:'CURRENT_JOB_MAINTAINED',JOB_LOSS:'CURRENT_JOB_ENDED',CHANGE_JOB:'JOB_CHANGED',PROMOTION:'PROMOTION_GRANTED',COMPARE_JOBS:'JOB_OPTIONS_COMPARED',BOSS_RELATION:'BOSS_RELATION_ASSESSED',SALARY_OUTLOOK:'SALARY_CONDITIONS_ASSESSED',WAGE_PAYMENT:'PAYMENT_RECEIVED',WORK_CONDITIONS:'WORK_CONDITIONS_ASSESSED'};
const EVENTS=['GET_JOB','JOB_LOSS','CHANGE_JOB','PROMOTION','WAGE_PAYMENT'];
const STATES={GET_JOB:['UNEMPLOYED','EMPLOYED'],KEEP_JOB:['EMPLOYED'],JOB_LOSS:['EMPLOYED','NOTICE_GIVEN'],CHANGE_JOB:['EMPLOYED'],PROMOTION:['EMPLOYED'],COMPARE_JOBS:['EMPLOYED','UNEMPLOYED']};
const CONDITIONS=['ACCEPT_OFFER','KEEP_JOB','BOSS_RELATION','SALARY_OUTLOOK','WORK_CONDITIONS','COMPARE_JOBS'];
const PLANETS=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
export function evaluateCareerCase(c,{locked_roles:roles=null,trusted_evidence:records=[]}={}){
  if(!validators.validateCareerV19(c))throw Error('CAREER_CASE_SCHEMA_INVALID: '+JSON.stringify(validators.validateCareerV19.errors));
  const result=(status,reason,evidence=[],context={})=>({schema_version:'1.9',question_id:c.question_id,chart_id:c.chart_id,scenario_code:c.scenario_code,status,reason_codes:[reason],evidence_summary:evidence,house_context:context,can_issue_client_verdict:false,final_prediction:null,timing_prediction:null,limitations:['EVIDENCE_ONLY_NOT_REAL_WORLD_PREDICTION','FRAWLEY_2014_NOT_FULLY_VERIFIED','TRUSTED_INPUTS_REQUIRE_INDEPENDENT_SERVER_VERIFICATION']});
  const s=c.scenario_code;
  if(c.event_predicate!==CAREER_SCENARIOS[s])return result('NEEDS_CLARIFICATION','EVENT_PREDICATE_MISMATCH');
  if(c.v17_route!=null)return result('NEEDS_METHOD_REVIEW','V17_ROUTER_NOT_APPLICABLE_TO_CAREER');
  if(c.perspective!=='SELF')return result('NEEDS_EXPERT_REVIEW','THIRD_PARTY_TURNED_HOUSE_REQUIRED');
  if(STATES[s]&&!STATES[s].includes(c.employment_state))return result('NEEDS_CLARIFICATION','EMPLOYMENT_STATE_MISMATCH');
  if(c.employment_relation==='UNKNOWN')return result('NEEDS_CLARIFICATION','EMPLOYMENT_RELATION_UNKNOWN');
  if(!['EMPLOYEE','APPLICANT'].includes(c.employment_relation))return result('NEEDS_EXPERT_REVIEW','SERVICE_PROVIDER_OR_BUSINESS_RULES_REQUIRED');
  if(roles?.approved!==true)return result('NEEDS_ROLE_APPROVAL','ROLE_ASSIGNMENT_NOT_APPROVED');
  if(roles.question_id!==c.question_id||roles.chart_id!==c.chart_id)return result('NEEDS_ROLE_APPROVAL','ROLE_CONTEXT_MISMATCH');
  if(roles.method_profile!=='FRAWLEY_EARLY_PROVISIONAL')return result('NEEDS_METHOD_REVIEW','METHOD_PROFILE_MISMATCH');
  if(!PLANETS.includes(roles.querent)||!PLANETS.includes(roles.career))return result('NEEDS_ROLE_APPROVAL','INVALID_CORE_SIGNIFICATOR');
  if(roles.querent===roles.career)return result('NEEDS_EXPERT_REVIEW','SHARED_SIGNIFICATOR_UNRESOLVED');
  if(roles.career_house!==10)return result('NEEDS_METHOD_REVIEW','L10_REQUIRED_FOR_CAREER');
  if(roles.career_house_assigned_from!=='EXPERT_LOCKED')return result('NEEDS_ROLE_APPROVAL','ROLE_PROVENANCE_NOT_LOCKED');
  if(EVENTS.includes(s)&&(!c.outcome_criterion?.defined||!c.outcome_criterion?.expert_reviewed))return result('NEEDS_METHOD_REVIEW','EVENT_CRITERION_NOT_APPROVED');
  if(['CHANGE_JOB','COMPARE_JOBS'].includes(s)){
    if(!roles.alternative_role_approved)return result('NEEDS_EXPERT_REVIEW','ALTERNATIVE_JOB_ROLE_OPEN');
    if(!PLANETS.includes(roles.alternative_job)||[roles.career,roles.querent].includes(roles.alternative_job))return result('NEEDS_EXPERT_REVIEW','ALTERNATIVE_JOB_ROLE_COLLISION');
    if(!['EXPERT_CONTEXTUAL_NEXT_SIGN','EXPERT_MANUAL'].includes(roles.alternative_assignment_basis))return result('NEEDS_METHOD_REVIEW','ALTERNATIVE_ASSIGNMENT_BASIS_OPEN');
  }
  if(s==='PROMOTION'&&!roles.promotion_role_approved)return result('NEEDS_EXPERT_REVIEW','PROMOTION_ROLE_OPEN');
  if(s==='BOSS_RELATION'&&!roles.boss_role_approved)return result('NEEDS_EXPERT_REVIEW','BOSS_ROLE_OPEN');
  if(['SALARY_OUTLOOK','WAGE_PAYMENT'].includes(s)){
    if(c.money_context==='UNKNOWN')return result('NEEDS_CLARIFICATION','PAYMENT_SOURCE_UNKNOWN');
    if(c.money_context!=='EMPLOYER_PAYROLL')return result('NEEDS_EXPERT_REVIEW','CLIENT_OR_OWNER_PAYMENT_DIFFERENT_HOUSES');
    if(roles.employer_money_house!==11||roles.querent_money_house!==2)return result('NEEDS_METHOD_REVIEW','PAYROLL_HOUSE_MAPPING_MISMATCH');
  }
  if(['WORK_CONDITIONS','ACCEPT_OFFER'].includes(s)&&roles.sixth_as_job)return result('NEEDS_METHOD_REVIEW','L6_NOT_DEFAULT_JOB_SIGNIFICATOR');
  if(!c.evidence_refs.length)return result('EVIDENCE_INCOMPLETE','NO_REFERENCED_EVIDENCE');
  const catalog=new Map();
  for(const ev of records||[]){if(typeof ev.id!=='string'||catalog.has(ev.id))return result('UNTRUSTED_EVIDENCE','DUPLICATE_OR_INVALID_TRUSTED_ID');catalog.set(ev.id,ev);}
  const chosen=[];
  for(const id of c.evidence_refs){
    const e=catalog.get(id);
    if(!e||e.question_id!==c.question_id||e.chart_id!==c.chart_id)return result('UNTRUSTED_EVIDENCE','UNVERIFIED_OR_CROSS_CHART_EVIDENCE');
    if(e.kind==='PATH'){
      if(e.source_module!=='v1.6'||e.event_predicate!==c.event_predicate||!['SUPPORTED','BLOCKED','UNRESOLVED'].includes(e.expert_status))return result('UNTRUSTED_EVIDENCE','INVALID_PATH_SOURCE_OR_PREDICATE');
      if(['SUPPORTED','BLOCKED'].includes(e.expert_status)&&!e.reviewed_by)return result('UNTRUSTED_EVIDENCE','PATH_NO_EXPERT_REVIEW');
      if(e.expert_status==='BLOCKED'){
        if(!e.obstacle_evidence_id)return result('UNTRUSTED_EVIDENCE','BLOCKED_PATH_WITHOUT_OBSTACLE');
        const o=catalog.get(e.obstacle_evidence_id);
        if(e.obstacle_evidence_id===id||!o||o.question_id!==c.question_id||o.chart_id!==c.chart_id||!['PATH','CONDITION'].includes(o.kind))return result('UNTRUSTED_EVIDENCE','BLOCKED_PATH_OBSTACLE_REFERENCE_INVALID');
      }
    }else if(e.kind==='RECEPTION'){
      if(e.source_module!=='v1.1'||![e.from_role,e.toward_role].every(r=>['QUERENT','CAREER','EMPLOYER','ALTERNATIVE_JOB'].includes(r))||e.from_role===e.toward_role||!['POSITIVE','NEGATIVE','MIXED'].includes(e.polarity))return result('UNTRUSTED_EVIDENCE','INVALID_RECEPTION_DIRECTION');
    }else if(e.kind==='CONDITION'){
      if(!['v1.2','v1.3'].includes(e.source_module)||!e.condition_code)return result('UNTRUSTED_EVIDENCE','INVALID_CONDITION_SOURCE');
    }else return result('UNTRUSTED_EVIDENCE','UNKNOWN_EVIDENCE_KIND');
    chosen.push(structuredClone(e));
  }
  if(EVENTS.includes(s)&&!chosen.some(e=>e.kind==='PATH'))return result('EVIDENCE_INCOMPLETE','EVENT_PATH_REQUIRED');
  if(CONDITIONS.includes(s)&&!chosen.some(e=>['CONDITION','RECEPTION'].includes(e.kind)))return result('EVIDENCE_INCOMPLETE','CONDITION_OR_RECEPTION_REQUIRED');
  if(s==='BOSS_RELATION'&&!chosen.some(e=>e.kind==='RECEPTION'))return result('EVIDENCE_INCOMPLETE','BOSS_RECEPTION_REQUIRED');
  if(['SALARY_OUTLOOK','WAGE_PAYMENT'].includes(s)&&!chosen.some(e=>e.kind==='CONDITION'&&e.dimension==='EMPLOYER_FUNDS'))return result('EVIDENCE_INCOMPLETE','EMPLOYER_MONEY_CONTEXT_REQUIRED');
  if(['COMPARE_JOBS','CHANGE_JOB'].includes(s)){
    const dims=new Set(chosen.filter(e=>e.kind==='CONDITION').map(e=>e.dimension));
    if(!dims.has('CURRENT_JOB')||!dims.has('ALTERNATIVE_JOB'))return result('EVIDENCE_INCOMPLETE','BOTH_JOB_CONDITIONS_REQUIRED');
  }
  if(s==='ACCEPT_OFFER'&&!chosen.some(e=>e.dimension==='JOB_QUALITY'))return result('EVIDENCE_INCOMPLETE','OFFER_QUALITY_EVIDENCE_REQUIRED');
  const summary=chosen.map(e=>{
    const v={evidence_id:e.id,kind:e.kind,source_module:e.source_module};
    if(e.kind==='PATH')Object.assign(v,{path_id:e.path_id??null,expert_status:e.expert_status});
    if(e.kind==='RECEPTION')Object.assign(v,{from_role:e.from_role,toward_role:e.toward_role,polarity:e.polarity});
    if(e.kind==='CONDITION')Object.assign(v,{condition_code:e.condition_code,dimension:e.dimension??null});
    return v;
  });
  const context={career_house:10};
  if(['SALARY_OUTLOOK','WAGE_PAYMENT'].includes(s))Object.assign(context,{employer_money_house:11,querent_money_house:2});
  return result('EVIDENCE_REVIEW_ONLY','NO_AUTOMATED_CAREER_VERDICT',summary,context);
}
