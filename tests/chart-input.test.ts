import { describe, expect, it } from 'vitest';
import { timeZoneForCoordinates, validateChartInput, type ChartInputRaw } from '../src/core/input/chart-input';
import { checkLine } from '../src/core/input/check-line';
import { errorMessage } from '../src/core/input/messages';

const base: ChartInputRaw = {
  date: '19.11.2026',
  time: '23:35',
  latitude: '55.7558',
  longitude: '37.6173',
  placeName: 'Москва',
  placeTimeZone: 'Europe/Moscow',
  timeZoneMode: 'auto',
};
const v = (patch: Partial<ChartInputRaw>) => validateChartInput({ ...base, ...patch });
const codes = (patch: Partial<ChartInputRaw>) => {
  const r = v(patch);
  return r.ok ? [] : r.errors.map((e) => e.code);
};

describe('validateChartInput', () => {
  it('строка проверки как в ТЗ (5.1)', () => {
    const r = v({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(checkLine(r.moment)).toBe('19.11.2026 23:35 (UTC+03:00) = 20:35 UTC, 55°45′ N 37°37′ E');
      expect(r.moment.timeZone).toBe('Europe/Moscow');
    }
  });

  it('дата UTC указывается, если отличается от местной', () => {
    const r = v({ time: '01:10' });
    expect(r.ok && checkLine(r.moment)).toBe('19.11.2026 01:10 (UTC+03:00) = 18.11.2026 22:10 UTC, 55°45′ N 37°37′ E');
  });

  it('широта ровно ±65° допускается', () => {
    expect(codes({ latitude: '65', placeTimeZone: undefined })).toEqual([]);
    expect(codes({ latitude: '-65', longitude: '-70', placeTimeZone: undefined })).toEqual([]);
  });

  it.each(['65.01', '-66', '68°58′ N', '89'])('широта %s → LATITUDE_OUTSIDE_VALIDATED_REGION', (lat) => {
    expect(codes({ latitude: lat })).toEqual(['LATITUDE_OUTSIDE_VALIDATED_REGION']);
  });

  it('широта больше 90° — ошибка формата, не ошибка области', () => {
    expect(codes({ latitude: '91' })).toEqual(['LAT_FORMAT']);
  });

  it('сообщение об ошибке широты содержит код и пояснение', () => {
    const m = errorMessage({ code: 'LATITUDE_OUTSIDE_VALIDATED_REGION', field: 'latitude' });
    expect(m).toContain('LATITUDE_OUTSIDE_VALIDATED_REGION');
    expect(m).toContain('не восходит');
  });

  it('несуществующее местное время — ошибка с границами пропуска', () => {
    const r = v({ date: '28.03.2010', time: '02:30' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0].code).toBe('LOCAL_TIME_NONEXISTENT');
    expect(errorMessage(r.errors[0])).toBe(
      'Такого местного времени не было: 28.03.2010 в поясе Europe/Moscow часы переведены с 02:00 сразу на 03:00. Укажите время до 02:00 или после 03:00.',
    );
  });

  it('неоднозначное время требует выбора; выбор даёт нужный UTC', () => {
    const p = { date: '31.10.2010', time: '02:30' };
    const r = v(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].code).toBe('LOCAL_TIME_AMBIGUOUS');
      expect(r.errors[0].options).toHaveLength(2);
    }
    const a = v({ ...p, ambiguousChoice: 'earlier' });
    const b = v({ ...p, ambiguousChoice: 'later' });
    expect(a.ok && new Date(a.moment.utcMs).toISOString()).toBe('2010-10-30T22:30:00.000Z');
    expect(b.ok && new Date(b.moment.utcMs).toISOString()).toBe('2010-10-30T23:30:00.000Z');
    expect(b.ok && b.moment.offsetSeconds).toBe(3 * 3600);
  });

  it('ручное смещение заменяет пояс и не проверяет переводы часов', () => {
    const r = v({ date: '28.03.2010', time: '02:30', timeZoneMode: 'offset', manualOffset: '+03:00' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.moment.timeZone).toBeNull();
      expect(new Date(r.moment.utcMs).toISOString()).toBe('2010-03-27T23:30:00.000Z');
    }
    expect(codes({ timeZoneMode: 'offset', manualOffset: '3' })).toEqual(['OFFSET_FORMAT']);
  });

  it('даты до 1970 года — предупреждение о часовых поясах', () => {
    const r = v({ date: '12.04.1961', time: '09:07' });
    expect(r.ok && r.moment.warnings).toEqual(['HISTORICAL_TIME_ZONE_PRE_1970']);
    const r2 = v({});
    expect(r2.ok && r2.moment.warnings).toEqual([]);
  });

  it('пояс по координатам при ручном вводе', () => {
    expect(timeZoneForCoordinates(55.03, 82.92)).toBe('Asia/Novosibirsk');
    expect(timeZoneForCoordinates(-33.87, 151.21)).toBe('Australia/Sydney');
    const r = v({ latitude: '55.03', longitude: '82.92', placeTimeZone: undefined, placeName: undefined });
    expect(r.ok && r.moment.timeZone).toBe('Asia/Novosibirsk');
    expect(r.ok && r.moment.offsetSeconds).toBe(7 * 3600);
  });

  it('несколько ошибок сразу', () => {
    expect(codes({ date: '1.13.2026', time: 'x', longitude: '200' }).sort()).toEqual(['DATE_INVALID', 'LONGITUDE_OUT_OF_RANGE', 'TIME_FORMAT']);
  });

  it('неизвестный пояс', () => {
    expect(codes({ placeTimeZone: 'Mars/Olympus' })).toEqual(['TIME_ZONE_UNKNOWN']);
  });
});
