# 城市远景层数据生成（hark-fangyi）：OSM 现状 + 哥白尼 GLO-30 → web/mods/osmctx-data.js
# 输入（不入仓库）：OSM 地图 API 分块下载（api.openstreetmap.org/api/0.6/map，站心 30.3004N 119.9817E 周边 6.6 × 4.6 km）解析出的 ctx3d.json；
#   哥白尼 DEM GLO-30 两块 COG（copernicus-dem-30m.s3.amazonaws.com，N30E119 / N30E120）重采样的 dem.json（±16 × ±12 km，80 m 网格，城区框内压平）。
# 坐标：经纬度 → 站心局部米（x 东、y 北，KX = 111320·cos(lat0)，KY = 110540）→ 绕站心转 4.3°、东移 10 m 对齐 OSM 合杭线 → 模型系（x 东、z 南）。
# 用法：python3 tools/hz/osmctx_build.py <ctx3d.json> <dem.json>
import json, math, sys
D = json.load(open(sys.argv[1])); DEM = json.load(open(sys.argv[2]))
ROT, DX, DY = 4.3, 10, 0; ra = math.radians(ROT); ca, sa = math.cos(ra), math.sin(ra)
def tm(p):
    X, Y = p[0] - DX, p[1] - DY; mx = X * ca + Y * sa; my = -X * sa + Y * ca; return [round(mx * 2) / 2, round(-my * 2) / 2]
def inM(q, pad): return abs(q[0]) < 670 + pad and -170 - pad < q[1] < 245 + pad   # 站房模型包络（模型系）
out = {'b': [], 'g': [], 'w': [], 'h': [], 'r': [], 'ug': []}
for o in D['b']:
    q = [tm(p) for p in o['p']]
    if all(inM(p, 0) for p in q): continue   # 站房本体由宿主模型画，OSM 站房轮廓剔除
    e = {'p': q, 'h': o['h']}
    if o.get('r'): e['r'] = 1
    if o.get('n'): e['n'] = o['n']
    out['b'].append(e)
for k in ('g', 'w', 'h', 'ug'):
    for o in D[k]:
        e = {kk: v for kk, v in o.items() if kk != 'p'}; e['p'] = [tm(p) for p in o['p']]; out[k].append(e)
for o in D['r']:
    q = [tm(p) for p in o['p']]
    if not o.get('m'): q = [p for p in q if not inM(p, -20)]   # 国铁在站内段让给模型股道
    if len(q) < 2: continue
    e = {kk: v for kk, v in o.items() if kk != 'p'}; e['p'] = q; out['r'].append(e)
out['dem'] = DEM; out['frame'] = {'rot': ROT, 'dx': DX, 'dy': DY, 'lon0': 119.9817, 'lat0': 30.3004, 'bx': 3300, 'by': 2300}
out['src'] = ['城市：© OpenStreetMap 贡献者（ODbL 1.0），2026-11 现状', '地形：Copernicus DEM GLO-30（© DLR e.V. 2010-2014 / © Airbus Defence and Space GmbH 2014-2018，由欧盟与 ESA 哥白尼计划提供）']
s = '// 自动生成：tools/hz/osmctx_build.py（OSM 现状 + 哥白尼 GLO-30），勿手改。坐标为模型系（x 东、z 南，m）\n(window.HZ_OSMCTX=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ');\n'
open('web/mods/osmctx-data.js', 'w').write(s); print(len(s.encode()), {k: len(v) for k, v in out.items() if isinstance(v, list)})
