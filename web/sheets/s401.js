'use strict';
// S-401 屋面 · 插件图纸（hark-cs）：屋盖提升到位后的屋面收尾
// 嵌补提升孔（holes）→ 十字采光顶（sky）→ 白色穿孔铝板金属屋面 + 吊顶（clad）→ 光伏（pv）。
// 全部状态从 HZ.K / HZ.acts 推导（与 3D 同一份数据），不改共用文件。
// 平面方向与 S-301-4 网架平面一致：北在左、东在上；屋面起伏用金属屋面面 HZ.Hc 的 2 m 等高线表达（云的波浪）。
(function (G) {
  const C = { paper: '#f6f2ea', ink: '#1d1a17', ink2: '#5d564c', ink3: '#948b7d', line: '#d4cbbb', red: '#b3202a', red2: '#e6bab4', ghost: 'rgba(179,32,42,.30)', clad: '#ebe5d9', sky: '#cfd6d8', pv: '#2b3d63', pvLine: '#7f8db0', ok: '#2f7a3a' };
  const MONO = '"SF Mono","JetBrains Mono",Menlo,Consolas,"DejaVu Sans Mono","Noto Sans Mono CJK SC",monospace';
  const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif';
  const S = 3.5;           // 屋面分块（与 hzseq.js 第 8 节同一网格）
  const PV_P = 6, PV_W = 0.31; // 光伏顺轨条带：周期 6 m，半宽占比 0.31（与着色器 FV.pv = 1 同一公式）
  const fmt = n => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const proj = () => (G.HZA && G.HZA.PROJECT) || 'HZW';

  // ---------- 数据：从 HZ 推导一次，按 HZ.acts 身份缓存 ----------
  let D = null;
  function data() {
    const HZ = G.HZ;
    if (D && D.acts === HZ.acts) return D;
    const P = HZ.P, K = HZ.K;
    const rowOf = parts => { const m = new Map(); for (const p of parts) m.set(Math.round((p.geo.min[2] + P.roofB) / S), p); return m; };
    // 采光顶、金属屋面：每行（z 方向 3.5 m 一条）一个构件；行号 j = (za + roofB) / 3.5
    const skyRow = rowOf(K.sky.parts), cladRow = rowOf(K.clad.parts.filter(p => p.mat === 'clad'));
    const nxs = Math.ceil(P.roofA * 2 / S), nzs = Math.ceil(P.roofB * 2 / S), tiles = [];
    for (let j = 0; j < nzs; j++) for (let i = 0; i < nxs; i++) {
      const xa = -P.roofA + i * S, za = -P.roofB + j * S, xc = xa + S / 2, zc = za + S / 2;
      const rr = Math.min(HZ.rho(xa, za), HZ.rho(xa + S, za), HZ.rho(xa, za + S), HZ.rho(xa + S, za + S));
      if (rr > 1.0) continue;   // 有一角在轮廓内就画（填充按外缘裁切）；面积只计中心在内的块
      const sky = HZ.inSky(xc, zc), part = (sky ? skyRow : cladRow).get(j);
      if (!part) continue;
      const inner = HZ.rho(xc, zc) <= 1.0;
      tiles.push({ i, j, xa, za, xc, zc, sky, part, pv: inner && !sky && HZ.pvMask(xc, zc) > 0.5, a: inner ? S * S : 0 });
    }
    const holes = K.holes.parts.map(p => ({ p, x: p.c ? p.c[0] : (p.geo.min[0] + p.geo.max[0]) / 2, z: p.c ? p.c[2] : (p.geo.min[2] + p.geo.max[2]) / 2 }));
    // 屋面轮廓（云形外缘）
    const rim = []; for (let k = 0; k <= 240; k++) { const th = k / 240 * Math.PI * 2, r = HZ.R(th); rim.push([r * Math.cos(th), r * Math.sin(th)]); }
    // 金属屋面面 Hc 的等高线（2 m）：方格行进法，只算一次
    const iso = [], g = 2.5, gx = Math.ceil(P.roofA / g), gz = Math.ceil(P.roofB / g), H = (x, z) => HZ.rho(x, z) <= 0.995 ? HZ.Hc(x, z) : NaN;
    const hv = []; for (let a = -gx; a <= gx; a++) { const col = []; for (let b = -gz; b <= gz; b++) col.push(H(a * g, b * g)); hv.push(col); }
    let hmin = 1e9, hmax = -1e9; for (const col of hv) for (const v of col) if (v === v) { hmin = Math.min(hmin, v); hmax = Math.max(hmax, v); }
    const levels = []; for (let L = Math.ceil(hmin / 2) * 2; L < hmax; L += 2) levels.push(L);
    for (const L of levels) for (let a = 0; a < hv.length - 1; a++) for (let b = 0; b < hv[0].length - 1; b++) {
      const x0 = (a - gx) * g, z0 = (b - gz) * g, q = [[x0, z0, hv[a][b]], [x0 + g, z0, hv[a + 1][b]], [x0 + g, z0 + g, hv[a + 1][b + 1]], [x0, z0 + g, hv[a][b + 1]]];
      if (q.some(v => v[2] !== v[2])) continue;
      const pts = []; for (let k = 0; k < 4; k++) { const A = q[k], B = q[(k + 1) % 4]; if ((A[2] < L) !== (B[2] < L)) { const f = (L - A[2]) / (B[2] - A[2]); pts.push([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]); } }
      if (pts.length >= 2) iso.push([L, pts[0], pts[1]]); if (pts.length === 4) iso.push([L, pts[2], pts[3]]);
    }
    let tot = 0, pvTot = 0; for (const t of tiles) { tot += t.a; if (t.pv) pvTot += t.a * (2 * PV_W); }
    D = { acts: HZ.acts, P, K, tiles, holes, rim, iso, hmin, hmax, tot, pvTot, nzs };
    return D;
  }
  const stOf = (p, t) => (p.st == null || t < p.st ? -1 : t < p.st + p.du ? (t - p.st) / p.du : 2);
  // 光伏铺设前沿：与 hzview.js 着色器同式 mix(-170, 175, uPV)，从北往南
  const pvFront = (K, t) => { const u = Math.max(0, Math.min(1, (t - K.pv.start) / K.pv.dur)); return t < K.pv.start ? -1e9 : -170 + 345 * u; };

  // ---------- 统计（大数字与检查共用）----------
  function stats(t) {
    const d = data(), K = d.K; let shut = 0, cur = 0, pvA = 0; const front = pvFront(K, t);
    for (const q of d.tiles) { const s = stOf(q.part, t); if (s >= 2) shut += q.a; else if (s >= 0) cur++;   // 封闭率只算铺完的块（在铺不折算），与图上纸白 / 浅蓝面积一致（D-22 ③）
      if (q.pv && s >= 2 && q.zc < front) pvA += q.a * (2 * PV_W); }
    let holesOpen = 0; for (const h of d.holes) if (stOf(h.p, t) < 2) holesOpen++;
    // 光伏面积口径与 HZ.pvArea（≈1.5 万 m²，按公开报道标定）一致：按已铺条带占比折算
    const pvTot = G.HZ.pvArea || d.pvTot;
    return { close: Math.min(100, 100 * shut / d.tot), cur, pv: pvTot * pvA / d.pvTot, pvTot, holesOpen, holesTot: d.holes.length };
  }

  // ---------- 二稿：可点构件 parts（联动接口 v2）----------
  // 分区与 S-301 一致：|z| ≤ midZ + 3.5 为中区 ZM，z > 0 南区 ZS，z < 0 北区 ZN；x > 0 为东半、x < 0 为西半。
  // 每个 part 记下自己包含哪些屋面块（tiles）/ 哪个提升孔，hit（图上点击框）每次按当前版面算，box（3D 世界盒）由 HZ 几何算一次。
  const ZNAME = { ZN: '北区', ZM: '中区', ZS: '南区' }, HNAME = { E: '东', W: '西' };
  let PD = null;
  function partsData() {
    const d = data(), HZ = G.HZ, P = d.P; if (PD && PD.D === d) return PD;
    const zoneOf = z => (Math.abs(z) <= P.midZ + 3.5 ? 'ZM' : z > 0 ? 'ZS' : 'ZN');
    const groups = new Map(), put = (id, kind, zone, half, q) => { let gp = groups.get(id); if (!gp) groups.set(id, gp = { id, kind, zone, half, tiles: [] }); gp.tiles.push(q); };
    for (const q of d.tiles) {
      const zn = zoneOf(q.zc), hf = q.xc >= 0 ? 'E' : 'W';
      if (q.sky) put('SK-' + zn, 'sky', zn, null, q); else put('CL-' + zn + '-' + hf, 'clad', zn, hf, q);
      if (q.pv) put('PV-' + zn + '-' + hf, 'pv', zn, hf, q);
    }
    const out = [];
    // 提升孔：对应最近的提升器 Jnn（与 S-301 的 #focus=Jnn 同一编号）
    // 一台提升器两侧各一个孔（网架格），编号 H-J01a / H-J01b
    const L = HZ.lifters || [], seen = {};
    d.holes.forEach((h, k) => { let bi = -1, bd = 1e9; L.forEach((l, i) => { const dd = Math.hypot(l.x - h.x, l.z - h.z); if (dd < bd) { bd = dd; bi = i; } });
      const jn = bi >= 0 && bd < 12 ? 'J' + String(bi + 1).padStart(2, '0') : null, key = jn || 'X'; seen[key] = (seen[key] || 0) + 1;
      const gm = h.p.geo || {}, mn = gm.min || [h.x - 2.5, 30, h.z - 2.5], mx = gm.max || [h.x + 2.5, 40, h.z + 2.5];
      out.push({ id: 'H-' + (jn ? jn + 'ab'[seen[key] - 1] : String(k + 1).padStart(2, '0')), kind: 'hole', zone: zoneOf(h.z), jn, hole: h, parts: [h.p], area: 0,
        box: [mn[0], mn[1], mn[2], mx[0], Math.max(mx[1], mn[1] + 0.5), mx[2]] }); });
    for (const gp of groups.values()) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9, area = 0; const ps = new Set();
      for (const q of gp.tiles) { x0 = Math.min(x0, q.xa); x1 = Math.max(x1, q.xa + S); z0 = Math.min(z0, q.za); z1 = Math.max(z1, q.za + S); const y = HZ.Hc(q.xc, q.zc); if (y === y) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        area += gp.kind === 'pv' ? q.a * 2 * PV_W : q.a; ps.add(q.part); }
      if (!(y1 >= y0)) { y0 = 40; y1 = 50; }
      out.push(Object.assign(gp, { parts: [...ps], area, box: [x0, y0 - 0.5, z0, x1, y1 + 1.5, z1] }));
    }
    // 光伏面积按 HZ.pvArea 标定（与大数字同一口径）
    const pvRaw = out.filter(p => p.kind === 'pv').reduce((s, p) => s + p.area, 0) || 1;
    for (const p of out) if (p.kind === 'pv') p.area *= (HZ.pvArea || pvRaw) / pvRaw;
    const ORD = { hole: 0, pv: 1, sky: 2, clad: 3 }; out.sort((a, b) => ORD[a.kind] - ORD[b.kind] || (a.id < b.id ? -1 : 1));
    PD = { D: d, list: out, byId: new Map(out.map(p => [p.id, p])) };
    return PD;
  }
  // 工期：构件里最早开工到最晚完工（光伏另按铺设前沿扫过本块的时刻算）
  function span(p) {
    const K = data().K;
    if (p.kind === 'pv') { const za = Math.min(...p.tiles.map(q => q.za)), zb = Math.max(...p.tiles.map(q => q.za + S)), at = z => K.pv.start + K.pv.dur * Math.max(0, Math.min(1, (z + 170) / 345));
      return [at(za), at(zb)]; }
    let a = 1e9, b = -1e9; for (const q of p.parts) { if (q.st == null) continue; a = Math.min(a, q.st); b = Math.max(b, q.st + q.du); } return [a, b];
  }
  function stateOf(p, t) { const [a, b] = span(p); return t < a ? 0 : t < b ? 1 : 2; }
  const KIND = { hole: '提升孔嵌补', sky: '十字采光顶', clad: '金属屋面（白色穿孔铝板）+ 吊顶', pv: '光伏条带' };
  function labelOf(p) {
    if (p.kind === 'hole') return '提升孔 ' + (p.jn || p.id.slice(2)) + ' · ' + ZNAME[p.zone];
    if (p.kind === 'sky') return '采光顶 · ' + ZNAME[p.zone];
    return (p.kind === 'pv' ? '光伏 · ' : '金属屋面 · ') + ZNAME[p.zone] + HNAME[p.half] + '半';
  }
  // 实录：HZR 里 S-401 的记录，按工序挂到构件上（只引用编号，不复制内容）
  const RECS = { clad: ['R-0006', 'R-0007'], sky: ['R-0006'], pv: ['R-0008'], hole: [] };
  function info(p, t) {
    const HZ = G.HZ, [a, b] = span(p), k = stateOf(p, t), x = (p.box[0] + p.box[3]) / 2, z = (p.box[2] + p.box[5]) / 2;
    const have = new Set(((G.HZR && G.HZR.RECORDS) || []).filter(r => r.sheet === 'S-401').map(r => r.id));
    const rows = [
      ['工序', KIND[p.kind]],
      ['状态', ['未开始', '在做', '已完成'][k] + ' · ' + HZ.dayDate(t)],
      ['工期', HZ.dayDate(a) + ' → ' + HZ.dayDate(b) + '（推算）'],
      ['位置', `${ZNAME[p.zone]} · 中心 x ${x.toFixed(0)} m、z ${z.toFixed(0)} m · 标高 ${p.box[1].toFixed(1)}–${p.box[4].toFixed(1)} m`],
    ];
    if (p.area) rows.push(['面积', fmt(p.area) + ' m²' + (p.kind === 'pv' ? '（按公开总量 ' + fmt(HZ.pvArea) + ' m² 折算）' : '')]);
    const rel = p.kind === 'hole' ? (p.jn ? `提升器 ${p.jn} 拆除后才能补（S-301 #focus=${p.jn}）` : '提升架拆除后补') : p.kind === 'pv' ? `铺在金属屋面 CL-${p.zone}-${p.half} 完成之后` : p.kind === 'clad' || p.kind === 'sky' ? `所在网架分区 ${p.zone}（S-301 #focus=${p.zone}）提升合龙、补孔之后` : '';
    if (rel) rows.push(['关系', rel]);
    const rr = (RECS[p.kind] || []).filter(id => have.has(id)); if (rr.length) rows.push(['实录', rr.join('、')]);
    return rows;
  }
  let LAY = null;   // 最近一次绘制的版面（hit 用同一坐标系）
  // 竖长画布（如右栏 600×984、手机 800×1200）：平面顺时针转 90°，北在上、东在右，图放大约 1.6 倍（GPU 审计 #7 / D-08）。
  // X(z)、Y(x) 给的是「绘图坐标」，rot 时由 g 的旋转变换到画面；Ly.tf(px, py) 把绘图坐标换成画面坐标（hit、文字用）。
  function layout(w, h, tb) {
    const box = { x0: 8, y0: 8, x1: w - 8, y1: h - 6.5 - (tb || 20) - 2 };
    const z0 = -172, z1 = 172, x0 = -130, x1 = 130, dw = box.x1 - box.x0 - 8, dh = box.y1 - box.y0 - 30, ax = box.x0 + 4, ay = box.y0 + 16;
    const sL = Math.min(dw / (z1 - z0), dh / (x1 - x0)), sP = Math.min(dh / (z1 - z0), dw / (x1 - x0)), rot = sP > sL * 1.15;
    if (!rot) { const s = Math.max(0.05, sL), ox = ax + (dw - (z1 - z0) * s) / 2, oy = ay + (dh - (x1 - x0) * s) / 2;
      return { w, h, box, s, rot: false, X: z => ox + (z - z0) * s, Y: x => oy + (x1 - x) * s, tf: (u, v) => [u, v], apply() { } }; }
    const s = Math.max(0.05, sP), ou = (dh - (z1 - z0) * s) / 2, ov = (dw - (x1 - x0) * s) / 2;
    return { w, h, box, s, rot: true, X: z => ou + (z - z0) * s, Y: x => ov + (x1 - x) * s, tf: (u, v) => [ax + dw - v, ay + u], apply(g) { g.translate(ax + dw, ay); g.rotate(Math.PI / 2); } };
  }
  function hitOf(p, Ly) {
    let u0, v0, u1, v1;
    if (p.kind === 'hole') { const r = Math.max(4, 2.5 * Ly.s), u = Ly.X(p.hole.z), v = Ly.Y(p.hole.x); u0 = u - r; u1 = u + r; v0 = v - r; v1 = v + r; }
    else { u0 = Ly.X(p.box[2]); u1 = Ly.X(p.box[5]); v0 = Ly.Y(p.box[3]); v1 = Ly.Y(p.box[0]); }
    const [ax, ay] = Ly.tf(u0, v0), [bx, by] = Ly.tf(u1, v1);
    return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)];
  }
  function parts(t, ctx) {
    const Ly = (ctx && ctx.w && ctx.h) ? layout(ctx.w, ctx.h, LAY && LAY.w === ctx.w && LAY.h === ctx.h ? LAY.tb : 20) : LAY || layout(600, 420, 20);
    return partsData().list.map(p => ({ id: p.id, label: labelOf(p), kind: p.kind, zone: p.zone, state: stateOf(p, t), hit: hitOf(p, Ly), box: p.box.slice(), info: info(p, t) }));
  }

  // ---------- 图框 + 标题栏（与 hzsheet.js 同一版式）----------
  function frame(g, w, h, o) {
    g.fillStyle = C.paper; g.fillRect(0, 0, w, h);
    const tb = o.tb || 20; g.strokeStyle = C.ink; g.lineWidth = 1; g.strokeRect(3.5, 3.5, w - 7, h - 7); g.lineWidth = 0.6; g.strokeRect(6.5, 6.5, w - 13, h - 13);
    const y = h - 6.5 - tb; g.beginPath(); g.moveTo(6.5, y); g.lineTo(w - 6.5, y); g.stroke();
    const nm = Array.isArray(o.name) ? o.name : [o.name, o.name], fs = tb >= 20 ? 10 : 9, pad = 6;
    const cells = [[o.no, C.red, 1], [nm[0], C.ink, 1], [o.scale || '1:—', C.ink2], ['修订 r' + String(o.rev || 1).padStart(3, '0'), C.red], [o.date || '—', C.ink2], [o.chk || '—', o.chkOk === false ? C.red : C.ok]];
    const fnt = i => `${cells[i][2] ? '600 ' : ''}${fs}px ${i === 1 ? SANS : MONO}`;
    const ws = cells.map((c, i) => { g.font = fnt(i); return g.measureText(c[0]).width + pad * 2; }), keep = cells.map(() => true), avail = w - 13;
    for (const k of [4, 2, 5, 3, 1]) { if (ws.reduce((s, v, i) => s + (keep[i] ? v : 0), 0) <= avail) break; if (k === 1) { cells[1][0] = nm[1]; g.font = fnt(1); ws[1] = g.measureText(nm[1]).width + pad * 2; continue; } keep[k] = false; }
    const extra = Math.max(0, avail - ws.reduce((s, v, i) => s + (keep[i] ? v : 0), 0)); let x = 6.5; g.textBaseline = 'middle';
    cells.forEach((c, i) => { if (!keep[i]) return; const cw = ws[i] + (i === 1 ? extra : 0); g.font = fnt(i); g.fillStyle = c[1]; let tx = c[0];
      while (g.measureText(tx).width > cw - pad * 2 && tx.length > 2) tx = tx.slice(0, -1); g.fillText(tx, x + pad, y + tb / 2 + 0.5); x += cw;
      if (x < w - 8) { g.strokeStyle = C.ink; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, h - 6.5); g.stroke(); } });
    return { x0: 8, y0: 8, x1: w - 8, y1: y - 2 };
  }
  const labels = [];
  function label(g, txt, x, y, col, box, o) {
    o = o || {}; const fs = o.fs || 9; g.font = `${o.b ? '600 ' : ''}${fs}px ${o.sans ? SANS : MONO}`; const w = g.measureText(txt).width, h = fs + 2;
    const lx = o.al === 'c' ? x - w / 2 : o.al === 'r' ? x - w : x, ly = y - h / 2;
    if (!(lx - 1 >= box.x0 && ly >= box.y0 && lx + w + 1 <= box.x1 && ly + h <= box.y1)) return false;
    if (labels.some(r => !(lx + w + 1 < r[0] || lx - 1 > r[2] || ly + h < r[1] || ly > r[3]))) return false;
    labels.push([lx - 1, ly, lx + w + 1, ly + h]);
    g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(txt, lx, y); g.fillStyle = col || C.ink; g.fillText(txt, lx, y); return true;
  }

  // ---------- 图纸 ----------
  function draw(g, w, h, t, ctx) {
    const d = data(), P = d.P, K = d.K; labels.length = 0;
    const tbo = ctx.tb(w, h, proj() + '-S-401-1', ['屋面铺设平面 · 嵌补 → 采光顶 → 金属屋面 → 光伏', '屋面铺设平面'], t);
    const box = frame(g, w, h, tbo), Ly = layout(w, h, tbo.tb || 20); Ly.tb = tbo.tb || 20; LAY = Ly;
    const s = Ly.s;
    if (typeof ctx.setScale === 'function') ctx.setScale(s);
    const X = Ly.X, Y = Ly.Y;   // 横栏：北在左、东在上；竖栏（rot）：北在上、东在右
    const st = stats(t), front = pvFront(K, t);

    const rimPath = () => { g.beginPath(); d.rim.forEach(([x, z], k) => (k ? g.lineTo(X(z), Y(x)) : g.moveTo(X(z), Y(x)))); g.closePath(); };
    g.save(); Ly.apply(g);   // 竖栏：以下平面图形整体旋转（文字在旋转外另画，保持正向）
    g.save(); rimPath(); g.clip();
    // 1 屋面块：未铺 = 不填（只留淡红幽灵等高线），在铺 = 浅红，已铺 = 纸白 / 采光顶浅蓝灰
    let curZ = null; const unl = [];
    for (const q of d.tiles) {
      const k = stOf(q.part, t); if (k < 0) { if (t >= K.sky.start) unl.push(q); continue; }
      const px = X(q.za), py = Y(q.xa + S), sz = S * s;
      if (k < 2) { g.fillStyle = C.red2; g.fillRect(px, py, sz + 0.3, sz + 0.3); if (!q.sky) curZ = q.za; continue; }
      g.fillStyle = q.sky ? C.sky : C.clad; g.fillRect(px, py, sz + 0.3, sz + 0.3);
    }
    // 未铺（屋面已开铺后）：淡墨 45° 斜线，表示还是裸网架——与纸白的已铺面一眼分开（D-22 ③）
    if (unl.length) { g.save(); g.beginPath(); for (const q of unl) g.rect(X(q.za), Y(q.xa + S), S * s + 0.3, S * s + 0.3); g.clip(); g.strokeStyle = 'rgba(29,26,23,.16)'; g.lineWidth = 0.5; g.beginPath(); const U = 2 * w + 2 * h, st6 = 6; for (let c = -U; c < U; c += st6) { g.moveTo(c, -U); g.lineTo(c + 2 * U, U); } g.stroke(); g.restore(); }
    // 金属屋面分格线（每 4 块一条，与 3D 墨线同一规则）；采光顶逐块分格 + 斜线
    g.lineWidth = 0.45;
    if (S * s >= 2.5) {   // 小图（每块不到 2.5 px）不画分格，免得糊成一片灰
      const sz = S * s; g.strokeStyle = 'rgba(29,26,23,.45)'; g.beginPath();
      for (const q of d.tiles) { if (!q.sky || stOf(q.part, t) < 2) continue; const px = X(q.za), py = Y(q.xa + S); g.rect(px + 0.25, py + 0.25, sz - 0.5, sz - 0.5); if (sz > 3.5) { g.moveTo(px + 0.5, py + sz - 0.5); g.lineTo(px + sz - 0.5, py + 0.5); } }
      g.stroke(); g.strokeStyle = 'rgba(29,26,23,.28)'; g.beginPath();
      for (const q of d.tiles) { if (q.sky || stOf(q.part, t) < 2) continue; const px = X(q.za), py = Y(q.xa + S); if (q.j % 4 === 0) { g.moveTo(px, py); g.lineTo(px, py + sz); } if (q.i % 4 === 0) { g.moveTo(px, py + sz); g.lineTo(px + sz, py + sz); } }
      g.stroke();
    }
    // 2 光伏：顺轨条带（常 z 的竖条），只铺在已完成的金属屋面上、按进度从北往南
    if (t >= K.pv.start) {
      g.fillStyle = C.pv;
      for (const q of d.tiles) {
        if (!q.pv || q.zc >= front || stOf(q.part, t) < 2) continue;
        const k0 = Math.floor(q.za / PV_P), k1 = Math.floor((q.za + S) / PV_P);
        for (let k = k0; k <= k1; k++) { const c = (k + 0.5) * PV_P, a = Math.max(q.za, c - PV_W * PV_P), b = Math.min(q.za + S, c + PV_W * PV_P); if (b > a) g.fillRect(X(a), Y(q.xa + S), (b - a) * s + 0.2, S * s + 0.3); }
      }
      if (front > -170 && front < 175) { g.strokeStyle = C.pv; g.lineWidth = 1; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(X(front), Y(126)); g.lineTo(X(front), Y(-126)); g.stroke(); g.setLineDash([]); }
    }
    // 3 等高线（金属屋面面 Hc，2 m）：已铺处墨色、未铺处淡红幽灵——屋面的「云」起伏
    const rowDone = []; for (const q of d.tiles) { const k = stOf(q.part, t); if (rowDone[q.j] == null || k < rowDone[q.j]) rowDone[q.j] = k; }
    g.lineWidth = 0.6;   // 按四种笔型分桶，一桶一次 stroke
    const ISO = ['rgba(29,26,23,.62)', 'rgba(29,26,23,.34)', 'rgba(179,32,42,.40)', 'rgba(179,32,42,.20)'], bk = [[], [], [], []];
    for (const [L, a, b] of d.iso) { const k = rowDone[Math.floor(((a[1] + b[1]) / 2 + P.roofB) / S)]; if (k != null && k >= 2) bk[L % 10 === 0 ? 0 : 1].push(a, b); }   // D-36：未铺处不画淡红幽灵线
    bk.forEach((seg, n) => { if (!seg.length) return; g.strokeStyle = ISO[n]; g.beginPath(); for (let k = 0; k < seg.length; k += 2) { g.moveTo(X(seg[k][1]), Y(seg[k][0])); g.lineTo(X(seg[k + 1][1]), Y(seg[k + 1][0])); } g.stroke(); });
    g.restore();
    // 4 屋面外缘（云形轮廓）
    g.strokeStyle = C.ink; g.lineWidth = 1.1; rimPath(); g.stroke();
    // 5 提升孔：未补 = 方框打叉（洞），在补 = 红，补完 = 小实心
    for (const hq of d.holes) {
      const k = stOf(hq.p, t), r = Math.max(Math.min(3, 3.3 * s), 2.6 * s), x = X(hq.z), y = Y(hq.x);   // 半边 ≈ 2.6 m（孔距最近 7 m 不相叠），叉线看得清（D-22 ⑤）
      if (k >= 2) { if (t < K.holes.end + 6) { g.strokeStyle = 'rgba(29,26,23,.40)'; g.lineWidth = 0.7; g.strokeRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4); } continue; }   // 补完：淡墨空心方框（不画实心小黑点）
      g.strokeStyle = k >= 0 ? C.red : C.ink; g.lineWidth = k >= 0 ? 1.2 : 0.9; g.strokeRect(x - r, y - r, 2 * r, 2 * r);
      g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
    }
    // 6 金属屋面施工前沿（红点划线 + 方向）
    let frontAt = null;
    if (curZ != null) { const zz = curZ + S / 2; g.strokeStyle = C.red; g.lineWidth = 1; g.setLineDash([6, 2, 1, 2]); g.beginPath(); g.moveTo(X(zz), Y(128)); g.lineTo(X(zz), Y(-128)); g.stroke(); g.setLineDash([]); frontAt = Ly.tf(X(zz), Y(Ly.rot ? -122 : 126)); }
    // 7 选中构件（ctx.focus）：所含屋面块描黄、外框加粗，旁注名称——与 3D 黄框是同一个构件
    const fp = ctx.focus ? partsData().byId.get(ctx.focus) : null;
    if (fp && fp.tiles) { g.save(); rimPath(); g.clip(); g.fillStyle = 'rgba(240,190,20,.32)'; for (const q of fp.tiles) g.fillRect(X(q.za), Y(q.xa + S), S * s + 0.3, S * s + 0.3); g.restore(); }
    g.restore();   // 结束旋转：以下用画面坐标
    if (frontAt) label(g, Ly.rot ? '铺设 ↓南' : '铺设 →南', frontAt[0] + (Ly.rot ? 4 : 4), frontAt[1] + (Ly.rot ? 10 : 2), C.red, box, { fs: 8.5, sans: true, b: true });
    if (fp) { const YEL = '#e0a800', hb = hitOf(fp, Ly);
      g.strokeStyle = YEL; g.lineWidth = 2; g.strokeRect(hb[0] - 1, hb[1] - 1, hb[2] + 2, hb[3] + 2);
      const ly2 = hb[1] - 7 > box.y0 + 16 ? hb[1] - 7 : hb[1] + hb[3] + 8;
      label(g, labelOf(fp), Math.max(box.x0 + 4, Math.min(hb[0], box.x1 - 120)), ly2, '#8a6400', box, { fs: 9, sans: true, b: true }); }

    // 四朵云 / 云的缝标注（D-22 ⑦）：云心标在各象限屋面中心（Wv 峰值处），缝标在十字采光顶中心；所在屋面块铺完才标，不提前画未建的东西
    if (!(w < 300 || h < 200)) {
      const HZ = G.HZ, hasWv = typeof HZ.Wv === 'function', NS = ['东北', '东南', '西北', '西南'];
      const doneAt = (x, z, sky) => { for (const q of d.tiles) if (q.sky === sky && x >= q.xa && x < q.xa + S && z >= q.za && z < q.za + S) return stOf(q.part, t) >= 2; return false; };
      const cl = [[-1, 1], [1, 1], [-1, -1], [1, -1]];   // [z 符号（负 = 北）, x 符号（正 = 东）]
      cl.forEach(([sz, sx], n) => { const x = sx * 0.5 * P.roofA, z = sz * 0.5 * P.roofB; if (!doneAt(x, z, false)) return;
        const [px, py] = Ly.tf(X(z), Y(x)), up = hasWv ? HZ.Wv(x, z) : 3.5;
        label(g, `${NS[n]}云 约+${(Math.round(up * 2) / 2).toFixed(1)} m`, px, py, C.ink, box, { fs: 8.5, sans: true, al: 'c', b: true }); });
      if (doneAt(0, 0, true) || doneAt(0, 8, true)) { const [px, py] = Ly.tf(X(0), Y(0)); label(g, '云的缝（采光顶）', px, py, '#3a5560', box, { fs: 8.5, sans: true, al: 'c', b: true }); }
    }
    // 文字：一行现状 + 方位 + 等高距；图例
    const now = t < K.holes.start ? '提升到位，等待补孔' : t < K.holes.end ? `补提升孔 ${st.holesTot - st.holesOpen} / ${st.holesTot}` : t < K.pv.start ? `屋面封闭 ${st.close.toFixed(0)}%（按面积）` : t < K.pv.end ? `光伏 ${fmt(st.pv)} / ${fmt(st.pvTot)} m²` : `屋面完成 · 光伏 ${fmt(st.pvTot)} m²`;
    label(g, now, box.x0 + 4, box.y0 + 7, C.ink, box, { b: true, fs: 9.5, sans: true });
    label(g, Ly.rot ? '↑北  →东  等高距 2 m' : '↑东  ←北  等高距 2 m', box.x1 - 4, box.y0 + 7, C.ink2, box, { al: 'r', fs: 8.5, sans: true });
    const lg = [['补孔', 'hole'], ['采光顶', C.sky], ['金属屋面', C.clad], ['光伏', C.pv], ['在铺', C.red2], ['未铺', 'unl']];
    g.font = `8.5px ${SANS}`; let lx = box.x0 + 4; const ly = box.y1 - 7;
    for (const [n, c] of lg) { const tw = g.measureText(n).width; if (lx + 12 + tw > box.x1 - 4) break;
      if (c === 'hole') { g.strokeStyle = C.ink; g.lineWidth = 0.8; g.strokeRect(lx, ly - 4, 8, 8); g.beginPath(); g.moveTo(lx, ly - 4); g.lineTo(lx + 8, ly + 4); g.moveTo(lx + 8, ly - 4); g.lineTo(lx, ly + 4); g.stroke(); }
      else if (c === 'unl') { g.strokeStyle = 'rgba(29,26,23,.5)'; g.lineWidth = 0.5; g.strokeRect(lx, ly - 4, 8, 8); g.save(); g.beginPath(); g.rect(lx, ly - 4, 8, 8); g.clip(); g.beginPath(); for (let e = -8; e <= 8; e += 4) { g.moveTo(lx + e, ly - 4); g.lineTo(lx + e + 8, ly + 4); } g.stroke(); g.restore(); }
      else { g.fillStyle = c; g.fillRect(lx, ly - 4, 8, 8); g.strokeStyle = 'rgba(29,26,23,.5)'; g.lineWidth = 0.5; g.strokeRect(lx, ly - 4, 8, 8); }
      g.fillStyle = C.ink2; g.textBaseline = 'middle'; g.fillText(n, lx + 11, ly); lx += 11 + tw + 10; }
    return st;
  }

  const plugin = {
    id: 'S-401', name: '屋面', sheet: 'S-401-1', title: '屋面铺设平面', owner: 'hark-cs',
    get window() { const K = G.HZ && G.HZ.K; return K && K.holes && K.pv ? [K.holes.start, K.pv.end] : [683, 785]; },
    // 大数字：屋面封闭率（采光顶 + 金属屋面按块面积，只算铺完的块）；补孔阶段说明为何还是 0（D-22 ③）
    big: t => { const st = stats(t), K = data().K; return { num: Math.round(st.close), unit: '%', label: t < K.sky.start ? `屋面封闭 · 先补提升孔 ${st.holesTot - st.holesOpen}/${st.holesTot}` : '屋面封闭（按面积）' }; },
    scope: { keys: ['holes', 'sky', 'clad', 'pv', 'mast', 'asm1', 'asm2', 'asm3', 'merge', 'head'] },   // D-34
    draw,
    stats,
    // 3D 引线锚点（D-22 ④，待宿主接 pl.leadAt，见 CLAIMS 接口请求）：铺金属屋面 / 光伏时落在当前铺设前沿、离开十字采光顶的东侧屋面板上
    leadAt(t) { const d = data(), K = d.K, HZ = G.HZ; let z = null, t1, t2;
      if (t >= K.clad.start && t < K.clad.end) { let zf = null; for (const q of d.tiles) { if (q.sky) continue; const k = stOf(q.part, t); if (k >= 0 && k < 2) zf = zf == null ? q.zc : Math.max(zf, q.zc); } z = zf; t1 = KIND.clad; t2 = '铺设前沿 · 由北向南'; }
      else if (t >= K.pv.start && t < K.pv.end) { z = pvFront(K, t) - 4; t1 = KIND.pv; t2 = '铺设前沿 · 由北向南'; }
      if (z == null) return null;
      for (const x of [55, 70, 40, 85]) if (HZ.rho(x, z) < 0.95 && !HZ.inSky(x, z) && (t < K.pv.start || HZ.pvMask(x, z) > 0.5)) return { p: [x, HZ.Hc(x, z) + 1, z], t1, t2 };
      return null; },
    parts,
    // 镜头（D-22 ① / ⑥ / ⑧）：全程框住整片屋面（外缘 + 檐口），余白均匀；从南偏东高位俯视，逐渐转向正南、仰角放低。
    // 一套镜头同时满足横屏与竖屏：方位取 150°–170°（屋面短边 249 m 横在画面里），竖长视口也不裁边。
    // 关键帧时刻随 HZ.K 实时计算：补孔开工 holes.start → 采光顶收尾 sky.end → 光伏开工 pv.start → 光伏完成 pv.end。
    get cam() {
      const K = G.HZ && G.HZ.K;
      const t0 = K && K.holes ? K.holes.start : 683;
      const t1 = K && K.sky ? K.sky.end : 733;
      const t2 = K && K.pv ? K.pv.start : 755;
      const t3 = K && K.pv ? K.pv.end : 785;
      return [
        { t: t0, target: [-6, 40, 6], az: 150, el: 62, dist: 675 },
        { t: t1, target: [6, 40, 6], az: 155, el: 56, dist: 630 },
        { t: t2, target: [6, 40, 12], az: 160, el: 52, dist: 595 },
        { t: t3 - 14, target: [0, 40, 24], az: 170, el: 45, dist: 520 },
        // 窗末斜侧机位（D-22 ⑧）：从西南低角度看全屋面，四朵云与云缝同框、光伏收尾（el 15°，掠射光下云的明暗最清楚）
        { t: t3, target: [10, 50, 10], az: 225, el: 15, dist: 520 },
      ];
    },
  };
  (G.HZ_SHEET_PLUGINS = G.HZ_SHEET_PLUGINS || []).push(plugin);
})(typeof window !== 'undefined' ? window : globalThis);
