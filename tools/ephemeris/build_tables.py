#!/usr/bin/env python3
"""
Строит таблицы эфемерид «Хорара» из Swiss Ephemeris.

Как в приложении «Астро»: Swiss Ephemeris работает только здесь, при сборке.
Приложение получает готовые таблицы и считает положения по ним, без кода
Swiss Ephemeris.

Каждый ряд (долгота Луны, широта Марса, нутация и т. д.) разбит на отрезки
равной длины. На отрезке значение задано многочленом Чебышёва, построенным
по значениям Swiss Ephemeris в узлах Чебышёва. Коэффициенты округляются до
фиксированной единицы и записываются как целые переменной длины (zigzag
varint).

Положения планет берутся без нутации и без гравитационного отклонения света
(FLG_NONUT | FLG_NOGDEFL): так ряды гладкие. Нутация (отдельный ряд) и
отклонение света Солнцем добавляются в приложении по формулам Swiss Ephemeris.

Требуется: pip install pyswisseph numpy; файлы Swiss Ephemeris sepl_12.se1,
semo_12.se1, sepl_18.se1, semo_18.se1 в каталоге, переданном через --ephe.

Запуск:
  python tools/ephemeris/build_tables.py --ephe ~/ephe --out public/ephemeris
"""
import argparse
import json
import struct
from pathlib import Path

import numpy as np
import swisseph as swe

FORMAT_VERSION = 1
ARCSEC = 1 / 3600

# Чанки по 50 лет; первый начинается за год до 1800, последний заканчивается
# через год после 2200, чтобы поиск событий не упирался в границу.
CHUNKS = [
    (1799, 1850), (1850, 1900), (1900, 1950), (1950, 2000),
    (2000, 2050), (2050, 2100), (2100, 2150), (2150, 2202),
]

F_BODY = swe.FLG_SWIEPH | swe.FLG_NONUT | swe.FLG_NOGDEFL

# имя, номер SE, длина отрезка (сут.), степень многочлена, компоненты
BODIES = [
    ('sun', swe.SUN, 16, 9, ('lon', 'lat', 'dist')),
    ('moon', swe.MOON, 8, 14, ('lon', 'lat')),
    ('mercury', swe.MERCURY, 16, 11, ('lon', 'lat', 'dist')),
    ('venus', swe.VENUS, 16, 10, ('lon', 'lat', 'dist')),
    ('mars', swe.MARS, 16, 10, ('lon', 'lat', 'dist')),
    ('jupiter', swe.JUPITER, 32, 10, ('lon', 'lat', 'dist')),
    ('saturn', swe.SATURN, 32, 10, ('lon', 'lat', 'dist')),
    ('uranus', swe.URANUS, 32, 9, ('lon', 'lat', 'dist')),
    ('neptune', swe.NEPTUNE, 32, 9, ('lon', 'lat', 'dist')),
    ('pluto', swe.PLUTO, 32, 9, ('lon', 'lat', 'dist')),
    ('mean_node', swe.MEAN_NODE, 64, 6, ('lon',)),
    ('true_node', swe.TRUE_NODE, 4, 12, ('lon',)),
]

# единицы округления коэффициентов
UNITS = {
    'lon': 1e-3 * ARCSEC,   # градусы
    'lat': 1e-3 * ARCSEC,
    'dist': 1e-7,           # а. е. (нужно только для отклонения света)
    'eps': 1e-4 * ARCSEC,   # истинный наклон эклиптики, градусы
    'dpsi': 1e-4 * ARCSEC,  # нутация в долготе, градусы
    'stcorr': 1e-4 * ARCSEC,  # поправка звёздного времени, градусы
    'deltat': 1e-4,         # ΔT, секунды
}


def gmst_simple(jd_ut):
    """Линейное приближение звёздного времени (градусы); поправку к нему хранит ряд stcorr."""
    return 280.46061837 + 360.98564736629 * (jd_ut - 2451545.0)


def sample(name, ipl, comp, jds):
    if name == 'nutation':
        out = []
        for jd in jds:
            nut = swe.calc_ut(jd, swe.ECL_NUT, 0)[0]
            out.append(nut[0] if comp == 'eps' else nut[2])
        return np.array(out)
    if name == 'sidereal':
        return np.array([(swe.sidtime(jd) * 15 - gmst_simple(jd) + 180) % 360 - 180 for jd in jds])
    if name == 'deltat':
        return np.array([swe.deltat(jd) * 86400 for jd in jds])
    idx = {'lon': 0, 'lat': 1, 'dist': 2}[comp]
    vals = np.array([swe.calc_ut(jd, ipl, F_BODY)[0][idx] for jd in jds])
    if comp == 'lon':
        vals = np.degrees(np.unwrap(np.radians(vals)))
    return vals


def cheb_coeffs(values):
    """Коэффициенты интерполяции по узлам Чебышёва x_k = cos(pi (k + 1/2) / n)."""
    n = len(values)
    k = np.arange(n)
    c = np.array([2.0 / n * np.sum(values * np.cos(np.pi * j * (k + 0.5) / n)) for j in range(n)])
    c[0] /= 2
    return c


def zigzag_varint(v, out):
    v = int(v)
    u = v * 2 if v >= 0 else -v * 2 - 1
    while True:
        b = u & 0x7F
        u >>= 7
        if u:
            out.append(b | 0x80)
        else:
            out.append(b)
            return


def series_list():
    for name, ipl, seg, deg, comps in BODIES:
        for comp in comps:
            yield f'{name}.{comp}', name, ipl, comp, seg, deg
    yield 'nutation.eps', 'nutation', None, 'eps', 8, 10
    yield 'nutation.dpsi', 'nutation', None, 'dpsi', 8, 10
    yield 'sidereal.stcorr', 'sidereal', None, 'stcorr', 8, 10
    yield 'deltat.seconds', 'deltat', None, 'deltat', 512, 6


def build_chunk(y0, y1):
    jd0 = swe.julday(y0, 1, 1, 0.0)
    jd1 = swe.julday(y1, 1, 1, 0.0)
    header = {
        'format': FORMAT_VERSION,
        'source': f'Swiss Ephemeris {swe.version}, файлы SE1 (sepl/semo)',
        'timeScale': 'UT',
        'frame': 'геоцентрические, тропические, истинное равноденствие даты; без нутации и отклонения света',
        'from': jd0,
        'to': jd1,
        'series': [],
    }
    data = bytearray()
    for key, name, ipl, comp, seg, deg in series_list():
        n = deg + 1
        nseg = int(np.ceil((jd1 - jd0) / seg))
        x = np.cos(np.pi * (np.arange(n) + 0.5) / n)
        unit = UNITS[comp]
        offset = len(data)
        for s in range(nseg):
            a = jd0 + s * seg
            jds = a + (x + 1) / 2 * seg
            c = cheb_coeffs(sample(name, ipl, comp, jds))
            for v in np.round(c / unit):
                zigzag_varint(v, data)
        header['series'].append({
            'key': key, 'segmentDays': seg, 'coefficients': n, 'segments': nseg,
            'unit': unit, 'offset': offset, 'bytes': len(data) - offset,
        })
    head = json.dumps(header, ensure_ascii=False).encode('utf8')
    return b'HEPH' + struct.pack('<HI', FORMAT_VERSION, len(head)) + head + bytes(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ephe', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    swe.set_ephe_path(args.ephe)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    manifest = {'format': FORMAT_VERSION, 'source': f'Swiss Ephemeris {swe.version}', 'chunks': []}
    for y0, y1 in CHUNKS:
        blob = build_chunk(y0, y1)
        name = f'eph-{y0}-{y1}.bin'
        (out / name).write_bytes(blob)
        manifest['chunks'].append({
            'file': name, 'from': swe.julday(y0, 1, 1, 0.0), 'to': swe.julday(y1, 1, 1, 0.0), 'bytes': len(blob),
        })
        print(name, len(blob))
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
