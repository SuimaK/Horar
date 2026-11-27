/**
 * Чтение таблиц эфемерид (формат tools/ephemeris/build_tables.py):
 * «HEPH», версия (u16), длина заголовка (u32), JSON-заголовок, коэффициенты
 * Чебышёва (zigzag varint).
 */

export interface SeriesHeader {
  key: string;
  segmentDays: number;
  coefficients: number;
  segments: number;
  unit: number;
  offset: number;
  bytes: number;
}

export interface ChunkHeader {
  format: number;
  source: string;
  timeScale: 'UT';
  from: number;
  to: number;
  series: SeriesHeader[];
}

export interface Series {
  segmentDays: number;
  n: number;
  segments: number;
  coeffs: Float64Array;
}

export interface EphemerisChunk {
  from: number;
  to: number;
  source: string;
  series: Map<string, Series>;
}

export const SUPPORTED_FORMAT = 1;

export function parseChunk(buffer: ArrayBuffer): EphemerisChunk {
  const bytes = new Uint8Array(buffer);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== 'HEPH') throw new Error('Файл эфемерид повреждён: нет сигнатуры HEPH.');
  const view = new DataView(buffer);
  const format = view.getUint16(4, true);
  if (format !== SUPPORTED_FORMAT) throw new Error(`Неподдерживаемая версия таблиц эфемерид: ${format}.`);
  const headLen = view.getUint32(6, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(10, 10 + headLen))) as ChunkHeader;
  const data = bytes.subarray(10 + headLen);
  const series = new Map<string, Series>();
  for (const s of header.series) {
    const count = s.segments * s.coefficients;
    const coeffs = new Float64Array(count);
    let p = s.offset;
    for (let i = 0; i < count; i++) {
      let u = 0;
      let mul = 1;
      let b: number;
      do {
        b = data[p++];
        u += (b & 0x7f) * mul;
        mul *= 128;
      } while (b & 0x80);
      const v = u % 2 === 0 ? u / 2 : -(u + 1) / 2;
      coeffs[i] = v * s.unit;
    }
    if (p !== s.offset + s.bytes) throw new Error(`Файл эфемерид повреждён: ряд ${s.key}.`);
    series.set(s.key, { segmentDays: s.segmentDays, n: s.coefficients, segments: s.segments, coeffs });
  }
  return { from: header.from, to: header.to, source: header.source, series };
}

/** Значение ряда и его производная (единицы в сутки) в момент jd. */
export function evaluateSeries(s: Series, from: number, jd: number): [number, number] {
  let k = Math.floor((jd - from) / s.segmentDays);
  if (k < 0) k = 0;
  if (k >= s.segments) k = s.segments - 1;
  const a = from + k * s.segmentDays;
  const x = (2 * (jd - a)) / s.segmentDays - 1;
  const c = s.coeffs;
  const base = k * s.n;
  // Рекурсия Кленшоу для значения и производной.
  let b1 = 0, b2 = 0, d1 = 0, d2 = 0;
  for (let j = s.n - 1; j >= 1; j--) {
    const b0 = 2 * x * b1 - b2 + c[base + j];
    const d0 = 2 * x * d1 - d2 + 2 * b1;
    b2 = b1; b1 = b0;
    d2 = d1; d1 = d0;
  }
  const value = x * b1 - b2 + c[base];
  const deriv = x * d1 - d2 + b1;
  return [value, (deriv * 2) / s.segmentDays];
}
