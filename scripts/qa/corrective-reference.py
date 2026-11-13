# Offline independent numeric reference. Requires pyswisseph. Review fixture changes; do not generate expectations from the JS app.
import swisseph as swe, math,json,datetime
from functools import lru_cache
from pathlib import Path
names=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];ids=[swe.SUN,swe.MOON,swe.MERCURY,swe.VENUS,swe.MARS,swe.JUPITER,swe.SATURN];flags=swe.FLG_MOSEPH|swe.FLG_SPEED
jd0=swe.julday(2025,1,1,0);jd1=jd0+730
@lru_cache(maxsize=500000)
def pos(t,p):return swe.calc_ut(t,ids[names.index(p)],flags)[0]
def un(x,ref):return ref+(x-ref+180)%360-180
def bisect(fn,lo,hi):
 fl=fn(lo)
 for _ in range(42):
  mid=(lo+hi)/2;fm=fn(mid)
  if fl*fm<=0:hi=mid
  else:lo=mid;fl=fm
 return (lo+hi)/2
aspects=[];events=[]
t=jd0
while t<jd1:
 u=t+.125
 for p in names:
  x,y=pos(t,p),pos(u,p)
  if int(x[0]//30)!=int(y[0]//30):
   yy=un(y[0],x[0]);goal=30*round((x[0]+yy)/60)
   root=bisect(lambda z:un(pos(z,p)[0],x[0])-goal,t,u);events.append({'planet':p,'type':'INGRESS','jd':root})
  if x[3]*y[3]<0:
   root=bisect(lambda z:pos(z,p)[3],t,u);events.append({'planet':p,'type':'STATION','jd':root})
 for i,a in enumerate(names):
  for b in names[i+1:]:
   x=(pos(t,b)[0]-pos(t,a)[0])%360;y=un((pos(u,b)[0]-pos(u,a)[0])%360,x)
   for target in [0,60,90,120,180,240,270,300]:
    goal=target+360*round(((x+y)/2-target)/360)
    if (x-goal)*(y-goal)<=0 and abs(y-x)>1e-10:
     root=bisect(lambda z:un((pos(z,b)[0]-pos(z,a)[0])%360,x)-goal,t,u)
     aspects.append({'a':a,'b':b,'target':target,'jd':root})
 t=u
selected=[]
for kind,relation in [('INGRESS','AFTER'),('INGRESS','BEFORE'),('STATION','AFTER'),('STATION','BEFORE'),('INGRESS','AFTER'),('INGRESS','AFTER')]:
 for a in aspects:
  if any(abs(a['jd']-(q['start_jd']+q['aspect_day_offset']))<.1 for q in selected):continue
  candidates=[e for e in events if e['planet'] in [a['a'],a['b']] and e['type']==kind and 0<abs(e['jd']-a['jd'])<2/24 and ((e['jd']>a['jd'])==(relation=='AFTER'))]
  if not candidates:continue
  e=candidates[0];start=min(a['jd'],e['jd'])-.5/24
  before=[v for v in events if v['planet'] in [a['a'],a['b']] and start<=v['jd']<a['jd']-2/86400]
  selected.append({'case':kind+'_'+relation,'start_jd':start,'a':a['a'],'b':a['b'],'aspect_target':a['target'],'aspect_day_offset':a['jd']-start,'event':{**e,'day_offset':e['jd']-start},'sign_change_before_perfection':any(x['type']=='INGRESS' for x in before),'station_before_perfection':any(x['type']=='STATION' for x in before),'before_events':before});break
# Fixed antiscion independent formula and root, not a moving mirror.
start=jd0;a,b='Moon','Venus';anchor=(180-pos(start,b)[0])%360
for i in range(1,4000):
 lo=start+(i-1)/96;hi=start+i/96;x=un(pos(lo,a)[0],anchor)-anchor;y=un(pos(hi,a)[0],anchor)-anchor
 if x*y<0 and abs(y-x)<5:
  exact=bisect(lambda z:un(pos(z,a)[0],anchor)-anchor,lo,hi);anti={'start_jd':start,'a':a,'b':b,'fixed_antiscion_longitude_deg':anchor,'exact_day_offset':exact-start,'body_separation_at_exact':(pos(exact,b)[0]-pos(exact,a)[0])%360};break
# Geometric sunrise in London independently bisected from equatorial coordinates.
lat=51.5074;lon=-.1278;start=jd0
def altitude(t):
 ra,dec=swe.calc_ut(t,swe.SUN,flags|swe.FLG_EQUATORIAL)[0][:2];ha=math.radians(((swe.sidtime(t)*15+lon-ra+180)%360)-180)
 return math.degrees(math.asin(math.sin(math.radians(lat))*math.sin(math.radians(dec))+math.cos(math.radians(lat))*math.cos(math.radians(dec))*math.cos(ha)))
sunrise=bisect(altitude,start+6/24,start+10/24)
# House cusp case independently computes Regiomontanus and checks the 5-degree same-sign rule.
cusp_case=None
for i in range(0,24*30):
 t=jd0+i/24;cusps,asc=swe.houses_ex(t,lat,lon,b'R')
 for p in names:
  l=pos(t,p)[0]
  raw=next(h+1 for h in range(12) if (l-cusps[h])%360<(cusps[(h+1)%12]-cusps[h])%360)
  nex=cusps[raw%12];distance=(nex-l)%360
  if 1<distance<4.5 and int(l//30)==int(nex//30):cusp_case={'jd':t,'latitude_deg':lat,'longitude_deg':lon,'planet':p,'planet_longitude_deg':l,'raw_house':raw,'effective_house':raw%12+1,'next_cusp_deg':nex};break
 if cusp_case:break
out={'source':'Independent pyswisseph '+swe.version+' Moshier; Python bracketing, no JS engine import','root_tolerance_seconds':2,'chronology_cases':selected,'antiscion':anti,'sunrise':{'jd':sunrise,'latitude_deg':lat,'longitude_deg':lon,'altitude_deg':altitude(sunrise)},'cusp':cusp_case}
(Path(__file__).resolve().parents[2]/'tests/fixtures/corrective_independent_ephemeris.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
