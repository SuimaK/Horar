/**
 * Видимые геоцентрические положения по таблицам эфемерид: тропический
 * зодиак, истинное равноденствие даты, с аберрацией, нутацией и
 * гравитационным отклонением света Солнцем (как в Swiss Ephemeris).
 */
import type { EphemerisStore } from './ephemeris/store';
import { DEG, RAD, eclipticToEquatorial, norm360 } from './math';

export const PLANETS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const;
export const OUTER = ['uranus', 'neptune', 'pluto'] as const;
export type Planet = (typeof PLANETS)[number];
export type OuterPlanet = (typeof OUTER)[number];
export type Body = Planet | OuterPlanet | 'mean_node' | 'true_node';

export interface BodyPosition {
  lon: number;
  lat: number;
  /** Скорость по долготе, градусы в сутки. */
  speed: number;
  ra: number;
  dec: number;
}

/**
 * Отклонение света Солнцем (Explanatory Supplement; Swiss Ephemeris
 * swi_deflect_light): точечная масса вне диска, эффективная масса внутри.
 */
const SCHWARZSCHILD_AU = (2 * 1.32712440017987e20) / (2.99792458e8 * 2.99792458e8) / 1.495978707e11;
const SUN_RADIUS_RAD = (959.63 / 3600) * DEG;

/**
 * Доля массы Солнца, влияющая на луч, проходящий на расстоянии r (в радиусах
 * Солнца) от центра. Модель распределения массы — M. Stix, «The Sun», с. 47;
 * значения те же, что в Swiss Ephemeris (meff).
 */
// prettier-ignore
const MEFF: [number, number][] = [
  [1.0, 1.0], [0.99, 0.999979], [0.98, 0.99994], [0.97, 0.999881], [0.96, 0.999811], [0.95, 0.999724], [0.94, 0.999622], [0.93, 0.999497], [0.92, 0.999354], [0.91, 0.999192],
  [0.9, 0.999], [0.89, 0.998786], [0.88, 0.998535], [0.87, 0.998242], [0.86, 0.997919], [0.85, 0.997571], [0.84, 0.997198], [0.83, 0.996792], [0.82, 0.996316], [0.81, 0.995791],
  [0.8, 0.995226], [0.79, 0.994625], [0.78, 0.993991], [0.77, 0.993326], [0.76, 0.992598], [0.75, 0.99177], [0.74, 0.990873], [0.73, 0.989919], [0.72, 0.988912], [0.71, 0.987856],
  [0.7, 0.986755], [0.69, 0.98561], [0.68, 0.984398], [0.67, 0.982986], [0.66, 0.981437], [0.65, 0.979779], [0.64, 0.978024], [0.63, 0.976182], [0.62, 0.974256], [0.61, 0.972253],
  [0.6, 0.970174], [0.59, 0.968024], [0.58, 0.965594], [0.57, 0.962797], [0.56, 0.959758], [0.55, 0.956515], [0.54, 0.953088], [0.53, 0.949495], [0.52, 0.945741], [0.51, 0.941838],
  [0.5, 0.93779], [0.49, 0.933563], [0.48, 0.928668], [0.47, 0.923288], [0.46, 0.917527], [0.45, 0.911432], [0.44, 0.905035], [0.43, 0.898353], [0.42, 0.891022], [0.41, 0.88294],
  [0.4, 0.874312], [0.39, 0.865206], [0.38, 0.855423], [0.37, 0.844619], [0.36, 0.833074], [0.35, 0.820876], [0.34, 0.808031], [0.33, 0.793962], [0.32, 0.778931], [0.31, 0.763021],
  [0.3, 0.745815], [0.29, 0.727557], [0.28, 0.708234], [0.27, 0.687583], [0.26, 0.665741], [0.25, 0.642597], [0.24, 0.618252], [0.23, 0.592586], [0.22, 0.565747], [0.21, 0.537697],
  [0.2, 0.508554], [0.19, 0.47842], [0.18, 0.447322], [0.17, 0.415454], [0.16, 0.382892], [0.15, 0.349955], [0.14, 0.316691], [0.13, 0.283565], [0.12, 0.250431], [0.11, 0.218327],
  [0.1, 0.186794], [0.09, 0.156287], [0.08, 0.128421], [0.07, 0.102237], [0.06, 0.077393], [0.05, 0.054833], [0.04, 0.036361], [0.03, 0.020953], [0.02, 0.009645], [0.01, 0.002767],
  [0.0, 0.0],
];

function meff(r: number): number {
  if (r <= 0) return 0;
  if (r >= 1) return 1;
  let i = 0;
  while (MEFF[i][0] > r) i++;
  const [r0, m0] = MEFF[i - 1];
  const [r1, m1] = MEFF[i];
  return m0 + ((r - r0) / (r1 - r0)) * (m1 - m0);
}

type Vec = [number, number, number];
const vec = (lon: number, lat: number, r: number): Vec => [
  r * Math.cos(lat * DEG) * Math.cos(lon * DEG),
  r * Math.cos(lat * DEG) * Math.sin(lon * DEG),
  r * Math.sin(lat * DEG),
];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec): Vec => {
  const r = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / r, a[1] / r, a[2] / r];
};

/** Долгота и широта планеты после отклонения света (градусы). */
function deflect(lon: number, lat: number, dist: number, sunLon: number, sunLat: number, sunDist: number): [number, number] {
  const P = vec(lon, lat, dist);
  const S = vec(sunLon, sunLat, sunDist);
  const u = unit(P);
  const e = unit([-S[0], -S[1], -S[2]]);
  const q = unit([P[0] - S[0], P[1] - S[1], P[2] - S[2]]);
  const uq = dot(u, q);
  const ue = dot(u, e);
  const qe = dot(q, e);
  const sina = Math.sqrt(Math.max(0, 1 - ue * ue));
  const sinSunR = SUN_RADIUS_RAD / sunDist;
  const g1 = (SCHWARZSCHILD_AU * (sina < sinSunR ? meff(sina / sinSunR) : 1)) / sunDist;
  const g2 = 1 + qe;
  const x: Vec = [0, 1, 2].map((i) => u[i] + (g1 / g2) * (uq * e[i] - ue * q[i])) as Vec;
  return [norm360(Math.atan2(x[1], x[0]) * RAD), Math.asin(x[2] / Math.hypot(x[0], x[1], x[2])) * RAD];
}

export function nutation(store: EphemerisStore, jd: number) {
  const [eps] = store.evaluate('nutation.eps', jd);
  const [dpsi, dpsiRate] = store.evaluate('nutation.dpsi', jd);
  return { eps, dpsi, dpsiRate };
}

const DEFLECTED = new Set<Body>(['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']);

function rawLonLat(store: EphemerisStore, body: Body, jd: number): [number, number] {
  const [lon] = store.evaluate(`${body}.lon`, jd);
  const lat = body.endsWith('_node') ? 0 : store.evaluate(`${body}.lat`, jd)[0];
  if (!DEFLECTED.has(body)) return [lon, lat];
  const [dist] = store.evaluate(`${body}.dist`, jd);
  const [sl] = store.evaluate('sun.lon', jd);
  const [sb] = store.evaluate('sun.lat', jd);
  const [sd] = store.evaluate('sun.dist', jd);
  return deflect(lon, lat, dist, sl, sb, sd);
}

export function bodyPosition(store: EphemerisStore, body: Body, jd: number): BodyPosition {
  const { eps, dpsi, dpsiRate } = nutation(store, jd);
  const [lon0, lat] = rawLonLat(store, body, jd);
  let speed = store.evaluate(`${body}.lon`, jd)[1] + dpsiRate;
  if (DEFLECTED.has(body)) {
    // Влияние отклонения света на скорость (заметно только у Солнца).
    const h = 0.01;
    const a = rawLonLat(store, body, jd - h)[0] - store.evaluate(`${body}.lon`, jd - h)[0];
    const b = rawLonLat(store, body, jd + h)[0] - store.evaluate(`${body}.lon`, jd + h)[0];
    speed += (((b - a + 540) % 360) - 180) / (2 * h);
  }
  const lon = norm360(lon0 + dpsi);
  const { ra, dec } = eclipticToEquatorial(lon, lat, eps);
  return { lon, lat, speed, ra, dec };
}

/** ΔT = TT − UT, секунды. */
export const deltaT = (store: EphemerisStore, jd: number) => store.evaluate('deltat.seconds', jd)[0];

/** Истинное (видимое) звёздное время в Гринвиче, градусы. */
export function apparentSiderealDeg(store: EphemerisStore, jd: number): number {
  const simple = 280.46061837 + 360.98564736629 * (jd - 2451545.0);
  return norm360(simple + store.evaluate('sidereal.stcorr', jd)[0]);
}
