# 终版精修二版（hark-cs）：4 镜头 × 3 风格（clay 白模 / ink 墨线 / real 实景）
# 用法：Blender -b --factory-startup -P blender/v2/render_v2.py -- <geoDir> <out.png> <shot> <style> [W H]
# style 另有控制图（给扩散模型 ControlNet 用，11-09 细节加强版）：depth 深度 / normal 相机空间法线 / seg 物体材质分割 / line 白底黑线稿；
#   控制图输出 <out 去扩展名>.exr（float32 原始值）+ 8 位 PNG（depth 另出 _16.png；normal 出 _cn / _gl 两种红色约定；seg 出纯色 PNG）+ _cam.json
# V2_SET='site="on"' 加工地设备（提升架 / 塔吊 / 履带吊 / 堆料 / 板房，S-401 给 AI 补照片用，默认 off）
# V2_SET='detail="on"' 打开几何细节加强（棱边倒角、屋面直立锁边、采光顶 / 幕墙竖梃、网架圆管杆件 + 螺栓球）
# geoDir 由 blender/v2/export_v2.js 生成（scene.obj + lines.bin + meta.json）；坐标 = 页面 three.js（米，Y 向上），导入 forward -Z / up Y。
# 镜头参数在 SHOTS；每轮迭代改这里（文档记录每轮改了什么）。环境变量 V2_SPP 改采样数。
import bpy, sys, os, math, json, struct, time
argv = sys.argv[sys.argv.index('--') + 1:]
geo, out, shot, style = argv[0], argv[1], argv[2], argv[3]
W, H = (int(argv[4]), int(argv[5])) if len(argv) > 5 else (1920, 1080)
meta = json.load(open(os.path.join(geo, 'meta.json')))
T0 = time.time()

# ---------- 镜头（数据坐标 x 东 / y 上 / z 南）----------
SHOTS = {
    # S-301 整体提升中段 t=661：wlift 659–663 中点，四区同步 dy = -2.6 m，柱头未连
    'lift':  dict(pos=(172, 30, 172), tgt=(112, 38, 106), lens=32, sun=(38, 128), night=False),   # r4：机位降到楼板（24 m）与屋盖之间、近距，悬空间隙居中；r3 拉近东南角提升点；r2 远景压低（塔吊挡镜）分数降
    # S-401 屋面合拢 t=756：金属屋面刚铺完（clad 693–755），低角度掠射光读四朵云与云缝
    'roof':  dict(pos=(318, 236, 352), tgt=(0, 38, 8), lens=40, sun=(7, 320), night=False),   # r3：侧逆光 7°（西北来）；r2 东北 9° 分数未升
    # S-501 首趟列车 + 云门同框：geo = t1131f64（开通后、列车按页面同一进站曲线 f=0.64，鼻尖 x=-59.4 已进屋盖；r3/r4 用 f=0.58 鼻尖 -127.6；
    # 停靠位 x=109.5 在屋盖下、四角上盖开发 47 m 体量挡住云门，任何机位都无法同框，见审计文档）
    'train': dict(pos=(-400, 90, -120), tgt=(-200, 10, 40), lens=28, sun=(30, 210), night=False),   # r5：geo t1131f64（鼻尖已进屋盖 60 m，尾部在露天 → 读成驶入站房；r3/r4 尾车流线头被误读为车头背离）；射线核查列车入框 1.00 / 可见 0.92、云门入框 1.00 / 可见 0.68
    # 11-09 S-501 近景（不改原 train）：北侧低机位 30 m、28 mm，列车占画宽约 80%、车头驶向屋盖下，左上屋盖西缘 + 右侧云门一角；同机位出 R1 t=1100（无车）/ R2 t=1131f64（有车）
    'train_near': dict(pos=(-185, 30, -25), tgt=(-80, 20, 60), lens=28, sun=(30, 210), night=False),   # 960 预览：FRAMECHECK 列车入框 0.52（尾部出右框）/ 可见 0.48，云门入框 1.00 / 可见 0.47
    # 夜景亮灯全景 t=1131
    'night': dict(pos=(380, 300, 520), tgt=(0, 18, 20), lens=36, sun=(40, 140), night=True),   # r3：抬高、偏南，云门不再以黑侧面挡站房
}
S = dict(SHOTS[shot]); NIGHT = S['night']
# ---------- 三版：定稿参数表（镜头 × 风格）----------
# 每张定稿图的参数都写在这里，脚本直接复现（二版「roof_clay 要回 r2、night_ink 要回 r3」的问题由 src 条目解决）。
# 开关：strands 提升段钢绞线束；real3 实景三版材质（屋面立缝/各向异性、玻璃反射、地面/道床/股道、物理天空曝光）；
#       glow3 夜景发光十字描边 + 合成器辉光；clad_lines 屋面分格墨线（r3）；clay_wv 白模屋面云纹淡线（r2）；
#       view/look/sun_e/sun 覆盖视图变换与太阳；cam=(pos, tgt, lens) 覆盖机位。V2_SET='k=v;k=v' 临时覆盖（试候选用）。
DEF = dict(view=None, look=None, sun_e=None, sun=None, cam=None, exp=0.0, clad_lines=False, clay_wv=False,
           clay_glass=(0.60, 0.62, 0.64), strands=True, strand_r=None, strand_wide=True, real3=True, glow3=True, src='v3',
           detail='off', bevel_w=0.15, seam_w=0.5, seam_step=1.0, seam_h=0.08, seam_t=0.06, mull_r=0.09, cw_u=1.5, cw_z=4.5,
           chord_r=0.12, web_r=0.07, ball_r=0.22, d_parts='bevel,seam,mull,steel', site='off', env='off', env_seed=401)
CTRL = style in ('depth', 'normal', 'seg', 'line'); INKLIKE = style in ('ink', 'line')
TABLE = {
    ('roof', 'clay'): dict(view='AgX', look='None', sun_e=4.6, sun=(9, 45), clay_wv=True, clay_glass=(0.38, 0.40, 0.43), src='r2'),
    ('night', 'ink'): dict(clad_lines=True, src='r3+glow3（r7）'),
    ('train', 'ink'): dict(cam=None, src='r5'),   # 三版拉近机位后墨线版 6.5→5.0（被读成「驶离」），墨线版保持二版机位
    ('lift', 'ink'): dict(strand_r=0.11, strand_wide=False, src='r7'),   # r7 6.5：24 组钢绞线、细线；r8 加粗 + 中间 8 台塔架也补线后 5.0
    ('night', 'clay'): dict(glow3=False, src='r4'),   # glow3 两轮（r6 / r8）都 4.5 < 二版 5.0，白模夜景保持二版
    # 其余：lift_clay / lift_real / night_real / train_real = r8，roof_real = r7，train_clay = r6，roof_ink = r4（三版未改）；roof_clay 的 r2 参数已核对：r6 复现图与 r2 定稿 MAE 0.003
}
TRAIN3 = ((-330, 75, -60), (-135, 14, 42), 30)   # 三版 S-501 机位：拉近 NW 机位 + 30 mm，列车约放大 1.6 倍，云门可见比例不降（候选 c16-G）
for st_ in ('clay', 'ink', 'real'): TABLE.setdefault(('train', st_), {}).setdefault('cam', TRAIN3)
# 三版实景日景：物理天空 + 4.8 日光在 AgX 下偏白，压曝光（lift 天空占画面多，压 1.0 档）
for sh_, ev_ in (('lift', -1.0), ('roof', -0.7), ('train', -0.7), ('train_near', -0.7)): TABLE.setdefault((sh_, 'real'), {}).setdefault('exp', ev_)
TABLE.setdefault(('night', 'real'), {}).setdefault('exp', 0.4)   # r8：实景夜景提一点，夜空 / 地面读得出
PR = dict(DEF); PR.update(TABLE.get((shot, style), {}))
import ast
for kv in filter(None, os.environ.get('V2_SET', '').split(';')):
    k_, v_ = kv.split('=', 1); PR[k_.strip()] = ast.literal_eval(v_.strip())
if PR['sun']: S['sun'] = tuple(PR['sun'])
if PR['cam']: S['pos'], S['tgt'], S['lens'] = tuple(PR['cam'][0]), tuple(PR['cam'][1]), PR['cam'][2]
print('V2_PARAMS', shot, style, json.dumps({k: PR[k] for k in PR if PR[k] != DEF.get(k)}))
FINE = ('steel', 'red', 'yellow', 'jig', 'rail'); FINE_A = 0.9; FINE_T = 0.95; TRAIN_T = 2.6
if os.environ.get('V2_CAM'):   # 候选机位：px,py,pz,tx,ty,tz,lens
    v = [float(x) for x in os.environ['V2_CAM'].split(',')]; S['pos'], S['tgt'], S['lens'] = tuple(v[0:3]), tuple(v[3:6]), v[6]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.eevee.taa_render_samples = int(os.environ.get('V2_SPP', '48'))
for k, v in (('use_shadows', True), ('use_raytracing', True), ('use_gtao', True)):
    try: setattr(sc.eevee, k, v)
    except Exception: pass
try: sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast' if style == 'real' else 'None'
except Exception: pass
if INKLIKE or CTRL: sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
if style == 'clay' and not NIGHT:   # r4：AgX 把白模压成灰，换 Standard（太阳同时降到 3.2 免得过曝）
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
if PR['view']: sc.view_settings.view_transform = PR['view']
if PR['look']: sc.view_settings.look = PR['look']
sc.view_settings.exposure = PR['exp']

bpy.ops.wm.obj_import(filepath=os.path.join(geo, 'scene.obj'), forward_axis='NEGATIVE_Z', up_axis='Y')
objs = {}
for o in list(sc.objects):
    if o.type != 'MESH': continue
    key = o.name.split('.')[0]; objs[key] = o
    me = o.data
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.004); bm.to_mesh(me); bm.free()
    smooth = key.startswith('tr_') or key in ('clad', 'pv', 'soffit', 'trainW')
    for p in me.polygons: p.use_smooth = smooth
    if smooth:
        try: me.set_sharp_from_angle(angle=math.radians(35))
        except Exception: pass

# ---------- 11-09 工地设备（site=on，默认 off；hark-cs）：S-401 屋面合拢阶段补施工设备，给 AI 补成照片用 ----------
# ① 提升架 liftf：原黄色提升柱中靠屋盖四角的 4 根（±170, ±150/160，高 71 m）改成格构柱 + 缀条 + 柱顶平台 + 伸向屋面的悬挑桁架梁 + 竖向钢绞线落到屋面
# ② 塔吊 crane：原远处 4 根黄柱（x ±260 / z 262）补成完整塔吊（原位，塔身加高到屋面最高点上 ~27 m），另加 3 台屋面外圈塔吊；履带吊 2 台（混凝土平台边）
# ③ 堆料 stock（H 型钢束 / 钢板垛 / 钢管垛）、板房 cabin（集装箱板房，两层 + 外挂楼梯），放在股道两侧的 25 m 混凝土平台上（不压股道层 12.5 m）
# 几何全部是方截面杆件网格（无 Freestyle 负担的低面数），落地高度用竖直射线贴现有几何
SITE = str(PR.get('site', 'off')).lower() in ('on', '1', 'true'); SSTAT = {}
if SITE:
    from mathutils.bvhtree import BVHTree as _BV
    from mathutils import Vector as _V
    TS = time.time(); SG = {}   # key -> (verts, faces)
    def _wb(keys):
        V_, F_ = [], []
        for k_ in keys:
            o_ = objs.get(k_)
            if not o_: continue
            mw_ = o_.matrix_world; b0 = len(V_); V_ += [mw_ @ v.co for v in o_.data.vertices]; F_ += [tuple(b0 + i for i in pg.vertices) for pg in o_.data.polygons]
        return _BV.FromPolygons(V_, F_)
    GB = _wb(('conc', 'slab', 'plat', 'found', 'ym', 'metro')); RB = _wb(('clad', 'glass', 'steel'))
    def gz(x, y, top=200.0):   # Blender x, y → 地面 / 平台顶高度
        h = GB.ray_cast(_V((x, y, top)), _V((0, 0, -1)), top + 50); return h[0].z if h[0] is not None else 0.0
    def beam(key, a, b, w, d=None):   # a→b 方截面杆件（宽 w，高 d）
        V_, F_ = SG.setdefault(key, ([], [])); a = _V(a); b = _V(b); t = b - a
        if t.length < 1e-4: return
        t.normalize(); u = t.cross(_V((0, 0, 1)))
        if u.length < 1e-3: u = t.cross(_V((1, 0, 0)))
        u.normalize(); v = u.cross(t).normalized(); hw, hd = w / 2, (d or w) / 2; b0 = len(V_)
        for p_ in (a, b):
            for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)): V_.append(tuple(p_ + u * su * hw + v * sv * hd))
        F_ += [(b0, b0 + 1, b0 + 2, b0 + 3), (b0 + 7, b0 + 6, b0 + 5, b0 + 4)] + [(b0 + i, b0 + 4 + i, b0 + 4 + (i + 1) % 4, b0 + (i + 1) % 4) for i in range(4)]
    def box(key, c, sx, sy, sz, rot=0.0):   # 中心 c、尺寸、绕 z 转 rot（弧度）
        V_, F_ = SG.setdefault(key, ([], [])); b0 = len(V_); cr, sr = math.cos(rot), math.sin(rot)
        for dz in (-sz / 2, sz / 2):
            for dx, dy in ((-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)):
                V_.append((c[0] + dx * cr - dy * sr, c[1] + dx * sr + dy * cr, c[2] + dz))
        F_ += [(b0 + 3, b0 + 2, b0 + 1, b0), (b0 + 4, b0 + 5, b0 + 6, b0 + 7)] + [(b0 + i, b0 + (i + 1) % 4, b0 + 4 + (i + 1) % 4, b0 + 4 + i) for i in range(4)]
    def lattice_col(key, cx, cy, z0, z1, hs, ch=0.32, la=0.16, pan=2.5):   # 方格构柱：4 根主肢 + 每 pan 一圈缀条 + 每面斜缀条
        C_ = [(cx - hs, cy - hs), (cx + hs, cy - hs), (cx + hs, cy + hs), (cx - hs, cy + hs)]
        for (x_, y_) in C_: beam(key, (x_, y_, z0), (x_, y_, z1), ch)
        n = max(1, int((z1 - z0) / pan)); dz = (z1 - z0) / n
        for k in range(n + 1):
            z_ = z0 + k * dz
            for i in range(4): beam(key, (*C_[i], z_), (*C_[(i + 1) % 4], z_), la)
            if k < n:
                for i in range(4):
                    a_, b_ = (C_[i], C_[(i + 1) % 4]) if k % 2 == 0 else (C_[(i + 1) % 4], C_[i])
                    beam(key, (*a_, z_), (*b_, z_ + dz), la)
    def truss(key, a, b, up, half, h, ch=0.3, la=0.16, pan=3.0, tri=True):   # 平面 / 三角桁架：a→b 下弦两根（±half），上弦（tri：中间一根；否则两根）高 h
        a = _V(a); b = _V(b); t = (b - a); L_ = t.length; t.normalize(); s = t.cross(_V(up)).normalized(); U = _V(up)
        lo = [(a + s * half, b + s * half), (a - s * half, b - s * half)]
        hi = [(a + U * h, b + U * h)] if tri else [(a + s * half + U * h, b + s * half + U * h), (a - s * half + U * h, b - s * half + U * h)]
        for p_, q_ in lo + hi: beam(key, p_, q_, ch)
        n = max(1, int(L_ / pan))
        for k in range(n + 1):
            f = k / n; P0 = a + (b - a) * f; P1 = a + (b - a) * min(1, (k + 1) / n)
            l0, l1 = P0 + s * half, P0 - s * half; beam(key, l0, l1, la)
            for hh in ([P0 + U * h] if tri else [P0 + s * half + U * h, P0 - s * half + U * h]):
                beam(key, l0 if (hh - l0).length < (hh - l1).length + 1e-6 or tri else l1, hh, la)
                if tri: beam(key, l1, hh, la)
            if k < n:
                for side in (half, -half): beam(key, P0 + s * side, P1 + U * h + (s * side if not tri else _V((0, 0, 0))), la)
    def tower_crane(x, y, top, jib_deg, jl=50.0, cl=15.0, base=None):
        zb = gz(x, y) if base is None else base; K = 'crane'; hs = 1.0
        box(K, (x, y, zb + 0.6), 7.0, 7.0, 1.2)                                   # 基础压重
        lattice_col(K, x, y, zb + 1.2, top, hs, 0.34, 0.17, 2.5)                    # 塔身
        box(K, (x, y, top + 1.0), 3.4, 3.4, 2.0)                                     # 回转支承 / 上下支座
        a = math.radians(jib_deg); dx, dy = math.cos(a), math.sin(a); zj = top + 2.0
        box(K, (x - dy * 2.4 + dx * 1.0, y + dx * 2.4 + dy * 1.0, top + 1.6), 2.4, 2.0, 2.6, a)   # 司机室
        apex = (x, y, zj + 10.0)
        for sx_, sy_ in ((-1, -1), (1, -1), (1, 1), (-1, 1)): beam(K, (x + sx_ * 1.2, y + sy_ * 1.2, zj), apex, 0.32)   # 塔帽
        tip = (x + dx * jl, y + dy * jl, zj); truss(K, (x, y, zj), tip, (0, 0, 1), 0.8, 1.7, 0.3, 0.16, 2.5, True)      # 起重臂
        ce = (x - dx * cl, y - dy * cl, zj); truss(K, (x, y, zj), ce, (0, 0, 1), 1.1, 0.0001, 0.34, 0.2, 3.0, False)   # 平衡臂（平面）
        for k in range(3): box(K, (x - dx * (cl - 1.2 - k * 1.3), y - dy * (cl - 1.2 - k * 1.3), zj - 0.4), 1.1, 2.6, 2.6, a)   # 配重块
        box(K, (x - dx * (cl - 6.5), y - dy * (cl - 6.5), zj + 0.7), 2.4, 1.8, 1.2, a)   # 起升机构
        for f in (0.45, 0.85): beam(K, apex, (x + dx * jl * f, y + dy * jl * f, zj + 1.7), 0.12)   # 拉杆
        beam(K, apex, (ce[0], ce[1], zj + 0.2), 0.12)
        tr = (x + dx * jl * 0.62, y + dy * jl * 0.62, zj); box(K, (tr[0], tr[1], zj - 0.4), 1.6, 1.6, 0.6, a)   # 变幅小车
        hz_ = max(zb + 6, zj - 30); beam(K, (tr[0], tr[1], zj - 0.7), (tr[0], tr[1], hz_), 0.12); box(K, (tr[0], tr[1], hz_ - 0.6), 0.8, 0.8, 1.2)   # 吊钩
        return dict(x=round(x, 1), y=round(y, 1), base=round(zb, 1), top=round(zj + 10, 1), jib=jib_deg)
    def crawler(x, y, head_deg, L=42.0, el=68.0):
        zb = gz(x, y); K = 'crane'; a = math.radians(head_deg); dx, dy = math.cos(a), math.sin(a)
        for sd in (-2.3, 2.3): box(K, (x - dy * sd, y + dx * sd, zb + 0.6), 8.0, 1.0, 1.2, a)   # 履带
        box(K, (x, y, zb + 1.5), 4.0, 3.6, 0.8, a); box(K, (x - dx * 1.0, y - dy * 1.0, zb + 3.2), 6.0, 3.4, 2.6, a)   # 车身 / 上车
        box(K, (x - dx * 4.6, y - dy * 4.6, zb + 2.8), 1.8, 3.2, 1.8, a)   # 配重
        e = math.radians(el); b0 = (x + dx * 1.6, y + dy * 1.6, zb + 2.6); bt = (b0[0] + dx * L * math.cos(e), b0[1] + dy * L * math.cos(e), b0[2] + L * math.sin(e))
        nrm = (-dx * math.sin(e), -dy * math.sin(e), math.cos(e)); truss(K, b0, bt, nrm, 0.7, 1.4, 0.26, 0.14, 2.5, False)   # 主臂（方格构）
        mt = (x - dx * 2.5, y - dy * 2.5, zb + 9.0); beam(K, (x - dx * 1.5, y - dy * 1.5, zb + 4.5), mt, 0.3); beam(K, mt, bt, 0.1); beam(K, mt, (x - dx * 4.6, y - dy * 4.6, zb + 3.6), 0.1)   # 人字架 + 拉索
        hz_ = zb + 8; beam(K, bt, (bt[0], bt[1], hz_), 0.1); box(K, (bt[0], bt[1], hz_ - 0.6), 0.8, 0.8, 1.2)
        return dict(x=round(x, 1), y=round(y, 1), base=round(zb, 1), tip=round(bt[2], 1))
    def lift_frame(cx, cy, z1):
        K = 'liftf'; zb = gz(cx, cy, z1 - 1.0); hs = 1.3
        box(K, (cx, cy, zb + 0.5), 5.0, 5.0, 1.0)
        lattice_col(K, cx, cy, zb + 1.0, z1, hs, 0.36, 0.18, 3.0)                              # 格构柱（原位、原截面 2.6 m）
        for k in range(1, int((z1 - zb) / 12)): box(K, (cx, cy, zb + k * 12.0), 3.4, 3.4, 0.35)   # 缀板（每 12 m）
        box(K, (cx, cy, z1 + 0.4), 8.0, 8.0, 0.8)                                               # 柱顶提升平台
        for sx_, sy_ in ((-1, -1), (1, -1), (1, 1), (-1, 1)): beam(K, (cx + sx_ * 4, cy + sy_ * 4, z1 + 0.8), (cx + sx_ * 4, cy + sy_ * 4, z1 + 2.0), 0.1)
        for i, (p_, q_) in enumerate((((-4, -4), (4, -4)), ((4, -4), (4, 4)), ((4, 4), (-4, 4)), ((-4, 4), (-4, -4)))):
            beam(K, (cx + p_[0], cy + p_[1], z1 + 2.0), (cx + q_[0], cy + q_[1], z1 + 2.0), 0.1)   # 栏杆
        # 悬挑桁架梁：在 ±60° 扇区内找离屋面边最近的方向（屋盖四角是圆角），到屋面上方再进 4 m 为吊点（第一版沿对角线 75–81 m 太长、前景那根压到檐口）
        a0 = math.atan2(-cy, -cx); hp = None; best = 1e9
        for da in range(-60, 61, 5):
            d_ = _V((math.cos(a0 + math.radians(da)), math.sin(a0 + math.radians(da)), 0)); r_ = None
            for k in range(1, 140):
                if k >= best: break
                p_ = _V((cx, cy, 0)) + d_ * k; h = RB.ray_cast(_V((p_.x, p_.y, z1 + 5)), _V((0, 0, -1)), 200)
                if h[0] is not None:
                    if r_ is None: r_ = k
                    if k >= r_ + 4: hp = h[0]; best = k; break
        if hp is None: return dict(x=cx, y=cy, err='no roof hit')
        tipb = (hp.x, hp.y, z1 + 0.8); truss(K, (cx, cy, z1 + 0.8), tipb, (0, 0, 1), 0.9, 2.4, 0.34, 0.18, 3.0, False)
        box(K, (hp.x, hp.y, z1 + 0.2), 3.0, 3.0, 1.2)                                         # 液压提升器
        for ox, oy in ((-0.45, -0.45), (0.45, -0.45), (-0.45, 0.45), (0.45, 0.45)): beam(K, (hp.x + ox, hp.y + oy, z1 - 0.4), (hp.x + ox, hp.y + oy, hp.z + 0.6), 0.14)   # 钢绞线
        box(K, (hp.x, hp.y, hp.z + 0.6), 1.6, 1.6, 1.0)                                       # 下吊点（屋面网格）
        return dict(x=round(cx, 1), y=round(cy, 1), base=round(zb, 1), top=z1, arm=round((tipb[0] - cx) ** 2 + (tipb[1] - cy) ** 2, 0) ** 0.5, hang_z=round(hp.z, 1))
    def stock_beams(x, y, rot, n=3):   # H 型钢束（12 m × 2.4 m × 0.9 m 一捆，枕木垫高）
        for i in range(n):
            for j in range(2):
                c_ = (x + math.cos(rot + math.pi / 2) * i * 3.0, y + math.sin(rot + math.pi / 2) * i * 3.0, gz(x, y) + 0.25 + 0.45 + j * 1.0); box('stock', c_, 12.0, 2.4, 0.9, rot)
    def stock_plates(x, y, rot, n=4):  # 钢板 / 屋面板垛（6 × 2.5 m，层层错开）
        for i in range(n):
            h_ = 0.8 + 0.4 * (i % 3); c_ = (x + math.cos(rot) * i * 7.0, y + math.sin(rot) * i * 7.0, gz(x, y) + h_ / 2 + 0.2); box('stock', c_, 6.0, 2.6, h_, rot)
    def stock_tubes(x, y, rot):   # 钢管 / 网架杆件垛：三角码放
        z0_ = gz(x, y); c, s_ = math.cos(rot), math.sin(rot)
        for row, cnt in enumerate((6, 5, 4, 3)):
            for k in range(cnt):
                o_ = (k - (cnt - 1) / 2) * 0.9; zz = z0_ + 0.45 + row * 0.78
                p0 = (x - s_ * o_ - c * 5, y + c * o_ - s_ * 5, zz); p1 = (x - s_ * o_ + c * 5, y + c * o_ + s_ * 5, zz); beam('stock', p0, p1, 0.8)
    def cabins(x, y, rot, n=4, floors=2):   # 集装箱板房（6 × 2.5 × 2.7 m）+ 外挂楼梯
        c, s_ = math.cos(rot), math.sin(rot); z0_ = gz(x + c * n * 3.1, y + s_ * n * 3.1)
        for f in range(floors):
            for k in range(n):
                box('cabin', (x + c * (k * 6.2 + 3.1), y + s_ * (k * 6.2 + 3.1), z0_ + 1.35 + f * 2.8), 6.0, 2.5, 2.7, rot)
        if floors > 1:
            beam('cabin', (x + c * n * 6.2 + s_ * 1.6, y + s_ * n * 6.2 - c * 1.6, z0_ + 0.1), (x + c * (n * 6.2 - 4) + s_ * 1.6, y + s_ * (n * 6.2 - 4) - c * 1.6, z0_ + 2.8), 1.0, 0.25)   # 楼梯
            box('cabin', (x + c * n * 3.1 + s_ * 1.7, y + s_ * n * 3.1 - c * 1.7, z0_ + 2.75), n * 6.2, 0.9, 0.12, rot)   # 二层走廊
    # —— 布置（数据坐标 x 东、z 南 → Blender x, y = -z）——
    if 'yellow' in objs: bpy.data.objects.remove(objs.pop('yellow'))   # 原黄柱整体替换（同位置重建）
    L_ = PR.get('site_lift', [(-170, -150), (170, -150), (-170, 160), (170, 160)])
    SSTAT['liftf'] = [lift_frame(x_, -z_, 71.0) for x_, z_ in L_]
    TC = PR.get('site_cranes', [(-260, 0, 82, 180), (260, 0, 82, 0), (-60, 262, 82, 200), (60, 262, 82, -20),   # 原 4 根远处黄柱 → 完整塔吊（原位）
                                (155, -70, 82, 110), (-155, 70, 82, 200), (-40, -190, 82, 160)])               # 新增 3 台：东北平台 / 西南平台 / 北侧场地
    SSTAT['crane'] = [tower_crane(x_, -z_, t_, a_) for x_, z_, t_, a_ in TC]
    SSTAT['crawler'] = [crawler(x_, -z_, a_) for x_, z_, a_ in PR.get('site_crawler', [(205, 50, 180), (195, -100, 120)])]
    for x_, z_, r_ in ((190, 35, 0.0), (-175, 40, 0.0)): stock_beams(x_, -z_, r_)
    for x_, z_, r_ in ((150, 55, 0.0), (175, -35, 0.0)): stock_plates(x_, -z_, r_, 3)
    for x_, z_, r_ in ((185, 66, 0.0), (-195, -50, math.pi / 2)): stock_tubes(x_, -z_, r_)
    for x_, z_, r_, n_ in ((148, 30, 0.0, 4), (150, -25, 0.0, 3), (-205, 30, 0.0, 3)): cabins(x_, -z_, r_, n_)
    # 11-09 S-301 P3b 前景堆场（site_fore，默认空）：t ≥ 683 提升完成、屋面围护 clad 693 起，站房南侧地面堆屋面板垛 / 檩条钢管垛 / H 型钢束 + 板房 + 1 台吊装屋面材料的履带吊（AI 成图前景原为一片平地 → 发虚）
    _FK = dict(plates=lambda x, y, r, n: stock_plates(x, y, r, n), tubes=lambda x, y, r, n: stock_tubes(x, y, r), beams=lambda x, y, r, n: stock_beams(x, y, r, n), cabins=lambda x, y, r, n: cabins(x, y, r, n), crawler=lambda x, y, r, n: SSTAT.setdefault('crawler', []).append(crawler(x, y, r)))
    for k_, x_, z_, r_, n_ in PR.get('site_fore', []): _FK[k_](x_, -z_, r_, n_)
    SSTAT['fore'] = len(PR.get('site_fore', []))
    for k_, (V_, F_) in SG.items():
        me_ = bpy.data.meshes.new(k_); me_.from_pydata(V_, [], F_); me_.update(); o_ = bpy.data.objects.new(k_, me_); sc.collection.objects.link(o_); objs[k_] = o_
        SSTAT['faces_' + k_] = len(F_)
    SSTAT['sec'] = round(time.time() - TS, 1); print('SITE', json.dumps(SSTAT, ensure_ascii=False))

# ---------- 11-09 环境（env=on，默认 off；hark-cs）：S-401 AI 补照片被扣「背景空白」后加 ----------
# ① 城市楼群 city：距站房中心 0.8–3 km 的街区格（街区 150 m、每 4 格留 1 条 30 m 宽主街），每格 1–3 栋简单体块，高 20–120 m（东侧 / 东北更高、往外渐低），
#    股道走廊 |z| < 220 m 不放；② 低山 mount：3–8 km 环带高度场，西侧丘陵 100–300 m、东侧 ≤ 90 m（杭州西侧丘陵，推断的示意轮廓，非实测地形）；
# ③ 道路 road：站外环路（z = −300 / +330，x = ±760，宽 24 m）+ 城市主街（宽 30 m，0.8–3 km）。地面在 env=on 时扩到 20 km。全部是地面以上的体块，
#    在站房 0.8 km 以外，不遮挡屋面与塔吊（塔吊在 ±260 m 内）。
ENV = str(PR.get('env', 'off')).lower() in ('on', '1', 'true'); ESTAT = {}
if ENV:
    import random; TE = time.time(); rnd = random.Random(int(PR.get('env_seed', 401))); EG = {'city': ([], []), 'road': ([], []), 'mount': ([], [])}
    def ebox(key, cx, cy, z0, sx, sy, sz, rot=0.0):   # Blender 坐标中心 (cx, cy)，底 z0
        V_, F_ = EG[key]; b0 = len(V_); c_, s_ = math.cos(rot), math.sin(rot)
        for dz in (0, sz):
            for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                px, py = dx * sx / 2, dy * sy / 2; V_.append((cx + px * c_ - py * s_, cy + px * s_ + py * c_, z0 + dz))
        F_ += [(b0, b0 + 3, b0 + 2, b0 + 1), (b0 + 4, b0 + 5, b0 + 6, b0 + 7)] + [(b0 + i, b0 + (i + 1) % 4, b0 + 4 + (i + 1) % 4, b0 + 4 + i) for i in range(4)]
    CELL = 150.0; n_ = int(3000 // CELL) + 1; nb_ = 0
    for i in range(-n_, n_ + 1):
        for j in range(-n_, n_ + 1):
            if i % 4 == 0 or j % 4 == 0: continue   # 主街
            x_, z_ = i * CELL, j * CELL; r_ = math.hypot(x_, z_)
            if r_ < 800 or r_ > 3000 or abs(z_) < 220: continue
            if rnd.random() < 0.06 + 0.22 * (r_ - 800) / 2200: continue   # 往外渐稀
            az = math.atan2(-z_, x_)   # 东 = 0，北 = +90°
            hmax = 120 * (0.55 + 0.45 * max(0.0, math.cos(az - math.radians(20)))) * (1.0 - 0.45 * (r_ - 800) / 2200)
            for k in range(rnd.choice((1, 2, 2, 3, 3))):
                sx, sy = rnd.uniform(22, 55), rnd.uniform(22, 55); ox, oy = rnd.uniform(-(CELL - 30 - sx) / 2, (CELL - 30 - sx) / 2), rnd.uniform(-(CELL - 30 - sy) / 2, (CELL - 30 - sy) / 2)
                h_ = max(20.0, min(120.0, rnd.uniform(0.25, 1.0) * hmax)); ebox('city', x_ + ox, -(z_ + oy), 0.0, sx, sy, h_); nb_ += 1
    ESTAT['city_blocks'] = nb_
    for i in range(-n_, n_ + 1):   # 主街（街区格每 4 格），0.8–3 km 段
        if i % 4: continue
        c_ = i * CELL
        for a0, a1 in ((-3000, -800), (800, 3000)):
            ebox('road', (a0 + a1) / 2, -c_, 0.0, a1 - a0, 30, 0.25)   # 东西向（Blender x）
            ebox('road', c_, -(a0 + a1) / 2, 0.0, 30, a1 - a0, 0.25)   # 南北向
    for z_ in (-300.0, 330.0): ebox('road', 0, -z_, 0.0, 1560, 24, 0.25)   # 站外环路
    for x_ in (-760.0, 760.0): ebox('road', x_, 15, 0.0, 24, 654, 0.25)
    # 低山：极坐标高度场
    NA, NR = 360, 26; V_, F_ = EG['mount']
    def ridge(a):   # 方位 a（Blender，东 = 0、逆时针）：西侧高、东侧低，叠几组正弦当山脊起伏
        west = 0.5 - 0.5 * math.cos(a)   # 西 = 1、东 = 0
        n1 = 0.5 + 0.25 * math.sin(3 * a + 1.3) + 0.15 * math.sin(7 * a + 0.4) + 0.1 * math.sin(13 * a + 2.1)
        return (90 + 210 * west) * (0.55 + 0.45 * n1)
    for ia in range(NA):
        a = 2 * math.pi * ia / NA; pk = ridge(a); rp = 4700 + 900 * math.sin(2 * a + 0.7)
        for ir in range(NR):
            r_ = 3000 + 5000 * ir / (NR - 1)
            prof = math.exp(-((r_ - rp) / (1300 if r_ < rp else 1900)) ** 2) * (1 - math.exp(-((r_ - 3000) / 500) ** 2))
            V_.append((r_ * math.cos(a), r_ * math.sin(a), pk * prof - 0.3))
    for ia in range(NA):
        for ir in range(NR - 1):
            a0_, a1_ = ia * NR + ir, ((ia + 1) % NA) * NR + ir; F_.append((a0_, a1_, a1_ + 1, a0_ + 1))
    for k_, (V_, F_) in EG.items():
        me_ = bpy.data.meshes.new(k_); me_.from_pydata(V_, [], F_); me_.update(); o_ = bpy.data.objects.new(k_, me_); sc.collection.objects.link(o_); objs[k_] = o_
        ESTAT['faces_' + k_] = len(F_)
    ESTAT['sec'] = round(time.time() - TE, 1); print('ENV', json.dumps(ESTAT, ensure_ascii=False))


# ---------- 11-09 几何细节加强（detail=on）：同一份页面几何上自动加细节，不改导出 ----------
# ① 棱边倒角（混凝土 / 楼板 / 站台 / 基础 / 云门体块，角度 > 30° 的棱倒 bevel_w）
# ② 屋面直立锁边：沿南北向（Blender +y，与实景立缝纹理同向）每 seam_w（0.5 m）一条锁边肋，竖直向下射线贴屋面，
#    遇采光顶 / 光伏 / 屋面边缘断开；肋截面 seam_t × seam_h（60 × 80 mm）
# ③ 采光顶竖梃：页面同源采光顶格栅线（Geo.L glass）→ 圆管 mull_r；幕墙（todG / ymG）按立面平面每 cw_u 竖梃、每 cw_z 横梁
# ④ 网架杆件：页面同源网架中心线（Geo.L steel，与网格同一份）→ 弦杆（近水平）chord_r、腹杆 web_r 圆管 + 节点螺栓球 ball_r，替换原三棱柱
DETAIL = str(PR['detail']).lower() in ('on', '1', 'true'); DSTAT = {}
def LGraw():
    b = open(os.path.join(geo, 'lines.bin'), 'rb').read(); i = 0; G = {}
    while i < len(b):
        n = b[i]; name = b[i + 1:i + 1 + n].decode(); i += 1 + n; cnt = struct.unpack_from('<I', b, i)[0]; i += 4
        G[name] = struct.unpack_from('<%df' % (cnt * 6), b, i); i += cnt * 24
    return G
def tube_obj(name, segs_b, r, res=1):
    # segs_b：Blender 坐标线段列表 [(x0,y0,z0,x1,y1,z1), ...] → 圆管曲线物体（材质另配）
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = res; cu.use_fill_caps = True
    for s_ in segs_b:
        sp = cu.splines.new('POLY'); sp.points.add(1); sp.points[0].co = (s_[0], s_[1], s_[2], 1); sp.points[1].co = (s_[3], s_[4], s_[5], 1)
    ob = bpy.data.objects.new(name, cu); sc.collection.objects.link(ob); return ob
if DETAIL:
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    LGd = LGraw(); TD = time.time()
    def wbvh(o_):
        mw_ = o_.matrix_world; V_ = [mw_ @ v.co for v in o_.data.vertices]
        return V_, BVHTree.FromPolygons(V_, [tuple(pg.vertices) for pg in o_.data.polygons])
    # ①
    DP = PR['d_parts'].split(','); nb = 0
    for k_ in ('conc', 'slab', 'plat', 'found', 'ym', 'todB', 'metro'):
        if k_ in objs and 'bevel' in DP:
            md = objs[k_].modifiers.new('bev', 'BEVEL'); md.width = PR['bevel_w']; md.segments = 2; md.limit_method = 'ANGLE'
            md.angle_limit = math.radians(30); md.use_clamp_overlap = True; nb += 1
    DSTAT['bevel_objs'] = nb
    # ②
    # 实测：Freestyle 风格（ink / line）加锁边肋后几何从 11.7 万面涨到约 100 万面，Freestyle 建视图图 > 5 分钟未完；
    # 锁边肋在本机位只有约 2 px 一条，墨线 / 线稿不加锁边肋（白模 detail=on 关掉 Freestyle 淡线、照加；实景与 depth / normal / seg 照加）
    if 'clad' in objs and 'seam' in DP and style not in ('ink', 'line'):
        o_ = objs['clad']; V_, bvh = wbvh(o_); me_ = o_.data
        pvp = [False] * len(me_.polygons)   # 光伏所在面（顶点色 r = HZ.pvMask > 0.5）不加锁边：光伏板盖在上面
        ca = me_.color_attributes.get('Color') if hasattr(me_, 'color_attributes') else None
        if ca is not None:
            if ca.domain == 'POINT':
                vr = [d.color[0] for d in ca.data]; pvp = [sum(vr[v] for v in pg.vertices) / len(pg.vertices) > 0.5 for pg in me_.polygons]
            else:
                lr = [d.color[0] for d in ca.data]; pvp = [sum(lr[l] for l in pg.loop_indices) / pg.loop_total > 0.5 for pg in me_.polygons]
        xs_ = [v.x for v in V_]; ys_ = [v.y for v in V_]; zt_ = max(v.z for v in V_) + 5
        sw, stp, sh_, hw = PR['seam_w'], PR['seam_step'], PR['seam_h'], PR['seam_t'] / 2
        verts, faces = [], []; nseam = 0
        def emit(run):
            global nseam
            if len(run) < 2: return
            b0 = len(verts)
            for j, (p_, n_) in enumerate(run):
                t_ = (run[min(j + 1, len(run) - 1)][0] - run[max(j - 1, 0)][0]).normalized(); s_ = t_.cross(n_).normalized()
                q = p_ - n_ * 0.01
                verts.extend([tuple(q + s_ * hw), tuple(q + s_ * hw + n_ * sh_), tuple(q - s_ * hw + n_ * sh_), tuple(q - s_ * hw)])
            for j in range(len(run) - 1):
                a_, c_ = b0 + 4 * j, b0 + 4 * (j + 1)
                for e in range(3): faces.append((a_ + e, c_ + e, c_ + e + 1, a_ + e + 1))
            faces.append((b0, b0 + 1, b0 + 2, b0 + 3)); e_ = b0 + 4 * (len(run) - 1); faces.append((e_ + 3, e_ + 2, e_ + 1, e_))
            nseam += 1
        x_ = min(xs_) + sw / 2; ymin, ymax = min(ys_), max(ys_)
        while x_ < max(xs_):
            run = []; y_ = ymin
            while y_ <= ymax:
                loc, nor, idx, dist = bvh.ray_cast(Vector((x_, y_, zt_)), Vector((0, 0, -1)), zt_ + 80)
                ok = loc is not None and not pvp[idx]
                if ok:
                    n_ = nor if nor.z > 0 else -nor
                    ok = n_.z > 0.3
                if ok and run and abs(loc.z - run[-1][0].z) > 1.0: emit(run); run = []
                if ok: run.append((loc, n_.normalized()))
                else: emit(run); run = []
                y_ += stp
            emit(run); x_ += sw
        sm = bpy.data.meshes.new('seam'); sm.from_pydata(verts, [], faces); sm.update()
        so_ = bpy.data.objects.new('seam', sm); sc.collection.objects.link(so_); objs['seam'] = so_
        DSTAT['seams'] = nseam; DSTAT['seam_verts'] = len(verts)
    # ③
    msegs = []
    if 'glass' in LGd and 'mull' in DP:
        g_ = LGd['glass']
        for k in range(0, len(g_), 6): msegs.append((g_[k], -g_[k + 2], g_[k + 1] + 0.05, g_[k + 3], -g_[k + 5], g_[k + 4] + 0.05))
    DSTAT['sky_mullions'] = len(msegs); ncw = 0
    for k_ in ('todG', 'ymG'):
        if k_ not in objs: continue
        V_, bvh = wbvh(objs[k_]); mw3 = objs[k_].matrix_world.to_3x3(); grp = {}
        for pg in objs[k_].data.polygons:
            n_ = (mw3 @ pg.normal).normalized()
            if abs(n_.z) > 0.2: continue
            hn = Vector((n_.x, n_.y, 0)).normalized()
            if hn.x < -1e-6 or (abs(hn.x) <= 1e-6 and hn.y < 0): hn = -hn
            key = (round(math.atan2(hn.y, hn.x), 1), round(hn.dot(V_[pg.vertices[0]]), 0))
            grp.setdefault(key, [hn, set()])[1].update(pg.vertices)
        for key, (hn, vi) in grp.items():
            u_ = Vector((-hn.y, hn.x, 0)); us = [u_.dot(V_[i]) for i in vi]; zs = [V_[i].z for i in vi]; d_ = key[1]
            def on(p_): return bvh.find_nearest(p_)[3] is not None and bvh.find_nearest(p_)[3] < 0.3
            uu = min(us) + PR['cw_u']
            while uu < max(us) - 0.3:   # 竖梃：1 m 一段，段中点在幕墙面上才留
                z_ = min(zs)
                while z_ < max(zs):
                    z1 = min(z_ + 1.0, max(zs)); a_ = hn * d_ + u_ * uu
                    if on(a_ + Vector((0, 0, (z_ + z1) / 2))): msegs.append((a_.x, a_.y, z_, a_.x, a_.y, z1)); ncw += 1
                    z_ = z1
                uu += PR['cw_u']
            z_ = min(zs) + PR['cw_z']
            while z_ < max(zs) - 0.3:   # 横梁
                uu = min(us)
                while uu < max(us):
                    u1 = min(uu + 1.0, max(us)); a_ = hn * d_ + u_ * uu; b_ = hn * d_ + u_ * u1
                    if on((a_ + b_) / 2 + Vector((0, 0, z_))): msegs.append((a_.x, a_.y, z_, b_.x, b_.y, z_)); ncw += 1
                    uu = u1
                z_ += PR['cw_z']
    DSTAT['wall_mullion_pieces'] = ncw
    if msegs: objs['mull'] = tube_obj('mull', msegs, PR['mull_r'], 1)
    # ④
    if 'steel' in objs and 'steel' in LGd and 'steel' in DP:
        s_ = LGd['steel']; ch, wb = [], []; deg = {}
        for k in range(0, len(s_), 6):
            a_ = (s_[k], -s_[k + 2], s_[k + 1]); b_ = (s_[k + 3], -s_[k + 5], s_[k + 4]); L_ = math.dist(a_, b_)
            if L_ < 0.05: continue
            (ch if abs(b_[2] - a_[2]) / L_ < 0.2 else wb).append(a_ + b_)
            for p_ in (a_, b_): kk = tuple(round(c, 1) for c in p_); deg[kk] = deg.get(kk, 0) + 1
        bpy.data.objects.remove(objs.pop('steel'))
        FS_ = style in ('ink', 'line')   # Freestyle 风格：4 边管、不加螺栓球（实测 6 边管 + 2949 个球让 Freestyle > 4 分钟）
        objs['steelC'] = tube_obj('steelC', ch, PR['chord_r'], 0 if FS_ else 1); objs['steelW'] = tube_obj('steelW', wb, PR['web_r'], 0 if FS_ else 1)
        nodes = [] if FS_ else [p_ for p_, c in deg.items() if c >= 3]
        import bmesh
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=PR['ball_r'])
        iv = [tuple(v.co) for v in bm.verts]; iff = [tuple(v.index for v in f.verts) for f in bm.faces]; bm.free()
        bv, bf = [], []
        for p_ in nodes:
            o0 = len(bv); bv.extend([(p_[0] + v[0], p_[1] + v[1], p_[2] + v[2]) for v in iv]); bf.extend([tuple(o0 + i for i in f) for f in iff])
        bmm = bpy.data.meshes.new('steelB'); bmm.from_pydata(bv, [], bf); bmm.update(); [setattr(pg, 'use_smooth', True) for pg in bmm.polygons]
        if nodes: bo = bpy.data.objects.new('steelB', bmm); sc.collection.objects.link(bo); objs['steelB'] = bo
        DSTAT.update(chords=len(ch), webs=len(wb), balls=len(nodes))
    DSTAT['sec'] = round(time.time() - TD, 1)
    print('DETAIL', json.dumps(DSTAT))
FINE = FINE + ('steelC', 'steelW', 'steelB', 'mull', 'crane', 'liftf')

def lin(c): return tuple(((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c)
def node_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); return m, nt, o
def principled(name, col, rough=0.8, metal=0.0, emit=None, es=0.0, alpha=1.0):
    m, nt, o = node_mat(name); b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit is not None: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = es
    nt.links.new(b.outputs[0], o.inputs[0]); return m
def toon(name, paper, shade, mid=None, emit=None, es=0.0):
    # r3：阈值按亮度量级给（白天纸面环境光 ≈0.95，受光面 ≈1.2–1.9；夜景 ≈0.06 / 0.14），r2 的 0.55 等于全亮、没有平涂阴影
    mid = mid if mid is not None else (0.085 if NIGHT else 1.22)
    # 纸面：漫反射 → Shader to RGB → 两档色阶（纸白 / 淡墨阴影），自发光输出 = 不受曝光影响的平涂
    m, nt, o = node_mat(name); d = nt.nodes.new('ShaderNodeBsdfDiffuse'); d.inputs['Color'].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new('ShaderNodeShaderToRGB'); cr = nt.nodes.new('ShaderNodeValToRGB'); e = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(d.outputs[0], s2r.inputs[0]); nt.links.new(s2r.outputs[0], cr.inputs[0]); nt.links.new(cr.outputs[0], e.inputs[0])
    el = cr.color_ramp; el.interpolation = 'CONSTANT'; el.elements[0].color = (*shade, 1); el.elements[1].position = mid; el.elements[1].color = (*paper, 1)
    if emit is not None:
        e2 = nt.nodes.new('ShaderNodeEmission'); e2.inputs['Color'].default_value = (*emit, 1); e2.inputs['Strength'].default_value = es
        ad = nt.nodes.new('ShaderNodeAddShader'); nt.links.new(e.outputs[0], ad.inputs[0]); nt.links.new(e2.outputs[0], ad.inputs[1]); nt.links.new(ad.outputs[0], o.inputs[0])
    else: nt.links.new(e.outputs[0], o.inputs[0])
    return m

MAT = meta['MAT']; LIGHT = (1.0, 0.80, 0.55)
def real_mat(key):
    TR = {'tr_sil': ((0.92, 0.93, 0.95), 0.25, 0.35), 'tr_red': ((0.78, 0.10, 0.08), 0.4, 0.15), 'tr_blk': ((0.05, 0.055, 0.065), 0.12, 0.4), 'tr_sk': ((0.22, 0.23, 0.25), 0.55, 0.2)}
    if key in TR: c, r, mt = TR[key]; return principled('r_' + key, lin(c), r, mt)
    if key == 'trainW':
        return principled('r_trainW', lin((0.06, 0.07, 0.09)), 0.1, 0.3, LIGHT, 3.0 if NIGHT else 0.0)
    M = MAT.get(key, {'c': [0.6, 0.6, 0.6], 'r': 0.8, 'm': 0})
    c = lin(M['c']); e = M.get('e', 0) if NIGHT else 0
    if key == 'glass' and NIGHT: return principled('r_glass', c, 0.1, 0.2, (1.0, 0.86, 0.62), 3.5)
    if NIGHT and key in ('todG', 'ymG'): return principled('r_' + key, c, 0.1, 0.3, (1.0, 0.80, 0.55), 1.4)
    if NIGHT and key == 'plat': return principled('r_plat', c, 0.8, 0.0, (1.0, 0.85, 0.6), 1.6)
    if key == 'clad' and PR['real3'] and not NIGHT: return clad_real3(c)
    if key == 'clad': return principled('r_clad', c, 0.62, 0.15)   # r4：压高光（r3 远端两朵云过曝）
    if PR['real3'] and not NIGHT:
        if key in ('glass', 'todG', 'ymG'): return principled('r3_' + key, lin((0.50, 0.60, 0.68) if key == 'glass' else (0.28, 0.36, 0.44)), 0.04, 0.9)   # 采光顶 / 幕墙：低粗糙金属感，反射天空
        if key == 'rail': return principled('r3_rail', lin((0.58, 0.58, 0.60)), 0.22, 0.95)
        if key == 'steel': return noisy(principled('r3_steel', lin((0.46, 0.48, 0.50)), 0.35, 0.8), 0.3, 0.12)   # r8：网架深灰金属（r7 被扣「塑料白模」）
        if key in ('slab', 'conc', 'plat', 'found', 'ym', 'todB', 'soffit'):
            return noisy(principled('r3_' + key, c, M.get('r', 0.8), min(M.get('m', 0), 0.6)), 0.08 if key != 'steel' else 0.3, 0.18)
    return principled('r_' + key, c, M.get('r', 0.8), min(M.get('m', 0), 0.6), tuple(LIGHT[i] * c[i] for i in range(3)) if e else None, e * 2.2)

def noisy(m, scale, amt):
    # 三版实景：底色乘一层大尺度噪声（±amt），去掉 CG 平涂感
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 6
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector']); mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 1 - amt; mr.inputs['To Max'].default_value = 1 + amt
    nt.links.new(nz.outputs['Fac'], mr.inputs['Value']); mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
    mx.inputs['A'].default_value = b.inputs['Base Color'].default_value[:]; nt.links.new(mr.outputs[0], mx.inputs['B']); nt.links.new(mx.outputs['Result'], b.inputs['Base Color'])
    return m
def clad_real3(c):
    # 三版实景屋面：铝镁锰立缝板（Wave 条带 ≈1.5 m 立缝 → 凹凸 + 粗糙度条纹）+ 大尺度噪声粗糙度 + 各向异性高光
    m = principled('r3_clad', lin((0.80, 0.82, 0.84)), 0.32, 0.75); nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    for nm, v in (('Anisotropic', 0.55), ('Anisotropic Rotation', 0.0)):
        if nm in b.inputs: b.inputs[nm].default_value = v
    tc = nt.nodes.new('ShaderNodeTexCoord'); wv = nt.nodes.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'X'
    wv.inputs['Scale'].default_value = 0.16   # r7：立缝周期 ≈4 m，远景才读得出（r6 0.42 看不见）; wv.wave_profile = 'SAW'; nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.5; bp.inputs['Distance'].default_value = 0.12
    nt.links.new(wv.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.03; nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 0.24; mr.inputs['To Max'].default_value = 0.46
    nt.links.new(nz.outputs['Fac'], mr.inputs['Value']); nt.links.new(mr.outputs[0], b.inputs['Roughness'])
    return m

def clay_mat(key):
    base = (0.80, 0.79, 0.76)
    if key in ('red', 'yellow', 'jig'): c = lin({'red': (0.80, 0.20, 0.12), 'yellow': (0.85, 0.70, 0.40), 'jig': (0.82, 0.62, 0.40)}[key])
    elif key in ('glass', 'todG', 'ymG'): c = tuple(PR['clay_glass'])   # r4：云缝 / 幕墙浅灰（r3 深灰条被扣分）
    elif key in ('trainW', 'tr_blk'): c = (0.10, 0.11, 0.12)
    elif key in ('slab', 'rail') and shot in ('train', 'train_near'): c = (0.45, 0.44, 0.42)   # r4：道床压暗，白车读得出
    elif key == 'pv': c = (0.30, 0.33, 0.38)
    elif key == 'mount': c = (0.60, 0.61, 0.59)   # env：远山压暗一档，和纸白天空分开
    elif key == 'tr_red': c = lin((0.82, 0.12, 0.08))
    elif key == 'tr_sil': c = (0.95, 0.95, 0.95)
    else: c = base
    if NIGHT:
        M = MAT.get(key, {}); e = M.get('e', 0)
        if key in ('glass',): return principled('c_' + key, c, 0.6, 0, (1.0, 0.85, 0.6), 3.0)
        if key == 'trainW': return principled('c_trainW', c, 0.6, 0, (1.0, 0.85, 0.6), 3.0)
        if e: return principled('c_' + key, c, 0.8, 0, (1.0, 0.85, 0.6), e * 1.6)
    return principled('c_' + key, c, 0.85 if key not in ('clad', 'pv') else 0.5, 0.0)

def ink_mat(key):
    if NIGHT:   # 蓝图负片：深蓝纸、浅线、灯亮处暖光平涂
        paper, shade = (0.035, 0.06, 0.12), (0.02, 0.035, 0.075)
        M = MAT.get(key, {}); e = M.get('e', 0)
        if key == 'glass': return toon('i_' + key, (1.0, 0.78, 0.45), (0.85, 0.62, 0.32))
        if key == 'trainW': return toon('i_' + key, (1.0, 0.82, 0.5), (0.9, 0.7, 0.4))
        if e: return toon('i_' + key, (0.40, 0.30, 0.18), (0.26, 0.19, 0.11))
        return toon('i_' + key, paper, shade)
    paper, shade = (0.955, 0.935, 0.89), (0.80, 0.78, 0.74)
    if key in ('red',): return toon('i_red', (0.86, 0.22, 0.12), (0.62, 0.12, 0.06))
    if key == 'steel': return toon('i_steel', (0.90, 0.885, 0.85), (0.70, 0.68, 0.64))
    if key in ('glass', 'todG', 'ymG', 'tr_blk', 'trainW'): return toon('i_' + key, (0.80, 0.79, 0.76), (0.66, 0.65, 0.62))
    if key == 'pv': return toon('i_pv', (0.72, 0.73, 0.74), (0.60, 0.61, 0.62))
    if key == 'tr_red': return toon('i_trred', (0.92, 0.55, 0.50), (0.78, 0.42, 0.38))
    return toon('i_' + key, paper, shade)

# ---------- 11-09 控制图材质（全部自发光、无光照，渲 EXR 原始值；后处理见文件末）----------
# 分割配色（sRGB 8 位，纯色；颜色 → 材质对照表同 docs/handoff/2026-11-09-s401-ai-render.md）
SEG = {'clad': (230, 25, 75), 'seam': (230, 25, 75), 'pv': (245, 130, 48), 'glass': (0, 130, 200), 'mull': (250, 190, 212),
       'todG': (70, 240, 240), 'ymG': (70, 240, 240), 'steel': (240, 50, 230), 'steelC': (240, 50, 230), 'steelW': (240, 50, 230), 'steelB': (240, 50, 230),
       'soffit': (145, 30, 180), 'conc': (128, 128, 128), 'slab': (170, 110, 40), 'plat': (255, 225, 25), 'found': (128, 0, 0),
       'metro': (0, 0, 128), 'ym': (210, 245, 60), 'todB': (170, 255, 195), 'rail': (60, 180, 75), 'ground': (255, 250, 200),
       'red': (0, 128, 128), 'yellow': (0, 128, 128), 'jig': (0, 128, 128), 'sky': (6, 230, 230), 'other': (220, 190, 255),
       'crane': (0, 255, 0), 'liftf': (0, 0, 255), 'stock': (128, 128, 0), 'cabin': (255, 128, 128),   # site=on 新增：塔吊 + 履带吊 / 提升架 / 堆料 / 板房
       'city': (180, 120, 120), 'mount': (143, 255, 140), 'road': (140, 140, 140)}   # env=on 新增（取 ADE20K 的 building / mountain / road 色，ControlNet seg 认得）
def emis_mat(name):
    m, nt, o = node_mat(name); e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Strength'].default_value = 1.0; nt.links.new(e.outputs[0], o.inputs[0]); return m, nt, e
def seg_mat(key):
    c = tuple(v / 255 for v in SEG.get(key, SEG['other'])); m, nt, e = emis_mat('s_' + key); e.inputs['Color'].default_value = (*c, 1)
    if key == 'clad':   # 光伏：顶点色 r 硬阈值 0.5
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'Color'; sp = nt.nodes.new('ShaderNodeSeparateColor'); gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'
        gt.inputs[1].default_value = 0.5; nt.links.new(at.outputs['Color'], sp.inputs[0]); nt.links.new(sp.outputs[0], gt.inputs[0])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; nt.links.new(gt.outputs[0], mx.inputs['Factor'])
        mx.inputs['A'].default_value = (*c, 1); mx.inputs['B'].default_value = (*[v / 255 for v in SEG['pv']], 1); nt.links.new(mx.outputs['Result'], e.inputs['Color'])
    return m
def depth_mat(key):
    m, nt, e = emis_mat('d_' + key); cd_ = nt.nodes.new('ShaderNodeCameraData'); nt.links.new(cd_.outputs['View Z Depth'], e.inputs['Color']); return m
def normal_mat(key):
    # 世界空间法线（背面翻向相机）×0.5+0.5 → 后处理转相机空间
    m, nt, e = emis_mat('n_' + key); g = nt.nodes.new('ShaderNodeNewGeometry')
    f = nt.nodes.new('ShaderNodeMath'); f.operation = 'MULTIPLY_ADD'; f.inputs[1].default_value = -2.0; f.inputs[2].default_value = 1.0; nt.links.new(g.outputs['Backfacing'], f.inputs[0])
    sv = nt.nodes.new('ShaderNodeVectorMath'); sv.operation = 'SCALE'; nt.links.new(g.outputs['Normal'], sv.inputs[0]); nt.links.new(f.outputs[0], sv.inputs['Scale'])
    ma = nt.nodes.new('ShaderNodeVectorMath'); ma.operation = 'MULTIPLY_ADD'; nt.links.new(sv.outputs[0], ma.inputs[0])
    ma.inputs[1].default_value = (0.5, 0.5, 0.5); ma.inputs[2].default_value = (0.5, 0.5, 0.5); nt.links.new(ma.outputs[0], e.inputs['Color']); return m
def line_mat(key):
    m, nt, e = emis_mat('l_' + key); e.inputs['Color'].default_value = (1, 1, 1, 1); return m

FN = {'real': real_mat, 'clay': clay_mat, 'ink': ink_mat, 'seg': seg_mat, 'depth': depth_mat, 'normal': normal_mat, 'line': line_mat}[style]
def with_pv(m, pvc):
    # 光伏（顶点色 r = HZ.pvMask）：在 clad 材质的最终颜色上按 0.45–0.55 硬边混入光伏色，边界随网格平滑、不再锯齿
    nt = m.node_tree; at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'Color'
    sp = nt.nodes.new('ShaderNodeSeparateColor'); mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.45; mr.inputs['From Max'].default_value = 0.55
    nt.links.new(at.outputs['Color'], sp.inputs[0]); nt.links.new(sp.outputs[0], mr.inputs['Value'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; nt.links.new(mr.outputs[0], mx.inputs['Factor'])
    mx.inputs['B'].default_value = (*pvc, 1)
    b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is not None:
        mx.inputs['A'].default_value = b.inputs['Base Color'].default_value[:]; nt.links.new(mx.outputs['Result'], b.inputs['Base Color'])
        rr = nt.nodes.new('ShaderNodeMapRange'); nt.links.new(mr.outputs[0], rr.inputs['Value']); rr.inputs['To Min'].default_value = b.inputs['Roughness'].default_value; rr.inputs['To Max'].default_value = 0.2
        nt.links.new(rr.outputs[0], b.inputs['Roughness'])
    else:
        cr = next(n for n in nt.nodes if n.type == 'VALTORGB'); em = next(n for n in nt.nodes if n.type == 'EMISSION' and n.inputs['Color'].is_linked)
        mx.blend_type = 'MULTIPLY'; mx.inputs['B'].default_value = (*pvc, 1); mx.inputs['A'].default_value = (1, 1, 1, 1)
        mu = nt.nodes.new('ShaderNodeMix'); mu.data_type = 'RGBA'; mu.blend_type = 'MULTIPLY'; mu.inputs['Factor'].default_value = 1.0
        nt.links.new(cr.outputs[0], mu.inputs['A']); nt.links.new(mx.outputs['Result'], mu.inputs['B']); nt.links.new(mu.outputs['Result'], em.inputs['Color'])
    return m
PVC = {'real': lin((0.10, 0.14, 0.26)), 'clay': (0.30, 0.33, 0.38), 'ink': ((0.72, 0.74, 0.78) if not NIGHT else (0.6, 0.7, 0.9))}.get(style)
DBASE = {'seam': 'clad', 'steelC': 'steel', 'steelW': 'steel', 'steelB': 'steel', 'crane': 'yellow', 'liftf': 'yellow', 'stock': 'steel', 'cabin': 'conc', 'city': 'conc', 'road': 'slab', 'mount': 'conc'}   # 细节 / 工地物体沿用母材质（分割图 seg 用自己的表）
def mull_mat():
    if style == 'real': return principled('r_mull', lin((0.36, 0.37, 0.39)), 0.38, 0.85)
    if style == 'clay': return clay_mat('mull')
    if style == 'ink': return toon('i_mull', (0.80, 0.79, 0.76), (0.62, 0.61, 0.58))
    return FN('mull')
for key, o in objs.items():
    o.data.materials.clear(); m_ = FN(key) if (style == 'seg' or key not in DBASE or (style == 'clay' and key == 'mount')) else FN(DBASE[key])
    if key == 'mull': m_ = mull_mat()
    if key == 'clad' and PVC is not None and not (style == 'real' and False): m_ = with_pv(m_, PVC)
    o.data.materials.append(m_)

# ---------- 地面 ----------
bpy.ops.mesh.primitive_plane_add(size=(20000 if ENV else 9000), location=(0, 0, -0.06)); gnd = bpy.context.active_object
gcol = {'real': (0.20, 0.21, 0.19) if not NIGHT else ((0.035, 0.038, 0.045) if PR['real3'] else (0.012, 0.014, 0.02)), 'clay': (0.55, 0.54, 0.51) if not NIGHT else (0.10, 0.11, 0.14)}.get(style)
if style == 'real' and not NIGHT and PR['real3']:   # 三版：地面 = 场地硬化 + 草地斑块（大尺度噪声混色）
    gm = principled('ground3', lin((0.30, 0.30, 0.28)), 0.92); gt = gm.node_tree; gb = next(n for n in gt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc_ = gt.nodes.new('ShaderNodeTexCoord'); nz_ = gt.nodes.new('ShaderNodeTexNoise'); nz_.inputs['Scale'].default_value = 0.0012; nz_.inputs['Detail'].default_value = 8
    gt.links.new(tc_.outputs['Object'], nz_.inputs['Vector']); cr_ = gt.nodes.new('ShaderNodeValToRGB'); cr_.color_ramp.elements[0].position = 0.45; cr_.color_ramp.elements[1].position = 0.6
    cr_.color_ramp.elements[0].color = (*lin((0.36, 0.36, 0.34)), 1); cr_.color_ramp.elements[1].color = (*lin((0.30, 0.36, 0.22)), 1)
    gt.links.new(nz_.outputs['Fac'], cr_.inputs[0]); gt.links.new(cr_.outputs[0], gb.inputs['Base Color']); gnd.data.materials.append(gm)
elif CTRL: gnd.data.materials.append(FN('ground'))
else: gnd.data.materials.append(principled('ground', gcol, 0.95) if style != 'ink' else ink_mat('ground'))

# ---------- 墨线（页面 Geo.L 同源段 + 屋面等高线）：ink 全画；clay/real 只画等高线淡痕（无）----------
def read_lines():
    b = open(os.path.join(geo, 'lines.bin'), 'rb').read(); i = 0; G = {}
    while i < len(b):
        n = b[i]; name = b[i + 1:i + 1 + n].decode(); i += 1 + n; cnt = struct.unpack_from('<I', b, i)[0]; i += 4
        G[name] = struct.unpack_from('<%df' % (cnt * 6), b, i); i += cnt * 24
    return G
def add_lines(name, segs, radius, col, es=1.0):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = radius; cu.bevel_resolution = 0
    for k in range(0, len(segs), 6):
        sp = cu.splines.new('POLY'); sp.points.add(1)
        sp.points[0].co = (segs[k], -segs[k + 2], segs[k + 1], 1); sp.points[1].co = (segs[k + 3], -segs[k + 5], segs[k + 4], 1)
    ob = bpy.data.objects.new(name, cu); sc.collection.objects.link(ob)
    m, nt, o = node_mat(name + '_m'); e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (*col, 1); e.inputs['Strength'].default_value = es; nt.links.new(e.outputs[0], o.inputs[0])
    cu.materials.append(m); return ob
LG = read_lines()
INK = (0.075, 0.068, 0.06) if not NIGHT else (0.78, 0.86, 0.95)
if style == 'line': INK = (0.0, 0.0, 0.0)
if INKLIKE:
    # r2：主线 = 云纹 Wv 等值线（四朵云各自闭合）；Hc 2 m 等高线降为淡细线
    if 'wv' in LG: add_lines('wv', LG['wv'], 0.17 if shot == 'roof' else 0.24, INK if not NIGHT else (0.62, 0.74, 0.90))
    if 'iso' in LG and shot == 'roof' and style == 'ink': add_lines('iso', LG['iso'], 0.07, (0.55, 0.53, 0.50) if not NIGHT else (0.3, 0.4, 0.55))
    # r3：页面同源墨线（Geo.L）里的屋面分格（clad）与采光顶格栅（glass）细线画上
    for k_, r_ in ((('clad', 0.055),) if PR['clad_lines'] else ()) + (('glass', 0.07),):   # r4：去掉 clad 分格线（r3 加上后云纹读法反而降分），只留采光顶格栅
        if k_ in LG and shot != 'lift': add_lines('L_' + k_, LG[k_], r_ * (1.0 if shot == 'roof' else 1.6), INK if style == 'line' else (0.35, 0.34, 0.32) if not NIGHT else (0.45, 0.55, 0.7))

elif style == 'clay' and shot == 'roof' and 'wv' in LG and PR['clay_wv']:   # r2 定稿：白模屋面云纹淡线
    add_lines('wv', LG['wv'], 0.09, (0.42, 0.41, 0.39), 1.0)

# ---------- 三版：提升段钢绞线束（32 台提升器：红色构件按位置聚成 32 组，每组顶部向下射线找网架吊点，画 4 根竖向钢绞线）----------
STRAND = []
if shot == 'lift' and PR['strands'] and style not in ('depth', 'normal', 'seg') and 'red' in objs and 'steel' in objs:
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    dg0 = bpy.context.evaluated_depsgraph_get(); so_ = objs['steel']; mw_ = so_.matrix_world   # 世界坐标建 BVH（FromObject 是物体局部坐标，导入带轴变换时会南北颠倒）
    st_bvh = BVHTree.FromPolygons([mw_ @ v.co for v in so_.data.vertices], [tuple(pg.vertices) for pg in so_.data.polygons])
    rv = [objs['red'].matrix_world @ v.co for v in objs['red'].data.vertices]; G_ = []
    for p_ in rv:   # Blender 坐标：x 东、y 北、z 上
        for g_ in G_:
            if abs(g_[0] - p_.x) < 7 and abs(g_[1] - p_.y) < 7: g_[2].append(p_); break
        else: G_.append([p_.x, p_.y, [p_]])
    segs = []
    for g_ in G_:
        xs = [q.x for q in g_[2]]; ys = [q.y for q in g_[2]]; zt = max(q.z for q in g_[2])
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        # 网架是杆件（中间有空），单根射线常漏：在 ±3 m 内 13×13 采样，取最高命中 = 上弦吊点高度
        zs_ = []
        for R_, n_ in ((3, 13), (9, 19)) if PR['strand_wide'] else ((3, 13),):   # 中间 8 台塔架落在十字天窗缝上方，±3 m 内没有杆件 → 扩到 ±9 m 找缝边网架高度
            for i_ in range(n_):
                for j_ in range(n_):
                    hit = st_bvh.ray_cast(Vector((cx - R_ + i_ * 2 * R_ / (n_ - 1), cy - R_ + j_ * 2 * R_ / (n_ - 1), zt - 0.4)), Vector((0, 0, -1)), 45.0)
                    if hit[0] is not None: zs_.append(hit[0].z)
            if zs_: break
        if os.environ.get('V2_DBG'): print('SDBG %.1f %.1f zt=%.1f n=%d zmax=%s' % (cx, cy, zt, len(zs_), ('%.1f' % max(zs_)) if zs_ else '-'))
        if not zs_ or zt - 0.4 - max(zs_) < 1.5: continue
        zb = max(zs_)
        for dx, dy in ((-0.45, -0.45), (0.45, -0.45), (-0.45, 0.45), (0.45, 0.45)):
            segs += [cx + dx, zb, -(cy + dy), cx + dx, zt - 0.4, -(cy + dy)]   # 写回数据坐标（x, y 上, z 南）
    print('STRANDS groups=%d strands=%d' % (len(G_), len(segs) // 6))
    if segs:
        scol = {'ink': INK, 'line': INK, 'clay': (0.12, 0.12, 0.13), 'real': (0.05, 0.05, 0.055)}.get(style, INK)
        STRAND.append(add_lines('strand', segs, PR['strand_r'] or (0.16 if style == 'ink' else 0.12), scol, 1.0))   # r8：加粗（r7 被要求「加粗钢绞线墨线」）

# ---------- 三版：夜景发光十字描边（采光顶格栅线 = 暖白高亮自发光，配合合成器辉光）----------
if NIGHT and PR['glow3'] and not CTRL and 'glass' in LG:
    add_lines('L_glow', LG['glass'], 0.16 if style == 'ink' else 0.12, (1.0, 0.86, 0.6), 2.2 if style == 'ink' else 6.0)

# ---------- Freestyle（ink：轮廓 + 折棱 + 边界；clay 细淡线）----------
if style in ('ink', 'line') or (style == 'clay' and not DETAIL):   # 白模 detail=on 不画 Freestyle 淡线（百万面几何下 Freestyle 太慢）
    sc.render.use_freestyle = True; sc.render.line_thickness_mode = 'ABSOLUTE'; sc.render.line_thickness = 1.0
    vl = sc.view_layers[0]; vl.use_freestyle = True; fs = vl.freestyle_settings; fs.crease_angle = math.radians(134)
    # 三组线：主体 / 细杆（网架 steel、提升器 red/yellow，免得 1 万根杆件三棱柱的折棱糊成黑块）/ 列车（加粗，远景也读得出）
    CO = {n: bpy.data.collections.new(n) for n in ('mainc', 'fine', 'trainc', 'nolines')}   # nolines：锁边肋只遮挡、不出线（否则屋面被几百条肋线涂黑）
    for c_ in CO.values(): sc.collection.children.link(c_)
    for key_, o_ in objs.items():
        cn = 'nolines' if key_ == 'seam' else 'fine' if key_ in FINE else 'trainc' if (key_.startswith('tr_') or key_ == 'trainW') else 'mainc'
        CO[cn].objects.link(o_); sc.collection.objects.unlink(o_)
    CO['mainc'].objects.link(gnd); sc.collection.objects.unlink(gnd)
    for ls in list(fs.linesets): fs.linesets.remove(ls)
    def lineset(name, th, alpha, crease, col=None):
        ls = fs.linesets.new(name); ls.select_by_visibility = True; ls.visibility = 'VISIBLE'
        ls.select_silhouette = True; ls.select_border = True; ls.select_crease = crease; ls.select_contour = True
        ls.select_by_collection = True; ls.collection = CO[name]; ls.collection_negation = 'INCLUSIVE'
        if ls.linestyle is None: ls.linestyle = bpy.data.linestyles.new(name)
        lst = ls.linestyle; lst.color = col or (INK if style == 'ink' else (0.30, 0.29, 0.27)); lst.thickness = th; lst.alpha = alpha
        return ls
    k = (W / 1920.0)
    if INKLIKE: lineset('mainc', 1.35 * k + 0.2, 1.0, True); lineset('fine', FINE_T * k + 0.15, FINE_A, False); lineset('trainc', TRAIN_T * k, 1.0, True)
    else: lineset('mainc', 0.7 * k + 0.1, 0.5, True); lineset('fine', 0.5 * k + 0.1, 0.25, False); lineset('trainc', 1.2 * k, 0.8, True)

# ---------- 世界 / 灯光 ----------
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = nt.nodes['Background']
if style == 'line': bgc, bgs = (1.0, 1.0, 1.0), 1.0
elif CTRL: bgc, bgs = (0.0, 0.0, 0.0), 0.0
elif style == 'ink': bgc, bgs = ((0.955, 0.935, 0.89) if not NIGHT else (0.035, 0.06, 0.12)), 1.0
elif NIGHT: bgc, bgs = (0.05, 0.08, 0.16), (5.0 if (style == 'real' and PR['real3']) else 1.0)   # r7：实景夜空提亮（r6 被扣「纯黑虚空」）
elif style == 'clay': bgc, bgs = (0.86, 0.84, 0.80), 0.55
else: bgc, bgs = (0.52, 0.62, 0.78), 0.85
if style != 'ink' and not CTRL and not NIGHT:
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], ramp.inputs[0])
    r = ramp.color_ramp; r.elements[0].position = 0.5; r.elements[0].color = (*[c * 0.9 for c in bgc], 1); r.elements[1].position = 0.75
    r.elements[1].color = ((0.30, 0.42, 0.65, 1) if style == 'real' else (*bgc, 1)); nt.links.new(ramp.outputs[0], bg.inputs['Color'])
else: bg.inputs['Color'].default_value = (*bgc, 1)
bg.inputs['Strength'].default_value = bgs
if style == 'real' and not NIGHT:   # r2：物理天空（失败则保留渐变）
    try:
        sk = nt.nodes.new('ShaderNodeTexSky')
        for ty in ('MULTIPLE_SCATTERING', 'NISHITA', 'SINGLE_SCATTERING'):
            try: sk.sky_type = ty; break
            except Exception: pass
        sk.sun_elevation = math.radians(max(S['sun'][0], 6)); sk.sun_rotation = math.radians(180 - S['sun'][1] + 90)
        try: sk.sun_disc = False
        except Exception: pass
        nt.links.new(sk.outputs[0], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.35 if PR['real3'] else 0.25
    except Exception as ex: print('SKY_FAIL', ex)
if style == 'clay' and not NIGHT:   # r3：相机直接看到的背景 = 暖白纸面，照明仍用较暗的环境光（灰底是 r1/r2 的共同扣分项）
    lp = nt.nodes.new('ShaderNodeLightPath'); bp = nt.nodes.new('ShaderNodeBackground'); bp.inputs['Color'].default_value = (0.93, 0.91, 0.87, 1); bp.inputs['Strength'].default_value = 1.0
    ms = nt.nodes.new('ShaderNodeMixShader'); wo = nt.nodes['World Output']
    nt.links.new(lp.outputs['Is Camera Ray'], ms.inputs[0]); nt.links.new(bg.outputs[0], ms.inputs[1]); nt.links.new(bp.outputs[0], ms.inputs[2]); nt.links.new(ms.outputs[0], wo.inputs['Surface'])
el, az = S['sun']
sd = bpy.data.lights.new('sun', 'SUN'); so = bpy.data.objects.new('sun', sd); sc.collection.objects.link(so)
# 太阳方向：仰角 el、方位 az（度，从北顺时针；北 = 数据 -z = Blender +y）
so.rotation_euler = (math.radians(90 - el), 0, math.radians(180 - az))
sd.energy = (0.45 if NIGHT else (4.2 if style == 'real' else 3.2)); sd.angle = math.radians(1.2)
sd.color = (0.62, 0.72, 1.0) if NIGHT else (1.0, 0.96, 0.90)
if style == 'ink': sd.energy = 3.0
if style == 'real' and not NIGHT and PR['real3']: sd.energy = 4.8; sd.angle = math.radians(0.6)   # 三版：物理天空 + 硬一点的日光
if PR['sun_e'] is not None: sd.energy = PR['sun_e']

# ---------- 相机 ----------
def B(p): return (p[0], -p[2], p[1])
cd = bpy.data.cameras.new('cam'); cd.lens = S['lens']; cd.sensor_width = 36; cd.clip_start = 1; cd.clip_end = 20000
co = bpy.data.objects.new('cam', cd); sc.collection.objects.link(co); co.location = B(S['pos'])
tg = bpy.data.objects.new('tgt', None); sc.collection.objects.link(tg); tg.location = B(S['tgt'])
c = co.constraints.new('TRACK_TO'); c.target = tg; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'; sc.camera = co
if style == 'real' and not NIGHT:
    sc.render.film_transparent = False
if NIGHT:   # r2：夜景辉光（合成器 Glare；API 不同版本写法不同，失败就跳过）
    try:
        tree = None
        if not hasattr(sc, 'compositing_node_group'):
            sc.use_nodes = True; tree = sc.node_tree
        if tree is None:
            tree = bpy.data.node_groups.new('comp', 'CompositorNodeTree'); sc.compositing_node_group = tree
            gi = tree.nodes.new('CompositorNodeRLayers'); go = tree.nodes.new('NodeGroupOutput'); tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        else:
            gi = tree.nodes.get('Render Layers') or tree.nodes.new('CompositorNodeRLayers'); go = tree.nodes.get('Composite') or tree.nodes.new('CompositorNodeComposite')
        gl = tree.nodes.new('CompositorNodeGlare')
        if 'Type' in gl.inputs: gl.inputs['Type'].default_value = 'Bloom'
        else: gl.glare_type = 'BLOOM'
        for nm, v in (('threshold', 1.0), ('size', 7), ('mix', -0.55)):
            try: setattr(gl, nm, v)
            except Exception: pass
        # r7：glow3 阈值 1.25，只让发光线 / 灯晕，不让白墨线与底色一起泛白（r6 阈值 0.85 时 night_ink 6.5→5.5）
        GV = (('Threshold', 1.25), ('Strength', 0.6), ('Size', 0.65)) if PR['glow3'] else (('Threshold', 1.0), ('Strength', 0.25), ('Size', 0.5))
        for nm, v in GV:
            if nm in gl.inputs: gl.inputs[nm].default_value = v
        tree.links.new(gi.outputs['Image'], gl.inputs['Image']); tree.links.new(gl.outputs['Image'], go.inputs[0]); print('GLOW_OK')
    except Exception as ex: print('GLOW_FAIL', ex)
sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = out
if CTRL and style != 'line':   # 控制图：自发光、无 AA 混色（seg 1 采样保证纯色）、透明天空、float32 EXR
    sc.render.film_transparent = True; sc.render.filter_size = 0.0 if style == 'seg' else 1.0
    sc.eevee.taa_render_samples = 1 if style == 'seg' else 64   # 64 采样：亚像素锁边肋（0.5 m ≈ 2 px）充分平均，减轻摩尔纹
    for k_ in ('use_raytracing', 'use_gtao', 'use_shadows', 'use_bloom'):
        try: setattr(sc.eevee, k_, False)
        except Exception: pass
    sd.energy = 0.0
    sc.render.image_settings.file_format = 'OPEN_EXR'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '32'
    sc.render.filepath = os.path.splitext(out)[0] + '.exr'
if shot in ('train', 'train_near'):   # 同框核查：列车 / 云门顶点抽样 → 在画框内的比例、从相机射线首个命中是否就是它（未被遮挡）的比例
    from bpy_extras.object_utils import world_to_camera_view
    dg = bpy.context.evaluated_depsgraph_get(); bpy.context.view_layer.update()
    for grp in (('tr_sil', 'tr_red', 'tr_blk'), ('ym', 'ymG')):
        pts = []
        for k_ in grp:
            o_ = objs.get(k_)
            if o_: vs = o_.data.vertices; st_ = max(1, len(vs) // 400); pts += [(o_, o_.matrix_world @ vs[i].co) for i in range(0, len(vs), st_)]
        inf = vis = 0
        for o_, p_ in pts:
            v = world_to_camera_view(sc, co, p_)
            if 0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0:
                inf += 1; d_ = (p_ - co.matrix_world.translation); L_ = d_.length
                hit, loc, nor, idx, ho, mtx = sc.ray_cast(dg, co.matrix_world.translation, d_.normalized(), distance=L_ + 1.0)
                if hit and (ho.name.split('.')[0] in grp or (loc - p_).length < 1.5): vis += 1
        print('FRAMECHECK %s n=%d inframe=%.2f visible=%.2f' % ('+'.join(grp), len(pts), inf / max(1, len(pts)), vis / max(1, len(pts))))
bpy.ops.render.render(write_still=True)
# ---------- 11-09 控制图后处理：EXR 原始值 → ControlNet 用 PNG（自带 PNG 编码，不依赖 PIL）----------
if CTRL and style != 'line':
    import numpy as np, zlib
    def png_write(path, a):
        a = np.ascontiguousarray(a[::-1]); h, w_ = a.shape[:2]; ch = 1 if a.ndim == 2 else a.shape[2]
        bd = 16 if a.dtype == np.uint16 else 8; ct = {1: 0, 3: 2, 4: 6}[ch]
        raw = a.astype('>u2').tobytes() if bd == 16 else a.astype(np.uint8).tobytes(); rl = w_ * ch * (bd // 8)
        data = b''.join(b'\x00' + raw[i * rl:(i + 1) * rl] for i in range(h))
        def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
        open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w_, h, bd, ct, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(data, 6)) + chunk(b'IEND', b''))
    base_ = os.path.splitext(out)[0]; exr = base_ + '.exr'
    im = bpy.data.images.load(exr); px = np.empty(W * H * 4, np.float32); im.pixels.foreach_get(px); px = px.reshape(H, W, 4)
    al = px[..., 3]; msk = al > 0.5; rgb = px[..., :3] / np.maximum(al, 1e-6)[..., None]   # 反预乘（边缘抗锯齿像素）
    dg_ = bpy.context.evaluated_depsgraph_get(); ce = co.evaluated_get(dg_); R3 = np.array(ce.matrix_world.to_3x3())
    info = dict(shot=shot, style=style, W=W, H=H, lens=S['lens'], sensor_width=36, pos_data=S['pos'], tgt_data=S['tgt'],
                cam_matrix_world=[list(r) for r in ce.matrix_world], detail=DETAIL, coverage=round(float(msk.mean()), 4))
    if style == 'depth':
        z = rgb[..., 0]; zv = z[msk]; zn = float(np.percentile(zv, 0.5)); zf = float(min(np.percentile(zv, 99.9), 9000.0 if ENV else 3000.0))
        inv = (1.0 / np.maximum(z, 1e-3) - 1.0 / zf) / (1.0 / zn - 1.0 / zf); inv = np.clip(inv, 0, 1); inv[~msk] = 0
        png_write(base_ + '.png', (inv * 255 + 0.5).astype(np.uint8)); png_write(base_ + '_16.png', (inv * 65535 + 0.5).astype(np.uint16))
        info.update(depth='逆深度（视差）归一化：v = (1/z − 1/zf) / (1/zn − 1/zf)，近白远黑，天空 0', z_near_m=round(zn, 2), z_far_m=round(zf, 2), z_min_m=round(float(zv.min()), 2), z_max_m=round(float(zv.max()), 2))
    elif style == 'normal':
        nw = rgb * 2 - 1; nc = nw @ R3   # 世界 → 相机：n_cam = Rᵀ n_world（相机看 −Z，Y 上，X 右）
        nc /= np.maximum(np.linalg.norm(nc, axis=2, keepdims=True), 1e-6)
        cn = np.stack([-nc[..., 0], nc[..., 1], nc[..., 2]], -1); gl = nc   # cn：红 = 朝左、绿 = 朝上、蓝 = 朝向相机（ControlNet 1.1 NormalBAE 约定）；gl：红 = 朝右
        for nm_, a_ in (('_cn', cn), ('_gl', gl)):
            u8 = ((a_ * 0.5 + 0.5) * 255 + 0.5).clip(0, 255).astype(np.uint8); u8[~msk] = 0; png_write(base_ + nm_ + '.png', u8)
        info.update(normal='相机空间；_cn 红=左 绿=上 蓝=朝相机（ControlNet 1.1 normalbae）；_gl 红=右；天空 (0,0,0)')
    elif style == 'seg':
        u8 = (rgb * 255 + 0.5).clip(0, 255).astype(np.uint8); u8[~msk] = SEG['sky']; png_write(base_ + '.png', u8)
        cols, cnt = np.unique(u8.reshape(-1, 3), axis=0, return_counts=True); inv_ = {v: k for k, v in SEG.items()}
        tab = sorted([(int(c_), inv_.get(tuple(int(x) for x in cl), '?'), tuple(int(x) for x in cl)) for cl, c_ in zip(cols, cnt)], reverse=True)
        info.update(seg_palette=SEG, seg_pixels=[t for t in tab if t[0] >= 50], seg_colors_total=len(cols), seg_colors_unlisted_px=int(sum(t[0] for t in tab if t[1] == '?')))
    json.dump(info, open(base_ + '_cam.json', 'w'), ensure_ascii=False, indent=1); print('CTRL_OUT', base_, json.dumps({k: info[k] for k in info if k not in ('seg_palette', 'cam_matrix_world')}, ensure_ascii=False)[:600])
print('V2_RENDER %s %s %s %dx%d %.1fs' % (shot, style, out, W, H, time.time() - T0))
