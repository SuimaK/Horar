# Сторонние данные и библиотеки

| Компонент | Назначение | Лицензия |
|---|---|---|
| GeoNames `cities15000` (через npm-пакет `cities15000@0.0.1`) | справочник населённых пунктов: координаты, пояса IANA, альтернативные названия | данные GeoNames — CC BY 4.0, https://www.geonames.org |
| hflabs/city (`data/sources/hflabs-city.csv`) | русские названия и регионы городов России | CC BY-SA 4.0, https://github.com/hflabs/city |
| `@photostructure/tz-lookup` | часовой пояс IANA по координатам, офлайн | CC0-1.0 |
| Preact | интерфейс | MIT |
| База часовых поясов IANA (tzdata) | история переводов часов; берётся из браузера через `Intl` | public domain |

Сгенерированный справочник `src/data/cities.generated.json` (создаётся `npm run data`) объединяет данные GeoNames и hflabs/city и распространяется на условиях CC BY-SA 4.0 с указанием обоих источников.

## Эфемериды

Таблицы `public/ephemeris/*.bin` рассчитаны программой Swiss Ephemeris (Astrodienst AG, https://www.astro.com/swisseph/) по файлам SE1 и записаны как коэффициенты Чебышёва. Код Swiss Ephemeris в приложение не входит, он используется только скриптами `tools/ephemeris/` при сборке (как в приложении «Астро», решение ТЗ 6.4). Swiss Ephemeris распространяется по лицензии AGPL или по профессиональной лицензии Astrodienst; условия для публикации стоит сверить отдельно.

Таблица эффективной массы Солнца для отклонения света внутри солнечного диска — по модели M. Stix, «The Sun», с. 47 (значения как в Swiss Ephemeris).
