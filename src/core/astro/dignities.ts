/** Существенные достоинства (ТЗ 3.5). Итог — сумма с разбивкой, без оценок. */
import {
  FACES, SCORES, SIGNS, TERMS, TRIPLICITIES, signIndex,
  type ClassicalPlanet, type SignId, type TermSystem,
} from '../../method';

export type DignityKind = 'domicile' | 'exaltation' | 'triplicity' | 'term' | 'face' | 'detriment' | 'fall' | 'peregrine';

export interface DignityItem {
  kind: DignityKind;
  points: number;
  /** Чей это знак, терм и т. д. (для триплицитета — дневной/ночной). */
  detail?: string;
}

export interface Dignities {
  items: DignityItem[];
  score: number;
}

export type Sect = 'day' | 'night';

/** Управитель терма в точке. */
export function termRuler(lon: number, system: TermSystem): ClassicalPlanet {
  const sign = SIGNS[signIndex(lon)].sign;
  const deg = lon - signIndex(lon) * 30;
  return TERMS[system].rows[sign].find(([end]) => deg < end)![1];
}

export function faceRuler(lon: number): ClassicalPlanet {
  const sign = SIGNS[signIndex(lon)].sign;
  const deg = lon - signIndex(lon) * 30;
  return FACES.rows[sign][Math.min(2, Math.floor(deg / 10))];
}

export function triplicityRuler(sign: SignId, sect: Sect): ClassicalPlanet {
  const el = SIGNS.find((s) => s.sign === sign)!.element;
  const t = TRIPLICITIES.find((r) => r.element === el)!;
  return sect === 'day' ? t.day : t.night;
}

/** Достоинства планеты в точке lon при заданной секте. */
export function essentialDignities(planet: ClassicalPlanet, lon: number, sect: Sect, terms: TermSystem): Dignities {
  const s = SIGNS[signIndex(lon)];
  const items: DignityItem[] = [];
  const P = SCORES.rows;
  if (s.domicile === planet) items.push({ kind: 'domicile', points: P.domicile });
  if (s.exaltation?.planet === planet) items.push({ kind: 'exaltation', points: P.exaltation });
  if (triplicityRuler(s.sign, sect) === planet) items.push({ kind: 'triplicity', points: P.triplicity, detail: sect });
  if (termRuler(lon, terms) === planet) items.push({ kind: 'term', points: P.term });
  if (faceRuler(lon) === planet) items.push({ kind: 'face', points: P.face });
  const positive = items.length > 0;
  if (s.detriment === planet) items.push({ kind: 'detriment', points: P.detriment });
  if (s.fall === planet) items.push({ kind: 'fall', points: P.fall });
  if (!positive) items.push({ kind: 'peregrine', points: P.peregrine });
  return { items, score: items.reduce((a, b) => a + b.points, 0) };
}

/** Кто принимает планету в точке lon: управители по каждому достоинству. */
export function dispositors(lon: number, sect: Sect, terms: TermSystem) {
  const s = SIGNS[signIndex(lon)];
  return {
    domicile: s.domicile,
    exaltation: s.exaltation?.planet ?? null,
    triplicity: triplicityRuler(s.sign, sect),
    term: termRuler(lon, terms),
    face: faceRuler(lon),
    detriment: s.detriment,
    fall: s.fall,
  };
}
