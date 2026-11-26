/**
 * Ввод карты: только момент и место (ТЗ, раздел 2), без каких-либо
 * текстовых полей, тем, имён и т. п.
 */
import tzLookup from '@photostructure/tz-lookup';
import { MAX_VALIDATED_LATITUDE, parseCoordinate } from '../geo/coords';
import { parseDate, parseOffset, parseTime } from '../time/parse';
import { isValidTimeZone, resolveLocalTime, type WallTime } from '../time/zoned';

/** То, что вводит пользователь (и что хранится в архиве). */
export interface ChartInputRaw {
  date: string; // ДД.ММ.ГГГГ
  time: string; // ЧЧ:ММ[:СС]
  latitude: string;
  longitude: string;
  /** Название выбранного места (только для отображения). */
  placeName?: string;
  /** Пояс выбранного из справочника города; иначе определяется по координатам. */
  placeTimeZone?: string;
  timeZoneMode: 'auto' | 'offset';
  /** Ручное смещение, например «+03:00», при timeZoneMode = 'offset'. */
  manualOffset?: string;
  /** Выбор при неоднозначном местном времени (повторный час). */
  ambiguousChoice?: 'earlier' | 'later';
}

export type ErrorCode =
  | 'DATE_FORMAT'
  | 'DATE_INVALID'
  | 'DATE_OUT_OF_RANGE'
  | 'TIME_FORMAT'
  | 'LAT_FORMAT'
  | 'LON_FORMAT'
  | 'LATITUDE_OUTSIDE_VALIDATED_REGION'
  | 'LONGITUDE_OUT_OF_RANGE'
  | 'TIME_ZONE_UNKNOWN'
  | 'OFFSET_FORMAT'
  | 'LOCAL_TIME_NONEXISTENT'
  | 'LOCAL_TIME_AMBIGUOUS';

export type WarningCode = 'HISTORICAL_TIME_ZONE_PRE_1970';

export interface FieldError {
  code: ErrorCode;
  field: 'date' | 'time' | 'latitude' | 'longitude' | 'timeZone';
  /** Для LOCAL_TIME_NONEXISTENT: границы пропущенного интервала. */
  gap?: { start: WallTime; end: WallTime; timeZone: string };
  /** Для LOCAL_TIME_AMBIGUOUS: два варианта UTC. */
  options?: { utcMs: number; offsetSeconds: number }[];
}

/** Нормализованный момент и место, готовые к расчёту. */
export interface ChartMoment {
  local: WallTime;
  utcMs: number;
  /** Смещение местного времени от UTC в этот момент, секунды. */
  offsetSeconds: number;
  /** Пояс IANA или null при ручном смещении. */
  timeZone: string | null;
  latitude: number;
  longitude: number;
  placeName?: string;
  warnings: WarningCode[];
}

export type ValidationResult = { ok: true; moment: ChartMoment } | { ok: false; errors: FieldError[] };

/** Пояс IANA по координатам (офлайн-карта границ поясов). */
export function timeZoneForCoordinates(latitude: number, longitude: number): string {
  return tzLookup(latitude, longitude);
}

export function validateChartInput(raw: ChartInputRaw): ValidationResult {
  const errors: FieldError[] = [];

  const date = parseDate(raw.date);
  if (!date.ok) errors.push({ code: date.code, field: 'date' });
  const time = parseTime(raw.time);
  if (!time.ok) errors.push({ code: time.code, field: 'time' });

  const lat = parseCoordinate(raw.latitude, 'lat');
  const lon = parseCoordinate(raw.longitude, 'lon');
  if (!lat.ok || Math.abs(lat.value) > 90) errors.push({ code: 'LAT_FORMAT', field: 'latitude' });
  else if (Math.abs(lat.value) > MAX_VALIDATED_LATITUDE)
    errors.push({ code: 'LATITUDE_OUTSIDE_VALIDATED_REGION', field: 'latitude' });
  if (!lon.ok) errors.push({ code: 'LON_FORMAT', field: 'longitude' });
  else if (Math.abs(lon.value) > 180) errors.push({ code: 'LONGITUDE_OUT_OF_RANGE', field: 'longitude' });

  let timeZone: string | null = null;
  let manualOffset: number | null = null;
  if (raw.timeZoneMode === 'offset') {
    const o = parseOffset(raw.manualOffset ?? '');
    if (!o.ok) errors.push({ code: 'OFFSET_FORMAT', field: 'timeZone' });
    else manualOffset = o.offsetSeconds;
  } else if (raw.placeTimeZone) {
    if (isValidTimeZone(raw.placeTimeZone)) timeZone = raw.placeTimeZone;
    else errors.push({ code: 'TIME_ZONE_UNKNOWN', field: 'timeZone' });
  } else if (lat.ok && lon.ok && Math.abs(lat.value) <= 90 && Math.abs(lon.value) <= 180) {
    const tz = timeZoneForCoordinates(lat.value, lon.value);
    if (isValidTimeZone(tz)) timeZone = tz;
    else errors.push({ code: 'TIME_ZONE_UNKNOWN', field: 'timeZone' });
  }

  if (errors.length || !date.ok || !time.ok || !lat.ok || !lon.ok) return { ok: false, errors };

  const local: WallTime = { year: date.year, month: date.month, day: date.day, hour: time.hour, minute: time.minute, second: time.second };
  const warnings: WarningCode[] = [];
  if (date.year < 1970) warnings.push('HISTORICAL_TIME_ZONE_PRE_1970');

  let utcMs: number;
  let offsetSeconds: number;
  if (manualOffset !== null) {
    offsetSeconds = manualOffset;
    const d = new Date(0);
    d.setUTCFullYear(local.year, local.month - 1, local.day);
    d.setUTCHours(local.hour, local.minute, local.second, 0);
    utcMs = d.getTime() - manualOffset * 1000;
  } else {
    const tz = timeZone as string;
    const r = resolveLocalTime(local, tz);
    if (r.kind === 'nonexistent') {
      return {
        ok: false,
        errors: [{ code: 'LOCAL_TIME_NONEXISTENT', field: 'time', gap: { start: r.gapStart, end: r.gapEnd, timeZone: tz } }],
      };
    }
    if (r.kind === 'ambiguous') {
      if (!raw.ambiguousChoice) {
        return { ok: false, errors: [{ code: 'LOCAL_TIME_AMBIGUOUS', field: 'time', options: r.candidates }] };
      }
      const c = raw.ambiguousChoice === 'earlier' ? r.candidates[0] : r.candidates[1];
      utcMs = c.utcMs;
      offsetSeconds = c.offsetSeconds;
    } else {
      utcMs = r.candidate.utcMs;
      offsetSeconds = r.candidate.offsetSeconds;
    }
  }

  return {
    ok: true,
    moment: {
      local,
      utcMs,
      offsetSeconds,
      timeZone,
      latitude: lat.value,
      longitude: lon.value,
      placeName: raw.placeName,
      warnings,
    },
  };
}
