export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Приводит угол к [0, 360). */
export function norm360(x: number): number {
  const r = x % 360;
  return r < 0 ? r + 360 : r;
}

/** Приводит разность углов к (−180, 180]. */
export function diff180(x: number): number {
  const r = norm360(x);
  return r > 180 ? r - 360 : r;
}

export const sind = (x: number) => Math.sin(x * DEG);
export const cosd = (x: number) => Math.cos(x * DEG);
export const tand = (x: number) => Math.tan(x * DEG);
export const asind = (x: number) => Math.asin(Math.max(-1, Math.min(1, x))) * RAD;
export const atan2d = (y: number, x: number) => Math.atan2(y, x) * RAD;

/** Эклиптические координаты → экваториальные (градусы). */
export function eclipticToEquatorial(lon: number, lat: number, eps: number): { ra: number; dec: number } {
  const ra = norm360(atan2d(sind(lon) * cosd(eps) - tand(lat) * sind(eps), cosd(lon)));
  const dec = asind(sind(lat) * cosd(eps) + cosd(lat) * sind(eps) * sind(lon));
  return { ra, dec };
}

/** Юлианская дата (UT) по моменту JavaScript. */
export const jdFromUnixMs = (ms: number) => ms / 86400000 + 2440587.5;
export const unixMsFromJd = (jd: number) => (jd - 2440587.5) * 86400000;
