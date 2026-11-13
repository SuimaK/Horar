import {renderCorrectionEvidence} from './src/correction-view.mjs';
import {renderContactEvidence,renderAssembly} from './src/contact-view.mjs';
import {verifyArchive,verifyArchiveRecord} from './src/archive.mjs';
import {renderSemanticEvidence} from './src/semantic-view.mjs';
import {renderCareerEvidence} from './src/career-view.mjs';
import {readableWheel,readableInterpretation} from './src/ux-readable.mjs';
import {findCities,findCityForLiveGps,offsetForLocalMoment,selectLocationCoordinates} from './src/city-lookup.mjs';
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'horary-iphone-records-v1';
  const glyph = {Sun:'☉',Moon:'☽',Mercury:'☿',Venus:'♀',Mars:'♂',Jupiter:'♃',Saturn:'♄'};
  const ru = {Sun:'Солнце',Moon:'Луна',Mercury:'Меркурий',Venus:'Венера',Mars:'Марс',Jupiter:'Юпитер',Saturn:'Сатурн'};
  const signs = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
  const signRu = ['Овен','Телец','Близнецы','Рак','Лев','Дева','Весы','Скорпион','Стрелец','Козерог','Водолей','Рыбы'];
  const aspectGlyph = {CONJUNCTION:'☌',SEXTILE:'⚹',SQUARE:'□',TRINE:'△',OPPOSITION:'☍'};
  const aspectRu = {CONJUNCTION:'Соединение',SEXTILE:'Секстиль',SQUARE:'Квадрат',TRINE:'Трин',OPPOSITION:'Оппозиция'};
  const intentRu = {CAREER:'Работа и карьера',RELATIONSHIP:'Отношения',EVENT:'Событие',CONTACT:'Контакт',PRESERVATION:'Сохранение',STATUS:'Состояние',QUALITY:'Качество',COMPARISON:'Сравнение',TIMING:'Срок',RETURN:'Возвращение',RECOVERY:'Поиск',LOCATION:'Местонахождение',PAST_FACT:'Факт в прошлом'};
  const statusRu = {RESULT_READY:'Суждение готово',NEEDS_CLARIFICATION:'Нужно уточнение',NEEDS_EXPERT_REVIEW:'Требуется экспертный разбор',TOPIC_MODULE_REQUIRED:'Необходим тематический модуль',SEARCH_INCOMPLETE:'Поиск путей неполный',SAFETY_LIMITED:'Ограничение по безопасности',CALCULATION_ERROR:'Ошибка расчёта'};
  const statusHints = {DIRECT_GEOMETRY:'Точная геометрия',SPEED_REVIEW:'Станция требует проверки',SIGN_CHANGE_REVIEW:'Проверить переход знака',INTERVENING_CONTACT_REVIEW:'Проверить вмешательство',INTERRUPTION_REVIEW:'Возможное препятствие'};
  const esc = val => String(val ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const deg = v=>{const x=((v%360)+360)%360;return `${String(Math.floor(x%30)).padStart(2,'0')}°${String(Math.floor((x%1)*60)).padStart(2,'0')}′ ${signs[Math.floor(x/30)]}`};
  const dateRU = value => {try{return new Date(value).toLocaleString('ru-RU',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC'}catch{return String(value)}};
  const uuid = () => crypto?.randomUUID?.() || `q-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  let records = readRecords();
  let active = null;
  let revisionSource = null;
  let archiveBusy = false;
  let calculating = false;
  let showAspects = false;
  let cityOptions = [];

  function readRecords() {
    try {const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(x)?x.filter(g=>g&&typeof g.question_id==='string'&&Array.isArray(g.revisions)).map(g=>({...g,revisions:g.revisions.filter(r=>r&&r.input&&typeof r.input.raw_text==='string')})):[]}catch{return []}
  }
  function persist() {
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify(records));return true}
    catch {alert('Не удалось сохранить локально. Экспортируйте уже имеющиеся записи: память браузера может быть заполнена.');return false}
  }
  function toast(message) { const el=$('formError');el.hidden=false;el.textContent=message;el.scrollIntoView({behavior:'smooth',block:'nearest'}); }
  function hideToast() {const el=$('formError');el.hidden=true;el.textContent='';}
  function go(tab) {
    document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
    document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id===`screen-${tab}`));
    if(tab==='archive')drawArchive();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function defaultTime() {
    const now=new Date();
    const local=new Date(now.getTime()-now.getTimezoneOffset()*60000);
    $('momentLocal').value=local.toISOString().slice(0,19);
    const off=-now.getTimezoneOffset(); const sign=off>=0?'+':'-';
    $('offset').value=`${sign}${String(Math.floor(Math.abs(off)/60)).padStart(2,'0')}:${String(Math.abs(off)%60).padStart(2,'0')}`;
    $('zoneName').value=Intl.DateTimeFormat().resolvedOptions().timeZone||'';
  }
  function updateDerived(){
    const h=Number($('subjectHouse').value),k=Number($('turnedHouse').value);
    $('derivedNote').textContent=!h?'Предмет вопроса ещё не назначен':(k?`Производный ${k}-й от ${h}-го → радикальный дом ${((h+k-2)%12)+1}`:`Радикальный ${h}-й дом (без производного)`);
  }
  const scenarioCodes={MEETING_WITH_NAMED_PERSON:'PERSONAL_MEETING',CONTACT_WITH_NAMED_PERSON:'PERSONAL_CONTACT',MESSAGE_FROM_NAMED_PERSON:'INBOUND_PERSONAL_MESSAGE',PHYSICAL_LETTER_OR_PARCEL:'DELIVERY_OF_ITEM',VISITOR_ARRIVAL_AT_HOME:'VISITOR_ARRIVAL',REPLY_TO_SENT_MESSAGE:'REPLY_TO_SENT_MESSAGE',CONTACT_RESUMPTION:'CONTACT_RESUMPTION',RECONCILIATION:'RECONCILIATION',RETURN_TO_SHARED_HOME:'RETURN_TO_SHARED_HOME',RETURN_TO_RELATIONSHIP:'RETURN_TO_RELATIONSHIP',LOST_OR_MISSING_PERSON:'LOST_OR_MISSING_PERSON'};
  function syncContactForm(clearApproval=false){
    const enabled=$('intent').value==='CONTACT';
    $('contactOptions').hidden=!enabled;
    const relationship=$('intent').value==='RELATIONSHIP';
    $('relationshipOptions').hidden=!relationship;
    const career=$('intent').value==='CAREER';
    $('careerOptions').hidden=!career;
    ['careerScenario','careerPredicate'].forEach(id=>{$(id).required=career;});
    $('careerOutcome').required=career&&['GET_JOB','JOB_LOSS','CHANGE_JOB','PROMOTION','WAGE_PAYMENT'].includes($('careerScenario').value);
    ['relationshipScenario','relationshipPredicate'].forEach(id=>{$(id).required=relationship;});
    $('thirdPartyCount').disabled=!relationship;
    $('contactPredicateField').hidden=!scenarioCodes[$('contactKind').value];
    const personal=['MEETING_WITH_NAMED_PERSON','CONTACT_WITH_NAMED_PERSON','MESSAGE_FROM_NAMED_PERSON'].includes($('contactKind').value);
    $('personContactFields').hidden=!personal;
    $('contactKind').required=enabled;
    $('contactHorizon').required=enabled;
    $('contactHorizon').disabled=!enabled;
    if(clearApproval){$('approveContactRoles').checked=false;$('approveRelationshipRoles').checked=false;$('acknowledgeCareerRoles').checked=false;}
    $('contactScenarioNote').textContent=!$('contactKind').value?'Сначала выберите сценарий. Сообщение от человека и доставка посылки разбираются по разным правилам.':personal?'Поддерживается только человек без специальной социальной роли при подтверждённом I/VII. Сообщение не назначается автоматически III дому.':'Для этой темы нужен отдельный модуль. Карта сохранится, но поиск контактов по I/VII не запустится.';
  }
  function getPayload() {
    const local=$('momentLocal').value;
    if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?$/.test(local))throw Error('Укажите дату и местное время.');
    const offset=$('offset').value.trim();
    if(!/^[+-](0\d|1[0-4]):[0-5]\d$/.test(offset))throw Error('Укажите UTC-смещение, например +03:00 или +01:00.');
    const timeWithOffset=(local.length===16?local+':00':local)+offset;
    const date=new Date(timeWithOffset);
    if(Number.isNaN(date.getTime()))throw Error('Неверная дата или смещение UTC.');
    const house=$('subjectHouse').value;
    const derived=$('turnedHouse').value;
    if(derived && !house)throw Error('Для производного дома сначала выберите исходный дом.');
    const src=revisionSource?.input;
    const raw=$('questionText').value;
    if(src && raw!==src.raw_text)throw Error('Исходный вопрос нельзя изменять в новой ревизии. Создайте новый вопрос.');
    const p={question_id:src?.question_id||uuid(), revision:(src?.revision||0)+1,
      recorded_at_utc:src?.recorded_at_utc||new Date().toISOString().replace(/\.\d\d\dZ$/,'Z'),
      raw_text:raw,context:$('questionContext').value,question_provenance:$('questionProvenance').value,sensitive_topic:$('sensitiveTopic').value,
      question_owner_id:$('ownerId').value.trim()||'я', speaker_id:$('speakerId').value.trim()||'я',
      intent_kind:$('intent').value,relay_mode:$('relay').value,
      moment_local:timeWithOffset,zone_name:$('zoneName').value.trim(),location_label:$('placeLabel').value.trim(),
      latitude_deg:Number($('latitude').value),longitude_deg:Number($('longitude').value),
      coordinate_source:($('latitude').dataset.source==='questioner' && $('longitude').dataset.source==='questioner')?'questioner':'configured',
      house_system:'REGIOMONTANUS',method_profile:'frawley_early',
      house_path:house?[Number(house),...(derived?[Number(derived)]:[])]:[],roles_locked:$('lockRoles').checked};
    if(!$('latitude').value||!$('longitude').value)throw Error('Введите широту и долготу места построения.');
    if(!Number.isFinite(p.latitude_deg)||!Number.isFinite(p.longitude_deg))throw Error('Координаты должны быть числами.');
    if(p.intent_kind==='CONTACT')p.contact_options={question_kind:$('contactKind').value,relationship_kind:$('relationshipKind').value,approve_l1_l7:$('approveContactRoles').checked,horizon_days:Number($('contactHorizon').value)};
    if(p.intent_kind==='CONTACT'&&scenarioCodes[$('contactKind').value])p.scenario_options={intent_code:scenarioCodes[$('contactKind').value],event_predicate:$('contactPredicate').value};
    if(p.intent_kind==='RELATIONSHIP')p.relationship_options={scenario_code:$('relationshipScenario').value,event_predicate:$('relationshipPredicate').value,relationship_kind:$('relationshipRole').value,relationship_state:$('relationshipState').value,third_party_count:Number($('thirdPartyCount').value),outcome_description:$('outcomeDescription').value,approve_l1_l7:$('approveRelationshipRoles').checked};
    if(p.intent_kind==='CAREER')p.career_options={scenario_code:$('careerScenario').value,event_predicate:$('careerPredicate').value,perspective:$('careerPerspective').value,employment_state:$('employmentState').value,employment_relation:$('employmentRelation').value,money_context:$('moneyContext').value,outcome_description:$('careerOutcome').value,acknowledge_l1_l10:$('acknowledgeCareerRoles').checked};
    return p;
  }
  function recordResult(input,result) {
    const draft=structuredClone(records);
    let group=draft.find(x=>x.question_id===input.question_id);
    if(!group){group={question_id:input.question_id,revisions:[]};draft.unshift(group);}
    if(group.revisions.some(x=>x.input.revision===input.revision))throw Error('Ревизия уже существует; перезагрузите карту.');
    const item={input,result,saved_at:new Date().toISOString()};
    group.revisions.push(item);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(draft));}
    catch{throw Error('Не удалось сохранить расчёт: хранилище недоступно или заполнено. Прежние записи не изменены.');}
    records=draft;active=item;revisionSource=null;
  }
  async function createChart(ev) {
    ev.preventDefault();hideToast();
    if(archiveBusy||calculating){toast('Дождитесь завершения текущей проверки или расчёта.');return;}
    let payload;
    try{payload=getPayload()}catch(e){toast(e.message);return}
    const btn=$('buildBtn'),old=btn.innerHTML;
    calculating=true;btn.disabled=true;btn.innerHTML='<span>Выполняется точный расчёт…</span><span class="button-arrow">◷</span>';
    try{
      // No HTTP API or background upload: compute exclusively on the device.
      await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
      if(typeof window.horaryBuild!=='function')throw Error('Не загружен локальный расчётный модуль. Обновите страницу.');
      const data=await window.horaryBuild(payload);
      if(!data?.chart?.source_chart_hash||!data?.judgment?.processing_status)throw Error('Неполный результат локального расчёта.');
      recordResult(payload,data);newQuestion();renderAll();go('chart');
    }catch(e){toast(e?.message||'Локальный расчёт не выполнен; сохранённые карты доступны в архиве.')}
    finally{calculating=false;btn.disabled=false;btn.innerHTML=old}
  }

  function svgWheel(r){return readableWheel(r,{showAspects});}
  function renderChart(){
    if(!active)return;
    const r=active.result,chart=r.chart,roles=r.roles.assignments,j=r.judgment,p=active.input;
    const desc=roles.map(a=>`<div class="metric"><label>${a.role_kind==='QUERENT'?'Кверент · I дом':`Предмет · ${a.radical_house} дом`}</label><strong>${glyph[a.base_lord]} ${esc(ru[a.base_lord])}</strong><small>${a.role_kind==='QUERENT'?'L1':'Управитель куспида'}</small></div>`).join('');
    const planets=chart.planets.map(p=>`<div class="planet-item"><span class="planet-name"><span class="planet-symbol">${glyph[p.name]}</span> ${esc(ru[p.name])}${p.speed_deg_per_day<0?'<sup class="mini-r">R</sup>':''}</span><span class="planet-position">${deg(p.longitude_deg)}<small>${p.house} дом · ${p.speed_deg_per_day.toFixed(3)}°/сут.</small></span></div>`).join('');
    const aspects=(r.current_aspects||[]).length?r.current_aspects.slice(0,15).map(a=>`<div class="aspect-item"><strong>${esc(ru[a.planet_a])} <span class="aspect-glyph">${aspectGlyph[a.aspect]}</span> ${esc(ru[a.planet_b])}</strong><small>${Number(a.orb_deg).toFixed(2)}° · ${a.motion==='APPLYING'?'сходящийся':'расходящийся'}${a.sign_compatible?'':' · вне знаковой связи'}</small></div>`).join(''):'<p class="small-note">В пределах 6° орбиса мажорные аспекты не найдены.</p>';
    $('chartContent').innerHTML=`<div class="page-top"><div><div class="sub">КАРТА · РЕВИЗИЯ ${p.revision}</div><h2>Хорарный круг</h2></div><button type="button" class="mini-action" data-action="revise">↻ Ревизия</button></div><p class="question-title">${esc(p.raw_text)}</p>${r.question.question_provenance==='DEMONSTRATION_NOT_ACTUAL_QUESTION'?'<p class="info-box">Учебный пример — не реальный хорарный вопрос.</p>':''}<div class="meta-row"><span class="tag">${esc(intentRu[p.intent_kind])}</span><span class="tag">Региомонтанус</span><span class="tag">7 планет</span></div><div class="chart-card">${svgWheel(r)}<div class="chart-legend"><span><i class="legend-dot"></i> Точки — точные положения</span><span>R — ретроградность</span></div><div class="chart-tools"><button type="button" class="secondary-button" data-action="toggle-aspects" aria-pressed="${showAspects}">${showAspects?"Скрыть аспекты":"Показать аспекты"}</button><button type="button" class="secondary-button" data-action="expand-chart">Увеличить круг</button></div></div><p class="inline-note">${esc(p.location_label||'Указанные координаты')} · ${esc(dateRU(chart.moment_utc))} · ${esc(p.moment_local.slice(-6))} местное смещение</p><div class="status-band"><strong>${esc(statusRu[j.processing_status]||j.processing_status)}</strong>${esc(j.event_assessment)}</div><div class="compact-head"><h3>Сигнификаторы</h3><small>${r.roles.status==='CONFIRMED'?'Роли подтверждены':'Требуют уточнения'}</small></div><div class="two-cols">${desc}</div><details class="expert-details"><summary>Планеты и аспекты — подробная таблица</summary><div class="compact-head"><h3>Планеты</h3><small>Тропический зодиак</small></div><div class="planet-list">${planets}</div><div class="compact-head"><h3>Аспекты в карте</h3><small>Условный орбис отображения ≤ 6°</small></div><div>${aspects}</div></details><div class="action-row"><button type="button" class="secondary-button" data-tab="interpretation">Смотреть разбор →</button><button type="button" class="secondary-button" data-action="download-record">Экспорт JSON</button></div><p class="small-note">Положения планет и куспидов технически рассчитаны; DISPLAY_ORB_CONVENTION: 6° — только визуализация, не орбисы Фроули и не выбор события.</p>`;
  }
  function renderMethodEvidence(r){
    const e=r.evidence;
    if(e?.method_correction)return renderCorrectionEvidence(e.method_correction,esc,dateRU);
    if(!e)return '<div class="info-box">Эта карта создана до обновления методики 1.1–1.2. Чтобы получить новые расчёты, создайте ревизию карты. Исходная запись сохранится.</div>';
    const kindRu={domicile:'Обитель',exaltation:'Экзальтация',triplicity:'Триплицитет',term:'Терм',face:'Фас',detriment:'Изгнание',fall:'Падение'};
    const stateRu={CAZIMI:'Казими',COMBUST:'Сожжение',UNDER_BEAMS:'Под лучами',OUTSIDE_BEAMS:'Вне лучей',NOT_APPLICABLE:'—'};
    const motionRu={DIRECT:'Директная',RETROGRADE:'Ретроградная',ZERO_INSTANTANEOUS_SPEED:'Нулевая мгновенная скорость'};
    const speedRu={FAST_BY_PROJECT_HEURISTIC:'Выше справочной',SLOW_BY_PROJECT_HEURISTIC:'Ниже справочной',NEAR_REFERENCE_SPEED:'Около справочной',POSSIBLE_STATION_NEEDS_EPHEMERIS_BRACKETING:'Возможная станция (не подтверждена)',NOT_ASSESSED_FOR_SUN:'Для Солнца не оценивается'};
    const houseRu={STRONG_ANGULAR:'Угловой · сильный',MIDDLE_OR_NEUTRAL:'Средний / нейтральный',WEAK:'Слабый'};
    const sector=e.sect_info?.sect==='DAY'?'Дневная':e.sect_info?.sect==='NIGHT'?'Ночная':'Не определена у горизонта';
    const cap=(v)=>esc(v==null?'—':v);
    const kinds=a=>a?.length?a.map(x=>cap(kindRu[x]||x)).join(', '):'нет';
    const d=e.essential;
    const essentialTable=d?`<div class="method-table-wrap"><table class="method-table"><thead><tr><th>Планета</th><th>Достоинства</th><th>Слабости</th></tr></thead><tbody>${d.placements.map(p=>`<tr><td>${cap(ru[p.planet])}<small>${cap(signRu[['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'].indexOf(p.sign)])}</small></td><td>${kinds(p.own_essential_dignities)}${p.peregrine?'<small>Перегрин</small>':''}</td><td>${kinds(p.own_essential_debilities)}</td></tr>`).join('')}</tbody></table></div>`:
      '<p class="inline-note">Солнце слишком близко к горизонту: дневная/ночная секта не подтверждена, зависимые от неё достоинства не вычислены. Требуется экспертная проверка.</p>';
    const rec=d?d.directional_receptions:[];
    const recHtml=rec?.length?`<div class="method-receptions">${rec.map(x=>`<div class="method-line"><b>${cap(ru[x.from_planet])} → ${cap(ru[x.to_planet])}</b><span>${cap(kindRu[x.dignity_kind]||x.dignity_kind)} · ${x.polarity==='POSITIVE'?'положительная':'отрицательная'}</span></div>`).join('')}</div>`:'<p class="small-note">Направленные рецепции не установлены / секта не определена.</p>';
    const paired=d?.mutual_receptions?.length?`<p class="small-note">Взаимные связи: ${d.mutual_receptions.map(x=>`${cap(ru[x.planet_a])} ↔ ${cap(ru[x.planet_b])} (${x.classification==='MUTUAL_MIXED'?'смешанная':x.classification==='MUTUAL_POSITIVE'?'положительная':'отрицательная'})`).join('; ')}. Не доказывают наступление события.</p>`:'';
    const byActors=e.role_receptions;
    const roleText=byActors?`<p class="small-note">Рецепции по подтверждённым ролям: ${byActors.reception_evidence_by_actor.length} направлений. Тема: ${r.contact_evidence?.analysis?'контакт с человеком':'общие свидетельства'}. ${byActors.analysis_status==='NEEDS_EXPERT_REVIEW'?'Есть совпадающие сигнификаторы, необходим эксперт.':'Вывод о намерениях, действиях и событии не сделан.'}</p>`:
      '<p class="small-note">Для связи рецепций с участниками необходимо подтвердить и заблокировать роли.</p>';
    const acc=e.accidental?.planets||[];
    const accTable=`<div class="method-table-wrap"><table class="method-table"><thead><tr><th>Планета</th><th>Дом, движение</th><th>Солнце</th></tr></thead><tbody>${acc.map(p=>`<tr><td>${cap(ru[p.planet])}<small>${p.is_in_house_joy?'Радость в доме '+p.house_joy_number:''}</small></td><td>Дом ${p.house} · ${cap(houseRu[p.house_class])}<small>${cap(motionRu[p.motion.direction])} · ${cap(speedRu[p.motion.relative_speed])}</small></td><td>${cap(stateRu[p.solar.state])}<small>${p.planet==='Sun'?'':p.solar.distance_deg.toFixed(2)+'° до Солнца'}${p.moon_phase?' · '+cap({WAXING:'Луна растёт',WANING:'Луна убывает',NEW_MOON_BOUNDARY:'Новолуние',FULL_MOON_BOUNDARY:'Полнолуние'}[p.moon_phase]):''}</small></td></tr>`).join('')}</tbody></table></div>`;
    return `<div class="section-mini">МЕТОДИКА · версии 1.1 и 1.2</div><p class="small-note">Секта: <b>${sector}</b> (геометрическая высота Солнца ${Number(e.sect_info?.solar_altitude_deg).toFixed(2)}°). Источник достоинств: Олешко, 1999, с. 55; акцидентальных правил: ранний Фроули и отдельный справочник скоростей Олешко, с. 57. Исправленное издание Фроули 2014 не сверено.</p><details class="method-evidence" open><summary>Эссенциальные достоинства · v1.1</summary>${essentialTable}<h4>Направленные рецепции</h4>${recHtml}${paired}${roleText}</details>${renderAssembly(e.role_assembly,esc)}<details class="method-evidence" open><summary>Акцидентальные факторы · v1.2</summary>${accTable}<p class="small-note">«Быстрее/медленнее» — проектные пороги, не количественные правила Фроули. По мгновенной скорости станция не подтверждается. Близость к куспидам, осада, звёзды и влияние контекста не анализируются.</p></details><p class="inline-note">Обе группы свидетельств — сведения традиционной астрологической модели, не предсказание и не факт поведения людей. Баллы и автоматическое «да/нет» не рассчитываются.</p>`;
  }
  function renderInterpretation(){
    if(!active)return;
    const r=active.result, j=r.judgment, ps=r.path_search,roles=r.roles,p=active.input;
    const evidence=j.key_evidence.map(e=>`<div class="evidence-item"><div><strong>${esc(e.rule_id)} · ${esc(e.evidence_id)}</strong><p>${esc(e.chart_fact)}</p></div></div>`).join('');
    const paths=ps.paths.length?ps.paths.map(x=>{const c=x.contacts[0];return `<div class="path-item"><span class="pill">${esc(statusHints[x.geometry_status]||x.geometry_status)}</span><p><b>${esc(ru[c.planet_a])} ${aspectGlyph[c.aspect]} ${esc(ru[c.planet_b])}</b><span> · ${esc(aspectRu[c.aspect])}</span></p><small>${esc(dateRU(c.contact_utc))} · канал DIRECT</small>${(x.review_reasons||[]).length?`<p>${x.review_reasons.map(esc).join('; ')}</p>`:''}</div>`}).join(''):'<div class="info-box">Подтверждённые будущие прямые аспекты основной пары в установленном горизонте не обнаружены или поиск не запущен. Это не означает «нет».</div>';
    const unknown=j.unknowns.map(v=>`<li>${esc(v)}</li>`).join('');
    const roleReasons=roles.review_reasons.length?`<div class="info-box"><b>Нужно проверить роли:</b><ul class="unknown-list">${roles.review_reasons.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>`:'';
    $('interpretationContent').innerHTML=`<div class="page-top"><div><div class="sub">ЧТО ВИДНО НА КАРТЕ</div><h2>Разбор вопроса</h2></div><button type="button" class="mini-action" data-action="download-record">↓ JSON</button></div><p class="question-title">${esc(p.raw_text)}</p>${readableInterpretation(r,p,esc)}<details class="expert-details"><summary>Подробный астрологический протокол и справочники</summary><div class="status-band ${j.processing_status==='SAFETY_LIMITED'?'risk':''}"><strong>${esc(statusRu[j.processing_status]||j.processing_status)}</strong>${esc(j.event_assessment)}</div><div class="section-mini">Клиентская формулировка</div><p class="interpret-lead">${esc(j.client_text)}</p><div class="two-cols"><div class="metric"><label>Возможность события</label><strong style="font-size:16px">Не установлена</strong><small>${esc(j.judgment_status)}</small></div><div class="metric"><label>Оценка результата</label><strong style="font-size:16px">Не определена</strong><small>Расчётные признаки ≠ итоговое суждение</small></div></div>${r.contact_evidence?renderContactEvidence(r.contact_evidence,r.chart.moment_utc,esc,dateRU):p.intent_kind==='CAREER'?'':`<div class="section-mini">Пути совершенствования</div><div class="small-note">Горизонт: 30 суток. Проверены прямые контакты выбранных сигнификаторов. Для лунной последовательности и косвенных кандидатов выберите тип «Контакт / встреча» и поддерживаемый сценарий.</div><div class="path-list">${paths}</div>`}${roleReasons}${renderCareerEvidence(r,esc)}${renderSemanticEvidence(r,esc,dateRU,active.input)}${renderMethodEvidence(r)}<div class="section-mini">Экспертные свидетельства</div><div class="evidence-list">${evidence}</div><div class="section-mini">Неизвестное / ограничения</div><ul class="unknown-list">${unknown}</ul><div class="info-box">${esc(j.expert_text)}</div><p class="small-note">Хэш исходных данных: <span style="overflow-wrap:anywhere">${esc(r.chart.source_chart_hash)}</span><br>Версия: ${esc(j.calculation_version)}<br>Профиль: ${esc(j.method_profile)}</p></details><div class="action-row"><button type="button" class="secondary-button" data-tab="chart">← К карте</button><button type="button" class="secondary-button" data-action="download-record">Сохранить разбор</button></div>`;
  }
  function renderAll(){renderChart();renderInterpretation();drawArchive()}

  function drawArchive(){
    const count=records.reduce((total,g)=>total+(g.revisions?.length||0),0);
    const items=records.flatMap(g=>(g.revisions||[]).map(x=>x)).sort((a,b)=>new Date(b.saved_at)-new Date(a.saved_at));
    const html=items.map(item=>{
      const {input}=item;
      return `<div class="archive-item"><div class="date">${esc(dateRU(input.moment_local||input.moment_utc))} · R${input.revision}</div><h3>${esc(input.raw_text)}</h3><div class="bottom"><span>${esc(input.location_label||'Без названия города')} · ${esc(intentRu[input.intent_kind])}</span><button type="button" data-action="open" data-id="${esc(input.question_id)}" data-revision="${input.revision}">Открыть →</button></div></div>`;
    }).join('');
    $('archiveContent').innerHTML=`<div class="page-top"><div><div class="sub">ВАША БИБЛИОТЕКА</div><h2>Архив хораров</h2></div><span class="version-tag">${count} записей</span></div><p class="small-note">Все карты хранятся только на этом устройстве. При очистке данных Safari они могут исчезнуть — делайте резервные копии.</p><div class="archive-controls"><button type="button" class="secondary-button" data-action="export-all">↓ Экспорт архива</button><button type="button" class="secondary-button" data-action="import-all">↑ Импорт архива</button></div><p class="small-note" id="archiveProgress" role="status" aria-live="polite">При открытии и импорте карта сверяется повторным расчётом. Текст разбора формируется заново.</p><input type="file" id="importFile" accept="application/json,.json" class="file-upload"><div>${html||'<div class="empty-screen"><div class="empty-icon">▤</div><h2>Архив пока пуст</h2><p>Первая построенная карта автоматически появится здесь.</p></div>'}</div>`;
  }
  function revise(){
    if(!active)return;
    revisionSource=active;
    const input=active.input;
    $('questionText').value=input.raw_text;
    $('questionText').readOnly=true;
    $('questionContext').value=input.context;
    $('questionProvenance').value=input.question_provenance||'USER_CONFIRMED_MOMENT';
    $('sensitiveTopic').value=input.sensitive_topic||'STANDARD';
    $('intent').value=input.intent_kind;
    $('ownerId').value=input.question_owner_id||'я';$('speakerId').value=input.speaker_id||'я';
    $('relay').value=input.relay_mode;
    const local=active.result.meta.moment_local;
    $('momentLocal').value=local.slice(0,19);
    $('offset').value=local.slice(-6);
    $('zoneName').value=input.zone_name;
    $('placeLabel').value=input.location_label;
    $('latitude').value=input.latitude_deg;
    $('longitude').value=input.longitude_deg;
    $('latitude').dataset.source=input.coordinate_source||'configured';
    $('longitude').dataset.source=input.coordinate_source||'configured';
    $('subjectHouse').value=input.house_path?.[0]||'';
    $('turnedHouse').value=input.house_path?.[1]||'';
    $('lockRoles').checked=input.roles_locked;
    const career=input.career_options;
    $('careerScenario').value=career?.scenario_code||'';$('careerPredicate').value=career?.event_predicate||'';
    $('careerPerspective').value=career?.perspective||'SELF';$('employmentState').value=career?.employment_state||'UNKNOWN';
    $('employmentRelation').value=career?.employment_relation||'UNKNOWN';$('moneyContext').value=career?.money_context||'UNKNOWN';
    $('careerOutcome').value=career?.outcome_description||'';$('acknowledgeCareerRoles').checked=career?.acknowledge_l1_l10===true;
    $('contactKind').value=input.contact_options?.question_kind||'';
    $('contactPredicate').value=input.scenario_options?.event_predicate||'UNKNOWN';
    const rel=input.relationship_options;
    $('relationshipScenario').value=rel?.scenario_code||'';$('relationshipPredicate').value=rel?.event_predicate||'';
    $('relationshipRole').value=rel?.relationship_kind||'UNKNOWN';$('relationshipState').value=rel?.relationship_state||'UNKNOWN';
    $('thirdPartyCount').value=rel?.third_party_count??0;$('outcomeDescription').value=rel?.outcome_description||'';
    $('approveRelationshipRoles').checked=rel?.approve_l1_l7===true;
    $('relationshipKind').value=input.contact_options?.relationship_kind||'';
    $('approveContactRoles').checked=input.contact_options?.approve_l1_l7===true;
    $('contactHorizon').value=input.contact_options?.horizon_days??14;
    syncContactForm();
    if(!$('revisionMessage')){
      const el=document.createElement('div');el.id='revisionMessage';el.className='revision-lock';
      $('questionText').closest('.field').insertAdjacentElement('afterend',el);
    }
    $('revisionMessage').textContent=`Ревизия ${input.revision+1}: исходный текст заблокирован. Изменение времени, места или ролей создаст новый расчёт; прежняя карта сохранится.`;
    $('buildBtn').querySelector('span').textContent='Сохранить новую ревизию';
    updateDerived();go('question');
  }
  function newQuestion(){
    revisionSource=null;$('questionForm').reset();$('questionText').readOnly=false;
    $('latitude').dataset.source='configured';$('longitude').dataset.source='configured';
    $('revisionMessage')?.remove();$('buildBtn').querySelector('span').textContent='Построить хорарную карту';
    cityOptions=[];$('cityResults').replaceChildren();cityMessage('Введите город или разрешите определение GPS.');
    defaultTime();updateDerived();syncContactForm();hideToast();go('question');
  }
  function downloadJson(obj,filename){
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'});
    const link=document.createElement('a');const url=URL.createObjectURL(blob);
    link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  function archiveState(busy){
    archiveBusy=busy;
    $('buildBtn').disabled=busy;
    document.querySelectorAll('#archiveContent button').forEach(b=>{b.disabled=busy;});
    if($('archiveProgress'))$('archiveProgress').textContent=busy?'Проверяем архив и пересчитываем карты…':'При открытии и импорте карта сверяется повторным расчётом. Текст разбора формируется заново.';
  }
  async function calculateArchiveInput(input){
    if(typeof window.horaryBuild!=='function')throw Error('Не загружен локальный модуль проверки карты. Обновите страницу.');
    await new Promise(resolve=>setTimeout(resolve,0));
    return window.horaryBuild(input);
  }
  async function importAll(file){
    if(archiveBusy||calculating)return;
    if(!file||file.size>15*1024*1024){alert('Выберите JSON-архив не более 15 МБ.');return;}
    archiveState(true);
    try{
      const source=JSON.parse(await file.text());
      const checked=await verifyArchive(source,records,calculateArchiveInput);
      // Commit only a fully checked archive, including successful persistence.
      localStorage.setItem(STORAGE_KEY,JSON.stringify(checked.records));
      records=checked.records;drawArchive();
      alert(`Импорт завершён. Добавлено: ${checked.added}; совпадающих ревизий проверено: ${checked.duplicates}. Все разборы сформированы заново.`);
    }catch(e){alert(`Ошибка импорта: ${e.message}`);}
    finally{archiveState(false);}
  }
  async function openStored(group,item){
    if(archiveBusy||calculating)return;
    archiveState(true);
    try{
      const checked=await verifyArchiveRecord(item,calculateArchiveInput);
      const index=group.revisions.indexOf(item);
      group.revisions[index]=checked;persist();
      active=checked;renderAll();go('chart');
    }catch(e){alert(`Карта не прошла проверку: ${e.message}`);}
    finally{archiveState(false);}
  }
  async function exportAll(){
    if(archiveBusy||calculating)return;
    archiveState(true);
    try{
      const checked=await verifyArchive({format:'horary-iphone-archive-v1',records},[],calculateArchiveInput);
      downloadJson({format:'horary-iphone-archive-v1',exported_at:new Date().toISOString(),records:checked.records},'horary-backup.json');
    }catch(e){alert(`Ошибка экспорта: ${e.message}`);}
    finally{archiveState(false);}
  }
  async function savePathReview(button){
    if(archiveBusy||calculating||!active?.result?.arbitration)return;
    const form=button.closest('.path-review'),pid=form?.dataset.pathId;
    if(!form||!active.result.arbitration.paths.some(p=>p.path_id===pid)||!form.reportValidity())return;
    const value=name=>form.querySelector(`[name="${name}"]`)?.value;
    const check=name=>form.querySelector(`[name="${name}"]`)?.checked===true;
    const review={path_id:pid,assessment:value('assessment'),reviewer_id:value('reviewer_id'),rationale:value('rationale'),blind_to_outcome:check('blind_to_outcome'),receptions_considered:check('receptions_considered'),capacity_considered:check('capacity_considered'),
      interventions:[...form.querySelectorAll('.intervention-review')].map(el=>({event_id:el.dataset.eventId,effect:el.querySelector('[name="effect"]').value,role:el.querySelector('[name="role"]').value,rationale:el.querySelector('[name="intervention_rationale"]').value})),ingress_assessment:value('ingress_assessment')||'NOT_APPLICABLE',station_assessment:value('station_assessment')||'NOT_APPLICABLE',context_role:value('context_role')||''};
    const input=structuredClone(active.input),group=records.find(g=>g.question_id===input.question_id);
    input.revision=Math.max(...group.revisions.map(r=>r.input.revision))+1;
    input.path_reviews=[...(input.path_reviews||[]).filter(r=>r.path_id!==pid),review];
    calculating=true;button.disabled=true;
    try{
      const result=await window.horaryBuild(input);
      recordResult(input,result);newQuestion();renderAll();go('interpretation');
    }catch(e){alert(`Разметка не сохранена: ${e.message}`);}
    finally{calculating=false;button.disabled=false;}
  }
  function delegation(event){
    const t=event.target.closest('button');if(!t)return;
    if(t.dataset.tab){go(t.dataset.tab);return}
    const a=t.dataset.action;
    if(a==='toggle-aspects'){showAspects=!showAspects;renderChart();return;}
    if(a==='expand-chart'){showZoomChart();return;}
    if(a==='close-zoom'){$('chartZoomDialog')?.close();return;}
    if(a==='select-city'){applyCityChoice(Number(t.dataset.index));return;}
    if(a==='download-record'&&active)downloadJson({format:'horary-iphone-record-v1',...active},`horary-${active.input.question_id}-r${active.input.revision}.json`);
    if(a==='revise')revise();
    if(a==='review-path')savePathReview(t);
    if(a==='open'){
      const group=records.find(x=>x.question_id===t.dataset.id);
      const item=group?.revisions?.find(x=>x.input.revision===Number(t.dataset.revision));
      if(item)openStored(group,item);
    }
    if(a==='export-all')exportAll();
    if(a==='import-all')$('importFile')?.click();
  }
  document.addEventListener('click',delegation);
  document.addEventListener('change',e=>{if(e.target.id==='importFile'&&e.target.files[0])importAll(e.target.files[0])});
  ['latitude','longitude'].forEach(id=>$(id).addEventListener('input',()=>{$(id).dataset.source='configured';}));
  $('intent').addEventListener('change',()=>syncContactForm(true));
  $('contactKind').addEventListener('change',()=>syncContactForm(true));
  $('relationshipKind').addEventListener('change',()=>syncContactForm(true));
  ['careerScenario','careerPredicate','careerPerspective','employmentState','employmentRelation','moneyContext'].forEach(id=>$(id).addEventListener('change',()=>{syncContactForm();$('acknowledgeCareerRoles').checked=false;}));
  ['relationshipScenario','relationshipRole','relationshipState','relationshipPredicate','thirdPartyCount'].forEach(id=>$(id).addEventListener('change',()=>{$('approveRelationshipRoles').checked=false;}));
  ['subjectHouse','turnedHouse','relay','ownerId','speakerId'].forEach(id=>$(id).addEventListener('change',()=>{$('approveContactRoles').checked=false;$('approveRelationshipRoles').checked=false;$('acknowledgeCareerRoles').checked=false;}));
  $('subjectHouse').addEventListener('change',updateDerived);
  $('turnedHouse').addEventListener('change',updateDerived);
  $('questionForm').addEventListener('submit',createChart);
  $('nowBtn').addEventListener('click',defaultTime);
  function cityMessage(message,error=false){
    const el=$('cityStatus');if(!el)return;
    el.textContent=message;el.classList.toggle('city-error',error);
  }
  function applyCityChoice(index){
    const city=cityOptions[index];
    if(!city)return;
    try{
      const coords=selectLocationCoordinates(city.latitude_deg,city.longitude_deg);
      $('latitude').value=coords.latitude_deg;
      $('longitude').value=coords.longitude_deg;
      $('latitude').dataset.source='configured';$('longitude').dataset.source='configured';
      $('placeLabel').value=city.place_label;
      $('zoneName').value=city.timezone||$('zoneName').value;
      const offset=offsetForLocalMoment($('momentLocal').value,city.timezone);
      if(offset)$('offset').value=offset;
      $('cityResults').replaceChildren();cityOptions=[];
      cityMessage('Город и координаты выбраны. Проверьте время вопроса и смещение UTC для его даты.');
      hideToast();
    }catch(err){cityMessage(err.message,true);}
  }
  async function searchCityByName(){
    const city=$('placeLabel').value.trim();
    if(!city){cityMessage('Введите название города, затем нажмите «Найти».',true);return;}
    cityMessage('Ищу город…');$('citySearchBtn').disabled=true;
    $('cityResults').replaceChildren();cityOptions=[];
    try{
      cityOptions=await findCities(city);
      if(!cityOptions.length){cityMessage('Город не найден. Уточните название или введите координаты вручную.',true);return;}
      const results=$('cityResults');
      for(const [index,item] of cityOptions.entries()){
        const btn=document.createElement('button');btn.type='button';btn.className='city-option';
        btn.dataset.action='select-city';btn.dataset.index=String(index);
        btn.textContent=item.place_label+' · '+item.latitude_deg.toFixed(3)+', '+item.longitude_deg.toFixed(3);
        results.appendChild(btn);
      }
      cityMessage('Выберите нужный город из списка.');
    }catch(error){cityMessage('Не удалось загрузить города. Проверьте интернет или укажите координаты вручную.',true);}
    finally{$('citySearchBtn').disabled=false;}
  }
  function showZoomChart(){
    if(!active)return;
    let dialog=$('chartZoomDialog');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='chartZoomDialog';dialog.className='chart-zoom-dialog';
      document.body.appendChild(dialog);
    }
    dialog.innerHTML='<div class="zoom-toolbar"><strong>Карта крупно</strong><button type="button" class="secondary-button" data-action="close-zoom">Закрыть</button></div>'+svgWheel(active.result)+
      '<p class="small-note">Точки обозначают точные координаты; подписи разведены, чтобы не перекрывались.</p>';
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  }
  async function gpsLocation(){
    if(!navigator.geolocation){
      cityMessage('Геолокация недоступна. Используйте поиск города по названию.',true);return;
    }
    const permitted=typeof window.confirm==='function'?window.confirm(
      'Определить также название города? После получения GPS-координат они будут отправлены сервису BigDataCloud. Нажмите «Отмена», если нужны только координаты.'
    ):false;
    cityMessage('Запрашиваю доступ к местоположению…');
    $('locationBtn').disabled=true;
    navigator.geolocation.getCurrentPosition(async p=>{
      try{
        const coordinates=selectLocationCoordinates(p.coords.latitude,p.coords.longitude);
        $('latitude').value=coordinates.latitude_deg;
        $('longitude').value=coordinates.longitude_deg;
        $('latitude').dataset.source='questioner';$('longitude').dataset.source='questioner';
        cityMessage('Координаты определены. '+(permitted?'Ищу название города…':'Город можно выбрать через поиск выше.'));
        hideToast();
        if(permitted){
          try{
            const city=await findCityForLiveGps(p.coords.latitude,p.coords.longitude);
            if(city.place_label)$('placeLabel').value=city.place_label;
            cityMessage(city.place_label?'Координаты и город определены.':'Координаты определены; город найдите вручную.');
          }catch{cityMessage('Координаты определены, но название города недоступно. Можно найти его вручную.',true);}
        }
      }catch(error){cityMessage(error.message,true);}
      finally{$('locationBtn').disabled=false;}
    },error=>{
      const note=error?.code===1?'Доступ к геолокации запрещён. Разрешите его для сайта в настройках Safari или найдите город по названию.':
        error?.code===3?'Местоположение не найдено вовремя. Попробуйте поиск города по названию.':
        'Не удалось получить местоположение. Используйте поиск города по названию.';
      cityMessage(note,true);$('locationBtn').disabled=false;
    },{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
  }
  $('citySearchBtn').addEventListener('click',searchCityByName);
  $('locationBtn').addEventListener('click',gpsLocation);
  $('aboutBtn').addEventListener('click',()=>$('aboutDialog').showModal());
  $('closeAbout').addEventListener('click',()=>$('aboutDialog').close());
  $('aboutDone').addEventListener('click',()=>$('aboutDialog').close());
  $('newQuestionBtn').addEventListener('click',newQuestion);
  $('resetBtn').addEventListener('click',newQuestion);
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, {scope:'./'}).catch(()=>{}));
  defaultTime();updateDerived();syncContactForm();drawArchive();
})();
