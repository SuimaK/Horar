// Генерирует компактный офлайн-справочник городов из GeoNames cities15000
// (данные GeoNames, CC BY 4.0, пакет npm `cities15000`).
// Запуск: node scripts/build-cities.mjs  → src/data/cities.generated.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = require('cities15000').file;
const out = join(root, 'src/data/cities.generated.json');
const hflabsCsv = readFileSync(join(root, 'data/sources/hflabs-city.csv'), 'utf8');
const overrides = JSON.parse(readFileSync(join(root, 'src/data/city-name-overrides.json'), 'utf8'));

const RU = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
const RUSSIAN_ONLY = /^[А-ЯЁа-яё][А-ЯЁа-яё\- ’'.()]*$/;

export function translit(s) {
  return [...s.toLowerCase()].map((c) => RU[c] ?? c).join('');
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const simplify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

/** Выбор русского названия из безъязыковых альтернативных имён GeoNames (эвристика). */
export function pickRussianName(ascii, alternates) {
  const latin = new Set(alternates.map(simplify));
  const target = simplify(ascii);
  let best = null;
  for (const cand of alternates) {
    if (!RUSSIAN_ONLY.test(cand)) continue;
    const t = simplify(translit(cand));
    let score = lev(t, target) / Math.max(t.length, target.length, 1);
    if (latin.has(t)) score -= 0.25;
    if (/[ъ]/.test(cand)) score += 0.15; // типично для болгарских написаний
    if (!best || score < best.score) best = { cand, score };
  }
  return best && best.score <= 0.6 ? best.cand : null;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/** Российские города из hflabs/city (CC BY-SA 4.0): русское название и регион. */
function loadRussianCities() {
  const [head, ...rows] = parseCsv(hflabsCsv);
  const col = (n) => head.indexOf(n);
  return rows.filter((r) => r.length === head.length).map((r) => ({
    name: r[col('city')] || r[col('settlement')] || (r[col('region_type')] === 'г' ? r[col('region')] : ''),
    region: r[col('region_type')] === 'г' ? '' : (r[col('region')] + (r[col('region_type')] ? ' ' + r[col('region_type')] : '')).replace(/ - Кузбасс/, ''),
    lat: Number(r[col('geo_lat')]),
    lon: Number(r[col('geo_lon')]),
  })).filter((c) => c.name && Number.isFinite(c.lat));
}

function distKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Ищет город hflabs рядом с точкой GeoNames и с похожим названием. */
function matchRussian(ru, ascii, alternates, lat, lon) {
  const target = simplify(ascii);
  const alts = new Set(alternates);
  let best = null;
  for (const c of ru) {
    if (Math.abs(c.lat - lat) > 0.3) continue;
    const d = distKm(c, { lat, lon });
    if (d > 25) continue;
    const t = simplify(translit(c.name));
    let score = lev(t, target) / Math.max(t.length, target.length, 1) + d / 100;
    if (alts.has(c.name)) score -= 0.5;
    if (!best || score < best.score) best = { c, score };
  }
  return best && best.score <= 0.5 ? best.c : null;
}

export const normalizeKey = (s) =>
  s.toLowerCase().replace(/ё/g, 'е').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function main() {
  const lines = readFileSync(src, 'utf8').split('\n').filter(Boolean);
  const tzs = [];
  const tzIndex = new Map();
  const rows = [];
  const russian = loadRussianCities();
  for (const line of lines) {
    const f = line.split('\t');
    const [id, name, ascii, alt, lat, lon, , , country, , admin1] = f;
    const population = Number(f[14]);
    const tz = f[17];
    const alternates = alt ? alt.split(',') : [];
    const ruMatch = country === 'RU' ? matchRussian(russian, ascii, alternates, Number(lat), Number(lon)) : null;
    const ru = overrides[id] ?? ruMatch?.name ?? pickRussianName(ascii, alternates);
    const region = ruMatch?.region ?? '';
    const cyr = alternates.filter((a) => /[А-Яа-яЁё]/.test(a));
    const keys = [...new Set([name, ascii, ...(ru ? [ru] : []), ...cyr].map(normalizeKey).filter(Boolean))];
    if (!tzIndex.has(tz)) { tzIndex.set(tz, tzs.length); tzs.push(tz); }
    rows.push([Number(id), ru ?? name, ru ? name : '', Number(Number(lat).toFixed(5)), Number(Number(lon).toFixed(5)), tzIndex.get(tz), country, region, population, keys.join('|')]);
  }
  rows.sort((a, b) => b[8] - a[8]);
  const data = {
    source: 'GeoNames cities15000 (CC BY 4.0), npm cities15000@0.0.1; русские названия городов России — hflabs/city (CC BY-SA 4.0)',
    fields: ['id', 'name', 'nameOriginal', 'lat', 'lon', 'tz', 'country', 'region', 'population', 'keys'],
    timezones: tzs,
    rows,
  };
  writeFileSync(out, JSON.stringify(data));
  console.log(`cities: ${rows.length} → ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(root, 'src/data'))) throw new Error('src/data missing');
  main();
}
