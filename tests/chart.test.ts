import { beforeAll, describe, expect, it } from 'vitest';
import { computeChart, dignitiesForSect, DEFAULT_SETTINGS, SECT_UNCERTAIN_DEG } from '../src/core/astro/chart';
import { nodeStore } from '../src/core/astro/ephemeris/node-fetcher';
import { diff180, norm360, unixMsFromJd } from '../src/core/astro/math';
import ref from './fixtures/swe-reference.json';

const store = nodeStore();
beforeAll(() => store.ensure(store.range[0], store.range[1] - 1));

const moscow = (iso: string) => ({ utcMs: Date.parse(iso), latitude: 55.7558, longitude: 37.6173 });

describe('карта', () => {
  it('совпадает с эталоном Swiss Ephemeris по углам и куспидам', () => {
    for (const c of ref.cases.slice(0, 50)) {
      const chart = computeChart({ utcMs: unixMsFromJd(c.jd), latitude: c.lat, longitude: c.lon }, DEFAULT_SETTINGS, store);
      const h = c.houses.regiomontanus;
      expect(Math.abs(diff180(chart.angles.asc - h.asc)) * 3600).toBeLessThan(0.05);
      chart.cusps.forEach((x, i) => expect(Math.abs(diff180(x - h.cusps[i])) * 3600).toBeLessThan(0.05));
    }
  });

  it('детерминирован: одинаковый ввод даёт одинаковую карту', () => {
    const a = computeChart(moscow('2026-11-19T20:35:00Z'), DEFAULT_SETTINGS, store);
    const b = computeChart(moscow('2026-11-19T20:35:00Z'), DEFAULT_SETTINGS, store);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('состав объектов: 7 планет, узлы, Парс Фортуны; высшие — только по настройке', () => {
    const a = computeChart(moscow('2026-11-19T20:35:00Z'), DEFAULT_SETTINGS, store);
    expect(a.objects.map((o) => o.id)).toEqual(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'north_node', 'south_node', 'fortune']);
    const b = computeChart(moscow('2026-11-19T20:35:00Z'), { ...DEFAULT_SETTINGS, outerPlanets: true }, store);
    expect(b.objects.map((o) => o.id)).toContain('pluto');
    expect(b.objects.find((o) => o.id === 'uranus')!.dignities).toBeUndefined();
  });

  it('Парс Фортуны = Асц + Луна − Солнце; ночная инверсия — по настройке', () => {
    const night = moscow('2026-11-19T20:35:00Z');
    const a = computeChart(night, DEFAULT_SETTINGS, store);
    const lon = (id: string, ch = a) => ch.objects.find((o) => o.id === id)!.lon;
    expect(a.sect.sect).toBe('night');
    expect(lon('fortune')).toBeCloseTo(norm360(a.angles.asc + lon('moon') - lon('sun')), 9);
    const b = computeChart(night, { ...DEFAULT_SETTINGS, fortuneNightReversal: true }, store);
    expect(lon('fortune', b)).toBeCloseTo(norm360(b.angles.asc + lon('sun', b) - lon('moon', b)), 9);
    expect(lon('south_node')).toBeCloseTo(norm360(lon('north_node') + 180), 9);
  });

  it('секта: день, ночь и неопределённость у горизонта', () => {
    expect(computeChart(moscow('2026-06-21T09:00:00Z'), DEFAULT_SETTINGS, store).sect.sect).toBe('day');
    expect(computeChart(moscow('2026-06-21T21:00:00Z'), DEFAULT_SETTINGS, store).sect.sect).toBe('night');
    // Ищем восход 19.11.2026 (высота центра Солнца = 0).
    let lo = Date.parse('2026-11-19T03:00:00Z');
    let hi = Date.parse('2026-11-19T08:00:00Z');
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const alt = computeChart({ ...moscow('2026-11-19T00:00:00Z'), utcMs: mid }, DEFAULT_SETTINGS, store).sect.sunAltitude;
      if (alt < 0) lo = mid;
      else hi = mid;
    }
    const at = (min: number) => computeChart({ ...moscow('2026-11-19T00:00:00Z'), utcMs: lo + min * 60000 }, DEFAULT_SETTINGS, store);
    const s = at(0);
    expect(s.sect.sect).toBeNull();
    expect(Math.abs(s.sect.sunAltitude)).toBeLessThan(SECT_UNCERTAIN_DEG);
    expect(at(-30).sect.sect).toBe('night');
    expect(at(30).sect.sect).toBe('day');
    // при неопределённой секте достоинства показываются в двух вариантах, если различаются
    for (const o of s.objects.filter((x) => x.dignities)) {
      const same = o.dignities!.day.score === o.dignities!.night.score;
      if (!same) expect(dignitiesForSect(o, null)).toBeNull();
    }
  });

  it('дома: управитель по знаку на куспиде, перехваченные знаки на высокой широте', () => {
    const c = computeChart({ utcMs: Date.parse('2026-03-20T06:00:00Z'), latitude: 64.5, longitude: 40.5 }, DEFAULT_SETTINGS, store);
    const intercepted = c.houses.flatMap((h) => h.intercepted);
    const cuspSigns = new Set(c.houses.map((h) => h.sign));
    expect(cuspSigns.size + intercepted.length).toBe(12);
    for (const h of c.houses) for (const s of h.intercepted) expect(cuspSigns.has(s)).toBe(false);
    expect(c.houses.every((h) => h.objects.every((id) => c.objects.find((o) => o.id === id)!.house === h.number))).toBe(true);
  });

  it('пометка «у куспида»: в пределах 5° до следующего куспида в том же знаке', () => {
    const c = computeChart(moscow('2026-11-19T20:35:00Z'), DEFAULT_SETTINGS, store);
    for (const o of c.objects) {
      const next = c.cusps[o.house % 12];
      const d = norm360(next - o.lon);
      const sameSign = Math.floor(next / 30) === Math.floor(o.lon / 30);
      expect(o.nearCusp !== undefined).toBe(d <= 5 && sameSign);
    }
  });
});
