'use strict';
// ===== S-201 承轨层 · 插件图纸（hark-fangyi）=====
// 一屏讲清站台以下的「桥」：线下框架柱 → 承轨层板 → 站台 → 铺轨，南北两场错开推进。
// 全部状态取自 HZ 构件级时刻（HZ.times 写入的 p.st / p.du），与 3D 同源；本文件不改任何共用数据。
// 平面：东在右、北在上；站内 ±225 m 按真比例，两端引桥压缩（折断线标出）。南北两场以墨线深浅区分，不用彩色。
(function (G) {
  const C = { paper: '#f6f2ea', ink: '#1d1a17', ink2: '#5d564c', ink3: '#948b7d', line: '#d4cbbb', red: '#b3202a', red3: '#f3dcd8', ghost: 'rgba(179,32,42,.28)' };
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
    d.deck = grab(['deckS', 'deckN', 'deckapS', 'deckapN']);
    d.plat = grab(['platS', 'platN']);
    d.track = grab(['trackS', 'trackN'], p => ({ tz: (p.geo.min[2] + p.geo.max[2]) / 2 }));
    // 每条股道 = 同一 tz 的全部分段；贯通 = 全部分段已铺
    const lines = new Map(); for (const s of d.track) { const k = s.yk + ':' + s.tz.toFixed(2); if (!lines.has(k)) lines.set(k, { yk: s.yk, tz: s.tz, segs: [] }); lines.get(k).segs.push(s); }
    d.lines = [...lines.values()];
    d.trackLen = d.track.reduce((s, e) => s + (e.x1 - e.x0), 0);
    d.deckArea = d.deck.reduce((s, e) => s + (e.x1 - e.x0) * (e.z1 - e.z0), 0);
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
    g.fillStyle = C.paper; g.fillRect(0, 0, w, h);
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
  const labels = [];
  const freeAt = (x, y, w, h, b) => x >= b.x0 && y >= b.y0 && x + w <= b.x1 && y + h <= b.y1 && labels.every(r => x + w < r[0] || x > r[2] || y + h < r[1] || y > r[3]);
  function label(g, txt, x, y, col, b, o) { o = o || {}; const fs = o.fs || 9; g.font = `${o.b ? '600 ' : ''}${fs}px ${o.sans ? SANS : MONO}`; const w = g.measureText(txt).width, h = fs + 2;
    const lx = o.al === 'c' ? x - w / 2 : o.al === 'r' ? x - w : x, ly = y - h / 2; if (!freeAt(lx - 1, ly, w + 2, h, b)) return false; labels.push([lx - 1, ly, lx + w + 1, ly + h]);
    g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = C.paper; g.lineJoin = 'round'; g.strokeText(txt, lx, y); g.fillStyle = col || C.ink; g.fillText(txt, lx, y); return true; }

  // ================= 承轨层平面 =================
  function draw(g, w, h, t, ctx) {
    const d = data(), P = d.P; labels.length = 0;
    const tbo = ctx.tb(w, h, NO(), ['承轨层平面 · 柱网 / 楼板 / 站台 / 股道', '承轨层平面'], t);
    const box = frame(g, w, h, tbo);
    // 横向分段比例：站内真比例，引桥（225–670 m）压缩到站内比例的 0.22
    const XA = P.apX + 20, XS = P.stX, kAp = 0.22, zN = -126, zS = 146;
    const units = 2 * XS + 2 * (XA - XS) * kAp, top = box.y0 + 16, bot = box.y1 - 4;
    const s = Math.min((box.x1 - box.x0 - 12) / units, (bot - top) / (zS - zN)); if (ctx.setScale) ctx.setScale(s);
    const cx = (box.x0 + box.x1) / 2, cy = top + ((bot - top) - (zS - zN) * s) / 2;
    const X = x => { const a = Math.abs(x), u = a <= XS ? a : XS + (a - XS) * kAp; return cx + Math.sign(x) * u * s; };
    const Z = z => cy + (z - zN) * s;
    const rect = (x0, x1, z0, z1) => [X(x0), Z(z0), Math.max(0.6, X(x1) - X(x0)), Math.max(0.6, Z(z1) - Z(z0))];
    // 站房外轮廓（参照线）与引桥折断线
    g.strokeStyle = C.line; g.lineWidth = 0.6; g.setLineDash([6, 3]); g.strokeRect(X(-XS), Z(-122), X(XS) - X(-XS), Z(143) - Z(-122)); g.setLineDash([]);
    for (const sx of [-1, 1]) { const xx = X(sx * (XS + 6)); g.strokeStyle = C.ink3; g.lineWidth = 0.7; g.beginPath(); g.moveTo(xx, Z(zN)); g.lineTo(xx, Z(-2)); g.lineTo(xx - 3, Z(2)); g.lineTo(xx + 3, Z(6)); g.lineTo(xx, Z(10)); g.lineTo(xx, Z(zS)); g.stroke(); }
    // 0) 当前工序（最高优先，先占位）
    // 同名工序合并：「承轨层 · 湖杭场」+「承轨层 · 杭临绩场」→「承轨层（湖杭场、杭临绩场）」
    const grp = new Map(); for (const a of d.keys) if (t >= a.start && t < a.end) { const [n, y] = a.name.split(' · '); if (!grp.has(n)) grp.set(n, []); if (y) grp.get(n).push(y); }
    const cur = [...grp].map(([n, ys]) => ys.length ? n + '（' + ys.join('、') + '）' : n).join('；');
    label(g, cur ? '在做：' + cur : (t < d.keys[0].start ? '承轨层尚未开工' : t >= 900 ? '股道全部贯通' : '等待下一道工序'), box.x0 + 4, box.y0 + 7, cur ? C.red : C.ink2, box, { b: true, fs: 9, sans: true });
    // 1) 承轨层板（含引桥梁）：未建虚线 / 在建浅红 / 已建浅墨底
    for (const e of d.deck) { const st = stOf(e.p, t), r = rect(e.x0, e.x1, e.z0, e.z1);
      if (st < 0) { g.setLineDash([2, 3]); g.strokeStyle = C.ghost; g.lineWidth = 0.5; g.strokeRect(...r); g.setLineDash([]); continue; }
      if (st < 2) { g.fillStyle = C.red3; g.fillRect(...r); g.strokeStyle = C.red; g.lineWidth = 1; g.strokeRect(...r); continue; }
      g.fillStyle = e.yk === 'S' ? '#e3dccf' : '#ebe5da'; g.fillRect(...r); g.strokeStyle = 'rgba(29,26,23,.35)'; g.lineWidth = 0.5; g.strokeRect(...r); }
    // 2) 引桥墩（画成横跨车场的短粗线）
    for (const e of d.piers) { const st = stOf(e.p, t), x = (X(e.x0) + X(e.x1)) / 2;
      g.strokeStyle = st < 0 ? C.ghost : st < 2 ? C.red : 'rgba(29,26,23,.4)'; g.lineWidth = st < 0 ? 0.6 : st < 2 ? 1.4 : 0.9; if (st < 0) g.setLineDash([2, 2]);
      g.beginPath(); g.moveTo(x, Z(e.z0)); g.lineTo(x, Z(e.z1)); g.stroke(); g.setLineDash([]); }
    // 3) 站台（岛式 / 侧式）
    for (const e of d.plat) { const st = stOf(e.p, t), r = rect(e.x0, e.x1, e.z0, e.z1);
      if (st < 0) { g.setLineDash([3, 2]); g.strokeStyle = C.ghost; g.lineWidth = 0.5; g.strokeRect(...r); g.setLineDash([]); continue; }
      g.fillStyle = st < 2 ? C.red3 : C.paper; g.fillRect(...r); g.strokeStyle = st < 2 ? C.red : YK[e.yk].ink; g.lineWidth = 0.9; g.strokeRect(...r); }
    // 4) 股道：每段按自身时刻；已铺 = 南场粗黑 / 北场细灰墨，在建段红色按进度从靠站心一端铺出
    for (const e of d.track) { const st = stOf(e.p, t), z = Z(e.tz), xa = X(e.x0), xb = X(e.x1);
      if (st < 0) { g.setLineDash([1.5, 3]); g.strokeStyle = C.ghost; g.lineWidth = 0.5; g.beginPath(); g.moveTo(xa, z); g.lineTo(xb, z); g.stroke(); g.setLineDash([]); continue; }
      if (st < 2) { const out = Math.abs(e.x0) > Math.abs(e.x1) ? -1 : 1, from = out > 0 ? xa : xb, to = from + (xb - xa) * st * out;
        g.strokeStyle = C.red; g.lineWidth = 1.6; g.beginPath(); g.moveTo(from, z); g.lineTo(to, z); g.stroke(); continue; }
      g.strokeStyle = YK[e.yk].ink; g.lineWidth = YK[e.yk].w; g.beginPath(); g.moveTo(xa, z); g.lineTo(xb, z); g.stroke(); }
    // 4b) 线下框架柱（在承轨层之下；平面上压在站台中线，画在最上层以便看清柱网）
    for (const e of d.cols) { const st = stOf(e.p, t), x = (X(e.x0) + X(e.x1)) / 2, z = (Z(e.z0) + Z(e.z1)) / 2, q = Math.max(1.4, 2.2 * s);
      if (st < 0) { g.strokeStyle = C.ghost; g.lineWidth = 0.5; g.strokeRect(x - q / 2, z - q / 2, q, q); continue; }
      g.fillStyle = st < 2 ? C.red : YK[e.yk].ink; g.fillRect(x - q / 2, z - q / 2, q, q); }
    // 5) 云谷（两场之间 28 m）
    g.strokeStyle = C.ink3; g.lineWidth = 0.5; g.setLineDash([4, 2, 1, 2]); for (const z of [-P.gap, P.gap]) { g.beginPath(); g.moveTo(X(-XS), Z(z)); g.lineTo(X(XS), Z(z)); g.stroke(); } g.setLineDash([]);
    label(g, '云谷 28 m', X(XS) - 4, Z(0), C.ink2, box, { al: 'r', fs: 8.5, sans: true });
    // 6) 标注：场名 + 贯通股道数、方位、当前工序
    const S = stats(t), doneOf = yk => d.lines.filter(L => L.yk === yk && L.segs.every(q => stOf(q.p, t) >= 2)).length, totOf = yk => d.lines.filter(L => L.yk === yk).length;
    label(g, `北 · ${YK.N.name} ${doneOf('N')}/${totOf('N')} 线贯通`, X(-XS) + 4, Z(-P.gap / 2), YK.N.ink, box, { b: true, fs: 9, sans: true });
    label(g, `南 · ${YK.S.name} ${doneOf('S')}/${totOf('S')} 线贯通`, X(-XS) + 4, Z(P.gap / 2), YK.S.ink, box, { b: true, fs: 9, sans: true });
    label(g, '引桥', X(-(XS + XA) / 2), Z(-122) - 7, C.ink3, box, { al: 'c', fs: 8, sans: true }); label(g, '引桥', X((XS + XA) / 2), Z(-122) - 7, C.ink3, box, { al: 'c', fs: 8, sans: true });
    label(g, '↑北  东→', box.x1 - 4, box.y0 + 7, C.ink2, box, { al: 'r', fs: 8.5, sans: true });
    return S;
  }

  // ---- 大数字：铺轨前讲「桥面」（承轨层完成面积），开始铺轨后讲「轨道」（已铺轨 km）----
  function big(t) { const S = stats(t), HZ = G.HZ;
    if (t < HZ.K.trackS.start) return { num: Math.round(S.area / 1000) / 10, unit: '万 m²', label: '承轨层已成 / ' + (Math.round(S.areaTot / 1000) / 10) + ' 万 m²' };
    return { num: Math.round(S.km * 10) / 10, unit: 'km', label: `已铺轨 / ${S.kmTot.toFixed(1)} km · 贯通 ${S.done}/${S.lines} 线` }; }

  // ---- 镜头关键帧（米、度；约定同 hzview.js placeCam：pos = target + d·(sin az·cos el, sin el, −cos az·cos el)）----
  // 柱网升起时偏高看全场 → 楼板 / 站台时压低 → 铺轨时贴着股道从东端往西看，能同时看到柱网、承轨层和上方 24 m 候车层
  const cam = [
    { t: 365, target: [0, 5, 10], az: 62, el: 24, dist: 520 },
    { t: 420, target: [40, 10, 20], az: 70, el: 14, dist: 380 },
    { t: 580, target: [90, 13, 70], az: 84, el: 7, dist: 300 },
    { t: 740, target: [90, 13, -60], az: 96, el: 7, dist: 300 },
    { t: 900, target: [60, 13, 0], az: 88, el: 9, dist: 360 },
  ];

  (G.HZ_SHEET_PLUGINS = G.HZ_SHEET_PLUGINS || []).push({ id: 'S-201', name: '承轨层', no: 'S-201-1', window: [T0, T1], big, draw, cam, stats });
})(typeof window !== 'undefined' ? window : globalThis);
