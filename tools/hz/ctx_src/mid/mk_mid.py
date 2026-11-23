# 中景铺开（B1–B3，hark-fangyi）：OSM api 0.6 原始块 → osm.pkl（parse.py，同 bench/）→ 本脚本
#   → web/mods/ctx/bldg-mid.js（中景建筑，紧凑编码 + build）、road-mid.js（中景路网）、并给 place-names.geojson 加片区竖针。
# 用法：python3 mk_mid.py <osm.pkl>      规则见 docs/ctx-mid.md「铺开」
import pickle, math, json, sys, os, statistics, collections
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.normpath(os.path.join(HERE,'../../../..'))
N,W,R,PN=pickle.load(open(sys.argv[1],'rb'))
LON0,LAT0,ROT,DX=119.9817,30.3004,4.3,10
KX,KY=111320*math.cos(math.radians(LAT0)),110540; ca,sa=math.cos(math.radians(ROT)),math.sin(math.radians(ROT))
def tm(c):
    X,Y=(c[0]-LON0)*KX-DX,(c[1]-LAT0)*KY; return (X*ca+Y*sa, -(-X*sa+Y*ca))
Z2=(-8000,9000,-7000,4000); Z1=(-3300,3300,-2300,2300)   # Z1 = 底座城区框（osmctx 已有建筑）
inr=lambda q,B: B[0]<=q[0]<=B[1] and B[2]<=q[1]<=B[3]
def num(s):
    try: return float(str(s).replace('m','').replace(',','.').split(';')[0].strip())
    except: return None
def area(P):
    a=0
    for i in range(len(P)-1): a+=P[i][0]*P[i+1][1]-P[i+1][0]*P[i][1]
    return abs(a/2)
def dp(P,eps):   # 抽稀
    if len(P)<4: return P
    a,b=P[0],P[-1]; dx,dz=b[0]-a[0],b[1]-a[1]; L=math.hypot(dx,dz) or 1e-9; i,dm=0,0
    for k in range(1,len(P)-1):
        d=abs((P[k][0]-a[0])*dz-(P[k][1]-a[1])*dx)/L if L>1e-6 else math.hypot(P[k][0]-a[0],P[k][1]-a[1])
        if d>dm: i,dm=k,d
    return dp(P[:i+1],eps)[:-1]+dp(P[i:],eps) if dm>eps else [a,b]
# —— 建筑 ——
rings=[]
for wid,(nds,t) in W.items():
    if 'building' in t and t['building']!='no' and nds and nds[0]==nds[-1]: rings.append(([N[i] for i in nds if i in N],t))
for rid,(mem,t) in R.items():
    if 'building' in t:
        for m in mem:
            if m[0]=='way' and m[2]=='outer' and m[1] in W and W[m[1]][0][0]==W[m[1]][0][-1]: rings.append(([N[i] for i in W[m[1]][0] if i in N],t))
B=[]
for r,t in rings:
    if len(r)<4: continue
    P=[tm(c) for c in r]; cx=sum(p[0] for p in P)/len(P); cz=sum(p[1] for p in P)/len(P)
    if not inr((cx,cz),Z2) or inr((cx,cz),Z1): continue
    A=area(P)
    if A<30: continue
    h=num(t.get('height')); lv=num(t.get('building:levels'))
    B.append(dict(P=P,c=(cx,cz),A=A,t=t.get('building'),h=h if h else (lv*3.2 if lv else None),lv=lv))
# 分块标定：4 km 方格内有层数的住宅 ≥ 15 栋时用本格中位层数，否则用样本表（docs/ctx-mid.md）
cell=lambda c:(int((c[0]+8000)//4000),int((c[1]+7000)//4000))
RES=('apartments','residential','dormitory')
lvres=collections.defaultdict(list)
for b in B:
    if b['lv'] and b['t'] in RES: lvres[cell(b['c'])].append(b['lv'])
cal={k:statistics.median(v)*3.2 for k,v in lvres.items() if len(v)>=15}
def est(b):
    t,A=b['t'],b['A']
    if t in('house','detached','terrace'): return 10
    if t in('roof','carport'): return 6
    if t in RES: return round(cal.get(cell(b['c']),32 if A<=1000 else 30))
    if t in('commercial','office','retail'): return 24
    if t in('school','university','college','kindergarten'): return 16
    if t in('transportation','train_station','industrial','warehouse'): return 12
    if A<150: return 7
    if A<1000: return 10
    return 16
enc={'r':[],'f':[]}; nr=nf=0
for b in B:
    real=b['h'] is not None; h=b['h'] if real else est(b)
    P=dp([(round(x,1),round(z,1)) for x,z in b['P']],0.8)
    if P[0]==P[-1]: P=P[:-1]
    if len(P)<3: continue
    q=[int(round(h))]+[len(P)]; px=pz=0
    for x,z in P: xi,zi=int(round(x)),int(round(z)); q+= [xi-px,zi-pz]; px,pz=xi,zi
    enc['r' if real else 'f'].extend(q); nr+=real; nf+=not real
print('bldg',nr,'real',nf,'est','cal',{k:round(v,1) for k,v in cal.items()})
BUILD=r"""function (A) {   // 紧凑编码：[高, 点数, dx, dz, …]（坐标差分，模型系 m）；按所在点地形抬高
    const T = A.THREE, run = (q, col) => { const arr = [], ed = [];
      for (let i = 0; i < q.length;) { const h = q[i++], n = q[i++]; let x = 0, z = 0; const P = []; for (let k = 0; k < n; k++) { x += q[i++]; z += q[i++]; P.push(new T.Vector2(x, -z)); }
        let cx = 0, cz = 0; for (const p of P) { cx += p.x; cz -= p.y; } const g0 = A.ground(cx / n, cz / n);
        const g = new T.ExtrudeGeometry(new T.Shape(P), { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2).toNonIndexed(); if (g0 > 0) g.translate(0, g0, 0);
        const a = g.attributes.position.array; for (let j = 0; j < a.length; j++) arr.push(a[j]); const e = new T.EdgesGeometry(g, 30), ea = e.attributes.position.array; for (let j = 0; j < ea.length; j++) ed.push(ea[j]); g.dispose(); e.dispose(); }
      A.mesh(arr, col, 1); A.line(ed, A.COL.edge, 0.5); };
    run(this.q.r, A.COL.bReal); run(this.q.f, A.COL.bFake); }"""
def write(fn,L,build=None):
    s=json.dumps(L,ensure_ascii=False,separators=(',',':'))
    if build: s=s[:-1]+',"build":'+build+'}'
    open(os.path.join(ROOT,'web/mods/ctx',fn),'w').write('// 远景图层 '+L['id']+'（'+L['name']+'）· 自动生成：tools/hz/ctx_src/mid/mk_mid.py，勿手改 · hark-fangyi\n(window.HZ_CTX_LAYERS = window.HZ_CTX_LAYERS || []).push('+s+');\n')
    print(fn,os.path.getsize(os.path.join(ROOT,'web/mods/ctx',fn))//1024,'KB')
write('bldg-mid.js',{'id':'bldg.mid','name':'中景建筑','by':'hark-fangyi','src':{'text':'建筑轮廓：© OpenStreetMap 贡献者；高度：OSM 实高 / 层数，其余按 docs/ctx-mid.md 估','license':'ODbL 1.0'},'q':enc},BUILD.replace('this.q','A.layer.q'))
# —— 路网：Z2 内、Z1 外；与外接道路（road.hub）和底座同位的不重画 ——
hub=json.load(open(os.path.join(ROOT,'web/plan/roads.json')))
segs=[]
for q in hub['projects']:
    for l in q['lines']: segs+= list(zip(l['p'],l['p'][1:]))
C=60; idx=collections.defaultdict(list)
for a,b in segs:
    for x in range(int(min(a[0],b[0])//C)-1,int(max(a[0],b[0])//C)+2):
        for z in range(int(min(a[1],b[1])//C)-1,int(max(a[1],b[1])//C)+2): idx[(x,z)].append((a,b))
def nearhub(p):
    for a,b in idx.get((int(p[0]//C),int(p[1]//C)),()):
        dx,dz=b[0]-a[0],b[1]-a[1]; l2=dx*dx+dz*dz or 1; u=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l2))
        if (a[0]+u*dx-p[0])**2+(a[1]+u*dz-p[1])**2<324: return True
    return False
WID={'motorway':22,'trunk':22,'primary':14,'secondary':14,'tertiary':9,'motorway_link':9,'trunk_link':9,'primary_link':9}
items=[]
for wid,(nds,t) in W.items():
    w=WID.get(t.get('highway'))
    if not w or t.get('tunnel')=='yes': continue
    P=[tm(N[i]) for i in nds if i in N]; run=[]
    def flush():
        if len(run)>1: items.append({'k':'road','p':[[round(x),round(z)] for x,z in dp(run,1.5)],'w':w,'c':'#ffffff' if w>9 else '#fbfaf7','y':{22:0.25,14:0.24,9:0.23}[w]})
    for p in P:
        ok=inr(p,Z2) and not inr(p,Z1) and not nearhub(p)
        if ok: run.append(p)
        elif run: run.append(p); flush(); run=[]
    flush()
write('road-mid.js',{'id':'road.mid','name':'中景路网','by':'hark-fangyi','src':{'text':'道路：© OpenStreetMap 贡献者','license':'ODbL 1.0'},'items':items})
print('roads',len(items))
# —— 片区名：OSM place=suburb/town 节点，Z2 内 ——
pg=os.path.join(HERE,'../place-names.geojson'); G=json.load(open(pg)); have={f['properties'].get('name') for f in G['features']}
for t,c in PN:
    if t.get('place') in('suburb','town') and inr(tm(c),Z2) and t['name'] not in have:
        G['features'].append({'type':'Feature','properties':{'name':t['name'],'kind':'pin','height':170},'geometry':{'type':'Point','coordinates':[round(c[0],5),round(c[1],5)]}}); have.add(t['name']); print('pin',t['name'])
json.dump(G,open(pg,'w'),ensure_ascii=False,indent=1)
