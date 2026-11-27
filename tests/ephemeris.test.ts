import { beforeAll, describe, expect, it } from 'vitest';
import { nodeStore } from '../src/core/astro/ephemeris/node-fetcher';
import { apparentSiderealDeg, bodyPosition, deltaT, nutation, type Body } from '../src/core/astro/positions';
import { diff180 } from '../src/core/astro/math';
import ref from './fixtures/swe-reference.json';

const store = nodeStore();
const cases = ref.cases;
const arcsec = (a: number, b: number) => Math.abs(diff180(a - b)) * 3600;

beforeAll(async () => {
  await store.ensure(store.range[0], store.range[1] - 1);
});

// ТЗ 3.1: не хуже 1″ для Солнца–Сатурна и 3″ для Луны. Проверяем строже.
const TOL: Record<Body, number> = {
  sun: 0.01, moon: 0.01, mercury: 0.01, venus: 0.01, mars: 0.01, jupiter: 0.01, saturn: 0.01,
  uranus: 0.01, neptune: 0.01, pluto: 0.01, mean_node: 0.01, true_node: 0.2,
};

describe('положения против Swiss Ephemeris', () => {
  for (const body of Object.keys(TOL) as Body[]) {
    it(`${body}: долгота, широта, склонение, скорость`, () => {
      let worstLon = 0, worstLat = 0, worstDec = 0, worstSpeed = 0;
      for (const c of cases) {
        const r = (c.bodies as Record<string, { lon: number; lat: number; dec: number; speed: number }>)[body];
        const p = bodyPosition(store, body, c.jd);
        worstLon = Math.max(worstLon, arcsec(p.lon, r.lon));
        worstLat = Math.max(worstLat, Math.abs(p.lat - r.lat) * 3600);
        worstDec = Math.max(worstDec, Math.abs(p.dec - r.dec) * 3600);
        worstSpeed = Math.max(worstSpeed, Math.abs(p.speed - r.speed) * 3600);
      }
      expect(worstLon).toBeLessThan(TOL[body]);
      if (!body.endsWith('_node')) expect(worstLat).toBeLessThan(TOL[body]);
      expect(worstDec).toBeLessThan(TOL[body] + 0.01);
      expect(worstSpeed).toBeLessThan(body === 'true_node' ? 20 : 1); // ″ в сутки
    });
  }

  it('наклон эклиптики, нутация, ΔT, звёздное время', () => {
    for (const c of cases) {
      const n = nutation(store, c.jd);
      expect(Math.abs(n.eps - c.eps) * 3600).toBeLessThan(0.001);
      expect(Math.abs(n.dpsi - c.dpsi) * 3600).toBeLessThan(0.001);
      expect(Math.abs(deltaT(store, c.jd) - c.deltat)).toBeLessThan(0.01);
      expect(arcsec(apparentSiderealDeg(store, c.jd), c.sidtime * 15)).toBeLessThan(0.001);
    }
  });
});
