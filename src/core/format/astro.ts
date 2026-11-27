/** Форматирование астрономических величин для интерфейса. */
import { SIGNS, planetInfo, signIndex } from '../../method';
import type { DignityItem } from '../astro/dignities';

export const SIGN_SYMBOLS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const roman = (n: number) => ROMAN[n - 1];

/** Угол в °′″ (или °′), округление до целой секунды (минуты). */
export function dms(x: number, withSeconds = true): string {
  const unit = withSeconds ? 3600 : 60;
  let t = Math.round(Math.abs(x) * unit);
  const s = withSeconds ? t % 60 : 0;
  if (withSeconds) t = Math.floor(t / 60);
  const m = t % 60;
  const d = Math.floor(t / 60);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${x < 0 ? '−' : ''}${d}°${p2(m)}′${withSeconds ? p2(s) + '″' : ''}`;
}

/** Положение в знаке: «27°14′32″ Стрельца» → { degree: «27°14′32″», sign: «Стрелец», symbol }. */
export function zodiacal(lon: number, withSeconds = true) {
  // Округляем до отображаемой точности, чтобы 29°59′59,7″ не превращалось в «30°00′00″» того же знака.
  const unit = withSeconds ? 3600 : 60;
  const r = Math.round((((lon % 360) + 360) % 360) * unit) / unit;
  const k = signIndex(r % 360);
  return { degree: dms(r % 360 - k * 30, withSeconds), sign: SIGNS[k].name, symbol: SIGN_SYMBOLS[k] };
}

export function formatZodiacal(lon: number, withSeconds = true): string {
  const z = zodiacal(lon, withSeconds);
  return `${z.degree} ${z.symbol} ${z.sign}`;
}

/** Суточная скорость со знаком: «+0°59′08″», «−0°12′40″». */
export function formatSpeed(v: number): string {
  return (v < 0 ? '−' : '+') + dms(Math.abs(v));
}

export const objectName = (id: string) => planetInfo(id)?.name ?? id;
export const objectSymbol = (id: string) => planetInfo(id)?.symbol ?? '';

export function dignityLabel(d: DignityItem): string {
  switch (d.kind) {
    case 'domicile': return 'обитель';
    case 'exaltation': return 'экзальтация';
    case 'triplicity': return d.detail === 'day' ? 'триплицитет (дневной)' : 'триплицитет (ночной)';
    case 'term': return 'термы';
    case 'face': return 'фас';
    case 'detriment': return 'изгнание';
    case 'fall': return 'падение';
    case 'peregrine': return 'перегрин';
  }
}

export const signedPoints = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
