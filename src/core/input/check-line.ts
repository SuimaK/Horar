import { formatCoordinate } from '../geo/coords';
import { formatDate, formatOffset, formatTime, utcWall } from '../time/format';
import type { ChartMoment } from './chart-input';

/**
 * Строка проверки под полями (ТЗ, 5.1):
 * «19.11.2026 23:35 (UTC+03:00) = 20:35 UTC, 55°45′ N 37°37′ E».
 * Если дата UTC отличается от местной, она указывается.
 */
export function checkLine(m: ChartMoment): string {
  const u = utcWall(m.utcMs);
  const sameDay = u.year === m.local.year && u.month === m.local.month && u.day === m.local.day;
  const showSec = m.local.second !== 0;
  const local = `${formatDate(m.local)} ${formatTime(m.local, showSec)} (${formatOffset(m.offsetSeconds)})`;
  const utc = `${sameDay ? '' : formatDate(u) + ' '}${formatTime(u, showSec || u.second !== 0)} UTC`;
  return `${local} = ${utc}, ${formatCoordinate(m.latitude, 'lat')} ${formatCoordinate(m.longitude, 'lon')}`;
}
