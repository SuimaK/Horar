#!/usr/bin/env python3
"""
Эталонные значения Swiss Ephemeris для тестов (tests/fixtures/swe-reference.json):
положения, скорости, склонения, куспиды домов, наклон эклиптики, ΔT.

Запуск:
  python tools/ephemeris/make_reference.py --ephe ~/ephe --out tests/fixtures/swe-reference.json
"""
import argparse
import json
import random

import swisseph as swe

BODIES = {
    'sun': swe.SUN, 'moon': swe.MOON, 'mercury': swe.MERCURY, 'venus': swe.VENUS, 'mars': swe.MARS,
    'jupiter': swe.JUPITER, 'saturn': swe.SATURN, 'uranus': swe.URANUS, 'neptune': swe.NEPTUNE,
    'pluto': swe.PLUTO, 'mean_node': swe.MEAN_NODE, 'true_node': swe.TRUE_NODE,
}
HOUSES = {'regiomontanus': b'R', 'placidus': b'P', 'alcabitius': b'B', 'whole_sign': b'W'}
F = swe.FLG_SWIEPH | swe.FLG_SPEED


def case(jd, lat, lon, note=''):
    out = {'jd': jd, 'lat': lat, 'lon': lon, 'note': note, 'bodies': {}, 'houses': {}}
    for name, ipl in BODIES.items():
        ecl = swe.calc_ut(jd, ipl, F)[0]
        equ = swe.calc_ut(jd, ipl, F | swe.FLG_EQUATORIAL)[0]
        out['bodies'][name] = {'lon': ecl[0], 'lat': ecl[1], 'speed': ecl[3], 'ra': equ[0], 'dec': equ[1]}
    for name, code in HOUSES.items():
        cusps, ascmc = swe.houses_ex(jd, lat, lon, code)
        out['houses'][name] = {'cusps': list(cusps), 'asc': ascmc[0], 'mc': ascmc[1], 'armc': ascmc[2]}
    nut = swe.calc_ut(jd, swe.ECL_NUT, 0)[0]
    out['eps'] = nut[0]
    out['dpsi'] = nut[2]
    out['deltat'] = swe.deltat(jd) * 86400
    out['sidtime'] = swe.sidtime(jd)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ephe', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    swe.set_ephe_path(args.ephe)
    rnd = random.Random(20261127)
    jd0, jd1 = swe.julday(1800, 1, 1, 0), swe.julday(2201, 1, 1, 0)
    cases = []
    for _ in range(300):
        cases.append(case(rnd.uniform(jd0, jd1), round(rnd.uniform(-65, 65), 4), round(rnd.uniform(-180, 180), 4), 'random'))
    # широты 60–65° и южное полушарие отдельно
    for lat in (60, 62.5, 64.99, -60, -64.99):
        cases.append(case(rnd.uniform(jd0, jd1), lat, round(rnd.uniform(-180, 180), 4), 'high-latitude'))
    # верхние соединения с Солнцем: проверка отклонения света
    for ipl, name in ((swe.MERCURY, 'mercury'), (swe.VENUS, 'venus'), (swe.MARS, 'mars'), (swe.JUPITER, 'jupiter'), (swe.SATURN, 'saturn'), (swe.NEPTUNE, 'neptune')):
        jd = swe.julday(2000, 1, 1, 0)
        found = 0
        while found < 4 and jd < swe.julday(2040, 1, 1, 0):
            s = swe.calc_ut(jd, swe.SUN, F)[0][0]
            p = swe.calc_ut(jd, ipl, F)[0]
            d = (p[0] - s + 180) % 360 - 180
            if abs(d) < 0.6 and p[2] > swe.calc_ut(jd, swe.SUN, F)[0][2]:
                cases.append(case(jd, 55.75, 37.62, f'superior-conjunction-{name}'))
                found += 1
                jd += 200
            jd += 0.05
    with open(args.out, 'w') as f:
        json.dump({'source': f'Swiss Ephemeris {swe.version}, SE1', 'cases': cases}, f, ensure_ascii=False, separators=(',', ':'))
    print(len(cases))


if __name__ == '__main__':
    main()
