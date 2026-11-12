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
  const intentRu = {EVENT:'Событие',CONTACT:'Контакт',PRESERVATION:'Сохранение',STATUS:'Состояние',QUALITY:'Качество',COMPARISON:'Сравнение',TIMING:'Срок',RETURN:'Возвращение',RECOVERY:'Поиск',LOCATION:'Местонахождение',PAST_FACT:'Факт в прошлом'};
  const statusRu = {RESULT_READY:'Суждение готово',NEEDS_CLARIFICATION:'Нужно уточнение',NEEDS_EXPERT_REVIEW:'Требуется экспертный разбор',TOPIC_MODULE_REQUIRED:'Необходим тематический модуль',SEARCH_INCOMPLETE:'Поиск путей неполный',SAFETY_LIMITED:'Ограничение по безопасности',CALCULATION_ERROR:'Ошибка расчёта'};
  const statusHints = {DIRECT_GEOMETRY:'Точная геометрия',SIGN_CHANGE_REVIEW:'Проверить переход знака',INTERVENING_CONTACT_REVIEW:'Проверить вмешательство',INTERRUPTION_REVIEW:'Возможное препятствие'};
  const esc = val => String(val ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const deg = v=>{const x=((v%360)+360)%360;return `${String(Math.floor(x%30)).padStart(2,'0')}°${String(Math.floor((x%1)*60)).padStart(2,'0')}′ ${signs[Math.floor(x/30)]}`};
  const dateRU = value => {try{return new Date(value).toLocaleString('ru-RU',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC'}catch{return String(value)}};
  const uuid = () => crypto?.randomUUID?.() || `q-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  let records = readRecords();
  let active = null;
  let revisionSource = null;

  function readRecords() {
    try {const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}
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
      raw_text:raw,context:$('questionContext').value,
      question_owner_id:$('ownerId').value.trim()||'я', speaker_id:$('speakerId').value.trim()||'я',
      intent_kind:$('intent').value,relay_mode:$('relay').value,
      moment_local:timeWithOffset,zone_name:$('zoneName').value.trim(),location_label:$('placeLabel').value.trim(),
      latitude_deg:Number($('latitude').value),longitude_deg:Number($('longitude').value),
      coordinate_source:($('latitude').dataset.source==='questioner' && $('longitude').dataset.source==='questioner')?'questioner':'configured',
      house_system:'REGIOMONTANUS',method_profile:'frawley_early',
      house_path:house?[Number(house),...(derived?[Number(derived)]:[])]:[],roles_locked:$('lockRoles').checked};
    if(!$('latitude').value||!$('longitude').value)throw Error('Введите широту и долготу места построения.');
    if(!Number.isFinite(p.latitude_deg)||!Number.isFinite(p.longitude_deg))throw Error('Координаты должны быть числами.');
    return p;
  }
  function recordResult(input,result) {
    let group=records.find(x=>x.question_id===input.question_id);
    if(!group){group={question_id:input.question_id,revisions:[]};records.unshift(group)}
    if(group.revisions.some(x=>x.input.revision===input.revision))throw Error('Ревизия уже существует; перезагрузите карту.');
    const item={input,result,saved_at:new Date().toISOString()};
    group.revisions.push(item);
    active=item;
    persist();
    revisionSource=null;
  }
  async function createChart(ev) {
    ev.preventDefault();hideToast();
    let payload;
    try{payload=getPayload()}catch(e){toast(e.message);return}
    const btn=$('buildBtn'),old=btn.innerHTML;
    btn.disabled=true;btn.innerHTML='<span>Выполняется точный расчёт…</span><span class="button-arrow">◷</span>';
    try{
      // No HTTP API or background upload: compute exclusively on the device.
      await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
      if(typeof window.horaryBuild!=='function')throw Error('Не загружен локальный расчётный модуль. Обновите страницу.');
      const data=await window.horaryBuild(payload);
      if(!data?.chart?.source_chart_hash||!data?.judgment?.processing_status)throw Error('Неполный результат локального расчёта.');
      recordResult(payload,data);newQuestion();renderAll();go('chart');
    }catch(e){toast(e?.message||'Локальный расчёт не выполнен; сохранённые карты доступны в архиве.')}
    finally{btn.disabled=false;btn.innerHTML=old}
  }

  function svgWheel(r) {
    const chart=r.chart, ps=chart.planets, cusp=chart.cusps;
    const asc=cusp[0].longitude_deg;
    const pos=(longitude,radius)=>{const th=Math.PI-(longitude-asc)*Math.PI/180;return [200+radius*Math.cos(th),200+radius*Math.sin(th)]};
    let out=`<svg class="chart-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="Круговая хорарная карта: 12 домов Региомонтануса и семь традиционных планет">`;
    out+=`<defs><radialGradient id="g" cx="50%" cy="50%"><stop offset="0" stop-color="#fffefa"/><stop offset="1" stop-color="#f5f0e6"/></radialGradient></defs>`;
    out+=`<circle cx="200" cy="200" r="184" fill="url(#g)" stroke="#b99c6d" stroke-width="1.5"/>`;
    out+=`<circle cx="200" cy="200" r="160" fill="none" stroke="#d6c8af" stroke-width="1"/>`;
    out+=`<circle cx="200" cy="200" r="91" fill="#fffdf9" stroke="#d6c8af" stroke-width="1"/>`;
    // zodiac boundaries and symbols
    for(let i=0;i<12;i++){
      const p1=pos(i*30,160),p2=pos(i*30,184),txt=pos(i*30+15,172);
      out+=`<path d="M${p1[0].toFixed(2)},${p1[1].toFixed(2)} L${p2[0].toFixed(2)},${p2[1].toFixed(2)}" stroke="#c9b89a" stroke-width=".8"/>`;
      out+=`<text x="${txt[0].toFixed(2)}" y="${(txt[1]+5).toFixed(2)}" text-anchor="middle" font-family="Georgia,serif" font-size="17" fill="#aa8c5e">${signs[i]}</text>`;
    }
    // house boundaries and house numbers
    for(let i=0;i<12;i++){
      const lon=cusp[i].longitude_deg,a=pos(lon,91),b=pos(lon,160);
      out+=`<path d="M${a[0].toFixed(2)},${a[1].toFixed(2)} L${b[0].toFixed(2)},${b[1].toFixed(2)}" stroke="${i===0?'#a47747':'#d7d3ce'}" stroke-width="${i===0?2.2:1}"/>`;
      const next=cusp[(i+1)%12].longitude_deg;const sector=(next-lon+360)%360;
      const t=pos(lon+sector/2,103);
      out+=`<text x="${t[0].toFixed(2)}" y="${(t[1]+3).toFixed(2)}" fill="#aa9c8d" font-size="10" font-family="Arial,sans-serif" text-anchor="middle">${i+1}</text>`;
    }
    // angular aspect lines, never interpreted as outcome
    for(const asp of r.current_aspects||[]){
      if(!asp.sign_compatible)continue;
      const a=ps.find(x=>x.name===asp.planet_a),b=ps.find(x=>x.name===asp.planet_b);
      if(!a||!b)continue;
      const aa=pos(a.longitude_deg,86),bb=pos(b.longitude_deg,86);
      out+=`<path d="M${aa[0].toFixed(1)},${aa[1].toFixed(1)} L${bb[0].toFixed(1)},${bb[1].toFixed(1)}" stroke="${['SQUARE','OPPOSITION'].includes(asp.aspect)?'#b89b9a':'#bda06f'}" stroke-opacity=".55" stroke-width="1.2"/>`;
    }
    const ordered=[...ps].sort((a,b)=>a.longitude_deg-b.longitude_deg);
    const choices=[];
    for(const p of ordered){
      const angle=(p.longitude_deg-asc+360)%360;
      const nearby=choices.some(x=>Math.abs(((angle-x+540)%360)-180)<10);
      const radius=nearby?149:136;choices.push(angle);
      const xy=pos(p.longitude_deg,radius);
      out+=`<circle cx="${xy[0].toFixed(2)}" cy="${xy[1].toFixed(2)}" r="12" fill="#fffbf2" stroke="#ded3bf" stroke-width=".9"/>`;
      out+=`<text x="${xy[0].toFixed(2)}" y="${(xy[1]+5.5).toFixed(2)}" fill="#453a45" font-size="19" font-family="Georgia,serif" text-anchor="middle">${glyph[p.name]}</text>`;
      if(p.speed_deg_per_day<0)out+=`<text x="${(xy[0]+9).toFixed(2)}" y="${(xy[1]-6).toFixed(2)}" font-family="Arial" font-size="8" fill="#ad6f5a">R</text>`;
    }
    out+=`<circle cx="200" cy="200" r="40" fill="none" stroke="#e9e3d9"/><text x="200" y="197" text-anchor="middle" fill="#b29360" font-size="25" font-family="Georgia,serif">✳</text><text x="200" y="216" text-anchor="middle" font-size="7" letter-spacing="2" fill="#a2a0a7" font-family="Arial,sans-serif">HORARY</text></svg>`;
    return out;
  }
  function renderChart(){
    if(!active)return;
    const r=active.result,chart=r.chart,roles=r.roles.assignments,j=r.judgment,p=active.input;
    const desc=roles.map(a=>`<div class="metric"><label>${a.role_kind==='QUERENT'?'Кверент · I дом':`Предмет · ${a.radical_house} дом`}</label><strong>${glyph[a.base_lord]} ${esc(ru[a.base_lord])}</strong><small>${a.role_kind==='QUERENT'?'L1':'Управитель куспида'}</small></div>`).join('');
    const planets=chart.planets.map(p=>`<div class="planet-item"><span class="planet-name"><span class="planet-symbol">${glyph[p.name]}</span> ${esc(ru[p.name])}${p.speed_deg_per_day<0?'<sup class="mini-r">R</sup>':''}</span><span class="planet-position">${deg(p.longitude_deg)}<small>${p.house} дом · ${p.speed_deg_per_day.toFixed(3)}°/сут.</small></span></div>`).join('');
    const aspects=(r.current_aspects||[]).length?r.current_aspects.slice(0,15).map(a=>`<div class="aspect-item"><strong>${esc(ru[a.planet_a])} <span class="aspect-glyph">${aspectGlyph[a.aspect]}</span> ${esc(ru[a.planet_b])}</strong><small>${Number(a.orb_deg).toFixed(2)}° · ${a.motion==='APPLYING'?'сходящийся':'расходящийся'}${a.sign_compatible?'':' · вне знаковой связи'}</small></div>`).join(''):'<p class="small-note">В пределах 6° орбиса мажорные аспекты не найдены.</p>';
    $('chartContent').innerHTML=`<div class="page-top"><div><div class="sub">КАРТА · РЕВИЗИЯ ${p.revision}</div><h2>Хорарный круг</h2></div><button type="button" class="mini-action" data-action="revise">↻ Ревизия</button></div><p class="question-title">${esc(p.raw_text)}</p><div class="meta-row"><span class="tag">${esc(intentRu[p.intent_kind])}</span><span class="tag">Региомонтанус</span><span class="tag">7 планет</span></div><div class="chart-card">${svgWheel(r)}<div class="chart-legend"><span><i class="legend-dot"></i> Границы домов</span><span>R — ретроградность</span></div></div><p class="inline-note">${esc(p.location_label||'Указанные координаты')} · ${esc(dateRU(chart.moment_utc))} · ${esc(p.moment_local.slice(-6))} местное смещение</p><div class="status-band"><strong>${esc(statusRu[j.processing_status]||j.processing_status)}</strong>${esc(j.event_assessment)}</div><div class="compact-head"><h3>Сигнификаторы</h3><small>${r.roles.status==='CONFIRMED'?'Роли подтверждены':'Требуют уточнения'}</small></div><div class="two-cols">${desc}</div><div class="compact-head"><h3>Планеты</h3><small>Тропический зодиак</small></div><div class="planet-list">${planets}</div><div class="compact-head"><h3>Аспекты в карте</h3><small>Орбис ≤ 6°</small></div><div>${aspects}</div><div class="action-row"><button type="button" class="secondary-button" data-tab="interpretation">Смотреть разбор →</button><button type="button" class="secondary-button" data-action="download-record">Экспорт JSON</button></div><p class="small-note">Положения планет и куспидов технически рассчитаны; показанные линии и аспекты не являются готовым астрологическим суждением.</p>`;
  }
  function renderMethodEvidence(r){
    const e=r.evidence;
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
    const roleText=byActors?`<p class="small-note">Рецепции по подтверждённым ролям: ${byActors.reception_evidence_by_actor.length} направлений. Тема: OTHER (без предположений о сюжете вопроса). ${byActors.analysis_status==='NEEDS_EXPERT_REVIEW'?'Есть совпадающие сигнификаторы, необходим эксперт.':'Вывод о намерениях, действиях и событии не сделан.'}</p>`:
      '<p class="small-note">Для связи рецепций с участниками необходимо подтвердить и заблокировать роли.</p>';
    const acc=e.accidental?.planets||[];
    const accTable=`<div class="method-table-wrap"><table class="method-table"><thead><tr><th>Планета</th><th>Дом, движение</th><th>Солнце</th></tr></thead><tbody>${acc.map(p=>`<tr><td>${cap(ru[p.planet])}<small>${p.is_in_house_joy?'Радость в доме '+p.house_joy_number:''}</small></td><td>Дом ${p.house} · ${cap(houseRu[p.house_class])}<small>${cap(motionRu[p.motion.direction])} · ${cap(speedRu[p.motion.relative_speed])}</small></td><td>${cap(stateRu[p.solar.state])}<small>${p.planet==='Sun'?'':p.solar.distance_deg.toFixed(2)+'° до Солнца'}${p.moon_phase?' · '+cap({WAXING:'Луна растёт',WANING:'Луна убывает',NEW_MOON_BOUNDARY:'Новолуние',FULL_MOON_BOUNDARY:'Полнолуние'}[p.moon_phase]):''}</small></td></tr>`).join('')}</tbody></table></div>`;
    return `<div class="section-mini">МЕТОДИКА · версии 1.1 и 1.2</div><p class="small-note">Секта: <b>${sector}</b> (геометрическая высота Солнца ${Number(e.sect_info?.solar_altitude_deg).toFixed(2)}°). Источник достоинств: Олешко, 1999, с. 55; акцидентальных правил: ранний Фроули и отдельный справочник скоростей Олешко, с. 57. Исправленное издание Фроули 2014 не сверено.</p><details class="method-evidence" open><summary>Эссенциальные достоинства · v1.1</summary>${essentialTable}<h4>Направленные рецепции</h4>${recHtml}${paired}${roleText}</details><details class="method-evidence" open><summary>Акцидентальные факторы · v1.2</summary>${accTable}<p class="small-note">«Быстрее/медленнее» — проектные пороги, не количественные правила Фроули. По мгновенной скорости станция не подтверждается. Близость к куспидам, осада, звёзды и влияние контекста не анализируются.</p></details><p class="inline-note">Обе группы свидетельств — сведения традиционной астрологической модели, не предсказание и не факт поведения людей. Баллы и автоматическое «да/нет» не рассчитываются.</p>`;
  }
  function renderInterpretation(){
    if(!active)return;
    const r=active.result, j=r.judgment, ps=r.path_search,roles=r.roles,p=active.input;
    const evidence=j.key_evidence.map(e=>`<div class="evidence-item"><div><strong>${esc(e.rule_id)} · ${esc(e.evidence_id)}</strong><p>${esc(e.chart_fact)}</p></div></div>`).join('');
    const paths=ps.paths.length?ps.paths.map(x=>{const c=x.contacts[0];return `<div class="path-item"><span class="pill">${esc(statusHints[x.geometry_status]||x.geometry_status)}</span><p><b>${esc(ru[c.planet_a])} ${aspectGlyph[c.aspect]} ${esc(ru[c.planet_b])}</b><span> · ${esc(aspectRu[c.aspect])}</span></p><small>${esc(dateRU(c.contact_utc))} · канал DIRECT</small>${(x.review_reasons||[]).length?`<p>${x.review_reasons.map(esc).join('; ')}</p>`:''}</div>`}).join(''):'<div class="info-box">Подтверждённые будущие прямые аспекты основной пары в установленном горизонте не обнаружены или поиск не запущен. Это не означает «нет».</div>';
    const unknown=j.unknowns.map(v=>`<li>${esc(v)}</li>`).join('');
    const roleReasons=roles.review_reasons.length?`<div class="info-box"><b>Нужно проверить роли:</b><ul class="unknown-list">${roles.review_reasons.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>`:'';
    $('interpretationContent').innerHTML=`<div class="page-top"><div><div class="sub">ДОКАЗАТЕЛЬНЫЙ РАЗБОР</div><h2>Протокол суждения</h2></div><button type="button" class="mini-action" data-action="download-record">↓ JSON</button></div><p class="question-title">${esc(p.raw_text)}</p><div class="status-band ${j.processing_status==='SAFETY_LIMITED'?'risk':''}"><strong>${esc(statusRu[j.processing_status]||j.processing_status)}</strong>${esc(j.event_assessment)}</div><div class="section-mini">Клиентская формулировка</div><p class="interpret-lead">${esc(j.client_text)}</p><div class="two-cols"><div class="metric"><label>Возможность события</label><strong style="font-size:16px">Не установлена</strong><small>${esc(j.judgment_status)}</small></div><div class="metric"><label>Оценка результата</label><strong style="font-size:16px">Не определена</strong><small>Расчётные признаки ≠ итоговое суждение</small></div></div><div class="section-mini">Пути совершенствования</div><div class="small-note">Горизонт: 30 суток. Проверен только будущий точный прямой контакт выбранных сигнификаторов. Передача / собирание света и специализированные пути не исследованы.</div><div class="path-list">${paths}</div>${roleReasons}${renderMethodEvidence(r)}<div class="section-mini">Экспертные свидетельства</div><div class="evidence-list">${evidence}</div><div class="section-mini">Неизвестное / ограничения</div><ul class="unknown-list">${unknown}</ul><div class="info-box">${esc(j.expert_text)}</div><p class="small-note">Хэш исходных данных: <span style="overflow-wrap:anywhere">${esc(r.chart.source_chart_hash)}</span><br>Версия: ${esc(j.calculation_version)}<br>Профиль: ${esc(j.method_profile)}</p><div class="action-row"><button type="button" class="secondary-button" data-tab="chart">← К карте</button><button type="button" class="secondary-button" data-action="download-record">Сохранить разбор</button></div>`;
  }
  function renderAll(){renderChart();renderInterpretation();drawArchive()}

  function drawArchive(){
    const count=records.reduce((total,g)=>total+(g.revisions?.length||0),0);
    const items=records.flatMap(g=>(g.revisions||[]).map(x=>x)).sort((a,b)=>new Date(b.saved_at)-new Date(a.saved_at));
    const html=items.map(item=>{
      const {input, result}=item;
      return `<div class="archive-item"><div class="date">${esc(dateRU(result.chart.moment_utc))} · R${input.revision}</div><h3>${esc(input.raw_text)}</h3><div class="bottom"><span>${esc(input.location_label||'Без названия города')} · ${esc(intentRu[input.intent_kind])}</span><button type="button" data-action="open" data-id="${esc(input.question_id)}" data-revision="${input.revision}">Открыть →</button></div></div>`;
    }).join('');
    $('archiveContent').innerHTML=`<div class="page-top"><div><div class="sub">ВАША БИБЛИОТЕКА</div><h2>Архив хораров</h2></div><span class="version-tag">${count} записей</span></div><p class="small-note">Все карты хранятся только на этом устройстве. При очистке данных Safari они могут исчезнуть — делайте резервные копии.</p><div class="archive-controls"><button type="button" class="secondary-button" data-action="export-all">↓ Экспорт архива</button><button type="button" class="secondary-button" data-action="import-all">↑ Импорт архива</button></div><input type="file" id="importFile" accept="application/json,.json" class="file-upload"><div>${html||'<div class="empty-screen"><div class="empty-icon">▤</div><h2>Архив пока пуст</h2><p>Первая построенная карта автоматически появится здесь.</p></div>'}</div>`;
  }
  function revise(){
    if(!active)return;
    revisionSource=active;
    const input=active.input;
    $('questionText').value=input.raw_text;
    $('questionText').readOnly=true;
    $('questionContext').value=input.context;
    $('intent').value=input.intent_kind;
    $('ownerId').value=input.question_owner_id||'я';$('speakerId').value=input.speaker_id||'я';
    $('relay').value=input.relay_mode;
    $('momentLocal').value=input.moment_local.slice(0,19);
    $('offset').value=input.moment_local.slice(-6);
    $('zoneName').value=input.zone_name;
    $('placeLabel').value=input.location_label;
    $('latitude').value=input.latitude_deg;
    $('longitude').value=input.longitude_deg;
    $('latitude').dataset.source=input.coordinate_source||'configured';
    $('longitude').dataset.source=input.coordinate_source||'configured';
    $('subjectHouse').value=input.house_path?.[0]||'';
    $('turnedHouse').value=input.house_path?.[1]||'';
    $('lockRoles').checked=input.roles_locked;
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
    defaultTime();updateDerived();hideToast();go('question');
  }
  function downloadJson(obj,filename){
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'});
    const link=document.createElement('a');const url=URL.createObjectURL(blob);
    link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  async function importAll(file){
    if(!file||file.size>15*1024*1024){alert('Выберите JSON-архив не более 15 МБ.');return}
    try{
      const src=JSON.parse(await file.text());
      if(src?.format!=='horary-iphone-archive-v1'||!Array.isArray(src.records))throw Error('Неизвестный формат архива.');
      let added=0, duplicates=0;
      const draft=JSON.parse(JSON.stringify(records)); // atomically commit only a fully checked archive
      if(src.records.length>5000)throw Error('Слишком много групп вопросов в архиве.');
      for(const group of src.records){
        if(typeof group?.question_id!=='string'||group.question_id.length>100||
           !Array.isArray(group.revisions)||group.revisions.length>1000)throw Error('Повреждена группа записей.');
        let target=draft.find(x=>x.question_id===group.question_id);
        if(!target){target={question_id:group.question_id,revisions:[]};draft.push(target)}
        for(const item of group.revisions){
          const hash=item?.result?.chart?.source_chart_hash;
          if(item?.input?.question_id!==group.question_id||!Number.isInteger(item?.input?.revision)||
             item?.result?.question?.question_id!==group.question_id||
             item?.result?.question?.raw_text!==item?.input?.raw_text||
             item?.result?.question?.revision!==item?.input?.revision||
             item?.result?.chart?.question_id!==group.question_id||
             !/^[a-f0-9]{64}$/.test(hash||'')||
             item?.result?.judgment?.source_chart_hash!==hash||
             typeof item?.result?.judgment?.processing_status!=='string')throw Error('Повреждена ревизия архива.');
          const existing=target.revisions.find(x=>x.input.revision===item.input.revision);
          if(existing){
            if(existing.result.chart.source_chart_hash!==hash)throw Error(`Конфликт: вопрос ${group.question_id} / ревизия ${item.input.revision} содержит другую карту.`);
            duplicates++;
          }else{
            target.revisions.push(item);added++;
          }
        }
      }
      records=draft;
      persist();drawArchive();alert(`Импорт завершён. Добавлено: ${added}; совпадающих ревизий пропущено: ${duplicates}.`);
    }catch(e){alert(`Ошибка импорта: ${e.message}`)}
  }
  function delegation(event){
    const t=event.target.closest('button');if(!t)return;
    if(t.dataset.tab){go(t.dataset.tab);return}
    const a=t.dataset.action;
    if(a==='download-record'&&active)downloadJson({format:'horary-iphone-record-v1',...active},`horary-${active.input.question_id}-r${active.input.revision}.json`);
    if(a==='revise')revise();
    if(a==='open'){
      const group=records.find(x=>x.question_id===t.dataset.id);
      const item=group?.revisions?.find(x=>x.input.revision===Number(t.dataset.revision));
      if(item){active=item;renderAll();go('chart')}
    }
    if(a==='export-all')downloadJson({format:'horary-iphone-archive-v1',exported_at:new Date().toISOString(),records},'horary-backup.json');
    if(a==='import-all')$('importFile')?.click();
  }
  document.addEventListener('click',delegation);
  document.addEventListener('change',e=>{if(e.target.id==='importFile'&&e.target.files[0])importAll(e.target.files[0])});
  ['latitude','longitude'].forEach(id=>$(id).addEventListener('input',()=>{$(id).dataset.source='configured';}));
  $('subjectHouse').addEventListener('change',updateDerived);
  $('turnedHouse').addEventListener('change',updateDerived);
  $('questionForm').addEventListener('submit',createChart);
  $('nowBtn').addEventListener('click',defaultTime);
  $('locationBtn').addEventListener('click',()=>{
    if(!navigator.geolocation){toast('Геолокация в этом браузере недоступна. Введите координаты вручную.');return}
    navigator.geolocation.getCurrentPosition(p=>{
      $('latitude').value=p.coords.latitude.toFixed(6);
      $('longitude').value=p.coords.longitude.toFixed(6);
      $('latitude').dataset.source='questioner';$('longitude').dataset.source='questioner';
      hideToast();
    },()=>toast('Не удалось получить координаты. Разрешите геолокацию для сайта или введите данные вручную.'),
    {enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  });
  $('aboutBtn').addEventListener('click',()=>$('aboutDialog').showModal());
  $('closeAbout').addEventListener('click',()=>$('aboutDialog').close());
  $('aboutDone').addEventListener('click',()=>$('aboutDialog').close());
  $('newQuestionBtn').addEventListener('click',newQuestion);
  $('resetBtn').addEventListener('click',newQuestion);
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, {scope:'./'}).catch(()=>{}));
  defaultTime();updateDerived();drawArchive();
})();
