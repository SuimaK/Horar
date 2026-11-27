import { beforeAll, describe, expect, it } from 'vitest';
import { nodeStore } from '../src/core/astro/ephemeris/node-fetcher';
import { angles, checkGrid, houseCusps, houseOf, HouseGridError, type HouseSystem } from '../src/core/astro/houses';
import { diff180, norm360 } from '../src/core/astro/math';
import { apparentSiderealDeg, nutation } from '../src/core/astro/positions';
import ref from './fixtures/swe-reference.json';

const store = nodeStore();
beforeAll(() => store.ensure(store.range[0], store.range[1] - 1));
const arcsec = (a: number, b: number) => Math.abs(diff180(a - b)) * 3600;

describe('дома против Swiss Ephemeris', () => {
  for (const system of ['regiomontanus', 'placidus', 'alcabitius', 'whole_sign'] as HouseSystem[]) {
    it(`${system}: 12 куспидов, Асцендент и MC в пределах 0,01″`, () => {
      let worst = 0;
      for (const c of ref.cases) {
        const h = (c.houses as Record<string, { cusps: number[]; asc: number; mc: number; armc: number }>)[system];
        const armc = norm360(apparentSiderealDeg(store, c.jd) + c.lon);
        expect(arcsec(armc, h.armc)).toBeLessThan(0.001);
        const { eps } = nutation(store, c.jd);
        const a = angles(armc, c.lat, eps);
        const cusps = houseCusps(system, armc, c.lat, eps);
        worst = Math.max(worst, arcsec(a.asc, h.asc), arcsec(a.mc, h.mc), ...cusps.map((x, i) => arcsec(x, h.cusps[i])));
      }
      expect(worst).toBeLessThan(0.01);
    });
  }
});

describe('проверка сетки и принадлежность дому', () => {
  it('нарушенный порядок — ошибка, а не карта', () => {
    const good = Array.from({ length: 12 }, (_, i) => i * 30);
    expect(() => checkGrid(good)).not.toThrow();
    const bad = [...good];
    bad[3] = 50;
    expect(() => checkGrid(bad)).toThrow(HouseGridError);
    expect(() => checkGrid([...good.slice(0, 11), NaN])).toThrow(HouseGridError);
  });
  it('дом точки, в том числе через 0° Овна', () => {
    const cusps = [350, 20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320];
    expect(houseOf(355, cusps)).toBe(1);
    expect(houseOf(5, cusps)).toBe(1);
    expect(houseOf(20, cusps)).toBe(2);
    expect(houseOf(349.99, cusps)).toBe(12);
  });
});
