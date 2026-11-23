# 规划页底图 web/plan/map.jpg：哥白尼 GLO-30 晕渲 + OSM 近景（feat.json）+ water-far。
# 输入不入仓库：tools/hz/ctx_src/dem/E119.tif、E120.tif（AWS 公开桶 copernicus-dem-30m）与 feat.json（osmctx_build 的中间文件）。在仓库根运行。
import tifffile,numpy as np,math,json,gzip
from PIL import Image,ImageDraw
LON0,LAT0=119.9817,30.3004;KX=111320*math.cos(math.radians(LAT0));KY=110540
X0,X1,Y0,Y1,S=-16000,16000,-15000,12000,25   # m, north up, 25 m/px
W,H=(X1-X0)//S,(Y1-Y0)//S
def px(lon,lat): x=(lon-LON0)*KX; y=(lat-LAT0)*KY; return ((x-X0)/S,(Y1-y)/S)
A=np.concatenate([tifffile.imread('tools/hz/ctx_src/dem/E119.tif'),tifffile.imread('tools/hz/ctx_src/dem/E120.tif')],1).astype(np.float32)
xs=X0+(np.arange(W)+.5)*S; ys=Y1-(np.arange(H)+.5)*S; X,Y=np.meshgrid(xs,ys)
c=(LON0+X/KX-119)*3600; r=(31-(LAT0+Y/KY))*3600
c0=np.floor(c).astype(int); r0=np.floor(r).astype(int); fc=c-c0; fr=r-r0
h=A[r0,c0]*(1-fc)*(1-fr)+A[r0,c0+1]*fc*(1-fr)+A[r0+1,c0]*(1-fc)*fr+A[r0+1,c0+1]*fc*fr
h=np.where(h<25,np.minimum(h,25)*0+0,h)  # 平原压平
gy,gx=np.gradient(h,S); sl=np.arctan(np.hypot(gx,gy)); asp=np.arctan2(-gx,gy)
az,al=math.radians(315),math.radians(45)
hs=np.sin(al)*np.cos(sl)+np.cos(al)*np.sin(sl)*np.cos(az-asp)   # 0..1
t=np.clip((h-25)/400,0,1)
base=np.array([241,236,226],np.float32); hill=np.array([214,205,186],np.float32)
img=base*(1-t[...,None]*.6)+hill*(t[...,None]*.6)
img=img*(0.78+0.22*np.clip(hs,0,1))[...,None]
im=Image.fromarray(np.clip(img,0,255).astype(np.uint8)); d=ImageDraw.Draw(im)
F=json.load(open('tools/hz/ctx_src/feat.json'))
for f in F:
    if f['k'] in('g','w') and len(f['p'])>2: d.polygon([px(*q) for q in f['p']],fill=(206,222,190) if f['k']=='g' else (176,205,224))
G=json.load(gzip.open('tools/hz/ctx_src/water-far.geojson.gz','rt'))
for f in G['features']:
    g=f['geometry']
    if g['type']=='Polygon': d.polygon([px(*q) for q in g['coordinates'][0]],fill=(206,222,190) if '湿地' in f['properties'].get('name','') else (176,205,224))
for f in G['features']:
    g=f['geometry']
    if g['type']=='LineString': d.line([px(*q) for q in g['coordinates']],fill=(150,190,214),width=1)
for f in F:
    if f['k']=='h':
        hw=f['t'].get('highway',''); wd=3 if hw in('motorway','trunk') else 2 if hw in('primary','secondary') else 1
        d.line([px(*q) for q in f['p']],fill=(255,255,255) if wd>1 else (250,248,244),width=wd)
for f in F:
    if f['k']=='b' and len(f['p'])>2: d.polygon([px(*q) for q in f['p']],fill=(150,146,140))
for f in F:
    if f['k']=='r': d.line([px(*q) for q in f['p']],fill=(60,60,60),width=2)
im.save('web/plan/map.jpg',quality=82)
json.dump({'W':W,'H':H,'x0':X0,'x1':X1,'y0':Y0,'y1':Y1,'m_per_px':S,'lon0':LON0,'lat0':LAT0},open('/dev/null','w'))
import os;print(W,H,os.path.getsize('web/plan/map.jpg'))
