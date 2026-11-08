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
//  注：3D 结尾画的是「进站」（北场 z = −98.5、从西驶入），本图随 3D 画同一条路径；真实首趟为湖杭场驶出，已在提交说明里告知集成人。
(function (G) {
  const C = { paper: '#f6f2ea', ink: '#1d1a17', ink2: '#5d564c', ink3: '#948b7d', line: '#d4cbbb', red: '#b3202a', red3: '#f3dcd8', temp: '#c46a12', conc: '#cfc8bb',
    lit: '#f2a93b', lit2: 'rgba(242,169,59,.30)', lit3: '#fbe3b4', glass: '#7fa7c9' };
  const MONO = '"SF Mono","JetBrains Mono",Menlo,Consolas,"DejaVu Sans Mono","Noto Sans Mono CJK SC",monospace';
  const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };   // = hzview.js 的 sm
  const FV0 = { tz: -98.5, te: -240, tw: 1, lt: 4.5 };                                                    // = hzview.js FV 默认（r3 终选）
  const FIRST = { no: 'G9528', time: '09:52', dir: '开通当天发车（向湖州方向）', src: '新华网 2022-09-22' };
  const TRAIN = { cars: 8, L: 25.5, gap: 0.8, nose: 12 };                                                  // = hzview.js trainGeo

  // 构件状态：-1 未建 / 0..1 在建 / 2 已建 / 3 已拆（同 hzsheet.js stOf）
  const stOf = (p, t) => { if (p.st == null || t < p.st) return -1; if (p.rm && p.rm[0] >= 0 && t >= p.rm[0]) return t >= p.rm[0] + p.rm[1] ? 3 : 2; return t < p.st + p.du ? (t - p.st) / p.du : 2; };

  let M = null;
  function model(HZ) {
    if (M && M.HZ === HZ) return M;
    const K = HZ.K, P = HZ.P, OPEN = P.OPEN;
    const grab = keys => { const out = []; for (const k of keys) if (K[k]) for (const p of K[k].parts) if (p.geo && isFinite(p.geo.min[0])) out.push({ k, p, b: p.geo }); return out; };
    const ym = K.ym, ymTop = Math.max(...ym.parts.map(p => p.geo.max[1]));
    M = { HZ, OPEN, win: [K.ymf.start, OPEN + 30],
      tracks: grab(['trackS', 'trackN']), plats: grab(['platS', 'platN']), ymParts: grab(['ymf', 'ym', 'ymc']), cranes: grab(['ycrane']), tod: grab(['tod']),
      ymTop, todTop: Math.max(...K.tod.parts.map(p => p.geo.max[1])) };
    return M;
  }
  const FVof = () => Object.assign({}, FV0, (G.__pv && G.__pv.FV) || {});
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
    return { num: FIRST.no, unit: FIRST.time, label: '首趟列车 · ' + FIRST.dir };
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

  function draw(g, w, h, t, ctx) {
    const HZ = G.HZ, P = HZ.P; ctx = ctx || {};
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
    const gut = small ? 0 : clamp(bw * 0.2, 96, 150);
    const pa = { x0: box.x0 + gut + 6, y0: box.y0 + (small ? 28 : 6), x1: box.x1 - 4, y1: box.y1 - 4 };
    // 视窗：z ∈ [−300, 300]（围挡 ±280–300、云门南缘 240、塔吊 263），x 半宽按画幅比例，至少 ±300
    const pw = pa.x1 - pa.x0, ph = pa.y1 - pa.y0, zH = 300, xH = Math.max(300, zH * pw / ph), s = Math.min(pw / (2 * xH), ph / (2 * zH));
    const cx = (pa.x0 + pa.x1) / 2, cy = (pa.y0 + pa.y1) / 2, X = x => cx + x * s, Y = z => cy + z * s;   // 北上（z<0 在上）、东右
    const lit = (x, z) => (L.on <= 0 ? 0 : L.r > 0 ? clamp((L.r - Math.hypot(x, z)) / 30, 0, 1) : 1) * L.on;   // 同 hzview：hzSm(0, 30, uWave − |xz|)
    const rectXZ = (b, fill, stroke, lw) => { const x0 = X(b.min[0]), y0 = Y(b.min[2]), ww = Math.max(0.6, (b.max[0] - b.min[0]) * s), hh = Math.max(0.6, (b.max[2] - b.min[2]) * s); if (fill) { g.fillStyle = fill; g.fillRect(x0, y0, ww, hh); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 0.8; g.strokeRect(x0, y0, ww, hh); } };

    g.save(); g.beginPath(); g.rect(pa.x0, pa.y0, pw, ph); g.clip();
    // 城市（始终墨线）：围挡、外围道路、坐标网
    g.strokeStyle = C.line; g.lineWidth = 0.5; for (let x = -1400; x <= 1400; x += 100) { g.beginPath(); g.moveTo(X(x), pa.y0); g.lineTo(X(x), pa.y1); g.stroke(); } for (let z = -300; z <= 300; z += 100) { g.beginPath(); g.moveTo(pa.x0, Y(z)); g.lineTo(pa.x1, Y(z)); g.stroke(); }
    g.strokeStyle = C.ink3; g.lineWidth = 0.8; g.setLineDash([6, 4]); g.strokeRect(X(-700), Y(-280), 1400 * s, 560 * s); g.setLineDash([]);
    // 站房屋盖轮廓（HZ.R 极坐标，同 jack 平面）
    const roof = () => { g.beginPath(); for (let a = 0; a <= 96; a++) { const th = a / 96 * Math.PI * 2, r = HZ.R(th), xx = Math.cos(th) * r, zz = Math.sin(th) * r; a ? g.lineTo(X(xx), Y(zz)) : g.moveTo(X(xx), Y(zz)); } g.closePath(); };
    roof(); g.fillStyle = '#ebe4d6'; g.fill();
    if (L.on > 0) { g.save(); roof(); g.clip(); const rg = L.r > 0 ? L.r : 2000; g.beginPath(); g.arc(X(0), Y(0), rg * s, 0, Math.PI * 2); g.fillStyle = `rgba(242,169,59,${0.55 * L.on})`; g.fill(); g.restore(); }
    roof(); g.strokeStyle = C.ink; g.lineWidth = 1.1; g.stroke();
    // 站台（灰底）+ 股道（线）：铺轨按构件状态
    for (const q of m.plats) { const st = stOf(q.p, t); if (st === -1) continue; const k = lit((q.b.min[0] + q.b.max[0]) / 2, (q.b.min[2] + q.b.max[2]) / 2); rectXZ(q.b, k > 0.5 ? C.lit3 : 'rgba(207,200,187,.55)', null); }
    for (const q of m.tracks) { const st = stOf(q.p, t); if (st === -1 || st === 3) continue; const zc = (q.b.min[2] + q.b.max[2]) / 2; g.strokeStyle = st < 2 ? C.red : C.ink2; g.lineWidth = st < 2 ? 1 : 0.6;
      const x1 = st < 2 ? q.b.min[0] + (q.b.max[0] - q.b.min[0]) * st : q.b.max[0]; g.beginPath(); g.moveTo(X(q.b.min[0]), Y(zc)); g.lineTo(X(x1), Y(zc)); g.stroke(); }
    // 云谷（两场之间 28 m）
    g.strokeStyle = C.ink3; g.lineWidth = 0.6; g.setLineDash([3, 3]); for (const z of [-P.gap, P.gap]) { g.beginPath(); g.moveTo(X(-P.stX), Y(z)); g.lineTo(X(P.stX), Y(z)); g.stroke(); } g.setLineDash([]);
    // 上盖开发（四角）：按层构件逐层加深；在建层红框
    const corners = new Map(); for (const q of m.tod) { const key = Math.sign(q.b.min[0] + q.b.max[0]) + ',' + Math.sign(q.b.min[2] + q.b.max[2]); if (!corners.has(key)) corners.set(key, []); corners.get(key).push(q); }
    for (const list of corners.values()) { let done = 0, live = null; for (const q of list) { const st = stOf(q.p, t); if (st === 2) done++; else if (st >= 0 && st < 2) live = q; }
      const fr = done / list.length, b0 = list[0].b, cxz = [(b0.min[0] + b0.max[0]) / 2, (b0.min[2] + b0.max[2]) / 2], k = lit(cxz[0], cxz[1]);
      if (done || live) { rectXZ(b0, k > 0.5 ? `rgba(242,169,59,${0.35 + 0.4 * fr})` : `rgba(93,86,76,${0.12 + 0.38 * fr})`, C.ink, 0.9); if (live) rectXZ(live.b, null, C.red, 1.4); }
      else rectXZ(b0, null, C.ink3, 0.6); }
    // 云门：基础虚线 → 两腿逐段 → 横梁 → 幕墙双线
    const ymS = m.ymParts.map(q => ({ q, st: stOf(q.p, t) }));
    const ymBox = { min: [-92, 0, 176], max: [92, 0, 240] };
    { const f = ymS.find(o => o.q.k === 'ymf'); if (f && f.st !== -1) { g.setLineDash([4, 3]); rectXZ(f.q.b, null, f.st < 2 ? C.red : C.ink3, 0.8); g.setLineDash([]); } }
    for (const o of ymS) { if (o.q.k !== 'ym' || o.st === -1) continue; const k = lit(0, 208); rectXZ(o.q.b, k > 0.5 ? 'rgba(242,169,59,.28)' : 'rgba(93,86,76,.13)', o.st < 2 ? C.red : C.ink, o.st < 2 ? 1.3 : 0.8); }
    for (const o of ymS) { if (o.q.k !== 'ymc' || o.st === -1) continue; const k = o.st >= 2 ? 1 : o.st; g.strokeStyle = C.glass; g.lineWidth = 1.6; const zc = o.q.b.min[2]; g.beginPath(); g.moveTo(X(o.q.b.min[0]), Y(zc)); g.lineTo(X(o.q.b.min[0] + (o.q.b.max[0] - o.q.b.min[0]) * k), Y(zc)); g.stroke(); }
    // 云门塔吊：十字 + 臂长圆（拆除后消失）
    for (const q of m.cranes) { const st = stOf(q.p, t); if (st === -1 || st === 3) continue; const x = X((q.b.min[0] + q.b.max[0]) / 2), y = Y((q.b.min[2] + q.b.max[2]) / 2);
      g.strokeStyle = C.temp; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke(); g.setLineDash([2, 3]); g.lineWidth = 0.6; g.beginPath(); g.arc(x, y, 55 * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    // 亮灯波前（开通前后 6 天）
    if (L.r > 0 && L.on > 0) { g.strokeStyle = C.lit; g.lineWidth = 2; g.beginPath(); g.arc(X(0), Y(0), L.r * s, 0, Math.PI * 2); g.stroke(); }
    // 首趟列车路径：开通前一周起用红色虚线 + 箭头预告；开通后列车本体（8 节，宽度至少 5 px）
    const showPath = t >= m.OPEN - 30;
    if (showPath) { g.strokeStyle = t >= m.OPEN ? C.lit : C.red; g.lineWidth = 1.4; g.setLineDash([8, 4]); g.beginPath(); g.moveTo(X(-1500 * T.dir), Y(T.z)); g.lineTo(X(T.stop + (T.dir > 0 ? TRAIN.nose : -TRAIN.nose)), Y(T.z)); g.stroke(); g.setLineDash([]);
      const ax = X(T.stop + T.dir * (TRAIN.nose + 2)), ay = Y(T.z); g.fillStyle = g.strokeStyle; g.beginPath(); g.moveTo(ax + T.dir * 7, ay); g.lineTo(ax - T.dir * 3, ay - 5); g.lineTo(ax - T.dir * 3, ay + 5); g.closePath(); g.fill(); }
    if (T.vis) { const th = Math.max(5, 3.4 * s), y = Y(T.z), xa = X(Math.min(T.head, T.tail)), xb = X(Math.max(T.head, T.tail));
      g.fillStyle = C.ink; g.fillRect(xa, y - th / 2, xb - xa, th);
      g.fillStyle = C.lit3; for (let k = 0; k < TRAIN.cars; k++) { const x0 = T.dir > 0 ? T.head - TRAIN.nose - (k + 1) * (TRAIN.L + TRAIN.gap) : T.head + TRAIN.nose + k * (TRAIN.L + TRAIN.gap); g.fillRect(X(x0 + 1.5), y - th * 0.18, Math.max(1, (TRAIN.L - 3) * s), th * 0.36); }
      g.fillStyle = C.red; g.beginPath(); g.moveTo(X(T.head), y); g.lineTo(X(T.head - T.dir * TRAIN.nose), y - th / 2); g.lineTo(X(T.head - T.dir * TRAIN.nose), y + th / 2); g.closePath(); g.fill(); }
    g.restore();

    // 标注
    if (!small) {
      label('湖杭场', X(-P.stX) + 4, Y(70), C.ink2); label('杭临绩场', X(-P.stX) + 4, Y(-62), C.ink2); label('云谷', X(P.stX) - 4, Y(0), C.ink3, { al: 'r' });
      label('云门 ' + Math.round(m.ymTop) + ' m', X(96), Y(208), C.ink, { b: true });
      label('上盖开发', X(160), Y(-122), C.ink2);
      if (showPath) label(t >= m.OPEN ? '首趟列车 ' + FIRST.no : '首趟列车路径', Math.max(pa.x0 + 4, X(-430)), Y(T.z) - 10, t >= m.OPEN ? C.temp : C.red, { b: true });
      label('北 ↑', pa.x1 - 6, pa.y0 + 8, C.ink3, { al: 'r' });
    }
    // 云门立面小样（右下角，向北看）：两腿 → 横梁到 80 m，在建段红；亮灯后暖色
    if (!small) { const iw = clamp(pw * 0.2, 70, 120), ih = iw * 0.62, ix = pa.x1 - iw - 6, iy = pa.y1 - ih - 6, k = iw / 200, base = iy + ih - 6, lx = v => ix + iw / 2 + v * k, ly = v => base - v * k * 0.9;
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
      const x0 = box.x0 + 8, num = String(B.num), FS = clamp(Math.round(gut / (num.length > 3 ? 3.9 : 3.0)), 24, 48);
      g.textBaseline = 'alphabetic'; g.fillStyle = t >= m.OPEN ? C.temp : C.ink; g.font = `600 ${FS}px ${MONO}`; g.fillText(num, x0, box.y0 + 12 + FS);
      const nw = g.measureText(num).width; g.font = `600 ${Math.round(FS * 0.36)}px ${t >= m.OPEN ? MONO : SANS}`; g.fillStyle = C.ink2;
      if (nw + 4 + g.measureText(B.unit).width < gut) g.fillText(B.unit, x0 + nw + 4, box.y0 + 12 + FS); else g.fillText(B.unit, x0, box.y0 + 28 + FS);
      let ly = box.y0 + (nw + 4 + g.measureText(B.unit).width < gut ? 30 : 46) + FS;
      const wrap = (txt, col, fsz) => { g.font = `${fsz || 10}px ${SANS}`; g.fillStyle = col; let l0 = ''; for (const ch of txt) { if (g.measureText(l0 + ch).width > gut - 6) { g.fillText(l0, x0, ly); ly += (fsz || 10) + 4; l0 = ch; } else l0 += ch; } if (l0) { g.fillText(l0, x0, ly); ly += (fsz || 10) + 6; } };
      wrap(B.label, C.ink2); if (t >= m.OPEN) wrap('来源：' + FIRST.src, C.ink3, 8); wrap(dayTxt, C.ink3, 9); ly += 4;
      for (const n of cur.slice(0, 3)) wrap('▸ ' + n, C.red, 10);
    } else {
      label(B.num + ' ' + B.unit, box.x0 + 6, box.y0 + 9, t >= m.OPEN ? C.temp : C.ink, { b: true, fs: 12 });
      if (cur[0]) label(cur[0], box.x0 + 6, box.y0 + 22, C.red, { fs: 9 });
    }
    return {};
  }

  const plugin = {
    id: 'S-501', name: '开通',
    window: [700, 1131],                 // = [K.ymf.start, OPEN + 30]（check_s501 断言）
    big: t => big(G.HZ, t),
    draw,
    // 镜头（米、度；az −40 = 西北、120 = 东南，同 hzview fin 机位约定）：先从南看云门长高，再拉远看四角上盖，最后落到 r3 终选结尾机位（fin 14）
    cam: [
      { t: 700, target: [0, 20, 208], az: 160, el: 14, dist: 480 },
      { t: 865, target: [0, 40, 208], az: 150, el: 10, dist: 380 },
      { t: 1050, target: [0, 30, 0], az: 135, el: 16, dist: 820 },
      { t: 1101, target: [-60, 24, -10], az: -40, el: 11, dist: 760 },
      { t: 1131, target: [-60, 24, -10], az: -40, el: 11, dist: 760 },
    ],
    model: () => model(G.HZ), lightAt: t => lightAt(G.HZ, t), trainAt: t => trainAt(G.HZ, t), stOf, FIRST,
  };
  (G.HZ_SHEET_PLUGINS = G.HZ_SHEET_PLUGINS || []).push(plugin);
})(typeof window !== 'undefined' ? window : globalThis);
