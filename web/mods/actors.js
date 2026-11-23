// 近景人员与车辆（docs/tasks/mods-actors.md）· 纸白遮挡体量 + 结构墨线精修版（InstancedMesh + 双档 LOD）
// 按 HZ.acts 当前在做的工序，在作业面生成墨线小人（站 / 推 / 焊 / 指挥 4 种姿态）与车辆设备（混凝土罐车、平板车、挖掘机、剪叉车、四弦格构臂履带吊）。
// 规则：只在镜头 < 120 m 时出现（< 34 m 启用精细 LOD）；真机渲染时实体层只用纸白（COL.paper）作消隐遮挡体，轮廓全部由墨线绘制，
// 与主站墨线语言一致并消除线框穿透；桩环境无 InstancedMesh 时自动降级为纯线段。
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const R_SHOW = 120;
  const R_HI = 34;
  const MAXSEG = 90000;
  const MAX_INST_FIG = 256;
  const MAX_INST_VEH = 32;
  const CELL = 16;
  const EPS = 0.03;

  // ---------- 墨线纸白遮挡色 + 实景工程涂装色表（双模式自动切换） ----------
  const PAPER = [0.94, 0.91, 0.85];
  const COL = { paper: PAPER };
  const LP = {
    vest: [0.92, 0.42, 0.08], pants: [0.18, 0.23, 0.34], shirt: [0.28, 0.36, 0.48],
    helmet: [0.95, 0.78, 0.14], skin: [0.84, 0.65, 0.52], boot: [0.22, 0.16, 0.12],
    tire: [0.16, 0.17, 0.19], rim: [0.72, 0.74, 0.77], glass: [0.16, 0.25, 0.33],
    steel: [0.40, 0.43, 0.47], steelL: [0.68, 0.71, 0.75], yellow: [0.90, 0.62, 0.08],
    orange: [0.86, 0.34, 0.10], cabW: [0.91, 0.89, 0.84], cabB: [0.20, 0.34, 0.52],
    drum: [0.84, 0.82, 0.78], primer: [0.56, 0.24, 0.18], wood: [0.62, 0.46, 0.26],
    conc: [0.58, 0.56, 0.52], soil: [0.52, 0.40, 0.27], red: [0.76, 0.18, 0.14]
  };
  let _CL = null;

  // 主站一致的日光方向（用于真实法线明暗分阶，让低模人物呈现真实 3D 体积感）
  const SUN = [-0.45, 0.78, 0.43];
  const SUN_L = Math.hypot(SUN[0], SUN[1], SUN[2]);
  const SX = SUN[0] / SUN_L, SY = SUN[1] / SUN_L, SZ = SUN[2] / SUN_L;

  // ---------- 基础图元（线 + 真实法线着色 3D 实体） ----------
  const seg = (out, a, b) => { out.push(a[0], a[1], a[2], b[0], b[1], b[2]); };
  const poly = (out, pts, close) => { for (let i = 0; i < pts.length - (close ? 0 : 1); i++) seg(out, pts[i], pts[(i + 1) % pts.length]); };
  const ring = (out, c, r, axis, n) => {
    n = n || 8; const P = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, u = Math.cos(a) * r, v = Math.sin(a) * r;
      P.push(axis === 'x' ? [c[0], c[1] + u, c[2] + v] : axis === 'z' ? [c[0] + u, c[1] + v, c[2]] : [c[0] + u, c[1], c[2] + v]);
    }
    poly(out, P, true);
  };
  const arc = (out, c, r, axis, a0, a1, n) => {
    const P = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n), u = Math.cos(a) * r, v = Math.sin(a) * r;
      P.push(axis === 'x' ? [c[0], c[1] + u, c[2] + v] : axis === 'z' ? [c[0] + u, c[1] + v, c[2]] : [c[0] + u, c[1], c[2] + v]);
    }
    poly(out, P, false);
  };
  const boxL = (out, x0, y0, z0, x1, y1, z1) => {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(out, v[a], v[b]);
  };
  const prismL = (out, b, t) => {
    for (let i = 0; i < 4; i++) { seg(out, b[i], b[(i + 1) % 4]); seg(out, t[i], t[(i + 1) % 4]); seg(out, b[i], t[i]); }
  };

  // 实体三角形：C 写墨线纸白遮挡色（0.90–1.02），_CL 同步写实景线性色（供 MeshStandardMaterial 受光渲染）
  const triS = (P, C, a, b, c, col, shade) => {
    let s = shade;
    if (s == null) {
      const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
      const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const l = Math.max(0, nx * SX + ny * SY + nz * SZ);
      const hemi = 0.5 + 0.5 * ny;
      s = Math.min(1.02, 0.90 + 0.06 * hemi + 0.06 * l);
    } else {
      s = 0.92 + (s - 0.75) * 0.28;
    }
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
  const latheS = (P, C, slices, n, col) => {
    for (let k = 0; k < slices.length - 1; k++) {
      const [x0, y0, r0] = slices[k], [x1, y1, r1] = slices[k + 1];
      for (let i = 0; i < n; i++) {
        const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
        const p00 = [x0, y0 + Math.cos(a0) * r0, Math.sin(a0) * r0];
        const p01 = [x0, y0 + Math.cos(a1) * r0, Math.sin(a1) * r0];
        const p11 = [x1, y1 + Math.cos(a1) * r1, Math.sin(a1) * r1];
        const p10 = [x1, y1 + Math.cos(a0) * r1, Math.sin(a0) * r1];
        quadS(P, C, p00, p10, p11, p01, col);
      }
    }
  };
  // 任意两点间的 3D 变径圆管（用于四肢、脖颈、关节、斗车扶手）
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
  // 椭球 / 半球穹顶（用于头部、肩关节、安全帽圆顶）
  const ellipS = (P, C, c, rx, ry, rz, rings, segs, col, phi0, phi1) => {
    const p0 = phi0 == null ? -Math.PI / 2 : phi0, p1 = phi1 == null ? Math.PI / 2 : phi1;
    const grid = [];
    for (let r = 0; r <= rings; r++) {
      const ph = p0 + (p1 - p0) * (r / rings), cp = Math.cos(ph), sp = Math.sin(ph), row = [];
      for (let s = 0; s < segs; s++) {
        const th = s / segs * Math.PI * 2;
        row.push([c[0] + Math.cos(th) * cp * rx, c[1] + sp * ry, c[2] + Math.sin(th) * cp * rz]);
      }
      grid.push(row);
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const sn = (s + 1) % segs;
        quadS(P, C, grid[r][s], grid[r][sn], grid[r + 1][sn], grid[r + 1][s], col);
      }
    }
  };

  // ---------- 建筑骨架逻辑 3D 施工人员模型（关节节点驱动，局部坐标系放样，零断颈/零剪切） ----------
  const add3 = (a, b, s) => s == null ? [a[0] + b[0], a[1] + b[1], a[2] + b[2]] : [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const frameRing = (m, u, f, rx, rz, n) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), 0.78) * rx;
      const z = Math.sign(sa) * Math.pow(Math.abs(sa), 0.78) * rz;
      pts.push([m[0] + x, m[1] + f[1] * z, m[2] + f[2] * z]);
    }
    return pts;
  };
  const loftBand = (P, C, r0, r1, col, capBot, capTop) => {
    const n = r0.length;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; quadS(P, C, r0[i], r0[j], r1[j], r1[i], col); }
    if (capBot) {
      const c = [0, 0, 0]; for (const p of r0) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
      c[0] /= n; c[1] /= n; c[2] /= n;
      for (let i = 0; i < n; i++) triS(P, C, c, r0[(i + 1) % n], r0[i], col, 0.76);
    }
    if (capTop) {
      const c = [0, 0, 0]; for (const p of r1) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
      c[0] /= n; c[1] /= n; c[2] /= n;
      for (let i = 0; i < n; i++) triS(P, C, c, r1[i], r1[(i + 1) % n], col, 1.04);
    }
  };
  // 四肢/圆管墨线包络（画 4 条纵向轮廓线，配合纸白遮挡体自动消隐背面线）
  const tubeL = (o, a, b, r0, r1) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / L, uy = dy / L, uz = dz / L;
    const hx = Math.abs(uy) < 0.9 ? 0 : 1, hy = Math.abs(uy) < 0.9 ? 1 : 0, hz = 0;
    let e1x = uy * hz - uz * hy, e1y = uz * hx - ux * hz, e1z = ux * hy - uy * hx;
    const l1 = Math.hypot(e1x, e1y, e1z) || 1; e1x /= l1; e1y /= l1; e1z /= l1;
    const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;
    for (const [cs, sn] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ox = e1x * cs + e2x * sn, oy = e1y * cs + e2y * sn, oz = e1z * cs + e2z * sn;
      seg(o, [a[0] + ox * r0, a[1] + oy * r0, a[2] + oz * r0], [b[0] + ox * r1, b[1] + oy * r1, b[2] + oz * r1]);
    }
  };
  const workerLeg = (o, P, C, hip, knee, ankle, hi) => {
    const n = hi ? 8 : 6;
    ellipS(P, C, hip, 0.082, 0.082, 0.082, 3, n, LP.pants);
    tubeS(P, C, hip, knee, 0.080, 0.064, n, LP.pants, true);
    ellipS(P, C, knee, 0.063, 0.063, 0.063, 3, n, LP.pants);
    tubeS(P, C, knee, ankle, 0.062, 0.048, n, LP.pants, true);
    if (hi) { tubeL(o, hip, knee, 0.082, 0.066); tubeL(o, knee, ankle, 0.064, 0.050); }
    else { seg(o, hip, knee); seg(o, knee, ankle); }
  };
  const workerBoot = (o, P, C, foot, hi) => {
    const [x, , z] = foot;
    const b0 = [[x - 0.056, 0.0, z - 0.075], [x + 0.056, 0.0, z - 0.075], [x + 0.052, 0.0, z + 0.155], [x - 0.052, 0.0, z + 0.155]];
    const t0 = [[x - 0.054, 0.095, z - 0.070], [x + 0.054, 0.095, z - 0.070], [x + 0.044, 0.062, z + 0.145], [x - 0.044, 0.062, z + 0.145]];
    prismS(P, C, b0, t0, LP.boot);
    if (hi) prismL(o, b0, t0); else poly(o, b0, true);
  };
  const workerArm = (o, P, C, sh, elbow, hand, hi) => {
    const n = hi ? 8 : 6;
    ellipS(P, C, sh, 0.062, 0.060, 0.060, 4, n, LP.shirt);
    tubeS(P, C, sh, elbow, 0.053, 0.044, n, LP.shirt, true);
    ellipS(P, C, elbow, 0.044, 0.044, 0.044, 3, n, LP.shirt);
    tubeS(P, C, elbow, hand, 0.042, 0.035, n, LP.shirt, true);
    ellipS(P, C, hand, 0.041, 0.041, 0.041, 3, n, LP.skin);
    if (hi) { tubeL(o, sh, elbow, 0.055, 0.046); tubeL(o, elbow, hand, 0.044, 0.037); }
    else { seg(o, sh, elbow); seg(o, elbow, hand); }
  };

  function buildWorker(o, P, C, sk, hi) {
    const nT = hi ? 8 : 6, nH = hi ? 10 : 6;
    const lp = sk.lean || 0;
    const u = [0, Math.cos(lp), Math.sin(lp)];
    const f = [0, -Math.sin(lp), Math.cos(lp)];
    const pelvis = sk.pelvis;
    const spineAt = d => add3(pelvis, u, d);
    const R = (d, rx, rz) => frameRing(spineAt(d), u, f, rx, rz, nT);

    // 1. 躯干（全部断面严格垂直于脊柱轴 u，墨线纸白消隐 / 实景反光背心）
    const rHip = R(-0.07, 0.155, 0.096), rBelt0 = R(0.05, 0.166, 0.104), rBelt1 = R(0.11, 0.166, 0.104);
    const v0 = R(0.11, 0.164, 0.102), v1 = R(0.32, 0.192, 0.116), v2 = R(0.51, 0.205, 0.106);
    const rCol = R(0.57, 0.074, 0.068);
    loftBand(P, C, rHip, R(0.05, 0.162, 0.100), LP.pants, true, false);
    loftBand(P, C, rBelt0, rBelt1, LP.boot, false, false);
    loftBand(P, C, v0, v1, LP.vest, false, false);
    loftBand(P, C, v1, v2, LP.vest, false, true);
    loftBand(P, C, R(0.50, 0.145, 0.088), rCol, LP.shirt, false, true);
    poly(o, rBelt0, true); poly(o, v2, true);
    for (let i = 0; i < nT; i += hi ? 2 : 3) { seg(o, rHip[i], v1[i]); seg(o, v1[i], v2[i]); }
    if (hi) {
      poly(o, rBelt1, true); poly(o, rCol, true);
      for (const d of [0.19, 0.28]) {
        const rx = 0.176 + (d - 0.11) * 0.11, rz = 0.111 + (d - 0.11) * 0.045;
        poly(o, R(d, rx, rz), true);
      }
    }

    // 2. 颈部与头部：从脊柱领口节点连续长出（颈底埋入领口内 4 cm，颈顶埋入头颅内，绝对不断裂）
    const neckBase = spineAt(0.53);
    const neckDir = [0, Math.cos(lp * 0.45), Math.sin(lp * 0.45)];
    const headC = add3(neckBase, neckDir, 0.165);
    tubeS(P, C, neckBase, headC, 0.054, 0.046, 8, LP.skin, true);
    ellipS(P, C, headC, 0.088, 0.104, 0.095, hi ? 4 : 3, nH, LP.skin);
    if (hi) {
      ring(o, headC, 0.092, 'y', 8);
      arc(o, headC, 0.096, 'x', -Math.PI * 0.45, Math.PI * 0.45, 6);
    }

    // 3. 安全帽（以 headC 为锚点，帽檐 + 帽顶加强筋全墨线勾勒）
    const [hx, hy, hz] = headC;
    ellipS(P, C, [hx, hy + 0.028, hz], 0.118, 0.105, 0.122, hi ? 4 : 2, nH, LP.helmet, 0, Math.PI / 2);
    tubeS(P, C, [hx, hy + 0.020, hz], [hx, hy + 0.038, hz], 0.130, 0.120, nH, LP.helmet, true);
    if (!sk.noVisor) {
      const vb = [[hx - 0.088, hy + 0.022, hz + 0.085], [hx + 0.088, hy + 0.022, hz + 0.085], [hx + 0.062, hy + 0.010, hz + 0.178], [hx - 0.062, hy + 0.010, hz + 0.178]];
      const vt = [[hx - 0.084, hy + 0.038, hz + 0.085], [hx + 0.084, hy + 0.038, hz + 0.085], [hx + 0.058, hy + 0.024, hz + 0.178], [hx - 0.058, hy + 0.024, hz + 0.178]];
      prismS(P, C, vb, vt, LP.helmet);
      if (hi) prismL(o, vb, vt); else poly(o, vt, true);
    }
    ring(o, [hx, hy + 0.030, hz], 0.132, 'y', nH);
    if (hi) {
      arc(o, [hx, hy + 0.028, hz], 0.120, 'x', 0, Math.PI, 8);
      arc(o, [hx, hy + 0.028, hz], 0.118, 'z', 0, Math.PI, 8);
      const rb = [[hx - 0.020, hy + 0.112, hz - 0.072], [hx + 0.020, hy + 0.112, hz - 0.072], [hx + 0.020, hy + 0.112, hz + 0.072], [hx - 0.020, hy + 0.112, hz + 0.072]];
      const rt = [[hx - 0.014, hy + 0.136, hz - 0.055], [hx + 0.014, hy + 0.136, hz - 0.055], [hx + 0.014, hy + 0.136, hz + 0.055], [hx - 0.014, hy + 0.136, hz + 0.055]];
      prismS(P, C, rb, rt, LP.helmet); prismL(o, rb, rt);
    }

    // 4. 胯窝与双腿 + 工装靴
    const hipC = spineAt(-0.02);
    workerLeg(o, P, C, [hipC[0] - 0.095, hipC[1], hipC[2]], sk.lKnee, [sk.lFoot[0], 0.06, sk.lFoot[2]], hi);
    workerLeg(o, P, C, [hipC[0] + 0.095, hipC[1], hipC[2]], sk.rKnee, [sk.rFoot[0], 0.06, sk.rFoot[2]], hi);
    workerBoot(o, P, C, sk.lFoot, hi);
    workerBoot(o, P, C, sk.rFoot, hi);

    // 5. 肩窝与双臂（由倾斜后的胸肩节点直接推出）
    const shC = spineAt(0.455);
    workerArm(o, P, C, [shC[0] - 0.195, shC[1], shC[2]], sk.lElbow, sk.lHand, hi);
    workerArm(o, P, C, [shC[0] + 0.195, shC[1], shC[2]], sk.rElbow, sk.rHand, hi);

    return { headC, lHand: sk.lHand, rHand: sk.rHand };
  }

  // W2 旅客（任务 #33）：同一套人体骨架，换便装配色（外套 / 头发），双臂自然下垂；paxbag 右手拖行李箱
  const PAX_LP = { vest: [0.30, 0.34, 0.42], helmet: [0.13, 0.11, 0.10], shirt: [0.82, 0.80, 0.76], boot: [0.15, 0.15, 0.17], pants: [0.25, 0.26, 0.30] };
  function paxFigure(o, P, C, hi, bag) {
    const keep = {}; for (const k in PAX_LP) { keep[k] = LP[k]; LP[k] = PAX_LP[k]; }
    try {
      buildWorker(o, P, C, {
        pelvis: [0, 0.92, 0], lean: 0.0, noVisor: true,
        lKnee: [-0.1, 0.48, 0.01], lFoot: [-0.11, 0, 0.0],
        rKnee: [0.1, 0.48, -0.01], rFoot: [0.11, 0, -0.01],
        lElbow: [-0.24, 1.08, 0.0], lHand: [-0.25, 0.80, 0.03],
        rElbow: [0.24, 1.08, 0.0], rHand: bag ? [0.28, 0.78, -0.08] : [0.25, 0.80, 0.03],
      }, hi);
      if (bag) { boxS(P, C, 0.22, 0.04, -0.42, 0.44, 0.62, -0.18, [0.62, 0.20, 0.16]); seg(o, [0.33, 0.62, -0.3], [0.29, 0.78, -0.1]);
        for (const [a, b] of [[[0.22, 0.04, -0.42], [0.44, 0.04, -0.42]], [[0.22, 0.62, -0.42], [0.44, 0.62, -0.42]], [[0.22, 0.04, -0.42], [0.22, 0.62, -0.42]], [[0.44, 0.04, -0.42], [0.44, 0.62, -0.42]], [[0.22, 0.04, -0.18], [0.22, 0.62, -0.18]], [[0.44, 0.04, -0.18], [0.44, 0.62, -0.18]]]) seg(o, a, b); }
    } finally { for (const k in keep) LP[k] = keep[k]; }
  }

  function figure(kind, hi) {
    const o = [], P = [], C = [], CL = []; _CL = CL;
    if (kind === 'pax' || kind === 'paxbag') paxFigure(o, P, C, hi, kind === 'paxbag');
    else if (kind === 'stand') {
      buildWorker(o, P, C, {
        pelvis: [0, 0.90, 0], lean: 0.02, noVisor: false,
        lKnee: [-0.105, 0.47, 0.02], lFoot: [-0.115, 0, 0.0],
        rKnee: [0.105, 0.47, -0.02], rFoot: [0.115, 0, -0.02],
        lElbow: [-0.23, 1.13, 0.09], lHand: [-0.12, 1.08, 0.26],
        rElbow: [0.23, 1.13, 0.09], rHand: [0.12, 1.08, 0.26],
      }, hi);
      const cb = [[-0.15, 1.00, 0.25], [0.15, 1.00, 0.25], [0.15, 1.24, 0.36], [-0.15, 1.24, 0.36]];
      const ct = [[-0.15, 1.018, 0.232], [0.15, 1.018, 0.232], [0.15, 1.258, 0.342], [-0.15, 1.258, 0.342]];
      prismS(P, C, cb, ct, LP.wood);
      boxS(P, C, -0.045, 1.22, 0.33, 0.045, 1.26, 0.365, LP.steelL);
      prismL(o, cb, ct);
    } else if (kind === 'push') {
      buildWorker(o, P, C, {
        pelvis: [0, 0.86, -0.05], lean: 0.48, noVisor: false,
        lKnee: [-0.105, 0.46, 0.14], lFoot: [-0.115, 0, 0.22],
        rKnee: [0.105, 0.46, -0.22], rFoot: [0.115, 0, -0.38],
        lElbow: [-0.21, 1.03, 0.40], lHand: [-0.22, 0.80, 0.64],
        rElbow: [0.21, 1.03, 0.40], rHand: [0.22, 0.80, 0.64],
      }, hi);
      const b0 = [[-0.24, 0.34, 0.80], [0.24, 0.34, 0.80], [0.22, 0.34, 1.24], [-0.22, 0.34, 1.24]];
      const t0 = [[-0.32, 0.68, 0.72], [0.32, 0.68, 0.72], [0.30, 0.72, 1.34], [-0.30, 0.72, 1.34]];
      prismS(P, C, b0, t0, LP.steel); prismL(o, b0, t0);
      ellipS(P, C, [0, 0.68, 1.03], 0.25, 0.10, 0.24, 3, 8, LP.conc, 0, Math.PI / 2);
      for (const s of [-1, 1]) {
        tubeS(P, C, [s * 0.22, 0.80, 0.63], [s * 0.22, 0.42, 0.84], 0.022, 0.022, 6, LP.steel, true);
        tubeS(P, C, [s * 0.22, 0.42, 0.84], [s * 0.16, 0.20, 1.38], 0.022, 0.022, 6, LP.steel, true);
        tubeS(P, C, [s * 0.22, 0.42, 0.84], [s * 0.22, 0.02, 0.88], 0.020, 0.020, 6, LP.steel, true);
        seg(o, [s * 0.22, 0.80, 0.63], [s * 0.22, 0.42, 0.84]);
        seg(o, [s * 0.22, 0.42, 0.84], [s * 0.16, 0.20, 1.38]);
        seg(o, [s * 0.22, 0.42, 0.84], [s * 0.22, 0.02, 0.88]);
      }
      tubeS(P, C, [-0.04, 0.20, 1.38], [0.04, 0.20, 1.38], 0.20, 0.20, hi ? 10 : 8, LP.tire, true);
      ring(o, [0, 0.20, 1.38], 0.20, 'x', hi ? 10 : 6);
    } else if (kind === 'weld') {
      const { headC } = buildWorker(o, P, C, {
        pelvis: [0, 0.54, -0.14], lean: 0.46, noVisor: true,
        lKnee: [-0.15, 0.48, 0.20], lFoot: [-0.14, 0, 0.08],
        rKnee: [0.15, 0.48, 0.20], rFoot: [0.14, 0, 0.08],
        lElbow: [-0.17, 0.70, 0.28], lHand: [-0.04, 0.48, 0.46],
        rElbow: [0.17, 0.70, 0.28], rHand: [0.04, 0.48, 0.46],
      }, hi);
      const [hx, hy, hz] = headC;
      boxS(P, C, hx - 0.115, hy - 0.13, hz + 0.11, hx + 0.115, hy + 0.09, hz + 0.155, LP.tire);
      boxL(o, hx - 0.115, hy - 0.13, hz + 0.11, hx + 0.115, hy + 0.09, hz + 0.155);
      poly(o, [[hx - 0.068, hy - 0.02, hz + 0.158], [hx + 0.068, hy - 0.02, hz + 0.158], [hx + 0.068, hy + 0.035, hz + 0.158], [hx - 0.068, hy + 0.035, hz + 0.158]], true);
      tubeS(P, C, [0, 0.48, 0.46], [0, 0.12, 0.64], 0.022, 0.014, 6, LP.steelL, true);
      seg(o, [0, 0.48, 0.46], [0, 0.12, 0.64]);
      if (hi) {
        const fx = 0, fy = 0.10, fz = 0.65;
        seg(o, [fx - 0.11, fy, fz], [fx + 0.11, fy, fz]);
        seg(o, [fx, fy - 0.05, fz], [fx, fy + 0.13, fz]);
        seg(o, [fx - 0.08, fy + 0.09, fz - 0.05], [fx + 0.08, fy + 0.02, fz + 0.05]);
        boxS(P, C, 0.22, 0.0, -0.22, 0.44, 0.34, 0.08, LP.orange);
        boxL(o, 0.22, 0.0, -0.22, 0.44, 0.34, 0.08);
        poly(o, [[0.33, 0.28, 0.08], [0.22, 0.14, 0.34], [0, 0.48, 0.46]], false);
      }
    } else {
      buildWorker(o, P, C, {
        pelvis: [0, 0.90, 0], lean: 0.0, noVisor: false,
        lKnee: [-0.12, 0.47, 0], lFoot: [-0.14, 0, 0],
        rKnee: [0.12, 0.47, 0], rFoot: [0.14, 0, 0],
        lElbow: [-0.27, 1.63, 0], lHand: [-0.30, 1.90, 0],
        rElbow: [0.43, 1.38, 0.04], rHand: [0.65, 1.40, 0.08],
      }, hi);
      tubeS(P, C, [-0.30, 1.88, 0], [-0.30, 2.34, 0], 0.014, 0.012, 6, LP.steelL, true);
      seg(o, [-0.30, 1.88, 0], [-0.30, 2.34, 0]);
      quadS(P, C, [-0.30, 2.34, 0], [-0.64, 2.30, 0], [-0.62, 2.02, 0], [-0.30, 2.04, 0], LP.orange, 1.0);
      poly(o, [[-0.30, 2.34, 0], [-0.64, 2.30, 0], [-0.62, 2.02, 0], [-0.30, 2.04, 0]], true);
    }
    _CL = null;
    return { L: new Float32Array(o), P: new Float32Array(P), C: new Float32Array(C), CL: new Float32Array(CL) };
  }

  // ---------- 车辆与工程机械（线 + 纸色实体） ----------
  function vehicle(kind, hi) {
    const o = [], P = [], C = [], CL = []; _CL = CL;
    // 真实结构轮组：实心橡胶胎 + 凹陷轮毂盘 + 轮芯 + 双胎并装 + 横向车桥
    const wheel = (x, z, r, dual) => {
      const cn = hi ? 12 : 8;
      const sgn = z > 0 ? 1 : -1;
      const wT = dual ? 0.44 : 0.25;
      const zOut = z, zIn = z - sgn * wT;
      for (let i = 0; i < cn; i++) {
        const a0 = i / cn * Math.PI * 2, a1 = (i + 1) / cn * Math.PI * 2;
        const c0 = Math.cos(a0) * r, s0 = Math.sin(a0) * r, c1 = Math.cos(a1) * r, s1 = Math.sin(a1) * r;
        quadS(P, C, [x + c0, r + s0, zOut], [x + c1, r + s1, zOut], [x + c1, r + s1, zIn], [x + c0, r + s0, zIn], LP.tire);
        triS(P, C, [x, r, zOut], [x + c0, r + s0, zOut], [x + c1, r + s1, zOut], LP.tire, 0.85);
        triS(P, C, [x, r, zIn], [x + c1, r + s1, zIn], [x + c0, r + s0, zIn], LP.tire, 0.72);
      }
      tubeS(P, C, [x, r, zOut], [x, r, zOut + sgn * 0.06], r * 0.22, r * 0.18, 6, LP.rim, true);
      ring(o, [x, r, zOut + sgn * 0.01], r, 'z', cn);
      ring(o, [x, r, zIn - sgn * 0.01], r, 'z', cn);
      if (hi) { ring(o, [x, r, zOut + sgn * 0.02], r * 0.54, 'z', 8); ring(o, [x, r, zOut + sgn * 0.065], r * 0.18, 'z', 6); }
    };
    const axle = (x, hz, r, dual) => {
      tubeS(P, C, [x, r, -hz + 0.15], [x, r, hz - 0.15], 0.11, 0.11, 6, LP.steel, false);
      seg(o, [x, r, -hz + 0.15], [x, r, hz - 0.15]);
      wheel(x, -hz, r, dual); wheel(x, hz, r, dual);
    };
    // 精修重卡驾驶室：阶梯车头、倾斜风挡、门窗立柱、保险杠+大灯、登车踏步、实心后视镜、顶置警示灯
    const cab = (x0, x1, y0, y1, hw, col) => {
      const wb = x1 - 0.26, ym = y0 + 1.02;
      const bot = [[x0, y0, -hw], [x1, y0, -hw], [x1, y0, hw], [x0, y0, hw]];
      const mid = [[x0, ym, -hw], [x1, ym, -hw], [x1, ym, hw], [x0, ym, hw]];
      const top = [[x0, y1, -hw], [wb, y1, -hw], [wb, y1, hw], [x0, y1, hw]];
      prismS(P, C, bot, mid, col); prismS(P, C, mid, top, col);
      prismL(o, bot, mid); prismL(o, mid, top);
      // 车顶导流遮阳檐 + 警示灯
      boxS(P, C, wb - 0.10, y1 - 0.06, -hw + 0.04, x1 - 0.06, y1 + 0.03, hw - 0.04, LP.steel);
      boxL(o, wb - 0.10, y1 - 0.06, -hw + 0.04, x1 - 0.06, y1 + 0.03, hw - 0.04);
      tubeS(P, C, [x0 + 0.85, y1, 0], [x0 + 0.85, y1 + 0.18, 0], 0.09, 0.075, 8, LP.orange, true);
      if (hi) { ring(o, [x0 + 0.85, y1 + 0.18, 0], 0.075, 'y', 8); ring(o, [x0 + 0.85, y1 + 0.02, 0], 0.09, 'y', 8); }
      // 重型前保险杠 + 左右大灯 + 进气格栅
      boxS(P, C, x1 - 0.06, y0 - 0.30, -hw - 0.03, x1 + 0.18, y0 + 0.08, hw + 0.03, LP.steel);
      boxL(o, x1 - 0.06, y0 - 0.30, -hw - 0.03, x1 + 0.18, y0 + 0.08, hw + 0.03);
      for (const s of [-1, 1]) {
        boxS(P, C, x1 + 0.15, y0 - 0.22, s * (hw - 0.38) - 0.16, x1 + 0.20, y0 - 0.02, s * (hw - 0.38) + 0.16, LP.cabW);
        if (hi) boxL(o, x1 + 0.15, y0 - 0.22, s * (hw - 0.38) - 0.16, x1 + 0.20, y0 - 0.02, s * (hw - 0.38) + 0.16);
        // 登车踏步（带竖向吊架连入驾驶室底板，零悬空）
        const zIn = s * (hw - 0.16), zOut = s * (hw + 0.02);
        const z0 = Math.min(zIn, zOut), z1 = Math.max(zIn, zOut);
        boxS(P, C, x0 + 0.46, y0 - 0.40, z0, x0 + 1.12, y0 - 0.34, z1, LP.steel);
        boxS(P, C, x0 + 0.46, y0 - 0.18, z0, x0 + 1.12, y0 - 0.12, z1, LP.steel);
        for (const sx of [x0 + 0.48, x0 + 1.06]) {
          boxS(P, C, sx, y0 - 0.40, z0, sx + 0.05, y0, z1, LP.steel);
          if (hi) seg(o, [sx + 0.025, y0 - 0.40, zOut], [sx + 0.025, y0, zOut]);
        }
        if (hi) { seg(o, [x0 + 0.46, y0 - 0.37, zOut], [x0 + 1.12, y0 - 0.37, zOut]); seg(o, [x0 + 0.46, y0 - 0.15, zOut], [x0 + 1.12, y0 - 0.15, zOut]); }
      }
      // 进气格栅条
      boxS(P, C, x1 - 0.01, y0 + 0.18, -hw + 0.24, x1 + 0.04, ym - 0.12, hw - 0.24, LP.tire);
      boxL(o, x1 - 0.01, y0 + 0.18, -hw + 0.24, x1 + 0.04, ym - 0.12, hw - 0.24);
      for (let k = 0; k < 3; k++) { const gy = y0 + 0.28 + k * 0.22; seg(o, [x1 + 0.05, gy, -hw + 0.28], [x1 + 0.05, gy, hw - 0.28]); }
      // 前挡风玻璃 + 侧门玻璃 + 实心后视镜
      const wf = [[x1 - 0.01, ym + 0.10, -hw + 0.14], [x1 - 0.01, ym + 0.10, hw - 0.14], [wb + 0.03, y1 - 0.14, hw - 0.14], [wb + 0.03, y1 - 0.14, -hw + 0.14]];
      quadS(P, C, wf[0], wf[1], wf[2], wf[3], LP.glass, 1.02); poly(o, wf, true);
      for (const s of [-1, 1]) {
        const zS = s * (hw + 0.012);
        const sw = [[x0 + 0.36, ym + 0.08, zS], [x1 - 0.18, ym + 0.08, zS], [wb - 0.06, y1 - 0.15, zS], [x0 + 0.36, y1 - 0.15, zS]];
        quadS(P, C, sw[0], sw[1], sw[2], sw[3], LP.glass, 0.96); poly(o, sw, true);
        // 后视镜支架 + 镜壳
        tubeS(P, C, [x1 - 0.18, ym + 0.62, s * hw], [x1 - 0.12, ym + 0.62, s * (hw + 0.26)], 0.02, 0.02, 5, LP.tire, true);
        tubeS(P, C, [x1 - 0.18, ym + 0.18, s * hw], [x1 - 0.12, ym + 0.18, s * (hw + 0.26)], 0.02, 0.02, 5, LP.tire, true);
        const m0 = Math.min(s * (hw + 0.22), s * (hw + 0.30)), m1 = Math.max(s * (hw + 0.22), s * (hw + 0.30));
        boxS(P, C, x1 - 0.18, ym + 0.18, m0, x1 - 0.06, ym + 0.62, m1, LP.tire);
        if (hi) {
          seg(o, [x1 - 0.18, ym + 0.62, s * hw], [x1 - 0.12, ym + 0.62, s * (hw + 0.26)]);
          seg(o, [x1 - 0.18, ym + 0.18, s * hw], [x1 - 0.12, ym + 0.18, s * (hw + 0.26)]);
          boxL(o, x1 - 0.18, ym + 0.18, m0, x1 - 0.06, ym + 0.62, m1);
        }
      }
    };

    if (kind === 'mixer') {
      // 重型双纵梁车架 + 后双桥挡泥板 + 侧面油箱 + 驾驶室
      for (const s of [-1, 1]) boxS(P, C, -4.55, 0.86, s * 0.52 - 0.12, 4.45, 1.18, s * 0.52 + 0.12, LP.steel);
      boxS(P, C, -4.55, 1.16, -1.16, 4.45, 1.28, 1.16, LP.steel);
      boxL(o, -4.55, 1.16, -1.16, 4.45, 1.28, 1.16);
      // 车架下油箱与储气筒
      boxS(P, C, 0.25, 0.55, 0.68, 1.65, 1.08, 1.16, LP.steelL);
      boxS(P, C, 0.45, 0.60, -1.14, 1.45, 1.05, -0.68, LP.steel);
      if (hi) { boxL(o, 0.25, 0.55, 0.68, 1.65, 1.08, 1.16); boxL(o, 0.45, 0.60, -1.14, 1.45, 1.05, -0.68); }
      // 后双桥挡泥板罩
      for (const s of [-1, 1]) {
        const z0 = Math.min(s * 0.85, s * 1.24), z1 = Math.max(s * 0.85, s * 1.24);
        boxS(P, C, -4.15, 1.08, z0, -1.30, 1.18, z1, LP.tire);
        if (hi) boxL(o, -4.15, 1.08, z0, -1.30, 1.18, z1);
      }
      cab(2.35, 4.5, 1.28, 3.38, 1.18, LP.cabW);

      // 14 边倾斜搅拌筒（墨线纸白遮挡 / 实景白灰罐体配工程橙色环带）
      const A = [-4.15, 2.08], B = [1.85, 3.16], n = hi ? 14 : 8, D = [];
      const rads = [0.56, 0.88, 1.16, 1.18, 1.02, 0.72];
      for (let k = 0; k < rads.length; k++) {
        const f = k / (rads.length - 1);
        const cx = A[0] + (B[0] - A[0]) * f, cy = A[1] + (B[1] - A[1]) * f, r = rads[k];
        D.push([cx, cy, r]);
        if (k === 0 || k === 2 || k === 3 || k === 5) ring(o, [cx, cy, 0], r + 0.008, 'x', n);
      }
      for (let k = 0; k < D.length - 1; k++) {
        latheS(P, C, [D[k], D[k + 1]], n, k === 2 ? LP.orange : LP.drum);
        const [x0, y0, r0] = D[k], [x1, y1, r1] = D[k + 1];
        for (const [sy, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          seg(o, [x0, y0 + sy * r0, sz * r0], [x1, y1 + sy * r1, sz * r1]);
        }
      }
      // 滚筒前后实心支架 + 卧式水箱 + 尾端进料斗/出料溜槽/检修梯
      for (const s of [-1, 1]) {
        tubeS(P, C, [-4.32, 1.26, s * 0.96], [-3.82, 2.52, s * 0.62], 0.065, 0.055, 6, LP.steel, true);
        tubeS(P, C, [-3.30, 1.26, s * 0.96], [-3.82, 2.52, s * 0.62], 0.065, 0.055, 6, LP.steel, true);
        tubeS(P, C, [1.65, 1.26, s * 0.84], [1.65, 2.50, s * 0.56], 0.075, 0.065, 6, LP.steel, true);
        tubeL(o, [-4.32, 1.26, s * 0.96], [-3.82, 2.52, s * 0.62], 0.068, 0.058);
        tubeL(o, [-3.30, 1.26, s * 0.96], [-3.82, 2.52, s * 0.62], 0.068, 0.058);
        tubeL(o, [1.65, 1.26, s * 0.84], [1.65, 2.50, s * 0.56], 0.078, 0.068);
      }
      tubeS(P, C, [1.98, 2.25, -0.78], [1.98, 2.25, 0.78], 0.34, 0.34, 10, LP.steelL, true);
      if (hi) {
        ring(o, [1.98, 2.25, -0.78], 0.34, 'z', 8); ring(o, [1.98, 2.25, 0.78], 0.34, 'z', 8);
        seg(o, [1.98, 2.59, -0.78], [1.98, 2.59, 0.78]); seg(o, [1.98, 1.91, -0.78], [1.98, 1.91, 0.78]);
      }
      const hb = [[-4.55, 2.52, -0.28], [-4.05, 2.52, -0.28], [-4.05, 2.52, 0.28], [-4.55, 2.52, 0.28]];
      const ht = [[-4.75, 3.20, -0.44], [-3.98, 3.20, -0.44], [-3.98, 3.20, 0.44], [-4.75, 3.20, 0.44]];
      prismS(P, C, hb, ht, LP.steel); prismL(o, hb, ht);
      const cb0 = [[-4.40, 2.02, -0.20], [-4.40, 2.02, 0.20], [-5.32, 1.05, 0.16], [-5.32, 1.05, -0.16]];
      const cb1 = [[-4.40, 2.18, -0.22], [-4.40, 2.18, 0.22], [-5.32, 1.18, 0.18], [-5.32, 1.18, -0.18]];
      prismS(P, C, cb0, cb1, LP.steel); prismL(o, cb0, cb1);
      for (const z of [0.42, 0.78]) {
        tubeS(P, C, [-4.56, 0.92, z], [-4.56, 3.28, z], 0.025, 0.025, 5, LP.steel, true);
        tubeL(o, [-4.56, 0.92, z], [-4.56, 3.28, z], 0.028, 0.028);
      }
      for (let y = 1.25; y <= 3.1; y += 0.42) {
        tubeS(P, C, [-4.56, y, 0.42], [-4.56, y, 0.78], 0.018, 0.018, 5, LP.steel, false);
        seg(o, [-4.585, y, 0.42], [-4.585, y, 0.78]);
      }

      axle(-3.45, 1.12, 0.52, true); axle(-2.05, 1.12, 0.52, true); axle(3.40, 1.12, 0.52, false);
      _CL = null;
      return { L: new Float32Array(o), P: new Float32Array(P), C: new Float32Array(C), CL: new Float32Array(CL), hx: 5.4, hz: 1.35, h: 4.4 };
    }

    if (kind === 'flatbed') {
      // 重型钢构平板运输车：双纵梁 + 货箱边梁 + 工具箱 + 龙门防撞架 + 工字钢货载 + 垫木 + 紧固带
      for (const s of [-1, 1]) boxS(P, C, -6.0, 0.84, s * 0.52 - 0.12, 5.8, 1.12, s * 0.52 + 0.12, LP.steel);
      boxS(P, C, -6.0, 1.12, -1.25, 4.0, 1.40, 1.25, LP.steel);
      boxL(o, -6.0, 1.12, -1.25, 4.0, 1.40, 1.25);
      boxS(P, C, -1.8, 0.58, 0.72, 0.6, 1.08, 1.20, LP.steelL);
      boxS(P, C, -1.8, 0.58, -1.20, 0.6, 1.08, -0.72, LP.steel);
      if (hi) { boxL(o, -1.8, 0.58, 0.72, 0.6, 1.08, 1.20); boxL(o, -1.8, 0.58, -1.20, 0.6, 1.08, -0.72); }
      for (const s of [-1, 1]) boxS(P, C, -5.3, 1.05, Math.min(s * 0.85, s * 1.26), -2.6, 1.14, Math.max(s * 0.85, s * 1.26), LP.tire);
      cab(4.0, 6.0, 1.12, 3.28, 1.20, LP.cabB);

      // 实心钢构龙门防撞架（立柱 + 横梁 + 斜撑全墨线）
      for (const s of [-1, 1]) {
        boxS(P, C, 3.74, 1.40, s * 1.18 - 0.06, 3.90, 3.18, s * 1.18 + 0.06, LP.steel);
        boxL(o, 3.74, 1.40, s * 1.18 - 0.06, 3.90, 3.18, s * 1.18 + 0.06);
        tubeS(P, C, [3.82, 2.85, s * 1.14], [3.15, 1.40, s * 1.14], 0.045, 0.045, 6, LP.steel, true);
        tubeL(o, [3.82, 2.85, s * 1.14], [3.15, 1.40, s * 1.14], 0.048, 0.048);
      }
      boxS(P, C, 3.74, 3.06, -1.24, 3.90, 3.20, 1.24, LP.steel);
      boxL(o, 3.74, 3.06, -1.24, 3.90, 3.20, 1.24);
      for (const y of [1.95, 2.50]) {
        boxS(P, C, 3.78, y, -1.14, 3.86, y + 0.07, 1.14, LP.steel);
        boxL(o, 3.78, y, -1.14, 3.86, y + 0.07, 1.14);
      }

      // 货载：垫木 + 2 根真实工字钢大梁（上/下翼缘 + 凹陷腹板 + 竖向加劲肋）+ 紧固绑带与棘轮扣具
      for (const x of [-4.4, -1.2, 2.0]) {
        boxS(P, C, x - 0.12, 1.40, -1.12, x + 0.12, 1.54, 1.12, LP.wood);
        if (hi) boxL(o, x - 0.12, 1.40, -1.12, x + 0.12, 1.54, 1.12);
      }
      for (const z of [-0.62, 0.62]) {
        boxS(P, C, -5.6, 1.54, z - 0.34, 3.3, 1.66, z + 0.34, LP.primer);
        boxS(P, C, -5.6, 2.12, z - 0.34, 3.3, 2.24, z + 0.34, LP.primer);
        boxS(P, C, -5.6, 1.66, z - 0.08, 3.3, 2.12, z + 0.08, LP.primer);
        boxL(o, -5.6, 1.54, z - 0.34, 3.3, 1.66, z + 0.34);
        boxL(o, -5.6, 2.12, z - 0.34, 3.3, 2.24, z + 0.34);
        for (let x = -5.0; x <= 2.8; x += 1.56) {
          boxS(P, C, x - 0.04, 1.66, z - 0.30, x + 0.04, 2.12, z + 0.30, LP.primer);
          if (hi) { seg(o, [x, 1.66, z - 0.305], [x, 2.12, z - 0.305]); seg(o, [x, 1.66, z + 0.305], [x, 2.12, z + 0.305]); }
        }
      }
      for (const x of [-4.4, -1.2, 2.0]) {
        tubeS(P, C, [x, 1.40, -1.22], [x, 2.26, -0.96], 0.022, 0.022, 5, LP.orange, true);
        tubeS(P, C, [x, 2.26, -0.96], [x, 2.26, 0.96], 0.022, 0.022, 5, LP.orange, true);
        tubeS(P, C, [x, 2.26, 0.96], [x, 1.40, 1.22], 0.022, 0.022, 5, LP.orange, true);
        tubeL(o, [x, 1.40, -1.22], [x, 2.26, -0.96], 0.025, 0.025);
        tubeL(o, [x, 2.26, -0.96], [x, 2.26, 0.96], 0.025, 0.025);
        tubeL(o, [x, 2.26, 0.96], [x, 1.40, 1.22], 0.025, 0.025);
        for (const s of [-1, 1]) {
          const z0 = s > 0 ? 1.24 : -1.29, z1 = s > 0 ? 1.29 : -1.24;
          boxS(P, C, x - 0.05, 1.20, z0, x + 0.05, 1.38, z1, LP.steelL);
          if (hi) boxL(o, x - 0.05, 1.20, z0, x + 0.05, 1.38, z1);
        }
      }
      axle(-4.65, 1.12, 0.50, true); axle(-3.35, 1.12, 0.50, true); axle(2.20, 1.12, 0.50, false); axle(5.00, 1.12, 0.50, false);
      _CL = null;
      return { L: new Float32Array(o), P: new Float32Array(P), C: new Float32Array(C), CL: new Float32Array(CL), hx: 6.1, hz: 1.35, h: 3.4 };
    }

    if (kind === 'excavator') {
      // 精修履带式挖掘机（地下基坑 civil 阶段）：圆角履带架 + 回转支承 + 斜坡配重 + 全景玻璃驾驶室 + 鹅颈动臂/油缸/带齿铲斗
      for (const s of [-1, 1]) {
        const z0 = s * 1.12;
        boxS(P, C, -1.72, 0.02, z0 - 0.32, 1.72, 0.80, z0 + 0.32, LP.tire);
        boxL(o, -1.72, 0.02, z0 - 0.32, 1.72, 0.80, z0 + 0.32);
        for (const tx of [-1.72, 1.72]) {
          tubeS(P, C, [tx, 0.41, z0 - 0.33], [tx, 0.41, z0 + 0.33], 0.39, 0.39, hi ? 10 : 8, LP.tire, true);
          ring(o, [tx, 0.41, z0 + s * 0.34], 0.38, 'z', hi ? 10 : 6);
        }
        if (hi) for (let x = -1.5; x <= 1.5; x += 0.5) seg(o, [x, 0.04, z0 + s * 0.33], [x, 0.78, z0 + s * 0.33]);
      }
      boxS(P, C, -1.05, 0.32, -0.82, 1.05, 0.82, 0.82, LP.steel);
      boxL(o, -1.05, 0.32, -0.82, 1.05, 0.82, 0.82);
      tubeS(P, C, [0, 0.82, 0], [0, 1.05, 0], 0.86, 0.86, 12, LP.steel, true);
      ring(o, [0, 0.94, 0], 0.86, 'y', 10);

      // 上车机棚 + 尾部配重 + 引擎盖 + 排气管
      boxS(P, C, -1.65, 1.05, -1.16, 0.95, 2.08, 1.16, LP.yellow);
      boxL(o, -1.65, 1.05, -1.16, 0.95, 2.08, 1.16);
      const cwB = [[-2.25, 1.05, -1.08], [-1.65, 1.05, -1.16], [-1.65, 1.05, 1.16], [-2.25, 1.05, 1.08]];
      const cwT = [[-2.18, 2.05, -1.02], [-1.65, 2.08, -1.14], [-1.65, 2.08, 1.14], [-2.18, 2.05, 1.02]];
      prismS(P, C, cwB, cwT, LP.yellow); prismL(o, cwB, cwT);
      boxS(P, C, -2.26, 1.18, -0.96, -2.14, 1.56, 0.96, LP.tire);
      boxS(P, C, -1.45, 2.08, -0.78, 0.35, 2.28, 0.10, LP.steel);
      boxL(o, -1.45, 2.08, -0.78, 0.35, 2.28, 0.10);
      tubeS(P, C, [-1.30, 2.25, -0.58], [-1.30, 2.98, -0.58], 0.065, 0.055, 8, LP.tire, true);
      seg(o, [-1.30, 2.25, -0.58], [-1.30, 2.98, -0.58]);
      if (hi) { boxL(o, -2.26, 1.18, -0.96, -2.14, 1.56, 0.96); ring(o, [-1.30, 2.98, -0.58], 0.055, 'y', 6); }

      // 左侧全景玻璃驾驶室（窗框全墨线勾勒）
      const cb = [[-0.45, 1.05, 0.18], [1.28, 1.05, 0.18], [1.28, 1.05, 1.16], [-0.45, 1.05, 1.16]];
      const cm = [[-0.45, 1.65, 0.18], [1.28, 1.65, 0.18], [1.28, 1.65, 1.16], [-0.45, 1.65, 1.16]];
      const ct = [[-0.45, 2.86, 0.18], [1.08, 2.86, 0.18], [1.08, 2.86, 1.16], [-0.45, 2.86, 1.16]];
      prismS(P, C, cb, cm, LP.yellow); prismS(P, C, cm, ct, LP.glass);
      prismL(o, cb, cm); prismL(o, cm, ct);
      const ef = [[1.29, 1.70, 0.26], [1.29, 1.70, 1.08], [1.11, 2.78, 1.08], [1.11, 2.78, 0.26]];
      const es = [[-0.36, 1.70, 1.175], [1.18, 1.70, 1.175], [1.02, 2.78, 1.175], [-0.36, 2.78, 1.175]];
      const eb = [[-0.465, 1.72, 1.06], [-0.465, 1.72, 0.28], [-0.465, 2.74, 0.28], [-0.465, 2.74, 1.06]];
      poly(o, ef, true); poly(o, es, true); if (hi) poly(o, eb, true);
      boxS(P, C, -0.48, 2.86, 0.16, 1.12, 2.94, 1.18, LP.yellow);
      boxL(o, -0.48, 2.86, 0.16, 1.12, 2.94, 1.18);

      // 动臂根部双耳铰支座 + 鹅颈两段式实心大臂 + 斗杆 + 双液压油缸 + 带齿铲斗
      boxS(P, C, 0.25, 1.05, -0.52, 0.94, 1.78, 0.04, LP.yellow);
      boxL(o, 0.25, 1.05, -0.52, 0.94, 1.78, 0.04);
      const b0 = [[0.42, 1.48, -0.42], [0.42, 1.48, -0.06], [0.64, 1.88, -0.06], [0.64, 1.88, -0.42]];
      const bm = [[1.28, 2.82, -0.42], [1.28, 2.82, -0.06], [1.56, 3.14, -0.06], [1.56, 3.14, -0.42]];
      const b1 = [[2.18, 3.12, -0.38], [2.18, 3.12, -0.10], [2.36, 3.40, -0.10], [2.36, 3.40, -0.38]];
      prismS(P, C, b0, bm, LP.yellow); prismS(P, C, bm, b1, LP.yellow);
      prismL(o, b0, bm); prismL(o, bm, b1);
      const s0 = [[2.12, 3.22, -0.36], [2.12, 3.22, -0.12], [2.42, 3.36, -0.12], [2.42, 3.36, -0.36]];
      const s1 = [[2.96, 1.45, -0.34], [2.96, 1.45, -0.14], [3.18, 1.56, -0.14], [3.18, 1.56, -0.34]];
      prismS(P, C, s0, s1, LP.yellow); prismL(o, s0, s1);
      for (const dz of [-0.44, -0.04]) {
        tubeS(P, C, [0.80, 1.24, dz], [1.10, 2.02, dz], 0.065, 0.065, 6, LP.tire, true);
        tubeS(P, C, [1.10, 2.02, dz], [1.38, 2.80, dz], 0.040, 0.040, 6, LP.steelL, true);
        tubeL(o, [0.80, 1.24, dz], [1.10, 2.02, dz], 0.068, 0.068);
        tubeL(o, [1.10, 2.02, dz], [1.38, 2.80, dz], 0.043, 0.043);
      }
      tubeS(P, C, [1.38, 3.12, -0.24], [1.85, 3.36, -0.24], 0.075, 0.075, 6, LP.tire, true);
      tubeS(P, C, [1.85, 3.36, -0.24], [2.30, 3.48, -0.24], 0.045, 0.045, 6, LP.steelL, true);
      tubeL(o, [1.38, 3.12, -0.24], [1.85, 3.36, -0.24], 0.078, 0.078);
      tubeL(o, [1.85, 3.36, -0.24], [2.30, 3.48, -0.24], 0.048, 0.048);
      const bw = 0.46;
      const kb = [[2.42, 0.56, -0.24 - bw], [3.22, 0.72, -0.24 - bw], [3.22, 0.72, -0.24 + bw], [2.42, 0.56, -0.24 + bw]];
      const kt = [[2.88, 1.48, -0.24 - bw], [3.35, 1.38, -0.24 - bw], [3.35, 1.38, -0.24 + bw], [2.88, 1.48, -0.24 + bw]];
      prismS(P, C, kb, kt, LP.steel); prismL(o, kb, kt);
      for (let k = -1.5; k <= 1.5; k += 1) {
        const tz = -0.24 + k * 0.24;
        tubeS(P, C, [2.44, 0.58, tz], [2.18, 0.46, tz], 0.045, 0.015, 4, LP.tire, true);
        seg(o, [2.44, 0.58, tz], [2.18, 0.46, tz]);
      }
      _CL = null;
      return { L: new Float32Array(o), P: new Float32Array(P), C: new Float32Array(C), CL: new Float32Array(CL), hx: 3.6, hz: 1.5, h: 3.6 };
    }

    if (kind === 'scissor') {
      // 剪叉式高空作业平台：实心底盘 + 3 层管状 X 剪叉臂 + 中央顶升油缸 + 护栏平台（全墨线）
      boxS(P, C, -1.25, 0.22, -0.68, 1.25, 0.72, 0.68, LP.orange);
      boxL(o, -1.25, 0.22, -0.68, 1.25, 0.72, 0.68);
      boxS(P, C, -0.65, 0.26, -0.71, 0.65, 0.66, 0.71, LP.steel);
      if (hi) boxL(o, -0.65, 0.26, -0.71, 0.65, 0.66, 0.71);
      axle(-0.90, 0.68, 0.22, false); axle(0.90, 0.68, 0.22, false);
      const tiers = 3, y0 = 0.72, y1 = 3.10, dy = (y1 - y0) / tiers;
      for (const s of [-0.52, 0.52]) {
        for (let i = 0; i < tiers; i++) {
          const ya = y0 + i * dy, yb = ya + dy;
          tubeS(P, C, [-1.05, ya, s], [1.05, yb, s], 0.042, 0.042, 6, LP.yellow, true);
          tubeS(P, C, [1.05, ya, s], [-1.05, yb, s], 0.042, 0.042, 6, LP.yellow, true);
          tubeL(o, [-1.05, ya, s], [1.05, yb, s], 0.045, 0.045);
          tubeL(o, [1.05, ya, s], [-1.05, yb, s], 0.045, 0.045);
        }
      }
      for (let i = 0; i < tiers; i++) {
        tubeS(P, C, [0, y0 + (i + 0.5) * dy, -0.54], [0, y0 + (i + 0.5) * dy, 0.54], 0.035, 0.035, 6, LP.steel, true);
        tubeL(o, [0, y0 + (i + 0.5) * dy, -0.54], [0, y0 + (i + 0.5) * dy, 0.54], 0.038, 0.038);
      }
      tubeS(P, C, [-0.35, y0 + 0.1, 0], [0.25, y0 + dy * 1.4, 0], 0.065, 0.065, 6, LP.tire, true);
      tubeS(P, C, [0.25, y0 + dy * 1.4, 0], [0.65, y1 - 0.1, 0], 0.040, 0.040, 6, LP.steelL, true);
      tubeL(o, [-0.35, y0 + 0.1, 0], [0.25, y0 + dy * 1.4, 0], 0.068, 0.068);
      tubeL(o, [0.25, y0 + dy * 1.4, 0], [0.65, y1 - 0.1, 0], 0.043, 0.043);
      boxS(P, C, -1.32, y1, -0.74, 1.32, y1 + 0.18, 0.74, LP.steel);
      boxL(o, -1.32, y1, -0.74, 1.32, y1 + 0.18, 0.74);
      const hy1 = y1 + 0.60, hy2 = y1 + 1.06;
      for (const y of [hy1, hy2]) {
        tubeS(P, C, [-1.30, y, -0.72], [1.30, y, -0.72], 0.022, 0.022, 5, LP.yellow, true);
        tubeS(P, C, [1.30, y, -0.72], [1.30, y, 0.72], 0.022, 0.022, 5, LP.yellow, true);
        tubeS(P, C, [1.30, y, 0.72], [-1.30, y, 0.72], 0.022, 0.022, 5, LP.yellow, true);
        tubeS(P, C, [-1.30, y, 0.72], [-1.30, y, -0.72], 0.022, 0.022, 5, LP.yellow, true);
        tubeL(o, [-1.30, y, -0.72], [1.30, y, -0.72], 0.025, 0.025);
        tubeL(o, [1.30, y, -0.72], [1.30, y, 0.72], 0.025, 0.025);
        tubeL(o, [1.30, y, 0.72], [-1.30, y, 0.72], 0.025, 0.025);
        tubeL(o, [-1.30, y, 0.72], [-1.30, y, -0.72], 0.025, 0.025);
      }
      for (const x of [-1.30, 0, 1.30]) for (const z of [-0.72, 0.72]) {
        tubeS(P, C, [x, y1 + 0.16, z], [x, hy2, z], 0.024, 0.024, 5, LP.yellow, true);
        tubeL(o, [x, y1 + 0.16, z], [x, hy2, z], 0.027, 0.027);
      }
      boxS(P, C, 1.08, hy1 + 0.12, 0.25, 1.34, hy2 + 0.08, 0.65, LP.steelL);
      boxL(o, 1.08, hy1 + 0.12, 0.25, 1.34, hy2 + 0.08, 0.65);
      _CL = null;
      return { L: new Float32Array(o), P: new Float32Array(P), C: new Float32Array(C), CL: new Float32Array(CL), hx: 1.4, hz: 0.85, h: 4.2 };
    }

    if (kind === 'drill') {
      // 旋挖钻机（地下桩基期）：圆角双履带 + 回转机棚/配重 + 全景驾驶室 + 变幅平行四边形机构 + 11 m 竖向钻桅 + 动力头 + 钻杆与螺旋钻斗
      for (const s of [-1, 1]) {
        const z0 = s * 1.40;
        boxS(P, C, -2.35, 0.0, z0 - 0.36, 2.35, 0.92, z0 + 0.36, LP.tire);
        boxL(o, -2.35, 0.0, z0 - 0.36, 2.35, 0.92, z0 + 0.36);
        for (const tx of [-2.35, 2.35]) {
          tubeS(P, C, [tx, 0.46, z0 - 0.37], [tx, 0.46, z0 + 0.37], 0.45, 0.45, hi ? 10 : 8, LP.tire, true);
          ring(o, [tx, 0.46, z0 + s * 0.38], 0.43, 'z', hi ? 10 : 6);
        }
        if (hi) for (let x = -2.0; x <= 2.01; x += 0.5) seg(o, [x, 0.04, z0 + s * 0.37], [x, 0.88, z0 + s * 0.37]);
      }
      boxS(P, C, -1.35, 0.36, -1.04, 1.35, 0.94, 1.04, LP.steel); boxL(o, -1.35, 0.36, -1.04, 1.35, 0.94, 1.04);
      tubeS(P, C, [0, 0.94, 0], [0, 1.18, 0], 0.98, 0.98, 12, LP.steel, true); ring(o, [0, 1.06, 0], 0.98, 'y', 10);
      // 上车机棚 + 尾部配重 + 引擎盖 + 排气管 + 驾驶室
      boxS(P, C, -2.05, 1.18, -1.25, 1.35, 2.38, 1.25, LP.yellow); boxL(o, -2.05, 1.18, -1.25, 1.35, 2.38, 1.25);
      boxS(P, C, -2.75, 1.24, -1.18, -2.05, 2.28, 1.18, LP.conc); boxL(o, -2.75, 1.24, -1.18, -2.05, 2.28, 1.18);
      boxS(P, C, -1.85, 2.38, -0.82, 0.35, 2.62, 0.25, LP.steel); boxL(o, -1.85, 2.38, -0.82, 0.35, 2.62, 0.25);
      tubeS(P, C, [-1.55, 2.60, -0.62], [-1.55, 3.35, -0.62], 0.07, 0.06, 6, LP.tire, true); seg(o, [-1.55, 2.60, -0.62], [-1.55, 3.35, -0.62]);
      boxS(P, C, 0.05, 1.18, 0.44, 1.72, 3.08, 1.36, LP.cabW); boxL(o, 0.05, 1.18, 0.44, 1.72, 3.08, 1.36);
      const dw = [[1.73, 1.52, 0.52], [1.73, 1.52, 1.28], [1.73, 2.94, 1.28], [1.73, 2.94, 0.52]];
      quadS(P, C, dw[0], dw[1], dw[2], dw[3], LP.glass, 1.02); poly(o, dw, true);
      // 变幅平行四边形连杆与双变幅油缸（位于 z = ±0.30 钻桅中心线两侧，与驾驶室零穿插、直连钻桅箱体）
      for (const s of [-0.30, 0.30]) {
        tubeS(P, C, [1.15, 1.65, s], [2.52, 2.85, s], 0.09, 0.09, 6, LP.yellow, true);
        tubeS(P, C, [0.95, 2.30, s], [2.52, 4.35, s], 0.08, 0.08, 6, LP.steelL, true);
        tubeS(P, C, [0.85, 1.32, s], [2.52, 3.55, s], 0.085, 0.06, 6, LP.tire, true);
        tubeL(o, [1.15, 1.65, s], [2.52, 2.85, s], 0.095, 0.095);
        tubeL(o, [0.95, 2.30, s], [2.52, 4.35, s], 0.085, 0.085);
      }
      // 竖向箱形钻桅 + 滑轮桅顶 + 后拉钢丝绳
      boxS(P, C, 2.36, 0.45, -0.34, 2.90, 10.65, 0.34, LP.yellow); boxL(o, 2.36, 0.45, -0.34, 2.90, 10.65, 0.34);
      boxS(P, C, 2.28, 10.65, -0.44, 3.22, 11.25, 0.44, LP.red); boxL(o, 2.28, 10.65, -0.44, 3.22, 11.25, 0.44);
      if (hi) for (let y = 1.6; y <= 10.0; y += 1.4) { seg(o, [2.36, y, -0.35], [2.90, y, -0.35]); seg(o, [2.36, y, 0.35], [2.90, y, 0.35]); }
      for (const s of [-0.36, 0.36]) seg(o, [-1.85, 2.40, s * 2.2], [2.45, 10.95, s]);
      // 动力头 + 钻杆 + 接地螺旋钻斗（y = 0.02..1.62）
      boxS(P, C, 2.74, 3.70, -0.46, 3.36, 4.88, 0.46, LP.orange); boxL(o, 2.74, 3.70, -0.46, 3.36, 4.88, 0.46);
      tubeS(P, C, [3.06, 1.60, 0], [3.06, 10.85, 0], 0.13, 0.13, 8, LP.steelL, true);
      tubeL(o, [3.06, 1.60, 0], [3.06, 10.85, 0], 0.135, 0.135);
      tubeS(P, C, [3.06, 0.02, 0], [3.06, 1.62, 0], 0.38, 0.38, hi ? 10 : 8, LP.steel, true);
      for (const y of [0.10, 0.55, 1.00, 1.45]) ring(o, [3.06, y, 0], 0.40, 'y', hi ? 10 : 6);
      _CL = null;
      return { L: new Float32Array(o), P: new Float32Array(P), C: new Float32Array(C), CL: new Float32Array(CL), hx: 3.45, hz: 1.85, h: 11.4 };
    }

    if (kind === 'pump') {
      // 混凝土臂架泵车（主体/承轨层浇筑期）：四桥重卡底盘 + 四展开支腿垫板 + 尾端料斗 + 回转塔 + 四节折臂与泵送管 + 软管
      for (const s of [-1, 1]) boxS(P, C, -5.15, 0.84, s * 0.52 - 0.12, 4.75, 1.16, s * 0.52 + 0.12, LP.steel);
      boxS(P, C, -5.15, 1.16, -1.18, 4.75, 1.32, 1.18, LP.steel); boxL(o, -5.15, 1.16, -1.18, 4.75, 1.32, 1.18);
      cab(2.75, 4.80, 1.32, 3.38, 1.18, LP.cabW);
      axle(-3.95, 1.12, 0.50, true); axle(-2.65, 1.12, 0.50, true); axle(1.95, 1.12, 0.50, false); axle(3.65, 1.12, 0.50, false);
      // 4 条展开支腿（落在 z = ±1.48，位于 hz = 1.65 支撑范围内，零悬空）
      for (const ax of [-4.45, 1.25]) {
        boxS(P, C, ax - 0.22, 0.80, -1.56, ax + 0.22, 1.14, 1.56, LP.orange); boxL(o, ax - 0.22, 0.80, -1.56, ax + 0.22, 1.14, 1.56);
        for (const s of [-1, 1]) {
          const z = s * 1.48;
          tubeS(P, C, [ax, 0.08, z], [ax, 1.14, z], 0.10, 0.12, 6, LP.steelL, true);
          boxS(P, C, ax - 0.24, 0.0, z - 0.24, ax + 0.24, 0.08, z + 0.24, LP.steel);
          boxL(o, ax - 0.24, 0.0, z - 0.24, ax + 0.24, 0.08, z + 0.24);
          seg(o, [ax, 0.08, z], [ax, 1.14, z]);
        }
      }
      // 泵送机罩 + 尾端受料斗 + 中置回转塔
      boxS(P, C, -4.35, 1.32, -1.04, 0.85, 2.22, 1.04, LP.yellow); boxL(o, -4.35, 1.32, -1.04, 0.85, 2.22, 1.04);
      const hpB = [[-5.18, 0.96, -0.62], [-4.35, 0.96, -0.62], [-4.35, 0.96, 0.62], [-5.18, 0.96, 0.62]];
      const hpT = [[-5.32, 1.88, -0.82], [-4.35, 1.88, -0.82], [-4.35, 1.88, 0.82], [-5.32, 1.88, 0.82]];
      prismS(P, C, hpB, hpT, LP.steel); prismL(o, hpB, hpT);
      boxS(P, C, 0.85, 1.32, -0.82, 2.10, 2.85, 0.82, LP.orange); boxL(o, 0.85, 1.32, -0.82, 2.10, 2.85, 0.82);
      // 四节 Z 型布料臂架（实体臂节 + 伴随输送钢管 + 变幅油缸 + 车头前方净空悬挂软管，不穿驾驶室）
      const segArm = (a, b, r0, r1, col) => {
        tubeS(P, C, a, b, r0, r1, 6, col, true);
        tubeL(o, a, b, r0 + 0.01, r1 + 0.01);
        tubeS(P, C, [a[0], a[1] + r0 + 0.08, a[2] + 0.14], [b[0], b[1] + r1 + 0.08, b[2] + 0.14], 0.065, 0.065, 6, LP.steelL, true);
      };
      const j0 = [1.45, 2.85, 0], j1 = [-2.75, 5.10, 0], j2 = [2.15, 6.25, 0], j3 = [5.45, 4.95, 0];
      segArm(j0, j1, 0.26, 0.22, LP.yellow);
      segArm(j1, j2, 0.21, 0.17, LP.red);
      segArm(j2, j3, 0.16, 0.12, LP.yellow);
      tubeS(P, C, [0.45, 2.15, 0], [-0.55, 3.85, 0], 0.11, 0.08, 6, LP.tire, true);
      tubeS(P, C, j3, [5.52, 2.35, 0], 0.075, 0.075, 6, LP.tire, true);
      seg(o, j3, [5.52, 2.35, 0]);
      _CL = null;
      return { L: new Float32Array(o), P: new Float32Array(P), C: new Float32Array(C), CL: new Float32Array(CL), hx: 5.55, hz: 1.65, h: 6.5 };
    }

    if (kind === 'dump') {
      // 重型自卸土方车（基坑土方外运）：三桥车架 + 橙色驾驶室 + 加强筋钢货箱 + 驾驶室防护檐 + 液压举升缸 + 满载土方堆
      for (const s of [-1, 1]) boxS(P, C, -4.35, 0.84, s * 0.52 - 0.12, 4.15, 1.18, s * 0.52 + 0.12, LP.steel);
      boxS(P, C, -4.35, 1.18, -1.16, 4.15, 1.30, 1.16, LP.steel); boxL(o, -4.35, 1.18, -1.16, 4.15, 1.30, 1.16);
      boxS(P, C, -0.35, 0.56, 0.68, 1.35, 1.08, 1.16, LP.steelL);
      if (hi) boxL(o, -0.35, 0.56, 0.68, 1.35, 1.08, 1.16);
      cab(2.15, 4.25, 1.28, 3.36, 1.18, LP.orange);
      axle(-3.25, 1.12, 0.52, true); axle(-1.85, 1.12, 0.52, true); axle(3.15, 1.12, 0.52, false);
      // 钢制自卸货箱（含前防护帽檐 + 两侧竖向加强筋 + 前举升油缸）
      const db = [[-4.35, 1.32, -1.18], [1.85, 1.32, -1.18], [1.85, 1.32, 1.18], [-4.35, 1.32, 1.18]];
      const dt = [[-4.10, 2.98, -1.22], [1.85, 2.98, -1.22], [1.85, 2.98, 1.22], [-4.10, 2.98, 1.22]];
      prismS(P, C, db, dt, LP.cabB); prismL(o, db, dt);
      boxS(P, C, 1.85, 3.16, -1.12, 2.95, 3.36, 1.12, LP.cabB); boxL(o, 1.85, 3.16, -1.12, 2.95, 3.36, 1.12);
      for (let x = -3.4; x <= 1.2; x += 1.15) {
        for (const s of [-1, 1]) {
          const z0 = s > 0 ? 1.18 : -1.26, z1 = s > 0 ? 1.26 : -1.18;
          boxS(P, C, x - 0.08, 1.38, z0, x + 0.08, 2.94, z1, LP.steel);
          if (hi) boxL(o, x - 0.08, 1.38, z0, x + 0.08, 2.94, z1);
        }
      }
      tubeS(P, C, [1.96, 1.32, 0], [1.96, 2.90, 0], 0.12, 0.09, 6, LP.steelL, true);
      // 满载开挖土方堆
      const sb = [[-3.95, 2.96, -1.06], [1.65, 2.96, -1.06], [1.65, 2.96, 1.06], [-3.95, 2.96, 1.06]];
      const st = [[-3.15, 3.50, -0.58], [0.85, 3.52, -0.58], [0.85, 3.52, 0.58], [-3.15, 3.50, 0.58]];
      prismS(P, C, sb, st, LP.soil); if (hi) prismL(o, sb, st);
      _CL = null;
      return { L: new Float32Array(o), P: new Float32Array(P), C: new Float32Array(C), CL: new Float32Array(CL), hx: 4.5, hz: 1.35, h: 3.6 };
    }

    // 履带吊底盘（B-6 精修：圆角驱动轮/导向轮 + H 形下车架 + 实心回转支承 + 分层配重 + 引擎盖排气管 + 实心管状人字架）
    for (const s of [-1, 1]) {
      const z0 = s * 2.3;
      boxL(o, -3.55, 0, z0 - 0.52, 3.55, 1.20, z0 + 0.52);
      boxS(P, C, -3.55, 0, z0 - 0.52, 3.55, 1.20, z0 + 0.52, LP.tire);
      for (const tx of [-3.55, 3.55]) {
        tubeS(P, C, [tx, 0.60, z0 - 0.53], [tx, 0.60, z0 + 0.53], 0.59, 0.59, hi ? 12 : 8, LP.tire, true);
        tubeS(P, C, [tx, 0.60, z0 + s * 0.52], [tx, 0.60, z0 + s * 0.58], 0.24, 0.20, 8, LP.steel, true);
        ring(o, [tx, 0.60, z0 + s * 0.55], 0.56, 'z', hi ? 12 : 8);
      }
      const step = hi ? 0.55 : 1.1;
      for (let x = -3.0; x <= 3.01; x += step) { seg(o, [x, 0.02, z0 - 0.53], [x, 1.18, z0 - 0.53]); if (hi) seg(o, [x, 0.02, z0 + 0.53], [x, 1.18, z0 + 0.53]); }
    }
    boxL(o, -1.65, 0.44, -1.78, 1.65, 1.14, 1.78);
    boxS(P, C, -1.65, 0.44, -1.78, 1.65, 1.14, 1.78, LP.steel);
    tubeS(P, C, [0, 1.14, 0], [0, 1.34, 0], 1.32, 1.32, 12, LP.steel, true);
    ring(o, [0, 1.24, 0], 1.35, 'y', hi ? 12 : 8);
    boxL(o, -2.5, 1.32, -1.75, 2.2, 3.35, 1.75);
    boxS(P, C, -2.5, 1.32, -1.75, 2.2, 3.35, 1.75, LP.orange);
    // 顶部引擎罩与排气管
    boxS(P, C, -2.1, 3.35, -1.15, 0.9, 3.60, 0.85, LP.steel); boxL(o, -2.1, 3.35, -1.15, 0.9, 3.60, 0.85);
    tubeS(P, C, [-1.65, 3.58, -0.95], [-1.65, 4.32, -0.95], 0.08, 0.07, 6, LP.tire, true);
    // 分层配重块（3 层阶梯拼块）
    for (let k = 0; k < 3; k++) {
      const y0 = 1.38 + k * 0.60, y1 = y0 + 0.54;
      boxS(P, C, -3.58, y0, -1.65, -2.50, y1, 1.65, LP.conc);
      boxL(o, -3.58, y0, -1.65, -2.50, y1, 1.65);
    }
    if (hi) for (let x = -2.0; x <= 1.2; x += 0.8) seg(o, [x, 1.65, -1.76], [x, 2.95, -1.76]);
    boxL(o, 1.05, 1.32, 1.05, 2.65, 3.25, 2.05);
    boxS(P, C, 1.05, 1.32, 1.05, 2.65, 3.25, 2.05, LP.cabW);
    const fw = [[2.66, 1.55, 1.18], [2.66, 1.55, 1.92], [2.66, 3.05, 1.92], [2.66, 3.05, 1.18]];
    poly(o, fw, true); quadS(P, C, fw[0], fw[1], fw[2], fw[3], LP.glass, 1.02);
    if (hi) {
      const sw = [[1.25, 1.65, 2.06], [2.45, 1.65, 2.06], [2.45, 3.05, 2.06], [1.25, 3.05, 2.06]];
      poly(o, sw, true); quadS(P, C, sw[0], sw[1], sw[2], sw[3], LP.glass, 0.96);
    }
    // 实心管状 A 字人字架（实景下保持完整立体观感）
    const gTop = [-2.55, 5.45];
    for (const s of [-1.15, 1.15]) {
      tubeS(P, C, [-2.45, 3.35, s], [gTop[0], gTop[1], s * 0.72], 0.08, 0.07, 6, LP.steel, true);
      tubeS(P, C, [-0.65, 3.35, s], [gTop[0], gTop[1], s * 0.72], 0.08, 0.07, 6, LP.steel, true);
      seg(o, [-2.45, 3.35, s], [gTop[0], gTop[1], s * 0.72]);
      seg(o, [-0.65, 3.35, s], [gTop[0], gTop[1], s * 0.72]);
    }
    tubeS(P, C, [gTop[0], gTop[1], -0.86], [gTop[0], gTop[1], 0.86], 0.09, 0.09, 6, LP.steel, true);
    seg(o, [gTop[0], gTop[1], -0.83], [gTop[0], gTop[1], 0.83]);
    _CL = null;
    return { L: new Float32Array(o), P: new Float32Array(P), C: new Float32Array(C), CL: new Float32Array(CL), hx: 3.7, hz: 2.9, h: 3.4 };
  }

  const mkFig = k => { const lo = figure(k, false), hi = figure(k, true); return { L: lo.L, P: lo.P, C: lo.C, CL: lo.CL, Lhi: hi.L, Phi: hi.P, Chi: hi.C, CLhi: hi.CL }; };
  const FIG_OBJ = { stand: mkFig('stand'), push: mkFig('push'), weld: mkFig('weld'), signal: mkFig('signal'), pax: mkFig('pax'), paxbag: mkFig('paxbag') };
  const FIG = { stand: FIG_OBJ.stand.L, push: FIG_OBJ.push.L, weld: FIG_OBJ.weld.L, signal: FIG_OBJ.signal.L };   // 施工姿态（考卷按它判工人姿态）
  const PAX = { pax: FIG_OBJ.pax.L, paxbag: FIG_OBJ.paxbag.L };
  const mkVeh = k => { const lo = vehicle(k, false), hi = vehicle(k, true); return { L: lo.L, P: lo.P, C: lo.C, CL: lo.CL, Lhi: hi.L, Phi: hi.P, Chi: hi.C, CLhi: hi.CL, hx: lo.hx, hz: lo.hz, h: lo.h }; };
  const VEH = {
    mixer: mkVeh('mixer'), flatbed: mkVeh('flatbed'), excavator: mkVeh('excavator'), scissor: mkVeh('scissor'),
    crawler: mkVeh('crawler'), drill: mkVeh('drill'), pump: mkVeh('pump'), dump: mkVeh('dump')
  };
  const FW = 0.3, FH = 1.85;

  // ---------- 工种规则（B-6 扩充旋挖钻机/泵车/自卸车混编派车） ----------
  const TRADE = {
    civil: { n: 6, mix: ['push', 'push', 'stand', 'stand', 'signal'], veh: 'excavator', vehs: ['drill', 'excavator', 'dump'] },
    frame: { n: 5, mix: ['push', 'push', 'stand', 'weld', 'signal'], veh: 'mixer', vehs: ['pump', 'mixer', 'mixer'] },
    mezz: { n: 4, mix: ['push', 'stand', 'stand', 'signal'], veh: 'mixer', vehs: ['mixer', 'pump'] },
    bridge: { n: 4, mix: ['push', 'stand', 'weld', 'signal'], veh: 'mixer', vehs: ['pump', 'mixer'] },
    track: { n: 4, mix: ['push', 'push', 'stand', 'signal'], veh: 'flatbed', vehs: ['flatbed'] },
    steel: { n: 4, mix: ['weld', 'weld', 'stand', 'signal'], veh: 'flatbed', vehs: ['flatbed'] },
    asm: { n: 5, mix: ['weld', 'weld', 'weld', 'stand', 'signal'], veh: 'scissor', vehs: ['scissor'] },
    jig: { n: 3, mix: ['weld', 'stand', 'signal'], veh: 'flatbed', vehs: ['flatbed'] },
    skin: { n: 4, mix: ['weld', 'stand', 'stand', 'signal'], veh: 'scissor', vehs: ['scissor'] },
    tod: { n: 4, mix: ['push', 'stand', 'weld', 'signal'], veh: 'mixer', vehs: ['pump', 'mixer', 'flatbed'] },
    ym: { n: 4, mix: ['push', 'stand', 'weld', 'signal'], veh: 'mixer', vehs: ['pump', 'mixer', 'flatbed'] },
  };
  const tradeOf = a => { for (const k in a.res) if (TRADE[k]) return k; return null; };
  const stOf = (p, t) => { if (p.st == null || t < p.st) return -1; if (p.rm && p.rm[0] >= 0 && t >= p.rm[0]) return t >= p.rm[0] + p.rm[1] ? 3 : 2; return t < p.st + p.du ? (t - p.st) / p.du : 2; };
  const present = (p, t) => { const s = stOf(p, t); return s >= 0 && s !== 3; };
  const rng = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let q = Math.imul(s ^ s >>> 15, 1 | s); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; }; };

  // ---------- 场地索引 ----------
  function index(HZ) {
    const B = [], G = new Map();
    for (const a of HZ.acts) for (const p of a.parts) { if (p.grp || p.cells || !p.geo || !p.geo.boxes) continue; for (const b of p.geo.boxes) B.push({ p, a, b }); }
    const seen = new Set();
    for (let i = 0; i < B.length; i++) {
      const { b } = B[i]; const k = b.min.join() + '|' + b.max.join() + '|' + B[i].p.st; if (seen.has(k)) continue; seen.add(k);
      const x0 = Math.floor(b.min[0] / CELL), x1 = Math.floor(b.max[0] / CELL), z0 = Math.floor(b.min[2] / CELL), z1 = Math.floor(b.max[2] / CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const key = x * 4096 + z; let l = G.get(key); if (!l) G.set(key, l = []); l.push(i); }
    }
    const crawl = []; for (const a of HZ.acts) for (const p of a.parts) if (p.crane === -1 && p.crawl) crawl.push({ a, p });
    return { B, G, crawl, stamp: new Uint32Array(B.length), gen: 0 };
  }
  function near(I, x0, z0, x1, z1, fn) {
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL), cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    const multi = cx1 > cx0 || cz1 > cz0, g = multi ? ++I.gen : 0, st = I.stamp;
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) {
      const l = I.G.get(x * 4096 + z); if (!l) continue;
      for (let j = 0; j < l.length; j++) { const i = l[j]; if (multi) { if (st[i] === g) continue; st[i] = g; } if (fn(I.B[i]) === false) return false; }
    }
    return true;
  }
  function clear(I, t, x0, y0, z0, x1, y1, z1) {
    // Q#15 性能修复（任务 #43）：与 near 同一迭代形态但逐条目内联，省去每件一次闭包调用（放置热路径每轮数百次查询）
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL), cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    const multi = cx1 > cx0 || cz1 > cz0, g = multi ? ++I.gen : 0, st = I.stamp;
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const l = I.G.get(cx * 4096 + cz); if (!l) continue;
      for (let j = 0; j < l.length; j++) { const i = l[j]; if (multi) { if (st[i] === g) continue; st[i] = g; }
        const e = I.B[i], b = e.b;
        if (b.max[0] <= x0 || b.min[0] >= x1 || b.max[2] <= z0 || b.min[2] >= z1 || b.max[1] <= y0 || b.min[1] >= y1) continue;
        if (present(e.p, t)) return false;
      }
    }
    return true;
  }
  const solidTop = (e, t) => { const s = stOf(e.p, t); return s >= 0 && s !== 3 && (s >= 0.96 || e.b.max[1] - e.p.geo.min[1] <= 1.5); };
  function supportAt(I, t, x, y, z) {
    let ok = false;
    near(I, x, z, x, z, e => { const b = e.b; if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) return; if (Math.abs(b.max[1] - y) <= EPS && solidTop(e, t)) { ok = true; return false; } });
    if (ok) return true; if (Math.abs(y) > EPS) return false;
    let pit = false; near(I, x, z, x, z, e => { const b = e.b; if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) return; if (b.max[1] < -EPS && b.min[1] < -1 && e.a.stage === 'found' && !present(e.p, t)) { pit = true; return false; } });
    return !pit;
  }
  function surfaceAt(I, t, x, z, ymax) {
    let y = null; near(I, x, z, x, z, e => { const b = e.b; if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2] || b.max[1] > ymax + EPS || !solidTop(e, t)) return; if (y == null || b.max[1] > y) y = b.max[1]; });
    if (y == null && ymax >= 0 && supportAt(I, t, x, 0, z)) y = 0; return y;
  }
  function supported(I, t, x, y, z, hx, hz, ca, sa) { for (const [u, v] of [[0, 0], [-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) if (!supportAt(I, t, x + u * ca - v * sa, y, z + u * sa + v * ca)) return false; return true; }
  // Q#15 性能修复（任务 #43）：单遍合并探测。在候选点区域一次扫描里同时（a）按 surfaceAt 口径找可站立顶面 ≤ ymax；（b）收集与候选盒 x/z 重叠、
  // 底面低于可放上限的在场件；调用方确定 y 后对收集件做一次 y 向重叠校验。等价于先 surfaceAt 再 clear 的两次网格扫描，条目遍历约省一半。
  const PROBE_HITS = []; const PROBE_VH = []; let PROBE_Y = null, PROBE_N = 0, PROBE_VHN = 0;
  function placeProbe(I, t, x, z, ymax, ex, ez) {
    PROBE_Y = null; PROBE_N = 0; let hn = 0; let y = null;
    const cx0 = Math.floor((x - ex) / CELL), cx1 = Math.floor((x + ex) / CELL), cz0 = Math.floor((z - ez) / CELL), cz1 = Math.floor((z + ez) / CELL);
    const multi = cx1 > cx0 || cz1 > cz0, g = multi ? ++I.gen : 0, st = I.stamp;
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const l = I.G.get(cx * 4096 + cz); if (!l) continue;
      for (let j = 0; j < l.length; j++) { const i = l[j]; if (multi) { if (st[i] === g) continue; st[i] = g; }
        const e = I.B[i], b = e.b;
        if (b.max[0] <= x - ex || b.min[0] >= x + ex || b.max[2] <= z - ez || b.min[2] >= z + ez) continue;
        if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] <= ymax + EPS && solidTop(e, t) && (y == null || b.max[1] > y)) y = b.max[1];
        if (b.min[1] < ymax + FH + EPS && b.max[1] > 0.02) PROBE_HITS[hn++] = e;
      }
    }
    PROBE_Y = y; PROBE_N = hn; return y;
  }
  function clearRot(I, t, x, y, z, hx, hz, h, ca, sa) { const ex = Math.abs(hx * ca) + Math.abs(hz * sa), ez = Math.abs(hx * sa) + Math.abs(hz * ca); return clear(I, t, x - ex, y + 0.02, z - ez, x + ex, y + h, z + ez); }

  // ---------- 布置 ----------
  function plan(HZ, I, t) {
    const hr = Math.floor(t * 24), hd = (t - Math.floor(t)) * 24, day = hd >= 7 && hd < 19, out = { t, figs: [], vehs: [], cranes: [], acts: [], pax: [] };
    if (HZ.P && t >= HZ.P.OPEN) { paxPlan(HZ, I, t, out); return out; }   // W2：开通运营后施工人员全部撤出，只有旅客（另列 out.pax，不混进施工工人 figs）
    const placed = [];
    const freeOf = (x0, z0, x1, z1, y0, y1) => { for (const q of placed) if (!(q[3] <= x0 || q[0] >= x1 || q[5] <= z0 || q[2] >= z1 || q[4] <= y0 || q[1] >= y1)) return false; return true; };
    // Q#15 性能修复（任务 #43）：顶面可行走箱组合只依赖几何（b 尺寸与 p.top），不随 t 变，按 part 记忆化；live/pick 用手写循环去掉逐件闭包
    const topsMemo = new WeakMap();
    for (const a of HZ.acts) {
      if (a.kind === 'milestone' || a.kind === 'untemp' || !(t >= a.start && t < a.end) || !a.parts.length) continue;
      const tr = tradeOf(a); if (!tr) continue;
      const live = []; for (const p of a.parts) { if (!p.grp && !p.cells && p.geo && p.geo.boxes) { const s = stOf(p, t); if (s >= 0 && s < 1) live.push(p); } }
      if (!live.length) continue;
      const T = TRADE[tr], R = rng(hr * 7919 + a.ix * 104729 + 17); let nA = 0;
      let pick = live; if (live.length > 24) { const step = Math.ceil(live.length / 24); pick = []; for (let i = 0; i < live.length; i += step) pick.push(live[i]); }
      for (const p of pick) {
        const nP = Math.max(1, Math.round(T.n * (day ? 1 : 0.3)));
        const mn = p.geo.min, mx = p.geo.max, canStandTop = stOf(p, t) >= 0.96 || (p.top - mn[1] <= 1.5);
        let tops;
        if (canStandTop) { tops = topsMemo.get(p); if (!tops) { tops = p.geo.boxes.filter(b => b.max[0] - b.min[0] >= 1.4 && b.max[2] - b.min[2] >= 1.4 && b.max[1] >= p.top - 0.05 && (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]) >= 6); topsMemo.set(p, tops); } }
        else tops = [];
        for (let k = 0; k < nP; k++) {
          for (let tryN = 0; tryN < 6; tryN++) {
            let x, y, z; const yaw = R() * Math.PI * 2;
            if (tops.length && tryN < 4) { const b = tops[Math.floor(R() * tops.length)]; x = b.min[0] + 0.5 + R() * (b.max[0] - b.min[0] - 1); z = b.min[2] + 0.5 + R() * (b.max[2] - b.min[2] - 1); y = b.max[1]; }
            else {
              x = mn[0] - 2 + R() * (mx[0] - mn[0] + 4); z = mn[2] - 2 + R() * (mx[2] - mn[2] + 4);
              y = placeProbe(I, t, x, z, p.top + 0.05, FW, FW);
              if (y == null && p.top + 0.05 >= 0 && supportAt(I, t, x, 0, z)) y = 0;
              if (y == null || (p.top - y > 3 && Math.abs(y - mn[1]) > 0.05)) continue;
              let blocked = false; for (let hi = 0; hi < PROBE_N; hi++) { const b = PROBE_HITS[hi].b; if (b.max[1] <= y + 0.02 || b.min[1] >= y + FH) continue; if (present(PROBE_HITS[hi].p, t)) { blocked = true; break; } }
              if (blocked) continue;
            }
            const box = [x - FW, y + 0.02, z - FW, x + FW, y + FH, z + FW]; if (!freeOf(box[0], box[2], box[3], box[5], box[1], box[4])) continue;
            // on-top 分支未走合并扫描，仍需查网格碰撞；else 分支已在 placeProbe 收集件里校验过
            if (tops.length && tryN < 4 && !clear(I, t, box[0], box[1], box[2], box[3], box[4], box[5])) continue;
            placed.push(box); out.figs.push({ x, y, z, yaw, pose: k === 0 && nP > 2 ? 'signal' : T.mix[Math.floor(R() * T.mix.length)], act: a.key }); nA++; break;
          }
        }
      }
      if (day && (a.kind !== 'temp' || tr === 'jig')) {
        const nV = Math.min(4, Math.ceil(live.length / 3)), vPool = T.vehs || [T.veh];
        const prog = a.end > a.start ? (t - a.start) / (a.end - a.start) : 0;
        const rot = (Math.floor(t) + a.ix) % vPool.length;
        for (let k = 0; k < nV; k++) {
          let vk = vPool[(k + rot) % vPool.length];
          if (tr === 'civil' && vk === 'drill' && prog > 0.65) vk = 'dump';
          const V = VEH[vk];
          const p = live[Math.floor(R() * live.length)], mn = p.geo.min, mx = p.geo.max;
          for (let tryN = 0; tryN < 6; tryN++) {
            const side = Math.floor(R() * 4), d = 4 + R() * 10 + V.hx, u = R();
            let x = side < 2 ? mn[0] + (mx[0] - mn[0]) * u : side === 2 ? mn[0] - d : mx[0] + d, z = side >= 2 ? mn[2] + (mx[2] - mn[2]) * u : side === 0 ? mn[2] - d : mx[2] + d;
            const yaw = Math.atan2(p.c[2] - z, p.c[0] - x), ca = Math.cos(yaw), sa = Math.sin(yaw), ex = Math.abs(V.hx * ca) + Math.abs(V.hz * sa), ez = Math.abs(V.hx * sa) + Math.abs(V.hz * ca);
            // 单遍合并：车体盒区域一次扫描，找落点顶面（在场件顶面 ≤ mn[1]+0.1）并收集潜在碰撞件，替代 y 扫描 + clearRot 两次遍历
            let y = 0; PROBE_VHN = 0;
            const cx0 = Math.floor((x - ex) / CELL), cx1 = Math.floor((x + ex) / CELL), cz0 = Math.floor((z - ez) / CELL), cz1 = Math.floor((z + ez) / CELL);
            const multi = cx1 > cx0 || cz1 > cz0, g = multi ? ++I.gen : 0, st = I.stamp;
            for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
              const l = I.G.get(cx * 4096 + cz); if (!l) continue;
              for (let j = 0; j < l.length; j++) { const i = l[j]; if (multi) { if (st[i] === g) continue; st[i] = g; }
                const e = I.B[i], b = e.b;
                if (b.max[0] <= x - ex || b.min[0] >= x + ex || b.max[2] <= z - ez || b.min[2] >= z + ez) continue;
                if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && present(e.p, t) && b.max[1] <= mn[1] + 0.1 && b.max[1] > y) y = b.max[1];
                if (b.min[1] < mn[1] + 0.1 + V.h + EPS) PROBE_VH[PROBE_VHN++] = e;
              }
            }
            // y 定型后再统一校验碰撞（收集期间 y 仍可能长高，边扫边查会漏判高处构件）
            for (let vi = 0; vi < PROBE_VHN; vi++) { const b = PROBE_VH[vi].b; if (b.max[1] <= y + 0.02 || b.min[1] >= y + V.h) continue; if (present(PROBE_VH[vi].p, t)) { y = -1; break; } }
            if (y < 0) continue;
            if (!freeOf(x - ex, z - ez, x + ex, z + ez, y + 0.02, y + V.h)) continue;
            if (!supported(I, t, x, y, z, V.hx * 0.9, V.hz * 0.9, ca, sa)) continue;
            placed.push([x - ex, y + 0.02, z - ez, x + ex, y + V.h, z + ez]); out.vehs.push({ x, y, z, yaw, kind: vk, act: a.key }); break;
          }
        }
      }
      if (nA) out.acts.push({ key: a.key, trade: tr, figs: nA, live: live.length });
    }
    for (const { a, p } of I.crawl) {
      if (!(t >= p.st - 0.5 && t < p.st + p.du + 0.5)) continue; if (out.cranes.length >= 14) break;
      const [x, z] = p.crawl, y = p.crawlY || 0, yaw = Math.atan2(p.c[2] - z, p.c[0] - x), ca = Math.cos(yaw), sa = Math.sin(yaw), V = VEH.crawler;
      if (!clearRot(I, t, x, y, z, V.hx, V.hz, V.h, ca, sa)) continue;
      const hd = Math.hypot(p.c[0] - x, p.c[2] - z) * 0.92, tipY = Math.max(p.top + 10, y + 22);
      out.cranes.push({ x, y, z, yaw, hd, tipY, hook: p.top + 1.5, act: a.key });
    }
    return out;
  }

  // ---------- W2 · 开通运营期旅客（任务 #33）----------
  // 站台：每个站台面（platTop 14.5 m）上按小时换一批候车旅客，避开柱位（中段 fxs 柱、两端 cxs 柱）、离站台边 ≥ 0.9 m（不落轨）；
  // 首趟 G9528 停稳后（车头到位），靠车一侧站台沿车门位置聚集、面向列车排队登车。
  // 云厅：24 m 候车层楼面沿云谷两侧（|z| 16–60 m），朝向沿站房东西轴（顺着候车层纵向走）。
  // 每人脚底都用 surfaceAt 取实际面、clear 查不穿构件，与施工工人同一套检查。
  function paxPlan(HZ, I, t, out) {
    // 位置用固定种子（每个站台 / 每侧楼面各一个），不随小时重排：3D 工期按天快放时一小时只占几帧，逐时重排会让人群闪烁
    const P = HZ.P, busy = 1, placed = [];
    let R = rng(991);
    const colsX = []; for (let x = -90; x <= 90; x += 20) colsX.push(x); for (let x = 133; x <= 220; x += 17.4) colsX.push(x, -x);
    const put = (x, y, z, yaw, pose) => {
      const box = [x - FW, y + 0.02, z - FW, x + FW, y + FH, z + FW];
      for (const q of placed) if (!(q[3] <= box[0] || q[0] >= box[3] || q[5] <= box[2] || q[2] >= box[5])) return false;
      const sy = surfaceAt(I, t, x, z, y + 0.05); if (sy == null || Math.abs(sy - y) > 0.06) return false;
      if (!clear(I, t, box[0], box[1], box[2], box[3], box[4], box[5])) return false;
      placed.push(box); out.pax.push({ x, y, z, yaw, pose }); return true;
    };
    // 首趟列车：车头停位 x ≈ 111、全长 ≈ 199 m、南场第 1 股道 z = 16.5；到位（开通 + 21 天后基本停稳）才排队登车
    const trainZ = HZ.tracks ? HZ.tracks(HZ.YARDS.S)[0] : 16.5, stopped = t >= P.OPEN + 21;
    for (const yk of ['S', 'N']) for (const pl of HZ.platforms(HZ.YARDS[yk])) {
      R = rng(Math.round(pl.z * 10) * 7 + (stopped ? 3 : 0) + 101);
      const z0 = pl.z - pl.w / 2 + 0.9, z1 = pl.z + pl.w / 2 - 0.9, trainSide = yk === 'S' && Math.abs(pl.z - pl.w / 2 - trainZ) < 6;
      const n = Math.round((trainSide ? 44 : 18) * busy);
      for (let k = 0, tries = 0; k < n && tries < n * 8; tries++) {
        let x, z, yaw;
        if (trainSide && stopped && k < n * 0.8) { const door = Math.floor(R() * 8); x = 111 - 10.5 - door * 25.65 - 4 + R() * 3; z = z0 + R() * 1.6; yaw = -Math.PI / 2 + (R() - 0.5) * 0.5; }   // 车门前排队
        else if (trainSide && k < n * 0.6) { x = -200 + R() * 330; z = z0 + 0.4 + R() * 1.6; yaw = -Math.PI / 2 + (R() - 0.5) * 1.2; }   // 安全线后候车，面向股道
        else { x = -200 + R() * 400; z = z0 + R() * (z1 - z0); yaw = (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.8; }
        if (colsX.some(cx => Math.abs(cx - x) < 1.4) && Math.abs(z - pl.z) < 1.4) continue;
        if (put(x, P.platTop, z, yaw, R() < 0.45 ? 'paxbag' : 'pax')) k++;
      }
    }
    R = rng(4099); const nF = Math.round(100 * busy);
    for (let k = 0, tries = 0; k < nF && tries < nF * 8; tries++) {
      const side = R() < 0.5 ? -1 : 1, x = -P.floorX + 3 + R() * (P.floorX * 2 - 6), z = side * (P.gap + 2 + R() * 44), yaw = (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.4;
      if (put(x, P.floorTop, z, yaw, R() < 0.3 ? 'paxbag' : 'pax')) k++;
    }
  }

  // ---------- 线段与实体写入 ----------
  function emit(buf, n, L, x, y, z, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw), m = L.length / 3;
    if ((n + m / 2) > MAXSEG) return n; let o = n * 6;
    for (let i = 0; i < L.length; i += 3) { const u = L[i], v = L[i + 1], w = L[i + 2]; buf[o++] = x + u * c - w * s; buf[o++] = y + v; buf[o++] = z + u * s + w * c; }
    return n + m / 2;
  }
  // 直接写入 InstancedMesh 的列主序 4×4 矩阵（零对象分配，匹配 emit 旋转约定）
  function pushInst(slot, x, y, z, yaw) {
    if (!slot || slot.n >= slot.cap) return;
    const a = slot.arr, o = slot.n * 16, c = Math.cos(yaw), s = Math.sin(yaw);
    a[o] = c; a[o + 1] = 0; a[o + 2] = s; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = -s; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
    slot.n++;
  }

  function emitCraneBoom(buf, n, k, hi) {
    const ca = Math.cos(k.yaw), sa = Math.sin(k.yaw);
    const fx = k.x + ca * 1.75, fy = k.y + 2.85, fz = k.z + sa * 1.75;
    const tx = k.x + ca * k.hd, ty = k.tipY, tz = k.z + sa * k.hd;
    const dx = tx - fx, dy = ty - fy, dz = tz - fz, L = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / L, uy = dy / L, uz = dz / L;
    const rx = -sa, rz = ca;
    const vx = -uy * rz, vy = ux * rz - uz * rx, vz = uy * rx;
    const bays = hi ? Math.max(8, Math.min(16, Math.round(L / 2.6))) : 5;
    const need = 4 + bays * (hi ? 8 : 4) + 18;
    if (n + need > MAXSEG) return n;
    let o = n * 6;
    const put = (ax, ay, az, bx, by, bz) => { buf[o++] = ax; buf[o++] = ay; buf[o++] = az; buf[o++] = bx; buf[o++] = by; buf[o++] = bz; n++; };
    const pt = (f, sr, sv) => {
      const hw = 0.62 - 0.24 * f;
      return [fx + dx * f + rx * (sr * hw) + vx * (sv * hw), fy + dy * f + vy * (sv * hw), fz + dz * f + rz * (sr * hw) + vz * (sv * hw)];
    };
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sr, sv] of cs) { const a = pt(0, sr, sv), b = pt(1, sr, sv); put(a[0], a[1], a[2], b[0], b[1], b[2]); }
    for (let i = 0; i < bays; i++) {
      const f0 = i / bays, f1 = (i + 1) / bays;
      const p0 = cs.map(([sr, sv]) => pt(f0, sr, sv)), p1 = cs.map(([sr, sv]) => pt(f1, sr, sv));
      for (let j = 0; j < 4; j++) {
        const jn = (j + 1) % 4;
        if (i > 0) put(p0[j][0], p0[j][1], p0[j][2], p0[jn][0], p0[jn][1], p0[jn][2]);
        if (hi || (j % 2 === 0)) {
          const a = (i % 2 === 0) ? p0[j] : p0[jn], b = (i % 2 === 0) ? p1[jn] : p1[j];
          put(a[0], a[1], a[2], b[0], b[1], b[2]);
        }
      }
    }
    for (const s of [-0.72, 0.72]) {
      const gx = k.x - ca * 2.55 - sa * s, gy = k.y + 5.45, gz = k.z - sa * 2.55 + ca * s;
      const hx = tx - sa * (s * 0.45), hz = tz + ca * (s * 0.45);
      put(gx, gy, gz, hx, ty + 0.35, hz);
    }
    for (const s of [-0.18, 0.18]) put(tx - sa * s, ty, tz + ca * s, tx - sa * s, k.hook + 0.75, tz + ca * s);
    const hy = k.hook + 0.75;
    for (const y of [hy - 0.55, hy]) {
      put(tx - 0.28, y, tz - 0.22, tx + 0.28, y, tz - 0.22);
      put(tx + 0.28, y, tz - 0.22, tx + 0.28, y, tz + 0.22);
      put(tx + 0.28, y, tz + 0.22, tx - 0.28, y, tz + 0.22);
      put(tx - 0.28, y, tz + 0.22, tx - 0.28, y, tz - 0.22);
    }
    for (const [sx, sz] of [[-0.28, -0.22], [0.28, -0.22], [0.28, 0.22], [-0.28, 0.22]]) put(tx + sx, hy - 0.55, tz + sz, tx + sx, hy, tz + sz);
    put(tx, hy - 0.55, tz, tx, k.hook - 0.25, tz);
    put(tx, k.hook - 0.25, tz, tx + 0.28, k.hook - 0.42, tz);
    put(tx + 0.28, k.hook - 0.42, tz, tx + 0.36, k.hook - 0.12, tz);
    return n;
  }

  const camPos = cam => cam ? (cam.position ? [cam.position.x, cam.position.y, cam.position.z] : cam) : null;

  const MOD = {
    id: 'actors', R_SHOW, R_HI, FIG, PAX, VEH, TRADE, stOf, plan, _clear: clear, _supported: supported, _index: index,
    stats: { figs: 0, vehs: 0, cranes: 0, shown: 0, segs: 0, insts: 0 },
    applyMode(isLit) {
      this.lastLit = !!isLit;
      if (this.obj && this.obj.material) this.obj.material.opacity = isLit ? 0.14 : 0.92;
      for (let i = 0; i < this.instList.length; i++) {
        const sl = this.instList[i];
        sl.mesh.material = isLit ? this.matLit : this.matInk;
        sl.mesh.geometry.setAttribute('color', isLit ? sl.attrLit : sl.attrInk);
      }
    },
    build(scene, HZ, THREE, opts) {
      opts = opts || {}; this.clip = Array.isArray(opts.clip) && opts.clip.length ? opts.clip : null;
      this.HZ = HZ; this.I = index(HZ); this.buf = new Float32Array(MAXSEG * 6); this.n = 0; this.key = null; this.P = null; this.lastCam = null;
      this.instFig = null; this.instVeh = null; this.instList = []; this.obj = null; this.lastLit = false;
      this.matInk = null; this.matLit = null;
      THREE = THREE || ROOT.THREE;
      if (THREE && scene) {
        const g = new THREE.BufferGeometry(); this.attr = new THREE.BufferAttribute(this.buf, 3);
        this.attr.setUsage && this.attr.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('position', this.attr); g.setDrawRange(0, 0);
        this.obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial(Object.assign({ color: 0x1c1a17, transparent: true, opacity: 0.92 }, this.clip ? { clippingPlanes: this.clip } : {})));
        this.obj.frustumCulled = false; this.obj.renderOrder = 5; this.obj.name = 'hz-actors'; scene.add(this.obj);
        // 实例化实体层（墨线 = 纸白消隐 MeshBasicMaterial；实景 = 工程涂装受光 MeshStandardMaterial + 阴影）
        if (THREE.InstancedMesh && THREE.MeshBasicMaterial) {
          this.matInk = new THREE.MeshBasicMaterial(Object.assign({
            vertexColors: true, side: THREE.DoubleSide || 2,
            polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2
          }, this.clip ? { clippingPlanes: this.clip } : {}));
          this.matLit = THREE.MeshStandardMaterial ? new THREE.MeshStandardMaterial(Object.assign({
            vertexColors: true, roughness: 0.74, metalness: 0.14, side: THREE.DoubleSide || 2
          }, this.clip ? { clippingPlanes: this.clip, clipShadows: true } : {})) : this.matInk;
          const mkSlot = (P, C, CL, cap, name) => {
            const sg = new THREE.BufferGeometry();
            sg.setAttribute('position', new THREE.BufferAttribute(P, 3));
            if (sg.computeVertexNormals) sg.computeVertexNormals();
            const attrInk = new THREE.BufferAttribute(C, 3);
            const attrLit = new THREE.BufferAttribute(CL, 3);
            sg.setAttribute('color', attrInk);
            const im = new THREE.InstancedMesh(sg, this.matInk, cap);
            im.count = 0; im.frustumCulled = false; im.renderOrder = 4; im.name = name;
            im.castShadow = true; im.receiveShadow = true;
            if (im.instanceMatrix && im.instanceMatrix.setUsage) im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.obj.add(im);
            const slot = { mesh: im, arr: im.instanceMatrix.array, attrInk, attrLit, cap, n: 0, prev: 0 };
            this.instList.push(slot);
            return slot;
          };
          this.instFig = {};
          for (const k in FIG_OBJ) this.instFig[k] = mkSlot(FIG_OBJ[k].Phi, FIG_OBJ[k].Chi, FIG_OBJ[k].CLhi, MAX_INST_FIG, 'hz-fig-' + k);
          this.instVeh = {};
          for (const k in VEH) this.instVeh[k] = mkSlot(VEH[k].Phi, VEH[k].Chi, VEH[k].CLhi, MAX_INST_VEH, 'hz-veh-' + k);
        }
      }
      return this;
    },
    update(t, cam) {
      if (!this.I) return 0;
      const isLit = ROOT.__pv && typeof ROOT.__pv.blend === 'number' ? ROOT.__pv.blend > 0.5 : !!(typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('lit'));
      if (this.obj && isLit !== this.lastLit) this.applyMode(isLit);
      const key = Math.floor(t * 24); let dirty = false; this.calls = (this.calls || 0) + 1;
      const lag = this.P && key !== this.key && this.calls - this.planCall < 6 && Math.abs(t - this.P.t) < 0.5;
      if (key !== this.key && !lag) { this.planCall = this.calls; this.key = key; this.P = plan(this.HZ, this.I, t); dirty = true; Object.assign(this.stats, { pax: (this.P.pax || []).length, figs: this.P.figs.length, vehs: this.P.vehs.length, cranes: this.P.cranes.length }); }
      const c = camPos(cam); if (!c) return this.n;
      if (!dirty && this.lastCam && Math.hypot(c[0] - this.lastCam[0], c[1] - this.lastCam[1], c[2] - this.lastCam[2]) < 1) return this.n;
      this.lastCam = c.slice(); const R2 = R_SHOW * R_SHOW, RHI2 = R_HI * R_HI, buf = this.buf;
      const iF = this.instFig, iV = this.instVeh;
      for (let i = 0; i < this.instList.length; i++) this.instList[i].n = 0;
      let n = 0, shown = 0;
      const d2 = (x, y, z) => (x - c[0]) * (x - c[0]) + (y - c[1]) * (y - c[1]) + (z - c[2]) * (z - c[2]);
      for (const v of this.P.vehs) {
        const dd = d2(v.x, v.y + 1.5, v.z); if (dd > R2) continue;
        const V = VEH[v.kind], hi = dd < RHI2;
        n = emit(buf, n, hi ? V.Lhi : V.L, v.x, v.y, v.z, v.yaw);
        if (iV) pushInst(iV[v.kind], v.x, v.y, v.z, v.yaw);
        shown++;
      }
      for (const k of this.P.cranes) {
        const dd = d2(k.x, k.y + 2, k.z); if (dd > R2) continue;
        const hi = dd < RHI2;
        n = emit(buf, n, hi ? VEH.crawler.Lhi : VEH.crawler.L, k.x, k.y, k.z, k.yaw);
        if (iV) pushInst(iV.crawler, k.x, k.y, k.z, k.yaw);
        n = emitCraneBoom(buf, n, k, hi);
        shown++;
      }
      for (const f of this.P.pax ? this.P.figs.concat(this.P.pax) : this.P.figs) {
        const dd = d2(f.x, f.y + 1, f.z); if (dd > R2) continue;
        const F = FIG_OBJ[f.pose], hi = dd < RHI2;
        n = emit(buf, n, hi ? F.Lhi : F.L, f.x, f.y, f.z, f.yaw);
        if (iF) pushInst(iF[f.pose], f.x, f.y, f.z, f.yaw);
        shown++;
      }
      let insts = 0;
      for (let i = 0; i < this.instList.length; i++) {
        const sl = this.instList[i];
        insts += sl.n;
        if (sl.n !== sl.prev || sl.n > 0) {
          sl.mesh.count = sl.n;
          if (sl.n > 0) sl.mesh.instanceMatrix.needsUpdate = true;
          sl.prev = sl.n;
        }
      }
      this.n = n; this.stats.shown = shown; this.stats.segs = n; this.stats.insts = insts;
      if (this.obj) {
        this.obj.geometry.setDrawRange(0, n * 2); this.attr.needsUpdate = true;
        if (this.attr.addUpdateRange) { this.attr.clearUpdateRanges && this.attr.clearUpdateRanges(); this.attr.addUpdateRange(0, n * 6); }
      }
      return n;
    },
  };
  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(MOD);
})();
