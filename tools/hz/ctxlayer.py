# 远景图层生成工具（hark-fangyi）：GeoJSON（WGS84 经纬度）→ web/mods/ctx/<文件>.js，并登记到 web/mods/ctx/layers.json
# 规则见 docs/ctx-layers.md。坐标换算与 tools/hz/osmctx_build.py、web/mods/osmctx.js 的 M.ll 同一套（站心 30.3004N 119.9817E，转 4.3°、东移 10 m，模型系 x 东、z 南）。
# 要素 → 图层条目：Point → label（properties.kind=pin 则竖针）；LineString / MultiLineString → line（有 width 则 road 带）；
#   Polygon / MultiPolygon → area（有 height 则 bldg 体块，取外环）。properties 可带 name、height、width、color、y、from、to（工期 t 天）。
# 用法：python3 tools/hz/ctxlayer.py <输入.geojson> --id place.names --name 地名 --by hark-fangyi --src "地名：© OpenStreetMap 贡献者" --license "ODbL 1.0" [--url …] [--from T] [--to T] [--off] [--simplify 2]
import argparse, json, math, os, sys
ap = argparse.ArgumentParser(); ap.add_argument('geojson'); ap.add_argument('--id', required=True); ap.add_argument('--name', required=True); ap.add_argument('--by', required=True)
ap.add_argument('--src', required=True); ap.add_argument('--license', required=True); ap.add_argument('--url', default='')
ap.add_argument('--from', dest='frm', type=float); ap.add_argument('--to', type=float); ap.add_argument('--off', action='store_true'); ap.add_argument('--simplify', type=float, default=0)
ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '../../web/mods/ctx'))
a = ap.parse_args()
LON0, LAT0, ROT, DX, DY = 119.9817, 30.3004, 4.3, 10, 0
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110540; ca, sa = math.cos(math.radians(ROT)), math.sin(math.radians(ROT))
def tm(c):
    X, Y = (c[0] - LON0) * KX - DX, (c[1] - LAT0) * KY - DY; return [round((X * ca + Y * sa) * 2) / 2, round(-(-X * sa + Y * ca) * 2) / 2]
def simp(P, tol):   # Douglas-Peucker（米）
    if tol <= 0 or len(P) < 3: return P
    a0, b0 = P[0], P[-1]; dx, dy = b0[0] - a0[0], b0[1] - a0[1]; L = math.hypot(dx, dy) or 1e-9; i, dm = 0, -1
    for k in range(1, len(P) - 1):
        d = abs(dy * (P[k][0] - a0[0]) - dx * (P[k][1] - a0[1])) / L
        if d > dm: i, dm = k, d
    return simp(P[:i + 1], tol)[:-1] + simp(P[i:], tol) if dm > tol else [a0, b0]
G = json.load(open(a.geojson)); feats = G['features'] if G.get('type') == 'FeatureCollection' else [G]; items = []
for f in feats:
    g, pr = f['geometry'], f.get('properties') or {}; t = g['type']
    base = {k2: pr[k1] for k1, k2 in (('name', 'n'), ('color', 'c'), ('y', 'y'), ('from', 'from'), ('to', 'to')) if pr.get(k1) is not None}
    if t == 'Point': items.append(dict(base, k='pin' if pr.get('kind') == 'pin' else 'label', p=tm(g['coordinates']), **({'h': pr['height']} if pr.get('height') else {})))
    elif t in ('LineString', 'MultiLineString'):
        for ln in ([g['coordinates']] if t == 'LineString' else g['coordinates']):
            e = dict(base, k='road' if pr.get('width') else 'line', p=simp([tm(c) for c in ln], a.simplify))
            if pr.get('width'): e['w'] = pr['width']
            items.append(e)
    elif t in ('Polygon', 'MultiPolygon'):
        for pg in ([g['coordinates']] if t == 'Polygon' else g['coordinates']):
            e = dict(base, k='bldg' if pr.get('height') else 'area', p=simp([tm(c) for c in pg[0]], a.simplify))
            if pr.get('height'): e['h'] = pr['height']
            items.append(e)
    else: print('跳过不支持的几何', t, file=sys.stderr)
L = {'id': a.id, 'name': a.name, 'by': a.by, 'src': {'text': a.src, 'license': a.license, **({'url': a.url} if a.url else {})}, 'items': items}
if a.frm is not None: L['from'] = a.frm
if a.to is not None: L['to'] = a.to
if a.off: L['on'] = False
fn = a.id.replace('.', '-') + '.js'; os.makedirs(a.out, exist_ok=True)
s = '// 远景图层 ' + a.id + '（' + a.name + '）· 自动生成：tools/hz/ctxlayer.py ' + os.path.relpath(a.geojson).replace(os.sep, '/') + '，勿手改 · ' + a.by + '\n(window.HZ_CTX_LAYERS = window.HZ_CTX_LAYERS || []).push(' + json.dumps(L, ensure_ascii=False, separators=(',', ':')) + ');\n'
open(os.path.join(a.out, fn), 'w').write(s)
mp = os.path.join(a.out, 'layers.json'); M = json.load(open(mp)) if os.path.exists(mp) else {'note': '远景图层清单：osmctx 按序加载。规则见 docs/ctx-layers.md', 'layers': []}
ent = {'id': a.id, 'file': fn, 'by': a.by, 'v': 1}
old = next((e for e in M['layers'] if e['id'] == a.id), None)
if old: ent['v'] = old.get('v', 1) + 1; M['layers'][M['layers'].index(old)] = ent
else: M['layers'].append(ent)
if a.off: ent['on'] = False
open(mp, 'w').write(json.dumps(M, ensure_ascii=False, indent=1) + '\n'); print(fn, len(s.encode()), 'B,', len(items), '条')
