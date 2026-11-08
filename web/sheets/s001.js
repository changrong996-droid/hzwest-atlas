'use strict';
// ===== S-001 总进度 · 全部工序横道图（与 3D 时间轴同步）· 插件模块（hark-cs）=====
// 给四张分图一个总入口：一眼看到「今天在做哪几道工序、哪道卡着开通」，点一根横道 → 3D 飞到这道工序的构件。
//
// 数据全部来自同一份排程（改 HZ 图跟着变）：
//  · 一行 = HZ.K 里的一道工序（kind ≠ 拆除）；它的拆除工序（key 以 ~rm 结尾、of 指回本工序）画在同一行末尾，斜线填充；
//  · 横道起止 = 工序自身 start / end；行序 = 开工先后；
//  · 关键链 = 顺着排程记录的「被谁卡住」（a.by）往回走，最长的一串，画粗线；
//  · 3D 盒 = 工序自身 bb；没有实体的工序（如提升、光伏）借最近一道有实体的前置工序的盒。
// 大数字：今天在施工的工序数（含拆除）。
(function (G) {
  const C = { paper: '#f6f2ea', ink: '#1d1a17', ink2: '#5d564c', ink3: '#948b7d', line: '#d4cbbb', faint: '#e4dccd', red: '#b3202a', red2: '#f0c9c4', ghost: 'rgba(179,32,42,.28)', ok: '#3d6b3a', yel: '#e0a800' };
  const MONO = '"SF Mono","JetBrains Mono",Menlo,Consolas,"DejaVu Sans Mono","Noto Sans Mono CJK SC",monospace';
  const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif';
  const proj = () => (G.HZA && G.HZA.PROJECT) || 'HZW';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- 数据：从 HZ.K 推导，排程一变签名就变、自动重算 ----------
  let M = null;
  function model() {
    const HZ = G.HZ, K = HZ.K, all = Object.values(K);
    const sig = all.map(a => a.key + ':' + a.start + ':' + a.end).join('|');
    if (M && M.HZ === HZ && M.sig === sig) return M;
    const rmOf = new Map(); for (const a of all) if (a.of && /~rm$/.test(a.key)) rmOf.set(a.of.key || a.of, a);
    const boxOf = (a, seen) => {
      if (a.bb && a.bb.min) return [a.bb.min[0], a.bb.min[1], a.bb.min[2], a.bb.max[0], a.bb.max[1], a.bb.max[2]];
      seen = seen || new Set(); seen.add(a.key);
      const ps = (a.pred || []).map(p => p.a).filter(b => b && !seen.has(b.key)).sort((x, y) => y.end - x.end);
      for (const b of ps) { const r = boxOf(b, seen); if (r) return r; }
      return null;
    };
    const rows = all.filter(a => !/~rm$/.test(a.key)).sort((a, b) => a.start - b.start || a.end - b.end || a.ix - b.ix).map((a, i) => {
      const rm = rmOf.get(a.key) || null, box = boxOf(a);
      return { i, a, key: a.key, id: 'K-' + a.key, name: a.name, cap: a.cap || '', st: a.start, en: a.end, rm, rst: rm ? rm.start : null, ren: rm ? rm.end : null, box, borrowed: !(a.bb && a.bb.min) };
    });
    // 关键链：排程给每道工序记了「被谁卡住」（a.by：前置工序或资源）。顺着 by 往回走，最长的那一串就是主线——
    // 链上任何一道拖一天，后面一串都晚一天。开通日期本身是定的（release），所以不从开通往回找。
    const back = a => { const out = []; const seen = new Set(); for (let c = a; c && !seen.has(c.key); c = c.by) { seen.add(c.key); out.push(/~rm$/.test(c.key) && c.of ? (c.of.key || c.of) : c.key); } return out; };
    let best = []; for (const a of all) { const c = back(a); if (c.length > best.length) best = c; }
    const chain = new Set(best);
    const t0 = Math.min(...all.map(a => a.start)), t1 = Math.max(...all.map(a => a.end));
    M = { HZ, sig, rows, chain, t0, t1, byId: new Map(rows.map(r => [r.id, r])) };
    return M;
  }
  const live = (r, t) => (t >= r.st && t < r.en) || (r.rm && t >= r.rst && t < r.ren);
  const stateOf = (r, t) => (t < r.st ? 0 : t < r.en ? 1 : r.rm && t >= r.rst && t < r.ren ? 3 : 2);
  const STN = ['未开始', '在做', '已完成', '在拆除'];
  function stats(t) {
    const m = model(), now = m.rows.filter(r => live(r, t));
    return { live: now.length, names: now.map(r => r.name), done: m.rows.filter(r => t >= r.en).length, total: m.rows.length, toOpen: Math.max(0, Math.ceil(G.HZ.K.open ? G.HZ.K.open.start - t : 0)) };
  }

  // ---------- 版面：左列工序名、右侧时间轴 ----------
  let LAY = null;
  function layout(w, h, tb) {
    const m = model(), x0 = 10, x1 = w - 10, y0 = 24, y1 = h - 6.5 - tb - 34, n = m.rows.length;
    const rh = (y1 - y0) / n, showName = rh >= 8.5 && w >= 300, lw = showName ? clamp(w * 0.34, 96, 210) : 0;
    const ax0 = x0 + lw + 4, ax1 = x1 - 4, span = Math.max(1, m.t1 - m.t0);
    const X = d => ax0 + (d - m.t0) / span * (ax1 - ax0), Y = i => y0 + i * rh;
    return { w, h, tb, x0, x1, y0, y1, rh, lw, ax0, ax1, X, Y, showName };
  }
  function hitOf(r, L) { return [L.x0, L.Y(r.i), L.x1 - L.x0, Math.max(1, L.rh)]; }
  function info(r, t) {
    const HZ = G.HZ, m = model(), k = stateOf(r, t);
    const pre = (r.a.pred || []).map(p => p.a && p.a.name).filter(Boolean).slice(0, 3).join('、') || '—';
    const rows = [
      ['工序', r.name],
      ['状态', STN[k] + ' · ' + HZ.dayDate(t)],
      ['工期', HZ.dayDate(r.st) + ' → ' + HZ.dayDate(r.en) + `（${Math.round(r.en - r.st)} 天，推算）`],
      ['前置', pre],
    ];
    if (r.rm) rows.push(['拆除', HZ.dayDate(r.rst) + ' → ' + HZ.dayDate(r.ren)]);
    rows.push(['关键链', m.chain.has(r.key) ? '是：它拖一天，后面一串都晚一天' : '否']);
    if (r.borrowed) rows.push(['3D', '本工序无独立实体，镜头对准它所在的构件']);
    return rows;
  }
  function parts(t, ctx) {
    const L = (ctx && ctx.w && ctx.h) ? layout(ctx.w, ctx.h, LAY && LAY.w === ctx.w && LAY.h === ctx.h ? LAY.tb : 20) : LAY || layout(600, 420, 20);
    return model().rows.filter(r => r.box).map(r => ({ id: r.id, label: r.name, kind: 'act', state: stateOf(r, t), hit: hitOf(r, L), box: r.box.slice(), info: info(r, t) }));
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
  const fit = (g, s, wmax) => { if (g.measureText(s).width <= wmax) return s; while (s.length > 1 && g.measureText(s + '…').width > wmax) s = s.slice(0, -1); return s + '…'; };

  // ---------- 图纸 ----------
  function draw(g, w, h, t, ctx) {
    const HZ = G.HZ, m = model(); labels.length = 0;
    const tbo = ctx.tb(w, h, proj() + '-S-001-1', ['总进度横道图 · 全部工序 · 粗线 = 关键链', '总进度横道图'], t);
    const box = frame(g, w, h, tbo), L = layout(w, h, tbo.tb || 20); LAY = L;
    if (typeof ctx.setScale === 'function') ctx.setScale(1);
    const { X, Y, rh } = L, bh = Math.max(1.2, Math.min(rh * 0.62, 9)), st = stats(t);

    // 年份格线（年份字写在顶行，先让「今天」的日期占位）
    const yrs = [];
    const y0d = HZ.dayDate(m.t0), yr0 = +String(y0d).slice(0, 4);
    g.font = `8.5px ${MONO}`;
    for (let yr = yr0; yr <= yr0 + 4; yr++) for (const mo of [1, 7]) {
      // 找该年月 1 日对应的天数（二分 dayDate）
      const want = `${yr}-${String(mo).padStart(2, '0')}-01`; let lo = m.t0 - 400, hi = m.t1 + 400;
      for (let k = 0; k < 40; k++) { const md = (lo + hi) / 2; if (String(HZ.dayDate(md)) < want) lo = md; else hi = md; }
      if (hi < m.t0 || hi > m.t1) continue; const x = X(hi);
      g.strokeStyle = mo === 1 ? C.line : C.faint; g.lineWidth = mo === 1 ? 0.8 : 0.5; g.beginPath(); g.moveTo(x, L.y0 - 2); g.lineTo(x, L.y1); g.stroke();
      if (mo === 1) yrs.push([String(yr), x]);
    }
    // 关键链连线（前一道结束 → 后一道开始的竖折线）
    // 横道
    const fp = ctx.focus ? m.byId.get(ctx.focus) : null;
    for (const r of m.rows) {
      const y = Y(r.i) + rh / 2, k = stateOf(r, t), crit = m.chain.has(r.key), xa = X(r.st), xb = Math.max(X(r.en), xa + 1.5);
      if (fp === r) { g.fillStyle = 'rgba(240,190,20,.28)'; g.fillRect(L.x0, Y(r.i), L.x1 - L.x0, rh); }
      else if (k === 1 || k === 3) { g.fillStyle = 'rgba(179,32,42,.07)'; g.fillRect(L.x0, Y(r.i), L.x1 - L.x0, rh); }
      const hb = crit ? bh : bh * 0.7;
      if (k === 0) { g.strokeStyle = C.ghost; g.lineWidth = crit ? 1.2 : 0.7; g.strokeRect(xa, y - hb / 2, xb - xa, hb); }
      else { const xn = k === 1 ? xa + (xb - xa) * clamp((t - r.st) / Math.max(1e-3, r.en - r.st), 0, 1) : xb;
        g.fillStyle = C.ink; g.fillRect(xa, y - hb / 2, xn - xa, hb);
        if (k === 1) { g.fillStyle = C.red; g.fillRect(xn - 1, y - hb / 2 - 1, 2, hb + 2); g.strokeStyle = C.red; g.lineWidth = 0.8; g.strokeRect(xa, y - hb / 2, xb - xa, hb); } }
      if (crit) { g.strokeStyle = k === 0 ? C.red : C.ink; g.lineWidth = 1.4; g.beginPath(); g.moveTo(xa, y + hb / 2 + 1.2); g.lineTo(xb, y + hb / 2 + 1.2); g.stroke(); }
      if (r.rm) { const ra = X(r.rst), rb = Math.max(X(r.ren), ra + 1.5); g.strokeStyle = t >= r.rst ? C.ink2 : C.ghost; g.lineWidth = 0.6; g.strokeRect(ra, y - hb / 2, rb - ra, hb);
        g.beginPath(); for (let x = ra; x < rb; x += 3) { g.moveTo(x, y + hb / 2); g.lineTo(Math.min(rb, x + hb), y - hb / 2); } g.stroke(); }
      if (L.showName) { const fs = clamp(rh * 0.72, 8, 10.5); g.font = `${k === 1 || k === 3 || crit ? '600 ' : ''}${fs}px ${SANS}`; g.textBaseline = 'middle';
        g.fillStyle = k === 1 || k === 3 ? C.red : k === 0 ? C.ink3 : C.ink; g.fillText(fit(g, r.name, L.lw - 2), L.x0 + 2, y + 0.5); }
    }
    if (fp) { const hb = hitOf(fp, L); g.strokeStyle = C.yel; g.lineWidth = 2; g.strokeRect(hb[0], hb[1], hb[2], hb[3]); }
    // 今天
    const xt = X(clamp(t, m.t0, m.t1));
    g.strokeStyle = C.red; g.lineWidth = 1.2; g.beginPath(); g.moveTo(xt, L.y0 - 4); g.lineTo(xt, L.y1 + 2); g.stroke();
    label(g, String(HZ.dayDate(t)), xt + (xt > L.ax1 - 70 ? -3 : 3), L.y0 - 9, C.red, box, { fs: 8.5, b: true, al: xt > L.ax1 - 70 ? 'r' : 'l' });
    for (const [yt, x] of yrs) label(g, yt, x + 2, L.y1 + 8, C.ink3, box, { fs: 8.5 });
    // 没有工序名列（横栏矮）时：在做的工序把名字写在横道右侧
    if (!L.showName) for (const r of (fp ? [fp] : []).concat(m.rows.filter(q => q !== fp))) if (live(r, t) || fp === r) { const y = Y(r.i) + rh / 2, xe = Math.max(X(r.en), r.rm && t >= r.rst ? X(r.ren) : 0);
      g.font = `600 8.5px ${SANS}`; const nm = fit(g, r.name, 150), col = fp === r ? '#8a6400' : C.red, o = { fs: 8.5, sans: true, b: true };
      if (!label(g, nm, xe + 4, y, col, box, o)) label(g, nm, X(r.st) - 4, y, col, box, Object.assign({ al: 'r' }, o)); }
    // 现状一行 + 图例
    const now = st.live ? `今天在做 ${st.live} 道：` + st.names.slice(0, 2).join('、') + (st.live > 2 ? ' 等' : '') : (t >= m.t1 ? '全部工序完成 · 开通' : '今天无工序在做');
    g.font = `600 9.5px ${SANS}`; label(g, fit(g, now, (box.x1 - box.x0) * 0.62), box.x0 + 4, box.y0 + 7, C.ink, box, { b: true, fs: 9.5, sans: true });
    const lg = [['已完成', 'done'], ['在做', 'live'], ['未开始', 'todo'], ['关键链', 'crit'], ['拆除', 'rm']];
    g.font = `8.5px ${SANS}`; let lx = box.x0 + 4; const ly = box.y1 - 6;
    for (const [n, c] of lg) { const tw = g.measureText(n).width; if (lx + 16 + tw > box.x1 - 4) break;
      if (c === 'done') { g.fillStyle = C.ink; g.fillRect(lx, ly - 3, 12, 6); } else if (c === 'live') { g.strokeStyle = C.red; g.lineWidth = 0.8; g.strokeRect(lx, ly - 3, 12, 6); g.fillStyle = C.ink; g.fillRect(lx, ly - 3, 6, 6); }
      else if (c === 'todo') { g.strokeStyle = C.ghost; g.lineWidth = 0.8; g.strokeRect(lx, ly - 3, 12, 6); } else if (c === 'crit') { g.strokeStyle = C.ink; g.lineWidth = 1.4; g.beginPath(); g.moveTo(lx, ly + 2); g.lineTo(lx + 12, ly + 2); g.stroke(); }
      else { g.strokeStyle = C.ink2; g.lineWidth = 0.6; g.strokeRect(lx, ly - 3, 12, 6); g.beginPath(); for (let x = lx; x < lx + 12; x += 3) { g.moveTo(x, ly + 3); g.lineTo(Math.min(lx + 12, x + 6), ly - 3); } g.stroke(); }
      g.fillStyle = C.ink2; g.textBaseline = 'middle'; g.fillText(n, lx + 15, ly); lx += 15 + tw + 10; }
    return st;
  }

  const plugin = {
    id: 'S-001', name: '总进度', sheet: 'S-001-1', title: '总进度横道图', owner: 'hark-cs',
    get window() { const m = model(); return [m.t0, m.t1]; },
    big: t => ({ num: stats(t).live, unit: '道', label: '今天在施工序' }),
    draw, stats, parts,
    chain: () => [...model().chain],
    // 镜头：全程绕全站一圈的高位总览（米、度），不进地、不贴近
    cam: [
      { t: 0, target: [0, 0, 0], az: 210, el: 48, dist: 900 },
      { t: 365, target: [0, 10, 0], az: 240, el: 42, dist: 860 },
      { t: 632, target: [0, 30, 0], az: 300, el: 40, dist: 820 },
      { t: 781, target: [0, 35, 0], az: 340, el: 38, dist: 800 },
      { t: 1101, target: [0, 25, 0], az: 30, el: 30, dist: 850 },
    ],
  };
  (G.HZ_SHEET_PLUGINS = G.HZ_SHEET_PLUGINS || []).push(plugin);
})(typeof window !== 'undefined' ? window : globalThis);
