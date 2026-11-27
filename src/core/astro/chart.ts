/**
 * Построение карты момента (ТЗ 3.1–3.3, 3.5): положения, дома, объекты,
 * существенные достоинства и секта. Результат детерминирован.
 */
import { METHOD_TABLE_VERSIONS, SIGNS, signIndex, type ClassicalPlanet, type SignId, type TermSystem } from '../../method';
import { essentialDignities, type Dignities, type Sect } from './dignities';
import type { EphemerisStore } from './ephemeris/store';
import { angles, houseCusps, houseOf, type HouseSystem } from './houses';
import { asind, cosd, jdFromUnixMs, norm360, sind } from './math';
import { apparentSiderealDeg, bodyPosition, deltaT, nutation, OUTER, PLANETS, type Body } from './positions';

export interface ChartSettings {
  houseSystem: HouseSystem;
  nodes: 'mean' | 'true';
  terms: TermSystem;
  outerPlanets: boolean;
  /** Ночная инверсия Парса Фортуны (Асц + Солнце − Луна); по Лилли выключена. */
  fortuneNightReversal: boolean;
}

export const DEFAULT_SETTINGS: ChartSettings = {
  houseSystem: 'regiomontanus',
  nodes: 'mean',
  terms: 'ptolemaic',
  outerPlanets: false,
  fortuneNightReversal: false,
};

export type ObjectId = ClassicalPlanet | 'uranus' | 'neptune' | 'pluto' | 'north_node' | 'south_node' | 'fortune';

export interface ChartObject {
  id: ObjectId;
  lon: number;
  /** Эклиптическая широта, склонение и скорость — у планет. */
  lat?: number;
  dec?: number;
  speed?: number;
  retrograde?: boolean;
  house: number;
  /** Номер дома, к куспиду которого объект ближе 5° в том же знаке (пометка, без переноса). */
  nearCusp?: number;
  /** Существенные достоинства (у семи планет). При неопределённой секте — оба варианта. */
  dignities?: { day: Dignities; night: Dignities };
}

export interface HouseInfo {
  number: number;
  cusp: number;
  sign: SignId;
  ruler: ClassicalPlanet;
  rulerHouse: number;
  objects: ObjectId[];
  intercepted: SignId[];
}

export interface SectInfo {
  /** null — секта не определена (центр Солнца ближе 0,5° к горизонту). */
  sect: Sect | null;
  sunAltitude: number;
}

export interface Chart {
  jdUt: number;
  deltaTSeconds: number;
  obliquity: number;
  armc: number;
  latitude: number;
  longitude: number;
  settings: ChartSettings;
  angles: { asc: number; mc: number; dsc: number; ic: number };
  cusps: number[];
  houses: HouseInfo[];
  objects: ChartObject[];
  sect: SectInfo;
  versions: { ephemeris: string; tables: Record<string, string> };
}

export const SECT_UNCERTAIN_DEG = 0.5;

/** Геоцентрическая высота центра Солнца без рефракции, градусы. */
function altitude(ra: number, dec: number, lst: number, lat: number): number {
  return asind(sind(lat) * sind(dec) + cosd(lat) * cosd(dec) * cosd(lst - ra));
}

export interface ChartPlace {
  utcMs: number;
  latitude: number;
  longitude: number;
}

/** Диапазон дат, для которого нужны таблицы (момент построения). */
export const chartJd = (p: ChartPlace) => jdFromUnixMs(p.utcMs);

export function computeChart(place: ChartPlace, settings: ChartSettings, store: EphemerisStore): Chart {
  const jd = chartJd(place);
  const { eps } = nutation(store, jd);
  const armc = norm360(apparentSiderealDeg(store, jd) + place.longitude);
  const a = angles(armc, place.latitude, eps);
  const cusps = houseCusps(settings.houseSystem, armc, place.latitude, eps);

  const pos = new Map<Body, ReturnType<typeof bodyPosition>>();
  for (const b of [...PLANETS, ...(settings.outerPlanets ? OUTER : [])]) pos.set(b, bodyPosition(store, b, jd));
  const node = bodyPosition(store, settings.nodes === 'mean' ? 'mean_node' : 'true_node', jd);

  const sun = pos.get('sun')!;
  const sunAltitude = altitude(sun.ra, sun.dec, armc, place.latitude);
  const sect: SectInfo = {
    sect: Math.abs(sunAltitude) <= SECT_UNCERTAIN_DEG ? null : sunAltitude > 0 ? 'day' : 'night',
    sunAltitude,
  };

  const moon = pos.get('moon')!;
  const fortune = norm360(
    settings.fortuneNightReversal && sect.sect === 'night' ? a.asc + sun.lon - moon.lon : a.asc + moon.lon - sun.lon,
  );

  const objects: ChartObject[] = [];
  const place1 = (id: ObjectId, lon: number, extra: Partial<ChartObject> = {}): ChartObject => {
    const house = houseOf(lon, cusps);
    const next = cusps[house % 12];
    const nearCusp = norm360(next - lon) <= 5 && signIndex(next) === signIndex(lon) ? (house % 12) + 1 : undefined;
    return { id, lon, house, ...(nearCusp ? { nearCusp } : {}), ...extra };
  };
  for (const [b, p] of pos) {
    const extra: Partial<ChartObject> = { lat: p.lat, dec: p.dec, speed: p.speed, retrograde: p.speed < 0 };
    if ((PLANETS as readonly string[]).includes(b)) {
      const pl = b as ClassicalPlanet;
      extra.dignities = {
        day: essentialDignities(pl, p.lon, 'day', settings.terms),
        night: essentialDignities(pl, p.lon, 'night', settings.terms),
      };
    }
    objects.push(place1(b as ObjectId, p.lon, extra));
  }
  objects.push(place1('north_node', node.lon, { speed: node.speed }));
  objects.push(place1('south_node', norm360(node.lon + 180), { speed: node.speed }));
  objects.push(place1('fortune', fortune));

  const houses: HouseInfo[] = cusps.map((cusp, i) => {
    const sign = SIGNS[signIndex(cusp)];
    const rulerLon = pos.get(sign.domicile)!.lon;
    return {
      number: i + 1,
      cusp,
      sign: sign.sign,
      ruler: sign.domicile,
      rulerHouse: houseOf(rulerLon, cusps),
      objects: objects.filter((o) => o.house === i + 1).map((o) => o.id),
      intercepted: [],
    };
  });
  // Перехваченные знаки: в знаке нет ни одного куспида.
  for (let k = 0; k < 12; k++) {
    const hasCusp = cusps.some((c) => signIndex(c) === k);
    if (!hasCusp) houses[houseOf(k * 30 + 15, cusps) - 1].intercepted.push(SIGNS[k].sign);
  }

  return {
    jdUt: jd,
    deltaTSeconds: deltaT(store, jd),
    obliquity: eps,
    armc,
    latitude: place.latitude,
    longitude: place.longitude,
    settings,
    angles: { asc: a.asc, mc: a.mc, dsc: a.dsc, ic: a.ic },
    cusps,
    houses,
    objects,
    sect,
    versions: { ephemeris: store.source, tables: METHOD_TABLE_VERSIONS },
  };
}

/** Достоинства по секте карты; при неопределённой секте — null (показываются оба варианта). */
export function dignitiesForSect(o: ChartObject, sect: Sect | null): Dignities | null {
  if (!o.dignities) return null;
  if (sect) return o.dignities[sect];
  const { day, night } = o.dignities;
  return day.score === night.score && day.items.length === night.items.length ? day : null;
}
