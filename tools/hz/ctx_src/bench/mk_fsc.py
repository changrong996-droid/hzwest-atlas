# 标杆样本生成脚本（hark-fangyi）：在放有 OSM 原始块 b1–b4.xml 的目录里先跑 parse.py 存 osm.pkl，再跑本脚本，输出 bldg.geojson / road.geojson → gzip 进 tools/hz/ctx_src/ → tools/hz/ctxlayer.py。规则见 docs/ctx-mid.md。
# 标杆样本：未来科技城核心（模型系 x 3300..6800 东, z -1000..3000 南）→ 中景建筑 + 中景路网 GeoJSON（WGS84）
import pickle, math, json, gzip, collections
N,W,R,PN=pickle.load(open('osm.pkl','rb'))
LON0,LAT0,ROT,DX=119.9817,30.3004,4.3,10
KX,KY=111320*math.cos(math.radians(LAT0)),110540; ca,sa=math.cos(math.radians(ROT)),math.sin(math.radians(ROT))
def tm(c):
    X,Y=(c[0]-LON0)*KX-DX,(c[1]-LAT0)*KY; return (X*ca+Y*sa, -(-X*sa+Y*ca))
BOX=(3300,6800,-1000,3000)
def inb(q): return BOX[0]<=q[0]<=BOX[1] and BOX[2]<=q[1]<=BOX[3]
def coords(wid): return [N[i] for i in W[wid][0] if i in N]
def area_m2(r):
    P=[tm(c) for c in r]; a=0
    for i in range(len(P)-1): a+=P[i][0]*P[i+1][1]-P[i+1][0]*P[i][1]
    return abs(a/2)
def num(s):
    try: return float(str(s).replace('m','').replace(',','.').split(';')[0].strip())
    except: return None
# 估高规则（无 height / building:levels 时）；返回 (高 m, 依据)
def est(t, A):
    b=t.get('building')
    if b in ('house','detached','terrace'): return 10,'类型 house≈3 层'
    if b in ('roof','carport'): return 6,'雨棚'
    if b in ('apartments','residential','dormitory'):
        return (32,'住宅(样本内 100 栋有层数，中位 10 层)') if A<=1000 else (30,'大住宅楼≈9 层')
    if b in ('commercial','office','retail'): return 24,'商办≈6 层'
    if b in ('school','university','college','kindergarten'): return 16,'学校≈4 层'
    if b in ('transportation','train_station','industrial','warehouse'): return 12,'交通/厂房'
    if A<150: return 7,'小体量≈2 层'
    if A<1000: return 10,'其它小楼(样本中位 3 层)'
    return 16,'其它大楼(样本中位 5 层)'
F=[]; cnt=collections.Counter()
rings=[]
for wid,(nds,t) in W.items():
    if 'building' in t and t['building']!='no' and nds and nds[0]==nds[-1]: rings.append((coords(wid),t))
for rid,(mem,t) in R.items():
    if 'building' in t:
        for m in mem:
            if m[0]=='way' and m[2]=='outer' and m[1] in W and W[m[1]][0][0]==W[m[1]][0][-1]: rings.append((coords(m[1]),t))
for r,t in rings:
    if len(r)<4: continue
    P=[tm(c) for c in r]; cx=sum(p[0] for p in P)/len(P); cz=sum(p[1] for p in P)/len(P)
    if not inb((cx,cz)): continue
    A=area_m2(r)
    if A<30: continue
    h=num(t.get('height')); src='OSM height'
    if not h:
        lv=num(t.get('building:levels'))
        if lv: h=lv*3.2; src='OSM 层数×3.2'
    if h: real=1
    else: h,src=est(t,A); real=0
    cnt[src]+=1
    F.append({'type':'Feature','properties':{'height':round(h,1),'color':'#e2ddd3' if real else '#ece8df'},'geometry':{'type':'Polygon','coordinates':[r]}})
print(len(F),'bldg'); [print(' ',k,v) for k,v in cnt.most_common()]
json.dump({'type':'FeatureCollection','note':'标杆样本 · 未来科技城核心（站东 3.3–6.8 km，北 1 km 至南 3 km）。OSM 现状（api.openstreetmap.org/api/0.6，2026-11-22 下载）。有 height / building:levels 的用实高（深色），其余按类型与占地估高（浅色），规则见 docs/ctx-mid.md','features':F},open('bldg.geojson','w'),ensure_ascii=False,separators=(',',':'))
# 路网：高速/快速路 22 m，主干/次干 14 m，支路 9 m（与底座 osmctx 同宽同色）
WID={'motorway':22,'trunk':22,'primary':14,'secondary':14,'tertiary':9,'motorway_link':9,'trunk_link':9,'primary_link':9}
RF=[]
for wid,(nds,t) in W.items():
    w=WID.get(t.get('highway'))
    if not w or t.get('tunnel')=='yes': continue
    c=coords(wid); run=[]; prev=None
    def flush():
        if len(run)>1: RF.append({'type':'Feature','properties':{'width':w,'color':'#ffffff' if w>9 else '#fbfaf7','y':{22:0.25,14:0.24,9:0.23}[w],**({'name':t['name']} if t.get('name') else {})},'geometry':{'type':'LineString','coordinates':run[:]}})
    for p in c:
        if inb(tm(p)):
            if not run and prev is not None: run.append(prev)
            run.append(p)
        else:
            if run: run.append(p); flush(); run=[]
        prev=p
    flush()
print(len(RF),'road runs')
json.dump({'type':'FeatureCollection','note':'标杆样本 · 未来科技城核心路网（OSM highway motorway…tertiary，隧道不画；2026-11-22 下载）','features':RF},open('road.geojson','w'),ensure_ascii=False,separators=(',',':'))
