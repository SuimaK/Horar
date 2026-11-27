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
