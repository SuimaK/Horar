import { describe, expect, it } from 'vitest';
import { maskDate, maskTime } from '../src/ui/masks';

describe('маски ввода', () => {
  it.each([
    ['', ''],
    ['2', '2'],
    ['23', '23'],
    ['233', '23:3'],
    ['2335', '23:35'],
    ['233510', '23:35:10'],
    ['2335109', '23:35:10'],
    ['23:35', '23:35'],
    ['9:05', '9:05'],
    ['23:', '23:'],
    ['23 35', '23:35'],
    ['23-35', '23:35'],
  ])('время «%s» → «%s»', (a, b) => expect(maskTime(a)).toBe(b));

  it.each([
    ['1911', '19.11'],
    ['191120', '19.11.20'],
    ['19112026', '19.11.2026'],
    ['191120261', '19.11.2026'],
    ['1.2.2026', '1.2.2026'],
    ['19/11/2026', '19.11.2026'],
  ])('дата «%s» → «%s»', (a, b) => expect(maskDate(a)).toBe(b));
});

describe('посимвольный набор', () => {
  const typeIn = (m: (s: string) => string, keys: string) => [...keys].reduce((v, k) => m(v + k), '');
  it('цифры подряд', () => {
    expect(typeIn(maskDate, '01022026')).toBe('01.02.2026');
    expect(typeIn(maskTime, '074515')).toBe('07:45:15');
  });
  it('с разделителями вручную', () => {
    expect(typeIn(maskDate, '1.2.2026')).toBe('1.2.2026');
    expect(typeIn(maskTime, '9:05')).toBe('9:05');
    expect(typeIn(maskTime, '09:05')).toBe('09:05');
  });
});
