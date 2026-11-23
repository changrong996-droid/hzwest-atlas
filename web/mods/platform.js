// 站台竖向交通与站台设施（任务 #42 · 提案 hark-liuzhijie）· fo-changrong。每座岛式站台 2 组上行竖向交通：
// 楼梯（1.6 m）＋扶梯（1.0 m，坡 30°，提升 9.5 m：14.5 → 24 m）并列＋垂梯井；楼面开洞三边玻璃护栏。
// 设施：安全白线、盲道带、座椅、柱挂电子屏与车厢号牌（双模式，>180 m 隐藏）。仅开通期显示（t ≥ OPEN-10）。
// 让位：候车层柱（fxs 每 20 m，r 0.8）、雨棚柱（cxs ±133..220）、梭形钢柱（±115）均让出（交通带 +z 偏移避开柱心带）。
// 车门段（#33 W2）口径：组底端 x 取 ±80（XS 可调），W2 车门 x 段合入后微调。挂载行由集成人加。
// 挂载行由集成人加（本单 allowed_paths 不含宿主页）。接口：HZ_MODS.push({ id:'platform', build(scene,HZ,THREE,opts), update(t,cam), layout(HZ) })。
// 检查：node tools/hz/check_platform.js（两端标高 14.5/24、不穿柱不穿雨棚、股道限界、坡度、护栏设施齐全、update < 1.5 ms）。
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const INK = 0x1c1a17, MAXSEG = 12000;
  const RISE = 9.5, ANG = Math.PI / 6, RUN = RISE / Math.tan(ANG);   // 水平投影 16.45 m
  const XS = [-80, 80];                       // 每组底端 x（+80 组向 -x 上行）
  const ZC = { esc: [1.5, 2.5], stair: [2.7, 4.3], lift: [-4.6, -2.4] };   // 相对站台中心的横向带
  const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // 几何台账（检查器读这份）
  function layout(HZ) {
    const P = HZ.P, groups = [], opens = [], seats = [], screens = [], plates = [];
    for (const yk of ['S', 'N']) for (const pl of HZ.platforms(HZ.YARDS[yk])) {
      if (pl.w !== 11) continue;               // 只做岛式
      for (const bx of XS) {
        const dir = bx > 0 ? -1 : 1, xt = bx + dir * RUN, lo = Math.min(bx, xt), hi = Math.max(bx, xt);
        const g = (k, zc, y1) => ({ yard: yk, z: pl.z, kind: k, x0: lo, x1: hi, zLo: pl.z + zc[0], zHi: pl.z + zc[1], y0: P.platTop, y1, dir });
        groups.push(g('stair', ZC.stair, P.floorTop), g('esc', ZC.esc, P.floorTop));
        const l0 = xt + dir, l1 = xt + dir * 3.2;
        groups.push({ yard: yk, z: pl.z, kind: 'lift', x0: Math.min(l0, l1), x1: Math.max(l0, l1), zLo: pl.z + ZC.lift[0], zHi: pl.z + ZC.lift[1], y0: P.platTop, y1: P.floorTop + 2.8, dir });
        const cx = bx + dir * RUN * (P.floorBot - P.platTop) / RISE;   // 楼板底 22.8 处
        opens.push({ yard: yk, z: pl.z, x0: Math.min(cx - 0.2, xt + dir * 0.4), x1: Math.max(cx - 0.2, xt + dir * 0.4), zLo: pl.z + ZC.esc[0], zHi: pl.z + ZC.stair[1], y0: P.floorBot, y1: P.floorTop, dir });
        for (const off of [24, 38, 52]) seats.push({ x: bx + dir * off, z: pl.z - 3.4, y: P.platTop, yard: yk });
        for (const c of [-50, -10, 10, 50]) screens.push({ x: c, z: pl.z + 0.95, y0: P.platTop + 3, y1: P.platTop + 4, yard: yk });
        for (const c of [-70, -30, 30, 70]) plates.push({ x: c, z: pl.z + 0.2, y0: P.floorBot - 1.3, y1: P.floorBot - 0.6, yard: yk });
      }
    }
    return { groups, opens, seats, screens, plates, T_ON: P.OPEN - 10 };
  }

  function build(scene, HZ, THREE, opts) {
    opts = opts || {};
    this.HZ = HZ;
    this.clip = Array.isArray(opts.clip) && opts.clip.length ? opts.clip : null;
    this.L = layout(HZ);
    const P = HZ.P, buf = new Float32Array(MAXSEG * 6);
    let n = 0;
    const seg = (a, b) => { if (n < MAXSEG) { buf.set([a[0], a[1], a[2], b[0], b[1], b[2]], n * 6); n++; } };
    const box = (x0, y0, z0, x1, y1, z1) => { const c = [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]]; for (let i = 0; i < 4; i++) { seg(c[i], c[(i+1)%4]); seg(c[i+4], c[4+(i+1)%4]); seg(c[i], c[i+4]); } };
    for (const g of this.L.groups) {
      const zb = [g.zLo, g.zHi];
      if (g.kind === 'stair') {
        const N = 16, dh = RISE / N, dx = RUN / N;
        for (const z of zb) { let x = g.dir > 0 ? g.x0 : g.x1, y = g.y0; for (let i = 0; i < N; i++) { seg([x, y, z], [x, y + dh, z]); seg([x, y + dh, z], [x + g.dir * dx, y + dh, z]); x += g.dir * dx; y += dh; } seg([g.x0, g.y0 + 1, z], [g.x1, g.y1 + 1, z]); }
        seg([g.x0, g.y0, zb[0]], [g.x0, g.y0, zb[1]]);
      } else if (g.kind === 'esc') {
        for (const z of zb) { seg([g.x0, g.y0 + 0.9, z], [g.x1, g.y1 + 0.9, z]); seg([g.x0, g.y0, z], [g.x1, g.y1, z]); }
        seg([g.x0, g.y0, zb[0]], [g.x0, g.y0, zb[1]]); seg([g.x1, g.y1, zb[0]], [g.x1, g.y1, zb[1]]);
      } else box(g.x0, g.y0, g.zLo, g.x1, g.y1, g.zHi);
    }
    for (const o of this.L.opens) {   // 开洞三边护栏（入口侧留空）
      const e = o.dir > 0 ? o.x0 : o.x1, f = o.x0 + o.x1 - e;
      seg([e, o.y1, o.zLo], [e, o.y1 + 1.1, o.zLo]); seg([e, o.y1, o.zHi], [e, o.y1 + 1.1, o.zHi]); seg([e, o.y1 + 1.1, o.zLo], [e, o.y1 + 1.1, o.zHi]);
      for (const ze of [o.zLo, o.zHi]) { seg([e, o.y1 + 1.1, ze], [f, o.y1 + 1.1, ze]); for (let x = Math.min(e, f) + 1.2; x < Math.max(e, f) - 0.3; x += 1.2) seg([x, o.y1, ze], [x, o.y1 + 1.1, ze]); }
    }
    for (const yk of ['S', 'N']) for (const pl of HZ.platforms(HZ.YARDS[yk])) {
      if (pl.w !== 11) continue;
      for (const s of [-1, 1]) seg([-200, P.platTop + 0.02, pl.z + s * 4.9], [200, P.platTop + 0.02, pl.z + s * 4.9]);
      for (const s of [-0.3, 0.3]) seg([-200, P.platTop + 0.02, pl.z + s], [200, P.platTop + 0.02, pl.z + s]);
      for (const st of this.L.seats) if (st.yard === yk && Math.abs(st.z - pl.z) < 1) {
        box(st.x - 0.9, st.y + 0.55, st.z - 0.25, st.x + 0.9, st.y + 0.55, st.z + 0.25); box(st.x - 0.9, st.y + 0.55, st.z - 0.25, st.x + 0.9, st.y + 1.05, st.z - 0.25);
        for (const dx of [-0.75, 0.75]) seg([st.x + dx, st.y, st.z], [st.x + dx, st.y + 0.55, st.z]);
      }
      for (const sc of this.L.screens) if (Math.abs(sc.z - pl.z - 0.95) < 1) { box(sc.x - 1.3, sc.y0, sc.z, sc.x + 1.3, sc.y1, sc.z + 0.06); seg([sc.x, sc.y1, sc.z], [sc.x, sc.y1 + 0.4, sc.z]); }
      for (const p of this.L.plates) if (Math.abs(p.z - pl.z - 0.2) < 1) { box(p.x - 1, p.y0, p.z - 0.35, p.x + 1, p.y1, p.z + 0.35); seg([p.x - 0.6, p.y1, p.z], [p.x - 0.6, P.floorBot, p.z]); seg([p.x + 0.6, p.y1, p.z], [p.x + 0.6, P.floorBot, p.z]); }
    }
    this.buf = buf; this.n = n;
    THREE = THREE || ROOT.THREE;
    if (THREE && scene) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(buf, 3)); g.setDrawRange(0, n * 2);
      const mo = Object.assign({ color: INK, transparent: true, opacity: 0.92 }, this.clip ? { clippingPlanes: this.clip } : {});
      this.obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial(mo));
      this.obj.frustumCulled = false; this.obj.renderOrder = 5; this.obj.name = 'hz-platform';
      scene.add(this.obj);
      this.lit = new THREE.Group(); scene.add(this.lit);
      this.signs = [];
      const mesh = (w, h, d, x, y, z, col, at) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial(Object.assign({ color: col, transparent: true, opacity: 0.85 }, this.clip ? { clippingPlanes: this.clip } : {}))); m.position.set(x, y, z); this.lit.add(m); this.signs.push({ o: m, at }); };
      for (const sc of this.L.screens) mesh(2.6, 1, 0.08, sc.x, (sc.y0 + sc.y1) / 2, sc.z + 0.05, 0x2a6fb5, [sc.x, sc.y0, sc.z]);
      for (const p of this.L.plates) mesh(2, 0.7, 0.7, p.x, (p.y0 + p.y1) / 2, p.z, 0x186a3b, [p.x, p.y0, p.z]);
    } else { this.obj = null; this.lit = null; this.signs = []; }
    this.T_ON = this.L.T_ON;
    return this;
  }

  function update(t, cam) {
    const on = t >= this.T_ON;
    if (this.obj) this.obj.visible = on;
    if (this.lit) this.lit.visible = on && !!(ROOT.__pv && ROOT.__pv.blend > 0.5);
    if (this.signs && this.signs.length) {
      const p = cam && cam.position ? cam.position : null;
      for (const s of this.signs) s.o.visible = on && (!p || D([p.x, p.y, p.z], s.at) <= 180);
    }
  }

  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push({ id: 'platform', build, update, layout });
  ROOT.HZ_PLATFORM = { build, update, layout };
})();
