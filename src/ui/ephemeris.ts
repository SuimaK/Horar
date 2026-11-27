import { EphemerisStore, type Manifest } from '../core/astro/ephemeris/store';

let storePromise: Promise<EphemerisStore> | null = null;

const base = () => `${import.meta.env.BASE_URL}ephemeris/`;

/** Таблицы эфемерид, загружаемые с сайта частями по 50 лет. */
export function browserStore(): Promise<EphemerisStore> {
  storePromise ??= fetch(base() + 'manifest.json')
    .then((r) => {
      if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}`);
      return r.json() as Promise<Manifest>;
    })
    .then(
      (m) =>
        new EphemerisStore(m, async (file) => {
          const r = await fetch(base() + file);
          if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
          return r.arrayBuffer();
        }),
    );
  storePromise.catch(() => (storePromise = null));
  return storePromise;
}
