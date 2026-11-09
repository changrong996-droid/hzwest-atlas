# 终版精修二版（hark-cs）：4 镜头 × 3 风格（clay 白模 / ink 墨线 / real 实景）
# 用法：Blender -b --factory-startup -P blender/v2/render_v2.py -- <geoDir> <out.png> <shot> <style> [W H]
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
    # 夜景亮灯全景 t=1131
    'night': dict(pos=(380, 300, 520), tgt=(0, 18, 20), lens=36, sun=(40, 140), night=True),   # r3：抬高、偏南，云门不再以黑侧面挡站房
}
S = dict(SHOTS[shot]); NIGHT = S['night']
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
if style == 'ink': sc.view_settings.view_transform = 'Standard'
if style == 'clay' and not NIGHT:   # r4：AgX 把白模压成灰，换 Standard（太阳同时降到 3.2 免得过曝）
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'

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
    if key == 'clad': return principled('r_clad', c, 0.62, 0.15)   # r4：压高光（r3 远端两朵云过曝）
    return principled('r_' + key, c, M.get('r', 0.8), min(M.get('m', 0), 0.6), tuple(LIGHT[i] * c[i] for i in range(3)) if e else None, e * 2.2)

def clay_mat(key):
    base = (0.80, 0.79, 0.76)
    if key in ('red', 'yellow', 'jig'): c = lin({'red': (0.80, 0.20, 0.12), 'yellow': (0.85, 0.70, 0.40), 'jig': (0.82, 0.62, 0.40)}[key])
    elif key in ('glass', 'todG', 'ymG'): c = (0.60, 0.62, 0.64)   # r4：云缝 / 幕墙浅灰（r3 深灰条被扣分）
    elif key in ('trainW', 'tr_blk'): c = (0.10, 0.11, 0.12)
    elif key in ('slab', 'rail') and shot == 'train': c = (0.45, 0.44, 0.42)   # r4：道床压暗，白车读得出
    elif key == 'pv': c = (0.30, 0.33, 0.38)
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

FN = {'real': real_mat, 'clay': clay_mat, 'ink': ink_mat}[style]
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
PVC = {'real': lin((0.10, 0.14, 0.26)), 'clay': (0.30, 0.33, 0.38), 'ink': ((0.72, 0.74, 0.78) if not NIGHT else (0.6, 0.7, 0.9))}[style]
for key, o in objs.items():
    o.data.materials.clear(); m_ = FN(key)
    if key == 'clad': m_ = with_pv(m_, PVC)
    o.data.materials.append(m_)

# ---------- 地面 ----------
bpy.ops.mesh.primitive_plane_add(size=9000, location=(0, 0, -0.06)); gnd = bpy.context.active_object
gcol = {'real': (0.20, 0.21, 0.19) if not NIGHT else (0.012, 0.014, 0.02), 'clay': (0.55, 0.54, 0.51) if not NIGHT else (0.10, 0.11, 0.14)}.get(style)
gnd.data.materials.append(principled('ground', gcol, 0.95) if style != 'ink' else ink_mat('ground'))

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
if style == 'ink':
    # r2：主线 = 云纹 Wv 等值线（四朵云各自闭合）；Hc 2 m 等高线降为淡细线
    if 'wv' in LG: add_lines('wv', LG['wv'], 0.17 if shot == 'roof' else 0.24, INK if not NIGHT else (0.62, 0.74, 0.90))
    if 'iso' in LG and shot == 'roof': add_lines('iso', LG['iso'], 0.07, (0.55, 0.53, 0.50) if not NIGHT else (0.3, 0.4, 0.55))
    # r3：页面同源墨线（Geo.L）里的屋面分格（clad）与采光顶格栅（glass）细线画上
    for k_, r_ in (('glass', 0.07),):   # r4：去掉 clad 分格线（r3 加上后云纹读法反而降分），只留采光顶格栅
        if k_ in LG and shot != 'lift': add_lines('L_' + k_, LG[k_], r_ * (1.0 if shot == 'roof' else 1.6), (0.35, 0.34, 0.32) if not NIGHT else (0.45, 0.55, 0.7))


# ---------- Freestyle（ink：轮廓 + 折棱 + 边界；clay 细淡线）----------
if style in ('ink', 'clay'):
    sc.render.use_freestyle = True; sc.render.line_thickness_mode = 'ABSOLUTE'; sc.render.line_thickness = 1.0
    vl = sc.view_layers[0]; vl.use_freestyle = True; fs = vl.freestyle_settings; fs.crease_angle = math.radians(134)
    # 三组线：主体 / 细杆（网架 steel、提升器 red/yellow，免得 1 万根杆件三棱柱的折棱糊成黑块）/ 列车（加粗，远景也读得出）
    CO = {n: bpy.data.collections.new(n) for n in ('mainc', 'fine', 'trainc')}
    for c_ in CO.values(): sc.collection.children.link(c_)
    for key_, o_ in objs.items():
        cn = 'fine' if key_ in FINE else 'trainc' if (key_.startswith('tr_') or key_ == 'trainW') else 'mainc'
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
    if style == 'ink': lineset('mainc', 1.35 * k + 0.2, 1.0, True); lineset('fine', FINE_T * k + 0.15, FINE_A, False); lineset('trainc', TRAIN_T * k, 1.0, True)
    else: lineset('mainc', 0.7 * k + 0.1, 0.5, True); lineset('fine', 0.5 * k + 0.1, 0.25, False); lineset('trainc', 1.2 * k, 0.8, True)

# ---------- 世界 / 灯光 ----------
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = nt.nodes['Background']
if style == 'ink': bgc, bgs = ((0.955, 0.935, 0.89) if not NIGHT else (0.035, 0.06, 0.12)), 1.0
elif NIGHT: bgc, bgs = (0.05, 0.08, 0.16), 1.0
elif style == 'clay': bgc, bgs = (0.86, 0.84, 0.80), 0.55
else: bgc, bgs = (0.52, 0.62, 0.78), 0.85
if style != 'ink' and not NIGHT:
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
        nt.links.new(sk.outputs[0], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.25
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
        for nm, v in (('Threshold', 1.0), ('Strength', 0.25), ('Size', 0.5)):
            if nm in gl.inputs: gl.inputs[nm].default_value = v
        tree.links.new(gi.outputs['Image'], gl.inputs['Image']); tree.links.new(gl.outputs['Image'], go.inputs[0]); print('GLOW_OK')
    except Exception as ex: print('GLOW_FAIL', ex)
sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = out
if shot == 'train':   # 同框核查：列车 / 云门顶点抽样 → 在画框内的比例、从相机射线首个命中是否就是它（未被遮挡）的比例
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
print('V2_RENDER %s %s %s %dx%d %.1fs' % (shot, style, out, W, H, time.time() - T0))
