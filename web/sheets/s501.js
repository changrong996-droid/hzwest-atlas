'use strict';
// ===== S-501 开通 · 站区总平面（北上、东右）+ 云门立面小样 · 插件模块（hark-liuzhijie）=====
// 收官一屏：云门（80 m）与雨棚上盖开发收尾 → 开通当天车站由中心向外一波亮灯（全图唯一的彩色时刻，城市保持墨线）
// → 首趟列车进站。
//
// 数据全部来自同一份排程，不另排：
//  · 云门 ymf / ym / ymc、云门塔吊 ycrane、上盖开发 tod、铺轨 trackS / trackN 的每个构件用自身 [st, st+du]、rm 画状态；
//  · 亮灯波与列车位置照抄 web/hzview.js setT() 的公式（波前半径 20 + 420·sm(OPEN−1, OPEN+5, t)，
//    列车 sm(OPEN+1, OPEN+24, t) 从 x = −1500 驶到车头停位 te），参数读 window.__pv.FV，读不到用 r3 终选默认值；
//  · 时间窗 [700, OPEN + 30] = ymf 开始 → 总时间轴末端（hzview timeline 的 FIN = 30）。
// 首趟车次 / 时刻（公开资料）：2022-09-22 9 时 52 分，G9528 次从杭州西站向湖州方向驶出
//  —— 新华网 2022-09-22（zj.news.cn/2022-09/22/c_1129024316.htm）；中新网 2022-09-22（chinanews.com.cn/sh/2022/09-22/9858490.shtml）。
//  首趟列车股道与停位跟随 hzview（联动 v2 起：湖杭场靠云谷第 1 股道 HZ.tracks(HZ.YARDS.S)[0]、车头进站台 FV.te = 99）。
(function (G) {
  const C = { paper: '#f6f2ea', ink: '#1d1a17', ink2: '#5d564c', ink3: '#948b7d', line: '#d4cbbb', red: '#b3202a', red3: '#f3dcd8', temp: '#c46a12', conc: '#cfc8bb',
    lit: '#f2a93b', lit2: 'rgba(242,169,59,.30)', lit3: '#fbe3b4', glass: '#7fa7c9' };
  const MONO = '"SF Mono","JetBrains Mono",Menlo,Consolas,"DejaVu Sans Mono","Noto Sans Mono CJK SC",monospace';
  const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };   // = hzview.js 的 sm
  // = hzview.js FV 默认：股道从 HZ 读（湖杭场靠云谷第 1 股道），停位 te = 99（车头 x = 111，整列在站台 ±stX 内）
  const FV0 = HZ => ({ tz: HZ.tracks && HZ.YARDS ? HZ.tracks(HZ.YARDS.S)[0] : 16.5, te: 99, tw: 1, lt: 4.5 });
  const FIRST = { no: 'G9528', time: '09:52', dir: '开通当天发车（向湖州方向）', src: '新华网 2022-09-22' };
  const TRAIN = { cars: 8, L: 25.5, gap: 0.8, nose: 12 };                                                  // = hzview.js trainGeo

  // 构件状态：-1 未建 / 0..1 在建 / 2 已建 / 3 已拆（同 hzsheet.js stOf）
  const stOf = (p, t) => { if (p.st == null || t < p.st) return -1; if (p.rm && p.rm[0] >= 0 && t >= p.rm[0]) return t >= p.rm[0] + p.rm[1] ? 3 : 2; return t < p.st + p.du ? (t - p.st) / p.du : 2; };

  const uBox = qs => qs.length ? { min: [0, 1, 2].map(i => Math.min(...qs.map(q => q.b.min[i]))), max: [0, 1, 2].map(i => Math.max(...qs.map(q => q.b.max[i]))) } : null;
  let M = null;
  function model(HZ) {
    const K = HZ.K, P = HZ.P, OPEN = P.OPEN, sig = [OPEN, K.ymf.start].concat(['ym', 'ymc', 'tod'].map(k => K[k].parts.map(p => p.st + ':' + p.du).join(','))).join('|');
    if (M && M.HZ === HZ && M.sig === sig) return M;
    const grab = keys => { const out = []; for (const k of keys) if (K[k]) for (const p of K[k].parts) if (p.geo && isFinite(p.geo.min[0])) out.push({ k, p, b: p.geo }); return out; };
    const ym = K.ym, ymTop = Math.max(...ym.parts.map(p => p.geo.max[1]));
    M = { HZ, sig, OPEN, win: [K.ymf.start, OPEN + 30],
      tracks: grab(['trackS', 'trackN']), plats: grab(['platS', 'platN']), ymParts: grab(['ymf', 'ym', 'ymc']), cranes: grab(['ycrane']), tod: grab(['tod']),
      roofBox: uBox(grab(['ring', 'clad', 'sky'])), ymTop, todTop: Math.max(...K.tod.parts.map(p => p.geo.max[1])) };
    return M;
  }
  const FVof = () => Object.assign(FV0(G.HZ), (G.__pv && G.__pv.FV) || {});
  // 亮灯波：返回 { on: 0..1 亮度, r: 波前半径 m（0 = 全亮或未亮）}
  function lightAt(HZ, t) { const O = HZ.P.OPEN, FV = FVof(), lw = sm(O - 1, O + 5, t); const on = FV.lt > 1.7 ? lw : sm(O - 6, O + 4, t); return { on, lw, r: FV.lt > 1.7 ? (lw >= 1 ? 0 : 20 + 420 * lw) : 0 }; }
  // 列车：车头 x、车尾 x、股道 z、是否可见（与 hzview.js 同式）
  function trainAt(HZ, t) { const O = HZ.P.OPEN, FV = FVof(), f = sm(O + 1, O + 24, t), tv = t > O + 0.5, len = TRAIN.cars * (TRAIN.L + TRAIN.gap);
    const tx = !tv ? 9000 : FV.tw ? -1500 + (1500 + FV.te) * (1 - Math.pow(1 - f, 2.2)) : 1500 - (1500 - FV.te) * (1 - Math.pow(1 - f, 2.2));
    // tw = 1：车体绕 Y 转 180°，车厢在 tx 西侧、车头鼻在 tx..tx+12 → 车头朝东
    const head = FV.tw ? tx + TRAIN.nose : tx - TRAIN.nose, tail = FV.tw ? tx - len : tx + len;
    return { vis: tv, head, tail, z: FV.tz === 0 ? 46.5 + 8 : FV.tz === 1 ? 112.5 + 8 : FV.tz, dir: FV.tw ? 1 : -1, f, stop: FV.te }; }

  function big(HZ, t) {
    const O = HZ.P.OPEN;
    if (t < O) return { num: Math.ceil(O - t - 1e-9), unit: '天', label: '距开通（' + HZ.dayDate(O) + '）' };
    return { num: FIRST.no, unit: '次', label: '首趟列车 · ' + FIRST.time + ' · ' + FIRST.dir };
  }

  function frame(g, w, h, tbo) {
    const tb = tbo && tbo.tb || 20;
    g.fillStyle = C.paper; g.fillRect(0, 0, w, h);
    g.strokeStyle = C.ink; g.lineWidth = 1; g.strokeRect(3.5, 3.5, w - 7, h - 7); g.lineWidth = 0.6; g.strokeRect(6.5, 6.5, w - 13, h - 13);
    const y = h - 6.5 - tb; g.beginPath(); g.moveTo(6.5, y); g.lineTo(w - 6.5, y); g.stroke();
    const nm = tbo ? (Array.isArray(tbo.name) ? tbo.name : [tbo.name, tbo.name]) : ['', ''];
    const fs = tb >= 20 ? 10 : 9, pad = 6; g.textBaseline = 'middle';
    const cells = [[String(tbo && tbo.no || ''), C.red, MONO, true], [nm[0], C.ink, SANS, true], [String(tbo && tbo.scale || ''), C.ink2, MONO], ['修订 r' + String(tbo && tbo.rev || 1).padStart(3, '0'), C.red, MONO], [String(tbo && tbo.date || ''), C.ink2, MONO], [String(tbo && tbo.chk || ''), tbo && tbo.chkOk ? '#2f7a3a' : C.red, MONO]];
    const wOf = c => { g.font = `${c[3] ? '600 ' : ''}${fs}px ${c[2]}`; return g.measureText(c[0]).width + pad * 2; };
    const ws = cells.map(wOf), keep = cells.map(() => true), avail = w - 13;
    for (const k of [4, 2, 5, 3, 1]) { if (ws.reduce((a, v, i) => a + (keep[i] ? v : 0), 0) <= avail) break; if (k === 1) { cells[1][0] = nm[1]; ws[1] = wOf(cells[1]); continue; } keep[k] = false; }
    const tot = ws.reduce((a, v, i) => a + (keep[i] ? v : 0), 0), extra = Math.max(0, avail - tot); let x = 6.5;
    cells.forEach((c, i) => { if (!keep[i]) return; const cw = ws[i] + (i === 1 ? extra : 0); g.font = `${c[3] ? '600 ' : ''}${fs}px ${c[2]}`; g.fillStyle = c[1]; let tx = c[0];
      while (g.measureText(tx).width > cw - pad * 2 && tx.length > 2) tx = tx.slice(0, -1);
      g.fillText(tx, x + pad, y + tb / 2 + 0.5); x += cw; if (x < w - 8) { g.strokeStyle = C.ink; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, h - 6.5); g.stroke(); } });
    return { x0: 8, y0: 8, x1: w - 8, y1: y - 2 };
  }

  // ---- 联动 v2：draw() 登记可点构件，parts() 返回最近一次绘制的登记 ----
  let HITS = [], HITW = null;
  function draw(g, w, h, t, ctx) {
    const HZ = G.HZ, P = HZ.P; ctx = ctx || {};
    HITS = []; HITW = { w, h, t };
    const addHit = (id, lbl, r, b) => { const pa0 = HITW.pa || [0, 0, w, h], x0 = Math.max(pa0[0], r[0]), y0 = Math.max(pa0[1], r[1]), x1 = Math.min(pa0[2], r[0] + r[2]), y1 = Math.min(pa0[3], r[1] + r[3]); if (x1 - x0 < 2 || y1 - y0 < 2 || !b.every(Number.isFinite)) return; HITS.push({ id, label: lbl, hit: [x0, y0, x1 - x0, y1 - y0], box: b }); };
    const PJ = (G.HZA && G.HZA.PROJECT) || HZ.PROJECT || 'HZW', no = PJ + '-S-501-1';
    const tbo = ctx.tb ? ctx.tb(w, h, no, ['开通 · 站区总平面 · 首趟列车路径', '开通 · 总平面'], t) : { tb: 20, no, name: '开通' };
    const box = frame(g, w, h, tbo), m = model(HZ), L = lightAt(HZ, t), T = trainAt(HZ, t);
    const labels = [];
    const label = (txt, x, y, col, o) => { o = o || {}; const fs = o.fs || 9; g.font = `${o.b ? '600 ' : ''}${fs}px ${o.mono ? MONO : SANS}`; const tw = g.measureText(txt).width, th = fs + 2;
      const lx = o.al === 'c' ? x - tw / 2 : o.al === 'r' ? x - tw : x, ly = y - th / 2;
      if (!(lx >= box.x0 && ly >= box.y0 && lx + tw <= box.x1 && ly + th <= box.y1)) return false;
      if (!labels.every(r => lx + tw < r[0] || lx > r[2] || ly + th < r[1] || ly > r[3])) return false;
      labels.push([lx - 1, ly, lx + tw + 1, ly + th]); g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = o.halo || C.paper; g.strokeText(txt, lx, y); g.fillStyle = col || C.ink; g.fillText(txt, lx, y); return true; };

    const bw = box.x1 - box.x0, bh = box.y1 - box.y0, small = bh < 220 || bw < 380;
    // 竖长条（D-08：右栏约 600×980、800×1200）：大数字改顶部横带（两列），总平面满宽，云门立面从角上小样放大成底部满宽
    const tall = !small && bh > bw * 1.15 && bh >= 460;
    const topH = tall ? Math.round(clamp(bh * 0.14, 110, 160)) : 0;
    const botH = tall ? Math.round(clamp(bh - topH - (bw - 10) - 10, 140, bh * 0.32)) : 0;
    const gut = small || tall ? 0 : clamp(bw * 0.2, 96, 150);
    const pa = { x0: box.x0 + gut + 6, y0: box.y0 + (small ? 28 : tall ? topH : 6), x1: box.x1 - 4, y1: box.y1 - 4 - botH };
    // 视窗：z ∈ [−300, 300]（围挡 ±280–300、云门南缘 240、塔吊 263），x 半宽按画幅比例，至少 ±300
    const pw = pa.x1 - pa.x0, ph = pa.y1 - pa.y0, zH = 300, xH = Math.max(300, zH * pw / ph), s = Math.min(pw / (2 * xH), ph / (2 * zH));
    const cx = (pa.x0 + pa.x1) / 2, cy = (pa.y0 + pa.y1) / 2, X = x => cx + x * s, Y = z => cy + z * s;   // 北上（z<0 在上）、东右
    const lit = (x, z) => (L.on <= 0 ? 0 : L.r > 0 ? clamp((L.r - Math.hypot(x, z)) / 30, 0, 1) : 1) * L.on;   // 同 hzview：hzSm(0, 30, uWave − |xz|)
    const rectXZ = (b, fill, stroke, lw) => { const x0 = X(b.min[0]), y0 = Y(b.min[2]), ww = Math.max(0.6, (b.max[0] - b.min[0]) * s), hh = Math.max(0.6, (b.max[2] - b.min[2]) * s); if (fill) { g.fillStyle = fill; g.fillRect(x0, y0, ww, hh); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 0.8; g.strokeRect(x0, y0, ww, hh); } };

    HITW.pa = [pa.x0, pa.y0, pa.x1, pa.y1];
    g.save(); g.beginPath(); g.rect(pa.x0, pa.y0, pw, ph); g.clip();
    // 城市（始终墨线）：围挡、外围道路、坐标网
    g.strokeStyle = C.line; g.lineWidth = 0.5; for (let x = -1400; x <= 1400; x += 100) { g.beginPath(); g.moveTo(X(x), pa.y0); g.lineTo(X(x), pa.y1); g.stroke(); } for (let z = -300; z <= 300; z += 100) { g.beginPath(); g.moveTo(pa.x0, Y(z)); g.lineTo(pa.x1, Y(z)); g.stroke(); }
    g.strokeStyle = C.ink3; g.lineWidth = 0.8; g.setLineDash([6, 4]); g.strokeRect(X(-700), Y(-280), 1400 * s, 560 * s); g.setLineDash([]);
    // 站房屋盖轮廓（HZ.R 极坐标，同 jack 平面）
    const roof = () => { g.beginPath(); for (let a = 0; a <= 96; a++) { const th = a / 96 * Math.PI * 2, r = HZ.R(th), xx = Math.cos(th) * r, zz = Math.sin(th) * r; a ? g.lineTo(X(xx), Y(zz)) : g.moveTo(X(xx), Y(zz)); } g.closePath(); };
    roof(); g.fillStyle = '#ebe4d6'; g.fill();
    if (L.on > 0) { g.save(); roof(); g.clip(); const rg = L.r > 0 ? L.r : 2000; g.beginPath(); g.arc(X(0), Y(0), rg * s, 0, Math.PI * 2); g.fillStyle = `rgba(242,169,59,${0.22 * L.on})`; g.fill(); g.restore(); }
    roof(); g.strokeStyle = C.ink; g.lineWidth = 1.1; g.stroke();
    // 站台（灰底）+ 股道（线）：铺轨按构件状态
    for (const q of m.plats) { const st = stOf(q.p, t); if (st === -1) continue; const k = lit((q.b.min[0] + q.b.max[0]) / 2, (q.b.min[2] + q.b.max[2]) / 2); rectXZ(q.b, k > 0.5 ? '#efe2c4' : 'rgba(207,200,187,.55)', null); }
    for (const q of m.tracks) { const st = stOf(q.p, t); if (st === -1 || st === 3) continue; const zc = (q.b.min[2] + q.b.max[2]) / 2; g.strokeStyle = st < 2 ? C.red : C.ink2; g.lineWidth = st < 2 ? 1 : 0.6;
      const x1 = st < 2 ? q.b.min[0] + (q.b.max[0] - q.b.min[0]) * st : q.b.max[0]; g.beginPath(); g.moveTo(X(q.b.min[0]), Y(zc)); g.lineTo(X(x1), Y(zc)); g.stroke(); }
    // 云谷（两场之间 28 m）
    g.strokeStyle = C.ink3; g.lineWidth = 0.6; g.setLineDash([3, 3]); for (const z of [-P.gap, P.gap]) { g.beginPath(); g.moveTo(X(-P.stX), Y(z)); g.lineTo(X(P.stX), Y(z)); g.stroke(); } g.setLineDash([]);
    // 上盖开发（四角）：按层构件逐层加深；在建层红框
    const corners = new Map(); for (const q of m.tod) { const key = Math.sign(q.b.min[0] + q.b.max[0]) + ',' + Math.sign(q.b.min[2] + q.b.max[2]); if (!corners.has(key)) corners.set(key, []); corners.get(key).push(q); }
    for (const list of corners.values()) { let done = 0, live = null; for (const q of list) { const st = stOf(q.p, t); if (st === 2) done++; else if (st >= 0 && st < 2) live = q; }
      const fr = done / list.length, b0 = list[0].b, cxz = [(b0.min[0] + b0.max[0]) / 2, (b0.min[2] + b0.max[2]) / 2], k = lit(cxz[0], cxz[1]);
      if (done || live) { rectXZ(b0, k > 0.5 ? `rgba(214,170,100,${0.16 + 0.2 * fr})` : `rgba(93,86,76,${0.12 + 0.38 * fr})`, C.ink, 0.9); if (live) rectXZ(live.b, null, C.red, 1.4); }
      else rectXZ(b0, null, C.ink3, 0.6); }
    // 云门：基础虚线 → 两腿逐段 → 横梁 → 幕墙双线
    const ymS = m.ymParts.map(q => ({ q, st: stOf(q.p, t) }));
    const ymBox = uBox(m.ymParts.filter(q => q.k === 'ym'));
    { const f = ymS.find(o => o.q.k === 'ymf'); if (f && f.st !== -1) { g.setLineDash([4, 3]); rectXZ(f.q.b, null, f.st < 2 ? C.red : C.ink3, 0.8); g.setLineDash([]); } }
    for (const o of ymS) { if (o.q.k !== 'ym' || o.st === -1) continue; const k = lit(0, 208); rectXZ(o.q.b, k > 0.5 ? 'rgba(214,170,100,.2)' : 'rgba(93,86,76,.13)', o.st < 2 ? C.red : C.ink, o.st < 2 ? 1.3 : 0.8); }
    for (const o of ymS) { if (o.q.k !== 'ymc' || o.st === -1) continue; const k = o.st >= 2 ? 1 : o.st; g.strokeStyle = C.glass; g.lineWidth = 1.6; const zc = o.q.b.min[2]; g.beginPath(); g.moveTo(X(o.q.b.min[0]), Y(zc)); g.lineTo(X(o.q.b.min[0] + (o.q.b.max[0] - o.q.b.min[0]) * k), Y(zc)); g.stroke(); }
    // 云门塔吊：十字 + 臂长圆（拆除后消失）
    for (const q of m.cranes) { const st = stOf(q.p, t); if (st === -1 || st === 3) continue; const x = X((q.b.min[0] + q.b.max[0]) / 2), y = Y((q.b.min[2] + q.b.max[2]) / 2);
      g.strokeStyle = C.temp; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke(); g.setLineDash([2, 3]); g.lineWidth = 0.6; g.beginPath(); g.arc(x, y, 55 * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    // 亮灯波前（开通前后 6 天）
    if (L.r > 0 && L.on > 0) { g.strokeStyle = C.lit; g.lineWidth = 2; g.beginPath(); g.arc(X(0), Y(0), L.r * s, 0, Math.PI * 2); g.stroke(); }
    // 首趟列车路径：开通前一周起用红色虚线 + 箭头预告；开通后列车本体（8 节，宽度至少 5 px）
    const showPath = t >= m.OPEN - 30;
    if (showPath) { g.strokeStyle = t >= m.OPEN ? C.ink3 : C.red; g.lineWidth = 1; g.setLineDash([8, 5]); g.beginPath(); g.moveTo(X(-1500 * T.dir), Y(T.z)); g.lineTo(X(T.stop + (T.dir > 0 ? TRAIN.nose : -TRAIN.nose)), Y(T.z)); g.stroke(); g.setLineDash([]);
      const ax = X(T.stop + T.dir * (TRAIN.nose + 2)), ay = Y(T.z); g.fillStyle = g.strokeStyle; g.beginPath(); g.moveTo(ax + T.dir * 7, ay); g.lineTo(ax - T.dir * 3, ay - 5); g.lineTo(ax - T.dir * 3, ay + 5); g.closePath(); g.fill(); }
    if (T.vis) { const th = Math.max(5, 3.4 * s), y = Y(T.z), xa = X(Math.min(T.head, T.tail)), xb = X(Math.max(T.head, T.tail));
      g.fillStyle = C.ink; g.fillRect(xa, y - th / 2, xb - xa, th);
      g.fillStyle = C.lit3; for (let k = 0; k < TRAIN.cars; k++) { const x0 = T.dir > 0 ? T.head - TRAIN.nose - (k + 1) * (TRAIN.L + TRAIN.gap) : T.head + TRAIN.nose + k * (TRAIN.L + TRAIN.gap); g.fillRect(X(x0 + 1.5), y - th * 0.18, Math.max(1, (TRAIN.L - 3) * s), th * 0.36); }
      g.fillStyle = C.red; g.beginPath(); g.moveTo(X(T.head), y); g.lineTo(X(T.head - T.dir * TRAIN.nose), y - th / 2); g.lineTo(X(T.head - T.dir * TRAIN.nose), y + th / 2); g.closePath(); g.fill(); }
    // 联动 v2：可点构件（图上框 + 3D 世界盒）
    { const rH = b => [X(b.min[0]), Y(b.min[2]), (b.max[0] - b.min[0]) * s, (b.max[2] - b.min[2]) * s], B6 = b => [b.min[0], b.min[1], b.min[2], b.max[0], Math.max(b.max[1], b.min[1] + 1), b.max[2]];
      if (m.roofBox) addHit('ROOF', '站房屋盖', rH(m.roofBox), B6(m.roofBox));
      for (const k of ['platS', 'platN']) { const qs = m.plats.filter(q => q.k === k && stOf(q.p, t) !== -1), b = uBox(qs); if (b) addHit(k === 'platS' ? 'PLAT-S' : 'PLAT-N', (k === 'platS' ? '湖杭场' : '杭临绩场') + '站台', rH(b), B6(b)); }
      const ymB = uBox(m.ymParts.filter(q => stOf(q.p, t) !== -1)); if (ymB) addHit('YM', '云门', rH(ymB), B6(ymB));
      for (const [key, list] of corners) { const on = list.filter(q => stOf(q.p, t) !== -1); if (!on.length) continue; const b = uBox(list), [sx, sz] = key.split(',').map(Number); addHit('TOD-' + (sz < 0 ? 'N' : 'S') + (sx < 0 ? 'W' : 'E'), '上盖开发 ' + (sz < 0 ? '北' : '南') + (sx < 0 ? '西' : '东'), rH(b), B6(uBox(on))); }
      if (T.vis) { const xa = Math.min(T.head, T.tail), xb = Math.max(T.head, T.tail), y0 = HZ.P.deckTop; addHit('TRAIN', '首趟列车 ' + FIRST.no, [X(xa), Y(T.z) - 5, (xb - xa) * s, 10], [xa, y0, T.z - 2, xb, y0 + 5, T.z + 2]); } }
    g.restore();

    // 标注
    if (!small) {
      label('湖杭场', X(-P.stX) + 4, Y(70), C.ink2); label('杭临绩场', X(-P.stX) + 4, Y(-62), C.ink2); label('云谷', X(P.stX) - 4, Y(0), C.ink3, { al: 'r' });
      label('云门 ' + Math.round(m.ymTop) + ' m', X(96), Y(208), C.ink, { b: true });
      label('上盖开发', X(160), Y(-122), C.ink2);
      if (showPath) label(t >= m.OPEN ? '首趟列车 ' + FIRST.no : '首趟列车路径', Math.max(pa.x0 + 4, X(-430)), Y(T.z) - 10, t >= m.OPEN ? C.temp : C.red, { b: true });
      // 指北针、100 m 比例尺、图例、建筑名称（D-21）
      { const nx = pa.x1 - 16, ny = pa.y0 + 26; g.strokeStyle = C.ink; g.fillStyle = C.ink; g.lineWidth = 1; g.beginPath(); g.arc(nx, ny, 9, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(nx, ny - 8); g.lineTo(nx - 3.5, ny + 4); g.lineTo(nx, ny + 1.5); g.lineTo(nx + 3.5, ny + 4); g.closePath(); g.fill(); label('N', nx, ny - 15, C.ink, { al: 'c', b: true, mono: true }); }
      { const sx = pa.x0 + 10, sy = pa.y1 - 10, L100 = 100 * s; g.strokeStyle = C.ink; g.fillStyle = C.ink; g.lineWidth = 1; g.beginPath(); g.moveTo(sx, sy - 4); g.lineTo(sx, sy); g.lineTo(sx + L100, sy); g.lineTo(sx + L100, sy - 4); g.stroke(); g.fillRect(sx, sy - 3, L100 / 2, 2); label('0', sx, sy - 10, C.ink3, { al: 'c', mono: true, fs: 8 }); label('100 m', sx + L100, sy - 10, C.ink3, { al: 'c', mono: true, fs: 8 }); }
      label('站房（屋盖）', X(0), Y(0), C.ink, { al: 'c', b: true });
      { let nc = 0; for (const list of corners.values()) { const b0 = uBox(list); if (nc++ < 4) label('配楼', X((b0.min[0] + b0.max[0]) / 2), Y((b0.min[2] + b0.max[2]) / 2), C.ink2, { al: 'c', fs: 8 }); } }
      if (!tall) { const lx = pa.x0 + 150, ly = pa.y1 - 30; g.save(); g.fillStyle = C.paper; g.fillRect(lx - 6, ly - 10, 96, 40); g.strokeStyle = C.line; g.lineWidth = 0.6; g.strokeRect(lx - 6, ly - 10, 96, 40);
        g.strokeStyle = C.red; g.lineWidth = 1.3; g.strokeRect(lx, ly - 4, 14, 6); g.strokeStyle = C.ink3; g.lineWidth = 1; g.setLineDash([5, 3]); g.beginPath(); g.moveTo(lx, ly + 14); g.lineTo(lx + 14, ly + 14); g.stroke(); g.restore();
        label('在建', lx + 20, ly - 1, C.ink2, { fs: 8 }); label('列车路径', lx + 20, ly + 14, C.ink2, { fs: 8 }); }
    }
    // 云门立面小样（右下角，向北看）：两腿 → 横梁到 80 m，在建段红；亮灯后暖色
    if (!small) { const iw = tall ? bw - 30 : clamp(pw * 0.2, 70, 120), ih = tall ? botH - 22 : iw * 0.62, ix = tall ? box.x0 + 15 : pa.x1 - iw - 6, iy = tall ? box.y1 - botH + 16 : pa.y1 - ih - 6, k = tall ? Math.min(iw / 200, (ih - 10) / 80) : iw / 200, base = iy + ih - 6, lx = v => ix + iw / 2 + v * k, ly = v => base - v * k * 0.9;
      g.fillStyle = C.paper; g.fillRect(ix - 3, iy - 12, iw + 6, ih + 15); g.strokeStyle = C.ink3; g.lineWidth = 0.6; g.strokeRect(ix - 3, iy - 12, iw + 6, ih + 15);
      label('云门立面', ix, iy - 5, C.ink3, { fs: 8 });
      g.strokeStyle = C.ink2; g.lineWidth = 0.8; g.beginPath(); g.moveTo(ix, base); g.lineTo(ix + iw, base); g.stroke();
      let hNow = 0; for (const o of ymS) { if (o.q.k !== 'ym' || o.st === -1) continue; const b = o.q.b, f = o.st >= 2 ? 1 : o.st, y1 = b.min[1] + (b.max[1] - b.min[1]) * f; hNow = Math.max(hNow, y1);
        g.fillStyle = lit(0, 208) > 0.5 ? 'rgba(242,169,59,.6)' : o.st < 2 ? C.red3 : C.conc; g.fillRect(lx(b.min[0]), ly(y1), (b.max[0] - b.min[0]) * k, (y1 - b.min[1]) * k * 0.9);
        g.strokeStyle = o.st < 2 ? C.red : C.ink; g.lineWidth = 0.7; g.strokeRect(lx(b.min[0]), ly(y1), (b.max[0] - b.min[0]) * k, (y1 - b.min[1]) * k * 0.9); }
      const cw = ymS.filter(o => o.q.k === 'ymc' && o.st !== -1); if (cw.length) { const f = Math.min(...cw.map(o => (o.st >= 2 ? 1 : o.st))); g.strokeStyle = C.glass; g.lineWidth = 1.2; g.strokeRect(lx(-89), ly(2 + 76 * f), 178 * k, 76 * f * k * 0.9); }
      if (hNow > 0) label(Math.round(hNow) + ' m', lx(92) + 3, ly(hNow), C.ink, { mono: true, b: true, fs: 9 }); }

    // 大数字栏
    const B = big(HZ, t), dayTxt = '第 ' + Math.round(t) + ' 天 · ' + HZ.dayDate(t);
    const cur = []; for (const k of ['ymf', 'ym', 'ymc', 'tod', 'ycrane']) { const A = HZ.K[k]; if (A && t >= A.start && t < A.end) cur.push(A.name); }
    if (t >= m.OPEN - 1 && t < m.OPEN + 5) cur.unshift('亮灯：由中心向外'); if (T.vis && T.f < 1) cur.unshift('首趟列车进站');
    if (!small) {
      const colW = tall ? Math.round(bw * 0.48) : gut; let x0 = box.x0 + 8; const num = String(B.num), FS = tall ? clamp(Math.round(bw / 14), 30, 52) : clamp(Math.round(gut / (num.length > 3 ? 3.9 : 3.0)), 24, 48);
      g.textBaseline = 'alphabetic'; g.fillStyle = t >= m.OPEN ? C.temp : C.ink; g.font = `600 ${FS}px ${MONO}`; g.fillText(num, x0, box.y0 + 12 + FS);
      const nw = g.measureText(num).width; g.font = `600 ${Math.round(FS * 0.36)}px ${t >= m.OPEN ? MONO : SANS}`; g.fillStyle = C.ink2;
      if (nw + 4 + g.measureText(B.unit).width < colW) g.fillText(B.unit, x0 + nw + 4, box.y0 + 12 + FS); else g.fillText(B.unit, x0, box.y0 + 28 + FS);
      let ly = box.y0 + (nw + 4 + g.measureText(B.unit).width < colW ? 30 : 46) + FS;
      const wrap = (txt, col, fsz) => { g.font = `${fsz || 10}px ${SANS}`; g.fillStyle = col; let l0 = ''; for (const ch of txt) { if (g.measureText(l0 + ch).width > colW - 6) { g.fillText(l0, x0, ly); ly += (fsz || 10) + 4; l0 = ch; } else l0 += ch; } if (l0) { g.fillText(l0, x0, ly); ly += (fsz || 10) + 6; } };
      wrap(B.label, C.ink2); if (t >= m.OPEN) wrap('来源：' + FIRST.src, C.ink3, 8); wrap(dayTxt, C.ink3, 9); ly += 4;
      if (tall) { x0 = box.x0 + 8 + colW + 12; ly = box.y0 + 22; }
      for (const n of cur.slice(0, 3)) wrap('▸ ' + n, C.red, 10);
    } else {
      label(B.num + ' ' + B.unit, box.x0 + 6, box.y0 + 9, t >= m.OPEN ? C.temp : C.ink, { b: true, fs: 12 });
      if (cur[0]) label(cur[0], box.x0 + 6, box.y0 + 22, C.red, { fs: 9 });
    }
    const fh = ctx.focus && HITS.find(o => o.id === ctx.focus);
    if (fh) { g.save(); g.strokeStyle = '#f2b705'; g.lineWidth = 2.2; g.strokeRect(fh.hit[0] + 0.5, fh.hit[1] + 0.5, fh.hit[2] - 1, fh.hit[3] - 1); g.restore(); label(fh.label, fh.hit[0] + 2, Math.max(box.y0 + 8, fh.hit[1] - 7), '#8a6a00', { b: true }); }
    return {};
  }
  function parts(t, ctx) {
    if (!HITW || Math.abs(HITW.t - t) > 1e-9) { const W = HITW ? HITW.w : 760, H = HITW ? HITW.h : 420; draw(nullCtx(), W, H, t, Object.assign({}, ctx || {}, { focus: null })); }
    return HITS.map(o => ({ id: o.id, label: o.label, hit: o.hit.slice(), box: o.box.slice() }));
  }
  function nullCtx() { const noop = () => {}; return new Proxy({ measureText: s => ({ width: String(s).length * 6 }), setLineDash: noop }, { get: (o, k) => (k in o ? o[k] : noop), set: () => true }); }

  // 镜头（米、度；az −40 = 西北、120 = 东南，同 hzview placeCam）：先从南看云门长高（目标放在云门南面外侧，幕墙封上后不被挡），
  // 再升高俯看屋盖与四角上盖。开通段（D-09，委托人 2026-11-08 定）：西南低角度看站房西端与露天进站段，云门在画面右侧；
  // 后三帧不写死——由首趟列车位置（trainAt，读 __pv.FV）、屋盖西缘与股道 z 推出：
  //   tA = 车头驶上模型西端股道，tIn = 车头进屋盖，tStop = 车头停稳（距停位 < 1 m）。
  // 验收（evalend 抽样）：开通段 1099–1131 列车可见 20 天 ≥ 一半，其间云门同框；插件镜头扫描 0 违规。
  const CAM0 = [
    { t: 700, target: [0, 20, 248], az: 160, el: 14, dist: 480 },
    { t: 865, target: [0, 40, 248], az: 150, el: 10, dist: 380 },
    { t: 1015, target: [0, 40, 248], az: 150, el: 14, dist: 460 },
    { t: 1050, target: [0, 58, 40], az: 135, el: 22, dist: 800 },
    { t: 1099, target: [0, 40, 20], az: -130, el: 16, dist: 700 },
  ];
  let CK = null;
  function camKeys(HZ) {
    if (!HZ || !HZ.K || !HZ.K.ring || !HZ.K.ring.parts.some(p => p.geo)) return CAM0;
    const m = model(HZ), FV = FVof(), sig = m.sig + '|' + [FV.tz, FV.te, FV.tw].join(',');
    if (CK && CK.sig === sig) return CK.keys;
    const O = m.OPEN, dy = HZ.P.deckTop, rx = m.roofBox.min[0], tx0 = Math.min(...m.tracks.map(q => q.b.min[0]));
    const when = f => { for (let t = O + 0.5; t <= O + 30; t += 0.25) { const q = trainAt(HZ, t); if (q.vis && f(q)) return t; } return O + 24; };
    const z = trainAt(HZ, O + 30).z, r1 = v => Math.round(v * 10) / 10;
    const tA = when(q => q.head >= tx0), tIn = Math.max(tA + 2, when(q => q.head >= rx)), tStop = Math.max(tIn + 3, when(q => Math.abs(q.head - (q.stop + TRAIN.nose)) < 1));
    const keys = CAM0.concat([
      { t: O, target: [r1(rx - 60), 30, r1(z + 74)], az: -125, el: 8, dist: 560 },                // 亮灯：站房西端 + 云门
      { t: tA, target: [r1(rx - 200), r1(dy + 4.5), r1(z + 40)], az: -112, el: 4, dist: 440 },  // 列车驶上露天进站段
      { t: tIn, target: [r1(rx - 70), r1(dy + 3.5), r1(z + 20)], az: -100, el: 2, dist: 420 },  // 车头进屋盖
      { t: tStop, target: [r1(rx - 28), r1(dy + 7.5), r1(z + 28.5)], az: -95, el: 1, dist: 380 }, // 停稳：雨棚下看整列
      { t: O + 30, target: [r1(rx - 28), r1(dy + 7.5), r1(z + 28.5)], az: -95, el: 1, dist: 360 }, // 缓推到站房西端
    ].map(k => Object.assign(k, { t: r1(k.t) })));
    CK = { sig, keys }; return keys;
  }

  const plugin = {
    id: 'S-501', name: '开通',
    window: [700, 1131],                 // = [K.ymf.start, OPEN + 30]（check_s501 断言）
    // 时间轴分段（hzview 读 segs）：云门、上盖、亮灯与首趟列车（高亮）
    segs: [['云门', 700, 1015], ['上盖开发', 1015, 1050], ['收尾', 1050, 1099], ['开通', 1099, 1131, 1]],
    big: t => big(G.HZ, t),
    draw, parts,
    // 镜头主体（tools/hz/check_cams.js 读）：开通前两周以前用默认；开通时刻的主体是整座车站与首趟列车所在股道
    subject: t => t < (G.HZ ? G.HZ.P.OPEN : 1101) - 14 ? null : ['ym', 'ymc', 'tod', 'clad', 'sky', 'ring', 'platS', 'platN', 'canopyS', 'canopyN', 'trackS', 'trackN'],
    // 镜头：见上方 camKeys（开通段由首趟列车位置推算）
    get cam() { return camKeys(G.HZ); },

    model: () => model(G.HZ), lightAt: t => lightAt(G.HZ, t), trainAt: t => trainAt(G.HZ, t), stOf, FIRST,
  };
  (G.HZ_SHEET_PLUGINS = G.HZ_SHEET_PLUGINS || []).push(plugin);
})(typeof window !== 'undefined' ? window : globalThis);
