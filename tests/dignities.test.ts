import { describe, expect, it } from 'vitest';
import { essentialDignities, faceRuler, termRuler, triplicityRuler } from '../src/core/astro/dignities';
import { FACES, SIGNS, TERMS, TRIPLICITIES, type ClassicalPlanet } from '../src/method';

const PLANETS: ClassicalPlanet[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
const lonOf = (sign: string, deg: number) => SIGNS.findIndex((s) => s.sign === sign) * 30 + deg;
const kinds = (p: ClassicalPlanet, sign: string, deg: number, sect: 'day' | 'night') =>
  essentialDignities(p, lonOf(sign, deg), sect, 'ptolemaic');

describe('таблицы метода', () => {
  it('у каждой строки есть источник', () => {
    expect(SIGNS.every((s) => s.source)).toBe(true);
    expect(TRIPLICITIES.every((t) => t.source)).toBe(true);
    expect(TERMS.ptolemaic.source && TERMS.egyptian.source && FACES.source).toBeTruthy();
  });

  it('термы: 5 отрезков на знак, растут до 30°, каждая из пяти планет по разу', () => {
    for (const sys of Object.values(TERMS)) {
      for (const rows of Object.values(sys.rows)) {
        expect(rows).toHaveLength(5);
        expect(rows[4][0]).toBe(30);
        for (let i = 1; i < 5; i++) expect(rows[i][0]).toBeGreaterThan(rows[i - 1][0]);
        expect(new Set(rows.map((r) => r[1])).size).toBe(5);
        expect(rows.some((r) => r[1] === 'sun' || r[1] === 'moon')).toBe(false);
      }
    }
  });

  it('сумма долей термов каждой планеты по египетской системе — классические «годы»', () => {
    // Сатурн 57, Юпитер 79, Марс 66, Венера 82, Меркурий 76 (Птолемей, Тетрабиблос I.20).
    const total: Record<string, number> = {};
    for (const rows of Object.values(TERMS.egyptian.rows)) {
      let prev = 0;
      for (const [end, p] of rows) {
        total[p] = (total[p] ?? 0) + end - prev;
        prev = end;
      }
    }
    expect(total).toEqual({ saturn: 57, jupiter: 79, mars: 66, venus: 82, mercury: 76 });
  });

  it('фасы идут по халдейскому порядку без пропусков', () => {
    const order: ClassicalPlanet[] = ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'];
    const flat = SIGNS.flatMap((s) => FACES.rows[s.sign]);
    for (let i = 1; i < flat.length; i++) expect(order.indexOf(flat[i])).toBe((order.indexOf(flat[i - 1]) + 1) % 7);
  });

  it('обители, изгнания, экзальтации и падения согласованы', () => {
    for (let i = 0; i < 12; i++) {
      const s = SIGNS[i];
      const opp = SIGNS[(i + 6) % 12];
      expect(opp.detriment).toBe(s.domicile);
      if (s.exaltation) expect(opp.fall).toBe(s.exaltation.planet);
    }
    for (const p of PLANETS) {
      const n = SIGNS.filter((s) => s.domicile === p).length;
      expect(n).toBe(p === 'sun' || p === 'moon' ? 1 : 2);
      expect(SIGNS.filter((s) => s.exaltation?.planet === p)).toHaveLength(1);
    }
  });
});

describe('существенные достоинства', () => {
  it('пример ТЗ 4.2: Марс в 27° Стрельца — свои термы (+2)', () => {
    expect(termRuler(lonOf('sagittarius', 27), 'ptolemaic')).toBe('mars');
    const d = kinds('mars', 'sagittarius', 27, 'night');
    expect(d.items.map((i) => i.kind)).toEqual(['term']);
    expect(d.score).toBe(2);
  });

  it('пример ТЗ 4.2: Юпитер во Льве ночью — ночной управитель огненного триплицитета (+3)', () => {
    expect(triplicityRuler('leo', 'night')).toBe('jupiter');
    expect(kinds('jupiter', 'leo', 2, 'night').items[0]).toMatchObject({ kind: 'triplicity', points: 3 });
  });

  it('Венера в 27° Рыб днём: экзальтация и триплицитет', () => {
    const d = kinds('venus', 'pisces', 27, 'day');
    expect(d.items.map((i) => i.kind)).toEqual(['exaltation', 'triplicity']);
    expect(d.score).toBe(7);
    expect(kinds('venus', 'pisces', 27, 'night').score).toBe(4);
  });

  it('Сатурн в 10° Овна ночью: падение и перегрин', () => {
    const d = kinds('saturn', 'aries', 10, 'night');
    expect(d.items.map((i) => i.kind)).toEqual(['fall', 'peregrine']);
    expect(d.score).toBe(-9);
  });

  it('Марс в 15° Весов днём: изгнание и перегрин', () => {
    expect(kinds('mars', 'libra', 15, 'day').score).toBe(-10);
  });

  it('Меркурий в Деве: обитель, экзальтация, термы или фас', () => {
    const d = kinds('mercury', 'virgo', 5, 'day');
    expect(d.items.map((i) => i.kind)).toEqual(['domicile', 'exaltation', 'term']);
    expect(kinds('mercury', 'virgo', 25, 'night').items.map((i) => i.kind)).toEqual(['domicile', 'exaltation', 'face']);
  });

  it('водный триплицитет по Дорофею: Венера днём, Марс ночью', () => {
    expect(triplicityRuler('cancer', 'day')).toBe('venus');
    expect(triplicityRuler('scorpio', 'night')).toBe('mars');
  });

  it('границы термов и фасов: граница принадлежит следующему отрезку', () => {
    expect(termRuler(lonOf('aries', 5.9999), 'ptolemaic')).toBe('jupiter');
    expect(termRuler(lonOf('aries', 6), 'ptolemaic')).toBe('venus');
    expect(faceRuler(lonOf('aries', 10))).toBe('sun');
    expect(faceRuler(lonOf('pisces', 29.9999))).toBe('mars');
  });

  it('7 планет × 360° × дневная/ночная: перегрин тогда и только тогда, когда нет положительных достоинств', () => {
    for (const p of PLANETS)
      for (let deg = 0; deg < 360; deg++)
        for (const sect of ['day', 'night'] as const) {
          const d = essentialDignities(p, deg + 0.5, sect, 'ptolemaic');
          const positive = d.items.some((i) => i.points > 0);
          expect(d.items.some((i) => i.kind === 'peregrine')).toBe(!positive);
          expect(d.score).toBe(d.items.reduce((a, b) => a + b.points, 0));
        }
  });
});
