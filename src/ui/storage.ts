/** Удобства одного устройства (последнее место). Ошибки хранилища не мешают работе. */
export interface LastPlace {
  placeName?: string;
  placeTimeZone?: string;
  latitude: string;
  longitude: string;
}

const KEY = 'horar.lastPlace.v1';

export function loadLastPlace(): LastPlace | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.latitude === 'string' && typeof v?.longitude === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function saveLastPlace(p: LastPlace): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* хранилище недоступно — пропускаем */
  }
}

const SETTINGS_KEY = 'horar.settings.v1';

export function loadSettings<T extends object>(defaults: T): T {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const v = JSON.parse(raw);
    // Берём только известные ключи того же типа.
    const out = { ...defaults } as Record<string, unknown>;
    for (const k of Object.keys(defaults)) if (typeof v?.[k] === typeof out[k]) out[k] = v[k];
    return out as T;
  } catch {
    return defaults;
  }
}

export function saveSettings(s: object): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно — пропускаем */
  }
}
