import { describe, expect, it } from 'vitest';
import { offsetSecondsAt, resolveLocalTime, type WallTime } from '../src/core/time/zoned';

const w = (s: string): WallTime => {
  const [d, t] = s.split(' ');
  const [year, month, day] = d.split('-').map(Number);
  const [hour, minute, second = 0] = t.split(':').map(Number);
  return { year, month, day, hour, minute, second };
};
const iso = (ms: number) => new Date(ms).toISOString().replace('.000', '');

describe('resolveLocalTime', () => {
  it('обычное время: Москва, 19.11.2026 23:35 = 20:35 UTC', () => {
    const r = resolveLocalTime(w('2026-11-19 23:35'), 'Europe/Moscow');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(iso(r.candidate.utcMs)).toBe('2026-11-19T20:35:00Z');
    expect(r.candidate.offsetSeconds).toBe(3 * 3600);
  });

  it('пропущенный час при переходе на летнее время: Москва, 28.03.2010 02:30', () => {
    const r = resolveLocalTime(w('2010-03-28 02:30'), 'Europe/Moscow');
    expect(r.kind).toBe('nonexistent');
    if (r.kind !== 'nonexistent') return;
    expect(r.gapStart).toMatchObject({ hour: 2, minute: 0 });
    expect(r.gapEnd).toMatchObject({ hour: 3, minute: 0 });
    expect(iso(r.transitionUtcMs)).toBe('2010-03-27T23:00:00Z');
  });

  it('повторный час: Москва, 31.10.2010 02:30 — два варианта UTC', () => {
    const r = resolveLocalTime(w('2010-10-31 02:30'), 'Europe/Moscow');
    expect(r.kind).toBe('ambiguous');
    if (r.kind !== 'ambiguous') return;
    expect(r.candidates.map((c) => iso(c.utcMs))).toEqual(['2010-10-30T22:30:00Z', '2010-10-30T23:30:00Z']);
    expect(r.candidates.map((c) => c.offsetSeconds / 3600)).toEqual([4, 3]);
  });

  it('Нью-Йорк: пропуск 08.03.2026 02:30 и повтор 01.11.2026 01:30', () => {
    expect(resolveLocalTime(w('2026-03-08 02:30'), 'America/New_York').kind).toBe('nonexistent');
    const r = resolveLocalTime(w('2026-11-01 01:30'), 'America/New_York');
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.candidates.map((c) => iso(c.utcMs))).toEqual(['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z']);
  });

  it('Южное полушарие: Сидней, пропуск 04.10.2026 02:30 и повтор 05.04.2026 02:30', () => {
    expect(resolveLocalTime(w('2026-10-04 02:30'), 'Australia/Sydney').kind).toBe('nonexistent');
    const r = resolveLocalTime(w('2026-04-05 02:30'), 'Australia/Sydney');
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.candidates.map((c) => c.offsetSeconds / 3600)).toEqual([11, 10]);
  });

  it('получасовой перевод часов: остров Лорд-Хау, 04.10.2026 02:15', () => {
    const r = resolveLocalTime(w('2026-10-04 02:15'), 'Australia/Lord_Howe');
    expect(r.kind).toBe('nonexistent');
    if (r.kind === 'nonexistent') {
      expect(r.gapStart).toMatchObject({ hour: 2, minute: 0 });
      expect(r.gapEnd).toMatchObject({ hour: 2, minute: 30 });
    }
  });

  it('нецелые пояса: Калькутта +05:30, Катманду +05:45', () => {
    const a = resolveLocalTime(w('2026-06-01 12:00'), 'Asia/Kolkata');
    const b = resolveLocalTime(w('2026-06-01 12:00'), 'Asia/Kathmandu');
    expect(a.kind === 'ok' && a.candidate.offsetSeconds).toBe(5.5 * 3600);
    expect(b.kind === 'ok' && b.candidate.offsetSeconds).toBe(5.75 * 3600);
  });

  it('местное среднее время до введения поясов: Москва, 1800 год, +02:30:17', () => {
    const r = resolveLocalTime(w('1800-06-01 12:00'), 'Europe/Moscow');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.candidate.offsetSeconds).toBe(2 * 3600 + 30 * 60 + 17);
  });

  it('декретное время и отмена летнего: Москва 2011–2014 (+4), с 26.10.2014 (+3)', () => {
    expect(offsetSecondsAt(Date.UTC(2012, 0, 1), 'Europe/Moscow')).toBe(4 * 3600);
    expect(offsetSecondsAt(Date.UTC(2015, 0, 1), 'Europe/Moscow')).toBe(3 * 3600);
  });

  it('дата 2200 года обрабатывается', () => {
    expect(resolveLocalTime(w('2200-12-31 23:59'), 'Europe/London').kind).toBe('ok');
  });
});
