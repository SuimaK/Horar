import validators from './generated/semantic-validators.mjs';
export const PREDICATES={INBOUND_PERSONAL_MESSAGE:'MESSAGE_RECEIVED',PERSONAL_MEETING:'SAME_PLACE_IN_PERSON',PERSONAL_CONTACT:'TWO_WAY_CONTACT_ESTABLISHED',REPLY_TO_SENT_MESSAGE:'MESSAGE_RECEIVED',CONTACT_RESUMPTION:'TWO_WAY_CONTACT_ESTABLISHED',RECONCILIATION:'RELATIONSHIP_RESUMED',RETURN_TO_SHARED_HOME:'PHYSICAL_ARRIVAL',RETURN_TO_RELATIONSHIP:'RELATIONSHIP_RESUMED',VISITOR_ARRIVAL:'PHYSICAL_ARRIVAL',DELIVERY_OF_ITEM:'DELIVERY_RECEIVED',LOST_OR_MISSING_PERSON:'PHYSICAL_ARRIVAL'};
export const LEGACY_KINDS={INBOUND_PERSONAL_MESSAGE:'MESSAGE_FROM_NAMED_PERSON',PERSONAL_MEETING:'MEETING_WITH_NAMED_PERSON',PERSONAL_CONTACT:'CONTACT_WITH_NAMED_PERSON'};
export function routeQuestion(request){
  if(!validators.validateIntentV17(request))throw Error('QUESTION_INTENT_SCHEMA_INVALID: '+JSON.stringify(validators.validateIntentV17.errors));
  const result=(status,reason,payload=null)=>({schema_version:'1.7',question_id:request.question_id,intent_code:request.intent_code,event_predicate:request.event_predicate,status,reason_codes:[reason],legacy_v16_request:payload,can_issue_client_verdict:false,final_prediction:null,timing_prediction:null,limitations:['ROUTER_IS_NOT_ASTROLOGICAL_JUDGEMENT','FRAWLEY_2014_METHOD_NOT_FULLY_VERIFIED']});
  const kind=request.intent_code;
  if(request.event_predicate==='UNKNOWN')return result('NEEDS_CLARIFICATION','EVENT_PREDICATE_NOT_DEFINED');
  if(request.event_predicate!==PREDICATES[kind])return result('NEEDS_CLARIFICATION','EVENT_PREDICATE_MISMATCH');
  if(kind==='LOST_OR_MISSING_PERSON')return result('OUTSIDE_AUTOMATION_SCOPE','MISSING_PERSON_SAFETY_ESCALATION');
  if(!Object.hasOwn(LEGACY_KINDS,kind))return result('TOPIC_MODULE_REQUIRED','SCENARIO_NOT_IMPLEMENTED_V16');
  if(request.relationship_kind!=='UNRELATED_NAMED_PERSON')return result('NEEDS_EXPERT_REVIEW','RELATIONSHIP_HOUSE_ASSIGNMENT_NOT_APPROVED');
  if(request.role_approval?.approved!==true||request.role_approval?.method_profile!=='FRAWLEY_EARLY_PROVISIONAL')return result('NEEDS_EXPERT_REVIEW','L1_L7_ASSIGNMENT_NOT_LOCKED');
  const old=request.legacy_payload;
  if(old==null)return result('NEEDS_CLARIFICATION','CHART_INPUT_REQUIRED');
  if(old.question_kind!==LEGACY_KINDS[kind])return result('NEEDS_CLARIFICATION','LEGACY_QUESTION_KIND_MISMATCH');
  if(old.relationship_kind!=='UNRELATED_NAMED_PERSON'||old.approve_l1_l7!==true)return result('NEEDS_EXPERT_REVIEW','LEGACY_ROLE_APPROVAL_MISMATCH');
  if(request.question_id!==old.question_id)return result('NEEDS_CLARIFICATION','QUESTION_ID_MISMATCH');
  if(['chart_id','moment_utc','latitude_deg','longitude_deg','house_system','horizon_days','question_provenance'].some(k=>!Object.hasOwn(old,k)))return result('NEEDS_CLARIFICATION','INCOMPLETE_LEGACY_CHART_INPUT');
  if(old.question_provenance!==request.question_provenance)return result('NEEDS_CLARIFICATION','PROVENANCE_MISMATCH');
  const validDate=typeof old.moment_utc==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(old.moment_utc)&&Number.isFinite(Date.parse(old.moment_utc));
  if(!validDate||![old.latitude_deg,old.longitude_deg,old.horizon_days].every(x=>typeof x==='number'&&Number.isFinite(x))||Math.abs(old.latitude_deg)>90||Math.abs(old.longitude_deg)>180||old.horizon_days<1||old.horizon_days>30||typeof old.house_system!=='string'||!old.house_system.trim())return result('NEEDS_CLARIFICATION','LEGACY_CHART_INPUT_INVALID');
  return result('READY_FOR_V16_EVIDENCE_ONLY','LOCKED_INTENT_AND_ROLES',structuredClone(old));
}
