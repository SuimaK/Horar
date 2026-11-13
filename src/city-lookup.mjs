/* Optional, explicit location lookup. Horary chart calculations stay on-device.
 * Manual city search: Open-Meteo/GeoNames (CC BY 4.0, attribution in UI).
 * GPS reverse lookup: BigDataCloud, only after user consent, live GPS only.
 */
const finite=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const display=(value,max=100)=>typeof value==='string'?value.trim().slice(0,max):'';
export function selectLocationCoordinates(lat,lon){
  if(!finite(lat,-90,90)||!finite(lon,-180,180))throw Error('Сервис вернул некорректные координаты');
  if(Math.abs(lat)>65)throw Error('Город находится вне поддерживаемого диапазона широт −65…65°');
  return {latitude_deg:Number(lat.toFixed(6)),longitude_deg:Number(lon.toFixed(6))};
}
export async function findCities(query,fetcher=globalThis.fetch){
  const q=display(query,110);
  if(q.length<2)throw Error('Введите не менее двух букв названия города');
  if(typeof fetcher!=='function')throw Error('Поиск городов недоступен без интернет-соединения');
  const url='https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({
    name:q,count:'8',language:'ru',format:'json'
  });
  const response=await fetcher(url,{headers:{Accept:'application/json'}});
  if(!response?.ok)throw Error('Не удалось получить список городов');
  const json=await response.json();
  if(!Array.isArray(json?.results))return [];
  return json.results.filter(item=>item&&finite(item.latitude,-90,90)&&finite(item.longitude,-180,180)&&
    display(item.name).length>0).slice(0,8).map(item=>({
    name:display(item.name),region:display(item.admin1),country:display(item.country),
    latitude_deg:item.latitude,longitude_deg:item.longitude,
    timezone:display(item.timezone,64),
    place_label:[display(item.name),display(item.admin1),display(item.country)].filter(Boolean).join(', ')
  }));
}
export async function findCityForLiveGps(latitude,longitude,fetcher=globalThis.fetch){
  selectLocationCoordinates(latitude,longitude);
  if(typeof fetcher!=='function')throw Error('Не удалось определить название города без интернета');
  const url='https://api.bigdatacloud.net/data/reverse-geocode-client?'+new URLSearchParams({
    latitude:String(latitude),longitude:String(longitude),localityLanguage:'ru'
  });
  const response=await fetcher(url,{headers:{Accept:'application/json'}});
  if(!response?.ok)throw Error('Сервис определения города временно недоступен');
  const value=await response.json();
  const city=display(value?.city)||display(value?.locality);
  const country=display(value?.countryName);
  return {city,country,place_label:[city,country].filter(Boolean).join(', ')};
}
// Offset for the selected date and IANA time zone (not today's UTC offset).
export function offsetForLocalMoment(local,timezone){
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(local))return null;
  if(typeof timezone!=='string'||timezone.length>80||!timezone.trim())return null;
  const utc=Date.parse(local+(local.length===16?':00':'')+'Z');
  if(!Number.isFinite(utc))return null;
  let formatter;
  try{formatter=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
    second:'2-digit',hourCycle:'h23'})}catch{return null}
  const read=t=>{
    const parts=Object.fromEntries(formatter.formatToParts(new Date(t)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    const localAsUTC=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
    return Math.round((localAsUTC-t)/60000);
  };
  // Two iterations resolve normal DST differences, while the ambiguous hour
  // still requires user confirmation.
  let off=read(utc);
  off=read(utc-off*60000);
  if(!Number.isFinite(off)||Math.abs(off)>14*60)return null;
  const sign=off>=0?'+':'-';const abs=Math.abs(off);
  return sign+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0');
}
