/** Разбор полей даты и времени формы. */

export const MIN_YEAR = 1800;
export const MAX_YEAR = 2200;

export type DateParse =
  | { ok: true; year: number; month: number; day: number }
  | { ok: false; code: 'DATE_FORMAT' | 'DATE_INVALID' | 'DATE_OUT_OF_RANGE' };

export function parseDate(text: string): DateParse {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(text);
  if (!m) return { ok: false, code: 'DATE_FORMAT' };
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return { ok: false, code: 'DATE_INVALID' };
  if (year < MIN_YEAR || year > MAX_YEAR) return { ok: false, code: 'DATE_OUT_OF_RANGE' };
  return { ok: true, year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export type TimeParse =
  | { ok: true; hour: number; minute: number; second: number }
  | { ok: false; code: 'TIME_FORMAT' };

export function parseTime(text: string): TimeParse {
  const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(text);
  if (!m) return { ok: false, code: 'TIME_FORMAT' };
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = m[3] ? Number(m[3]) : 0;
  if (hour > 23 || minute > 59 || second > 59) return { ok: false, code: 'TIME_FORMAT' };
  return { ok: true, hour, minute, second };
}

export type OffsetParse = { ok: true; offsetSeconds: number } | { ok: false; code: 'OFFSET_FORMAT' };

/** Ручное смещение: «+03:00», «-5», «UTC+05:30», «−03:30». Диапазон −14…+14 ч. */
export function parseOffset(text: string): OffsetParse {
  const m = /^\s*(?:UTC|GMT)?\s*([+\-−])\s*(\d{1,2})(?::?(\d{2}))?\s*$/i.exec(text);
  if (!m) return { ok: false, code: 'OFFSET_FORMAT' };
  const h = Number(m[2]);
  const min = m[3] ? Number(m[3]) : 0;
  const total = (h * 60 + min) * 60 * (m[1] === '+' ? 1 : -1);
  if (min > 59 || Math.abs(total) > 14 * 3600) return { ok: false, code: 'OFFSET_FORMAT' };
  return { ok: true, offsetSeconds: total };
}
