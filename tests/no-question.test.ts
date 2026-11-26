import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ТЗ 1 и 6.3: в интерфейсе и модели данных нет понятий вопроса, кверента и т. п.
const FORBIDDEN = /\b(question|querent|quesited|scenario|verdict)\b|вопрос|кверент|сценари|исход/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(p) ? [p] : [];
  });
}

describe('нет полей вопроса', () => {
  it('исходный код не содержит понятий вопроса', () => {
    const hits = files('src').filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
