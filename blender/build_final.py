import sys
import os
import json
import math
import time
import bpy
from mathutils import Vector

WORK_DIR = os.path.dirname(os.path.abspath(__file__))


def srgb_to_linear(c):
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def hex_to_rgba(hex_str, alpha=1.0):
    h = hex_str.lstrip('#')
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)


def map_coord(x, y, z):
    # 数据坐标 (x, y, z) -> Blender 坐标 (x, -z, y)
    return (float(x), float(-z), float(y))


def append_box(verts, faces, xmin, ymin, zmin, xmax, ymax, zmax):
    base = len(verts)
    bx0, bx1 = float(xmin), float(xmax)
    by0, by1 = float(-zmax), float(-zmin)
    bz0, bz1 = float(ymin), float(ymax)

    if bx0 > bx1:
        bx0, bx1 = bx1, bx0
    if by0 > by1:
        by0, by1 = by1, by0
    if bz0 > bz1:
        bz0, bz1 = bz1, bz0

    verts.extend([
        (bx0, by0, bz0),  # 0
        (bx1, by0, bz0),  # 1
        (bx1, by1, bz0),  # 2
        (bx0, by1, bz0),  # 3
        (bx0, by0, bz1),  # 4
        (bx1, by0, bz1),  # 5
        (bx1, by1, bz1),  # 6
        (bx0, by1, bz1),  # 7
    ])
    faces.extend([
        (base + 0, base + 3, base + 2, base + 1),  # bottom (-Z)
        (base + 4, base + 5, base + 6, base + 7),  # top (+Z)
        (base + 0, base + 1, base + 5, base + 4),  # front (-Y)
        (base + 2, base + 3, base + 7, base + 6),  # back (+Y)
        (base + 0, base + 4, base + 7, base + 3),  # left (-X)
        (base + 1, base + 2, base + 6, base + 5),  # right (+X)
    ])


def append_corners_box(verts, faces, corners_8):
    base = len(verts)
    for pt in corners_8:
        verts.append(map_coord(pt[0], pt[1], pt[2]))
    faces.extend([
        (base + 0, base + 1, base + 2, base + 3),  # bottom
        (base + 4, base + 7, base + 6, base + 5),  # top
        (base + 1, base + 0, base + 4, base + 5),  # side z_min
        (base + 2, base + 1, base + 5, base + 6),  # side x_max
        (base + 3, base + 2, base + 6, base + 7),  # side z_max
        (base + 0, base + 3, base + 7, base + 4),  # side x_min
    ])


def norm_pair(a, b):
    return (a, b) if a < b else (b, a)


def box_all_edge_pairs(base):
    edges = [
        (0, 1), (1, 2), (2, 3), (3, 0),
        (4, 5), (5, 6), (6, 7), (7, 4),
        (0, 4), (1, 5), (2, 6), (3, 7),
    ]
    return [norm_pair(base + a, base + b) for a, b in edges]


def append_box_boundary_marks(marked_pairs, base, b_xmin, b_xmax, b_zmin, b_zmax, is_corners_box=False):
    if not is_corners_box:
        if b_xmin:
            marked_pairs.add(norm_pair(base + 4, base + 7))
            marked_pairs.add(norm_pair(base + 0, base + 3))
            marked_pairs.add(norm_pair(base + 0, base + 4))
            marked_pairs.add(norm_pair(base + 3, base + 7))
        if b_xmax:
            marked_pairs.add(norm_pair(base + 5, base + 6))
            marked_pairs.add(norm_pair(base + 1, base + 2))
            marked_pairs.add(norm_pair(base + 1, base + 5))
            marked_pairs.add(norm_pair(base + 2, base + 6))
        if b_zmin:
            marked_pairs.add(norm_pair(base + 6, base + 7))
            marked_pairs.add(norm_pair(base + 2, base + 3))
            marked_pairs.add(norm_pair(base + 2, base + 6))
            marked_pairs.add(norm_pair(base + 3, base + 7))
        if b_zmax:
            marked_pairs.add(norm_pair(base + 4, base + 5))
            marked_pairs.add(norm_pair(base + 0, base + 1))
            marked_pairs.add(norm_pair(base + 0, base + 4))
            marked_pairs.add(norm_pair(base + 1, base + 5))
    else:
        if b_zmin:
            marked_pairs.add(norm_pair(base + 4, base + 5))
            marked_pairs.add(norm_pair(base + 0, base + 1))
            marked_pairs.add(norm_pair(base + 0, base + 4))
            marked_pairs.add(norm_pair(base + 1, base + 5))
        if b_xmax:
            marked_pairs.add(norm_pair(base + 5, base + 6))
            marked_pairs.add(norm_pair(base + 1, base + 2))
            marked_pairs.add(norm_pair(base + 1, base + 5))
            marked_pairs.add(norm_pair(base + 2, base + 6))
        if b_zmax:
            marked_pairs.add(norm_pair(base + 6, base + 7))
            marked_pairs.add(norm_pair(base + 2, base + 3))
            marked_pairs.add(norm_pair(base + 2, base + 6))
            marked_pairs.add(norm_pair(base + 3, base + 7))
        if b_xmin:
            marked_pairs.add(norm_pair(base + 7, base + 4))
            marked_pairs.add(norm_pair(base + 3, base + 0))
            marked_pairs.add(norm_pair(base + 0, base + 4))
            marked_pairs.add(norm_pair(base + 3, base + 7))


def mark_mesh_edges_and_faces(mesh, marked_pairs, marked_faces=None):
    attr = mesh.attributes.get("freestyle_edge")
    if attr is None:
        attr = mesh.attributes.new(name="freestyle_edge", type="BOOLEAN", domain="EDGE")
    values = []
    for e in mesh.edges:
        v0, v1 = e.vertices[0], e.vertices[1]
        pair = (v0, v1) if v0 < v1 else (v1, v0)
        values.append(pair in marked_pairs)
    attr.data.foreach_set("value", values)

    if marked_faces is not None:
        fattr = mesh.attributes.get("freestyle_face")
        if fattr is None:
            fattr = mesh.attributes.new(name="freestyle_face", type="BOOLEAN", domain="FACE")
        fvals = [i in marked_faces for i in range(len(mesh.polygons))]
        fattr.data.foreach_set("value", fvals)


def create_mesh_object(name, verts, faces, mat=None):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    for block in list(bpy.data.cameras):
        bpy.data.cameras.remove(block)
    for block in list(bpy.data.lights):
        bpy.data.lights.remove(block)
    for block in list(bpy.data.linestyles):
        bpy.data.linestyles.remove(block)


def make_principled_material(name, hex_color, roughness=0.85, metallic=0.0, emission_hex=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    rgba = hex_to_rgba(hex_color)
    mat.diffuse_color = rgba
    if mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                node.inputs[0].default_value = rgba
                if "Roughness" in node.inputs:
                    node.inputs["Roughness"].default_value = roughness
                if "Metallic" in node.inputs:
                    node.inputs["Metallic"].default_value = metallic
                if emission_hex and emission_strength > 0.0:
                    em_rgba = hex_to_rgba(emission_hex)
                    if "Emission Color" in node.inputs:
                        node.inputs["Emission Color"].default_value = em_rgba
                    elif "Emission" in node.inputs:
                        node.inputs["Emission"].default_value = em_rgba
                    if "Emission Strength" in node.inputs:
                        node.inputs["Emission Strength"].default_value = emission_strength
                break
    return mat


def make_paper_material(name, hex_color="#f6f2ea", dark_fac=0.52):
    mat = bpy.data.materials.new(name=name)
    rgba = hex_to_rgba(hex_color)
    mat.diffuse_color = rgba
    if mat.node_tree:
        nt = mat.node_tree
        bsdf = None
        out_node = None
        for node in nt.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                bsdf = node
            elif node.type == 'OUTPUT_MATERIAL':
                out_node = node
        if bsdf and out_node:
            bsdf.inputs[0].default_value = rgba
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = 1.0
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = 0.0
            if "Specular IOR Level" in bsdf.inputs:
                bsdf.inputs["Specular IOR Level"].default_value = 0.0
            dark = nt.nodes.new('ShaderNodeBsdfDiffuse')
            dark.inputs['Color'].default_value = (0.0, 0.0, 0.0, 1.0)
            dark.inputs['Roughness'].default_value = 1.0
            mix = nt.nodes.new('ShaderNodeMixShader')
            mix.inputs['Fac'].default_value = dark_fac
            nt.links.new(dark.outputs['BSDF'], mix.inputs[1])
            nt.links.new(bsdf.outputs['BSDF'], mix.inputs[2])
            nt.links.new(mix.outputs['Shader'], out_node.inputs['Surface'])
    return mat


def set_camera_look_at(cam_obj, pos_data, target_data, lens_mm):
    pos_b = Vector(map_coord(*pos_data))
    target_b = Vector(map_coord(*target_data))
    cam_obj.location = pos_b
    direction = target_b - pos_b
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    cam_obj.data.lens = float(lens_mm)
    cam_obj.data.clip_start = 0.5
    cam_obj.data.clip_end = 5000.0


def build_cell_grp_map(data):
    cell_grp_map = {}
    for c in data["cells"]:
        cell_grp_map[(round(c["xc"]), round(c["zc"]))] = c["grp"]
    return cell_grp_map


def get_cell_boundary_flags(cell_grp_map, xc, zc, grp):
    b_xmin = cell_grp_map.get((xc - 7, zc)) != grp
    b_xmax = cell_grp_map.get((xc + 7, zc)) != grp
    b_zmin = cell_grp_map.get((xc, zc - 7)) != grp
    b_zmax = cell_grp_map.get((xc, zc + 7)) != grp
    return b_xmin, b_xmax, b_zmin, b_zmax


def add_streamlined_nose(verts, faces, marks, x_front, x_join, y_bot, y_top, z_min, z_max, is_east=True):
    # 流线型车头斜切楔形体：底宽略收，顶面斜切下压
    base = len(verts)
    zc = 0.5 * (z_min + z_max)
    zw_half = 0.35 * (z_max - z_min)
    y_nose_bot = y_bot + 0.15
    y_nose_tip = y_bot + 1.35

    # Join Cross-Section (4 pts) and Front Tip (4 pts)
    if is_east:
        x0, x1 = x_join, x_front
        pts = [
            (x0, y_bot, z_min), (x1, y_nose_bot, zc - zw_half),
            (x1, y_nose_bot, zc + zw_half), (x0, y_bot, z_max),
            (x0, y_top, z_min), (x1, y_nose_tip, zc - zw_half),
            (x1, y_nose_tip, zc + zw_half), (x0, y_top, z_max),
        ]
    else:
        x0, x1 = x_front, x_join
        pts = [
            (x0, y_nose_bot, zc - zw_half), (x1, y_bot, z_min),
            (x1, y_bot, z_max), (x0, y_nose_bot, zc + zw_half),
            (x0, y_nose_tip, zc - zw_half), (x1, y_top, z_min),
            (x1, y_top, z_max), (x0, y_nose_tip, zc + zw_half),
        ]
    append_corners_box(verts, faces, pts)
    marks.update(box_all_edge_pairs(base))


def build_train_objects(data):
    tz = float(data["trainTrack"]["tz"])  # 16.5 (从 HZ.tracks(HZ.YARDS.S)[0] 读取)
    deck_top = float(data["trainTrack"].get("deckTop", 12.5))
    y_rail = deck_top + 0.5  # 13.0 (在轨枕/轨道梁之上)
    y_bot = y_rail + 0.2     # 13.2
    y_top = y_bot + 3.7      # 16.9 (高 3.7m)
    half_w = 3.3 / 2.0       # 宽 3.3m -> 1.65m
    z0, z1 = tz - half_w, tz + half_w

    body_verts, body_faces, body_marks = [], [], set()
    win_verts, win_faces, win_marks = [], [], set()
    light_verts, light_faces, light_marks = [], [], set()

    # 8 节编组，总长约 200m，车头 x ≈ -255m，车尾向西延伸至 -455m
    num_cars = 8
    pitch = 25.0
    car_len = 24.3
    nose_len = 5.5
    head_x = -255.0

    for i in range(num_cars):
        cx_max = head_x - i * pitch
        cx_min = cx_max - car_len

        if i == 0:
            # 东端首车：流线型车头在 [cx_max - nose_len, cx_max]
            bx_min, bx_max = cx_min, cx_max - nose_len
            base = len(body_verts)
            append_box(body_verts, body_faces, bx_min, y_bot, z0, bx_max, y_top, z1)
            body_marks.update(box_all_edge_pairs(base))
            add_streamlined_nose(body_verts, body_faces, body_marks, cx_max, bx_max, y_bot, y_top, z0, z1, is_east=True)
            # 驾驶室前窗 + 车头大灯
            wbase = len(win_verts)
            append_box(win_verts, win_faces, cx_max - 3.6, y_bot + 1.75, z0 - 0.03, cx_max - 1.2, y_bot + 2.65, z1 + 0.03)
            win_marks.update(box_all_edge_pairs(wbase))
            lbase = len(light_verts)
            append_box(light_verts, light_faces, cx_max - 0.6, y_bot + 0.9, z0 + 0.25, cx_max + 0.1, y_bot + 1.35, z1 - 0.25)
            light_marks.update(box_all_edge_pairs(lbase))
        elif i == num_cars - 1:
            # 西端尾车
            bx_min, bx_max = cx_min + nose_len, cx_max
            base = len(body_verts)
            append_box(body_verts, body_faces, bx_min, y_bot, z0, bx_max, y_top, z1)
            body_marks.update(box_all_edge_pairs(base))
            add_streamlined_nose(body_verts, body_faces, body_marks, cx_min, bx_min, y_bot, y_top, z0, z1, is_east=False)
        else:
            bx_min, bx_max = cx_min, cx_max
            base = len(body_verts)
            append_box(body_verts, body_faces, bx_min, y_bot, z0, bx_max, y_top, z1)
            body_marks.update(box_all_edge_pairs(base))

        # 车顶浅凸空调导流带（增加列车立体细节）
        rbase = len(body_verts)
        append_box(body_verts, body_faces, bx_min + 1.5, y_top, tz - 0.95, bx_max - 1.5, y_top + 0.22, tz + 0.95)
        body_marks.update(box_all_edge_pairs(rbase))

        # 侧窗深色长带（车体两侧突出 0.04m 防止共面闪烁）
        wbase = len(win_verts)
        append_box(win_verts, win_faces, bx_min + 0.8, y_bot + 1.65, z0 - 0.05, bx_max - 0.8, y_bot + 2.55, z1 + 0.05)
        win_marks.update(box_all_edge_pairs(wbase))

        # 转向架/裙板深色底座
        b1 = len(win_verts)
        append_box(win_verts, win_faces, bx_min + 1.5, y_rail, z0 + 0.2, bx_min + 4.5, y_bot, z1 - 0.2)
        win_marks.update(box_all_edge_pairs(b1))
        b2 = len(win_verts)
        append_box(win_verts, win_faces, bx_max - 4.5, y_rail, z0 + 0.2, bx_max - 1.5, y_bot, z1 - 0.2)
        win_marks.update(box_all_edge_pairs(b2))

        # 车厢风挡连接处（深色）
        if i < num_cars - 1:
            cbase = len(win_verts)
            append_box(win_verts, win_faces, cx_min - (pitch - car_len), y_bot + 0.15, z0 + 0.15, cx_min, y_top - 0.15, z1 - 0.15)
            win_marks.update(box_all_edge_pairs(cbase))

    obj_body = create_mesh_object("train_body", body_verts, body_faces)
    mark_mesh_edges_and_faces(obj_body.data, body_marks)

    obj_win = create_mesh_object("train_window", win_verts, win_faces)
    mark_mesh_edges_and_faces(obj_win.data, win_marks)

    obj_light = create_mesh_object("train_headlight", light_verts, light_faces)
    mark_mesh_edges_and_faces(obj_light.data, light_marks)

    return {
        "train_body": obj_body,
        "train_window": obj_win,
        "train_headlight": obj_light,
    }


def build_night_light_strips(data):
    verts, faces, marks = [], [], set()

    # 1. 候车层发光体（高架候车厅内部通透暖光核心，从窗带与柱廊透出）
    for z_range in ((-110.0, -18.0), (18.0, 125.0)):
        base = len(verts)
        append_box(verts, faces, -120.0, 15.5, z_range[0], 120.0, 31.0, z_range[1])
        marks.update(box_all_edge_pairs(base))

    # 2. 云门轮廓灯带（门洞内框、外框顶部与立面竖向灯带）
    # 顶部冠部灯带
    for z_pos in (177.2, 238.8):
        base = len(verts)
        append_box(verts, faces, -90.5, 78.5, z_pos - 0.4, 90.5, 80.3, z_pos + 0.4)
        marks.update(box_all_edge_pairs(base))
        # 门洞横梁灯带
        base = len(verts)
        append_box(verts, faces, -38.5, 49.2, z_pos - 0.4, 38.5, 50.8, z_pos + 0.4)
        marks.update(box_all_edge_pairs(base))
        # 门洞两侧竖向轮廓灯带
        for x_pos in (-38.2, 38.2, -90.2, 90.2):
            base = len(verts)
            y_hi = 50.0 if abs(x_pos) < 50 else 80.0
            append_box(verts, faces, x_pos - 0.5, 0.5, z_pos - 0.4, x_pos + 0.5, y_hi, z_pos + 0.4)
            marks.update(box_all_edge_pairs(base))

    # 3. 站前地面灯带与高架引桥灯轨
    for z_plaza in (155.0, 168.0, 250.0, 270.0):
        base = len(verts)
        append_box(verts, faces, -160.0, -0.7, z_plaza - 0.8, 160.0, 0.2, z_plaza + 0.8)
        marks.update(box_all_edge_pairs(base))
    for x_plaza in (-85.0, -40.0, 0.0, 40.0, 85.0):
        base = len(verts)
        append_box(verts, faces, x_plaza - 0.8, -0.7, 140.0, x_plaza + 0.8, 0.2, 310.0)
        marks.update(box_all_edge_pairs(base))

    # 东西咽喉区股道灯带（列车灯点与进站灯轨）
    for tz_val in (-95.0, -65.0, -35.0, 16.5, 48.0, 80.0, 110.0):
        base = len(verts)
        append_box(verts, faces, -520.0, 13.0, tz_val - 0.5, 520.0, 13.8, tz_val + 0.5)
        marks.update(box_all_edge_pairs(base))

    obj_strips = create_mesh_object("night_light_strips", verts, faces)
    mark_mesh_edges_and_faces(obj_strips.data, marks)
    return obj_strips


def build_shot_geometry(shot_name, data, cell_grp_map):
    clear_scene()
    objs = {}

    # 通用提升器
    l_verts, l_faces, l_marks = [], [], set()
    for l in data["lifters"]:
        lx, lz, ltop = float(l["x"]), float(l["z"]), float(l["top"])
        base = len(l_verts)
        append_box(l_verts, l_faces, lx - 1.6, 0.0, lz - 1.6, lx + 1.6, ltop, lz + 1.6)
        l_marks.update(box_all_edge_pairs(base))
        base = len(l_verts)
        append_box(l_verts, l_faces, lx - 2.3, ltop, lz - 2.3, lx + 2.3, ltop + 2.2, lz + 2.3)
        l_marks.update(box_all_edge_pairs(base))
    obj_lifters = create_mesh_object("lifters", l_verts, l_faces)
    mark_mesh_edges_and_faces(obj_lifters.data, l_marks)
    objs["lifters"] = obj_lifters

    # 地面
    gz = -0.85
    g_verts = [
        map_coord(-900.0, gz, -700.0),
        map_coord( 900.0, gz, -700.0),
        map_coord( 900.0, gz,  700.0),
        map_coord(-900.0, gz,  700.0),
    ]
    g_faces = [(0, 3, 2, 1)]
    objs["ground"] = create_mesh_object("ground", g_verts, g_faces)

    # 分类静态盒桶：found, conc (含conc/slab/plat/metro), steel, glass (含glass/todG/ymG), ym (含ym/todB)
    buckets = {
        "found": ([], [], set(), set()),
        "conc":  ([], [], set(), set()),
        "steel": ([], [], set(), set()),
        "glass": ([], [], set(), set()),
        "ym":    ([], [], set(), set()),
    }

    def pick_bucket(mat_name):
        if mat_name == "found":
            return "found"
        elif mat_name in ("conc", "slab", "plat", "metro"):
            return "conc"
        elif mat_name in ("glass", "todG", "ymG"):
            return "glass"
        elif mat_name in ("ym", "todB"):
            return "ym"
        return "steel"

    if shot_name == "lift":
        # 1) grp == 0 的静态盒
        for b in data["boxes"]:
            if b.get("grp", 0) != 0:
                continue
            mn, mx = b["min"], b["max"]
            bkey = pick_bucket(b.get("mat"))
            verts, faces, marks, rfaces = buckets[bkey]
            base = len(verts)
            fbase = len(faces)
            append_box(verts, faces, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2])
            dx, dz = abs(mx[0] - mn[0]), abs(mx[2] - mn[2])
            xc, zc = round((mn[0] + mx[0]) / 2), round((mn[2] + mx[2]) / 2)
            if b.get("mat") == "steel" and dx > 6.0 and dz > 6.0 and (xc, zc) in cell_grp_map:
                b_xmin, b_xmax, b_zmin, b_zmax = get_cell_boundary_flags(cell_grp_map, xc, zc, 0)
                append_box_boundary_marks(marks, base, b_xmin, b_xmax, b_zmin, b_zmax, is_corners_box=False)
                for fi in range(fbase, fbase + 6):
                    rfaces.add(fi)
            else:
                marks.update(box_all_edge_pairs(base))

        # 2) mid.boxes (t=643)
        boxes_14_meta = [b for b in data["boxes"] if b.get("grp", 0) in (1, 2, 3, 4)]
        for idx, b in enumerate(data["mid"]["boxes"]):
            corners = b["corners"]
            orig_b = boxes_14_meta[idx]
            mn, mx = orig_b["min"], orig_b["max"]
            grp = b.get("grp", 0)
            bkey = pick_bucket(b.get("mat"))
            verts, faces, marks, rfaces = buckets[bkey]
            base = len(verts)
            fbase = len(faces)
            append_corners_box(verts, faces, corners)
            dx, dz = abs(mx[0] - mn[0]), abs(mx[2] - mn[2])
            xc, zc = round((mn[0] + mx[0]) / 2), round((mn[2] + mx[2]) / 2)
            if b.get("mat") == "steel" and dx > 6.0 and dz > 6.0 and (xc, zc) in cell_grp_map:
                b_xmin, b_xmax, b_zmin, b_zmax = get_cell_boundary_flags(cell_grp_map, xc, zc, grp)
                append_box_boundary_marks(marks, base, b_xmin, b_xmax, b_zmin, b_zmax, is_corners_box=True)
                for fi in range(fbase, fbase + 6):
                    rfaces.add(fi)
            else:
                for fi in range(fbase, fbase + 6):
                    rfaces.add(fi)

        for bkey, (verts, faces, marks, rfaces) in buckets.items():
            if not verts:
                continue
            obj = create_mesh_object(f"boxes_{bkey}", verts, faces)
            mark_mesh_edges_and_faces(obj.data, marks, rfaces if rfaces else None)
            objs[f"boxes_{bkey}"] = obj

        # 3) mid.cells 按 quad 建封闭薄板，顶面抬高 +1.2m 使分区色块高于包络盒顶面
        for grp_id in ("1", "2", "3", "4"):
            ac_verts, ac_faces, marked_pairs = [], [], set()
            for idx, c in enumerate(data["mid"]["cells"]):
                if str(c["grp"]) != grp_id:
                    continue
                base = len(ac_verts)
                top_quad = [[pt[0], pt[1] + 1.2, pt[2]] for pt in c["quad"]]
                bot_quad = [[pt[0], pt[1] - 0.8, pt[2]] for pt in c["quad"]]
                append_corners_box(ac_verts, ac_faces, bot_quad + top_quad)
                orig_c = data["cells"][idx]
                xc, zc = round(orig_c["xc"]), round(orig_c["zc"])
                b_xmin, b_xmax, b_zmin, b_zmax = get_cell_boundary_flags(cell_grp_map, xc, zc, c["grp"])
                append_box_boundary_marks(marked_pairs, base, b_xmin, b_xmax, b_zmin, b_zmax, is_corners_box=True)
            obj = create_mesh_object(f"roof_grp_{grp_id}", ac_verts, ac_faces)
            mark_mesh_edges_and_faces(obj.data, marked_pairs, set(range(len(ac_faces))))
            objs[f"roof_grp_{grp_id}"] = obj

    else:
        # roof / train / night 均使用成品态静态盒 (t=660)
        for b in data["boxes"]:
            mn, mx = b["min"], b["max"]
            grp = b.get("grp", 0)
            bkey = pick_bucket(b.get("mat"))
            verts, faces, marks, rfaces = buckets[bkey]
            base = len(verts)
            fbase = len(faces)
            append_box(verts, faces, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2])
            dx, dz = abs(mx[0] - mn[0]), abs(mx[2] - mn[2])
            xc, zc = round((mn[0] + mx[0]) / 2), round((mn[2] + mx[2]) / 2)
            is_roof_cell_box = (
                b.get("mat") == "steel"
                and dx > 6.0
                and dz > 6.0
                and (xc, zc) in cell_grp_map
            )
            if is_roof_cell_box:
                b_xmin, b_xmax, b_zmin, b_zmax = get_cell_boundary_flags(cell_grp_map, xc, zc, grp)
                append_box_boundary_marks(marks, base, b_xmin, b_xmax, b_zmin, b_zmax, is_corners_box=False)
                for fi in range(fbase, fbase + 6):
                    rfaces.add(fi)
            elif grp in (1, 2, 3, 4):
                for fi in range(fbase, fbase + 6):
                    rfaces.add(fi)
            else:
                marks.update(box_all_edge_pairs(base))

        for bkey, (verts, faces, marks, rfaces) in buckets.items():
            if not verts:
                continue
            obj = create_mesh_object(f"boxes_{bkey}", verts, faces)
            mark_mesh_edges_and_faces(obj.data, marks, rfaces if rfaces else None)
            objs[f"boxes_{bkey}"] = obj

        if shot_name == "roof":
            # S-401 屋面合拢 (t=740)：
            # 1) 遍历 roof740.boxes（94 sky + 83 clad = 177 盒），按屋面曲面贴合出天窗带与铝板条带
            # 同时利用 roof740.boxes 的水平范围对屋面网格细分展示十字天窗、已铺铝板与未合拢北翼骨架
            r740_boxes = data["roof740"]["boxes"]
            sky_boxes = [b for b in r740_boxes if b.get("src") == "sky"]
            clad_boxes = [b for b in r740_boxes if b.get("src") == "clad"]

            sky_verts, sky_faces, sky_marks = [], [], set()
            clad_verts, clad_faces, clad_marks = [], [], set()

            # 为使曲面起伏（云谷波浪）与十字采光顶清晰可读，将每个铺装格对应到 roof740.boxes
            for c in data["cells"]:
                xc, zc = float(c["xc"]), float(c["zc"])
                y_top = float(c["yTop"])
                in_sky = any(
                    b["min"][0] <= xc <= b["max"][0] and b["min"][2] <= zc <= b["max"][2]
                    for b in sky_boxes
                )
                in_clad = any(
                    b["min"][0] <= xc <= b["max"][0] and b["min"][2] <= zc <= b["max"][2]
                    for b in clad_boxes
                )
                if in_sky:
                    base = len(sky_verts)
                    append_box(
                        sky_verts, sky_faces,
                        c["xa"] + 0.15, y_top + 0.6, c["za"] + 0.15,
                        c["xb"] - 0.15, y_top + 1.85, c["zb"] - 0.15
                    )
                    # 拱形天窗标出网格边，体现采光顶玻璃分格
                    sky_marks.update(box_all_edge_pairs(base))
                elif in_clad:
                    base = len(clad_verts)
                    # 金属屋面浅灰带细横向分割线（沿 z 留细缝）
                    append_box(
                        clad_verts, clad_faces,
                        c["xa"], y_top + 0.4, c["za"] + 0.12,
                        c["xb"], y_top + 1.45, c["zb"] - 0.12
                    )
                    # 仅在分区边界或铺装前沿（z > 138）标记墨线，保持铝板屋面干净且有铺装推进前沿线
                    b_xmin, b_xmax, b_zmin, b_zmax = get_cell_boundary_flags(cell_grp_map, round(xc), round(zc), c["grp"])
                    if zc >= 139:
                        b_zmax = True
                    if abs(xc) <= 15 or abs(zc) <= 15:
                        # 贴近十字天窗交界边也描线
                        if abs(xc - (-14)) < 2:
                            b_xmax = True
                        if abs(xc - 14) < 2:
                            b_xmin = True
                        if abs(zc - (-14)) < 2:
                            b_zmax = True
                        if abs(zc - 14) < 2:
                            b_zmin = True
                    append_box_boundary_marks(clad_marks, base, b_xmin, b_xmax, b_zmin, b_zmax, is_corners_box=False)

            obj_sky = create_mesh_object("roof740_sky", sky_verts, sky_faces)
            mark_mesh_edges_and_faces(obj_sky.data, sky_marks, set(range(len(sky_faces))))
            objs["roof740_sky"] = obj_sky

            obj_clad = create_mesh_object("roof740_clad", clad_verts, clad_faces)
            mark_mesh_edges_and_faces(obj_clad.data, clad_marks, set(range(len(clad_faces))))
            objs["roof740_clad"] = obj_clad

            # 未被 roof740.boxes 覆盖的 37 个屋盖结构格（北侧 z > 145 待合拢区），画镂空钢桁架框
            uc_verts, uc_faces, uc_marks = [], [], set()
            for c in data["roof740"]["cells"]:
                y_top = float(c["yTop"])
                xa, xb, za, zb = float(c["xa"]), float(c["xb"]), float(c["za"]), float(c["zb"])
                beam_w = 0.55
                # 四周钢梁框，露出内部镂空待合拢状态
                for b_coords in (
                    (xa, y_top + 0.2, za, xb, y_top + 1.25, za + beam_w),
                    (xa, y_top + 0.2, zb - beam_w, xb, y_top + 1.25, zb),
                    (xa, y_top + 0.2, za, xa + beam_w, y_top + 1.25, zb),
                    (xb - beam_w, y_top + 0.2, za, xb, y_top + 1.25, zb),
                ):
                    base = len(uc_verts)
                    append_box(uc_verts, uc_faces, *b_coords)
                    uc_marks.update(box_all_edge_pairs(base))
            obj_uc = create_mesh_object("roof740_uncovered_cells", uc_verts, uc_faces)
            mark_mesh_edges_and_faces(obj_uc.data, uc_marks)
            objs["roof740_uncovered_cells"] = obj_uc

        else:
            # train 与 night：成品态屋盖 + 十字采光顶
            sky_boxes = [b for b in data["roof740"]["boxes"] if b.get("src") == "sky"]
            sky_verts, sky_faces, sky_marks = [], [], set()

            for grp_id in ("1", "2", "3", "4"):
                c_verts, c_faces, marked_pairs = [], [], set()
                for c in data["cells"]:
                    if str(c["grp"]) != grp_id:
                        continue
                    xc, zc = float(c["xc"]), float(c["zc"])
                    y_top = float(c["yTop"])
                    in_sky = any(
                        b["min"][0] <= xc <= b["max"][0] and b["min"][2] <= zc <= b["max"][2]
                        for b in sky_boxes
                    )
                    if in_sky:
                        sbase = len(sky_verts)
                        append_box(
                            sky_verts, sky_faces,
                            c["xa"] + 0.15, y_top + 0.55, c["za"] + 0.15,
                            c["xb"] - 0.15, y_top + 1.65, c["zb"] - 0.15
                        )
                        sky_marks.update(box_all_edge_pairs(sbase))
                    base = len(c_verts)
                    append_box(
                        c_verts, c_faces,
                        c["xa"], y_top - 0.2, c["za"],
                        c["xb"], y_top + 1.2, c["zb"]
                    )
                    b_xmin, b_xmax, b_zmin, b_zmax = get_cell_boundary_flags(cell_grp_map, round(xc), round(zc), c["grp"])
                    append_box_boundary_marks(marked_pairs, base, b_xmin, b_xmax, b_zmin, b_zmax, is_corners_box=False)
                obj = create_mesh_object(f"roof_grp_{grp_id}", c_verts, c_faces)
                mark_mesh_edges_and_faces(obj.data, marked_pairs, set(range(len(c_faces))))
                objs[f"roof_grp_{grp_id}"] = obj

            if sky_verts:
                obj_sky = create_mesh_object("roof_skylight", sky_verts, sky_faces)
                mark_mesh_edges_and_faces(obj_sky.data, sky_marks, set(range(len(sky_faces))))
                objs["roof_skylight"] = obj_sky

    if shot_name == "train":
        train_objs = build_train_objects(data)
        objs.update(train_objs)

    if shot_name == "night":
        objs["night_light_strips"] = build_night_light_strips(data)

    return objs


def assign_mat(obj, mat):
    if obj is None or mat is None:
        return
    if len(obj.data.materials) == 0:
        obj.data.materials.append(mat)
    else:
        obj.data.materials[0] = mat


def setup_world_gradient(scene, horizon_hex, zenith_hex, ground_hex, strength=0.85, fog_density=0.0):
    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    world = scene.world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()

    out_node = nt.nodes.new("ShaderNodeOutputWorld")
    bg_node = nt.nodes.new("ShaderNodeBackground")
    bg_node.inputs["Strength"].default_value = strength

    tex_coord = nt.nodes.new("ShaderNodeTexCoord")
    sep_xyz = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")

    # Generated Z: 0.0 (ground) -> 0.5 (horizon) -> 1.0 (zenith)
    elts = ramp.color_ramp.elements
    elts[0].position = 0.42
    elts[0].color = hex_to_rgba(ground_hex)
    e_mid = elts.new(0.51)
    e_mid.color = hex_to_rgba(horizon_hex)
    elts[-1].position = 0.85
    elts[-1].color = hex_to_rgba(zenith_hex)

    nt.links.new(tex_coord.outputs["Generated"], sep_xyz.inputs["Vector"])
    nt.links.new(sep_xyz.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg_node.inputs["Color"])
    nt.links.new(bg_node.outputs["Background"], out_node.inputs["Surface"])


def setup_freestyle(scene, enabled, line_hex="#1d1a17", thickness=1.35):
    scene.render.use_freestyle = enabled
    vl = bpy.context.view_layer
    vl.use_freestyle = enabled
    if not enabled:
        return

    scene.render.line_thickness_mode = 'ABSOLUTE'
    scene.render.line_thickness = 1.0

    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(70.0)

    for block in list(bpy.data.linestyles):
        bpy.data.linestyles.remove(block)

    line_rgb = hex_to_rgba(line_hex)[:3]
    linestyle = bpy.data.linestyles.new("InkLineStyle")
    linestyle.color = line_rgb
    linestyle.thickness = thickness

    while len(fs.linesets) > 0:
        fs.linesets.remove(fs.linesets[0])

    # 线集 1：主体构件（Silhouette + Crease + Edge Mark）
    ls_body = fs.linesets.new("Body_Silhouette_Crease")
    ls_body.linestyle = linestyle
    ls_body.select_by_visibility = True
    ls_body.visibility = 'VISIBLE'
    ls_body.select_by_edge_types = True
    ls_body.select_silhouette = True
    ls_body.select_crease = True
    ls_body.select_border = False
    ls_body.select_edge_mark = True
    ls_body.select_by_face_marks = True
    ls_body.face_mark_negation = 'EXCLUSIVE'
    ls_body.face_mark_condition = 'BOTH'

    # 线集 2：屋盖网格与天窗只描标记边（Edge Mark）
    ls_roof = fs.linesets.new("Roof_Contour_Zone_Boundary")
    ls_roof.linestyle = linestyle
    ls_roof.select_by_visibility = True
    ls_roof.visibility = 'VISIBLE'
    ls_roof.select_by_edge_types = True
    ls_roof.select_silhouette = False
    ls_roof.select_crease = False
    ls_roof.select_border = False
    ls_roof.select_edge_mark = True
    ls_roof.select_by_face_marks = True
    ls_roof.face_mark_negation = 'INCLUSIVE'
    ls_roof.face_mark_condition = 'ONE'


def clear_lights():
    for obj in list(bpy.data.objects):
        if obj.type == 'LIGHT':
            bpy.data.objects.remove(obj, do_unlink=True)
    for block in list(bpy.data.lights):
        bpy.data.lights.remove(block)


def add_sun_light(name, energy, rot_euler, hex_color="#ffffff", use_shadow=True, angle_deg=1.5):
    ldata = bpy.data.lights.new(name=name, type='SUN')
    ldata.energy = energy
    ldata.color = hex_to_rgba(hex_color)[:3]
    ldata.use_shadow = use_shadow
    if hasattr(ldata, "angle"):
        ldata.angle = math.radians(angle_deg)
    lobj = bpy.data.objects.new(name=name, object_data=ldata)
    bpy.context.collection.objects.link(lobj)
    lobj.rotation_euler = rot_euler
    return lobj


def configure_style(scene, objs, shot_name, style_name):
    clear_lights()

    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'

    scene.eevee.taa_render_samples = 64
    if hasattr(scene.eevee, "use_gtao"):
        scene.eevee.use_gtao = True
        if hasattr(scene.eevee, "gtao_distance"):
            scene.eevee.gtao_distance = 10.0
        if hasattr(scene.eevee, "gtao_factor"):
            scene.eevee.gtao_factor = 1.2

    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'

    is_night = (shot_name == "night")

    # ================= 1. 白模 (CLAY) =================
    if style_name == "clay":
        setup_freestyle(scene, False)
        try:
            scene.view_settings.view_transform = 'Filmic'
        except TypeError:
            pass
        scene.view_settings.exposure = 0.0

        if not is_night:
            # v2 已验证的 clay 口径（分区淡色、钢灰、提升器红、柔光+阴影）
            setup_world_gradient(scene, "#c3ccd6", "#b5c0cc", "#a8b0a4", strength=0.65)
            add_sun_light("Sun_Main", 4.0, (1.05, 0.15, -0.65), "#fffdf8", use_shadow=True, angle_deg=1.5)
            add_sun_light("Sun_Fill", 0.55, (0.9, -0.2, 2.6), "#e8f0f8", use_shadow=False)

            mat_found = make_principled_material("clay_found", "#a79b87", roughness=0.85)
            mat_conc = make_principled_material("clay_conc", "#868c94", roughness=0.85)
            mat_steel = make_principled_material("clay_steel", "#6f757d", roughness=0.85)
            mat_ym = make_principled_material("clay_ym", "#7f8792", roughness=0.85)
            mat_glass = make_principled_material("clay_glass", "#8da6bd", roughness=0.65)
            mat_lifter = make_principled_material("clay_lifter", "#a83c2c", roughness=0.85)
            mat_ground = make_principled_material("clay_ground", "#8f9484", roughness=0.88)

            grp_colors = {
                "1": "#8fa3c4",
                "2": "#93b8ab",
                "3": "#cfa586",
                "4": "#b3c493",
            }
            for k, v in grp_colors.items():
                if f"roof_grp_{k}" in objs:
                    assign_mat(objs[f"roof_grp_{k}"], make_principled_material(f"clay_grp_{k}", v, roughness=0.85))
            if "roof_skylight" in objs:
                assign_mat(objs["roof_skylight"], make_principled_material("clay_skylight", "#a2bfd9", roughness=0.55))

            if shot_name == "roof":
                mat_r740_clad = make_principled_material("clay_r740_clad", "#d9d6ce", roughness=0.82)
                assign_mat(objs.get("roof740_sky"), make_principled_material("clay_r740_sky", "#7aa8cc", roughness=0.65))
                assign_mat(objs.get("roof740_clad"), mat_r740_clad)
                assign_mat(objs.get("roof740_uncovered_cells"), make_principled_material("clay_r740_uc", "#555c65", roughness=0.85))
                mat_lifter = mat_r740_clad

            if shot_name == "train":
                mat_r740_clad = make_principled_material("clay_r740_clad", "#d9d6ce", roughness=0.82)
                assign_mat(objs.get("train_body"), make_principled_material("clay_train_body", "#e8ecf0", roughness=0.75))
                assign_mat(objs.get("train_window"), make_principled_material("clay_train_win", "#38424d", roughness=0.6))
                assign_mat(objs.get("train_headlight"), make_principled_material("clay_train_light", "#f5d78e", roughness=0.5))
                mat_lifter = mat_r740_clad

            assign_mat(objs.get("boxes_found"), mat_found)
            assign_mat(objs.get("boxes_conc"), mat_conc)
            assign_mat(objs.get("boxes_steel"), mat_steel)
            assign_mat(objs.get("boxes_ym"), mat_ym)
            assign_mat(objs.get("boxes_glass"), mat_glass)
            assign_mat(objs.get("lifters"), mat_lifter)
            assign_mat(objs.get("ground"), mat_ground)

        else:
            # night 白模：月光 clay（深蓝冷调夜空 + 清冷月光主光 + 候车厅/云门暖白微光呼应）
            # 第三轮迭代：环境光/世界强度在第二轮基础上 ×2.5 (strength: 0.65 -> 1.625, Moon_Main: 2.6 -> 6.5, Moon_Fill: 0.45 -> 1.125)；配楼发光带 (boxes_glass) emission 强度改为第一轮 (1.8) 的 0.35 倍 (= 0.63)
            scene.view_settings.exposure = 0.5
            setup_world_gradient(scene, "#1c2b42", "#0f1829", "#141d2b", strength=1.625)
            add_sun_light("Moon_Main", 6.5, (0.98, 0.18, -0.72), "#9bbef5", use_shadow=True, angle_deg=2.0)
            add_sun_light("Moon_Fill", 1.125, (0.85, -0.25, 2.5), "#6b88b8", use_shadow=False)

            mat_found = make_principled_material("nclay_found", "#4e5663", roughness=0.85)
            mat_conc = make_principled_material("nclay_conc", "#465266", roughness=0.85)
            mat_steel = make_principled_material("nclay_steel", "#3b4659", roughness=0.85)
            mat_ym = make_principled_material("nclay_ym", "#52627a", roughness=0.85)
            mat_glass = make_principled_material("nclay_glass", "#ffd28a", roughness=0.75, emission_hex="#ffcf82", emission_strength=0.63)
            mat_lifter = make_principled_material("nclay_lifter", "#8c382b", roughness=0.85)
            mat_ground = make_principled_material("nclay_ground", "#283242", roughness=0.9)

            grp_colors_night = {
                "1": "#587094",
                "2": "#587d75",
                "3": "#8c6e58",
                "4": "#6e825a",
            }
            for k, v in grp_colors_night.items():
                if f"roof_grp_{k}" in objs:
                    assign_mat(objs[f"roof_grp_{k}"], make_principled_material(f"nclay_grp_{k}", v, roughness=0.85))
            if "roof_skylight" in objs:
                assign_mat(objs["roof_skylight"], make_principled_material("nclay_sky", "#ffe0a3", roughness=0.7, emission_hex="#ffd485", emission_strength=2.2))
            if "night_light_strips" in objs:
                assign_mat(objs["night_light_strips"], make_principled_material("nclay_strips", "#ffdfa0", roughness=0.7, emission_hex="#ffd27d", emission_strength=2.8))

            assign_mat(objs.get("boxes_found"), mat_found)
            assign_mat(objs.get("boxes_conc"), mat_conc)
            assign_mat(objs.get("boxes_steel"), mat_steel)
            assign_mat(objs.get("boxes_ym"), mat_ym)
            assign_mat(objs.get("boxes_glass"), mat_glass)
            assign_mat(objs.get("lifters"), mat_lifter)
            assign_mat(objs.get("ground"), mat_ground)

    # ================= 2. 墨线 (INK) =================
    elif style_name == "ink":
        try:
            scene.view_settings.view_transform = 'Standard'
        except TypeError:
            pass
        scene.view_settings.exposure = 0.0

        if not is_night:
            # 昼景墨线：纸面 #f6f2ea 底、墨线 #1d1a17
            setup_freestyle(scene, True, line_hex="#1d1a17", thickness=1.35)
            setup_world_gradient(scene, "#f6f2ea", "#f6f2ea", "#f6f2ea", strength=1.0)
            add_sun_light("Sun_Main", 3.8, (1.05, 0.15, -0.65), "#ffffff", use_shadow=True, angle_deg=1.5)
            add_sun_light("Sun_Fill", 0.65, (0.9, -0.2, 2.6), "#ffffff", use_shadow=False)

            mat_paper = make_paper_material("ink_paper", "#f6f2ea", dark_fac=0.53)
            mat_paper_ground = make_paper_material("ink_ground", "#f6f2ea", dark_fac=0.50)
            mat_paper_accent = make_paper_material("ink_accent", "#eae3d5", dark_fac=0.55)
            mat_paper_dark = make_paper_material("ink_dark", "#cfc8ba", dark_fac=0.58)

            for k, obj in objs.items():
                if k == "ground":
                    assign_mat(obj, mat_paper_ground)
                elif k in ("roof740_sky", "roof_skylight"):
                    assign_mat(obj, mat_paper_accent)
                elif k in ("train_window", "roof740_uncovered_cells"):
                    assign_mat(obj, mat_paper_dark)
                else:
                    assign_mat(obj, mat_paper)
        else:
            # night 墨线：深蓝纸面白线（蓝晒/夜景建筑制图风：深蓝底 #131e30 + 暖白/银白墨线 #e8eef5 + 亮灯处暖金墨韵）
            # 第三轮迭代：环境光/世界强度在第二轮基础上 ×2.5 (strength: 1.0 -> 2.5, Moon_Main: 2.5 -> 6.25, Moon_Fill: 0.6 -> 1.5)；配楼发光带 (boxes_glass) emission 强度改为第一轮 (1.6) 的 0.35 倍 (= 0.56)
            scene.view_settings.exposure = 0.5
            setup_freestyle(scene, True, line_hex="#e6edf5", thickness=1.3)
            setup_world_gradient(scene, "#131e30", "#0d1524", "#131e30", strength=2.5)
            add_sun_light("Moon_Main", 6.25, (1.05, 0.15, -0.65), "#b8d0f0", use_shadow=True, angle_deg=1.8)
            add_sun_light("Moon_Fill", 1.5, (0.9, -0.2, 2.6), "#8aa8d0", use_shadow=False)

            mat_npaper = make_paper_material("nink_paper", "#1c2c47", dark_fac=0.45)
            mat_nground = make_paper_material("nink_ground", "#152238", dark_fac=0.48)
            mat_nglow = make_principled_material("nink_glow", "#ffdfa3", roughness=0.8, emission_hex="#ffd27d", emission_strength=1.6)
            mat_nglow_glass = make_principled_material("nink_glow_glass", "#ffdfa3", roughness=0.8, emission_hex="#ffd27d", emission_strength=0.56)

            for k, obj in objs.items():
                if k == "ground":
                    assign_mat(obj, mat_nground)
                elif k == "boxes_glass":
                    assign_mat(obj, mat_nglow_glass)
                elif k in ("roof_skylight", "night_light_strips"):
                    assign_mat(obj, mat_nglow)
                else:
                    assign_mat(obj, mat_npaper)

    # ================= 3. 实景 (REAL) =================
    elif style_name == "real":
        setup_freestyle(scene, False)
        try:
            scene.view_settings.view_transform = 'Filmic'
        except TypeError:
            pass
        scene.view_settings.exposure = 0.05

        if not is_night:
            if shot_name == "train":
                # train 镜头带一点暖色低阳（夕照金晖）
                setup_world_gradient(scene, "#ebd4be", "#8daec9", "#7b8078", strength=0.95)
                add_sun_light("Sun_Main", 4.6, (1.22, 0.12, -0.85), "#ffdcb0", use_shadow=True, angle_deg=1.8)
                add_sun_light("Sun_Fill", 0.75, (0.85, -0.2, 2.4), "#b5cde6", use_shadow=False)
            else:
                # 昼景淡蓝灰世界渐变 + 清朗阳光
                setup_world_gradient(scene, "#d8e1e8", "#8aa9c4", "#7e857d", strength=0.9)
                add_sun_light("Sun_Main", 4.5, (1.02, 0.15, -0.62), "#fff8eb", use_shadow=True, angle_deg=1.2)
                add_sun_light("Sun_Fill", 0.7, (0.9, -0.2, 2.6), "#bfd4e8", use_shadow=False)

            mat_found = make_principled_material("real_found", "#9c9282", roughness=0.88, metallic=0.0)
            mat_conc = make_principled_material("real_conc", "#a6a9ad", roughness=0.82, metallic=0.05)
            mat_steel = make_principled_material("real_steel", "#454b52", roughness=0.52, metallic=0.65)
            mat_ym = make_principled_material("real_ym", "#ced6de", roughness=0.38, metallic=0.35)
            mat_glass = make_principled_material("real_glass", "#5b86a6", roughness=0.18, metallic=0.25)
            mat_lifter = make_principled_material("real_lifter", "#b83728", roughness=0.48, metallic=0.35)
            mat_ground = make_principled_material("real_ground", "#5e635e", roughness=0.9, metallic=0.0)

            # 金属屋面浅灰带细微色调区分
            roof_real_colors = {
                "1": "#d2d7dc",
                "2": "#cbd1d6",
                "3": "#d6dadf",
                "4": "#cfd4da",
            }
            for k, v in roof_real_colors.items():
                if f"roof_grp_{k}" in objs:
                    # lift 镜头是钢结构网架提升中，还未铺白色铝板，所以 lift 用深灰钢质感（带细微明度区分）
                    if shot_name == "lift":
                        lift_steel_cols = {"1": "#4e5660", "2": "#465059", "3": "#575c63", "4": "#4c545c"}
                        assign_mat(objs[f"roof_grp_{k}"], make_principled_material(f"real_lift_grp_{k}", lift_steel_cols[k], roughness=0.48, metallic=0.7))
                    else:
                        assign_mat(objs[f"roof_grp_{k}"], make_principled_material(f"real_grp_{k}", v, roughness=0.42, metallic=0.45))

            if "roof_skylight" in objs:
                assign_mat(objs["roof_skylight"], make_principled_material("real_skylight", "#699dc2", roughness=0.15, metallic=0.2))

            if shot_name == "roof":
                mat_r740_clad = make_principled_material("real_r740_clad", "#dce0e4", roughness=0.38, metallic=0.45)
                assign_mat(objs.get("roof740_sky"), make_principled_material("real_r740_sky", "#689ec4", roughness=0.16, metallic=0.25))
                assign_mat(objs.get("roof740_clad"), mat_r740_clad)
                assign_mat(objs.get("roof740_uncovered_cells"), make_principled_material("real_r740_uc", "#3a4047", roughness=0.5, metallic=0.75))
                mat_lifter = mat_r740_clad

            if shot_name == "train":
                assign_mat(objs.get("train_body"), make_principled_material("real_train_body", "#f0f3f7", roughness=0.25, metallic=0.4))
                assign_mat(objs.get("train_window"), make_principled_material("real_train_win", "#182029", roughness=0.15, metallic=0.3))
                assign_mat(objs.get("train_headlight"), make_principled_material("real_train_light", "#fff2cc", roughness=0.2, emission_hex="#ffe699", emission_strength=4.5))
                mat_lifter = make_principled_material("real_r740_clad", "#dce0e4", roughness=0.38, metallic=0.45)

            assign_mat(objs.get("boxes_found"), mat_found)
            assign_mat(objs.get("boxes_conc"), mat_conc)
            assign_mat(objs.get("boxes_steel"), mat_steel)
            assign_mat(objs.get("boxes_ym"), mat_ym)
            assign_mat(objs.get("boxes_glass"), mat_glass)
            assign_mat(objs.get("lifters"), mat_lifter)
            assign_mat(objs.get("ground"), mat_ground)

        else:
            # night 实景：深蓝夜空、屋面与云门暖白灯带、候车层通透亮灯（发光材质）、列车灯点
            # 第三轮迭代：环境光/世界强度在第二轮基础上 ×2.5 (strength: 0.7 -> 1.75, Night_Moon: 1.2 -> 3.0, Night_Fill: 0.35 -> 0.875)；配楼发光带 (boxes_glass) emission 强度改为第一轮 (4.2) 的 0.35 倍 (= 1.47)
            scene.view_settings.exposure = 0.55
            setup_world_gradient(scene, "#142238", "#080e1a", "#0d131f", strength=1.75)
            add_sun_light("Night_Moon", 3.0, (1.0, 0.15, -0.65), "#7094c4", use_shadow=True, angle_deg=2.5)
            add_sun_light("Night_Fill", 0.875, (0.9, -0.2, 2.6), "#4f6b94", use_shadow=False)

            mat_found = make_principled_material("nreal_found", "#383a40", roughness=0.85)
            mat_conc = make_principled_material("nreal_conc", "#3e444f", roughness=0.78, metallic=0.1)
            mat_steel = make_principled_material("nreal_steel", "#2a313b", roughness=0.5, metallic=0.65)
            mat_ym = make_principled_material("nreal_ym", "#4a5668", roughness=0.35, metallic=0.45)
            mat_glass = make_principled_material("nreal_glass", "#ffe09e", roughness=0.2, emission_hex="#ffd27d", emission_strength=1.47)
            mat_lifter = make_principled_material("nreal_lifter", "#942e22", roughness=0.5, metallic=0.3)
            mat_ground = make_principled_material("nreal_ground", "#1b2029", roughness=0.85)

            for k in ("1", "2", "3", "4"):
                if f"roof_grp_{k}" in objs:
                    assign_mat(objs[f"roof_grp_{k}"], make_principled_material(f"nreal_grp_{k}", "#626e80", roughness=0.4, metallic=0.45))

            if "roof_skylight" in objs:
                assign_mat(objs["roof_skylight"], make_principled_material("nreal_skylight", "#ffe4ab", roughness=0.25, emission_hex="#ffd685", emission_strength=3.6))
            if "night_light_strips" in objs:
                assign_mat(objs["night_light_strips"], make_principled_material("nreal_strips", "#fff0c4", roughness=0.2, emission_hex="#ffdf91", emission_strength=6.0))

            assign_mat(objs.get("boxes_found"), mat_found)
            assign_mat(objs.get("boxes_conc"), mat_conc)
            assign_mat(objs.get("boxes_steel"), mat_steel)
            assign_mat(objs.get("boxes_ym"), mat_ym)
            assign_mat(objs.get("boxes_glass"), mat_glass)
            assign_mat(objs.get("lifters"), mat_lifter)
            assign_mat(objs.get("ground"), mat_ground)


# 机位配置（起点值，支持在 ±15% 范围内微调）
SHOT_CAMERAS = {
    "lift":  {"pos": (330.0, 170.0, 330.0), "target": (0.0, 34.0, 0.0),    "lens": 45.0},
    "roof":  {"pos": (300.0, 300.0, 330.0), "target": (0.0, 40.0, 0.0),    "lens": 42.0},
    "train": {"pos": (-360.0, 30.0, 290.0), "target": (-150.0, 22.0, 30.0), "lens": 40.0},
    "night": {"pos": (430.0, 200.0, 430.0), "target": (0.0, 26.0, 0.0),    "lens": 40.0},
}

TRAIN_CANDIDATE_CAMERAS = {
    "train_real_A": {"pos": (-380.0, 70.0, 380.0), "target": (-120.0, 22.0, 90.0), "lens": 40.0},
    "train_real_B": {"pos": (-300.0, 45.0, 300.0), "target": (-170.0, 20.0, 30.0), "lens": 40.0},
    "train_real_C": {"relative": "C", "lens": 40.0},
    "train_real_D": {"relative": "D", "lens": 40.0},
}


def compute_train_bbox_data(objs):
    # 从列车建模对象顶点反算数据坐标系 (x, y, z) 的包围盒：Blender (bx, by, bz) -> 数据 (bx, bz, -by)
    xs, ys, zs = [], [], []
    for k in ("train_body", "train_window", "train_headlight"):
        obj = objs.get(k)
        if obj is None or obj.data is None:
            continue
        for v in obj.data.vertices:
            co = v.co
            xs.append(round(float(co.x), 4))
            ys.append(round(float(co.z), 4))
            zs.append(round(float(-co.y), 4))
    return {
        "x_min": min(xs), "x_max": max(xs),
        "y_min": min(ys), "y_max": max(ys),
        "z_min": min(zs), "z_max": max(zs),
    }


def compute_train_relative_camera_c(objs):
    bb = compute_train_bbox_data(objs)
    x_min = bb["x_min"]
    y_center = round(0.5 * (bb["y_min"] + bb["y_max"]), 4)
    z_center = round(0.5 * (bb["z_min"] + bb["z_max"]), 4)
    pos = (round(x_min - 70.0, 4), round(y_center + 16.0, 4), round(z_center + 55.0, 4))
    target = (round(x_min + 120.0, 4), y_center, round(z_center - 10.0, 4))
    print(f"[TRAIN_CAND_C] bbox={bb} y_center={y_center} z_center={z_center} pos={pos} target={target} lens=40.0")
    return {"pos": pos, "target": target, "lens": 40.0}


def compute_train_relative_camera_d(objs):
    bb = compute_train_bbox_data(objs)
    x_min = bb["x_min"]
    y_center = round(0.5 * (bb["y_min"] + bb["y_max"]), 4)
    z_center = round(0.5 * (bb["z_min"] + bb["z_max"]), 4)
    pos = (round(x_min - 40.0, 4), round(y_center + 15.0, 4), round(z_center + 100.0, 4))
    target = (round(x_min + 150.0, 4), round(y_center - 2.0, 4), round(z_center - 40.0, 4))
    print(f"[TRAIN_CAND_D] bbox={bb} y_center={y_center} z_center={z_center} pos={pos} target={target} lens=40.0")
    return {"pos": pos, "target": target, "lens": 40.0}


def render_one(scene, out_path):
    t0 = time.perf_counter()
    scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    elapsed = time.perf_counter() - t0
    size_bytes = os.path.getsize(out_path) if os.path.exists(out_path) else 0
    print(f"[RENDER_FINAL] file={os.path.basename(out_path)} bytes={size_bytes} seconds={elapsed:.2f}")
    return size_bytes, elapsed


def main():
    argv = sys.argv
    if "--" in argv:
        args = argv[argv.index("--") + 1:]
    else:
        args = []

    geom_path = os.path.join(WORK_DIR, "geometry.json")
    out_dir = os.path.join(WORK_DIR, "renders", "final")
    os.makedirs(out_dir, exist_ok=True)

    filter_shots = None
    if len(args) > 0:
        filter_shots = set(args[0].split(","))

    with open(geom_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    cell_grp_map = build_cell_grp_map(data)

    shots = ["lift", "roof", "train", "night"]
    styles = ["clay", "ink", "real"]

    for shot_name in shots:
        cand_tags = list(TRAIN_CANDIDATE_CAMERAS.keys()) if shot_name == "train" else []
        if (
            filter_shots
            and shot_name not in filter_shots
            and not any(f"{shot_name}_{s}" in filter_shots for s in styles)
            and not any(ct in filter_shots for ct in cand_tags)
        ):
            continue

        objs = build_shot_geometry(shot_name, data, cell_grp_map)
        scene = bpy.context.scene

        cam_data = bpy.data.cameras.new(name="Camera")
        cam_obj = bpy.data.objects.new(name="Camera", object_data=cam_data)
        bpy.context.collection.objects.link(cam_obj)
        scene.camera = cam_obj

        cam_cfg = SHOT_CAMERAS[shot_name]
        if shot_name == "train":
            cam_cfg = compute_train_relative_camera_c(objs)
        set_camera_look_at(cam_obj, cam_cfg["pos"], cam_cfg["target"], cam_cfg["lens"])

        for style_name in styles:
            tag = f"{shot_name}_{style_name}"
            if filter_shots and shot_name not in filter_shots and tag not in filter_shots:
                continue
            configure_style(scene, objs, shot_name, style_name)
            out_path = os.path.join(out_dir, f"{tag}.png")
            render_one(scene, out_path)

        if shot_name == "train":
            for cand_tag, cand_cam in TRAIN_CANDIDATE_CAMERAS.items():
                if filter_shots and cand_tag not in filter_shots and "train_candidates" not in filter_shots:
                    continue
                if cand_cam.get("relative") == "D":
                    cand_cam = compute_train_relative_camera_d(objs)
                elif cand_cam.get("relative"):
                    cand_cam = compute_train_relative_camera_c(objs)
                set_camera_look_at(cam_obj, cand_cam["pos"], cand_cam["target"], cand_cam["lens"])
                configure_style(scene, objs, "train", "real")
                out_path = os.path.join(out_dir, f"{cand_tag}.png")
                render_one(scene, out_path)


if __name__ == "__main__":
    main()

