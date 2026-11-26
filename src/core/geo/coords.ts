/** Разбор и форматирование географических координат. */

/** Граница проверенной области: у полярного круга квадрантные дома вырождаются. */
export const MAX_VALIDATED_LATITUDE = 65;

export type CoordParse = { ok: true; value: number } | { ok: false; code: 'COORD_FORMAT' };

const NEG = /^(s|ю|w|з)/i;
const POS = /^(n|с|e|в)/i;

/**
 * Принимает десятичные градусы («55.7558», «-33,87») и градусы-минуты-секунды
 * («55°45′», «55°45'30"», «55 45 30»), с буквой полушария или без:
 * N/S/E/W, с./ю./в./з. (в том числе «с.ш.», «з.д.»).
 */
export function parseCoordinate(text: string, axis: 'lat' | 'lon'): CoordParse {
  let s = text.trim().replace(/,/g, '.').replace(/−/g, '-');
  if (!s) return { ok: false, code: 'COORD_FORMAT' };
  let sign = 1;
  const letterRe = /\s*([NSEWnsewСЮВЗсювз])\.?\s*(?:[шдШД]\.?)?\s*$/;
  const tail = letterRe.exec(s);
  const head = /^\s*([NSEWnsewСЮВЗсювз])\.?\s*(?:[шдШД]\.?)?\s+/.exec(s);
  const letter = tail?.[1] ?? head?.[1];
  if (tail) s = s.slice(0, tail.index);
  else if (head) s = s.slice(head[0].length);
  if (letter) {
    const isLatLetter = /[NSnsСЮсю]/.test(letter);
    if (isLatLetter !== (axis === 'lat')) return { ok: false, code: 'COORD_FORMAT' };
    if (NEG.test(letter)) sign = -1;
    else if (!POS.test(letter)) return { ok: false, code: 'COORD_FORMAT' };
  }
  s = s.trim();
  if (s.startsWith('-')) {
    if (letter) return { ok: false, code: 'COORD_FORMAT' };
    sign = -sign;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) s = s.slice(1).trim();

  let value: number;
  if (/^\d+(\.\d+)?$/.test(s)) {
    value = Number(s);
  } else {
    const m = /^(\d+(?:\.\d+)?)\s*[°º\s]\s*(?:(\d+(?:\.\d+)?)\s*['′’]?\s*(?:(\d+(?:\.\d+)?)\s*(?:["″”]|'')?)?)?\s*$/.exec(s);
    if (!m) return { ok: false, code: 'COORD_FORMAT' };
    const deg = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    const sec = m[3] ? Number(m[3]) : 0;
    if (min >= 60 || sec >= 60 || ((m[2] || m[3]) && !Number.isInteger(deg))) return { ok: false, code: 'COORD_FORMAT' };
    value = deg + min / 60 + sec / 3600;
  }
  if (!Number.isFinite(value)) return { ok: false, code: 'COORD_FORMAT' };
  return { ok: true, value: sign * value };
}

/** «55°45′ N», «37°37′ E»; с секундами, если они не нулевые и withSeconds. */
export function formatCoordinate(value: number, axis: 'lat' | 'lon', withSeconds = false): string {
  const letter = axis === 'lat' ? (value < 0 ? 'S' : 'N') : value < 0 ? 'W' : 'E';
  const total = Math.round(Math.abs(value) * (withSeconds ? 3600 : 60));
  if (withSeconds) {
    const d = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${d}°${String(m).padStart(2, '0')}′${s ? String(s).padStart(2, '0') + '″' : ''} ${letter}`;
  }
  const d = Math.floor(total / 60);
  const m = total % 60;
  return `${d}°${String(m).padStart(2, '0')}′ ${letter}`;
}
