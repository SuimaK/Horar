/** Загрузка таблиц с диска (тесты и скрипты Node). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EphemerisStore, type Manifest } from './store';

export function nodeStore(dir = 'public/ephemeris'): EphemerisStore {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;
  return new EphemerisStore(manifest, async (file) => {
    const b = readFileSync(join(dir, file));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
}
