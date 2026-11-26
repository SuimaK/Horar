/** Тексты ошибок и предупреждений формы. Нейтральный тон (ТЗ, 4.3). */
import { formatOffset, formatDate, formatTime, utcWall } from '../time/format';
import { MAX_YEAR, MIN_YEAR } from '../time/parse';
import type { FieldError, WarningCode } from './chart-input';

export function errorMessage(e: FieldError): string {
  switch (e.code) {
    case 'DATE_FORMAT':
      return 'Дата вводится в формате ДД.ММ.ГГГГ.';
    case 'DATE_INVALID':
      return 'Такой даты нет в календаре.';
    case 'DATE_OUT_OF_RANGE':
      return `Поддерживаются даты с ${MIN_YEAR} по ${MAX_YEAR} год: в этом диапазоне проверены эфемериды и часовые пояса.`;
    case 'TIME_FORMAT':
      return 'Время вводится в формате ЧЧ:ММ или ЧЧ:ММ:СС.';
    case 'LAT_FORMAT':
      return 'Широта: десятичные градусы (55.75) или градусы и минуты (55°45′ N).';
    case 'LON_FORMAT':
      return 'Долгота: десятичные градусы (37.62) или градусы и минуты (37°37′ E).';
    case 'LATITUDE_OUTSIDE_VALIDATED_REGION':
      return 'Широта вне диапазона −65…+65°. У полярного круга часть градусов эклиптики не восходит, и квадрантные системы домов вырождаются, поэтому карта для этого места не строится. Код: LATITUDE_OUTSIDE_VALIDATED_REGION.';
    case 'LONGITUDE_OUT_OF_RANGE':
      return 'Долгота должна быть в диапазоне −180…+180°.';
    case 'TIME_ZONE_UNKNOWN':
      return 'Часовой пояс для этого места не определён. Укажите смещение от UTC вручную.';
    case 'OFFSET_FORMAT':
      return 'Смещение вводится как UTC±ЧЧ:ММ, например +03:00, в пределах ±14 ч.';
    case 'LOCAL_TIME_NONEXISTENT': {
      const g = e.gap!;
      return `Такого местного времени не было: ${formatDate(g.start)} в поясе ${g.timeZone} часы переведены с ${formatTime(g.start)} сразу на ${formatTime(g.end)}. Укажите время до ${formatTime(g.start)} или после ${formatTime(g.end)}.`;
    }
    case 'LOCAL_TIME_AMBIGUOUS':
      return 'Это местное время было дважды: часы переводили назад. Выберите, какой из двух моментов UTC имеется в виду.';
  }
}

export function ambiguousOptionLabel(o: { utcMs: number; offsetSeconds: number }, index: number): string {
  const u = utcWall(o.utcMs);
  return `${index === 0 ? 'Первое' : 'Второе'} (${formatOffset(o.offsetSeconds)}): ${formatTime(u, true)} UTC`;
}

export function warningMessage(w: WarningCode): string {
  switch (w) {
    case 'HISTORICAL_TIME_ZONE_PRE_1970':
      return 'Дата раньше 1970 года: исторические данные о часовых поясах менее надёжны. Проверьте смещение от UTC по источнику и при необходимости задайте его вручную.';
  }
}
