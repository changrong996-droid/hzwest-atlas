# B3 片区名补点（hark-fangyi）：OSM 街道/镇行政边界（relation/<id>/full）→ 每个街道在中景 Z2 内那部分的「代表点」
# 代表点规则：Z2 内 200 m 格点里落在边界内的点取平均，再取离平均最近的那个格点（保证在界内）；界内面积 < 3 km² 的不标。
# 用法：python3 mk_adm.py <adm 目录>   结果写进 ../place-names.geojson（kind=pin，height 170，已有同名的跳过）
import xml.etree.ElementTree as ET, glob, json, math, os, sys
HERE=os.path.dirname(os.path.abspath(__file__))
LON0,LAT0,ROT,DX=119.9817,30.3004,4.3,10
KX,KY=111320*math.cos(math.radians(LAT0)),110540; ca,sa=math.cos(math.radians(ROT)),math.sin(math.radians(ROT))
def tm(c):
    X,Y=(c[0]-LON0)*KX-DX,(c[1]-LAT0)*KY; return (X*ca+Y*sa, -(-X*sa+Y*ca))
def itm(x,z):   # tm 的逆
    X=x*ca-(-z)*sa; Y=x*sa+(-z)*ca; return ((X+DX)/KX+LON0, Y/KY+LAT0)
Z2=(-8000,9000,-7000,4000)
def rings(rel):
    r=ET.parse(rel).getroot(); N={n.get('id'):(float(n.get('lon')),float(n.get('lat'))) for n in r.iter('node')}
    W={w.get('id'):[nd.get('ref') for nd in w.iter('nd')] for w in r.iter('way')}
    R=[x for x in r.iter('relation')][-1]; t={x.get('k'):x.get('v') for x in R.iter('tag')}
    segs=[W[m.get('ref')] for m in R.iter('member') if m.get('type')=='way' and m.get('role')=='outer' and m.get('ref') in W]
    out=[]
    while segs:   # 首尾相接拼环
        cur=segs.pop(0)[:]
        while cur[0]!=cur[-1]:
            for i,s in enumerate(segs):
                if s[0]==cur[-1]: cur+=s[1:]; segs.pop(i); break
                if s[-1]==cur[-1]: cur+=s[::-1][1:]; segs.pop(i); break
            else: break
        out.append([tm(N[i]) for i in cur])
    return t.get('name'),out
def inside(p,P):
    c=False
    for i in range(len(P)-1):
        a,b=P[i],P[i+1]
        if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]: c=not c
    return c
pg=os.path.join(HERE,'../place-names.geojson'); G=json.load(open(pg)); have={f['properties'].get('name') for f in G['features']}
for f in sorted(glob.glob(os.path.join(sys.argv[1],'*.xml'))):
    name,RS=rings(f)
    pts=[(x,z) for x in range(Z2[0]+100,Z2[1],200) for z in range(Z2[2]+100,Z2[3],200) if any(inside((x,z),P) for P in RS)]
    km2=len(pts)*0.04
    if km2<3: print('skip',name,round(km2,1)); continue
    mx=sum(p[0] for p in pts)/len(pts); mz=sum(p[1] for p in pts)/len(pts)
    p=min(pts,key=lambda q:(q[0]-mx)**2+(q[1]-mz)**2); lon,lat=itm(*p)
    print(name,round(km2,1),'km² in Z2 →',p, 'NEW' if name not in have else 'have')
    if name not in have:
        G['features'].append({'type':'Feature','properties':{'name':name,'kind':'pin','height':170},'geometry':{'type':'Point','coordinates':[round(lon,5),round(lat,5)]}}); have.add(name)
json.dump(G,open(pg,'w'),ensure_ascii=False,indent=1)
