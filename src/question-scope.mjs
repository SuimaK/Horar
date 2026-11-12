// Explicit scope is authoritative; text matching is an additional conservative
// check, not a claim that every sensitive formulation can be recognized.
export const SENSITIVE_TOPICS=['STANDARD','MEDICAL','LIFE_SAFETY','MISSING_PERSON','CRIMINAL_LEGAL'];
const messages={
  MEDICAL:'Медицинский вопрос: событийный прогноз и сроки отключены. Диагноз, лечение и исход операции оцениваются с врачом.',
  LIFE_SAFETY:'Вопрос о жизни или безопасности: событийный прогноз отключён. При непосредственной опасности нужна экстренная помощь.',
  MISSING_PERSON:'Вопрос о пропавшем человеке: карта не определяет его местонахождение или безопасность. Поиск требует обращения в соответствующие службы.',
  CRIMINAL_LEGAL:'Вопрос об уголовном деле, аресте или приговоре: событийный прогноз отключён; необходима правовая оценка специалиста.'
};
export function questionScope(input){
  const explicit=input.sensitive_topic||'STANDARD';
  if(explicit!=='STANDARD')return {limited:true,topic:explicit,source:'USER_DECLARED',reason:messages[explicit]};
  if(input.safety_tier==='HIGH')return {limited:true,topic:'LIFE_SAFETY',source:'USER_DECLARED',reason:messages.LIFE_SAFETY};
  const t=`${input.raw_text||''} ${input.context||''}`.normalize('NFKC').toLowerCase().replaceAll('ё','е').replace(/\s+/g,' ');
  const tests=[
    ['LIFE_SAFETY',/суицид|самоубий|убью себя|убить себя|покончить с собой|террорист|умрет|умру|выжив|погиб|смерт(?:ь|и|ельн)|suicid|will .{0,30} die|survive|kill myself/],
    ['MISSING_PERSON',/(?:пропа[а-я]*|исчез[а-я]*|безвестн[а-я]*)[^.!?]{0,40}(?:ребен|дет[ьи]|человек|сын|доч|муж|жена|жену|супруг|мам[ауы]|пап[ауы]|брат|сестр|девоч|мальчик|девушк|парень)|(?:ребен|дочь|сын|муж|жена|человек)[^.!?]{0,40}(?:пропал|исчез)|missing (?:person|child|daughter|son)/],
    ['MEDICAL',/онколог|диагноз|выздоров|инфаркт|инсульт|беременн|лекарств|лечени|хирург|медицинск|(?:успеш|пережив|пройдет)[^.!?]{0,35}операц|(?:^|[^а-я])рак(?:а|ом)?(?:$|[^а-я])|cancer|diagnos|pregnan|surgery/],
    ['CRIMINAL_LEGAL',/уголовн|приговор|тюрьм|арест|осужден|лишени[ея] свободы|prison|criminal (?:trial|case)|sentenc/]
  ];
  const topic=tests.find(([,pattern])=>pattern.test(t))?.[0];
  return topic?{limited:true,topic,source:'TEXT_HEURISTIC',reason:messages[topic]}:{limited:false,topic:'STANDARD',source:'NO_LIMIT_DETECTED',reason:null};
}
