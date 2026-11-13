/* Readable view. A chart fact is not an event prediction. */
const names={Sun:'Солнце',Moon:'Луна',Mercury:'Меркурий',Venus:'Венера',Mars:'Марс',Jupiter:'Юпитер',Saturn:'Сатурн'};
const symbols={Sun:'☉',Moon:'☽',Mercury:'☿',Venus:'♀',Mars:'♂',Jupiter:'♃',Saturn:'♄'};
const zodiac=['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
const signNames=['Овне','Тельце','Близнецах','Раке','Льве','Деве','Весах','Скорпионе','Стрельце','Козероге','Водолее','Рыбах'];
const dignityNames={domicile:'обители',exaltation:'экзальтации',triplicity:'триплицитете',term:'терме',face:'фасе',detriment:'изгнании',fall:'падении'};
const aspects={CONJUNCTION:'соединение',SEXTILE:'секстиль',SQUARE:'квадрат',TRINE:'трин',OPPOSITION:'оппозиция'};
const mod=x=>(x%360+360)%360;
const defaultEscape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number(x).toFixed(2);
function spreadLabels(planets,minDegrees=19){
 const items=planets.map(p=>({...p,angle:mod(p.longitude_deg)})).sort((a,b)=>a.angle-b.angle);
 const angles=items.map(p=>p.angle);
 for(let step=0;step<100&&items.length>1;step++)for(let i=0;i<items.length;i++){
  const next=(i+1)%items.length;
  const gap=(next===0?angles[0]+360:angles[next])-angles[i];
  if(gap<minDegrees){const shift=(minDegrees-gap)/2;angles[i]-=shift;angles[next]+=shift;}
 }
 return items.map((x,i)=>({...x,display_angle:mod(angles[i])}));
}
export function readableWheel(result,{showAspects=false}={}){
 const chart=result?.chart;
 if(!Array.isArray(chart?.planets)||!Array.isArray(chart?.cusps)||chart.cusps.length!==12)
  return '<p class="info-box">Недостаточно данных для круга.</p>';
 const asc=chart.cusps[0].longitude_deg;
 const pos=(lon,r)=>{const theta=(180-(lon-asc))*Math.PI/180;return [260+r*Math.cos(theta),260+r*Math.sin(theta)];};
 const xy=(lon,r)=>pos(lon,r).map(num);
 let out='<svg class="chart-svg readable-wheel" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 520" role="img" aria-label="Хорарный круг: знаки зодиака, дома и семь планет с точками истинного положения">';
 out+='<circle cx="260" cy="260" r="243" fill="#fffefa" stroke="#b49a72" stroke-width="2"/>';
 out+='<circle cx="260" cy="260" r="210" fill="none" stroke="#b49a72" stroke-width="1.4"/>';
 out+='<circle cx="260" cy="260" r="126" fill="#fff" stroke="#d5cabe" stroke-width="1.3"/>';
 for(let i=0;i<12;i++){
  const a=xy(i*30,210),b=xy(i*30,243),t=xy(i*30+15,226);
  out+='<path d="M'+a.join(' ')+'L'+b.join(' ')+'" stroke="#c7b59b" stroke-width="1.1"/>';
  out+='<text x="'+t[0]+'" y="'+num(Number(t[1])+8)+'" text-anchor="middle" font-size="25" font-family="Georgia,serif" fill="#705b43">'+zodiac[i]+'</text>';
 }
 for(let i=0;i<12;i++){
  const lon=chart.cusps[i].longitude_deg,next=chart.cusps[(i+1)%12].longitude_deg;
  const a=xy(lon,126),b=xy(lon,210),t=xy(lon+mod(next-lon)/2,141),strong=[0,3,6,9].includes(i);
  out+='<path d="M'+a.join(' ')+'L'+b.join(' ')+'" stroke="'+(strong?'#887055':'#bfb8b0')+'" stroke-width="'+(strong?'2.1':'1.2')+'"/>';
  out+='<text x="'+t[0]+'" y="'+num(Number(t[1])+5)+'" text-anchor="middle" font-size="14" font-weight="'+(strong?'700':'500')+'" fill="#645d60">'+(i+1)+'</text>';
 }
 if(showAspects)for(const aspect of result.current_aspects||[]){
  if(!aspect.sign_compatible)continue;
  const p=chart.planets.find(x=>x.name===aspect.planet_a),q=chart.planets.find(x=>x.name===aspect.planet_b);
  if(!p||!q)continue;
  const a=xy(p.longitude_deg,121),b=xy(q.longitude_deg,121);
  out+='<path d="M'+a.join(' ')+'L'+b.join(' ')+'" stroke="'+(['SQUARE','OPPOSITION'].includes(aspect.aspect)?'#b26f6f':'#6c8391')+'" stroke-width="1.25" opacity=".75"/>';
 }
 out+='<circle cx="260" cy="260" r="43" fill="#fbf7ef" stroke="#eee5d9"/>';
 out+='<text x="260" y="259" text-anchor="middle" font-size="26" fill="#897152" font-family="Georgia,serif">✳</text>';
 out+='<text x="260" y="278" text-anchor="middle" font-size="10" letter-spacing="1.2" fill="#716978">ХОРАР</text>';
 const labels=spreadLabels(chart.planets.map(p=>({name:p.name,longitude_deg:mod(p.longitude_deg-asc),actual_lon:p.longitude_deg,retrograde:p.speed_deg_per_day<0})));
 for(const p of labels){
  const point=xy(p.actual_lon,200),head=xy(p.actual_lon,193),label=xy(asc+p.display_angle,172);
  out+='<path d="M'+head.join(' ')+'L'+label.join(' ')+'" stroke="#a69782" stroke-width="1" stroke-dasharray="2.5 2" fill="none"/>';
  out+='<circle cx="'+point[0]+'" cy="'+point[1]+'" r="3.7" fill="#88634a"/>';
  out+='<circle cx="'+label[0]+'" cy="'+label[1]+'" r="21" fill="#fffdf8" stroke="#8a796c" stroke-width="1.1"/>';
  out+='<text x="'+label[0]+'" y="'+num(Number(label[1])-2)+'" font-size="24" text-anchor="middle" font-family="Georgia,serif" fill="#28344c">'+symbols[p.name]+'</text>';
  out+='<text x="'+label[0]+'" y="'+num(Number(label[1])+14)+'" font-size="10" text-anchor="middle" font-weight="700" fill="#5e626d">'+Math.floor(mod(p.actual_lon)%30)+'°</text>';
  if(p.retrograde)out+='<text x="'+num(Number(label[0])+17)+'" y="'+num(Number(label[1])-14)+'" font-size="11" font-weight="700" fill="#a24f50">R</text>';
 }
 return out+'</svg>';
}
function renderSemanticPreview21(data,escape){
 const labels={ROLES_REQUIRED:'Нужен выбор и подтверждение домов',
  TOPIC_METHOD_REQUIRED:'Для темы требуется отдельная методическая проверка',
  EVENT_PATHS_REVIEW_ONLY:'Свидетельства события собраны для проверки',
  EVIDENCE_REVIEW_ONLY:'Расчётные свидетельства без итогового суждения'};
 const cards=(data.cards||[]).map(x=>
  '<section class="reading-item reading-'+escape(x.key)+'"><h4>'+escape(x.title)+'</h4><p>'+escape(x.text)+'</p></section>').join('');
 return '<section class="plain-reading" aria-label="Пошаговый разбор хорарной карты">'+
 '<h3>Что показывает хорар?</h3><p class="reading-intro">'+
 'Пошаговый разбор рассчитанных свидетельств по традиционной методике. '+
 'Астрология не имеет установленной научной предсказательной достоверности.</p>'+
 '<p class="reading-status">'+escape(labels[data.status]||'Сведения требуют проверки')+'</p>'+
 '<div class="reading-points">'+cards+'</div>'+
 '<p class="reading-topic">Этот анализ объясняет положение сигнификаторов, рецепции и пути совершенствования. '+
 'Он не подтверждает действительное отношение людей, наступление события или сроки.</p>'+
 '<div class="reading-conclusion"><strong>Предварительное заключение</strong><p>'+
 'Обоснованный итоговый прогноз не сформирован: геометрические кандидаты требуют смысловой проверки, '+
 'а неполный поиск нельзя толковать как отрицательный ответ.</p></div></section>';
}
export function readableInterpretation(result,input,escape=defaultEscape){
 if(result?.evidence?.interpretation_v21)return renderSemanticPreview21(result.evidence.interpretation_v21,escape);
 const roles=Array.isArray(result?.roles?.assignments)?result.roles.assignments:[];
 const correction=result?.evidence?.method_correction;
 const paragraphs=[];
 const positionStatement=planetName=>{
  const planet=result?.chart?.planets?.find(p=>p.name===planetName);
  if(!planet)return '';
  const house=correction?.house_placements?.find(p=>p.planet===planetName)?.effective_house||planet.house;
  const sign=signNames[Math.floor(mod(planet.longitude_deg)/30)];
  const d=correction?.essential?.placements?.find(p=>p.planet===planetName);
  const good=d?.own_essential_dignities?.filter(x=>x!=='triplicity'||d.owners?.triplicity?.status!=='AMBIGUOUS')||[];
  const weak=d?.own_essential_debilities||[];
  const own=good.length?' Есть собственное достоинство: '+good.map(x=>dignityNames[x]||x).join(', ')+'.':
    weak.length?' Есть существенная слабость: '+weak.map(x=>dignityNames[x]||x).join(', ')+'.':'';
  return ' Положение: <b>'+escape(sign)+', '+Number(house)+' дом</b>.'+(planet.speed_deg_per_day<0?' Планета ретроградна.':'')+escape(own);
 };
 if(roles[0]){
  const p=roles[0];
  paragraphs.push('В традиционной модели вы обозначены управителем I дома — <b>'+escape(names[p.effective_significator]||p.effective_significator)+'</b>.'+positionStatement(p.effective_significator));
 }
 if(roles[1]){
  const p=roles[1];
  paragraphs.push('Предмет вопроса отнесён к <b>'+Number(p.radical_house)+' дому</b>; его управитель — <b>'+escape(names[p.effective_significator]||p.effective_significator)+'</b>.'+positionStatement(p.effective_significator)+' Выбор дома требует методического обоснования.');
 }else paragraphs.push('Предмет вопроса пока не закреплён за домом. Уточните тему и назначение сигнификатора.');
 const a=roles[0]?.effective_significator,b=roles[1]?.effective_significator;
 if(a&&b&&a!==b){
  const aspect=(result.current_aspects||[]).find(x=>(x.planet_a===a&&x.planet_b===b||x.planet_b===a&&x.planet_a===b)&&x.sign_compatible);
  if(aspect)paragraphs.push('Между управителями сейчас наблюдается <b>'+escape(aspects[aspect.aspect]||aspect.aspect)+'</b> в условном орбисе 6° ('+(aspect.motion==='APPLYING'?'сходящийся':'расходящийся')+'). Сам по себе аспект не подтверждает событие.');
  else paragraphs.push('В пределах условного орбиса отображения 6° аспект между выбранными управителями не показан. Это не означает отсутствия будущего совершенствования.');
 }
 if(correction?.geometry){
  const first=correction.geometry.contacts?.[0];
  if(first)paragraphs.push('Численный поиск обнаружил возможный будущий <b>'+escape(aspects[first.aspect]||first.aspect)+'</b> между управителями'+(first.status==='AFTER_INGRESS_REVIEW'?' после смены знака':'')+'. Это расчётный кандидат, а не предсказание события или срока.');
  else paragraphs.push('В проверенном диапазоне точного прямого контакта не найдено. Другие каналы совершенствования остаются неполными.');
 }
 const certain=(correction?.role_receptions||[]).flatMap(x=>(x.evidence||[]).filter(e=>e.evidence_certainty==='CERTAIN'));
 if(certain.length){
  const specific=(correction.role_receptions||[]).flatMap(rel=>(rel.evidence||[]).filter(e=>
    e.evidence_certainty==='CERTAIN'&&e.polarity==='POSITIVE').map(e=>({
    from:e.from_planet,to:e.to_planet,kind:e.dignity_kind
  }))).slice(0,2);
  const witness=specific.map(x=>escape(names[x.from]||x.from)+' находится в '+escape(dignityNames[x.kind]||x.kind)+' '+escape(names[x.to]||x.to)).join('; ');
  paragraphs.push('В таблице обнаружены <b>направленные рецепции</b> ('+certain.length+' определённых свидетельств). '+
    (witness?'Например: '+witness+'. ':'')+
    'Рецепции — символические показатели; они не доказывают чувства, намерения или наступление события.');
 }
 if(correction?.sect_resolution?.status==='UNRESOLVED')paragraphs.push('Солнце около горизонта: часть триплицитетов не определена, но достоинства, не зависящие от секты, рассчитаны.');
 let topic='Для итогового ответа требуется проверенный анализ совершенствования, препятствий и контекста вопроса.';
 if(input?.intent_kind==='RELATIONSHIP')topic='В вопросах об отношениях заинтересованность, событие и качество отношений нельзя смешивать. Рецепции не доказывают реальные чувства.';
 if(input?.intent_kind==='CAREER')topic='В вопросах о работе должность, условия труда и выплата зарплаты рассматриваются раздельно.';
 if(['RECOVERY','LOCATION'].includes(input?.intent_kind))topic='Местонахождение вещи, её обнаружение и возвращение требуют разных свидетельств.';
 const condition=result?.judgment?.processing_status==='NEEDS_CLARIFICATION'?'Прежде необходимо уточнить данные или роли участников.':'Пока нельзя обоснованно ответить, произойдёт ли событие и когда: смысловой алгоритм совершенствования ещё не прошёл приёмку.';
 return '<section class="plain-reading" aria-label="Понятный разбор"><h3>Что показывает карта</h3>'+
  '<p class="reading-intro">Ниже — объяснение рассчитанных астрологических свидетельств. Итогового прогноза пока нет.</p>'+
  '<div class="reading-points">'+paragraphs.map(x=>'<p>'+x+'</p>').join('')+'</div>'+
  '<p class="reading-topic">'+escape(topic)+'</p>'+
  '<div class="reading-conclusion"><strong>Итог на текущем этапе</strong><p>'+escape(condition)+'</p></div></section>';
}
