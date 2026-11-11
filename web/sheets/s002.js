'use strict';
// ===== S-002 吊装资源 · 全场吊机平面（塔吊回转圈 + 当天履带吊站位与吊距）+ 每天在场吊机台数 · 插件模块（hark-darrio）=====
// 「吊装资源图（提议）」：与「履带吊臂长规则」（docs/rules/crane-reach.md、tools/hz/check_crane.js）同源，是它的图纸面。
//
// 数据全部来自同一份排程（改 HZ 图跟着变，不另排）：
//  · 塔吊 = HZ.cranes（位置、臂长 L、塔高 jy），在场时段 = HZ.K[c.key].start 至 其拆除工序（HZ.K[c.key + '~rm']）结束；
//  · 履带吊 = HZ.assignCranes() 派给履带吊的每次吊装（p.crane === -1，站位 p.crawl = [x, z]，构件中心 p.c，时段 [p.st, p.st + p.du]）；
//  · 吊距 R = 站位到构件中心的水平距离；单吊重量 W、额定起重量表与 check_crane.js 相同（650 t 级装超起，W × 1.1 ≤ 额定(R)），超限标红。
// 台数口径（模型口径，不是公开数字）：排程只给每一吊的站位，不给机号；同一天在吊、站位相距 ≤ 30 m 的记作同一台履带吊，塔吊按在场台数计。
// 大数字：当天在场吊机台数（塔吊 + 履带吊）。
(function (G) {
  const C = { paper: '#f6f2ea', ink: '#1d1a17', ink2: '#5d564c', ink3: '#948b7d', line: '#d4cbbb', faint: '#e4dccd', red: '#b3202a', red3: '#f3dcd8', temp: '#c46a12', yel: '#a07a00' };
  const MONO = '"SF Mono","JetBrains Mono",Menlo,Consolas,"DejaVu Sans Mono","Noto Sans Mono CJK SC",monospace';
  const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 额定起重量（t，360°，各臂长组合取最大）· 650 t 级装超起（Liebherr LR 1600/2 SDB），与 tools/hz/check_crane.js 的 C650 同表
  const C650 = [[20, 397], [24, 335], [30, 265], [36, 215], [40, 191], [44, 170], [48, 153], [52, 138], [56, 125], [60, 114], [64, 104], [68, 94], [72, 85], [76, 78], [80, 72], [84, 66], [88, 60], [92, 54], [96, 49.4], [100, 44.3], [104, 39.9], [108, 35.5], [112, 30.8], [116, 27], [120, 22.7], [124, 19.4], [128, 16.6], [132, 14.1], [136, 11.3], [140, 7.9]];
  const cap = R => { if (R <= C650[0][0]) return C650[0][1]; for (let i = 1; i < C650.length; i++) if (R <= C650[i][0]) return C650[i][1]; return 0; };
  const rmax = need => { let r = 0; for (const [R, c] of C650) if (c >= need) r = R; return r; };
  const PICK = { conc: 8, plat: 8, found: 8, ym: 8, ymG: 10, todG: 10, todB: 10, glass: 6, steel: 20, red: 20 };
  const W = p => (p.tons ? p.tons : PICK[p.mat] != null ? PICK[p.mat] : 10), HOOK = 1.1, SAME = 30;
  const CAP = 14;   // 履带吊全场同日在吊上限（docs/rules/crane-count.md，与 tools/hz/check_cranecount.js 同值）

  let M = null;
  function model(HZ) {
    const K = HZ.K, lifts = [], seen = new Set();
    for (const a of HZ.acts) for (const p of a.parts) {
      if (p.crane !== -1 || !p.crawl || seen.has(p)) continue; seen.add(p);   // 拆除工序与安装共用构件，按一次计
      const R = Math.hypot(p.c[0] - p.crawl[0], p.c[2] - p.crawl[1]), w = W(p), need = w * HOOK;
      lifts.push({ a, p, key: a.key.replace(/~rm$/, ''), name: a.name, x: p.crawl[0], z: p.crawl[1], y: p.crawlY || 0, cx: p.c[0], cz: p.c[2], R, w, need, cap: cap(R), lim: rmax(need), over: need > cap(R), st: p.st, en: p.st + p.du });
    }
    const towers = HZ.cranes.map((c, i) => { const A = K[c.key], Rm = K[c.key + '~rm'] || A.rm;
      return { id: 'T' + (i + 1), c, x: c.x, z: c.z, L: c.L, top: c.top || c.jy + 7, key: c.key, name: A.name, st: A.start, up: A.end, dn: Rm ? Rm.start : Infinity, en: Rm ? Rm.end : Infinity }; });
    const sig = lifts.length + ':' + lifts.map(l => l.st.toFixed(2) + ',' + l.x + ',' + l.z).join(';') + '|' + towers.map(t => t.st + ',' + t.en).join(';');
    if (M && M.HZ === HZ && M.sig === sig) return M;
    const t0 = Math.floor(Math.min(...towers.map(t => t.st), ...lifts.map(l => l.st)));
    const t1 = Math.ceil(Math.max(...towers.map(t => Number.isFinite(t.en) ? t.en : 0), ...lifts.map(l => l.en))) - 1;
    // 场地范围：所有构件盒的平面外包（取 2%–98% 分位，避开引桥长尾）
    const xs = [], zs = []; for (const a of HZ.acts) for (const p of a.parts) if (p.geo && p.geo.min) { xs.push(p.geo.min[0], p.geo.max[0]); zs.push(p.geo.min[2], p.geo.max[2]); }
    xs.sort((a, b) => a - b); zs.sort((a, b) => a - b); const q = (v, f) => v[Math.floor(f * (v.length - 1))];
    const ext = { xa: Math.min(q(xs, 0.02), ...towers.map(t => t.x - t.L)), xb: Math.max(q(xs, 0.98), ...towers.map(t => t.x + t.L)), za: Math.min(q(zs, 0.02), ...towers.map(t => t.z - t.L)), zb: Math.max(q(zs, 0.98), ...towers.map(t => t.z + t.L)) };
    M = { HZ, sig, lifts, towers, win: [t0, t1], ext, nOver: lifts.filter(l => l.over).length, daily: null };
    M.daily = []; for (let d = t0; d <= t1; d++) { const s = stateAt(HZ, d + 0.5, M); M.daily.push({ d, tw: s.tw.length, cr: s.crane.length, over: s.over }); }
    return M;
  }

  // t 所在这一天（[floor(t), floor(t)+1)）
  function stateAt(HZ, t, m) {
    m = m || model(HZ); const d0 = Math.floor(t), d1 = d0 + 1;
    const tw = m.towers.filter(x => t >= x.st && t < x.en);
    const live = m.lifts.filter(l => l.st < d1 && l.en > d0);
    const crane = [];   // 同日站位 ≤ 30 m 归一台
    for (const l of live.slice().sort((a, b) => a.st - b.st)) { const k = crane.find(c => Math.hypot(c.x - l.x, c.z - l.z) <= SAME); if (k) k.lifts.push(l); else crane.push({ x: l.x, z: l.z, lifts: [l] }); }
    return { tw, live, crane, over: live.filter(l => l.over).length };
  }

  function big(HZ, t) {
    const m = model(HZ), s = stateAt(HZ, t, m), n = s.tw.length + s.crane.length;
    const parts = []; if (s.tw.length) parts.push('塔吊 ' + s.tw.length); if (s.crane.length) parts.push('履带吊 ' + s.crane.length);
    const label = n ? '在场吊机 · ' + parts.join(' + ') + (s.over ? ' · ' + s.over + ' 吊超吊距' : '') + (s.crane.length > CAP ? ' · 超台数上限' : '') : '当天无吊机在场';
    return { num: String(n), unit: '台', label };
  }

  // ---- 2D ----
  function frame(g, w, h, tbo) {
    const tb = tbo && tbo.tb || 20;
    g.fillStyle = C.paper; g.fillRect(0, 0, w, h);
    g.strokeStyle = C.ink; g.lineWidth = 1; g.strokeRect(3.5, 3.5, w - 7, h - 7); g.lineWidth = 0.6; g.strokeRect(6.5, 6.5, w - 13, h - 13);
    const y = h - 6.5 - tb; g.beginPath(); g.moveTo(6.5, y); g.lineTo(w - 6.5, y); g.stroke();
    const nm = tbo ? (Array.isArray(tbo.name) ? tbo.name : [tbo.name, tbo.name]) : ['', ''];
    const fs = tb >= 20 ? 10 : 9, pad = 6; g.textBaseline = 'middle';
    const cells = [[String(tbo && tbo.no || ''), C.red, MONO, true], [nm[0], C.ink, SANS, true], [String(tbo && tbo.scale || ''), C.ink2, MONO], ['修订 r' + String(tbo && tbo.rev || 1).padStart(3, '0'), C.red, MONO], [String(tbo && tbo.date || ''), C.ink2, MONO], [tbo && tbo.chkOk === false ? '!' : 'OK', tbo && tbo.chkOk === false ? C.red : '#2f7a3a', MONO]];
    const wOf = c => { g.font = `${c[3] ? '600 ' : ''}${fs}px ${c[2]}`; return g.measureText(c[0]).width + pad * 2; };
    const ws = cells.map(wOf), keep = cells.map(() => true), avail = w - 13;
    for (const k of [4, 2, 5, 3, 1]) { if (ws.reduce((a, v, i) => a + (keep[i] ? v : 0), 0) <= avail) break; if (k === 1) { cells[1][0] = nm[1]; ws[1] = wOf(cells[1]); continue; } keep[k] = false; }
    const tot = ws.reduce((a, v, i) => a + (keep[i] ? v : 0), 0), extra = Math.max(0, avail - tot); let x = 6.5;
    cells.forEach((c, i) => { if (!keep[i]) return; const cw = ws[i] + (i === 1 ? extra : 0); g.font = `${c[3] ? '600 ' : ''}${fs}px ${c[2]}`; g.fillStyle = c[1]; let tx = c[0];
      while (g.measureText(tx).width > cw - pad * 2 && tx.length > 2) tx = tx.slice(0, -1);
      g.fillText(tx, x + pad, y + tb / 2 + 0.5); x += cw; if (x < w - 8) { g.strokeStyle = C.ink; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, h - 6.5); g.stroke(); } });
    return { x0: 8, y0: 8, x1: w - 8, y1: y - 2 };
  }

  let HITS = [], HITW = null;
  function draw(g, w, h, t, ctx) {
    const HZ = G.HZ; ctx = ctx || {};
    const PJ = (G.HZA && G.HZA.PROJECT) || HZ.PROJECT || 'HZW', no = PJ + '-S-002-1';
    const tbo = ctx.tb ? ctx.tb(w, h, no, ['吊装资源 · 全场吊机平面 · 每天在场台数', '吊装资源'], t) : { tb: 20, no, name: '吊装资源' };
    const box = frame(g, w, h, tbo), m = model(HZ), s = stateAt(HZ, t, m);
    HITS = []; HITW = { w, h, t };
    const labels = [];
    const label = (txt, x, y, col, o) => { o = o || {}; const fs = o.fs || 9; g.font = `${o.b ? '600 ' : ''}${fs}px ${o.mono ? MONO : SANS}`; const tw = g.measureText(txt).width, th = fs + 2;
      let lx = o.al === 'c' ? x - tw / 2 : o.al === 'r' ? x - tw : x; lx = clamp(lx, box.x0 + 2, box.x1 - tw - 2); let ly = clamp(y - th / 2, box.y0 + 1, box.y1 - th - 1);
      for (let k = 0; k < 6 && labels.some(r => lx < r[0] + r[2] && lx + tw > r[0] && ly < r[1] + r[3] && ly + th > r[1]); k++) ly += th;
      labels.push([lx, ly, tw, th]); g.fillStyle = 'rgba(246,242,234,.85)'; g.fillRect(lx - 1, ly, tw + 2, th); g.fillStyle = col; g.textBaseline = 'middle'; g.fillText(txt, lx, ly + th / 2); };
    const addHit = (id, lbl, r, b, clip) => { const x0 = Math.max(clip[0], r[0]), y0 = Math.max(clip[1], r[1]), x1 = Math.min(clip[2], r[0] + r[2]), y1 = Math.min(clip[3], r[1] + r[3]);
      if (x1 - x0 < 2 || y1 - y0 < 2 || !b.every(Number.isFinite)) return; HITS.push({ id, label: lbl, hit: [x0, y0, x1 - x0, y1 - y0], box: b }); };
    const small = h < 260 || w < 420;

    // 版面：左栏大数字；右上平面（北上东右）；底部横条 = 每天在场台数（小画幅只留平面）
    const BW = box.x1 - box.x0, BH = box.y1 - box.y0, tall = !small && BH > BW * 1.15;
    const gut = small || tall ? 0 : clamp(Math.round(w * 0.2), 130, 220), topH = tall ? Math.round(clamp(BH * 0.16, 110, 160)) : 0;
    const stripH = small ? 0 : Math.round(clamp(BH * (tall ? 0.3 : 0.24), 70, tall ? 300 : 150));
    const pa = { x0: box.x0 + gut + 8, y0: box.y0 + (small ? 30 : 16) + topH, x1: box.x1 - 8, y1: box.y1 - 18 - stripH };
    const E = m.ext, k = Math.min((pa.x1 - pa.x0) / (E.xb - E.xa), (pa.y1 - pa.y0) / (E.zb - E.za));
    if (!(k > 0) || pa.x1 - pa.x0 < 8 || pa.y1 - pa.y0 < 8) return { state: s };   // D-52：画幅太小（pa 宽高为负）时不画平面，免 arc 负半径 IndexSizeError
    const ox = (pa.x0 + pa.x1) / 2 - (E.xa + E.xb) / 2 * k, oy = (pa.y0 + pa.y1) / 2 - (E.za + E.zb) / 2 * k;
    const X = x => ox + x * k, Y = z => oy + z * k, clip = [pa.x0, pa.y0, pa.x1, pa.y1];

    g.save(); g.beginPath(); g.rect(pa.x0 - 2, pa.y0 - 2, pa.x1 - pa.x0 + 4, pa.y1 - pa.y0 + 4); g.clip();
    // 底图：已建成的构件平面外包（淡墨线），在建的淡红
    for (const a of HZ.acts) { if (a.kind === 'untemp' || a.kind === 'milestone') continue; for (const p of a.parts) { if (!p.geo || !p.geo.min || p.st == null || t < p.st) continue;
      if (a.kind === 'temp' && a.rm && t >= a.rm.end) continue; const live = t < p.st + p.du;
      g.strokeStyle = live ? C.red3 : C.faint; g.lineWidth = 0.5; g.strokeRect(X(p.geo.min[0]), Y(p.geo.min[2]), (p.geo.max[0] - p.geo.min[0]) * k, (p.geo.max[2] - p.geo.min[2]) * k); } }
    // 塔吊：回转圈（虚线，半径 = 臂长 L）+ 塔身十字
    for (const T of s.tw) { const cx = X(T.x), cy = Y(T.z), erect = t < T.up || t >= T.dn;
      g.strokeStyle = erect ? C.temp : C.ink2; g.lineWidth = 0.8; g.setLineDash([4, 3]); g.beginPath(); g.arc(cx, cy, Math.max(0, T.L * k), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.lineWidth = 1.6; g.strokeStyle = erect ? C.temp : C.ink; g.beginPath(); g.moveTo(cx - 4, cy); g.lineTo(cx + 4, cy); g.moveTo(cx, cy - 4); g.lineTo(cx, cy + 4); g.stroke(); }
    // 履带吊：当天每一吊 站位 → 构件中心 的吊距线；每台画一个车身方块 + 该台最重一吊的 R 上限圈；超限的吊距线标红
    for (const c of s.crane) { const worst = c.lifts.slice().sort((a, b) => a.lim - b.lim)[0], over = c.lifts.some(l => l.over);
      g.strokeStyle = over ? C.red : C.line; g.lineWidth = over ? 0.9 : 0.6; g.setLineDash([2, 3]); g.beginPath(); g.arc(X(c.x), Y(c.z), Math.max(0, worst.lim * k), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      for (const l of c.lifts) { g.strokeStyle = l.over ? C.red : C.ink2; g.lineWidth = l.over ? 1.4 : 0.6; g.beginPath(); g.moveTo(X(l.x), Y(l.z)); g.lineTo(X(l.cx), Y(l.cz)); g.stroke();
        g.fillStyle = l.over ? C.red : C.ink2; g.beginPath(); g.arc(X(l.cx), Y(l.cz), 1.6, 0, 7); g.fill(); }
      const bw = Math.max(4, 7.2 * k), bh = Math.max(3, 5.6 * k); g.fillStyle = over ? C.red : C.ink; g.fillRect(X(c.x) - bw / 2, Y(c.z) - bh / 2, bw, bh); }
    g.restore();

    // 标注与可点
    s.tw.forEach(T => { if (!small) label(T.id, X(T.x) + 5, Y(T.z) - 7, C.ink2, { mono: true, fs: 9 });
      const r = Math.max(6, 3 * k); addHit(T.id, '塔吊 ' + T.id + '（' + T.name + '，臂长 ' + T.L + ' m）', [X(T.x) - r, Y(T.z) - r, 2 * r, 2 * r], [T.x - 1.3, -1, T.z - 1.3, T.x + 1.3, T.top, T.z + 1.3], clip); });
    // 文字只标超吊距的台和吊距最远的 6 台（同日履带吊可到 20 多台，全标会糊成一片）；每台都可点
    const farR = s.crane.map(c => Math.max(...c.lifts.map(l => l.R))).sort((a, b) => b - a)[Math.min(5, s.crane.length - 1)];
    s.crane.forEach((c, i) => { const worst = c.lifts.slice().sort((a, b) => b.R - a.R)[0], over = c.lifts.some(l => l.over), nm = 'C' + (i + 1), id = 'C@' + Math.round(c.x) + ',' + Math.round(c.z);   // 稳定 id 按站位（同日同站位归一台），显示序号 nm 随当日排序
      if (!small && (over || worst.R >= farR)) label(nm + ' ' + worst.key + ' R ' + Math.round(worst.R) + ' m' + (over ? ' 超' : ''), X(c.x) + 6, Y(c.z) + 8, over ? C.red : C.ink2, { fs: 9 });
      const r = Math.max(6, 4 * k), pb = worst.p.geo;
      addHit(id, '履带吊 ' + nm + ' · 吊「' + worst.name + '」R ' + Math.round(worst.R) + ' m，需 ' + worst.need.toFixed(1) + ' t / 额定 ' + worst.cap + ' t' + (over ? '（超吊距）' : ''), [X(c.x) - r, Y(c.z) - r, 2 * r, 2 * r],
        pb && pb.min ? [pb.min[0], pb.min[1], pb.min[2], pb.max[0], pb.max[1], pb.max[2]] : [c.x - 3.6, 0, c.z - 2.8, c.x + 3.6, 6, c.z + 2.8], clip); });
    if (!small) { label('北 ↑', pa.x1 - 2, pa.y0 - 6, C.ink3, { al: 'r' });
      const sb = 100 * k; g.strokeStyle = C.ink2; g.lineWidth = 1; g.beginPath(); g.moveTo(pa.x0, pa.y1 + 8); g.lineTo(pa.x0 + sb, pa.y1 + 8); g.stroke(); label('100 m', pa.x0 + sb + 4, pa.y1 + 8, C.ink3, {});
      label('虚线圈 = 吊得到的范围（塔吊臂长 / 履带吊最重一吊）· 红 = 够不着', pa.x0 + sb + 48, pa.y1 + 8, C.ink3, { fs: 9 }); }

    // 底部横条：每天在场台数（塔吊墨灰、履带吊墨黑叠加；有超吊距的天底下红点），竖线 = 当天
    if (stripH) {
      const sa = { x0: box.x0 + 10, y0: box.y1 - stripH, x1: box.x1 - 10, y1: box.y1 - 14 };
      g.strokeStyle = C.line; g.lineWidth = 0.6; g.beginPath(); g.moveTo(box.x0 + 6, sa.y0 - 8); g.lineTo(box.x1 - 6, sa.y0 - 8); g.stroke();
      const D = m.daily, nMax = Math.max(1, ...D.map(d => d.tw + d.cr)), [W0, W1] = m.win, sx = d => sa.x0 + (d - W0) / Math.max(1, W1 - W0) * (sa.x1 - sa.x0), hy = (sa.y1 - sa.y0 - 12) / nMax;
      for (const d of D) { const x = sx(d.d), bw = Math.max(0.6, (sa.x1 - sa.x0) / D.length);
        const ok = Math.min(d.cr, CAP);   // 履带吊贴底画（上限线量的是它），超上限那段画红，塔吊叠在上面
        g.fillStyle = C.ink2; g.fillRect(x, sa.y1 - ok * hy, bw, ok * hy);
        if (d.cr > CAP) { g.fillStyle = C.red; g.fillRect(x, sa.y1 - d.cr * hy, bw, (d.cr - CAP) * hy); }
        g.fillStyle = C.line; g.fillRect(x, sa.y1 - (d.cr + d.tw) * hy, bw, d.tw * hy);
        if (d.over) { g.fillStyle = C.red; g.fillRect(x, sa.y1 + 2, Math.max(1.5, bw), 3); } }
      g.strokeStyle = C.ink; g.lineWidth = 0.6; g.beginPath(); g.moveTo(sa.x0, sa.y1); g.lineTo(sa.x1, sa.y1); g.stroke();
      if (CAP <= nMax) { const yc = sa.y1 - CAP * hy; g.strokeStyle = C.red; g.lineWidth = 0.6; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(sa.x0, yc); g.lineTo(sa.x1, yc); g.stroke(); g.setLineDash([]);
        label('履带吊上限 ' + CAP + ' 台', sa.x1, yc - 5, C.red, { fs: 8, al: 'r' }); }
      const xt = sx(clamp(t, W0, W1)); g.strokeStyle = C.red; g.lineWidth = 1.2; g.beginPath(); g.moveTo(xt, sa.y0); g.lineTo(xt, sa.y1 + 6); g.stroke();
      label('每天在场吊机台数（深 = 履带吊，浅 = 塔吊，红 = 超上限或够不着）· 最多 ' + nMax + ' 台', sa.x0, sa.y0 + 2, C.ink3, { fs: 9 });
      label('第 ' + W0 + ' 天', sa.x0, sa.y1 + 9, C.ink3, { fs: 8, mono: true }); label('第 ' + W1 + ' 天', sa.x1, sa.y1 + 9, C.ink3, { fs: 8, mono: true, al: 'r' });
    }

    // 左栏：大数字
    const B = big(HZ, t), dayTxt = '第 ' + Math.floor(t) + ' 天' + (HZ.dayDate ? ' · ' + HZ.dayDate(t) : '');
    if (!small) {
      const colW = tall ? Math.round(BW * 0.48) : gut, FS = tall ? clamp(Math.round(BW / 15), 30, 48) : clamp(Math.round(gut / 4.2), 24, 40);
      let cx = box.x0 + 8;
      // 大数字只在宿主浮层显示（big()），图纸内不再重复（视觉评审 S-002 ②：一屏两个主数字）；左栏只放当天分项
      g.textBaseline = 'alphabetic'; let ly = box.y0 + 20; void FS;
      const wrap = (txt, col, fsz) => { g.font = `${fsz || 10}px ${SANS}`; g.fillStyle = col; let line0 = ''; for (const ch of String(txt).match(/\d[\d.,]*(?:\s?(?:m|t|台|吊|天|%))?|[A-Za-z]+|./g) || []) { if (line0 && g.measureText(line0 + ch).width > colW - 10) { g.fillText(line0, cx, ly); ly += (fsz || 10) + 4; line0 = ch.trimStart(); } else line0 += ch; } if (line0) { g.fillText(line0, cx, ly); ly += (fsz || 10) + 4; } };
      wrap(dayTxt, C.ink3, 10); ly += 2;
      if (tall) { cx = box.x0 + 8 + colW + 12; ly = box.y0 + 22; }
      const keys = {}; for (const l of s.live) { const q = keys[l.key] || (keys[l.key] = { n: 0, Rm: 0, over: 0, name: l.name.replace(/\s*拆除$/, '') }); q.n++; q.Rm = Math.max(q.Rm, l.R); if (l.over) q.over++; }
      const ks = Object.values(keys).sort((a, b) => b.over - a.over || b.n - a.n);
      if (ks.length) wrap('当天履带吊在吊', C.ink3, 10);
      for (const q of ks.slice(0, 4)) wrap('▸ ' + q.name + ' ' + q.n + ' 吊 · 最远 ' + Math.round(q.Rm) + ' m' + (q.over ? ' · ' + q.over + ' 超' : ''), q.over ? C.red : C.ink2, 10);
      ly += 4; wrap('全工期履带吊 ' + m.lifts.length + ' 吊，超吊距 ' + m.nOver + ' 吊（650 t 级装超起表）', m.nOver ? C.red : C.ink3, 8);
    } else {
      label(B.num + ' ' + B.unit + ' · ' + B.label, box.x0 + 6, box.y0 + 9, s.over ? C.red : C.ink, { b: true, fs: 11 });
    }

    const fh = ctx.focus && HITS.find(o => o.id === ctx.focus);
    if (fh) { g.save(); g.strokeStyle = '#f2b705'; g.lineWidth = 2.2; g.strokeRect(fh.hit[0] + 0.5, fh.hit[1] + 0.5, fh.hit[2] - 1, fh.hit[3] - 1); g.restore(); label(fh.label, fh.hit[0] + 2, Math.max(box.y0 + 8, fh.hit[1] - 7), C.yel, { b: true }); }
    return { state: s };
  }

  function nullCtx() { const noop = () => {}; return new Proxy({ measureText: s => ({ width: String(s).length * 6 }) }, { get: (o, k) => (k in o ? o[k] : noop), set: () => true }); }
  function parts(t, ctx) {
    if (!HITW || Math.abs(HITW.t - t) > 1e-9) draw(nullCtx(), HITW ? HITW.w : 760, HITW ? HITW.h : 420, t, Object.assign({}, ctx || {}, { focus: null }));
    return HITS.map(o => ({ id: o.id, label: o.label, hit: o.hit.slice(), box: o.box.slice() }));
  }

  // 镜头主体：这张图是全场资源图，主体 = 当天已开工的全部构筑工序（在建 + 已完工；吊机服务的就是它们）
  function subjKeys(HZ, t) { const ks = []; for (const a of HZ.acts) if (a.kind !== 'milestone' && a.kind !== 'untemp' && a.kind !== 'temp' && t >= a.start) ks.push(a.key); return ks; }
  // 镜头：每 10 天一帧，框住主体工序的构件外包（目标 = 外包中心，距离按 28° 视场让外包对角线约占画面），从东南高处俯看
  let CAM = null; const CRF = 0.62;   // 吊机外包对角线占画面比例系数（俯 50°，16:9）
  function cams(HZ) {
    const m = model(HZ); if (CAM && CAM.sig === m.sig) return CAM.k;
    const out = [], [W0, W1] = m.win;
    for (let t = W0; t <= W1 + 1e-9; t += 10) { const ks = new Set(subjKeys(HZ, t + 0.5)), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (const a of HZ.acts) if (ks.has(a.key)) for (const p of a.parts) if (p.geo && p.geo.min) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p.geo.min[i]); mx[i] = Math.max(mx[i], p.geo.max[i]); }
      // 这张图讲的是吊机：塔身与当天履带吊站位也要在画内（视觉评审 S-002 t=315：塔吊全在画外）。吊机外包单独算距离，取两者大者
      const st = stateAt(HZ, t + 0.5, m), cx0 = [1e9, 1e9], cx1 = [-1e9, -1e9], ct = [];
      for (const T of st.tw) ct.push([T.x, T.z]); for (const c of st.crane) ct.push([c.x, c.z]);
      for (const [x, z] of ct) { cx0[0] = Math.min(cx0[0], x); cx1[0] = Math.max(cx1[0], x); cx0[1] = Math.min(cx0[1], z); cx1[1] = Math.max(cx1[1], z); }
      const dCr = ct.length ? Math.hypot(cx1[0] - cx0[0], cx1[1] - cx0[1]) * CRF / Math.tan(14 * Math.PI / 180) / 2 : 0;
      if (mn[0] > mx[0]) { mn[0] = mn[2] = -200; mx[0] = mx[2] = 200; mn[1] = 0; mx[1] = 40; }
      if (ct.length) for (let i = 0; i < 2; i++) { const j = i * 2; mn[j] = Math.min(mn[j], cx0[i]); mx[j] = Math.max(mx[j], cx1[i]); }   // 目标取两者合包中心
      const tg = [(mn[0] + mx[0]) / 2, Math.max(2, (Math.max(0, mn[1]) + mx[1]) / 2), (mn[2] + mx[2]) / 2], dg = Math.hypot(mx[0] - mn[0], mx[2] - mn[2], Math.max(0, mx[1] - Math.max(0, mn[1])));
      out.push({ t, target: tg.map(v => Math.round(v)), az: 150, el: 50, dist: Math.round(clamp(Math.max(dg * 0.45 / Math.tan(14 * Math.PI / 180) / 2, dCr), 120, 1100)) }); }
    CAM = { sig: m.sig, k: out }; return out;
  }

  const plugin = {
    id: 'S-002', name: '吊装资源',
    scope: { keys: ['crane', 'ycrane', 'tcrane'], ids: [] },   // tcrane = D-25 内侧塔吊（11-09 落 hzseq）；D-35：履带吊站位盒不按 box 认件，免得把脚下楼板认进范围
    get window() { return model(G.HZ).win; },
    big: t => big(G.HZ, t),
    draw, parts,
    get cam() { return cams(G.HZ); },
    subject: t => subjKeys(G.HZ, t),
    model: () => model(G.HZ), stateAt: t => stateAt(G.HZ, t),
  };
  (G.HZ_SHEET_PLUGINS = G.HZ_SHEET_PLUGINS || []).push(plugin);
})(typeof window !== 'undefined' ? window : globalThis);
