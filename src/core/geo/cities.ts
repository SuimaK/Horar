/** Офлайн-поиск по встроенному справочнику городов (GeoNames cities15000). */

export interface City {
  id: number;
  name: string;
  nameOriginal: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  country: string;
  region: string;
  population: number;
}

export interface CityData {
  timezones: string[];
  rows: [number, string, string, number, number, number, string, string, number, string][];
}

export const normalizeQuery = (s: string) =>
  s.toLowerCase().replace(/ё/g, 'е').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export class CityIndex {
  private keys: string[][];
  constructor(private data: CityData) {
    this.keys = data.rows.map((r) => r[9].split('|'));
  }

  get size() {
    return this.data.rows.length;
  }

  private city(i: number): City {
    const r = this.data.rows[i];
    return {
      id: r[0],
      name: r[1],
      nameOriginal: r[2],
      latitude: r[3],
      longitude: r[4],
      timeZone: this.data.timezones[r[5]],
      country: r[6],
      region: r[7],
      population: r[8],
    };
  }

  /**
   * Сначала точные совпадения названия, затем начало названия, затем начало
   * слова; внутри группы — по населению (строки уже отсортированы по нему).
   */
  search(query: string, limit = 8): City[] {
    const q = normalizeQuery(query);
    if (!q) return [];
    const buckets: number[][] = [[], [], []];
    for (let i = 0; i < this.keys.length; i++) {
      let rank = 3;
      for (const k of this.keys[i]) {
        if (k === q) { rank = 0; break; }
        if (rank > 1 && k.startsWith(q)) rank = 1;
        else if (rank > 2 && k.includes(' ' + q)) rank = 2;
      }
      if (rank < 3) buckets[rank].push(i);
    }
    return buckets.flat().slice(0, limit).map((i) => this.city(i));
  }

  byId(id: number): City | undefined {
    const i = this.data.rows.findIndex((r) => r[0] === id);
    return i < 0 ? undefined : this.city(i);
  }
}

let indexPromise: Promise<CityIndex> | null = null;

/** Справочник загружается отдельным файлом при первом поиске. */
export function loadCityIndex(): Promise<CityIndex> {
  indexPromise ??= import('../../data/cities.generated.json').then((m) => new CityIndex((m.default ?? m) as unknown as CityData));
  return indexPromise;
}

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['ru'], { type: 'region' }) : null;

export function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}
