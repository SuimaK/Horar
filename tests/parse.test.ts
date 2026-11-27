import { describe, expect, it } from 'vitest';
import { formatCoordinate, parseCoordinate } from '../src/core/geo/coords';
import { formatOffset } from '../src/core/time/format';
import { parseDate, parseOffset, parseTime } from '../src/core/time/parse';

describe('дата', () => {
  it.each([
    ['19.11.2026', true],
    ['1.1.1800', true],
    ['31.12.2200', true],
    ['29.02.2000', true],
  ])('%s принимается', (s, ok) => expect(parseDate(s).ok).toBe(ok));

  it.each([
    ['2026-11-19', 'DATE_FORMAT'],
    ['19.11.26', 'DATE_FORMAT'],
    ['31.02.2026', 'DATE_INVALID'],
    ['29.02.2100', 'DATE_INVALID'],
    ['31.12.1799', 'DATE_OUT_OF_RANGE'],
    ['01.01.2201', 'DATE_OUT_OF_RANGE'],
  ])('%s → %s', (s, code) => expect(parseDate(s)).toEqual({ ok: false, code }));
});

describe('время', () => {
  it('ЧЧ:ММ и ЧЧ:ММ:СС', () => {
    expect(parseTime('23:35')).toEqual({ ok: true, hour: 23, minute: 35, second: 0 });
    expect(parseTime('7:05:09')).toEqual({ ok: true, hour: 7, minute: 5, second: 9 });
  });
  it.each(['24:00', '12:60', '12', '12:5', '12:00:60'])('%s отклоняется', (s) => expect(parseTime(s).ok).toBe(false));
});

describe('ручное смещение', () => {
  it.each([
    ['+03:00', 10800],
    ['-5', -18000],
    ['UTC+05:30', 19800],
    ['−03:30', -12600],
    ['+0545', 20700],
  ])('%s → %i с', (s, v) => expect(parseOffset(s)).toEqual({ ok: true, offsetSeconds: v }));
  it.each(['03:00', '+15:00', '+03:75', 'abc'])('%s отклоняется', (s) => expect(parseOffset(s).ok).toBe(false));
  it('форматирование', () => {
    expect(formatOffset(10800)).toBe('UTC+03:00');
    expect(formatOffset(-12600)).toBe('UTC−03:30');
    expect(formatOffset(9017)).toBe('UTC+02:30:17');
  });
});

describe('координаты', () => {
  const lat = (s: string) => {
    const r = parseCoordinate(s, 'lat');
    return r.ok ? Number(r.value.toFixed(6)) : r.code;
  };
  const lon = (s: string) => {
    const r = parseCoordinate(s, 'lon');
    return r.ok ? Number(r.value.toFixed(6)) : r.code;
  };
  it('десятичные градусы', () => {
    expect(lat('55.7558')).toBe(55.7558);
    expect(lat('-33,8688')).toBe(-33.8688);
    expect(lat('−33.8688')).toBe(-33.8688);
  });
  it('градусы, минуты, секунды и полушарие', () => {
    expect(lat('55°45′ N')).toBe(55.75);
    expect(lat("55°45'30\"")).toBe(55.758333);
    expect(lat('55 45')).toBe(55.75);
    expect(lat('33°52′ S')).toBe(-33.866667);
    expect(lat('33°52′ ю.ш.')).toBe(-33.866667);
    expect(lat('S 33.5')).toBe(-33.5);
    expect(lon('37°37′ E')).toBe(37.616667);
    expect(lon('73°59′ з.д.')).toBe(-73.983333);
    expect(lon('73.98W')).toBe(-73.98);
  });
  it('ошибки', () => {
    expect(lat('55°75′')).toBe('COORD_FORMAT');
    expect(lat('37°37′ E')).toBe('COORD_FORMAT');
    expect(lon('55 N')).toBe('COORD_FORMAT');
    expect(lat('-33 S')).toBe('COORD_FORMAT');
    expect(lat('')).toBe('COORD_FORMAT');
    expect(lat('север')).toBe('COORD_FORMAT');
  });
  it('форматирование', () => {
    expect(formatCoordinate(55.7558, 'lat')).toBe('55°45′ N');
    expect(formatCoordinate(37.6173, 'lon')).toBe('37°37′ E');
    expect(formatCoordinate(-33.8688, 'lat')).toBe('33°52′ S');
    expect(formatCoordinate(-0.1276, 'lon')).toBe('0°08′ W');
    expect(formatCoordinate(59.99999, 'lat')).toBe('60°00′ N');
  });
});
