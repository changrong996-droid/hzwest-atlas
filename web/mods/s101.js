// S-101 地下体量（hark-liuzhijie）· 3D 模块，接 window.HZ_MODS 钩子（hark-cr 接口请求答复：选 (b)，与 actors 同一钩子）
// 委托人反馈「地下像纸片」：3D 里基坑只有 0.8 m 厚的板，挖了多少看不出来。本模块补两样，数据全部读 S-101 插件（HZ_SHEET_PLUGINS 的 stateAt / model），不另排：
//  1. 基坑虚线（工程图「不可见轮廓画虚线」的画法）：每个分坑与中央地铁坑按当天开挖深度画坑底框与四角竖边，透过地面显示（depthTest 关）；
//     分坑顶板封上（roof ≥ 1）后不再画。深度 = stateAt(t).tiles[i].dig / coreDig（与图纸剖面同一个数）。
//  2. 等体积土方块：已出土方 stateAt(t).vol（按公开总量 120 万 m³ 缩放，见 s101.js 头注）堆成一个立方体放在基坑北侧空地，
//     边长 = vol^(1/3)，挖完时约 106 m；旁边一个虚线外框 = 120 万 m³ 终值，看得出还差多少。南边沿每 10 m 一个刻度。
//  3. 施工面（红，透地面）：当天正在挖的分坑 / 中央坑——开挖面（当前坑底，45° 斜线填）、本层土体（上一层标高 → 当前开挖面，画成红框带），
//     挖机（每 1 500 m² 开挖面 1 台，至多 4 台，墨线示意：履带 + 机身 + 两节臂 + 斗，臂朝坑心），出土坡道（开挖面北缘 → 地面，坡 1:8，朝土方块）；
//     中央坑在用的内支撑（stateAt.struts = 1）按 9 m 间距画横撑（墨线），撑下才是开挖面。判据全部来自 stateAt：分坑 0 < 进度 < 1、中央坑某层 dig 进度在 (0,1)。
// 接口：window.HZ_MODS.push({ id:'s101-volume', build(scene, HZ, THREE, opts), update(t, cam) })；opts.clip（THREE.Plane[]）同 actors（D-16）。
// 不传 THREE（Node 检查）时只算线段与方块尺寸。检查：tools/hz/check_s101.js 末节（体积守恒、不压构件、坑线只在地下、update 耗时）。
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const VPUB = 1.2e6;                  // = s101.js VPUB（公开总量 120 万 m³）
  const SHOW = [0, 420];               // 时间窗：S-101 [0, 365] + 30 天余韵后淡出（420 完全消失）
  const GAP = 38;                      // 方块南面离基坑北缘（m）
  const MAXSEG = 4000;

  const plug = () => (ROOT.HZ_SHEET_PLUGINS || []).find(p => p.id === 'S-101');

  // 方块位置：x 居中于基坑，南面在基坑北缘以北 GAP 米（基坑北缘 = 分坑 z 最小值）
  function anchor(m) { const zN = Math.min(m.core.z0, ...m.tiles.map(q => q.z0)), x0 = Math.min(...m.tiles.map(q => q.x0)), x1 = Math.max(...m.tiles.map(q => q.x1));
    return { x: (x0 + x1) / 2, zS: zN - GAP }; }

  function cube(vol) { return Math.cbrt(Math.max(0, vol)); }

  // 线段：pit = 虚线（透地面），cube = 实线，ghost = 终值外框（虚线）
  function lines(HZ, t, out) {
    out.pit.length = 0; out.cube.length = 0; out.ghost.length = 0; out.face.length = 0; out.a = 0; out.vol = 0; out.ex = 0; out.live = [];
    const P = plug(); if (!P || !P.stateAt || t < SHOW[0] || t > SHOW[1]) return out;
    const s = P.stateAt(t), m = P.model(), A = anchor(m), GEO_LIFTS = (P.GEO && P.GEO.lifts) || [];
    const seg = (arr, a, b) => arr.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    const pitBox = (x0, x1, z0, z1, d) => { if (d > -0.3) return; const c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      for (let i = 0; i < 4; i++) { const p = c[i], q = c[(i + 1) % 4]; seg(out.pit, [p[0], d, p[1]], [q[0], d, q[1]]); seg(out.pit, [p[0], -0.1, p[1]], [p[0], d, p[1]]); } };
    for (const o of s.tiles) if (o.roof < 1) pitBox(o.q.x0, o.q.x1, o.q.z0, o.q.z1, o.dig);
    if (s.base < 1 || s.lv.some(v => v < 1)) pitBox(m.core.x0, m.core.x1, m.core.z0, m.core.z1, s.coreDig != null ? s.coreDig : s.dig);
    // 施工面：当天在挖的坑
    const F = out.face, hatch = (x0, x1, z0, z1, y, st) => { for (let k = -(z1 - z0); k < x1 - x0; k += st) { const a = [x0 + Math.max(0, k), z0 + Math.max(0, -k)], bL = Math.min(x1 - x0 - Math.max(0, k), z1 - z0 - Math.max(0, -k)); if (bL <= 0) continue; seg(F, [a[0], y, a[1]], [a[0] + bL, y, a[1] + bL]); } };
    const rect = (arr, x0, x1, z0, z1, y) => { seg(arr, [x0, y, z0], [x1, y, z0]); seg(arr, [x1, y, z0], [x1, y, z1]); seg(arr, [x1, y, z1], [x0, y, z1]); seg(arr, [x0, y, z1], [x0, y, z0]); };
    const exc = (x, y, z, yaw) => { const c = Math.cos(yaw), sn = Math.sin(yaw), W = (u, v, w) => [x + u * c - w * sn, y + v, z + u * sn + w * c];
      const bx = (u0, v0, w0, u1, v1, w1) => { const v = [W(u0, v0, w0), W(u1, v0, w0), W(u1, v0, w1), W(u0, v0, w1), W(u0, v1, w0), W(u1, v1, w0), W(u1, v1, w1), W(u0, v1, w1)];
        for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(F, v[i], v[j]); };
      bx(-2.4, 0, -1.7, 2.4, 0.9, 1.7); bx(-1.8, 0.9, -1.4, 1.6, 2.9, 1.4);   // 履带、机身（约 20 t 级）
      const b0 = W(1.6, 2.2, 0), b1 = W(5.2, 4.6, 0), b2 = W(7.6, 1.2, 0), b3 = W(7.0, 0.2, 0); seg(F, b0, b1); seg(F, b1, b2); seg(F, b2, b3); seg(F, b3, W(8.0, 0.4, 0)); };
    const work = (x0, x1, z0, z1, yTop, y, key) => { rect(F, x0, x1, z0, z1, y); rect(F, x0, x1, z0, z1, yTop); for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) seg(F, [x, yTop, z], [x, y, z]);
      hatch(x0, x1, z0, z1, y, 4);
      const area = (x1 - x0) * (z1 - z0), n = Math.max(1, Math.min(4, Math.round(area / 1500))), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const longX = x1 - x0 >= z1 - z0; for (let i = 0; i < n; i++) { const u = (i + 0.5) / n;   // 沿长边均布，站在长边一侧、臂朝坑心
        if (longX) exc(x0 + (x1 - x0) * u, y, z0 + Math.min(9, (z1 - z0) / 3), Math.PI / 2); else exc(x0 + Math.min(9, (x1 - x0) / 3), y, z0 + (z1 - z0) * u, 0); out.ex++; }
      const L = Math.min(-y * 8, (x1 - x0) * 0.8), rx = cx - L / 2; seg(F, [rx, y, z0 + 2], [rx + L, -0.1, z0 + 2]); seg(F, [rx, y, z0 + 8], [rx + L, -0.1, z0 + 8]);   // 出土坡道 1:8（宽 6 m）
      out.live.push(key); };
    s.tiles.forEach((o, i) => { const k = (o.dig - 0) / (o.q.depth || -1); if (o.dig < -0.05 && k < 0.999 && o.roof < 1) work(o.q.x0, o.q.x1, o.q.z0, o.q.z1, 0, o.dig, o.q.id || 'T' + i); });
    { const by = m.by, L = GEO_LIFTS; for (let i = 0; i < L.length; i++) { const b = by['dig' + i]; if (!b || t < b.a || t >= b.b) continue; const yTop = i ? L[i - 1] : 0, y = s.coreDig;
        if (y < yTop - 0.05) work(m.core.x0, m.core.x1, m.core.z0, m.core.z1, yTop, y, 'C-METRO'); } }
    if (P.GEO && P.GEO.struts) P.GEO.struts.forEach((y, i) => { if (s.struts[i] !== 1) return; for (let x = m.core.x0 + 4.5; x < m.core.x1; x += 9) seg(out.pit, [x, y, m.core.z0], [x, y, m.core.z1]); seg(out.pit, [m.core.x0, y, m.core.z0], [m.core.x1, y, m.core.z0]); seg(out.pit, [m.core.x0, y, m.core.z1], [m.core.x1, y, m.core.z1]); });
    // 方块（底面 y = 0）
    const a = cube(s.vol), box = (arr, x0, y0, z0, x1, y1, z1) => { const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
      for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(arr, v[i], v[j]); };
    const aF = cube(VPUB);
    // D-36 终值虚线外框不再画（未建幽灵线）
    // box(out.ghost, A.x - aF / 2, 0, A.zS - aF, A.x + aF / 2, aF, A.zS);
    if (a > 0.5) { box(out.cube, A.x - a / 2, 0, A.zS - a, A.x + a / 2, a, A.zS);
      for (let k = 10; k < a; k += 10) seg(out.cube, [A.x - a / 2 + k, 0, A.zS], [A.x - a / 2 + k, k % 50 ? 1.5 : 3.5, A.zS]); }   // 南边沿刻度：10 m 一格，50 m 长刻
    out.a = a; out.aF = aF; out.vol = s.vol; out.A = A;
    return out;
  }

  const MOD = { id: 's101-volume', VPUB, SHOW, GAP, anchor, cube, lines: (HZ, t) => lines(HZ, t, { pit: [], cube: [], ghost: [], face: [] }),
    stats: { pit: 0, cube: 0, a: 0 },
    build(scene, HZ, THREE, opts) { opts = opts || {}; this.HZ = HZ; this.L = { pit: [], cube: [], ghost: [], face: [] }; this.key = null;
      THREE = THREE || ROOT.THREE; this.T = THREE; const clip = Array.isArray(opts.clip) && opts.clip.length ? { clippingPlanes: opts.clip } : {};
      if (THREE && scene) {
        const mk = (dashed, xray, op, col) => { const g = new THREE.BufferGeometry(), buf = new Float32Array(MAXSEG * 6), at = new THREE.BufferAttribute(buf, 3); at.setUsage && at.setUsage(THREE.DynamicDrawUsage);
          g.setAttribute('position', at); g.setDrawRange(0, 0);
          const mat = dashed ? new THREE.LineDashedMaterial(Object.assign({ color: 0x1c1a17, dashSize: 2.2, gapSize: 1.6, transparent: true, opacity: op, depthTest: !xray, depthWrite: false }, clip))
            : new THREE.LineBasicMaterial(Object.assign({ color: col || 0x1c1a17, transparent: true, opacity: op, depthTest: !xray, depthWrite: !xray }, clip));
          const o = new THREE.LineSegments(g, mat); o.frustumCulled = false; o.renderOrder = xray ? (col ? 7 : 6) : 5; scene.add(o); return { o, buf, at, mat, op }; };
        this.G = { pit: mk(true, true, 0.62), cube: mk(false, false, 0.95), ghost: mk(true, false, 0.4), face: mk(false, true, 0.9, 0xb3261e) };
        const fm = new THREE.MeshBasicMaterial(Object.assign({ color: 0xcdb999, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }, clip));
        this.fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), fm); this.fill.frustumCulled = false; this.fill.visible = false; this.fill.renderOrder = 4; scene.add(this.fill);
      }
      return this; },
    update(t, cam) { if (!this.HZ) return 0; const key = Math.round(t * 8); if (key === this.key) return this.stats.pit + this.stats.cube;
      this.key = key; const L = lines(this.HZ, t, this.L), fade = 1 - Math.max(0, Math.min(1, (t - (SHOW[1] - 30)) / 30));
      this.stats.pit = L.pit.length / 6; this.stats.cube = L.cube.length / 6; this.stats.face = L.face.length / 6; this.stats.ex = L.ex; this.stats.a = L.a;
      if (this.G) { for (const k of ['pit', 'cube', 'ghost', 'face']) { const g = this.G[k], arr = L[k], n = Math.min(arr.length, MAXSEG * 6); g.buf.set(arr.slice(0, n)); g.o.geometry.setDrawRange(0, n / 3); g.at.needsUpdate = true;
          if (k === 'pit' || k === 'ghost') g.o.computeLineDistances(); g.mat.opacity = g.op * fade; g.o.visible = n > 0 && fade > 0; }
        if (this.fill) { const a = L.a; this.fill.visible = a > 0.5 && fade > 0; if (this.fill.visible) { this.fill.scale.set(a, a, a); this.fill.position.set(L.A.x, a / 2, L.A.zS - a / 2); this.fill.material.opacity = 0.5 * fade; } } }
      return this.stats.pit + this.stats.cube; },
  };
  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(MOD);
})();
