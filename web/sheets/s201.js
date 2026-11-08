'use strict';
// ===== S-201 承轨层 · 插件图纸（hark-fangyi）=====
// 一屏讲清站台以下的「桥」：线下框架柱 → 承轨层板 → 站台 → 铺轨，南北两场错开推进。
// 二稿（联动接口 v2）：股道 G-*、站台 P-*、承轨层 D-*、引桥梁 B-* 可点 → 3D 飞到该构件；选中后右上身份卡给出位置、关系、工期、实物记录与偏差。几何、编号、日期全部现算自 HZ / HZR。
// 全部状态取自 HZ 构件级时刻（HZ.times 写入的 p.st / p.du），与 3D 同源；本文件不改任何共用数据。
// 平面：东在右、北在上；站内 ±225 m 按真比例，两端引桥压缩（折断线标出）。南北两场以墨线深浅区分，不用彩色。
(function (G) {
  const C = { paper: '#f6f2ea', ink: '#1d1a17', ink2: '#5d564c', ink3: '#948b7d', line: '#d4cbbb', red: '#b3202a', red3: '#f3dcd8', gold: '#d9a400', ghost: 'rgba(179,32,42,.28)' };
  const MONO = '"SF Mono","JetBrains Mono",Menlo,Consolas,"DejaVu Sans Mono","Noto Sans Mono CJK SC",monospace';
  const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif';
  const YK = { S: { name: '湖杭场', ink: C.ink, w: 1.5 }, N: { name: '杭临绩场', ink: C.ink2, w: 1.1 } };
  const NO = () => ((G.HZA && G.HZA.PROJECT) || 'HZW') + '-S-201-1';
  const T0 = 365, T1 = 900;

  // 状态：-1 未建 / 0..1 在建 / 2 已建（与 hzsheet.js 的 stOf 同义；承轨层构件不拆除）
  const stOf = (p, t) => (p.st == null || t < p.st) ? -1 : t < p.st + p.du ? (t - p.st) / p.du : 2;

  // ---- 从 HZ.acts 推导本图数据（按 HZ.acts 身份缓存，HZ.make 重跑后自动重建）----
  let D = null;
  function data() {
    const HZ = G.HZ; if (D && D.acts === HZ.acts) return D;
    const K = HZ.K, P = HZ.P, box = p => ({ x0: p.geo.min[0], x1: p.geo.max[0], z0: p.geo.min[2], z1: p.geo.max[2] });
    const grab = (keys, f) => { const o = []; for (const k of keys) if (K[k]) for (const p of K[k].parts) o.push(Object.assign({ p, yk: K[k].yard, key: k }, box(p), f ? f(p) : {})); return o; };
    const d = { acts: HZ.acts, P };
    d.cols = grab(['frameS', 'frameN']);
    d.piers = grab(['pierS', 'pierN']);
    d.deck = grab(['deckS', 'deckN', 'deckapS', 'deckapN'], p => ({})); for (const e of d.deck) e.ap = /^deckap/.test(e.key);
    d.plat = grab(['platS', 'platN']);
    d.track = grab(['trackS', 'trackN'], p => ({ tz: (p.geo.min[2] + p.geo.max[2]) / 2 }));
    // 每条股道 = 同一 tz 的全部分段；贯通 = 全部分段已铺
    const lines = new Map(); for (const s of d.track) { const k = s.yk + ':' + s.tz.toFixed(2); if (!lines.has(k)) lines.set(k, { yk: s.yk, tz: s.tz, segs: [] }); lines.get(k).segs.push(s); }
    d.lines = [...lines.values()];
    d.trackLen = d.track.reduce((s, e) => s + (e.x1 - e.x0), 0);
    d.deckArea = d.deck.reduce((s, e) => s + (e.x1 - e.x0) * (e.z1 - e.z0), 0);
    const bx = (p, y1) => [p.geo.min[0], p.geo.min[1], p.geo.min[2], p.geo.max[0], y1 == null ? p.geo.max[1] : y1, p.geo.max[2]];
    const out = (yk, z) => yk === 'S' ? z : -z;   // 自云谷向外为正
    d.byId = new Map();
    for (const yk of ['S', 'N']) {
      d.lines.filter(L => L.yk === yk).sort((a, b) => out(yk, a.tz) - out(yk, b.tz)).forEach((L, i) => { L.n = i + 1; L.id = `G-${yk}${String(i + 1).padStart(2, '0')}`; L.kind = 'track';
        L.x0 = Math.min(...L.segs.map(s => s.x0)); L.x1 = Math.max(...L.segs.map(s => s.x1));
        L.box = [L.x0, Math.min(...L.segs.map(s => s.p.geo.min[1])), Math.min(...L.segs.map(s => s.z0)), L.x1, Math.max(...L.segs.map(s => s.p.geo.max[1])) + 0.5, Math.max(...L.segs.map(s => s.z1))];
        for (const s of L.segs) s.lid = L.id; d.byId.set(L.id, L); });
      const pl = d.plat.filter(e => e.yk === yk).sort((a, b) => out(yk, (a.z0 + a.z1) / 2) - out(yk, (b.z0 + b.z1) / 2)), Y = G.HZ.YARDS[yk];
      pl.forEach((e, i) => { e.id = `P-${yk}${i + 1}`; e.kind = 'plat'; e.side = Math.abs((e.z0 + e.z1) / 2 - Y.side) < 1; e.box = bx(e.p); d.byId.set(e.id, e); });
      const dk = d.deck.filter(e => e.yk === yk && !e.ap).sort((a, b) => a.x0 - b.x0), ap = d.deck.filter(e => e.yk === yk && e.ap).sort((a, b) => a.x0 - b.x0);
      dk.forEach((e, i) => { e.id = `D-${yk}${String(i + 1).padStart(2, '0')}`; e.kind = 'deck'; e.box = bx(e.p); d.byId.set(e.id, e); });
      ap.forEach((e, i) => { e.id = `B-${yk}${String(i + 1).padStart(2, '0')}`; e.kind = 'deck'; e.box = bx(e.p); d.byId.set(e.id, e); });
    }
    const zs = [...d.deck, ...d.plat, ...d.track]; d.zMin = Math.min(...zs.map(e => e.z0)); d.zMax = Math.max(...zs.map(e => e.z1));
    d.keys = ['frameS', 'frameN', 'pierS', 'pierN', 'deckS', 'deckN', 'platS', 'platN', 'deckapS', 'deckapN', 'trackS', 'trackN'].filter(k => K[k]).map(k => K[k]);
    D = d; return d;
  }
  function stats(t) { const d = data(); let km = 0, area = 0, done = 0;
    for (const s of d.track) { const st = stOf(s.p, t); km += (s.x1 - s.x0) * (st < 0 ? 0 : st >= 2 ? 1 : st); }
    for (const s of d.deck) { const st = stOf(s.p, t); area += (s.x1 - s.x0) * (s.z1 - s.z0) * (st < 0 ? 0 : st >= 2 ? 1 : st); }
    for (const L of d.lines) if (L.segs.every(s => stOf(s.p, t) >= 2)) done++;
    return { km: km / 1000, kmTot: d.trackLen / 1000, area, areaTot: d.deckArea, done, lines: d.lines.length }; }

  // ---- 图框 + 标题栏（与 hzsheet.js 同一版式；插件不能调用其内部 frame，故按同样规则自画）----
  function frame(g, w, h, o) {
    if (!o.noFill) { g.fillStyle = C.paper; g.fillRect(0, 0, w, h); }
    else { const yb = h - 6.5 - (o.tb || 20); g.fillStyle = C.paper; g.fillRect(0, 0, w, 8); g.fillRect(0, 0, 8, h); g.fillRect(w - 8, 0, 8, h); g.fillRect(0, yb - 2, w, h - yb + 2); }
    const tb = o.tb || 20; g.strokeStyle = C.ink; g.lineWidth = 1; g.strokeRect(3.5, 3.5, w - 7, h - 7); g.lineWidth = 0.6; g.strokeRect(6.5, 6.5, w - 13, h - 13);
    const y = h - 6.5 - tb; g.beginPath(); g.moveTo(6.5, y); g.lineTo(w - 6.5, y); g.stroke();
    const nm = Array.isArray(o.name) ? o.name : [o.name, o.name], fs = tb >= 20 ? 10 : 9, pad = 6;
    const cells = [[o.no, C.red, true], [nm[0], C.ink, true], [o.scale || '1:—', C.ink2], ['修订 r' + String(o.rev || 1).padStart(3, '0'), C.red], [o.date || '—', C.ink2], [o.chk || '—', o.chkOk === false ? C.red : '#2f7a3a']];
    const fontOf = i => `${cells[i][2] ? '600 ' : ''}${fs}px ${i === 1 ? SANS : MONO}`;
    const ws = cells.map((c, i) => { g.font = fontOf(i); return g.measureText(c[0]).width + pad * 2; }), keep = cells.map(() => true), avail = w - 13;
    for (const k of [4, 2, 5, 3, 1]) { if (ws.reduce((s, v, i) => s + (keep[i] ? v : 0), 0) <= avail) break; if (k === 1) { cells[1][0] = nm[1]; g.font = fontOf(1); ws[1] = g.measureText(nm[1]).width + pad * 2; continue; } keep[k] = false; }
    const extra = Math.max(0, avail - ws.reduce((s, v, i) => s + (keep[i] ? v : 0), 0)); let x = 6.5; g.textBaseline = 'middle';
    cells.forEach((c, i) => { if (!keep[i]) return; const cw = ws[i] + (i === 1 ? extra : 0); g.fillStyle = c[1]; g.font = fontOf(i); let tx = c[0];
      while (g.measureText(tx).width > cw - pad * 2 && tx.length > 2) tx = tx.slice(0, -1); g.fillText(tx, x + pad, y + tb / 2 + 0.5); x += cw;
      if (x < w - 8) { g.strokeStyle = C.ink; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, h - 6.5); g.stroke(); } });
    return { x0: 8, y0: 8, x1: w - 8, y1: y - 2 };
  }
  const labels = []; let LZ = 1, ROT = false;   // ROT：当前在转向后的平面层画字，字要转回正   // LZ：缩放层标注的字号系数（放大时字不跟着变得巨大）
  const freeAt = (x, y, w, h, b) => x >= b.x0 && y >= b.y0 && x + w <= b.x1 && y + h <= b.y1 && labels.every(r => x + w < r[0] || x > r[2] || y + h < r[1] || y > r[3]);
  function label(g, txt, x, y, col, b, o) { o = o || {}; const fs = (o.fs || 9) * (o.any ? LZ : 1); g.font = `${o.b ? '600 ' : ''}${fs}px ${o.sans ? SANS : MONO}`; const w = g.measureText(txt).width, h = fs + 2;
    if (ROT && o.any) { g.save(); g.translate(x, y); g.rotate(Math.PI / 2); const ax = o.al === 'c' ? -w / 2 : o.al === 'r' ? -w : 0; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = C.paper; g.lineJoin = 'round'; g.strokeText(txt, ax, 0); g.fillStyle = col || C.ink; g.fillText(txt, ax, 0); g.restore(); return true; }
    const lx = o.al === 'c' ? x - w / 2 : o.al === 'r' ? x - w : x, ly = y - h / 2; if (!freeAt(lx - 1, ly, w + 2, h, b)) return false; labels.push([lx - 1, ly, lx + w + 1, ly + h]);
    g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = C.paper; g.lineJoin = 'round'; g.strokeText(txt, lx, y); g.fillStyle = col || C.ink; g.fillText(txt, lx, y); return true; }

  // ================= 版面（draw 与 parts 共用同一套换算，hit 与图上位置严格一致）=================
  // 横向：站内 ±P.stX 真比例，引桥压缩到 0.22；纵向范围取自承轨层 / 站台 / 股道构件的实际外包（HZ.YARDS 改了就跟着变）
  // 竖长条画布（h > 1.15 w，GPU 审计 #7）：平面整体逆时针转 90°（东在上、北在左），沿轨方向占满高度，身份卡放右侧空带
  function layout(w, h, tb) {
    const d = data(), P = d.P, B = { x0: 8, y0: 8, x1: w - 8, y1: h - 6.5 - tb - 2 }, rot = h > w * 1.15 && w >= 200;
    const box = rot ? { x0: 0, y0: 0, x1: (B.y1 - B.y0) - 20, y1: B.x1 - B.x0 } : B;   // 平面在「虚拟框」里排，rot 时再经 M 映到屏幕
    const XA = P.apX + 20, XS = P.stX, kAp = 0.22, zN = d.zMin - 9, zS = d.zMax + 8;
    const units = 2 * XS + 2 * (XA - XS) * kAp, top = box.y0 + (rot ? 4 : 16), bot = box.y1 - 4;
    const s = Math.min((box.x1 - box.x0 - 12) / units, (bot - top) / (zS - zN));
    const cx = (box.x0 + box.x1) / 2, cross = (zS - zN) * s, spare = (bot - top) - cross, need = rot ? 180 : 70;
    // 平面靠上（rot 时靠左），空带留给身份卡；空带不够时平面居中，卡片改为浮层
    const cy = spare >= need ? top : top + spare / 2;
    const band = spare < need ? null : rot ? { x0: B.x0 + top + cross + 34, x1: B.x1 - 2, y0: B.y0 + 18, y1: B.y1 - 2 } : { x0: B.x0, x1: B.x1, y0: top + cross + 4, y1: B.y1 - 2 };
    const X = x => { const a = Math.abs(x), u = a <= XS ? a : XS + (a - XS) * kAp; return cx + Math.sign(x) * u * s; };
    const Z = z => cy + (z - zN) * s;
    const rect = (x0, x1, z0, z1) => [X(x0), Z(z0), Math.max(0.6, X(x1) - X(x0)), Math.max(0.6, Z(z1) - Z(z0))];
    const M = rot ? [0, -1, 1, 0, B.x0, B.y1] : null;   // 虚拟 (px, py) → 屏幕 (B.x0 + py, B.y1 − px)
    const toScreen = r => M ? [B.x0 + r[1], B.y1 - r[0] - r[2], r[3], r[2]] : r;
    return { box, B, rot, M, toScreen, XA, XS, zN, zS, s, X, Z, rect, w, h, tb, band };
  }
  // 屏幕固定绘制（标题栏、身份卡不随宿主缩放平移）：撤掉宿主变换，只留 DPR
  function screen(g, w, fn) { const ok = g.getTransform && g.setTransform && g.canvas && g.canvas.width; if (!ok) return fn();
    const M = g.getTransform(), dpr = g.canvas.width / w; g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0); try { fn(); } finally { g.restore(); } return M; }
  let LAST = null;   // 最近一次 draw 的画布尺寸，parts() 用

  // ================= 承轨层平面 =================
  function draw(g, w, h, t, ctx) {
    const d = data(), P = d.P; labels.length = 0;
    const tbo = ctx.tb(w, h, NO(), ['承轨层平面 · 柱网 / 楼板 / 站台 / 股道', '承轨层平面'], t);
    const L = layout(w, h, tbo.tb || 20); LAST = { w, h, tb: tbo.tb || 20 };
    const { box, XA, XS, s, X, Z, rect } = L, focus = ctx.focus ? String(ctx.focus).toUpperCase() : null, zoom = Math.max(1, ctx.zoom || 1), ZW = 1 / Math.sqrt(zoom); LZ = ZW;
    if (ctx.setScale) ctx.setScale(s * zoom);
    // 纸面与图框屏幕固定；平面内容在宿主变换下画，并裁到图框内
    screen(g, w, () => { g.fillStyle = C.paper; g.fillRect(0, 0, w, h); });
    g.save();
    if (g.getTransform && g.canvas && g.canvas.width) { const M = g.getTransform(), dpr = g.canvas.width / w; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.beginPath(); g.rect(L.B.x0, L.B.y0, L.B.x1 - L.B.x0, L.B.y1 - L.B.y0); g.clip(); g.setTransform(M); }
    if (L.M) g.transform(...L.M); ROT = L.rot;
    // 站房外轮廓（参照线，取承轨层外包）与引桥折断线
    g.strokeStyle = C.line; g.lineWidth = (0.6) * ZW; g.setLineDash([6, 3]); g.strokeRect(X(-XS), Z(d.zMin - 5), X(XS) - X(-XS), Z(d.zMax + 5) - Z(d.zMin - 5)); g.setLineDash([]);
    for (const sx of [-1, 1]) { const xx = X(sx * (XS + 6)); g.strokeStyle = C.ink3; g.lineWidth = (0.7) * ZW; g.beginPath(); g.moveTo(xx, Z(L.zN)); g.lineTo(xx, Z(-2)); g.lineTo(xx - 3, Z(2)); g.lineTo(xx + 3, Z(6)); g.lineTo(xx, Z(10)); g.lineTo(xx, Z(L.zS)); g.stroke(); }
    // 1) 承轨层板（含引桥梁）：未建虚线 / 在建浅红 / 已建浅墨底
    for (const e of d.deck) { const st = stOf(e.p, t), r = rect(e.x0, e.x1, e.z0, e.z1);
      if (st < 0) { g.setLineDash([2, 3]); g.strokeStyle = C.ghost; g.lineWidth = (0.5) * ZW; g.strokeRect(...r); g.setLineDash([]); continue; }
      if (st < 2) { g.fillStyle = C.red3; g.fillRect(...r); g.strokeStyle = C.red; g.lineWidth = (1) * ZW; g.strokeRect(...r); continue; }
      g.fillStyle = e.yk === 'S' ? '#e3dccf' : '#ebe5da'; g.fillRect(...r); g.strokeStyle = 'rgba(29,26,23,.35)'; g.lineWidth = (0.5) * ZW; g.strokeRect(...r); }
    // 2) 引桥墩
    for (const e of d.piers) { const st = stOf(e.p, t), x = (X(e.x0) + X(e.x1)) / 2;
      g.strokeStyle = st < 0 ? C.ghost : st < 2 ? C.red : 'rgba(29,26,23,.4)'; g.lineWidth = (st < 0 ? 0.6 : st < 2 ? 1.4 : 0.9) * ZW; if (st < 0) g.setLineDash([2, 2]);
      g.beginPath(); g.moveTo(x, Z(e.z0)); g.lineTo(x, Z(e.z1)); g.stroke(); g.setLineDash([]); }
    // 3) 站台
    for (const e of d.plat) { const st = stOf(e.p, t), r = rect(e.x0, e.x1, e.z0, e.z1);
      if (st < 0) { g.setLineDash([3, 2]); g.strokeStyle = C.ghost; g.lineWidth = (0.5) * ZW; g.strokeRect(...r); g.setLineDash([]); continue; }
      g.fillStyle = st < 2 ? C.red3 : C.paper; g.fillRect(...r); g.strokeStyle = st < 2 ? C.red : YK[e.yk].ink; g.lineWidth = (0.9) * ZW; g.strokeRect(...r); }
    // 4) 股道：每段按自身时刻（铺轨规则已改为逐条股道，故整条线依次变黑）
    for (const e of d.track) { const st = stOf(e.p, t), z = Z(e.tz), xa = X(e.x0), xb = X(e.x1);
      if (st < 0) { g.setLineDash([1.5, 3]); g.strokeStyle = C.ghost; g.lineWidth = (0.5) * ZW; g.beginPath(); g.moveTo(xa, z); g.lineTo(xb, z); g.stroke(); g.setLineDash([]); continue; }
      if (st < 2) { const out = Math.abs(e.x0) > Math.abs(e.x1) ? -1 : 1, from = out > 0 ? xa : xb, to = from + (xb - xa) * st * out;
        g.strokeStyle = C.red; g.lineWidth = (1.6) * ZW; g.beginPath(); g.moveTo(from, z); g.lineTo(to, z); g.stroke(); continue; }
      g.strokeStyle = YK[e.yk].ink; g.lineWidth = (YK[e.yk].w) * ZW; g.beginPath(); g.moveTo(xa, z); g.lineTo(xb, z); g.stroke(); }
    // 4b) 线下框架柱
    for (const e of d.cols) { const st = stOf(e.p, t), x = (X(e.x0) + X(e.x1)) / 2, z = (Z(e.z0) + Z(e.z1)) / 2, q = Math.max(1.4, 2.2 * s);
      if (st < 0) { g.strokeStyle = C.ghost; g.lineWidth = (0.5) * ZW; g.strokeRect(x - q / 2, z - q / 2, q, q); continue; }
      g.fillStyle = st < 2 ? C.red : YK[e.yk].ink; g.fillRect(x - q / 2, z - q / 2, q, q); }
    // 5) 云谷
    g.strokeStyle = C.ink3; g.lineWidth = (0.5) * ZW; g.setLineDash([4, 2, 1, 2]); for (const z of [-P.gap, P.gap]) { g.beginPath(); g.moveTo(X(-XS), Z(z)); g.lineTo(X(XS), Z(z)); g.stroke(); } g.setLineDash([]);
    // 6) 选中构件描黄（先画，标注避让它）
    const F = focus ? d.byId.get(focus) : null;
    if (F) { g.strokeStyle = C.gold; g.lineJoin = 'round';
      if (F.kind === 'track') { g.lineWidth = 3.2 * ZW; g.beginPath(); g.moveTo(X(F.x0), Z(F.tz)); g.lineTo(X(F.x1), Z(F.tz)); g.stroke(); }
      else { const r = rect(F.x0, F.x1, F.z0, F.z1); g.lineWidth = 2.2 * ZW; g.strokeRect(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2); } }
    // 7) 构件编号：放大到 2× 起逐条标出（细节层级），选中的总是标出
    const S = stats(t), doneOf = yk => d.lines.filter(Ln => Ln.yk === yk && Ln.segs.every(q => stOf(q.p, t) >= 2)).length, totOf = yk => d.lines.filter(Ln => Ln.yk === yk).length;
    if (L.rot) { const mid = yk => { const ls = d.lines.filter(Ln => Ln.yk === yk).map(Ln => Ln.tz); return (Math.min(...ls) + Math.max(...ls)) / 2; }, xe = X(XS) + 10 * ZW + (X(XA) - X(XS)) * 0.5;
      label(g, `北 · ${YK.N.name} ${doneOf('N')}/${totOf('N')} 线贯通`, xe, Z(mid('N')), YK.N.ink, box, { al: 'c', b: true, fs: 9, sans: true, any: true });
      label(g, `南 · ${YK.S.name} ${doneOf('S')}/${totOf('S')} 线贯通`, xe, Z(mid('S')), YK.S.ink, box, { al: 'c', b: true, fs: 9, sans: true, any: true }); }
    else { label(g, `北 · ${YK.N.name} ${doneOf('N')}/${totOf('N')} 线贯通`, X(-XS) + 4, Z(-P.gap / 2), YK.N.ink, box, { b: true, fs: 9, sans: true, any: true });
      label(g, `南 · ${YK.S.name} ${doneOf('S')}/${totOf('S')} 线贯通`, X(-XS) + 4, Z(P.gap / 2), YK.S.ink, box, { b: true, fs: 9, sans: true, any: true }); }
    label(g, `云谷 ${Math.round(2 * P.gap)} m`, X(XS) - 4, Z(0), C.ink2, box, { al: 'r', fs: 8.5, sans: true, any: true });
    if (F) label(g, F.id, F.kind === 'track' ? X(-XS) - 3 : X(F.x0) - 3, F.kind === 'track' ? Z(F.tz) : Z((F.z0 + F.z1) / 2), '#8a6a00', box, { al: 'r', fs: 9, b: true, any: true });
    if (zoom >= 2) { const fs = 8;
      for (const Ln of d.lines) if (Ln.id !== focus) label(g, Ln.id, X(XS) + 3, Z(Ln.tz), C.ink3, box, { fs, any: true });
      for (const e of d.plat) if (e.id !== focus) label(g, e.id, X(0), Z((e.z0 + e.z1) / 2), C.ink2, box, { al: 'c', fs, any: true }); }
    label(g, '引桥', X(-(XS + XA) / 2), Z(d.zMax + 5) + 8, C.ink3, box, { al: 'c', fs: 8, sans: true, any: true }); label(g, '引桥', X((XS + XA) / 2), Z(d.zMax + 5) + 8, C.ink3, box, { al: 'c', fs: 8, sans: true, any: true });
    g.restore(); ROT = false;
    // 8) 屏幕固定层：当前工序、方位、身份卡、图框标题栏
    LZ = 1; screen(g, w, () => { labels.length = 0;
      const grp = new Map(); for (const a of d.keys) if (t >= a.start && t < a.end) { const [n, y] = a.name.split(' · '); if (!grp.has(n)) grp.set(n, []); if (y) grp.get(n).push(y); }
      const cur = [...grp].map(([n, ys]) => ys.length ? n + '（' + ys.join('、') + '）' : n).join('；');
      label(g, cur ? '在做：' + cur : (t < d.keys[0].start ? '承轨层尚未开工' : t >= T1 ? '股道全部贯通' : '等待下一道工序'), L.B.x0 + 4, L.B.y0 + 7, cur ? C.red : C.ink2, L.B, { b: true, fs: 9, sans: true });
      label(g, L.rot ? '↑东  北←' : '↑北  东→', L.B.x1 - 4, L.B.y0 + 7, C.ink2, box, { al: 'r', fs: 8.5, sans: true });
      if (F) card(g, F, t, L.B, L.band); else if (L.band) roster(g, t, L.B, L.band);
      frame(g, w, h, Object.assign({ noFill: true }, tbo)); });
    return S;
  }

  // ---- 未选中时空带里放「股道进度表」：20 条股道各一行（编号 · 状态 · 完成日），与图上编号一一对应，提示可点 ----
  function roster(g, t, box, band) { const d = data(), lh = 13, colW = 150, x0 = band.x0 + 6, y0 = band.y0 + 14;
    const ls = ['S', 'N'].flatMap(yk => d.lines.filter(Ln => Ln.yk === yk).sort((a, b) => a.n - b.n));
    const rowsFit = Math.max(1, Math.floor((band.y1 - y0 - 18) / lh)), cols = Math.max(1, Math.floor((band.x1 - band.x0 - 6) / colW)), per = Math.ceil(ls.length / cols);
    if (per > rowsFit) return;   // 放不下就不画，不挤
    g.textBaseline = 'middle'; g.font = `600 9px ${SANS}`; g.fillStyle = C.ink2; const hd = '股道进度 · 点图上任一构件看位置、关系、工期、实物'; g.fillText(g.measureText(hd).width <= band.x1 - x0 ? hd : '股道进度 · 点图看详情', x0, y0);
    ls.forEach((Ln, i) => { const c = Math.floor(i / per), r = i % per, x = x0 + c * colW, y = y0 + 16 + r * lh, sp = span(Ln.segs.map(q => q.p)), st = stSpan(sp, t);
      if (x + colW > band.x1 + 4) return;
      g.font = `600 9px ${MONO}`; g.fillStyle = st < 0 ? C.ink3 : st < 2 ? C.red : YK[Ln.yk].ink; g.fillText(Ln.id, x, y);
      g.font = `9px ${SANS}`; g.fillText(st < 0 ? '未铺 · ' + dd(sp[1]).slice(2) : st < 2 ? `在铺 ${Math.round(st * 100)}%` : '已铺 · ' + dd(sp[1]).slice(2), x + 44, y); }); }

  // ---- 身份卡：位置 · 关系 · 工期 · 实物（全部现算自 HZ 与 HZR）----
  const dd = t => G.HZ.dayDate(t), dayOfDate = s => (Date.parse(s + 'T00:00:00Z') - G.HZ.P.T0) / 864e5;
  const stTxt = (st, a, b) => st < 0 ? '未开工' : st < 2 ? `进行中 ${Math.round(st * 100)}%` : '已完成';
  const span = parts => { let a = Infinity, b = -Infinity; for (const p of parts) { a = Math.min(a, p.st); b = Math.max(b, p.st + p.du); } return [a, b]; };
  const stSpan = (sp, t) => t < sp[0] ? -1 : t < sp[1] ? (t - sp[0]) / (sp[1] - sp[0]) : 2;
  const zTxt = z => `站中线以${z > 0 ? '南' : '北'} ${Math.abs(z).toFixed(1)} m`;
  const srcName = r => (r.src.title.split(/[《（]/)[0] || '').replace(/\s*\/.*$/, '').trim();
  function info(F, t) { const d = data(), out = {};
    const lines = [], push = (k, v) => lines.push([k, v]);
    if (F.kind === 'track') { const sp = span(F.segs.map(s => s.p)), nb = d.plat.filter(p => p.yk === F.yk && Math.abs(Math.abs((p.z0 + p.z1) / 2 - F.tz) - (Math.abs(p.z1 - p.z0) / 2 + 2.5)) < 3 || (p.yk === F.yk && F.tz > Math.min(p.z0, p.z1) - 4 && F.tz < Math.max(p.z0, p.z1) + 4));
      const under = d.deck.filter(e => e.yk === F.yk && F.tz >= e.z0 && F.tz <= e.z1), usp = span(under.map(e => e.p));
      push('位置', `${YK[F.yk].name} · ${zTxt(F.tz)} · 第 ${F.n} 道（自云谷数）`);
      push('关系', `${nb.length ? '靠站台 ' + nb.map(p => p.id).join('、') + ' · ' : ''}压在承轨层 ${under.filter(e => !e.ap).length} 跨 + 引桥梁 ${under.filter(e => e.ap).length} 跨上，${dd(usp[1])} 全部浇完`);
      push('工期', `铺轨 ${dd(sp[0])} → ${dd(sp[1])} · ${stTxt(stSpan(sp, t))}`);
      const all = span(d.track.map(q => q.p));   // 报道给的是「两场正线全部铺完」的时点，故与全部股道的完成日比，不与单条比
      for (const r of (G.HZR ? (G.HZR.forPart ? G.HZR.forPart('S-201', F.id) : G.HZR.RECORDS || []) : [])) if (r.sheet === 'S-201' && r.t != null) { const dv = Math.round(all[1] - dayOfDate(r.date)); push('实物', `${r.id} ${srcName(r)}：${r.date} 前两场正线全部铺完；模型全部铺完 ${dd(all[1])}（${dv > 0 ? '晚 ' + dv : dv < 0 ? '早 ' + (-dv) : '差 0'} 天）`); }
      out.title = `股道 ${F.id}`; }
    else if (F.kind === 'plat') { const sp = span([F.p]), tr = d.lines.filter(Ln => Ln.yk === F.yk && Ln.tz > F.z0 - 4 && Ln.tz < F.z1 + 4), cols = d.cols.filter(c => c.yk === F.yk && c.z0 < F.z1 && c.z1 > F.z0);
      push('位置', `${YK[F.yk].name} · ${zTxt((F.z0 + F.z1) / 2)} · ${Math.round(F.x1 - F.x0)} × ${Math.round(F.z1 - F.z0)} m${F.side ? ' · 侧式' : ' · 岛式'}`);
      push('关系', `两侧股道 ${tr.map(L => L.id).join('、') || '—'} · 下有框架柱 ${cols.length} 根`);
      push('工期', `站台 ${dd(sp[0])} → ${dd(sp[1])} · ${stTxt(stSpan(sp, t))}`);
      out.title = `站台 ${F.id}`; }
    else { const sp = span([F.p]), cols = d.cols.filter(c => c.yk === F.yk && c.x0 < F.x1 && c.x1 > F.x0 && c.z0 < F.z1 && c.z1 > F.z0), trs = d.track.filter(s => s.yk === F.yk && s.x0 < F.x1 && s.x1 > F.x0), tsp = trs.length ? span(trs.map(s => s.p)) : null;
      const xs = v => v < 0 ? '西 ' + Math.round(-v) : v > 0 ? '东 ' + Math.round(v) : '0'; push('位置', `${YK[F.yk].name} · 站中线${xs(F.x0)} 至 ${xs(F.x1)} m · ${F.ap ? '引桥梁' : '站内承轨层'}`);
      push('关系', `${F.ap ? '架在引桥墩上' : '托在框架柱 ' + cols.length + ' 根上'} · 上铺股道 ${new Set(trs.map(s => s.lid)).size} 条`);
      push('工期', `浇筑 ${dd(sp[0])} → ${dd(sp[1])} · ${stTxt(stSpan(sp, t))}${tsp ? ' · 其上铺轨至 ' + dd(tsp[1]) : ''}`);
      out.title = `${F.ap ? '引桥梁' : '承轨层'} ${F.id}`; }
    const R10 = (G.HZR && G.HZR.RECORDS || []).find(r => r.id === 'R-0010'); if (R10 && F.kind !== 'deck') push('建成', `11 台 20 线（${R10.id} ${srcName(R10)}）· 模型 ${d.plat.length} 台 ${d.lines.length} 线`);
    out.lines = lines; return out; }
  function card(g, F, t, box, band) { const I = info(F, t), lh = 12, pad = 7, KW = 30;
    const W = band ? Math.min(560, band.x1 - band.x0 - 4) : Math.min(330, (box.x1 - box.x0) * 0.62), x = band ? (band.x0 + band.x1 - W) / 2 : box.x1 - W - 4;
    g.font = `9px ${SANS}`; const wrap = (txt, mw) => { const o = []; let s = ''; for (const ch of txt) { if (g.measureText(s + ch).width > mw && s) { o.push(s); s = ch; } else s += ch; } if (s) o.push(s); return o; };
    const rows = []; for (const [k, v] of I.lines) wrap(v, W - pad * 2 - KW).forEach((s, i) => rows.push([i ? '' : k, s]));
    const room = band ? band.y1 - band.y0 - 14 : box.y1 - box.y0 - 40, maxRows = Math.max(1, Math.floor((room - pad * 2 - 14) / lh)); const rs = rows.slice(0, maxRows); const H = pad * 2 + 14 + rs.length * lh, y = band ? band.y0 + Math.min(14, Math.max(0, band.y1 - band.y0 - H)) : box.y0 + 16;
    g.fillStyle = 'rgba(246,242,234,.97)'; g.fillRect(x, y, W, H); g.strokeStyle = C.gold; g.lineWidth = 1.2; g.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    g.textBaseline = 'middle'; g.fillStyle = C.ink; g.font = `600 10px ${SANS}`; g.fillText(I.title, x + pad, y + pad + 6);
    rs.forEach(([k, v], i) => { const yy = y + pad + 14 + lh * i + lh / 2; g.font = `600 8.5px ${SANS}`; g.fillStyle = k === '实物' || k === '建成' ? C.red : C.ink2; g.fillText(k, x + pad, yy); g.font = `9px ${SANS}`; g.fillStyle = C.ink; g.fillText(v, x + pad + 30, yy); });
    labels.push([x, y, x + W, y + H]); }

  // ---- 可点构件（联动接口 v2）：股道 G-*、站台 P-*、承轨层 D-*、引桥梁 B-*；hit 用与 draw 同一版面换算 ----
  function parts(t, ctx) { const d = data(); let w, h, tb;
    const el = G.document && G.document.getElementById && G.document.getElementById('sh-plug');
    if (ctx && ctx.w && ctx.h) { w = ctx.w; h = ctx.h; } else if (el && el.clientWidth > 20) { w = el.clientWidth; h = el.clientHeight; } else if (LAST) { w = LAST.w; h = LAST.h; } else { w = 560; h = 420; }
    tb = LAST && LAST.w === w && LAST.h === h ? LAST.tb : (h < 170 ? 17 : 20);
    const L = layout(w, h, tb), { X, Z, s } = L, rect = (...a) => L.toScreen(L.rect(...a)), out = [];
    for (const Ln of d.lines) { const hz = Math.max(4, 3 * s); out.push({ id: Ln.id, label: `股道 ${Ln.id}（${YK[Ln.yk].name}）`, hit: L.toScreen([X(Ln.x0), Z(Ln.tz) - hz / 2, X(Ln.x1) - X(Ln.x0), hz]), box: Ln.box }); }
    for (const e of d.plat) out.push({ id: e.id, label: `站台 ${e.id}（${YK[e.yk].name}）`, hit: rect(e.x0, e.x1, e.z0, e.z1), box: e.box });
    for (const e of d.deck) out.push({ id: e.id, label: `${e.ap ? '引桥梁' : '承轨层'} ${e.id}`, hit: rect(e.x0, e.x1, e.z0, e.z1), box: e.box });
    return out; }

  // ---- 大数字（GPU 审计 #6）：整张图只有一个量 = 承轨层体系完成度（柱 / 板 / 墩 / 站台 / 股道各构件按工日加权，%）；
  //      小字只说「现在在推进哪一块」：铺轨前说承轨层面积，铺轨后说已铺 km 与贯通线数。起点是 0%，不再出现「0 万 m²」。
  function big(t) { const d = data(), S = stats(t); let all = 0, done = 0;
    for (const a of d.keys) for (const p of a.parts) { if (p.st == null || !(p.du > 0)) continue; const st = stOf(p, t); all += p.du; done += p.du * (st < 0 ? 0 : st >= 2 ? 1 : st); }
    const pct = all ? Math.min(100, Math.floor(done / all * 100 + 1e-9)) : 0, HZ = G.HZ, w1 = v => Math.round(v / 1000) / 10;
    const sub = S.area < 50 ? `先立框架柱，承轨层共 ${w1(S.areaTot)} 万 m² 待浇` : t < HZ.K.trackS.start ? `承轨层已成 ${w1(S.area)} / ${w1(S.areaTot)} 万 m²，之后逐条铺轨` : `已铺轨 ${S.km.toFixed(1)} / ${S.kmTot.toFixed(1)} km · 贯通 ${S.done}/${S.lines} 线`;
    return { num: pct, unit: '%', label: '承轨层完成度 · ' + sub }; }

  // ---- 镜头关键帧（米、度；约定同 hzview.js placeCam：pos = target + d·(sin az·cos el, sin el, −cos az·cos el)）----
  // 柱网升起时偏高看全场 → 楼板 / 站台时压低 → 铺轨时贴着股道从东端往西看，能同时看到柱网、承轨层和上方 24 m 候车层
  const cam = [
    { t: 365, target: [0, 5, 10], az: 62, el: 24, dist: 520 },
    { t: 420, target: [40, 10, 20], az: 70, el: 14, dist: 380 },
    { t: 580, target: [90, 13, 70], az: 84, el: 7, dist: 300 },
    { t: 790, target: [90, 15, -60], az: 96, el: 4, dist: 300 },   // D-14：压低到雨棚 canopyN 下沿以下，避开 t 798–822 遮挡
    { t: 900, target: [60, 15, 0], az: 88, el: 4, dist: 360 },
  ];

  // 实物层记录（web/hzreal.js）若页面未加载，则按需补载一次（只读；已在 CLAIMS 请 hark-cr 在 hzwest.html 正式引入）
  if (G.document && G.document.createElement && !G.HZR && !G.__hzrLoading) { G.__hzrLoading = 1; const sc = G.document.createElement('script'); sc.src = 'hzreal.js'; (G.document.head || G.document.documentElement).appendChild(sc); }
  (G.HZ_SHEET_PLUGINS = G.HZ_SHEET_PLUGINS || []).push({ id: 'S-201', name: '承轨层', no: 'S-201-1', window: [T0, T1], big, draw, cam, stats, parts, info: (id, t) => { const F = data().byId.get(String(id).toUpperCase()); return F ? info(F, t) : null; } });
})(typeof window !== 'undefined' ? window : globalThis);
