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
    for (const q of d.tiles) { const s = stOf(q.part, t); if (s >= 2) shut += q.a; else if (s >= 0) { shut += q.a * s; cur++; }
      if (q.pv && s >= 2 && q.zc < front) pvA += q.a * (2 * PV_W); }
    let holesOpen = 0; for (const h of d.holes) if (stOf(h.p, t) < 2) holesOpen++;
    // 光伏面积口径与 HZ.pvArea（≈1.5 万 m²，按公开报道标定）一致：按已铺条带占比折算
    const pvTot = G.HZ.pvArea || d.pvTot;
    return { close: Math.min(100, 100 * shut / d.tot), cur, pv: pvTot * pvA / d.pvTot, pvTot, holesOpen, holesTot: d.holes.length };
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
    const box = frame(g, w, h, ctx.tb(w, h, proj() + '-S-401-1', ['屋面铺设平面 · 嵌补 → 采光顶 → 金属屋面 → 光伏', '屋面铺设平面'], t));
    const z0 = -172, z1 = 172, x0 = -130, x1 = 130, dw = box.x1 - box.x0 - 8, dh = box.y1 - box.y0 - 30;
    const s = Math.max(0.05, Math.min(dw / (z1 - z0), dh / (x1 - x0)));
    const ox = box.x0 + 4 + (dw - (z1 - z0) * s) / 2, oy = box.y0 + 16 + (dh - (x1 - x0) * s) / 2;
    if (typeof ctx.setScale === 'function') ctx.setScale(s);
    const X = z => ox + (z - z0) * s, Y = x => oy + (x1 - x) * s;   // 北在左、东在上
    const st = stats(t), front = pvFront(K, t);

    const rimPath = () => { g.beginPath(); d.rim.forEach(([x, z], k) => (k ? g.lineTo(X(z), Y(x)) : g.moveTo(X(z), Y(x)))); g.closePath(); };
    g.save(); rimPath(); g.clip();
    // 1 屋面块：未铺 = 不填（只留淡红幽灵等高线），在铺 = 浅红，已铺 = 纸白 / 采光顶浅蓝灰
    let curZ = null;
    for (const q of d.tiles) {
      const k = stOf(q.part, t); if (k < 0) continue;
      const px = X(q.za), py = Y(q.xa + S), sz = S * s;
      if (k < 2) { g.fillStyle = C.red2; g.fillRect(px, py, sz + 0.3, sz + 0.3); if (!q.sky) curZ = q.za; continue; }
      g.fillStyle = q.sky ? C.sky : C.clad; g.fillRect(px, py, sz + 0.3, sz + 0.3);
    }
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
    for (const [L, a, b] of d.iso) { const k = rowDone[Math.floor(((a[1] + b[1]) / 2 + P.roofB) / S)]; bk[(k != null && k >= 2 ? 0 : 2) + (L % 10 === 0 ? 0 : 1)].push(a, b); }
    bk.forEach((seg, n) => { if (!seg.length) return; g.strokeStyle = ISO[n]; g.beginPath(); for (let k = 0; k < seg.length; k += 2) { g.moveTo(X(seg[k][1]), Y(seg[k][0])); g.lineTo(X(seg[k + 1][1]), Y(seg[k + 1][0])); } g.stroke(); });
    g.restore();
    // 4 屋面外缘（云形轮廓）
    g.strokeStyle = C.ink; g.lineWidth = 1.1; rimPath(); g.stroke();
    // 5 提升孔：未补 = 方框打叉（洞），在补 = 红，补完 = 小实心
    for (const hq of d.holes) {
      const k = stOf(hq.p, t), r = Math.max(1.8, 1.9 * s), x = X(hq.z), y = Y(hq.x);
      if (k >= 2) { if (t < K.holes.end + 6) { g.strokeStyle = 'rgba(29,26,23,.40)'; g.lineWidth = 0.7; g.strokeRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4); } continue; }   // 补完：淡墨空心方框（不画实心小黑点）
      g.strokeStyle = k >= 0 ? C.red : C.ink; g.lineWidth = k >= 0 ? 1.2 : 0.9; g.strokeRect(x - r, y - r, 2 * r, 2 * r);
      g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
    }
    // 6 金属屋面施工前沿（红点划线 + 方向）
    if (curZ != null) { const zz = curZ + S / 2; g.strokeStyle = C.red; g.lineWidth = 1; g.setLineDash([6, 2, 1, 2]); g.beginPath(); g.moveTo(X(zz), Y(128)); g.lineTo(X(zz), Y(-128)); g.stroke(); g.setLineDash([]);
      label(g, '铺设 →南', X(zz) + 4, Y(126) + 2, C.red, box, { fs: 8.5, sans: true, b: true }); }

    // 文字：一行现状 + 方位 + 等高距；图例
    const now = t < K.holes.start ? '提升到位，等待补孔' : t < K.holes.end ? `补提升孔 ${st.holesTot - st.holesOpen} / ${st.holesTot}` : t < K.pv.start ? `屋面封闭 ${st.close.toFixed(0)}%` : t < K.pv.end ? `光伏 ${fmt(st.pv)} / ${fmt(st.pvTot)} m²` : `屋面完成 · 光伏 ${fmt(st.pvTot)} m²`;
    label(g, now, box.x0 + 4, box.y0 + 7, C.ink, box, { b: true, fs: 9.5, sans: true });
    label(g, '↑东  ←北  等高距 2 m', box.x1 - 4, box.y0 + 7, C.ink2, box, { al: 'r', fs: 8.5, sans: true });
    const lg = [['补孔', 'hole'], ['采光顶', C.sky], ['金属屋面', C.clad], ['光伏', C.pv], ['在铺', C.red2]];
    g.font = `8.5px ${SANS}`; let lx = box.x0 + 4; const ly = box.y1 - 7;
    for (const [n, c] of lg) { const tw = g.measureText(n).width; if (lx + 12 + tw > box.x1 - 4) break;
      if (c === 'hole') { g.strokeStyle = C.ink; g.lineWidth = 0.8; g.strokeRect(lx, ly - 4, 8, 8); g.beginPath(); g.moveTo(lx, ly - 4); g.lineTo(lx + 8, ly + 4); g.moveTo(lx + 8, ly - 4); g.lineTo(lx, ly + 4); g.stroke(); }
      else { g.fillStyle = c; g.fillRect(lx, ly - 4, 8, 8); g.strokeStyle = 'rgba(29,26,23,.5)'; g.lineWidth = 0.5; g.strokeRect(lx, ly - 4, 8, 8); }
      g.fillStyle = C.ink2; g.textBaseline = 'middle'; g.fillText(n, lx + 11, ly); lx += 11 + tw + 10; }
    return st;
  }

  const plugin = {
    id: 'S-401', name: '屋面', sheet: 'S-401-1', title: '屋面铺设平面', owner: 'hark-cs',
    window: [679, 781],
    // 大数字：屋面封闭率（采光顶 + 金属屋面按块面积，含在铺进度）
    big: t => ({ num: Math.round(stats(t).close), unit: '%', label: '屋面封闭' }),
    draw,
    stats,
    // 镜头：高位俯视全屋面 → 逐渐拉近到云谷上方十字采光顶交点（米、度）
    cam: [
      { t: 679, target: [0, 46, 0], az: 135, el: 62, dist: 560 },
      { t: 729, target: [0, 50, 0], az: 125, el: 55, dist: 420 },
      { t: 751, target: [0, 52, 0], az: 115, el: 48, dist: 300 },
      { t: 781, target: [0, 55, 0], az: 100, el: 40, dist: 170 },
    ],
  };
  (G.HZ_SHEET_PLUGINS = G.HZ_SHEET_PLUGINS || []).push(plugin);
})(typeof window !== 'undefined' ? window : globalThis);
