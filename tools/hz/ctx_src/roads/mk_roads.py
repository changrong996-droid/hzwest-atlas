# 外接道路 R1：OSM 道路（api.openstreetmap.org 0.6 /map 瓦片，lon 119.93–120.11、lat 30.265–30.34）→ 按工程归类 → web/plan/roads.json
# 用法：python3 mk_roads.py <OSM瓦片目录>   （瓦片不入库）
import xml.etree.ElementTree as ET, glob, math, json, sys, datetime as dt, os
LON0,LAT0,ROT,DX=119.9817,30.3004,4.3,10
KX,KY=111320*math.cos(math.radians(LAT0)),110540; ca,sa=math.cos(math.radians(ROT)),math.sin(math.radians(ROT))
def tm(c):
    X,Y=(c[0]-LON0)*KX-DX,(c[1]-LAT0)*KY; return (X*ca+Y*sa, -(-X*sa+Y*ca))
HERE=os.path.dirname(os.path.abspath(__file__))
P=json.load(open(os.path.join(HERE,'projects.json')))
T0=dt.date.fromisoformat(P['t0'])
def tday(s): return None if not s else (dt.date.fromisoformat(s)-T0).days
XRAO=6650      # 绕城（G2504）在模型系的 x
XC=(-1270,-1015)  # 235国道 × 运溪高架 交叉（320国道互通）
def xyun(z):   # 运溪高架在 z 处的 x（两端点线性，够分东西）
    return -2116+( -37+2116)*(z+4661)/(4236+4661)
def cls(t,p):
    n=t.get('name',''); h=t['highway']; br=bool(t.get('bridge') or t.get('tunnel'))
    xm=sum(q[0] for q in p)/len(p); zm=sum(q[1] for q in p)/len(p)
    link=h.endswith('_link')
    if n=='运溪高架路' or (n=='东西大道' and br): return 'P01'
    if n=='东西大道' and -600<zm<3500: return 'P02'
    if n.startswith('文一西路隧道'): return 'P06'
    if n.startswith('留石') or (n=='访云街' and h=='trunk'):
        if xm>XRAO-600: return 'P03'
        return 'P05' if xm<xyun(zm)-150 else 'P04'
    if n=='良睦路' and zm<-300: return 'P09'
    if link and not n and math.hypot(xm-XC[0],zm-XC[1])<650: return 'P04'   # 320国道互通（与运溪交叉），先行段开通部分
    if link and not n:
        if -3200<xm<xyun(zm)+900 and -1800<zm<1800: return 'P07'
        if 900<xm<2700 and -2800<zm<700: return 'P08'
        if xm<xyun(zm)-150 and zm<1800 and zm>-1500: return 'P05'
    if h in('secondary','tertiary') and -1450<xm<1600 and -600<zm<700 and any(k in n for k in('云余','云彤','访云','站城')): return 'P10'
    return None
N={};ways=[]
for f in sorted(glob.glob(os.path.join(sys.argv[1],'t_*.xml'))):
    r=ET.parse(f).getroot()
    for nd in r.iter('node'): N[nd.get('id')]=(float(nd.get('lon')),float(nd.get('lat')))
    for w in r.iter('way'):
        t={x.get('k'):x.get('v') for x in w.iter('tag')}
        if t.get('highway') in ('motorway','trunk','primary','secondary','tertiary','motorway_link','trunk_link','primary_link','secondary_link','tertiary_link'):
            ways.append((w.get('id'),[x.get('ref') for x in w.iter('nd')],t))
# —— R2 立体化：桥（bridge=yes / viaduct）按 layer 估桥面高；接地面路的一端 RAMP m 内线性落地 ——
RAMP=220
def bh(t):
    if t.get('bridge') in (None,'no') : return 0
    try: L=int(t.get('layer','1'))
    except ValueError: L=1
    return 12 if L<=1 else 4+8*L
ends={}
for wid,nds,t in ways:
    for e in (nds[0],nds[-1]): ends.setdefault(e,[]).append(bh(t))
def lift(l):
    H=l['_H']; p=l['p']
    if not H: return [[a,b] for a,b in p]
    def tgt(nid):
        hs=ends.get(nid,[H])
        return 0 if min(hs)==0 else min(min(hs),H)
    e0,e1=tgt(l['_n'][0]),tgt(l['_n'][-1])
    s=[0]
    for a,b in zip(p,p[1:]): s.append(s[-1]+math.hypot(b[0]-a[0],b[1]-a[1]))
    T=s[-1] or 1; R=min(RAMP,T/2)
    o=[]
    for (x,z),d in zip(p,s):
        h=H
        if d<R: h=min(h,e0+(H-e0)*d/R)
        if T-d<R: h=min(h,e1+(H-e1)*(T-d)/R)
        o.append([x,z,round(h,1)])
    return o
seen=set(); out={pp['id']:[] for pp in P['projects']}; base=[]
for wid,nds,t in ways:
    if wid in seen: continue
    seen.add(wid)
    p=[tm(N[i]) for i in nds if i in N]
    if len(p)<2: continue
    c=cls(t,p); pts=[[round(a),round(b)] for a,b in p]
    W3={'motorway':22,'trunk':22,'primary':22,'secondary':14,'tertiary':9}
    if c: out[c].append({'w':W3.get(t['highway'],9),'p':pts,'_n':[i for i in nds if i in N],'_H':bh(t)})
    elif t['highway'] in('motorway','trunk','primary') and any(abs(a)<9000 and abs(b)<6000 for a,b in pts): base.append(pts)
res={'t0':P['t0'],'site':[-1450,1450,-600,600],'open_station':1101,'base':base,'projects':[]}
for pp in P['projects']:
    q=dict(pp); q['t_start']=tday(pp.get('start')); q['t_open']=tday(pp['open']); q['ms']=[[m[0],tday(m[0]) if len(m[0])==10 else tday(m[0]+'-15'),m[1]] for m in pp['milestones']]
    q['lines']=[{'w':l['w'],'p':lift(l)} for l in out[pp['id']]]; res['projects'].append(q)
    print(pp['id'],q['t_start'],q['t_open'],len(out[pp['id']]),'段')
dst=os.path.join(HERE,'../../../../web/plan/roads.json')
json.dump(res,open(dst,'w'),ensure_ascii=False,separators=(',',':'))
print('base',len(base),'→',os.path.normpath(dst),os.path.getsize(dst)//1024,'KB')
# —— 三维图层 road.hub（R3）：cut=true 让底座不画这些路；施工期画橙色带，开通后画白路（与底座同宽同色）——
BUILD='#e8a33c'
def dens(p,st=40):
    o=[p[0]]
    for a_,b_ in zip(p,p[1:]):
        d=math.hypot(b_[0]-a_[0],b_[1]-a_[1]); k=int(d//st)
        for i in range(1,k+1):
            if i*st<d:
                f=i*st/d; q=[round(a_[0]+(b_[0]-a_[0])*f),round(a_[1]+(b_[1]-a_[1])*f)]
                if len(a_)>2: q.append(round(a_[2]+(b_[2]-a_[2])*f,1))
                o.append(q)
        o.append(b_)
    if all(len(q)<3 or q[2]==0 for q in o): o=[q[:2] for q in o]
    return o
items=[]
for q in res['projects']:
    ts,to=q['t_start'],q['t_open']
    for l in q['lines']:
        p=dens(l['p']); w=l['w']
        items.append({'k':'road','n':q['id'],'p':p,'w':w,'c':'#ffffff' if w>=14 else '#fbfaf7','y':0.25,'from':to})
        it={'k':'road','n':q['id'],'p':p,'w':max(8,round(w*0.8)),'c':BUILD,'y':0.26,'to':to}
        if ts is not None: it['from']=ts
        items.append(it)
L={'id':'road.hub','name':'外接道路（按工期）','by':'hark-fangyi','src':{'text':'路形：© OpenStreetMap 贡献者；工期：公开报道（docs/ctx-roads.md）','license':'ODbL 1.0'},'cut':True,'items':items}
lay=os.path.join(HERE,'../../../../web/mods/ctx/road-hub.js')
open(lay,'w').write('// 远景图层 road.hub（外接道路按工期显隐，R3）· 自动生成：tools/hz/ctx_src/roads/mk_roads.py，勿手改 · hark-fangyi\n(window.HZ_CTX_LAYERS = window.HZ_CTX_LAYERS || []).push('+json.dumps(L,ensure_ascii=False,separators=(',',':'))+');\n')
print('layer',len(items),os.path.getsize(lay)//1024,'KB')
