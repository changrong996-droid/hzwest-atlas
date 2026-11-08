import sys
import os
import json
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
    # 每面内按数据坐标 (x, z) 的 (min,min)/(max,min)/(max,max)/(min,max)
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


def make_material(name, hex_color, roughness=0.85, metallic=0.0):
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
                break
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


def setup_render_and_world(scene):
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'
    print(f"[INFO] render.engine = {scene.render.engine}")

    scene.eevee.taa_render_samples = 64
    print(f"[INFO] eevee.taa_render_samples = {scene.eevee.taa_render_samples}")

    if hasattr(scene.eevee, "use_gtao"):
        scene.eevee.use_gtao = True
        if hasattr(scene.eevee, "gtao_distance"):
            scene.eevee.gtao_distance = 8.0
        if hasattr(scene.eevee, "gtao_factor"):
            scene.eevee.gtao_factor = 1.0
        print("[INFO] scene.eevee.use_gtao is available and enabled (distance=8, factor=1.0)")
    else:
        print("[INFO] scene.eevee.use_gtao does NOT exist in this Blender version; skipped")

    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'

    try:
        scene.view_settings.view_transform = 'Filmic'
    except TypeError:
        pass

    # World 背景 #c3ccd6、强度 0.6
    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    world = scene.world
    bg_rgba = hex_to_rgba('#c3ccd6')
    world.color = bg_rgba[:3]
    if world.node_tree:
        for node in world.node_tree.nodes:
            if node.type == 'BACKGROUND':
                node.inputs[0].default_value = bg_rgba
                node.inputs[1].default_value = 0.6
                break


def set_camera_look_at(cam_obj, pos_data, target_data, lens_mm):
    pos_b = Vector(map_coord(*pos_data))
    target_b = Vector(map_coord(*target_data))
    cam_obj.location = pos_b
    direction = target_b - pos_b
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    cam_obj.data.lens = float(lens_mm)
    cam_obj.data.clip_start = 0.5
    cam_obj.data.clip_end = 5000.0


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

    clear_scene()
    scene = bpy.context.scene
    setup_render_and_world(scene)

    # 材质定义（v2 修订值，粗糙度统一 0.85）
    mat_found = make_material("mat_found", "#a79b87", roughness=0.85, metallic=0.0)
    mat_steel = make_material("mat_steel", "#6f757d", roughness=0.85, metallic=0.0)
    mat_lifter = make_material("mat_lifter", "#a83c2c", roughness=0.85, metallic=0.0)
    mat_ground = make_material("mat_ground", "#8f9484", roughness=0.85, metallic=0.0)

    grp_colors = {
        "1": "#8fa3c4",
        "2": "#93b8ab",
        "3": "#cfa586",
        "4": "#b3c493",
    }
    mat_grp = {
        k: make_material(f"mat_grp_{k}", v, roughness=0.85, metallic=0.0)
        for k, v in grp_colors.items()
    }

    # --- 成品场景 (final) 专属几何 ---
    final_objs = []
    f_found_verts, f_found_faces = [], []
    f_steel_verts, f_steel_faces = [], []
    for b in data["boxes"]:
        mn, mx = b["min"], b["max"]
        if b.get("mat") == "found":
            append_box(f_found_verts, f_found_faces, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2])
        else:
            append_box(f_steel_verts, f_steel_faces, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2])

    final_objs.append(create_mesh_object("final_boxes_found", f_found_verts, f_found_faces, mat_found))
    final_objs.append(create_mesh_object("final_boxes_steel", f_steel_verts, f_steel_faces, mat_steel))

    for grp_id in ("1", "2", "3", "4"):
        c_verts, c_faces = [], []
        for c in data["cells"]:
            if str(c["grp"]) != grp_id:
                continue
            y_top = float(c["yTop"])
            append_box(
                c_verts, c_faces,
                c["xa"], y_top - 1.4, c["za"],
                c["xb"], y_top, c["zb"]
            )
        final_objs.append(create_mesh_object(f"final_roof_grp_{grp_id}", c_verts, c_faces, mat_grp[grp_id]))

    # --- 拼装态场景 (asm) 专属几何 ---
    asm_objs = []
    a_found_verts, a_found_faces = [], []
    a_steel_verts, a_steel_faces = [], []

    # 1) grp == 0 的静态盒
    for b in data["boxes"]:
        if b.get("grp", 0) != 0:
            continue
        mn, mx = b["min"], b["max"]
        if b.get("mat") == "found":
            append_box(a_found_verts, a_found_faces, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2])
        else:
            append_box(a_steel_verts, a_steel_faces, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2])

    # 2) asm.boxes 按 corners 建真盒网格（同分类合并）
    for b in data["asm"]["boxes"]:
        corners = b["corners"]
        if b.get("mat") == "found":
            append_corners_box(a_found_verts, a_found_faces, corners)
        else:
            append_corners_box(a_steel_verts, a_steel_faces, corners)

    asm_objs.append(create_mesh_object("asm_boxes_found", a_found_verts, a_found_faces, mat_found))
    asm_objs.append(create_mesh_object("asm_boxes_steel", a_steel_verts, a_steel_faces, mat_steel))

    # 3) asm.cells 按 quad 建封闭薄板（顶面 quad 4 点，底面各减 (0, 1.4, 0)），按 grp 着色合并
    for grp_id in ("1", "2", "3", "4"):
        ac_verts, ac_faces = [], []
        for c in data["asm"]["cells"]:
            if str(c["grp"]) != grp_id:
                continue
            top_quad = c["quad"]
            bot_quad = [[pt[0], pt[1] - 1.4, pt[2]] for pt in top_quad]
            append_corners_box(ac_verts, ac_faces, bot_quad + top_quad)
        asm_objs.append(create_mesh_object(f"asm_roof_grp_{grp_id}", ac_verts, ac_faces, mat_grp[grp_id]))

    # --- 通用件（两场景一致）：提升器与地面 ---
    l_verts, l_faces = [], []
    for l in data["lifters"]:
        lx, lz, ltop = float(l["x"]), float(l["z"]), float(l["top"])
        append_box(
            l_verts, l_faces,
            lx - 1.6, 0.0, lz - 1.6,
            lx + 1.6, ltop, lz + 1.6
        )
        append_box(
            l_verts, l_faces,
            lx - 2.3, ltop, lz - 2.3,
            lx + 2.3, ltop + 2.2, lz + 2.3
        )
    create_mesh_object("lifters", l_verts, l_faces, mat_lifter)

    gz = -0.85
    g_verts = [
        map_coord(-700.0, gz, -550.0),
        map_coord( 700.0, gz, -550.0),
        map_coord( 700.0, gz,  550.0),
        map_coord(-700.0, gz,  550.0),
    ]
    g_faces = [(0, 3, 2, 1)]
    create_mesh_object("ground", g_verts, g_faces, mat_ground)

    # --- 灯光（v2 修订值） ---
    # 主 SUN 光：能量 4，rotation_euler = (1.05, 0.15, -0.65)
    sun_main_data = bpy.data.lights.new(name="Sun_Main", type='SUN')
    sun_main_data.energy = 4.0
    sun_main_obj = bpy.data.objects.new(name="Sun_Main", object_data=sun_main_data)
    bpy.context.collection.objects.link(sun_main_obj)
    sun_main_obj.rotation_euler = (1.05, 0.15, -0.65)

    # 补光 SUN：能量 0.5，rotation_euler = (0.9, -0.2, 2.6)，不投影
    sun_fill_data = bpy.data.lights.new(name="Sun_Fill", type='SUN')
    sun_fill_data.energy = 0.5
    sun_fill_data.use_shadow = False
    sun_fill_obj = bpy.data.objects.new(name="Sun_Fill", object_data=sun_fill_data)
    bpy.context.collection.objects.link(sun_fill_obj)
    sun_fill_obj.rotation_euler = (0.9, -0.2, 2.6)

    # 相机对象
    cam_data = bpy.data.cameras.new(name="Camera")
    cam_obj = bpy.data.objects.new(name="Camera", object_data=cam_data)
    bpy.context.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    def set_scene_mode(mode):
        show_final = (mode == "final")
        for obj in final_objs:
            obj.hide_render = not show_final
            obj.hide_viewport = not show_final
        for obj in asm_objs:
            obj.hide_render = show_final
            obj.hide_viewport = show_final

    # 1. pair_asm.png (拼装态)
    set_scene_mode("asm")
    set_camera_look_at(cam_obj, (305, 150, 305), (0, 26, 0), 42)
    scene.render.filepath = os.path.join(out_dir, "pair_asm.png")
    bpy.ops.render.render(write_still=True)

    # 2. pair_final.png (成品)
    set_scene_mode("final")
    set_camera_look_at(cam_obj, (305, 150, 305), (0, 26, 0), 42)
    scene.render.filepath = os.path.join(out_dir, "pair_final.png")
    bpy.ops.render.render(write_still=True)

    # 3. view_a2_overview.png (成品)
    set_scene_mode("final")
    set_camera_look_at(cam_obj, (430, 330, 430), (0, 18, 0), 40)
    scene.render.filepath = os.path.join(out_dir, "view_a2_overview.png")
    bpy.ops.render.render(write_still=True)

    # 4. view_b2_close.png (成品)
    set_scene_mode("final")
    set_camera_look_at(cam_obj, (195, 110, 215), (0, 40, 0), 50)
    scene.render.filepath = os.path.join(out_dir, "view_b2_close.png")
    bpy.ops.render.render(write_still=True)

    # 5. view_c2_east.png (成品)
    set_scene_mode("final")
    set_camera_look_at(cam_obj, (445, 80, 0), (0, 32, 0), 55)
    scene.render.filepath = os.path.join(out_dir, "view_c2_east.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
