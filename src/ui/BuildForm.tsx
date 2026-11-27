import { useMemo, useState } from 'preact/hooks';
import type { City } from '../core/geo/cities';
import {
  timeZoneForCoordinates,
  validateChartInput,
  type ChartInputRaw,
  type ChartMoment,
  type FieldError,
} from '../core/input/chart-input';
import { checkLine } from '../core/input/check-line';
import { ambiguousOptionLabel, errorMessage, warningMessage } from '../core/input/messages';
import { parseCoordinate } from '../core/geo/coords';
import { formatDate, formatOffset, formatTime } from '../core/time/format';
import { parseOffset } from '../core/time/parse';
import { isValidTimeZone, offsetSecondsAt, wallTimeAt, type WallTime } from '../core/time/zoned';
import { CitySearch, cityLabel } from './CitySearch';
import { maskDate, maskTime } from './masks';
import { loadLastPlace, saveLastPlace } from './storage';

type Field = FieldError['field'];

/** Пояс, который форма использует сейчас (для кнопки «Сейчас» и подсказки). */
function effectiveTimeZone(raw: ChartInputRaw): string | null {
  if (raw.timeZoneMode === 'offset') return null;
  if (raw.placeTimeZone && isValidTimeZone(raw.placeTimeZone)) return raw.placeTimeZone;
  const lat = parseCoordinate(raw.latitude, 'lat');
  const lon = parseCoordinate(raw.longitude, 'lon');
  if (lat.ok && lon.ok && Math.abs(lat.value) <= 90 && Math.abs(lon.value) <= 180) {
    const tz = timeZoneForCoordinates(lat.value, lon.value);
    return isValidTimeZone(tz) ? tz : null;
  }
  return null;
}

function nowIn(raw: ChartInputRaw): WallTime {
  const now = Date.now();
  const tz = effectiveTimeZone(raw);
  if (tz) return wallTimeAt(now, tz);
  if (raw.timeZoneMode === 'offset') {
    const o = parseOffset(raw.manualOffset ?? '');
    if (o.ok) {
      const d = new Date(now + o.offsetSeconds * 1000);
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: 0 };
    }
  }
  const d = new Date(now);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: 0 };
}

function initialInput(): ChartInputRaw {
  const last = loadLastPlace();
  const raw: ChartInputRaw = {
    date: '',
    time: '',
    latitude: last?.latitude ?? '',
    longitude: last?.longitude ?? '',
    placeName: last?.placeName,
    placeTimeZone: last?.placeTimeZone,
    timeZoneMode: 'auto',
    manualOffset: '',
  };
  const now = nowIn(raw);
  return { ...raw, date: formatDate(now), time: formatTime({ ...now, second: 0 }, false) };
}

const coordText = (v: number) => String(Number(v.toFixed(4)));

interface Props {
  onBuild: (m: ChartMoment) => void;
}

export function BuildForm({ onBuild }: Props) {
  const [raw, setRaw] = useState<ChartInputRaw>(initialInput);
  const [placeQuery, setPlaceQuery] = useState(raw.placeName ?? '');
  const [touched, setTouched] = useState<Set<Field>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const update = (patch: Partial<ChartInputRaw>) =>
    setRaw((r) => {
      const next = { ...r, ...patch };
      // Смена даты, времени или места сбрасывает выбор для повторного часа.
      if ('date' in patch || 'time' in patch || 'latitude' in patch || 'longitude' in patch || 'placeTimeZone' in patch) {
        next.ambiguousChoice = patch.ambiguousChoice;
      }
      return next;
    });
  const touch = (f: Field) => setTouched((t) => (t.has(f) ? t : new Set(t).add(f)));

  const result = useMemo(() => validateChartInput(raw), [raw]);
  const errors = result.ok ? [] : result.errors;
  const visible = (f: Field) =>
    errors.filter(
      (e) => e.field === f && (submitted || touched.has(f) || e.code === 'LOCAL_TIME_NONEXISTENT' || e.code === 'LOCAL_TIME_AMBIGUOUS' || e.code === 'LATITUDE_OUTSIDE_VALIDATED_REGION'),
    );
  const placeEmpty = !raw.latitude.trim() && !raw.longitude.trim();
  const tz = effectiveTimeZone(raw);

  const selectCity = (c: City) => {
    setPlaceQuery(cityLabel(c));
    update({
      placeName: cityLabel(c),
      placeTimeZone: c.timeZone,
      latitude: coordText(c.latitude),
      longitude: coordText(c.longitude),
    });
  };

  const editCoord = (patch: Partial<ChartInputRaw>) => {
    update({ ...patch, placeName: undefined, placeTimeZone: undefined });
    setPlaceQuery('');
  };

  const submit = (e: Event) => {
    e.preventDefault();
    setSubmitted(true);
    if (!result.ok) return;
    saveLastPlace({ placeName: raw.placeName, placeTimeZone: raw.placeTimeZone, latitude: raw.latitude, longitude: raw.longitude });
    onBuild(result.moment);
  };

  const setNow = () => {
    const n = nowIn(raw);
    update({ date: formatDate(n), time: formatTime({ ...n, second: 0 }, false) });
  };

  const ambiguous = errors.find((e) => e.code === 'LOCAL_TIME_AMBIGUOUS');
  const chosenAmbiguous = raw.ambiguousChoice;

  return (
    <form class="build-form" onSubmit={submit} noValidate>
      {placeEmpty && <p class="empty-state">Укажите момент и место, чтобы построить карту неба.</p>}

      <div class="row two">
        <label class="field">
          <span class="label">Дата</span>
          <input
            id="date"
            inputMode="numeric"
            placeholder="ДД.ММ.ГГГГ"
            enterKeyHint="next"
            autocomplete="off"
            value={raw.date}
            aria-invalid={visible('date').length > 0}
            onInput={(e) => update({ date: maskDate((e.target as HTMLInputElement).value) })}
            onFocus={selectAll}
            maxLength={10}
            onBlur={() => touch('date')}
          />
        </label>
        <label class="field">
          <span class="label">Время (местное)</span>
          <input
            id="time"
            inputMode="numeric"
            placeholder="ЧЧ:ММ, например 2335"
            autocomplete="off"
            value={raw.time}
            aria-invalid={visible('time').length > 0}
            onInput={(e) => update({ time: maskTime((e.target as HTMLInputElement).value) })}
            onFocus={selectAll}
            maxLength={8}
            onBlur={() => touch('time')}
          />
        </label>
      </div>
      <FieldErrors errors={[...visible('date'), ...visible('time').filter((e) => e.code !== 'LOCAL_TIME_AMBIGUOUS')]} />

      {(ambiguous || chosenAmbiguous) && (
        <fieldset class="ambiguous">
          <legend>{errorMessage({ code: 'LOCAL_TIME_AMBIGUOUS', field: 'time' })}</legend>
          {(ambiguous?.options ?? ambiguousOptionsFor(raw)).map((o, i) => (
            <label class="radio" key={o.utcMs}>
              <input
                type="radio"
                name="ambiguous"
                checked={chosenAmbiguous === (i === 0 ? 'earlier' : 'later')}
                onChange={() => update({ ambiguousChoice: i === 0 ? 'earlier' : 'later' })}
              />
              {ambiguousOptionLabel(o, i)}
            </label>
          ))}
        </fieldset>
      )}

      <div class="field">
        <label class="label" for="place">Место</label>
        <CitySearch
          value={placeQuery}
          onInput={setPlaceQuery}
          onSelect={selectCity}
          placeholder={!placeEmpty && !raw.placeName ? "Координаты введены вручную" : undefined}
        />
      </div>

      <div class="row two">
        <label class="field">
          <span class="label">Широта</span>
          <input
            id="latitude"
            inputMode="decimal"
            placeholder="55.7558 или 55°45′ N"
            autocomplete="off"
            value={raw.latitude}
            aria-invalid={visible('latitude').length > 0}
            onInput={(e) => editCoord({ latitude: (e.target as HTMLInputElement).value })}
            onBlur={() => touch('latitude')}
          />
        </label>
        <label class="field">
          <span class="label">Долгота</span>
          <input
            id="longitude"
            inputMode="decimal"
            placeholder="37.6173 или 37°37′ E"
            autocomplete="off"
            value={raw.longitude}
            aria-invalid={visible('longitude').length > 0}
            onInput={(e) => editCoord({ longitude: (e.target as HTMLInputElement).value })}
            onBlur={() => touch('longitude')}
          />
        </label>
      </div>
      <FieldErrors errors={[...visible('latitude'), ...visible('longitude')]} />

      <div class="field">
        <span class="label">Часовой пояс</span>
        {raw.timeZoneMode === 'auto' ? (
          <div class="tz-line">
            <span id="tz-auto">{tz ? `${tz}, по месту` : 'определится по месту'}</span>
            <button type="button" class="link" onClick={() => update({ timeZoneMode: 'offset', manualOffset: raw.manualOffset || suggestOffset(raw, tz) })}>
              Задать смещение вручную
            </button>
          </div>
        ) : (
          <div class="tz-line">
            <input
              id="offset"
              class="offset"
              placeholder="+03:00"
              autocomplete="off"
              value={raw.manualOffset}
              aria-label="Смещение от UTC"
              aria-invalid={visible('timeZone').length > 0}
              onInput={(e) => update({ manualOffset: (e.target as HTMLInputElement).value })}
              onBlur={() => touch('timeZone')}
            />
            <button type="button" class="link" onClick={() => update({ timeZoneMode: 'auto' })}>
              Определять по месту
            </button>
          </div>
        )}
      </div>
      <FieldErrors errors={visible('timeZone')} />

      <div class="check" aria-live="polite">
        {result.ok ? (
          <>
            <p class="check-line" id="check-line">{checkLine(result.moment)}</p>
            {result.moment.warnings.map((w) => (
              <p class="hint warning" key={w}>{warningMessage(w)}</p>
            ))}
          </>
        ) : (
          <p class="check-line muted">Строка проверки появится, когда поля заполнены.</p>
        )}
      </div>

      <div class="actions">
        <button type="button" class="secondary" onClick={setNow}>Сейчас</button>
        <button type="submit" class="primary" id="build">Построить карту</button>
      </div>
    </form>
  );
}

function suggestOffset(raw: ChartInputRaw, tz: string | null): string {
  if (!tz) return '';
  const r = validateChartInput({ ...raw, ambiguousChoice: raw.ambiguousChoice ?? 'earlier' });
  const off = r.ok ? r.moment.offsetSeconds : offsetSecondsAt(Date.now(), tz);
  return formatOffset(off - (off % 60)).replace('UTC', '').replace('−', '-');
}

/** Варианты для уже сделанного выбора (чтобы радиокнопки не пропадали). */
function ambiguousOptionsFor(raw: ChartInputRaw) {
  const r = validateChartInput({ ...raw, ambiguousChoice: undefined });
  return !r.ok ? (r.errors.find((e) => e.code === 'LOCAL_TIME_AMBIGUOUS')?.options ?? []) : [];
}

/** При фокусе поле выделяется целиком: новое значение набирается поверх старого. */
function selectAll(e: FocusEvent) {
  const el = e.target as HTMLInputElement;
  requestAnimationFrame(() => el.select());
}

function FieldErrors({ errors }: { errors: FieldError[] }) {
  if (!errors.length) return null;
  return (
    <div class="errors" role="alert">
      {errors.map((e) => (
        <p class="hint error" key={e.code} data-code={e.code}>{errorMessage(e)}</p>
      ))}
    </div>
  );
}
