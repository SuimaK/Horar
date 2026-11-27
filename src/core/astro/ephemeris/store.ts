import { evaluateSeries, parseChunk, type EphemerisChunk } from './chunk';

export interface ManifestChunk {
  file: string;
  from: number;
  to: number;
  bytes: number;
}

export interface Manifest {
  format: number;
  source: string;
  chunks: ManifestChunk[];
}

/** Загружает файл таблиц по имени (в браузере — fetch, в тестах — чтение с диска). */
export type ChunkFetcher = (file: string) => Promise<ArrayBuffer>;

export class EphemerisRangeError extends Error {
  constructor(public jd: number) {
    super(`Нет таблиц эфемерид для JD ${jd.toFixed(5)}.`);
  }
}

/** Таблицы эфемерид, загруженные по 50-летним частям. */
export class EphemerisStore {
  private chunks: EphemerisChunk[] = [];
  private pending = new Map<string, Promise<void>>();

  constructor(public readonly manifest: Manifest, private fetcher: ChunkFetcher) {}

  get source(): string {
    return this.manifest.source;
  }

  get range(): [number, number] {
    const c = this.manifest.chunks;
    return [c[0].from, c[c.length - 1].to];
  }

  isLoaded(jdFrom: number, jdTo = jdFrom): boolean {
    return this.neededFiles(jdFrom, jdTo).every((f) => this.chunks.some((c) => c.from === f.from));
  }

  private neededFiles(jdFrom: number, jdTo: number): ManifestChunk[] {
    const [lo, hi] = this.range;
    if (jdFrom < lo || jdTo >= hi) throw new EphemerisRangeError(jdFrom < lo ? jdFrom : jdTo);
    return this.manifest.chunks.filter((c) => c.to > jdFrom && c.from <= jdTo);
  }

  /** Загружает части таблиц, покрывающие [jdFrom, jdTo]. */
  async ensure(jdFrom: number, jdTo = jdFrom): Promise<void> {
    await Promise.all(
      this.neededFiles(jdFrom, jdTo).map((f) => {
        if (this.chunks.some((c) => c.from === f.from)) return Promise.resolve();
        let p = this.pending.get(f.file);
        if (!p) {
          p = this.fetcher(f.file).then((buf) => {
            this.chunks.push(parseChunk(buf));
            this.chunks.sort((a, b) => a.from - b.from);
          });
          p.finally(() => this.pending.delete(f.file));
          this.pending.set(f.file, p);
        }
        return p;
      }),
    );
  }

  /** Значение ряда и производная в сутки. Части таблиц должны быть загружены. */
  evaluate(key: string, jd: number): [number, number] {
    const chunk = this.chunks.find((c) => jd >= c.from && jd < c.to);
    if (!chunk) throw new EphemerisRangeError(jd);
    const s = chunk.series.get(key);
    if (!s) throw new Error(`Нет ряда ${key} в таблицах эфемерид.`);
    return evaluateSeries(s, chunk.from, jd);
  }
}
