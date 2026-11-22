// S-101 地下体量（hark-liuzhijie / B-8 & B-9 实景工作面与实体挖机升级：g-fangyi）· 3D 模块，接 window.HZ_MODS 钩子
// 数据全部读 S-101 插件（HZ_SHEET_PLUGINS 的 stateAt / model），不另排：
//  1. 真实下凹基坑工作面（B-8）：在 S-101 图页实时挖开地面洞口（__pv.setPitCutout），按 stateAt(t) 逐坑构筑
//     地连墙/土壁分层护坡、冠梁护边、坑底工作面/混凝土底板、1:8 出土坡道、在用 3D 内支撑梁与围檩、以及中央坑分层回筑板；
//     墨线/实景双模式材质自适应（实景带光影，墨线带纸色淡彩+清晰结构墨线）。
//  2. 实体 3D 挖机（B-9）：以双模式 InstancedMesh 实体履带式挖掘机（履带、回转平台、工程黄机身、玻璃驾驶室、
//     鹅颈动臂/斗杆/液压油缸/铲斗）替换旧红线框挖机，精准落位在当前开挖面标高 y = dig 上；墨线模式配结构墨线轮廓。
//  3. 等体积土方块与工程线框：北侧土方块（vol^(1/3)）、坑底/内支撑/回筑线框；非 S-101 图页自动隐藏（B-12）不穿透总图。
// 接口：window.HZ_MODS.push({ id:'s101-volume', build(scene, HZ, THREE, opts), update(t, cam) })；opts.clip（THREE.Plane[]）同 actors（D-16）。
// 不传 THREE（Node 检查）时只算线段与方块尺寸。检查：tools/hz/check_s101.js。
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const VPUB = 1.2e6;                  // = s101.js VPUB（公开总量 120 万 m³）
  const SHOW = [0, 420];               // 时间窗：S-101 [0, 365] + 30 天余韵后淡出（420 完全消失）
  const GAP = 38;                      // 方块南面离基坑北缘（m）
  const MAXSEG = 4000;
  const MAX_PIT_VERTS = 24000;
  const MAX_EXC = 64;

  const plug = () => (ROOT.HZ_SHEET_PLUGINS || []).find(p => p.id === 'S-101');

  // 方块位置：x 居中于基坑，南面在基坑北缘以北 GAP 米（基坑北缘 = 分坑 z 最小值）
  function anchor(m) {
    const zN = Math.min(m.core.z0, ...m.tiles.map(q => q.z0));
    const x0 = Math.min(...m.tiles.map(q => q.x0)), x1 = Math.max(...m.tiles.map(q => q.x1));
    return { x: (x0 + x1) / 2, zS: zN - GAP };
  }

  function cube(vol) { return Math.cbrt(Math.max(0, vol)); }

  // 线段 + 实体工作面/挖机清单
  function lines(HZ, t, out) {
    out.pit.length = 0; out.cube.length = 0; out.ghost.length = 0; out.face.length = 0; out.built.length = 0;
    out.a = 0; out.vol = 0; out.ex = 0; out.live = [];
    out.excs = out.excs || []; out.excs.length = 0;
    out.pits = out.pits || []; out.pits.length = 0;
    out.ramps = out.ramps || []; out.ramps.length = 0;
    out.struts3 = out.struts3 || []; out.struts3.length = 0;
    out.slabs3 = out.slabs3 || []; out.slabs3.length = 0;
    const P = plug(); if (!P || !P.stateAt || t < SHOW[0] || t > SHOW[1]) return out;
    const s = P.stateAt(t), m = P.model(), A = anchor(m), GEO_LIFTS = (P.GEO && P.GEO.lifts) || [];
    const seg = (arr, a, b) => arr.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    const pitBox = (x0, x1, z0, z1, d) => {
      if (d > -0.3) return;
      const c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      for (let i = 0; i < 4; i++) {
        const p = c[i], q = c[(i + 1) % 4];
        seg(out.pit, [p[0], d, p[1]], [q[0], d, q[1]]);
        seg(out.pit, [p[0], -0.1, p[1]], [p[0], d, p[1]]);
      }
    };
    for (const o of s.tiles) {
      if (o.roof < 1) {
        pitBox(o.q.x0, o.q.x1, o.q.z0, o.q.z1, o.dig);
        if (o.dig < -0.15) out.pits.push({ x0: o.q.x0, x1: o.q.x1, z0: o.q.z0, z1: o.q.z1, dig: o.dig, base: o.base, roof: o.roof, core: false });
      }
    }
    const cDig = s.coreDig != null ? s.coreDig : s.dig;
    if (s.base < 1 || s.lv.some(v => v < 1)) {
      pitBox(m.core.x0, m.core.x1, m.core.z0, m.core.z1, cDig);
      if (cDig < -0.15) out.pits.push({ x0: m.core.x0, x1: m.core.x1, z0: m.core.z0, z1: m.core.z1, dig: cDig, base: s.base, roof: 0, core: true });
    }
    // 施工面：当天在挖的坑（挖机改用实体 3D 模型，不再往 face 里塞红线框盒子）
    const F = out.face;
    const hatch = (x0, x1, z0, z1, y, st) => {
      for (let k = -(z1 - z0); k < x1 - x0; k += st) {
        const a = [x0 + Math.max(0, k), z0 + Math.max(0, -k)];
        const bL = Math.min(x1 - x0 - Math.max(0, k), z1 - z0 - Math.max(0, -k));
        if (bL <= 0) continue;
        seg(F, [a[0], y, a[1]], [a[0] + bL, y, a[1] + bL]);
      }
    };
    const rect = (arr, x0, x1, z0, z1, y) => {
      seg(arr, [x0, y, z0], [x1, y, z0]); seg(arr, [x1, y, z0], [x1, y, z1]);
      seg(arr, [x1, y, z1], [x0, y, z1]); seg(arr, [x0, y, z1], [x0, y, z0]);
    };
    const work = (x0, x1, z0, z1, yTop, y, key) => {
      rect(F, x0, x1, z0, z1, y);
      rect(F, x0, x1, z0, z1, yTop);
      for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) seg(F, [x, yTop, z], [x, y, z]);
      hatch(x0, x1, z0, z1, y, 8);
      const area = (x1 - x0) * (z1 - z0), n = Math.max(1, Math.min(4, Math.round(area / 1500)));
      const cx = (x0 + x1) / 2;
      const longX = x1 - x0 >= z1 - z0;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;   // 沿长边均布，站在坑内工作面、臂朝坑心
        if (longX) out.excs.push({ x: x0 + (x1 - x0) * u, y, z: z0 + Math.min(12, (z1 - z0) * 0.42), yaw: Math.PI / 2 });
        else out.excs.push({ x: x0 + Math.min(12, (x1 - x0) * 0.42), y, z: z0 + (z1 - z0) * u, yaw: 0 });
        out.ex++;
      }
      const L = Math.min(-y * 8, (x1 - x0) * 0.8), rx = cx - L / 2;
      seg(F, [rx, y, z0 + 2], [rx + L, -0.1, z0 + 2]);
      seg(F, [rx, y, z0 + 8], [rx + L, -0.1, z0 + 8]);   // 出土坡道 1:8（宽 6 m）
      // 3D 实体坡道仅在无内支撑且挖深 > 1.8 m 的放坡分坑绘制（有内支撑的中央深坑不穿插坡道）
      if (key !== 'C-METRO' && -y > 1.8) out.ramps.push({ x0: rx, x1: rx + L, z0: z0 + 2, z1: z0 + 8, y0: y, y1: -0.04 });
      out.live.push(key);
    };
    s.tiles.forEach((o, i) => {
      const k = (o.dig - 0) / (o.q.depth || -1);
      if (o.dig < -0.05 && k < 0.999 && o.roof < 1) work(o.q.x0, o.q.x1, o.q.z0, o.q.z1, 0, o.dig, o.q.id || 'T' + i);
    });
    {
      const by = m.by, L = GEO_LIFTS;
      for (let i = 0; i < L.length; i++) {
        const b = by['dig' + i]; if (!b || t < b.a || t >= b.b) continue;
        const yTop = i ? L[i - 1] : 0, y = s.coreDig;
        if (y < yTop - 0.05) work(m.core.x0, m.core.x1, m.core.z0, m.core.z1, yTop, y, 'C-METRO');
      }
    }
    if (P.GEO && P.GEO.struts) {
      P.GEO.struts.forEach((y, i) => {
        if (s.struts[i] !== 1) return;
        for (let x = m.core.x0 + 4.5; x < m.core.x1; x += 9) seg(out.pit, [x, y, m.core.z0], [x, y, m.core.z1]);
        seg(out.pit, [m.core.x0, y, m.core.z0], [m.core.x1, y, m.core.z0]);
        seg(out.pit, [m.core.x0, y, m.core.z1], [m.core.x1, y, m.core.z1]);
        out.struts3.push({ x0: m.core.x0, x1: m.core.x1, z0: m.core.z0, z1: m.core.z1, y });
      });
    }
    // 中央坑分层回筑（与剖面同一组 stateAt 数）
    if (P.GEO) {
      const c = m.core, SD = P.GEO.slabDone || 0.7;
      const slab = (arr, y, step) => {
        rect(arr, c.x0, c.x1, c.z0, c.z1, y);
        for (let x = c.x0 + step; x < c.x1 - 0.5; x += step) seg(arr, [x, y, c.z0], [x, y, c.z1]);
      };
      if (s.base >= 1 && P.GEO.base) {
        slab(out.built, P.GEO.base[1], 18);
        out.slabs3.push({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, y0: P.GEO.base[0], y1: P.GEO.base[1], live: false });
      }
      (P.GEO.lv || []).forEach((L, i) => {
        const k = s.lv[i] || 0;
        if (k >= SD) {
          slab(out.built, L.y1, 18);
          out.slabs3.push({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, y0: L.y0, y1: L.y1, live: false });
        } else if (k > 0) {
          rect(F, c.x0, c.x1, c.z0, c.z1, L.y1);
          if (k > 0.45) {
            const xEnd = c.x0 + (c.x1 - c.x0) * (k - 0.45) / (SD - 0.45);
            hatch(c.x0, xEnd, c.z0, c.z1, L.y1, 6);
            out.slabs3.push({ x0: c.x0, x1: xEnd, z0: c.z0, z1: c.z1, y0: L.y0, y1: L.y1, live: true });
          }
        }
      });
    }
    // 方块（底面 y = 0）
    const a = cube(s.vol);
    const box = (arr, x0, y0, z0, x1, y1, z1) => {
      const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
      for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(arr, v[i], v[j]);
    };
    const aF = cube(VPUB);
    if (a > 0.5) {
      box(out.cube, A.x - a / 2, 0, A.zS - a, A.x + a / 2, a, A.zS);
      for (let k = 10; k < a; k += 10) seg(out.cube, [A.x - a / 2 + k, 0, A.zS], [A.x - a / 2 + k, k % 50 ? 1.5 : 3.5, A.zS]);
    }
    out.a = a; out.aF = aF; out.vol = s.vol; out.A = A;
    return out;
  }

  // ---- B-9：实体 3D 履带式挖掘机几何（局部坐标：底面 y = 0，+X 为动臂朝向）----
  function buildExcavatorModel(THREE) {
    const pos = [], nor = [], col = [], edges = [];
    const addBox = (x0, y0, z0, x1, y1, z1, rgb, edge) => {
      const faces = [
        [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
        [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
        [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
        [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
        [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
        [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
      ];
      for (const [a, b, c, d, n] of faces) {
        for (const v of [a, b, c, a, c, d]) {
          pos.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]); col.push(rgb[0], rgb[1], rgb[2]);
        }
      }
      if (edge !== false) {
        const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
        for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
          edges.push(v[i][0], v[i][1], v[i][2], v[j][0], v[j][1], v[j][2]);
        }
      }
    };
    const addBeam = (a, b, w, h, rgb) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1;
      const ux = dx / L, uy = dy / L, uz = dz / L;
      // 垂直于梁轴的截面基向量（假定主要在 XY 平面内）
      const nx = -uy, ny = ux, nz = 0;
      const nl = Math.hypot(nx, ny) || 1;
      const ex = (nx / nl) * (h / 2), ey = (ny / nl) * (h / 2), ez = w / 2;
      const ring = p => [
        [p[0] - ex, p[1] - ey, p[2] - ez], [p[0] + ex, p[1] + ey, p[2] - ez],
        [p[0] + ex, p[1] + ey, p[2] + ez], [p[0] - ex, p[1] - ey, p[2] + ez],
      ];
      const r0 = ring(a), r1 = ring(b);
      const quad = (p0, p1, p2, p3, n) => {
        for (const v of [p0, p1, p2, p0, p2, p3]) {
          pos.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]); col.push(rgb[0], rgb[1], rgb[2]);
        }
      };
      quad(r0[0], r0[1], r1[1], r1[0], [0, 0, -1]);
      quad(r0[2], r0[3], r1[3], r1[2], [0, 0, 1]);
      quad(r0[1], r0[2], r1[2], r1[1], [nx / nl, ny / nl, 0]);
      quad(r0[3], r0[0], r1[0], r1[3], [-nx / nl, -ny / nl, 0]);
      quad(r0[3], r0[2], r0[1], r0[0], [-ux, -uy, -uz]);
      quad(r1[0], r1[1], r1[2], r1[3], [ux, uy, uz]);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        edges.push(r0[i][0], r0[i][1], r0[i][2], r1[i][0], r1[i][1], r1[i][2]);
        edges.push(r0[i][0], r0[i][1], r0[i][2], r0[j][0], r0[j][1], r0[j][2]);
        edges.push(r1[i][0], r1[i][1], r1[i][2], r1[j][0], r1[j][1], r1[j][2]);
      }
    };

    const DARK = [0.22, 0.23, 0.25], STEEL = [0.34, 0.36, 0.39], YEL = [0.88, 0.65, 0.14], YEL2 = [0.76, 0.54, 0.10], GLASS = [0.18, 0.25, 0.32], CYL = [0.72, 0.74, 0.76];
    // 左右履带（y = 0..0.95）+ 中央底盘 + 回转支承
    addBox(-2.5, 0.0, -1.75, 2.5, 0.92, -0.95, DARK, true);
    addBox(-2.5, 0.0, 0.95, 2.5, 0.92, 1.75, DARK, true);
    addBox(-1.6, 0.32, -0.95, 1.6, 0.88, 0.95, STEEL, false);
    addBox(-0.95, 0.88, -0.95, 0.95, 1.18, 0.95, DARK, false);
    // 上车回转机身（工程黄）+ 后配重 + 排气管
    addBox(-2.1, 1.18, -1.45, 1.55, 2.45, 1.45, YEL, true);
    addBox(-2.55, 1.18, -1.48, -2.05, 2.48, 1.48, DARK, true);
    addBox(-1.55, 2.45, 0.65, -1.25, 3.25, 0.95, DARK, false);
    // 驾驶室（前左偏置 + 深色玻璃窗 + 顶盖）
    addBox(0.05, 1.18, -1.42, 1.65, 3.02, -0.22, YEL2, true);
    addBox(0.18, 1.72, -1.46, 1.69, 2.86, -0.18, GLASS, false);
    // 鹅颈动臂 + 斗杆 + 液压油缸 + 铲斗（全部实体梁）
    addBeam([0.95, 1.95, 0.32], [3.55, 4.25, 0.32], 0.56, 0.64, YEL);
    addBeam([3.55, 4.25, 0.32], [5.45, 3.65, 0.32], 0.50, 0.54, YEL);
    addBeam([1.55, 1.50, 0.32], [3.35, 3.20, 0.32], 0.24, 0.24, CYL);   // 动臂油缸
    addBeam([5.45, 3.65, 0.32], [6.85, 1.35, 0.32], 0.42, 0.44, YEL2);  // 斗杆
    addBeam([3.85, 4.35, 0.32], [5.70, 3.95, 0.32], 0.20, 0.20, CYL);   // 斗杆油缸
    // 铲斗（朝向机身内侧挖掘姿态）
    addBox(6.35, 0.32, -0.28, 7.55, 1.28, 0.92, DARK, true);
    addBox(6.10, 0.30, -0.22, 6.40, 0.56, 0.86, STEEL, false);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    return { geo, edges: new Float32Array(edges) };
  }

  // ---- B-8：动态写入真实下凹基坑工作面网格（坑壁分层土体、冠梁、坑底工作面、1:8 出土坡道、3D 内支撑、回筑板）----
  function writePitMesh(L, pos, nor, col) {
    let vi = 0;
    const cap = pos.length / 3;
    const quad = (a, b, c, d, n, rgb) => {
      if (vi + 6 > cap) return;
      const pts = [a, b, c, a, c, d];
      for (let i = 0; i < 6; i++) {
        const p = pts[i], o = vi * 3;
        pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2];
        nor[o] = n[0]; nor[o + 1] = n[1]; nor[o + 2] = n[2];
        col[o] = rgb[0]; col[o + 1] = rgb[1]; col[o + 2] = rgb[2];
        vi++;
      }
    };
    const box = (x0, y0, z0, x1, y1, z1, rgb) => {
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], rgb);
      quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], rgb);
      quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], rgb);
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], rgb);
      quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], rgb);
    };

    const SOIL_FLOOR = [0.56, 0.45, 0.32];
    const CONC_FLOOR = [0.72, 0.71, 0.68];
    const WALL_TOP = [0.64, 0.62, 0.58];   // 冠梁下地连墙/护坡混凝土段
    const WALL_MID = [0.49, 0.40, 0.30];   // 中层土壁
    const WALL_DEEP = [0.39, 0.32, 0.24];  // 深层土壁
    const CROWN = [0.76, 0.74, 0.70];      // 地面冠梁护边（无缝衔接地面开孔）
    const RAMP_TOP = [0.62, 0.52, 0.38];
    const RAMP_SIDE = [0.46, 0.38, 0.28];
    const STRUT_COL = [0.80, 0.44, 0.14];  // 临时内支撑橙色
    const SLAB_BUILT = [0.74, 0.73, 0.70];
    const SLAB_LIVE = [0.76, 0.30, 0.25];

    for (const p of L.pits) {
      const { x0, x1, z0, z1, dig, base } = p;
      const yTop = 0.02;
      // 1. 坑底工作面（法线朝上）
      const floorCol = base >= 1 ? CONC_FLOOR : SOIL_FLOOR;
      quad([x0, dig, z0], [x0, dig, z1], [x1, dig, z1], [x1, dig, z0], [0, 1, 0], floorCol);
      // 2. 四周分层护壁（法线朝坑内）
      const bands = [];
      const yB1 = Math.max(dig, -3.2);
      if (yTop > yB1 + 0.05) bands.push([yTop, yB1, WALL_TOP]);
      const yB2 = Math.max(dig, -12.0);
      if (yB1 > yB2 + 0.05) bands.push([yB1, yB2, WALL_MID]);
      if (yB2 > dig + 0.05) bands.push([yB2, dig, WALL_DEEP]);
      for (const [ya, yb, c] of bands) {
        quad([x0, yb, z0], [x1, yb, z0], [x1, ya, z0], [x0, ya, z0], [0, 0, 1], c);   // 北壁（朝南）
        quad([x1, yb, z1], [x0, yb, z1], [x0, ya, z1], [x1, ya, z1], [0, 0, -1], c);  // 南壁（朝北）
        quad([x0, yb, z1], [x0, yb, z0], [x0, ya, z0], [x0, ya, z1], [1, 0, 0], c);   // 西壁（朝东）
        quad([x1, yb, z0], [x1, yb, z1], [x1, ya, z1], [x1, ya, z0], [-1, 0, 0], c);  // 东壁（朝西）
      }
      // 3. 冠梁护边（高出地面 0.28 m，宽 1.1 m，彻底遮住开孔锯齿并强化基坑边界）
      const cw = 1.1, cy0 = -0.10, cy1 = 0.28;
      box(x0 - cw, cy0, z0 - cw, x1 + cw, cy1, z0 + 0.15, CROWN);
      box(x0 - cw, cy0, z1 - 0.15, x1 + cw, cy1, z1 + cw, CROWN);
      box(x0 - cw, cy0, z0 + 0.15, x0 + 0.15, cy1, z1 - 0.15, CROWN);
      box(x1 - 0.15, cy0, z0 + 0.15, x1 + cw, cy1, z1 - 0.15, CROWN);
    }

    // 4. 1:8 实体土方坡道
    for (const r of L.ramps) {
      const { x0, x1, z0, z1, y0, y1 } = r;
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      quad([x0, y0, z0], [x0, y0, z1], [x1, y1, z1], [x1, y1, z0], [nx, ny, 0], RAMP_TOP);
      // 坡道南侧实体斜墙（防止从坑内看坡道下方露空）
      if (vi + 3 <= cap) {
        const tri = [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1]];
        for (let i = 0; i < 3; i++) {
          const p = tri[i], o = vi * 3;
          pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2];
          nor[o] = 0; nor[o + 1] = 0; nor[o + 2] = 1;
          col[o] = RAMP_SIDE[0]; col[o + 1] = RAMP_SIDE[1]; col[o + 2] = RAMP_SIDE[2];
          vi++;
        }
      }
    }

    // 5. 3D 临时内支撑（横撑 + 南北围檩）
    for (const st of L.struts3) {
      const { x0, x1, z0, z1, y } = st;
      box(x0, y - 0.45, z0, x1, y + 0.45, z0 + 0.9, STRUT_COL);
      box(x0, y - 0.45, z1 - 0.9, x1, y + 0.45, z1, STRUT_COL);
      for (let x = x0 + 4.5; x < x1; x += 9) {
        box(x - 0.42, y - 0.4, z0 + 0.9, x + 0.42, y + 0.4, z1 - 0.9, STRUT_COL);
      }
    }

    // 6. 中央坑回筑底板/楼板实体
    for (const sb of L.slabs3) {
      box(sb.x0 + 0.2, sb.y0, sb.z0 + 0.2, sb.x1 - 0.2, sb.y1, sb.z1 - 0.2, sb.live ? SLAB_LIVE : SLAB_BUILT);
    }
    return vi;
  }

  const MOD = {
    id: 's101-volume', VPUB, SHOW, GAP, anchor, cube,
    lines: (HZ, t) => lines(HZ, t, { pit: [], cube: [], ghost: [], face: [], built: [] }),
    stats: { pit: 0, cube: 0, a: 0 },
    build(scene, HZ, THREE, opts) {
      opts = opts || {};
      this.HZ = HZ;
      this.L = { pit: [], cube: [], ghost: [], face: [], built: [] };
      this.key = null; this.off = false; this.lastLit = null; this.excCount = 0;
      THREE = THREE || ROOT.THREE; this.T = THREE;
      const clip = Array.isArray(opts.clip) && opts.clip.length ? { clippingPlanes: opts.clip } : {};
      const hasStd = !!(THREE && typeof THREE.MeshStandardMaterial === 'function');
      const hasInst = !!(THREE && typeof THREE.InstancedMesh === 'function' && typeof THREE.Matrix4 === 'function');
      if (THREE && scene) {
        const mk = (dashed, xray, op, col) => {
          const g = new THREE.BufferGeometry(), buf = new Float32Array(MAXSEG * 6), at = new THREE.BufferAttribute(buf, 3);
          at.setUsage && at.setUsage(THREE.DynamicDrawUsage);
          g.setAttribute('position', at); g.setDrawRange(0, 0);
          let ld = null, la = null;
          if (dashed) {
            ld = new Float32Array(MAXSEG * 2); la = new THREE.BufferAttribute(ld, 1);
            la.setUsage && la.setUsage(THREE.DynamicDrawUsage);
            g.setAttribute('lineDistance', la);
          }
          // 真实浏览器中已有实体下凹基坑，线框开启 depthTest 防穿透实体挖机与地面
          const useDepth = hasStd ? true : !xray;
          const mat = dashed
            ? new THREE.LineDashedMaterial(Object.assign({ color: 0x1c1a17, dashSize: 2.2, gapSize: 1.6, transparent: true, opacity: op, depthTest: useDepth, depthWrite: false }, clip))
            : new THREE.LineBasicMaterial(Object.assign({ color: col || 0x1c1a17, transparent: true, opacity: op, depthTest: useDepth, depthWrite: useDepth }, clip));
          const o = new THREE.LineSegments(g, mat); o.frustumCulled = false; o.renderOrder = xray ? (col ? 7 : 6) : 5;
          scene.add(o);
          return { o, buf, at, mat, op, ld, la };
        };
        this.G = {
          pit: mk(true, true, 0.58),
          cube: mk(false, false, 0.95),
          ghost: mk(true, false, 0.4),
          face: mk(false, true, 0.72, 0xb3261e),
          built: mk(false, true, 0.7),
        };
        const fm = new THREE.MeshBasicMaterial(Object.assign({ color: 0xcdb999, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }, clip));
        this.fillInkMat = fm;
        this.fillLitMat = hasStd ? new THREE.MeshStandardMaterial(Object.assign({ color: 0x9e8564, roughness: 0.92, metalness: 0.02, transparent: true, opacity: 0.78, side: THREE.DoubleSide }, clip)) : fm;
        this.fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), fm);
        this.fill.frustumCulled = false; this.fill.visible = false; this.fill.renderOrder = 4;
        if (hasStd) { this.fill.castShadow = true; this.fill.receiveShadow = true; }
        scene.add(this.fill);

        // B-8：真实下凹基坑工作面实体网格（仅在完整 Three.js 环境中构建）
        if (hasStd && hasInst) {
          const pg = new THREE.BufferGeometry();
          const pPos = new Float32Array(MAX_PIT_VERTS * 3), pNor = new Float32Array(MAX_PIT_VERTS * 3), pCol = new Float32Array(MAX_PIT_VERTS * 3);
          const pPosAt = new THREE.BufferAttribute(pPos, 3), pNorAt = new THREE.BufferAttribute(pNor, 3), pColAt = new THREE.BufferAttribute(pCol, 3);
          pPosAt.setUsage(THREE.DynamicDrawUsage); pNorAt.setUsage(THREE.DynamicDrawUsage); pColAt.setUsage(THREE.DynamicDrawUsage);
          pg.setAttribute('position', pPosAt); pg.setAttribute('normal', pNorAt); pg.setAttribute('color', pColAt);
          pg.setDrawRange(0, 0);
          this.pitLitMat = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.9, metalness: 0.04, side: THREE.DoubleSide }, clip));
          this.pitInkMat = new THREE.MeshBasicMaterial(Object.assign({ vertexColors: true, color: 0xf4eee2, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }, clip));
          this.pitMesh = new THREE.Mesh(pg, this.pitInkMat);
          this.pitMesh.frustumCulled = false; this.pitMesh.visible = false;
          this.pitMesh.castShadow = true; this.pitMesh.receiveShadow = true;
          this.pitBuf = { pos: pPos, nor: pNor, col: pCol, posAt: pPosAt, norAt: pNorAt, colAt: pColAt };
          scene.add(this.pitMesh);

          // B-9：双模式实体 3D 挖机 InstancedMesh + 墨线轮廓
          const em = buildExcavatorModel(THREE);
          this.excEdgesLocal = em.edges;
          this.excLitMat = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.55, metalness: 0.22 }, clip));
          this.excInkMat = new THREE.MeshBasicMaterial(Object.assign({ vertexColors: true, color: 0xf5efe2, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }, clip));
          this.excMesh = new THREE.InstancedMesh(em.geo, this.excInkMat, MAX_EXC);
          this.excMesh.count = 0; this.excMesh.frustumCulled = false; this.excMesh.visible = false;
          this.excMesh.castShadow = true; this.excMesh.receiveShadow = true;
          scene.add(this.excMesh);

          const eBuf = new Float32Array(MAX_EXC * em.edges.length);
          const eg = new THREE.BufferGeometry(), eAt = new THREE.BufferAttribute(eBuf, 3);
          eAt.setUsage(THREE.DynamicDrawUsage); eg.setAttribute('position', eAt); eg.setDrawRange(0, 0);
          this.excLineMat = new THREE.LineBasicMaterial(Object.assign({ color: 0x1d1a17, transparent: true, opacity: 0.88, depthWrite: false }, clip));
          this.excLines = new THREE.LineSegments(eg, this.excLineMat);
          this.excLines.frustumCulled = false; this.excLines.visible = false; this.excLines.renderOrder = 6;
          this.excLineBuf = { buf: eBuf, at: eAt };
          this.m4 = new THREE.Matrix4();
          scene.add(this.excLines);
        }
      }
      return this;
    },
    _hideAll() {
      if (this.G) for (const k in this.G) { this.G[k].o.visible = false; this.G[k].o.geometry.setDrawRange(0, 0); }
      if (this.fill) this.fill.visible = false;
      if (this.pitMesh) { this.pitMesh.visible = false; this.pitMesh.geometry.setDrawRange(0, 0); }
      if (this.excMesh) { this.excMesh.visible = false; this.excMesh.count = 0; }
      if (this.excLines) { this.excLines.visible = false; this.excLines.geometry.setDrawRange(0, 0); }
      if (ROOT.__pv && typeof ROOT.__pv.setPitCutout === 'function') ROOT.__pv.setPitCutout([]);
      this.excCount = 0;
      this.stats.pit = this.stats.cube = this.stats.face = 0;
    },
    _applyMode(isLit, fade) {
      this.lastLit = isLit;
      if (this.pitMesh) this.pitMesh.material = isLit ? this.pitLitMat : this.pitInkMat;
      if (this.excMesh) this.excMesh.material = isLit ? this.excLitMat : this.excInkMat;
      if (this.excLines) {
        this.excLineMat.opacity = (isLit ? 0.22 : 0.88) * fade;
        this.excLines.visible = this.excCount > 0 && fade > 0;
      }
      if (this.fill) {
        this.fill.material = isLit ? this.fillLitMat : this.fillInkMat;
        this.fill.material.opacity = (isLit ? 0.78 : 0.5) * fade;
      }
      if (this.G) {
        this.G.pit.mat.opacity = (isLit ? 0.18 : 0.58) * fade;
        this.G.face.mat.opacity = (isLit ? 0.28 : 0.72) * fade;
        this.G.built.mat.opacity = (isLit ? 0.24 : 0.70) * fade;
        this.G.cube.mat.opacity = (isLit ? 0.45 : 0.95) * fade;
        this.G.ghost.mat.opacity = (isLit ? 0.15 : 0.40) * fade;
      }
    },
    update(t, cam) {
      if (!this.HZ) return 0;
      // B-12：非 S-101 图页（如 S-000 总图）彻底隐藏地下体量与开挖洞口，避免红线/坑洞干扰其他图页
      const sheet = ROOT.__pv && ROOT.__pv.sheet;
      const isS101 = !sheet || sheet === 'S-101';
      if (!isS101 || t > SHOW[1] || t < SHOW[0]) {
        if (!this.off) { this.off = true; this.key = null; this._hideAll(); }
        return 0;
      }
      this.off = false;
      const isLit = !!(ROOT.__pv && ROOT.__pv.blend > 0.5);
      const key = Math.round(t * 8);
      const fade = 1 - Math.max(0, Math.min(1, (t - (SHOW[1] - 30)) / 30));
      if (key === this.key) {
        if (this.lastLit !== isLit) this._applyMode(isLit, fade);
        return this.stats.pit + this.stats.cube;
      }
      this.key = key;
      const L = lines(this.HZ, t, this.L);
      this.stats.pit = L.pit.length / 6; this.stats.cube = L.cube.length / 6;
      this.stats.face = L.face.length / 6; this.stats.ex = L.ex; this.stats.a = L.a;
      if (this.G) {
        for (const k of ['pit', 'cube', 'ghost', 'face', 'built']) {
          const g = this.G[k], arr = L[k], n = Math.min(arr.length, MAXSEG * 6), B = g.buf;
          for (let i = 0; i < n; i++) B[i] = arr[i];
          g.o.geometry.setDrawRange(0, n / 3);
          if (n) { g.at.needsUpdate = true; g.at.updateRange && (g.at.updateRange.offset = 0, g.at.updateRange.count = n); }
          if (g.ld && n) {
            for (let i = 0; i < n; i += 6) {
              g.ld[i / 3] = 0;
              g.ld[i / 3 + 1] = Math.hypot(B[i + 3] - B[i], B[i + 4] - B[i + 1], B[i + 5] - B[i + 2]);
            }
            g.la.needsUpdate = true;
          }
          g.mat.opacity = g.op * fade;
          g.o.visible = n > 0 && fade > 0;
        }
        if (this.fill) {
          const a = L.a;
          this.fill.visible = a > 0.5 && fade > 0;
          if (this.fill.visible) {
            this.fill.scale.set(a, a, a);
            this.fill.position.set(L.A.x, a / 2, L.A.zS - a / 2);
          }
        }
        // B-8：更新地面基坑开孔与实体下凹工作面网格
        if (ROOT.__pv && typeof ROOT.__pv.setPitCutout === 'function') {
          ROOT.__pv.setPitCutout(fade > 0 ? L.pits.map(p => [p.x0, p.x1, p.z0, p.z1]) : []);
        }
        if (this.pitMesh) {
          const nv = writePitMesh(L, this.pitBuf.pos, this.pitBuf.nor, this.pitBuf.col);
          this.pitMesh.geometry.setDrawRange(0, nv);
          if (nv > 0) {
            this.pitBuf.posAt.needsUpdate = true;
            this.pitBuf.norAt.needsUpdate = true;
            this.pitBuf.colAt.needsUpdate = true;
          }
          this.pitMesh.visible = nv > 0 && fade > 0;
        }
        // B-9：更新实体 3D 挖机实例与墨线轮廓
        if (this.excMesh) {
          const excs = L.excs || [], nE = Math.min(MAX_EXC, excs.length);
          this.excCount = nE;
          const m4 = this.m4, localE = this.excEdgesLocal, eBuf = this.excLineBuf.buf;
          let eo = 0;
          for (let i = 0; i < nE; i++) {
            const e = excs[i];
            // 绕 Y 轴旋转 yaw（注意 THREE.Matrix4.makeRotationY(-yaw) 对应 x' = x*cos + z*sin, z' = -x*sin + z*cos，与原 yaw 定义对齐）
            const c = Math.cos(e.yaw), sn = Math.sin(e.yaw);
            m4.set(c, 0, -sn, e.x, 0, 1, 0, e.y + 0.02, sn, 0, c, e.z, 0, 0, 0, 1);
            this.excMesh.setMatrixAt(i, m4);
            for (let j = 0; j < localE.length; j += 3) {
              const lx = localE[j], ly = localE[j + 1], lz = localE[j + 2];
              eBuf[eo++] = e.x + lx * c - lz * sn;
              eBuf[eo++] = e.y + 0.02 + ly;
              eBuf[eo++] = e.z + lx * sn + lz * c;
            }
          }
          this.excMesh.count = nE;
          this.excMesh.visible = nE > 0 && fade > 0;
          if (nE > 0) this.excMesh.instanceMatrix.needsUpdate = true;
          this.excLines.geometry.setDrawRange(0, eo / 3);
          if (eo > 0) this.excLineBuf.at.needsUpdate = true;
          this.excLines.visible = nE > 0 && fade > 0;
        }
        this._applyMode(isLit, fade);
      }
      return this.stats.pit + this.stats.cube;
    },
  };
  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(MOD);
})();
