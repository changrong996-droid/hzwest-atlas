// S-251 网架拼装 · 施工面 3D 模块（hark-liuzhijie）· 接 window.HZ_MODS 钩子（同 actors / s101-volume）
// 委托人：3D 里要看得出「今天在哪儿干」。本模块把 S-251 当天在拼的单元标红，数据全读 S-251 插件（model / stateAt），不另排：
//  1. 在拼单元（stateAt.live）：已拼杆件 = 单元 rods 的前 floor(进度 × 根数) 根，红实线；正在拼的那一格画格框 + 交叉线；
//     单元外轮廓红虚线（还没拼的范围）。杆件端点经 HZ.xf(HZ.pose(t), 格子 grp, p) 换到当前位姿（提升前在胎架上的高度），与宿主同口径。
//  2. 胎架：托着在拼单元格子的胎架（jig.jigOf 属于该单元）画红框，看得出单元下面哪些胎架在受力。
//  3. 汽车吊（25 t 级，墨线示意）：每个在拼单元 1 台，停在单元外 8–26 m 的候车层楼面（floorS/N）上（离正在拼的格子最近、「脚下有楼面、周围不压构件」的点），臂指向正在拼的格子。
// 全部透视显示（depthTest 关，红），与 S-101 施工面同一画法。Node 检查：tools/hz/check_s251.js 末节。
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const MAXSEG = 12000, OFF = 8;
  const plug = () => (ROOT.HZ_SHEET_PLUGINS || []).find(p => p.id === 'S-251');
  const stOf = (p, t) => { if (p.st == null || t < p.st) return -1; if (p.rm && p.rm[0] >= 0 && t >= p.rm[0]) return t >= p.rm[0] + p.rm[1] ? 3 : 2; return t < p.st + p.du ? (t - p.st) / p.du : 2; };

  // 在场构件盒（找吊车停位用）：网格索引
  function index(HZ) { const FK = (plug() && plug().floorKeys) || ['floorS', 'floorN'], A = [], cs = 16, G = new Map();
    for (const a of HZ.acts) if (a.kind !== 'untemp') for (const p of a.parts) { if (p.grp || p.cells || !p.geo || !p.geo.boxes) continue; for (const b of p.geo.boxes) A.push({ p, b, floor: FK.includes(a.key) }); }
    A.forEach((e, i) => { for (let x = Math.floor(e.b.min[0] / cs); x <= Math.floor(e.b.max[0] / cs); x++) for (let z = Math.floor(e.b.min[2] / cs); z <= Math.floor(e.b.max[2] / cs); z++) { const k = x * 1e5 + z; if (!G.has(k)) G.set(k, []); G.get(k).push(i); } });
    return { A, G, cs, crane: new Map(), rods: new Map() }; }
  function near(I, x0, z0, x1, z1) { const out = new Set(); for (let x = Math.floor(x0 / I.cs); x <= Math.floor(x1 / I.cs); x++) for (let z = Math.floor(z0 / I.cs); z <= Math.floor(z1 / I.cs); z++) for (const k of I.G.get(x * 1e5 + z) || []) out.add(k); return [...out].map(k => I.A[k]); }
  // 停位：脚下 (x,z) 有本图范围内的候车层楼板（floorS/N，D-37）顶面 ≈ y，且 [x±3.5, y+0.05..y+4, z±1.4] 不压在场构件
  function standOK(I, t, x, y, z) { const es = near(I, x - 4, z - 4, x + 4, z + 4).filter(e => { const s = stOf(e.p, t); return s >= 0 && s < 3; });
    const sup = es.some(e => e.floor && e.b.min[0] <= x && e.b.max[0] >= x && e.b.min[2] <= z && e.b.max[2] >= z && Math.abs(e.b.max[1] - y) < 0.6);
    const hit = es.some(e => e.b.max[0] > x - 3.5 && e.b.min[0] < x + 3.5 && e.b.max[2] > z - 3.5 && e.b.min[2] < z + 3.5 && e.b.max[1] > y + 0.05 && e.b.min[1] < y + 4);
    return sup && !hit; }

  function lines(HZ, I, t, out) {
    out.face.length = 0; out.live = []; out.cranes = []; out.rods = 0;
    const P = plug(); if (!P || !P.stateAt) return out;
    const m = P.model(), s = P.stateAt(t); if (!s.live.length) return out;
    const ps = HZ.pose(t), xf = (g, p) => HZ.xf(ps, g, p), F = out.face, seg = (a, b) => F.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    for (const u of s.live) {
      const k = s.frac(u), nR = Math.floor(u.rods * k);
      // 单元全部杆件按当前位姿换算一次后缓存（拼装期间位姿不变，提升开始才变）
      const sg = u.cells.map(c => c.grp).filter((v, i, a) => a.indexOf(v) === i).map(g => g + ':' + ps[g].dy + ':' + ps[g].r).join('|');
      let RC = I.rods.get(u.id); if (!RC || RC.sig !== sg) { const arr = [], cellAt = []; for (const c of u.cells) for (const rd of c.rods) { const a = xf(c.grp, rd[0]), b = xf(c.grp, rd[1]); arr.push(a[0], a[1], a[2], b[0], b[1], b[2]); cellAt.push(c); } RC = { sig: sg, arr, cellAt }; I.rods.set(u.id, RC); }
      for (let i = 0; i < nR * 6; i++) F.push(RC.arr[i]);
      let cur = RC.cellAt[Math.min(nR, RC.cellAt.length - 1)];
      // 正在拼的格子：格框 + 交叉线（取格子杆件的高度范围）
      const ys = cur.rods.flatMap(rd => [rd[0][1], rd[1][1]]), y0 = Math.min(...ys), y1 = Math.max(...ys), g = cur.grp;
      const q = [[cur.xa, cur.za], [cur.xb, cur.za], [cur.xb, cur.zb], [cur.xa, cur.zb]];
      for (const yy of [y0, y1]) for (let i = 0; i < 4; i++) seg(xf(g, [q[i][0], yy, q[i][1]]), xf(g, [q[(i + 1) % 4][0], yy, q[(i + 1) % 4][1]]));
      seg(xf(g, [cur.xa, y1, cur.za]), xf(g, [cur.xb, y1, cur.zb])); seg(xf(g, [cur.xb, y1, cur.za]), xf(g, [cur.xa, y1, cur.zb]));
      // 单元外轮廓（虚线感：分段画）
      const yU = xf(g, [u.xa, y1, u.za])[1], dash = (a, b) => { const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.floor(L / 3)); for (let i = 0; i < n; i += 2) { const s0 = i / n, s1 = Math.min(1, (i + 1) / n); seg([a[0] + (b[0] - a[0]) * s0, a[1], a[2] + (b[2] - a[2]) * s0], [a[0] + (b[0] - a[0]) * s1, a[1], a[2] + (b[2] - a[2]) * s1]); } };
      const U = [[u.xa, u.za], [u.xb, u.za], [u.xb, u.zb], [u.xa, u.zb]]; for (let i = 0; i < 4; i++) dash([U[i][0], yU, U[i][1]], [U[(i + 1) % 4][0], yU, U[(i + 1) % 4][1]]);
      // 胎架
      const cs = new Set(u.cells); let nj = 0;
      for (const j of m.jigs) { if (!cs.has(j.p.jigOf)) continue; const st = stOf(j.p, t); if (st < 0 || st >= 3) continue; const b = j.p.geo; nj++;
        const v = [[b.min[0], b.min[1], b.min[2]], [b.max[0], b.min[1], b.min[2]], [b.max[0], b.min[1], b.max[2]], [b.min[0], b.min[1], b.max[2]]];
        for (let i = 0; i < 4; i++) { const a = v[i], c = v[(i + 1) % 4]; seg(a, c); seg([a[0], b.max[1], a[2]], [c[0], b.max[1], c[2]]); seg(a, [a[0], b.max[1], a[2]]); } }
      // 汽车吊停位
      const fy = HZ.P.floorTop, cx = (cur.xa + cur.xb) / 2, cz = (cur.za + cur.zb) / 2, top = xf(g, [cx, y1, cz]);
      const ck = u.id + ':' + Math.floor(t);   // 停位按（单元, 天）缓存：一天挪一次车，臂每帧对准当前格
      let cr = I.crane.has(ck) ? I.crane.get(ck) : undefined; if (cr === undefined) {
      const cand = []; for (const o of [OFF, OFF + 6, OFF + 12, OFF + 18]) for (const f of [0, -0.15, 0.15, -0.3, 0.3, -0.45, 0.45]) { const ex = (u.xb - u.xa) * f, ez = (u.zb - u.za) * f; cand.push([cx + ex, u.za - o], [cx + ex, u.zb + o], [u.xa - o, cz + ez], [u.xb + o, cz + ez]); }
      cand.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
        cr = null; for (const [x, z] of cand) if (standOK(I, t, x, fy, z)) { cr = { x, y: fy, z }; break; } I.crane.set(ck, cr); }
      if (cr) cr = { x: cr.x, y: cr.y, z: cr.z };
      if (cr) { const yaw = Math.atan2(top[2] - cr.z, top[0] - cr.x), c = Math.cos(yaw), sn = Math.sin(yaw), W = (a, b, w) => [cr.x + a * c - w * sn, cr.y + b, cr.z + a * sn + w * c];
        const bx = (a0, b0, w0, a1, b1, w1) => { const v = [W(a0, b0, w0), W(a1, b0, w0), W(a1, b0, w1), W(a0, b0, w1), W(a0, b1, w0), W(a1, b1, w0), W(a1, b1, w1), W(a0, b1, w1)];
          for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(v[i], v[j]); };
        bx(-3.5, 0.4, -1.2, 3.5, 1.6, 1.2); bx(2.0, 1.6, -1.1, 3.4, 3.2, 1.1); bx(-1.6, 1.6, -0.9, 0.8, 2.6, 0.9);   // 底盘、驾驶室、转台
        const foot = W(0, 2.8, 0), hd = Math.hypot(top[0] - cr.x, top[2] - cr.z), tip = [cr.x + c * hd, Math.max(top[1] + 6, cr.y + 12), cr.z + sn * hd];
        seg(foot, tip); seg(tip, [tip[0], top[1] + 1, tip[2]]); for (const w of [-1.1, 1.1]) for (const a of [-3, 3]) seg(W(a, 0.4, w), W(a, 0, w * 2.2));   // 臂、钩、支腿
        out.cranes.push(Object.assign(cr, { yaw, unit: u.id })); }
      out.live.push({ id: u.id, cell: cur, jigs: nj, rods: nR }); out.rods += nR;
    }
    return out;
  }

  const MOD = { id: 's251-face', OFF, standOK: (HZ, t, x, y, z) => standOK(MOD.I || (MOD.I = index(HZ)), t, x, y, z),
    lines: (HZ, t) => lines(HZ, MOD.I || (MOD.I = index(HZ)), t, { face: [] }),
    stats: { live: 0, segs: 0, cranes: 0 },
    build(scene, HZ, THREE, opts) { opts = opts || {}; this.HZ = HZ; this.I = index(HZ); this.L = { face: [] }; this.key = null;
      THREE = THREE || ROOT.THREE;
      if (THREE && scene) { const g = new THREE.BufferGeometry(); this.buf = new Float32Array(MAXSEG * 6); this.attr = new THREE.BufferAttribute(this.buf, 3); this.attr.setUsage && this.attr.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', this.attr); g.setDrawRange(0, 0);
        const clip = Array.isArray(opts.clip) && opts.clip.length ? { clippingPlanes: opts.clip } : {};
        this.obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial(Object.assign({ color: 0xb3261e, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }, clip))); this.obj.frustumCulled = false; this.obj.renderOrder = 7; scene.add(this.obj); }
      return this; },
    update(t, cam) { if (!this.HZ) return 0; const key = Math.round(t * 8);   // 3 小时重算一次 if (key === this.key) return this.stats.segs; this.key = key;
      const L = lines(this.HZ, this.I, t, this.L), n = Math.min(L.face.length, MAXSEG * 6);
      this.stats.live = L.live.length; this.stats.segs = n / 6; this.stats.cranes = L.cranes.length;
      if (this.obj) { this.buf.set(L.face.length > n ? L.face.slice(0, n) : L.face); this.obj.geometry.setDrawRange(0, n / 3); this.attr.needsUpdate = true; this.obj.visible = n > 0; }
      return n / 6; },
  };
  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(MOD);
})();
