/**
 * Перевод местного времени в UTC по базе часовых поясов IANA (через Intl,
 * встроенную в браузер базу ICU/tzdata с историей переводов часов).
 * Работает офлайн, без сервера.
 */

export interface WallTime {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      era: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Проверяет, что строка — известный браузеру часовой пояс IANA. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Миллисекунды UTC, соответствующие «настенному» времени, если считать его временем UTC. */
export function wallToNaiveMs(w: WallTime): number {
  const d = new Date(0);
  d.setUTCFullYear(w.year, w.month - 1, w.day);
  d.setUTCHours(w.hour, w.minute, w.second, 0);
  return d.getTime();
}

export function naiveMsToWall(ms: number): WallTime {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

/** Местное время в поясе timeZone для момента utcMs. */
export function wallTimeAt(utcMs: number, timeZone: string): WallTime {
  const parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  let year = Number(get('year'));
  if (get('era').startsWith('B')) year = 1 - year;
  return {
    year,
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

/** Смещение пояса от UTC (в секундах, восток положителен) в момент utcMs. */
export function offsetSecondsAt(utcMs: number, timeZone: string): number {
  const whole = Math.floor(utcMs / 1000) * 1000;
  return Math.round((wallToNaiveMs(wallTimeAt(whole, timeZone)) - whole) / 1000);
}

export interface UtcCandidate {
  utcMs: number;
  offsetSeconds: number;
}

export type LocalResolution =
  | { kind: 'ok'; candidate: UtcCandidate }
  | { kind: 'ambiguous'; candidates: [UtcCandidate, UtcCandidate] }
  | {
      kind: 'nonexistent';
      /** Момент перевода часов (UTC). */
      transitionUtcMs: number;
      /** Местное время, с которого часы переведены (по старому смещению). */
      gapStart: WallTime;
      /** Местное время, на которое часы переведены (по новому смещению). */
      gapEnd: WallTime;
      offsetBefore: number;
      offsetAfter: number;
    };

const HOUR = 3600_000;

/** Ищет момент смены смещения между a и b (UTC, мс) с точностью до секунды. */
function findTransition(a: number, b: number, timeZone: string): number {
  const oa = offsetSecondsAt(a, timeZone);
  let lo = a;
  let hi = b;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2000) * 1000;
    if (offsetSecondsAt(mid, timeZone) === oa) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Переводит местное время в UTC. Несуществующее время (пропуск при переходе
 * на летнее) и неоднозначное (повтор часа) возвращаются отдельно.
 */
export function resolveLocalTime(w: WallTime, timeZone: string): LocalResolution {
  const naive = wallToNaiveMs(w);
  const probes = [naive - 30 * HOUR, naive, naive + 30 * HOUR];
  const offsets = [...new Set(probes.map((p) => offsetSecondsAt(p, timeZone)))];
  const candidates: UtcCandidate[] = [];
  for (const off of offsets) {
    const utcMs = naive - off * 1000;
    if (offsetSecondsAt(utcMs, timeZone) === off && !candidates.some((c) => c.utcMs === utcMs)) {
      candidates.push({ utcMs, offsetSeconds: off });
    }
  }
  candidates.sort((a, b) => a.utcMs - b.utcMs);
  if (candidates.length === 1) return { kind: 'ok', candidate: candidates[0] };
  if (candidates.length >= 2) return { kind: 'ambiguous', candidates: [candidates[0], candidates[candidates.length - 1]] };

  const offsetBefore = offsetSecondsAt(probes[0], timeZone);
  const offsetAfter = offsetSecondsAt(probes[2], timeZone);
  const transitionUtcMs = findTransition(probes[0], probes[2], timeZone);
  return {
    kind: 'nonexistent',
    transitionUtcMs,
    gapStart: naiveMsToWall(transitionUtcMs + offsetBefore * 1000),
    gapEnd: naiveMsToWall(transitionUtcMs + offsetAfter * 1000),
    offsetBefore,
    offsetAfter,
  };
}
