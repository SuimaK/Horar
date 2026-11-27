/**
 * Маски полей даты и времени: на телефоне достаточно набирать цифры,
 * разделители подставляются сами. Если разделитель набран вручную
 * («9:05», «1.2.2026»), строка остаётся как есть.
 */
function mask(text: string, sep: string, groups: number[]): string {
  const parts: string[] = [''];
  let trailingSep = false;
  for (const ch of text) {
    const g = parts.length - 1;
    if (/[0-9]/.test(ch)) {
      if (parts[g].length >= groups[g]) {
        if (g + 1 >= groups.length) break;
        parts.push('');
      }
      parts[parts.length - 1] += ch;
      trailingSep = false;
    } else if (/[.:,/\- ]/.test(ch) && parts[g] && g + 1 < groups.length) {
      // Набранный вручную разделитель закрывает группу («9:05», «1.2.2026»).
      parts.push('');
      trailingSep = true;
    }
  }
  if (trailingSep) parts.pop();
  return parts.join(sep) + (trailingSep ? sep : '');
}

/** «2335» → «23:35», «233510» → «23:35:10». */
export const maskTime = (text: string) => mask(text, ':', [2, 2, 2]);

/** «19112026» → «19.11.2026». */
export const maskDate = (text: string) => mask(text, '.', [2, 2, 4]);
