// S-251 网架拼装 · 施工面 3D 模块（hark-liuzhijie；B-5 吊车精修：g-fangyi）· 接 window.HZ_MODS 钩子（同 actors / s101-volume）
// 委托人：3D 里要看得出「今天在哪儿干」。本模块把 S-251 当天在拼的单元标红，数据全读 S-251 插件（model / stateAt），不另排：
//  1. 在拼单元（stateAt.live）：已拼杆件 = 单元 rods 的前 floor(进度 × 根数) 根，红实线；正在拼的那一格画格框 + 交叉线；
//     单元外轮廓红虚线（还没拼的范围）。杆件端点经 HZ.xf(HZ.pose(t), 格子 grp, p) 换到当前位姿（提升前在胎架上的高度），与宿主同口径。
//  2. 胎架：托着在拼单元格子的胎架（jig.jigOf 属于该单元）画红框，看得出单元下面哪些胎架在受力。
//  3. 吊车精修（B-5）：25 t 汽车吊（底盘/六轮/展开支腿与垫板/驾驶室/转台/伸缩箱形臂）与悬挑端履带吊（双履带/上车机棚/配重/驾驶室/人字架/四弦格构臂），
//     通过 InstancedMesh + 墨线纸白遮挡 / 实景受光涂装双模式渲染，消除原 3 盒透视线框占位感。Node 检查：tools/hz/check_s251.js 末节。
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const MAXSEG = 12000, MAX_CR_SEG = 6000, MAX_BOOM_SEG = 4000, MAX_INST = 16, OFF = 8;
  const plug = () => (ROOT.HZ_SHEET_PLUGINS || []).find(p => p.id === 'S-251');
  const stOf = (p, t) => { if (p.st == null || t < p.st) return -1; if (p.rm && p.rm[0] >= 0 && t >= p.rm[0]) return t >= p.rm[0] + p.rm[1] ? 3 : 2; return t < p.st + p.du ? (t - p.st) / p.du : 2; };

  // ---------- 吊车双模式几何原型（墨线纸白遮挡 + 实景工程涂装） ----------
  const PAPER = [0.94, 0.91, 0.85];
  const LP = {
    yellow: [0.92, 0.66, 0.10], orange: [0.86, 0.34, 0.10], tire: [0.16, 0.17, 0.19],
    rim: [0.72, 0.74, 0.77], steel: [0.38, 0.41, 0.45], steelL: [0.68, 0.71, 0.75],
    glass: [0.16, 0.25, 0.33], cabW: [0.91, 0.89, 0.84], conc: [0.58, 0.56, 0.52]
  };
  const SUN = [-0.45, 0.78, 0.43], SUN_L = Math.hypot(SUN[0], SUN[1], SUN[2]);
  const SX = SUN[0] / SUN_L, SY = SUN[1] / SUN_L, SZ = SUN[2] / SUN_L;
  let _CL = null;

  const seg = (out, a, b) => { out.push(a[0], a[1], a[2], b[0], b[1], b[2]); };
  const poly = (out, pts, close) => { for (let i = 0; i < pts.length - (close ? 0 : 1); i++) seg(out, pts[i], pts[(i + 1) % pts.length]); };
  const ring = (out, c, r, axis, n) => {
    n = n || 8; const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, u = Math.cos(a) * r, v = Math.sin(a) * r;
      pts.push(axis === 'x' ? [c[0], c[1] + u, c[2] + v] : axis === 'z' ? [c[0] + u, c[1] + v, c[2]] : [c[0] + u, c[1], c[2] + v]);
    }
    poly(out, pts, true);
  };
  const boxL = (out, x0, y0, z0, x1, y1, z1) => {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(out, v[a], v[b]);
  };
  const prismL = (out, b, t) => {
    for (let i = 0; i < 4; i++) { seg(out, b[i], b[(i + 1) % 4]); seg(out, t[i], t[(i + 1) % 4]); seg(out, b[i], t[i]); }
  };
  const triS = (P, C, a, b, c, col, shade) => {
    let s = shade;
    if (s == null) {
      const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
      const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      s = Math.min(1.02, 0.90 + 0.06 * (0.5 + 0.5 * ny) + 0.06 * Math.max(0, nx * SX + ny * SY + nz * SZ));
    } else { s = 0.92 + (s - 0.75) * 0.28; }
    P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) C.push(Math.min(1, PAPER[0] * s), Math.min(1, PAPER[1] * s), Math.min(1, PAPER[2] * s));
    if (_CL) {
      const lc = col || PAPER;
      const r = Math.pow(lc[0], 2.2), g = Math.pow(lc[1], 2.2), bl = Math.pow(lc[2], 2.2);
      for (let i = 0; i < 3; i++) _CL.push(r, g, bl);
    }
  };
  const quadS = (P, C, a, b, c, d, col, shade) => { triS(P, C, a, b, c, col, shade); triS(P, C, a, c, d, col, shade); };
  const prismS = (P, C, b, t, col) => {
    quadS(P, C, b[0], b[3], b[2], b[1], col, 0.76);
    quadS(P, C, t[0], t[1], t[2], t[3], col, 1.04);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quadS(P, C, b[i], b[j], t[j], t[i], col); }
  };
  const boxS = (P, C, x0, y0, z0, x1, y1, z1, col) => {
    prismS(P, C, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], col);
  };
  const tubeS = (P, C, a, b, r0, r1, n, col, cap) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / L, uy = dy / L, uz = dz / L;
    const hx = Math.abs(uy) < 0.9 ? 0 : 1, hy = Math.abs(uy) < 0.9 ? 1 : 0, hz = 0;
    let e1x = uy * hz - uz * hy, e1y = uz * hx - ux * hz, e1z = ux * hy - uy * hx;
    const l1 = Math.hypot(e1x, e1y, e1z) || 1; e1x /= l1; e1y /= l1; e1z /= l1;
    const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;
    const R0 = [], R1 = [];
    for (let i = 0; i < n; i++) {
      const ang = i / n * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
      const ox = e1x * cs + e2x * sn, oy = e1y * cs + e2y * sn, oz = e1z * cs + e2z * sn;
      R0.push([a[0] + ox * r0, a[1] + oy * r0, a[2] + oz * r0]);
      R1.push([b[0] + ox * r1, b[1] + oy * r1, b[2] + oz * r1]);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      quadS(P, C, R0[i], R0[j], R1[j], R1[i], col);
      if (cap) { triS(P, C, a, R0[j], R0[i], col); triS(P, C, b, R1[i], R1[j], col); }
    }
  };

  function buildTruckProto() {
    const o = [], P = [], C = [], CL = []; _CL = CL;
    const wheel = (x, z, r) => {
      const cn = 10, sgn = z > 0 ? 1 : -1, zOut = z, zIn = z - sgn * 0.30;
      for (let i = 0; i < cn; i++) {
        const a0 = i / cn * Math.PI * 2, a1 = (i + 1) / cn * Math.PI * 2;
        const c0 = Math.cos(a0) * r, s0 = Math.sin(a0) * r, c1 = Math.cos(a1) * r, s1 = Math.sin(a1) * r;
        quadS(P, C, [x + c0, r + s0, zOut], [x + c1, r + s1, zOut], [x + c1, r + s1, zIn], [x + c0, r + s0, zIn], LP.tire);
        triS(P, C, [x, r, zOut], [x + c0, r + s0, zOut], [x + c1, r + s1, zOut], LP.tire, 0.85);
        triS(P, C, [x, r, zIn], [x + c1, r + s1, zIn], [x + c0, r + s0, zIn], LP.tire, 0.72);
      }
      tubeS(P, C, [x, r, zOut], [x, r, zOut + sgn * 0.05], r * 0.24, r * 0.18, 6, LP.rim, true);
      ring(o, [x, r, zOut + sgn * 0.01], r, 'z', cn); ring(o, [x, r, zIn - sgn * 0.01], r, 'z', cn);
      ring(o, [x, r, zOut + sgn * 0.02], r * 0.52, 'z', 8);
    };
    const axle = (x, hz, r) => { tubeS(P, C, [x, r, -hz + 0.14], [x, r, hz - 0.14], 0.10, 0.10, 6, LP.steel, false); wheel(x, -hz, r); wheel(x, hz, r); };
    // 25 t 汽车吊：底盘纵梁 + 甲板 + 三桥六轮 + 四向展开支腿与接地垫板 + 车头驾驶室 + 回转台与上车操作室 + 配重
    boxS(P, C, -3.7, 0.72, -1.16, 3.6, 1.32, 1.16, LP.steel); boxL(o, -3.7, 0.72, -1.16, 3.6, 1.32, 1.16);
    boxS(P, C, -3.7, 1.32, -1.24, 2.0, 1.48, 1.24, LP.yellow); boxL(o, -3.7, 1.32, -1.24, 2.0, 1.48, 1.24);
    axle(-2.65, 1.16, 0.48); axle(-1.45, 1.16, 0.48); axle(2.45, 1.16, 0.48);
    // 展开的 4 条液压支腿（横梁 + 竖向支腿缸 + 接地垫板 y = 0）
    for (const ax of [-3.15, 1.55]) {
      boxS(P, C, ax - 0.22, 0.76, -2.35, ax + 0.22, 1.06, 2.35, LP.yellow);
      boxL(o, ax - 0.22, 0.76, -2.35, ax + 0.22, 1.06, 2.35);
      for (const s of [-1, 1]) {
        const z = s * 2.22;
        tubeS(P, C, [ax, 0.08, z], [ax, 1.10, z], 0.11, 0.13, 6, LP.steelL, true);
        boxS(P, C, ax - 0.30, 0.0, z - 0.30, ax + 0.30, 0.08, z + 0.30, LP.steel);
        boxL(o, ax - 0.30, 0.0, z - 0.30, ax + 0.30, 0.08, z + 0.30);
        seg(o, [ax, 0.08, z], [ax, 1.10, z]);
      }
    }
    // 车头驾驶室
    const cb = [[2.0, 1.32, -1.18], [3.65, 1.32, -1.18], [3.65, 1.32, 1.18], [2.0, 1.32, 1.18]];
    const cm = [[2.0, 2.08, -1.18], [3.65, 2.08, -1.18], [3.65, 2.08, 1.18], [2.0, 2.08, 1.18]];
    const ct = [[2.0, 2.95, -1.14], [3.42, 2.95, -1.14], [3.42, 2.95, 1.14], [2.0, 2.95, 1.14]];
    prismS(P, C, cb, cm, LP.yellow); prismS(P, C, cm, ct, LP.yellow);
    prismL(o, cb, cm); prismL(o, cm, ct);
    const wf = [[3.66, 2.14, -1.04], [3.66, 2.14, 1.04], [3.44, 2.86, 1.04], [3.44, 2.86, -1.04]];
    quadS(P, C, wf[0], wf[1], wf[2], wf[3], LP.glass, 1.02); poly(o, wf, true);
    boxS(P, C, 3.55, 0.85, -1.20, 3.82, 1.24, 1.20, LP.steel); boxL(o, 3.55, 0.85, -1.20, 3.82, 1.24, 1.20);
    // 回转支承 + 上车转台 + 尾部配重 + 侧置操作室
    tubeS(P, C, [-0.55, 1.48, 0], [-0.55, 1.72, 0], 0.92, 0.92, 10, LP.steel, true);
    boxS(P, C, -2.55, 1.72, -1.02, 0.85, 2.78, 1.02, LP.yellow); boxL(o, -2.55, 1.72, -1.02, 0.85, 2.78, 1.02);
    boxS(P, C, -3.25, 1.78, -1.08, -2.55, 2.72, 1.08, LP.conc); boxL(o, -3.25, 1.78, -1.08, -2.55, 2.72, 1.08);
    boxS(P, C, -0.35, 1.72, 0.56, 0.95, 3.12, 1.34, LP.cabW); boxL(o, -0.35, 1.72, 0.56, 0.95, 3.12, 1.34);
    const ow = [[0.96, 2.02, 0.64], [0.96, 2.02, 1.26], [0.96, 3.00, 1.26], [0.96, 3.00, 0.64]];
    quadS(P, C, ow[0], ow[1], ow[2], ow[3], LP.glass, 1.02); poly(o, ow, true);
    _CL = null;
    return { L: new Float32Array(o), P: new Float32Array(P), C: new Float32Array(C), CL: new Float32Array(CL) };
  }

  function buildCrawlerProto() {
    const o = [], P = [], C = [], CL = []; _CL = CL;
    for (const s of [-1, 1]) {
      const z0 = s * 2.25;
      boxS(P, C, -3.6, 0, z0 - 0.52, 3.6, 1.18, z0 + 0.52, LP.tire);
      boxL(o, -3.6, 0, z0 - 0.52, 3.6, 1.18, z0 + 0.52);
      for (const tx of [-3.6, 3.6]) {
        tubeS(P, C, [tx, 0.59, z0 - 0.53], [tx, 0.59, z0 + 0.53], 0.58, 0.58, 10, LP.tire, true);
        ring(o, [tx, 0.59, z0 + s * 0.54], 0.56, 'z', 10);
      }
      for (let x = -3.0; x <= 3.01; x += 0.75) { seg(o, [x, 0.02, z0 - 0.53], [x, 1.16, z0 - 0.53]); seg(o, [x, 0.02, z0 + 0.53], [x, 1.16, z0 + 0.53]); }
    }
    boxS(P, C, -1.6, 0.44, -1.74, 1.6, 1.14, 1.74, LP.steel); boxL(o, -1.6, 0.44, -1.74, 1.6, 1.14, 1.74);
    tubeS(P, C, [0, 1.14, 0], [0, 1.32, 0], 1.32, 1.32, 12, LP.steel, true); ring(o, [0, 1.24, 0], 1.32, 'y', 10);
    boxS(P, C, -2.5, 1.32, -1.72, 2.2, 3.35, 1.72, LP.orange); boxL(o, -2.5, 1.32, -1.72, 2.2, 3.35, 1.72);
    boxS(P, C, -3.55, 1.40, -1.62, -2.5, 3.18, 1.62, LP.conc); boxL(o, -3.55, 1.40, -1.62, -2.5, 3.18, 1.62);
    boxS(P, C, 1.05, 1.32, 1.02, 2.65, 3.25, 2.02, LP.cabW); boxL(o, 1.05, 1.32, 1.02, 2.65, 3.25, 2.02);
    const fw = [[2.66, 1.58, 1.14], [2.66, 1.58, 1.90], [2.66, 3.08, 1.90], [2.66, 3.08, 1.14]];
    quadS(P, C, fw[0], fw[1], fw[2], fw[3], LP.glass, 1.02); poly(o, fw, true);
    _CL = null;
    return { L: new Float32Array(o), P: new Float32Array(P), C: new Float32Array(C), CL: new Float32Array(CL) };
  }

  const PROTO = { truck: buildTruckProto(), crawler: buildCrawlerProto() };

  function emitLines(buf, n, L, x, y, z, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw), m = L.length / 3;
    if (n + m / 2 > MAX_CR_SEG) return n;
    let o = n * 6;
    for (let i = 0; i < L.length; i += 3) {
      const u = L[i], v = L[i + 1], w = L[i + 2];
      buf[o++] = x + u * c - w * s; buf[o++] = y + v; buf[o++] = z + u * s + w * c;
    }
    return n + m / 2;
  }
  function pushInst(slot, x, y, z, yaw) {
    if (!slot || slot.n >= slot.cap) return;
    const a = slot.arr, o = slot.n * 16, c = Math.cos(yaw), s = Math.sin(yaw);
    a[o] = c; a[o + 1] = 0; a[o + 2] = s; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = -s; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
    slot.n++;
  }
  // 四弦格构臂（履带吊）与多节伸缩箱形臂（25 t 汽车吊）+ 吊钩滑轮组
  function emitBoom(buf, n, cr) {
    const ca = Math.cos(cr.yaw), sa = Math.sin(cr.yaw);
    const fx = cr.x + ca * (cr.hoist ? 1.75 : -0.65), fy = cr.y + (cr.hoist ? 2.85 : 2.65), fz = cr.z + sa * (cr.hoist ? 1.75 : -0.65);
    const tx = cr.tip[0], ty = cr.tip[1], tz = cr.tip[2];
    const dx = tx - fx, dy = ty - fy, dz = tz - fz, L = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / L, uy = dy / L, uz = dz / L, rx = -sa, rz = ca;
    const vx = -uy * rz, vy = ux * rz - uz * rx, vz = uy * rx;
    const bays = cr.hoist ? Math.max(8, Math.min(16, Math.round(L / 2.6))) : 3;
    const need = 4 + bays * (cr.hoist ? 8 : 4) + 28;
    if (n + need > MAX_BOOM_SEG) return n;
    let o = n * 6;
    const put = (ax, ay, az, bx, by, bz) => { buf[o++] = ax; buf[o++] = ay; buf[o++] = az; buf[o++] = bx; buf[o++] = by; buf[o++] = bz; n++; };
    const pt = (f, sr, sv) => {
      const hw = cr.hoist ? (0.62 - 0.24 * f) : (0.34 - 0.14 * f);
      const hv = cr.hoist ? hw : (0.44 - 0.18 * f);
      return [fx + dx * f + rx * (sr * hw) + vx * (sv * hv), fy + dy * f + vy * (sv * hv), fz + dz * f + rz * (sr * hw) + vz * (sv * hv)];
    };
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sr, sv] of cs) { const a = pt(0, sr, sv), b = pt(1, sr, sv); put(a[0], a[1], a[2], b[0], b[1], b[2]); }
    for (let i = 0; i < bays; i++) {
      const f0 = i / bays, f1 = (i + 1) / bays;
      const p0 = cs.map(([sr, sv]) => pt(f0, sr, sv)), p1 = cs.map(([sr, sv]) => pt(f1, sr, sv));
      for (let j = 0; j < 4; j++) {
        const jn = (j + 1) % 4;
        if (i > 0) put(p0[j][0], p0[j][1], p0[j][2], p0[jn][0], p0[jn][1], p0[jn][2]);
        if (cr.hoist) { const a = (i % 2 === 0) ? p0[j] : p0[jn], b = (i % 2 === 0) ? p1[jn] : p1[j]; put(a[0], a[1], a[2], b[0], b[1], b[2]); }
      }
    }
    if (cr.hoist) {
      const g2w = (u, v, w) => [cr.x + u * ca - w * sa, cr.y + v, cr.z + u * sa + w * ca];
      for (const s of [-1.12, 1.12]) {
        const a = g2w(-2.45, 3.35, s), b = g2w(-0.65, 3.35, s), gt = g2w(-2.55, 5.45, s * 0.64);
        put(a[0], a[1], a[2], gt[0], gt[1], gt[2]); put(b[0], b[1], b[2], gt[0], gt[1], gt[2]);
      }
      const gL = g2w(-2.55, 5.45, -0.80), gR = g2w(-2.55, 5.45, 0.80); put(gL[0], gL[1], gL[2], gR[0], gR[1], gR[2]);
      for (const s of [-0.72, 0.72]) put(cr.x - ca * 2.55 - sa * s, cr.y + 5.45, cr.z - sa * 2.55 + ca * s, tx - sa * (s * 0.45), ty + 0.35, tz + ca * (s * 0.45));
    } else {
      // 汽车吊变幅油缸
      const pm = pt(0.28, 0, -1);
      put(cr.x + ca * 0.35, cr.y + 1.85, cr.z + sa * 0.35, pm[0], pm[1], pm[2]);
    }
    const hk = cr.hook;
    for (const s of [-0.14, 0.14]) put(tx - sa * s, ty, tz + ca * s, tx - sa * s, hk + 0.65, tz + ca * s);
    for (const y of [hk + 0.15, hk + 0.65]) {
      put(tx - 0.24, y, tz - 0.18, tx + 0.24, y, tz - 0.18); put(tx + 0.24, y, tz - 0.18, tx + 0.24, y, tz + 0.18);
      put(tx + 0.24, y, tz + 0.18, tx - 0.24, y, tz + 0.18); put(tx - 0.24, y, tz + 0.18, tx - 0.24, y, tz - 0.18);
    }
    put(tx, hk + 0.15, tz, tx, hk - 0.28, tz); put(tx, hk - 0.28, tz, tx + 0.22, hk - 0.42, tz);
    return n;
  }

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

  // 吊装单元（端部悬挑，楼面以外）：履带吊停在楼板端头以外的下层（脚下取在场构件顶面最高者，没有就是地面 0），[x±4, y..y+5, z±4] 不压构件
  function standLow(I, t, x, z, yMax) { const es = near(I, x - 5, z - 5, x + 5, z + 5).filter(e => { const s = stOf(e.p, t); return s >= 0 && s < 3; });
    let y = 0; for (const e of es) if (e.b.min[0] <= x && e.b.max[0] >= x && e.b.min[2] <= z && e.b.max[2] >= z && e.b.max[1] < yMax - 1 && e.b.max[1] > y) y = e.b.max[1];
    const hit = es.some(e => e.b.max[0] > x - 4 && e.b.min[0] < x + 4 && e.b.max[2] > z - 4 && e.b.min[2] < z + 4 && e.b.max[1] > y + 0.05 && e.b.min[1] < y + 5);
    return hit ? null : y; }

  function lines(HZ, I, t, out) {
    out.face.length = 0; out.live = []; out.cranes = []; out.rods = 0;
    const P = plug(); if (!P || !P.stateAt) return out;
    const m = P.model(), s = P.stateAt(t); if (!s.live.length) return out;
    const ps = HZ.pose(t), xf = (g, p) => HZ.xf(ps, g, p), F = out.face, segF = (a, b) => F.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    for (const u of s.live) {
      const k = s.frac(u), nR = Math.floor(u.rods * k);
      const sg = u.cells.map(c => c.grp).filter((v, i, a) => a.indexOf(v) === i).map(g => g + ':' + ps[g].dy + ':' + ps[g].r).join('|');
      let RC = I.rods.get(u.id); if (!RC || RC.sig !== sg) { const arr = [], cellAt = []; for (const c of u.cells) for (const rd of c.rods) { const a = xf(c.grp, rd[0]), b = xf(c.grp, rd[1]); arr.push(a[0], a[1], a[2], b[0], b[1], b[2]); cellAt.push(c); } RC = { sig: sg, arr, cellAt }; I.rods.set(u.id, RC); }
      for (let i = 0; i < nR * 6; i++) F.push(RC.arr[i]);
      let cur = RC.cellAt[Math.min(nR, RC.cellAt.length - 1)];
      const ys = cur.rods.flatMap(rd => [rd[0][1], rd[1][1]]), y0 = Math.min(...ys), y1 = Math.max(...ys), g = cur.grp;
      const q = [[cur.xa, cur.za], [cur.xb, cur.za], [cur.xb, cur.zb], [cur.xa, cur.zb]];
      for (const yy of [y0, y1]) for (let i = 0; i < 4; i++) segF(xf(g, [q[i][0], yy, q[i][1]]), xf(g, [q[(i + 1) % 4][0], yy, q[(i + 1) % 4][1]]));
      segF(xf(g, [cur.xa, y1, cur.za]), xf(g, [cur.xb, y1, cur.zb])); segF(xf(g, [cur.xb, y1, cur.za]), xf(g, [cur.xa, y1, cur.zb]));
      const yU = xf(g, [u.xa, y1, u.za])[1], dash = (a, b) => { const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.floor(L / 3)); for (let i = 0; i < n; i += 2) { const s0 = i / n, s1 = Math.min(1, (i + 1) / n); segF([a[0] + (b[0] - a[0]) * s0, a[1], a[2] + (b[2] - a[2]) * s0], [a[0] + (b[0] - a[0]) * s1, a[1], a[2] + (b[2] - a[2]) * s1]); } };
      const U = [[u.xa, u.za], [u.xb, u.za], [u.xb, u.zb], [u.xa, u.zb]]; for (let i = 0; i < 4; i++) dash([U[i][0], yU, U[i][1]], [U[(i + 1) % 4][0], yU, U[(i + 1) % 4][1]]);
      // 胎架
      const cs = new Set(u.cells); let nj = 0;
      for (const j of m.jigs) { if (!cs.has(j.p.jigOf)) continue; const st = stOf(j.p, t); if (st < 0 || st >= 3) continue; const b = j.p.geo; nj++;
        const v = [[b.min[0], b.min[1], b.min[2]], [b.max[0], b.min[1], b.min[2]], [b.max[0], b.min[1], b.max[2]], [b.min[0], b.min[1], b.max[2]]];
        for (let i = 0; i < 4; i++) { const a = v[i], c = v[(i + 1) % 4]; segF(a, c); segF([a[0], b.max[1], a[2]], [c[0], b.max[1], c[2]]); segF(a, [a[0], b.max[1], a[2]]); } }
      // 汽车吊 / 悬挑履带吊停位（实体 + 桁架/伸缩臂由独立通道渲染，不再写进透视红线）
      const fy = HZ.P.floorTop, cx = (cur.xa + cur.xb) / 2, cz = (cur.za + cur.zb) / 2, top = xf(g, [cx, y1, cz]);
      const ck = u.id + ':' + Math.floor(t);
      let cr = I.crane.has(ck) ? I.crane.get(ck) : undefined; if (cr === undefined) {
        const cand = []; for (const o of [OFF, OFF + 6, OFF + 12, OFF + 18]) for (const f of [0, -0.15, 0.15, -0.3, 0.3, -0.45, 0.45]) { const ex = (u.xb - u.xa) * f, ez = (u.zb - u.za) * f; cand.push([cx + ex, u.za - o], [cx + ex, u.zb + o], [u.xa - o, cz + ez], [u.xb + o, cz + ez]); }
        cand.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
        cr = null; if (u.hoist) { const zE = u.hoistEnd === 'S' ? u.zb : u.za, sg2 = u.hoistEnd === 'S' ? 1 : -1;
          for (const o of [12, 18, 24, 30, 36]) { for (const f of [0, -0.2, 0.2, -0.4, 0.4]) { const x = cx + (u.xb - u.xa) * f, z = zE + sg2 * o, y = standLow(I, t, x, z, fy); if (y != null) { cr = { x, y, z, hoist: true }; break; } } if (cr) break; } }
        else for (const [x, z] of cand) if (standOK(I, t, x, fy, z)) { cr = { x, y: fy, z }; break; } I.crane.set(ck, cr); }
      if (cr) {
        const yaw = Math.atan2(top[2] - cr.z, top[0] - cr.x), c = Math.cos(yaw), sn = Math.sin(yaw);
        const hd = Math.hypot(top[0] - cr.x, top[2] - cr.z);
        const tip = [cr.x + c * hd, Math.max(top[1] + 6, cr.y + 12), cr.z + sn * hd];
        out.cranes.push({ x: cr.x, y: cr.y, z: cr.z, hoist: !!cr.hoist, yaw, unit: u.id, tip, hook: top[1] + 1 });
      }
      out.live.push({ id: u.id, cell: cur, jigs: nj, rods: nR, hoist: !!u.hoist }); out.rods += nR;
    }
    return out;
  }

  const MOD = { id: 's251-face', OFF, standOK: (HZ, t, x, y, z) => standOK(MOD.I || (MOD.I = index(HZ)), t, x, y, z),
    lines: (HZ, t) => lines(HZ, MOD.I || (MOD.I = index(HZ)), t, { face: [] }),
    stats: { live: 0, segs: 0, cranes: 0, insts: 0 },
    applyMode(isLit) {
      this.lastLit = !!isLit;
      if (this.craneLines && this.craneLines.material) this.craneLines.material.opacity = isLit ? 0.14 : 0.92;
      if (this.boomLines && this.boomLines.material) this.boomLines.material.opacity = isLit ? 0.85 : 0.92;
      for (let i = 0; i < this.instList.length; i++) {
        const sl = this.instList[i];
        sl.mesh.material = isLit ? this.matLit : this.matInk;
        sl.mesh.geometry.setAttribute('color', isLit ? sl.attrLit : sl.attrInk);
      }
    },
    build(scene, HZ, THREE, opts) { opts = opts || {}; this.HZ = HZ; this.I = index(HZ); this.L = { face: [] }; this.key = null;
      this.obj = null; this.craneLines = null; this.boomLines = null; this.instTruck = null; this.instCrawler = null; this.instList = []; this.lastLit = false;
      this.matInk = null; this.matLit = null;
      THREE = THREE || ROOT.THREE;
      if (THREE && scene) {
        const clip = Array.isArray(opts.clip) && opts.clip.length ? { clippingPlanes: opts.clip } : {};
        const g = new THREE.BufferGeometry(); this.buf = new Float32Array(MAXSEG * 6); this.attr = new THREE.BufferAttribute(this.buf, 3); this.attr.setUsage && this.attr.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', this.attr); g.setDrawRange(0, 0);
        this.obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial(Object.assign({ color: 0xb3261e, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }, clip)));
        this.obj.frustumCulled = false; this.obj.renderOrder = 7; scene.add(this.obj);
        // 吊车机身轮廓线通道（墨线清晰，实景淡化以避免生硬黑边）
        const cg = new THREE.BufferGeometry(); this.crBuf = new Float32Array(MAX_CR_SEG * 6); this.crAttr = new THREE.BufferAttribute(this.crBuf, 3); this.crAttr.setUsage && this.crAttr.setUsage(THREE.DynamicDrawUsage); cg.setAttribute('position', this.crAttr); cg.setDrawRange(0, 0);
        this.craneLines = new THREE.LineSegments(cg, new THREE.LineBasicMaterial(Object.assign({ color: 0x1c1a17, transparent: true, opacity: 0.92 }, clip)));
        this.craneLines.frustumCulled = false; this.craneLines.renderOrder = 6; scene.add(this.craneLines);
        // 独立吊臂/人字架/吊索通道（墨线与实景下均保持高清晰度，不随车身轮廓淡化）
        const bg = new THREE.BufferGeometry(); this.boomBuf = new Float32Array(MAX_BOOM_SEG * 6); this.boomAttr = new THREE.BufferAttribute(this.boomBuf, 3); this.boomAttr.setUsage && this.boomAttr.setUsage(THREE.DynamicDrawUsage); bg.setAttribute('position', this.boomAttr); bg.setDrawRange(0, 0);
        this.boomLines = new THREE.LineSegments(bg, new THREE.LineBasicMaterial(Object.assign({ color: 0x1c1a17, transparent: true, opacity: 0.92 }, clip)));
        this.boomLines.frustumCulled = false; this.boomLines.renderOrder = 6; scene.add(this.boomLines);
        // 吊车实例化实体层（墨线 = 纸白消隐 MeshBasicMaterial；实景 = 工程涂装受光 MeshStandardMaterial + 阴影）
        if (THREE.InstancedMesh && THREE.MeshBasicMaterial) {
          this.matInk = new THREE.MeshBasicMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide || 2, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }, clip));
          this.matLit = THREE.MeshStandardMaterial ? new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.72, metalness: 0.14, side: THREE.DoubleSide || 2 }, opts.clip ? { clippingPlanes: opts.clip, clipShadows: true } : {})) : this.matInk;
          const mkSlot = (pr, name) => {
            const sg = new THREE.BufferGeometry();
            sg.setAttribute('position', new THREE.BufferAttribute(pr.P, 3));
            if (sg.computeVertexNormals) sg.computeVertexNormals();
            const attrInk = new THREE.BufferAttribute(pr.C, 3);
            const attrLit = new THREE.BufferAttribute(pr.CL, 3);
            sg.setAttribute('color', attrInk);
            const im = new THREE.InstancedMesh(sg, this.matInk, MAX_INST);
            im.count = 0; im.frustumCulled = false; im.renderOrder = 5; im.name = name;
            im.castShadow = true; im.receiveShadow = true;
            if (im.instanceMatrix && im.instanceMatrix.setUsage) im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            scene.add(im);
            const slot = { mesh: im, arr: im.instanceMatrix.array, attrInk, attrLit, cap: MAX_INST, n: 0, prev: 0 };
            this.instList.push(slot);
            return slot;
          };
          this.instTruck = mkSlot(PROTO.truck, 'hz-s251-truck');
          this.instCrawler = mkSlot(PROTO.crawler, 'hz-s251-crawler');
        }
      }
      return this; },
    update(t, cam) {
      if (!this.HZ) return 0;
      const isLit = ROOT.__pv && typeof ROOT.__pv.blend === 'number' ? ROOT.__pv.blend > 0.5 : !!(typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('lit'));
      if (this.craneLines && isLit !== this.lastLit) this.applyMode(isLit);
      const key = Math.round(t * 8); if (key === this.key) return this.stats.segs; this.key = key;
      const L = lines(this.HZ, this.I, t, this.L), n = Math.min(L.face.length, MAXSEG * 6);
      this.stats.live = L.live.length; this.stats.segs = n / 6; this.stats.cranes = L.cranes.length;
      if (this.obj) { this.buf.set(L.face.length > n ? L.face.slice(0, n) : L.face); this.obj.geometry.setDrawRange(0, n / 3); this.attr.needsUpdate = true; this.obj.visible = n > 0; }
      if (this.craneLines) {
        for (let i = 0; i < this.instList.length; i++) this.instList[i].n = 0;
        let cn = 0, bn = 0;
        for (const cr of L.cranes) {
          const pr = cr.hoist ? PROTO.crawler : PROTO.truck;
          cn = emitLines(this.crBuf, cn, pr.L, cr.x, cr.y, cr.z, cr.yaw);
          bn = emitBoom(this.boomBuf, bn, cr);
          pushInst(cr.hoist ? this.instCrawler : this.instTruck, cr.x, cr.y, cr.z, cr.yaw);
        }
        this.craneLines.geometry.setDrawRange(0, cn * 2); this.crAttr.needsUpdate = true; this.craneLines.visible = cn > 0;
        if (this.boomLines) { this.boomLines.geometry.setDrawRange(0, bn * 2); this.boomAttr.needsUpdate = true; this.boomLines.visible = bn > 0; }
        let insts = 0;
        for (let i = 0; i < this.instList.length; i++) {
          const sl = this.instList[i]; insts += sl.n;
          if (sl.n !== sl.prev || sl.n > 0) { sl.mesh.count = sl.n; if (sl.n > 0) sl.mesh.instanceMatrix.needsUpdate = true; sl.prev = sl.n; }
        }
        this.stats.insts = insts;
      }
      return n / 6; },
  };
  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(MOD);
})();
