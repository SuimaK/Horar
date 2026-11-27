/**
 * Асцендент, MC и системы домов (ТЗ 3.3): Региомонтан (по умолчанию),
 * Алькабитиус, Плацидус, целые знаки.
 */
import { asind, atan2d, cosd, norm360, sind, tand } from './math';

export type HouseSystem = 'regiomontanus' | 'alcabitius' | 'placidus' | 'whole_sign';

export const HOUSE_SYSTEMS: { id: HouseSystem; name: string }[] = [
  { id: 'regiomontanus', name: 'Региомонтан' },
  { id: 'alcabitius', name: 'Алькабитиус' },
  { id: 'placidus', name: 'Плацидус' },
  { id: 'whole_sign', name: 'Целые знаки' },
];

export interface Angles {
  armc: number;
  asc: number;
  mc: number;
  dsc: number;
  ic: number;
}

/** Долгота точки эклиптики по прямому восхождению. */
const eclipticFromRa = (ra: number, eps: number) => norm360(atan2d(sind(ra), cosd(ra) * cosd(eps)));
/** Склонение точки эклиптики. */
const eclipticDec = (lon: number, eps: number) => asind(sind(eps) * sind(lon));

export function angles(armc: number, latitude: number, eps: number): Angles {
  const mc = eclipticFromRa(armc, eps);
  const asc = norm360(atan2d(cosd(armc), -(sind(armc) * cosd(eps) + tand(latitude) * sind(eps))));
  return { armc, asc, mc, dsc: norm360(asc + 180), ic: norm360(mc + 180) };
}

export class HouseGridError extends Error {
  constructor(public readonly reason: string) {
    super(`Сетка домов не построена: ${reason}.`);
  }
}

/** 12 куспидов (индекс 0 — I дом). */
export function houseCusps(system: HouseSystem, armc: number, latitude: number, eps: number): number[] {
  const a = angles(armc, latitude, eps);
  let c: number[];
  switch (system) {
    case 'whole_sign': {
      const first = Math.floor(a.asc / 30) * 30;
      c = Array.from({ length: 12 }, (_, i) => norm360(first + 30 * i));
      break;
    }
    case 'regiomontanus': {
      // Деление экватора по 30° от меридиана, круги домов через точки севера и юга.
      const cusp = (h: number) => {
        const pole = Math.atan(tand(latitude) * sind(h)) * (180 / Math.PI);
        const r = armc + h;
        return norm360(atan2d(sind(r), cosd(r) * cosd(eps) - tand(pole) * sind(eps)));
      };
      c = fromQuadrant(a, cusp(30), cusp(60), cusp(120), cusp(150));
      break;
    }
    case 'alcabitius': {
      // Деление полудуг Асцендента по прямому восхождению.
      const ad = asind(tand(latitude) * tand(eclipticDec(a.asc, eps)));
      const dsa = 90 + ad;
      const nsa = 180 - dsa;
      c = fromQuadrant(
        a,
        eclipticFromRa(armc + dsa / 3, eps),
        eclipticFromRa(armc + (2 * dsa) / 3, eps),
        eclipticFromRa(armc + dsa + nsa / 3, eps),
        eclipticFromRa(armc + dsa + (2 * nsa) / 3, eps),
      );
      break;
    }
    case 'placidus': {
      // Деление полудуг каждой точки (итерации до сходимости).
      const iterate = (frac: number, nocturnal: boolean) => {
        let lon = eclipticFromRa(armc + (nocturnal ? 180 - 90 * frac : 90 * frac), eps);
        for (let i = 0; i < 100; i++) {
          const ad = asind(tand(latitude) * tand(eclipticDec(lon, eps)));
          const ra = nocturnal ? armc + 180 - (90 - ad) * frac : armc + (90 + ad) * frac;
          const next = eclipticFromRa(ra, eps);
          const done = Math.abs(((next - lon + 540) % 360) - 180) < 1e-10;
          lon = next;
          if (done) break;
        }
        return lon;
      };
      c = fromQuadrant(a, iterate(1 / 3, false), iterate(2 / 3, false), iterate(2 / 3, true), iterate(1 / 3, true));
      break;
    }
  }
  checkGrid(c);
  return c;
}

/** Собирает 12 куспидов по углам и куспидам XI, XII, II, III. */
function fromQuadrant(a: Angles, c11: number, c12: number, c2: number, c3: number): number[] {
  const c = new Array<number>(12);
  c[0] = a.asc;
  c[1] = c2;
  c[2] = c3;
  c[3] = a.ic;
  c[9] = a.mc;
  c[10] = c11;
  c[11] = c12;
  for (const i of [1, 2, 10, 11]) c[(i + 6) % 12] = norm360(c[i] + 180);
  c[6] = a.dsc;
  return c;
}

/** ТЗ 3.3: 12 конечных куспидов, строгий порядок, сумма дуг 360°. */
export function checkGrid(c: number[]): void {
  if (c.length !== 12 || c.some((x) => !Number.isFinite(x))) throw new HouseGridError('куспиды не определены');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const arc = norm360(c[(i + 1) % 12] - c[i]);
    if (arc <= 0 || arc >= 180) throw new HouseGridError(`нарушен порядок куспидов ${i + 1} и ${((i + 1) % 12) + 1}`);
    sum += arc;
  }
  if (Math.abs(sum - 360) > 1e-6) throw new HouseGridError('сумма дуг домов не равна 360°');
}

/** Номер дома (1–12), в котором стоит точка с долготой lon. */
export function houseOf(lon: number, cusps: number[]): number {
  for (let i = 0; i < 12; i++) {
    const arc = norm360(cusps[(i + 1) % 12] - cusps[i]);
    if (norm360(lon - cusps[i]) < arc) return i + 1;
  }
  return 12;
}
