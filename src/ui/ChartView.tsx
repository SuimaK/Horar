import { useEffect, useState } from 'preact/hooks';
import { computeChart, dignitiesForSect, type Chart, type ChartObject, type ChartSettings } from '../core/astro/chart';
import { HouseGridError, HOUSE_SYSTEMS } from '../core/astro/houses';
import { jdFromUnixMs } from '../core/astro/math';
import {
  dignityLabel, dms, formatSpeed, formatZodiacal, objectName, objectSymbol, roman, signedPoints, zodiacal,
} from '../core/format/astro';
import type { ChartMoment } from '../core/input/chart-input';
import { checkLine } from '../core/input/check-line';
import { SIGNS, TERMS } from '../method';
import { browserStore } from './ephemeris';

interface Props {
  moment: ChartMoment;
  settings: ChartSettings;
  onSettings: (s: ChartSettings) => void;
  onEdit: () => void;
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; chart: Chart };

export function ChartView({ moment, settings, onSettings, onEdit }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [tab, setTab] = useState<'planets' | 'houses'>('planets');

  useEffect(() => {
    let cancelled = false;
    const jd = jdFromUnixMs(moment.utcMs);
    browserStore()
      .then(async (store) => {
        await store.ensure(jd);
        const chart = computeChart(moment, settings, store);
        if (!cancelled) setState({ kind: 'ok', chart });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message =
          e instanceof HouseGridError
            ? e.message
            : `Не удалось загрузить таблицы эфемерид. Проверьте подключение и повторите. (${e instanceof Error ? e.message : String(e)})`;
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [moment, settings]);

  return (
    <section class="chart" aria-labelledby="chart-title">
      <div class="chart-head">
        <h2 id="chart-title">Карта</h2>
        <button type="button" class="secondary small" onClick={onEdit}>Изменить ввод</button>
      </div>
      <p class="check-line">{checkLine(moment)}</p>
      {moment.placeName && <p class="muted place">{moment.placeName}</p>}

      {state.kind === 'loading' && <p class="muted">Загрузка таблиц эфемерид…</p>}
      {state.kind === 'error' && <p class="hint error" role="alert">{state.message}</p>}
      {state.kind === 'ok' && (
        <>
          <ChartHeader chart={state.chart} moment={moment} />
          <div class="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'planets'} class={tab === 'planets' ? 'tab active' : 'tab'} onClick={() => setTab('planets')}>Планеты</button>
            <button role="tab" aria-selected={tab === 'houses'} class={tab === 'houses' ? 'tab active' : 'tab'} onClick={() => setTab('houses')}>Дома</button>
          </div>
          {tab === 'planets' ? <PlanetsTable chart={state.chart} /> : <HousesTable chart={state.chart} />}
        </>
      )}

      <SettingsPanel settings={settings} onChange={onSettings} />
    </section>
  );
}

function sectLabel(chart: Chart): string {
  if (chart.sect.sect === null) return `секта не определена: центр Солнца в ${dms(Math.abs(chart.sect.sunAltitude), false)} от горизонта`;
  return chart.sect.sect === 'day' ? 'дневная карта' : 'ночная карта';
}

function ChartHeader({ chart, moment }: { chart: Chart; moment: ChartMoment }) {
  const system = HOUSE_SYSTEMS.find((h) => h.id === chart.settings.houseSystem)!.name;
  return (
    <dl class="chart-header">
      <div><dt>Часовой пояс</dt><dd>{moment.timeZone ?? 'смещение задано вручную'}</dd></div>
      <div><dt>Асцендент</dt><dd>{formatZodiacal(chart.angles.asc)}</dd></div>
      <div><dt>MC</dt><dd>{formatZodiacal(chart.angles.mc)}</dd></div>
      <div><dt>Дома</dt><dd>{system}</dd></div>
      <div><dt>Секта</dt><dd title="Высота центра Солнца над горизонтом без рефракции; в пределах ±0°30′ секта не определяется.">{sectLabel(chart)}</dd></div>
      <div><dt>Эфемериды</dt><dd title={`ΔT = ${chart.deltaTSeconds.toFixed(1)} с; наклон эклиптики ${dms(chart.obliquity)}`}>{chart.versions.ephemeris}</dd></div>
    </dl>
  );
}

function dignityText(o: ChartObject, chart: Chart) {
  if (!o.dignities) return null;
  const list = (d: { items: { kind: string; points: number; detail?: string }[] }) =>
    d.items.map((i) => `${dignityLabel(i as never)} ${signedPoints(i.points)}`).join(', ');
  const d = dignitiesForSect(o, chart.sect.sect);
  if (d) return { text: list(d), score: signedPoints(d.score) };
  const { day, night } = o.dignities;
  return {
    text: `днём: ${list(day)}; ночью: ${list(night)}`,
    score: `${signedPoints(day.score)} / ${signedPoints(night.score)}`,
  };
}

function PlanetsTable({ chart }: { chart: Chart }) {
  return (
    <div>
      <ul class="rows" aria-label="Положения планет и точек">
        {chart.objects.map((o) => {
          const z = zodiacal(o.lon);
          const dig = dignityText(o, chart);
          return (
            <li key={o.id} class="row-item">
              <div class="row-main">
                <span class="row-name"><span aria-hidden="true" class="glyph">{objectSymbol(o.id)}</span> {objectName(o.id)}</span>
                <span class="row-value">{z.degree} <span aria-hidden="true">{z.symbol}</span> {z.sign}</span>
              </div>
              <div class="row-meta">
                <span>{roman(o.house)} дом{o.nearCusp ? `, у куспида ${roman(o.nearCusp)}` : ''}</span>
                {o.speed !== undefined && (
                  <span class="mono">
                    {formatSpeed(o.speed)} в сутки{o.retrograde ? ', ретроградный' : ''}
                  </span>
                )}
              </div>
              {dig && (
                <div class="row-meta">
                  <span>{dig.text}</span>
                  <span class="mono score" title="Сумма баллов существенных достоинств">{dig.score}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p class="hint muted">
        Термы: {TERMS[chart.settings.terms].name}. Триплицитет: по Дорофею, управитель по секте карты. Балл — сумма слагаемых, без оценок.
      </p>
    </div>
  );
}

function HousesTable({ chart }: { chart: Chart }) {
  const name = (id: string) => SIGNS.find((s) => s.sign === id)!.name;
  return (
    <ul class="rows" aria-label="Дома карты">
      {chart.houses.map((h) => {
        const z = zodiacal(h.cusp);
        return (
          <li key={h.number} class="row-item">
            <div class="row-main">
              <span class="row-name">{roman(h.number)} дом</span>
              <span class="row-value">{z.degree} <span aria-hidden="true">{z.symbol}</span> {z.sign}</span>
            </div>
            <div class="row-meta">
              <span>управитель — {objectName(h.ruler)}, в {roman(h.rulerHouse)} доме</span>
            </div>
            <div class="row-meta">
              <span>в доме: {h.objects.map(objectName).join(', ') || 'нет объектов'}</span>
              {h.intercepted.length > 0 && <span>перехвачен: {h.intercepted.map(name).join(', ')}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SettingsPanel({ settings, onChange }: { settings: ChartSettings; onChange: (s: ChartSettings) => void }) {
  const set = (patch: Partial<ChartSettings>) => onChange({ ...settings, ...patch });
  return (
    <details class="settings">
      <summary>Настройки расчёта</summary>
      <label class="field">
        <span class="label">Система домов</span>
        <select value={settings.houseSystem} onChange={(e) => set({ houseSystem: (e.target as HTMLSelectElement).value as ChartSettings['houseSystem'] })}>
          {HOUSE_SYSTEMS.map((h) => <option key={h.id} value={h.id}>{h.name}{h.id === 'regiomontanus' ? ' (по умолчанию)' : ''}</option>)}
        </select>
      </label>
      <label class="field">
        <span class="label">Узлы</span>
        <select value={settings.nodes} onChange={(e) => set({ nodes: (e.target as HTMLSelectElement).value as ChartSettings['nodes'] })}>
          <option value="mean">средние (по умолчанию)</option>
          <option value="true">истинные</option>
        </select>
      </label>
      <label class="field">
        <span class="label">Термы</span>
        <select value={settings.terms} onChange={(e) => set({ terms: (e.target as HTMLSelectElement).value as ChartSettings['terms'] })}>
          <option value="ptolemaic">птолемеевы по Лилли (по умолчанию)</option>
          <option value="egyptian">египетские</option>
        </select>
      </label>
      <label class="check">
        <input type="checkbox" checked={settings.outerPlanets} onChange={(e) => set({ outerPlanets: (e.target as HTMLInputElement).checked })} />
        Уран, Нептун, Плутон (только положение)
      </label>
      <label class="check">
        <input type="checkbox" checked={settings.fortuneNightReversal} onChange={(e) => set({ fortuneNightReversal: (e.target as HTMLInputElement).checked })} />
        Ночная инверсия Парса Фортуны (Асц + Солнце − Луна)
      </label>
    </details>
  );
}
