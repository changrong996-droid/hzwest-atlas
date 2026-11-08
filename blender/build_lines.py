import sys
import os
import json
import math
import time
import bpy
from mathutils import Vector


def srgb_to_linear(c):
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def hex_to_rgba(hex_str):
    h = hex_str.lstrip('#')
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


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
    # corners_8: 先底面 4 角 (0..3) 再顶面 4 角 (4..7)
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


def make_paper_material(name, hex_color="#f4f1ea", roughness=1.0):
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
                bsdf.inputs["Roughness"].default_value = roughness
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = 0.0
            if "Specular IOR Level" in bsdf.inputs:
                bsdf.inputs["Specular IOR Level"].default_value = 0.0
            # 在保留太阳能量 (4.0 + 0.5) 与纯白世界背景 (1.0) 的前提下，
            # 防止 Standard 色彩变换下纸面白受阳光直射过曝被截断，同时保留清爽柔和阴影
            dark = nt.nodes.new('ShaderNodeBsdfDiffuse')
            dark.inputs['Color'].default_value = (0.0, 0.0, 0.0, 1.0)
            dark.inputs['Roughness'].default_value = 1.0
            mix = nt.nodes.new('ShaderNodeMixShader')
            mix.inputs['Fac'].default_value = 0.56
            nt.links.new(dark.outputs['BSDF'], mix.inputs[1])
            nt.links.new(bsdf.outputs['BSDF'], mix.inputs[2])
            nt.links.new(mix.outputs['Shader'], out_node.inputs['Surface'])
    return mat


def create_mesh_object(name, verts, faces, mat):
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


def setup_render_world_and_freestyle(scene):
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'
    print(f"[INFO] render.engine = {scene.render.engine}")

    scene.eevee.taa_render_samples = 64
    print(f"[INFO] eevee.taa_render_samples = {scene.eevee.taa_render_samples}")

    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'

    try:
        scene.view_settings.view_transform = 'Standard'
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0

    # 世界背景纯白 #ffffff、强度 1.0
    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    world = scene.world
    bg_rgba = hex_to_rgba('#ffffff')
    world.color = bg_rgba[:3]
    if world.node_tree:
        for node in world.node_tree.nodes:
            if node.type == 'BACKGROUND':
                node.inputs[0].default_value = bg_rgba
                node.inputs[1].default_value = 1.0
                break

    # Freestyle 墨线设置：线宽 1.4，颜色 #1d1a17
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = 'ABSOLUTE'
    scene.render.line_thickness = 1.0

    vl = bpy.context.view_layer
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    # 收紧 crease_angle，避免 90° 普通网格折角被无差别全描
    fs.crease_angle = math.radians(70.0)

    ink_rgb = hex_to_rgba("#1d1a17")[:3]
    linestyle = bpy.data.linestyles.new("InkLineStyle")
    linestyle.color = ink_rgb
    linestyle.thickness = 1.4

    while len(fs.linesets) > 0:
        fs.linesets.remove(fs.linesets[0])

    # 线集 1：非屋盖格构件（Silhouette + Crease + Edge Mark）
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

    # 线集 2：屋盖格只描标记的外轮廓与分区边界（Edge Mark）
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


def add_common_objects_lights_camera(scene, data, mat_paper):
    # 提升器與地面（与 build_scene.py 完全一致）
    l_verts, l_faces, l_marks = [], [], set()
    for l in data["lifters"]:
        lx, lz, ltop = float(l["x"]), float(l["z"]), float(l["top"])
        base = len(l_verts)
        append_box(
            l_verts, l_faces,
            lx - 1.6, 0.0, lz - 1.6,
            lx + 1.6, ltop, lz + 1.6
        )
        l_marks.update(box_all_edge_pairs(base))
        base = len(l_verts)
        append_box(
            l_verts, l_faces,
            lx - 2.3, ltop, lz - 2.3,
            lx + 2.3, ltop + 2.2, lz + 2.3
        )
        l_marks.update(box_all_edge_pairs(base))
    obj_lifters = create_mesh_object("lifters", l_verts, l_faces, mat_paper)
    mark_mesh_edges_and_faces(obj_lifters.data, l_marks)

    gz = -0.85
    g_verts = [
        map_coord(-700.0, gz, -550.0),
        map_coord( 700.0, gz, -550.0),
        map_coord( 700.0, gz,  550.0),
        map_coord(-700.0, gz,  550.0),
    ]
    g_faces = [(0, 3, 2, 1)]
    create_mesh_object("ground", g_verts, g_faces, mat_paper)

    # 太阳光参数与 build_scene.py 完全一致
    sun_main_data = bpy.data.lights.new(name="Sun_Main", type='SUN')
    sun_main_data.energy = 4.0
    sun_main_obj = bpy.data.objects.new(name="Sun_Main", object_data=sun_main_data)
    bpy.context.collection.objects.link(sun_main_obj)
    sun_main_obj.rotation_euler = (1.05, 0.15, -0.65)

    sun_fill_data = bpy.data.lights.new(name="Sun_Fill", type='SUN')
    sun_fill_data.energy = 0.5
    sun_fill_data.use_shadow = False
    sun_fill_obj = bpy.data.objects.new(name="Sun_Fill", object_data=sun_fill_data)
    bpy.context.collection.objects.link(sun_fill_obj)
    sun_fill_obj.rotation_euler = (0.9, -0.2, 2.6)

    cam_data = bpy.data.cameras.new(name="Camera")
    cam_obj = bpy.data.objects.new(name="Camera", object_data=cam_data)
    bpy.context.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    return cam_obj


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


def build_asm_scene(data, cell_grp_map):
    clear_scene()
    scene = bpy.context.scene
    setup_render_world_and_freestyle(scene)
    mat_paper = make_paper_material("mat_paper", "#f4f1ea", roughness=1.0)

    a_found_verts, a_found_faces, a_found_marks = [], [], set()
    a_steel_verts, a_steel_faces, a_steel_marks, a_steel_roof_faces = [], [], set(), set()

    # 1) grp == 0 的静态盒
    for b in data["boxes"]:
        if b.get("grp", 0) != 0:
            continue
        mn, mx = b["min"], b["max"]
        if b.get("mat") == "found":
            base = len(a_found_verts)
            append_box(a_found_verts, a_found_faces, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2])
            a_found_marks.update(box_all_edge_pairs(base))
        else:
            base = len(a_steel_verts)
            fbase = len(a_steel_faces)
            append_box(a_steel_verts, a_steel_faces, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2])
            dx = abs(mx[0] - mn[0])
            dz = abs(mx[2] - mn[2])
            xc, zc = round((mn[0] + mx[0]) / 2), round((mn[2] + mx[2]) / 2)
            if b.get("mat") == "steel" and dx > 6.0 and dz > 6.0 and (xc, zc) in cell_grp_map:
                b_xmin, b_xmax, b_zmin, b_zmax = get_cell_boundary_flags(cell_grp_map, xc, zc, 0)
                append_box_boundary_marks(a_steel_marks, base, b_xmin, b_xmax, b_zmin, b_zmax, is_corners_box=False)
                for fi in range(fbase, fbase + 6):
                    a_steel_roof_faces.add(fi)
            else:
                a_steel_marks.update(box_all_edge_pairs(base))

    # 2) asm.boxes 按 corners 建真盒网格（同分类合并）
    boxes_14_meta = [b for b in data["boxes"] if b.get("grp", 0) in (1, 2, 3, 4)]
    for idx, b in enumerate(data["asm"]["boxes"]):
        corners = b["corners"]
        orig_b = boxes_14_meta[idx]
        mn, mx = orig_b["min"], orig_b["max"]
        grp = b.get("grp", 0)
        if b.get("mat") == "found":
            base = len(a_found_verts)
            append_corners_box(a_found_verts, a_found_faces, corners)
            a_found_marks.update(box_all_edge_pairs(base))
        else:
            base = len(a_steel_verts)
            fbase = len(a_steel_faces)
            append_corners_box(a_steel_verts, a_steel_faces, corners)
            dx = abs(mx[0] - mn[0])
            dz = abs(mx[2] - mn[2])
            xc, zc = round((mn[0] + mx[0]) / 2), round((mn[2] + mx[2]) / 2)
            if b.get("mat") == "steel" and dx > 6.0 and dz > 6.0 and (xc, zc) in cell_grp_map:
                b_xmin, b_xmax, b_zmin, b_zmax = get_cell_boundary_flags(cell_grp_map, xc, zc, grp)
                append_box_boundary_marks(a_steel_marks, base, b_xmin, b_xmax, b_zmin, b_zmax, is_corners_box=True)
                for fi in range(fbase, fbase + 6):
                    a_steel_roof_faces.add(fi)
            else:
                for fi in range(fbase, fbase + 6):
                    a_steel_roof_faces.add(fi)

    obj_a_found = create_mesh_object("asm_boxes_found", a_found_verts, a_found_faces, mat_paper)
    mark_mesh_edges_and_faces(obj_a_found.data, a_found_marks)

    obj_a_steel = create_mesh_object("asm_boxes_steel", a_steel_verts, a_steel_faces, mat_paper)
    mark_mesh_edges_and_faces(obj_a_steel.data, a_steel_marks, a_steel_roof_faces)

    # 3) asm.cells 按 quad 建封闭薄板
    for grp_id in ("1", "2", "3", "4"):
        ac_verts, ac_faces = [], []
        marked_pairs = set()
        for idx, c in enumerate(data["asm"]["cells"]):
            if str(c["grp"]) != grp_id:
                continue
            base = len(ac_verts)
            top_quad = c["quad"]
            bot_quad = [[pt[0], pt[1] - 1.4, pt[2]] for pt in top_quad]
            append_corners_box(ac_verts, ac_faces, bot_quad + top_quad)
            orig_c = data["cells"][idx]
            xc, zc = round(orig_c["xc"]), round(orig_c["zc"])
            b_xmin, b_xmax, b_zmin, b_zmax = get_cell_boundary_flags(cell_grp_map, xc, zc, c["grp"])
            append_box_boundary_marks(marked_pairs, base, b_xmin, b_xmax, b_zmin, b_zmax, is_corners_box=True)
        obj = create_mesh_object(f"asm_roof_grp_{grp_id}", ac_verts, ac_faces, mat_paper)
        mark_mesh_edges_and_faces(obj.data, marked_pairs, set(range(len(ac_faces))))

    cam_obj = add_common_objects_lights_camera(scene, data, mat_paper)
    return scene, cam_obj


def build_final_scene(data, cell_grp_map):
    clear_scene()
    scene = bpy.context.scene
    setup_render_world_and_freestyle(scene)
    mat_paper = make_paper_material("mat_paper", "#f4f1ea", roughness=1.0)

    f_found_verts, f_found_faces, f_found_marks = [], [], set()
    f_steel_verts, f_steel_faces, f_steel_marks, f_steel_roof_faces = [], [], set(), set()

    for b in data["boxes"]:
        mn, mx = b["min"], b["max"]
        grp = b.get("grp", 0)
        if b.get("mat") == "found":
            base = len(f_found_verts)
            append_box(f_found_verts, f_found_faces, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2])
            f_found_marks.update(box_all_edge_pairs(base))
        else:
            base = len(f_steel_verts)
            fbase = len(f_steel_faces)
            append_box(f_steel_verts, f_steel_faces, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2])
            dx = abs(mx[0] - mn[0])
            dz = abs(mx[2] - mn[2])
            xc, zc = round((mn[0] + mx[0]) / 2), round((mn[2] + mx[2]) / 2)
            is_roof_cell_box = (
                b.get("mat") == "steel"
                and dx > 6.0
                and dz > 6.0
                and (xc, zc) in cell_grp_map
            )
            if is_roof_cell_box:
                b_xmin, b_xmax, b_zmin, b_zmax = get_cell_boundary_flags(cell_grp_map, xc, zc, grp)
                append_box_boundary_marks(f_steel_marks, base, b_xmin, b_xmax, b_zmin, b_zmax, is_corners_box=False)
                for fi in range(fbase, fbase + 6):
                    f_steel_roof_faces.add(fi)
            elif grp in (1, 2, 3, 4):
                for fi in range(fbase, fbase + 6):
                    f_steel_roof_faces.add(fi)
            else:
                f_steel_marks.update(box_all_edge_pairs(base))

    obj_f_found = create_mesh_object("final_boxes_found", f_found_verts, f_found_faces, mat_paper)
    mark_mesh_edges_and_faces(obj_f_found.data, f_found_marks)

    obj_f_steel = create_mesh_object("final_boxes_steel", f_steel_verts, f_steel_faces, mat_paper)
    mark_mesh_edges_and_faces(obj_f_steel.data, f_steel_marks, f_steel_roof_faces)

    for grp_id in ("1", "2", "3", "4"):
        c_verts, c_faces = [], []
        marked_pairs = set()
        for c in data["cells"]:
            if str(c["grp"]) != grp_id:
                continue
            base = len(c_verts)
            y_top = float(c["yTop"])
            append_box(
                c_verts, c_faces,
                c["xa"], y_top - 1.4, c["za"],
                c["xb"], y_top, c["zb"]
            )
            xc, zc = round(c["xc"]), round(c["zc"])
            b_xmin, b_xmax, b_zmin, b_zmax = get_cell_boundary_flags(cell_grp_map, xc, zc, c["grp"])
            append_box_boundary_marks(marked_pairs, base, b_xmin, b_xmax, b_zmin, b_zmax, is_corners_box=False)
        obj = create_mesh_object(f"final_roof_grp_{grp_id}", c_verts, c_faces, mat_paper)
        mark_mesh_edges_and_faces(obj.data, marked_pairs, set(range(len(c_faces))))

    cam_obj = add_common_objects_lights_camera(scene, data, mat_paper)
    return scene, cam_obj


def render_and_report(scene, out_path):
    t0 = time.perf_counter()
    scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    elapsed = time.perf_counter() - t0
    size_bytes = os.path.getsize(out_path) if os.path.exists(out_path) else 0
    print(f"[RENDER_RESULT] file={os.path.basename(out_path)} bytes={size_bytes} seconds={elapsed:.2f}")
    return size_bytes, elapsed


def main():
    argv = sys.argv
    if "--" in argv:
        args = argv[argv.index("--") + 1:]
    else:
        args = []

    geom_path = args[0] if len(args) > 0 else "geometry.json"
    out_dir = args[1] if len(args) > 1 else "renders"
    os.makedirs(out_dir, exist_ok=True)

    with open(geom_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    cell_grp_map = build_cell_grp_map(data)

    # 1. 拼装态建场与渲染：pair_asm_line.png
    scene_asm, cam_asm = build_asm_scene(data, cell_grp_map)
    set_camera_look_at(cam_asm, (305, 150, 305), (0, 26, 0), 42)
    render_and_report(scene_asm, os.path.join(out_dir, "pair_asm_line.png"))

    # 2. 成品态建场与渲染：pair_final_line.png 与 view_b2_line.png
    scene_final, cam_final = build_final_scene(data, cell_grp_map)
    set_camera_look_at(cam_final, (305, 150, 305), (0, 26, 0), 42)
    render_and_report(scene_final, os.path.join(out_dir, "pair_final_line.png"))

    set_camera_look_at(cam_final, (195, 110, 215), (0, 40, 0), 50)
    render_and_report(scene_final, os.path.join(out_dir, "view_b2_line.png"))


if __name__ == "__main__":
    main()
