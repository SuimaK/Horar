import type { WallTime } from './zoned';

const p2 = (n: number) => String(Math.abs(n)).padStart(2, '0');

export function formatDate(w: Pick<WallTime, 'year' | 'month' | 'day'>): string {
  return `${p2(w.day)}.${p2(w.month)}.${String(w.year).padStart(4, '0')}`;
}

export function formatTime(w: Pick<WallTime, 'hour' | 'minute' | 'second'>, withSeconds = w.second !== 0): string {
  return `${p2(w.hour)}:${p2(w.minute)}${withSeconds ? ':' + p2(w.second) : ''}`;
}

/** «UTC+03:00», «UTC−05:00», «UTC+02:30:17» (секунды — только если есть). */
export function formatOffset(offsetSeconds: number): string {
  const sign = offsetSeconds < 0 ? '−' : '+';
  const a = Math.abs(offsetSeconds);
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const s = a % 60;
  return `UTC${sign}${p2(h)}:${p2(m)}${s ? ':' + p2(s) : ''}`;
}

export function utcWall(utcMs: number): WallTime {
  const d = new Date(utcMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}
