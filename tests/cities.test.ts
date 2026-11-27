import { describe, expect, it } from 'vitest';
import { CityIndex, normalizeQuery, type CityData } from '../src/core/geo/cities';
import data from '../src/data/cities.generated.json';

const index = new CityIndex(data as unknown as CityData);

describe('справочник городов', () => {
  it('содержит города с населением от 15 000 и пояс у каждого', () => {
    expect(index.size).toBeGreaterThan(20000);
    const d = data as unknown as CityData;
    expect(d.rows.every((r) => d.timezones[r[5]])).toBe(true);
  });

  it.each([
    ['москва', 'Москва', 'RU', 'Europe/Moscow'],
    ['Moscow', 'Москва', 'RU', 'Europe/Moscow'],
    ['санкт-петербург', 'Санкт-Петербург', 'RU', 'Europe/Moscow'],
    ['новосибирск', 'Новосибирск', 'RU', 'Asia/Novosibirsk'],
    ['париж', 'Париж', 'FR', 'Europe/Paris'],
    ['london', 'Лондон', 'GB', 'Europe/London'],
    ['минск', 'Минск', 'BY', 'Europe/Minsk'],
    ['сидней', 'Сидней', 'AU', 'Australia/Sydney'],
  ])('«%s» → %s', (q, name, country, tz) => {
    const [c] = index.search(q);
    expect(c.name).toBe(name);
    expect(c.country).toBe(country);
    expect(c.timeZone).toBe(tz);
  });

  it('ё и е не различаются', () => {
    expect(index.search('орел')[0].name).toBe('Орёл');
    expect(index.search('Орёл')[0].name).toBe('Орёл');
  });

  it('у российских городов есть регион', () => {
    expect(index.search('екатеринбург')[0].region).toBe('Свердловская обл');
  });

  it('поиск по началу названия', () => {
    expect(index.search('екатер').map((c) => c.name)).toContain('Екатеринбург');
  });

  it('normalizeQuery', () => {
    expect(normalizeQuery('  Ростов-на-Дону ')).toBe('ростов на дону');
    expect(normalizeQuery('São Paulo')).toBe('sao paulo');
  });
});
