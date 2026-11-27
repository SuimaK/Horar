/** Таблицы метода (ТЗ 6.2: во внешних JSON с источником каждой строки). */
import dignityScores from './dignity-scores.json';
import faces from './faces.json';
import planets from './planets.json';
import signs from './signs.json';
import terms from './terms.json';
import triplicities from './triplicities.json';

export type ClassicalPlanet = 'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn';
export type SignId =
  | 'aries' | 'taurus' | 'gemini' | 'cancer' | 'leo' | 'virgo'
  | 'libra' | 'scorpio' | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';
export type Element = 'fire' | 'earth' | 'air' | 'water';
export type TermSystem = 'ptolemaic' | 'egyptian';

export interface SignRow {
  sign: SignId;
  name: string;
  element: Element;
  modality: string;
  domicile: ClassicalPlanet;
  exaltation: { planet: ClassicalPlanet; degree: number } | null;
  detriment: ClassicalPlanet;
  fall: ClassicalPlanet | null;
  source: string;
}

export interface TriplicityRow {
  element: Element;
  name: string;
  day: ClassicalPlanet;
  night: ClassicalPlanet;
  participating: ClassicalPlanet;
  source: string;
}

export interface PlanetInfo {
  id: string;
  name: string;
  genitive: string;
  symbol: string;
  meanSpeed: number | null;
  source: string;
}

export const SIGNS = signs.rows as SignRow[];
export const TRIPLICITIES = triplicities.rows as TriplicityRow[];
export const TERMS = terms.systems as unknown as Record<
  TermSystem,
  { name: string; source: string; rows: Record<SignId, [number, ClassicalPlanet][]> }
>;
export const FACES = faces as unknown as { source: string; rows: Record<SignId, ClassicalPlanet[]> };
export const SCORES = dignityScores as {
  source: string;
  rows: Record<'domicile' | 'exaltation' | 'triplicity' | 'term' | 'face' | 'detriment' | 'fall' | 'peregrine', number>;
};
export const PLANET_INFO = planets.rows as PlanetInfo[];

export const METHOD_TABLE_VERSIONS: Record<string, string> = Object.fromEntries(
  [signs, triplicities, terms, faces, dignityScores, planets].map((t) => [t.table, t.version]),
);

export const signIndex = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30) % 12;
export const signOf = (lon: number): SignRow => SIGNS[signIndex(lon)];
export const planetInfo = (id: string) => PLANET_INFO.find((p) => p.id === id);
