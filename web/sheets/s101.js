'use strict';
// ===== S-101 地下 · 横剖面 x = 39 m（向东看）· 插件模块（hark-liuzhijie）=====
// 一屏讲清 365 天地下工程：地连墙 → 桩 → 分层开挖 + 内支撑 → 底板 → 逐层回筑、逐道拆撑 → 两翼站房地下室。
//
// 施工方法与尺寸（公开资料，均为示意，按规则推导，不手摆坐标）：
//  · 明挖顺作法；主体围护「放坡开挖 + 地下连续墙 + 内支撑」，分期分坑实施
//    —— 杭州机场轨道快线 SGJC-2 标招标公告（2019-08-08，dlztb.com/news/201908/08/155450.html）。
//  · 西站站坑深度 25.2 m —— 机场快线 JLJC-2 标监理招标公告（2019-09-30，dlztb.com/news/201909/30/30535.html）。
//  · 站房地下 4 层；地下三层、二层及地下一层一部分为地铁站 —— 杭州网 2020-09-03（hwyst.hangzhou.com.cn …/content_7805990_0.htm）。
//  · 云谷「扎根」于地下 9.2 m 的地铁层 —— 杭州日报 2022-04-12（hangzhou.gov.cn/art/2022/4/12/art_812269_59053672.html），与 3D 的 metro 槽 y = −9.2 一致。
//  · 站房地下：4 965 根桩 84 天、120 万 m³ 土方 60 天、1 037 个承台；2020-09-15 地下结构封顶
//    —— 科极网 2020-09-16（kjw.cc/guonei/2020/0916/20216.html）、杭州日报 2022-09-05。
//
// 时间：不另起一份排程。全部节拍从 HZ.K.found 的构件时刻推导：
//  · 中央地铁坑（|z| < 14）收尾 = 3D 里 metro 构件完成时刻（UGT，hzview.js 用同一值判断地铁层开敞），
//    之前的工序按工程逻辑等比例排在 [0, UGT]；
//  · 两翼（站房地下室）的顶板 = 3D 里覆盖 x = 39 的那块 found 板的 [st, st + du]，
//    桩、挖土、底板按固定工期往前倒推。
// 物理不变量（check_s101 逐时刻断言）：撑只在挖过它之后出现、在它下面那层板浇完后才拆；
// 板只浇在已挖到的标高之上；挖土不超过墙已成槽的深度；坑底不低于设计坑底。
(function (G) {
  const X0 = 39;                                   // 剖切位置，与 S-301 的 B–B 同一条线
  const C = { paper: '#f6f2ea', ink: '#1d1a17', ink2: '#5d564c', ink3: '#948b7d', line: '#d4cbbb', red: '#b3202a', red2: '#e6bab4', red3: '#f3dcd8', temp: '#c46a12', soil: '#e9e1d2', soil2: '#d9cdb7', conc: '#cfc8bb', water: '#5b7fa6' };
  const MONO = '"SF Mono","JetBrains Mono",Menlo,Consolas,"DejaVu Sans Mono","Noto Sans Mono CJK SC",monospace';
  const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1));

  // ---- 几何（米；z 向南为正，y 向上）----
  const GEO = {
    zIn: 13.2,          // 地铁层内净宽半宽（= hzview UG 常量 P.gap − 0.8）
    zW0: 14.0, zW1: 15.0, // 地连墙 1.0 m，贴在 3D metro 槽外侧
    wallTip: -38,       // 墙趾（嵌固 ~13 m）
    pit: -25.2,         // 中央坑底
    base: [-25.2, -24.0],                    // 底板
    lv: [                                    // 中央各层板：[底, 顶, 名]
      { y0: -20.4, y1: -20.0, n: 'B3', d: '站台层' },
      { y0: -15.8, y1: -15.4, n: 'B2', d: '设备 / 换乘' },
      { y0: -10.0, y1: -9.2, n: 'B1', d: '地铁层 · 云谷底' },
    ],
    struts: [-1.0, -6.5, -12.5, -18.5],      // 内支撑标高（第 1 道 = 冠梁处混凝土撑）
    slabDone: 0.7,                           // 每层回筑进度：0–0.45 内衬墙 + 中柱，0.45–0.7 浇板，B1 之后 0.7–1 地铁层侧墙
    lifts: [-2.0, -7.5, -13.5, -19.5, -25.2],// 分层开挖到的标高：每层挖到撑下 1 m 再架撑
    fPit: -10.4,                             // 两翼坑底
    fBase: [-10.4, -9.6], fRoof: [-0.8, 0],  // 两翼底板、顶板（顶板 = 3D 的 found 板 −0.8..0）
    fCols: [26, 40, 54],                     // 两翼柱（|z|）
    zView: 66,                               // 画幅半宽（两翼实际到 z ≈ −122 / 143，画幅外折断）
    yTop: 7, yBot: -40,
  };

  // ---- 从 HZ 推导节拍 ----
  let M = null;
  function model(HZ) {
    if (M && M.HZ === HZ) return M;
    const F = HZ.K.found, parts = F.parts;
    const metro = parts.find(p => p.geo && p.geo.mat === 'metro');
    const UGT = metro ? metro.st + metro.du : F.start + (F.end - F.start) * 0.65;
    const MS = metro ? metro.st : UGT * 0.81;
    // 覆盖 x = X0 的两翼 found 板（南 z>0、北 z<0）
    const tile = side => parts.find(p => p.geo && p.geo.mat === 'found' && p.geo.min[0] <= X0 && p.geo.max[0] > X0 && (side > 0 ? p.geo.min[2] > 0 : p.geo.max[2] < 0));
    const ph = (a, b, k, n) => ({ a, b, k, n });
    const f = k => UGT * k;
    const L = [];
    // 中央地铁坑：比例来自工序逻辑（墙 → 桩 → 冠梁/第 1 道撑 → 4 层挖 → 底板 → 回筑），回筑 B1 = 3D metro 构件
    L.push(ph(f(0.00), f(0.24), 'wall', '地下连续墙成槽 · 浇筑'));
    L.push(ph(f(0.14), f(0.32), 'pileC', '立柱桩 · 抗拔桩'));
    L.push(ph(f(0.30), f(0.36), 'dewater', '降水 · 冠梁 · 第 1 道撑'));
    const dig0 = f(0.36), dig1 = f(0.62);
    GEO.lifts.forEach((y, i) => L.push(ph(lerp(dig0, dig1, i / 5), lerp(dig0, dig1, (i + 1) / 5), 'dig' + i, '分层开挖 第 ' + (i + 1) + ' 层 → ' + y.toFixed(1) + ' m')));
    L.push(ph(dig1, f(0.68), 'base', '垫层 · 底板 −24.0'));
    L.push(ph(f(0.68), f(0.745), 'B3', '回筑 B3 板 −20.0 · 拆第 4 道撑'));
    L.push(ph(f(0.745), MS, 'B2', '回筑 B2 板 −15.4 · 拆第 3 道撑'));
    L.push(ph(MS, UGT, 'B1', '回筑 B1 地铁层 −9.2 · 拆第 1、2 道撑'));
    // 两翼：顶板 = 3D 板；往前倒推 桩 60 d、挖土 45 d、底板 15 d（比例取自 84 d 桩 / 60 d 土方的公开工期）
    const wing = side => { const p = tile(side); const st = p ? p.st : UGT * 0.7, du = p ? p.du : 43.8; const s = side > 0 ? 'S' : 'N';
      return [ph(Math.max(0, st - 120), Math.max(0, st - 60), 'pile' + s, (side > 0 ? '南' : '北') + '翼 工程桩 · 承台'),
        ph(Math.max(0, st - 60), st - 15, 'digF' + s, (side > 0 ? '南' : '北') + '翼 放坡挖土 → −10.4 m'),
        ph(st - 15, st, 'baseF' + s, (side > 0 ? '南' : '北') + '翼 底板 · B1 楼面'),
        ph(st, st + du, 'roofF' + s, (side > 0 ? '南' : '北') + '翼 柱 · 顶板 ±0（= 3D 板）')]; };
    wing(1).concat(wing(-1)).forEach(p => L.push(p));
    const by = {}; for (const p of L) by[p.k] = p;
    M = { HZ, UGT, MS, L, by, win: [F.start, F.end] };
    return M;
  }

  // ---- 某时刻的完整状态（图纸、大数字、检查共用）----
  function stateAt(HZ, t) {
    const m = model(HZ), by = m.by, p = k => prog(t, by[k].a, by[k].b);
    const s = { t };
    s.wall = p('wall');                                         // 0..1：墙从墙顶往下成槽（按幅推进，剖面里画成深度）
    s.wallY = lerp(0, GEO.wallTip, s.wall);
    s.pileC = p('pileC');
    s.dewater = p('dewater');
    // 中央开挖深度：先挖到 −2.0 架第 1 道撑（与冠梁同做），之后每层挖到撑下 1 m
    let dc = 0; GEO.lifts.forEach((y, i) => { const k = p('dig' + i); if (k > 0) dc = lerp(i ? GEO.lifts[i - 1] : 0, y, k); });
    s.dig = dc;
    s.base = p('base');
    const rb = { B3: p('B3'), B2: p('B2'), B1: p('B1') };
    s.lv = GEO.lv.map(L => rb[L.n]);
    // 撑：挖到撑下（标高 − 0.5）即架；其下一层板浇完（进度 ≥ slabDone）即拆。第 1、2 道在 B1 板浇完后拆，再接地铁层侧墙到 ±0（云谷向天开敞，不留顶板）
    const SD = GEO.slabDone, rmAt = [rb.B1 >= SD, rb.B1 >= SD, rb.B2 >= SD, rb.B3 >= SD];
    s.struts = GEO.struts.map((y, i) => (dc <= y - 0.5 && !rmAt[i] ? 1 : rmAt[i] ? 3 : 0)); // 0 未架 / 1 在用 / 3 已拆
    s.wings = [1, -1].map(side => { const S = side > 0 ? 'S' : 'N';
      return { side, pile: p('pile' + S), dig: lerp(0, GEO.fPit, p('digF' + S)), base: p('baseF' + S), roof: p('roofF' + S) }; });
    s.cur = m.L.filter(q => t >= q.a && t < q.b).map(q => q.n);
    // 完成的地下层数（中央坑按 B3/B2/B1，底板算第 4 层的底；两翼顶板封顶 = ±0 层完成）
    s.layers = (s.base >= 1 ? 1 : 0) + (rb.B3 >= 1 ? 1 : 0) + (rb.B2 >= 1 ? 1 : 0) + (rb.B1 >= 1 ? 1 : 0);
    return s;
  }

  // 大数字：挖的阶段 = 开挖深度（m），回筑阶段 = 已完成地下层数（/4）
  function big(HZ, t) {
    const s = stateAt(HZ, t);
    if (s.base < 1) return { num: +Math.abs(s.dig).toFixed(1), unit: 'm', label: s.dig < 0 ? '已挖深度（设计坑底 25.2 m）' : '准备开挖' };
    return { num: s.layers, unit: '/ 4 层', label: '地下结构已完成' };
  }

  // ---- 2D 绘制 ----
  function frame(g, w, h, tbo) {
    const tb = tbo && tbo.tb || 20;
    g.fillStyle = C.paper; g.fillRect(0, 0, w, h);
    g.strokeStyle = C.ink; g.lineWidth = 1; g.strokeRect(3.5, 3.5, w - 7, h - 7); g.lineWidth = 0.6; g.strokeRect(6.5, 6.5, w - 13, h - 13);
    const y = h - 6.5 - tb; g.beginPath(); g.moveTo(6.5, y); g.lineTo(w - 6.5, y); g.stroke();
    const nm = tbo ? (Array.isArray(tbo.name) ? tbo.name : [tbo.name, tbo.name]) : ['', ''];
    const fs = tb >= 20 ? 10 : 9, pad = 6; g.textBaseline = 'middle';
    const cells = [[String(tbo && tbo.no || ''), C.red, MONO, true], [nm[0], C.ink, SANS, true], [String(tbo && tbo.scale || ''), C.ink2, MONO], ['修订 r' + String(tbo && tbo.rev || 1).padStart(3, '0'), C.red, MONO], [String(tbo && tbo.date || ''), C.ink2, MONO], [String(tbo && tbo.chk || ''), tbo && tbo.chkOk ? '#2f7a3a' : C.red, MONO]];
    const wOf = c => { g.font = `${c[3] ? '600 ' : ''}${fs}px ${c[2]}`; return g.measureText(c[0]).width + pad * 2; };
    let ws = cells.map(wOf); const keep = cells.map(() => true), avail = w - 13;
    for (const k of [4, 2, 5, 3, 1]) { if (ws.reduce((a, v, i) => a + (keep[i] ? v : 0), 0) <= avail) break; if (k === 1) { cells[1][0] = nm[1]; ws[1] = wOf(cells[1]); continue; } keep[k] = false; }
    const tot = ws.reduce((a, v, i) => a + (keep[i] ? v : 0), 0), extra = Math.max(0, avail - tot); let x = 6.5;
    cells.forEach((c, i) => { if (!keep[i]) return; const cw = ws[i] + (i === 1 ? extra : 0); g.font = `${c[3] ? '600 ' : ''}${fs}px ${c[2]}`; g.fillStyle = c[1]; let tx = c[0];
      while (g.measureText(tx).width > cw - pad * 2 && tx.length > 2) tx = tx.slice(0, -1);
      g.fillText(tx, x + pad, y + tb / 2 + 0.5); x += cw; if (x < w - 8) { g.strokeStyle = C.ink; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, h - 6.5); g.stroke(); } });
    return { x0: 8, y0: 8, x1: w - 8, y1: y - 2 };
  }

  function draw(g, w, h, t, ctx) {
    const HZ = G.HZ; ctx = ctx || {};
    const PJ = (G.HZA && G.HZA.PROJECT) || HZ.PROJECT || 'HZW';
    const no = PJ + '-S-101-1';
    const tbo = ctx.tb ? ctx.tb(w, h, no, ['地下 · 横剖面 x = ' + X0 + ' m · 向东看', '地下 · 横剖面'], t) : { tb: 20, no, name: '地下' };
    const box = frame(g, w, h, tbo);
    const s = stateAt(HZ, t), m = model(HZ);
    const labels = [];
    const label = (txt, x, y, col, o) => { o = o || {}; const fs = o.fs || 9; g.font = `${o.b ? '600 ' : ''}${fs}px ${o.sans ? SANS : MONO}`; const tw = g.measureText(txt).width, th = fs + 2;
      const lx = o.al === 'c' ? x - tw / 2 : o.al === 'r' ? x - tw : x, ly = y - th / 2;
      if (!(lx >= box.x0 && ly >= box.y0 && lx + tw <= box.x1 && ly + th <= box.y1)) return false;
      if (!labels.every(r => lx + tw < r[0] || lx > r[2] || ly + th < r[1] || ly > r[3])) return false;
      labels.push([lx - 1, ly, lx + tw + 1, ly + th]); g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(txt, lx, y); g.fillStyle = col || C.ink; g.fillText(txt, lx, y); return true; };

    // 版面：左侧大数字栏 + 右侧剖面；矮窗口把大数字压到左上角
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0, small = bh < 220 || bw < 380;
    const gut = small ? 0 : clamp(bw * 0.2, 96, 150);
    const da = { x0: box.x0 + gut + 6, y0: box.y0 + (small ? 30 : 18), x1: box.x1 - (small ? 4 : 56), y1: box.y1 - 6 };
    const zv = GEO.zView, yT = GEO.yTop, yB = GEO.yBot;
    const dw = da.x1 - da.x0, dh = da.y1 - da.y0, sx = dw / (2 * zv), ve = clamp(Math.floor(dh / (yT - yB) / sx * 2) / 2, 1, 2), sy = sx * ve;
    const oy = da.y0 + (dh - (yT - yB) * sy) / 2;
    const X = z => da.x0 + (z + zv) * sx, Y = y => oy + (yT - y) * sy;   // 向东看：左 = 北（z<0），右 = 南
    const R = (z0, y0, z1, y1) => [X(Math.min(z0, z1)), Y(Math.max(y0, y1)), Math.abs(z1 - z0) * sx, Math.abs(y1 - y0) * sy];
    const fillR = (z0, y0, z1, y1, col) => { const r = R(z0, y0, z1, y1); g.fillStyle = col; g.fillRect(r[0], r[1], r[2], r[3]); };
    const strokeR = (z0, y0, z1, y1, col, lw) => { const r = R(z0, y0, z1, y1); g.strokeStyle = col; g.lineWidth = lw || 1; g.strokeRect(r[0], r[1], r[2], r[3]); };
    const line = (z0, y0, z1, y1, col, lw, dash) => { g.strokeStyle = col; g.lineWidth = lw || 1; if (dash) g.setLineDash(dash); g.beginPath(); g.moveTo(X(z0), Y(y0)); g.lineTo(X(z1), Y(y1)); g.stroke(); if (dash) g.setLineDash([]); };
    // 墨线剖面线（混凝土 = 45° 斜线）
    const hatchR = (z0, y0, z1, y1, col, step) => { const r = R(z0, y0, z1, y1); if (r[2] < 0.5 || r[3] < 0.5) return; g.save(); g.beginPath(); g.rect(r[0], r[1], r[2], r[3]); g.clip(); g.strokeStyle = col; g.lineWidth = 0.6; g.beginPath();
      const st = step || 5; for (let k = -r[3]; k < r[2]; k += st) { g.moveTo(r[0] + k, r[1] + r[3]); g.lineTo(r[0] + k + r[3], r[1]); } g.stroke(); g.restore(); };
    const conc = (z0, y0, z1, y1, k, live) => { if (k <= 0) return; const yk = live ? lerp(y0, y1, k) : y1; fillR(z0, y0, z1, yk, live && k < 1 ? C.red3 : C.conc); hatchR(z0, y0, z1, yk, live && k < 1 ? C.red : 'rgba(29,26,23,.55)', 4); strokeR(z0, y0, z1, yk, live && k < 1 ? C.red : C.ink, live && k < 1 ? 1.1 : 0.9); };

    g.save(); g.beginPath(); g.rect(da.x0, da.y0, dw, dh); g.clip();
    // 土体：画幅内地面以下先全部填土，再把挖掉的部分涂回纸色
    fillR(-zv, 0, zv, yB, C.soil);
    // 土层点纹（稀疏，墨线语言）
    g.fillStyle = C.soil2; for (let y = -1.5; y > yB; y -= 3.2) for (let z = -zv + ((y * 7) % 3 + 3) % 3; z < zv; z += 5.5) g.fillRect(X(z), Y(y), 1.2, 1.2);
    // 地下水位（降水前在 −1.5，降水后压到坑底以下）
    const wl = lerp(-1.5, Math.min(GEO.pit - 1, s.dig - 1), s.dewater);
    line(-zv, wl, zv, wl, C.water, 0.8, [5, 3]);
    // 两翼挖土（放坡在画幅外，画幅边缘折断）
    for (const W of s.wings) { if (W.dig >= 0) continue; const za = W.side > 0 ? GEO.zW1 : -zv, zb = W.side > 0 ? zv : -GEO.zW1; fillR(za, 0, zb, W.dig, C.paper); line(za, W.dig, zb, W.dig, C.ink2, 0.8); }
    // 中央挖土
    if (s.dig < 0) { fillR(-GEO.zW0, 0, GEO.zW0, s.dig, C.paper); line(-GEO.zW0, s.dig, GEO.zW0, s.dig, s.base >= 1 ? C.ink2 : C.red, s.base >= 1 ? 0.8 : 1.4); }
    // 地面线
    line(-zv, 0, zv, 0, C.ink, 1.2);
    // 桩：中央立柱桩/抗拔桩（坑底以下）与两翼工程桩（翼坑底以下）。在建 = 红，成桩 = 墨
    const pile = (z, y0, y1, k, idx, n) => { const kk = clamp(k * n - idx, 0, 1); if (kk <= 0) return; const ye = lerp(y0, y1, kk); line(z, y0, z, ye, kk < 1 ? C.red : C.ink, Math.max(1, 0.8 * sx)); };
    [-7, 0, 7].forEach((z, i) => pile(z, GEO.pit, GEO.yBot, s.pileC, i, 3));
    for (const W of s.wings) { const zs = [20, 27, 34, 41, 48, 55, 62]; zs.forEach((z, i) => pile(W.side * z, GEO.fPit, -34, W.pile, i, zs.length)); }
    // 地连墙（成槽深度随进度往下）
    if (s.wall > 0) for (const sg of [-1, 1]) { const a = sg * GEO.zW0, b = sg * GEO.zW1; conc(a, 0, b, s.wallY, 1, false); if (s.wall < 1) strokeR(a, 0, b, s.wallY, C.red, 1.2); }
    // 中央：底板、各层板、内衬墙、中柱
    conc(-GEO.zIn, GEO.base[0], GEO.zIn, GEO.base[1], s.base, true);
    const lvY = [GEO.base[1]].concat(GEO.lv.map(L => L.y1));
    GEO.lv.forEach((L, i) => { const k = s.lv[i]; if (k <= 0) return;
      // 内衬墙与中柱随本层往上长，板最后浇
      const yb = lvY[i], kw = clamp(k / 0.45, 0, 1), kp = clamp((k - 0.45) / 0.25, 0, 1), yw = lerp(yb, L.y0, kw);
      for (const sg of [-1, 1]) conc(sg * GEO.zIn, yb, sg * GEO.zW0, yw, 1, false);
      conc(-0.5, yb, 0.5, yw, 1, false);
      if (kp > 0) conc(-GEO.zIn, L.y0, lerp(-GEO.zIn, GEO.zIn, kp), L.y1, 1, false);
      if (k < (i === 2 ? GEO.slabDone : 1)) strokeR(-GEO.zIn, yb, GEO.zIn, L.y1, C.red, 1);
    });
    // B1 之上的地铁层侧墙（= 3D metro 槽侧墙 −9.2..0），随 B1 回筑一起上
    if (s.lv[2] > GEO.slabDone) for (const sg of [-1, 1]) conc(sg * GEO.zIn, -9.2, sg * GEO.zW0, lerp(-9.2, 0, clamp((s.lv[2] - GEO.slabDone) / (1 - GEO.slabDone), 0, 1)), 1, false);
    // 两翼：底板、柱、顶板（顶板 = 3D 的 found 板）
    for (const W of s.wings) { const sg = W.side, za = sg * GEO.zW1, zb = sg * zv;
      conc(za, GEO.fBase[0], zb, GEO.fBase[1], W.base, true);
      if (W.roof > 0) { const kc = clamp(W.roof / 0.5, 0, 1), kr = clamp((W.roof - 0.5) / 0.5, 0, 1);
        for (const z of GEO.fCols) conc(sg * z - 0.4, GEO.fBase[1], sg * z + 0.4, lerp(GEO.fBase[1], GEO.fRoof[0], kc), 1, false);
        if (kr > 0) conc(za, GEO.fRoof[0], lerp(za, zb, kr), GEO.fRoof[1], 1, false); } }
    // 内支撑（临时，橙）：在用 = 实线 + 撑端节点；已拆 = 细虚线留痕
    GEO.struts.forEach((y, i) => { const st = s.struts[i]; if (!st) return;
      if (st === 1) { line(-GEO.zW0, y, GEO.zW0, y, C.temp, Math.max(1.4, 0.7 * sy)); for (const z of [-GEO.zW0, 0, GEO.zW0]) { g.fillStyle = C.temp; g.fillRect(X(z) - 2, Y(y) - 2, 4, 4); } }
      else line(-GEO.zIn, y, GEO.zIn, y, 'rgba(196,106,18,.35)', 0.6, [2, 3]); });
    // 中央临时立柱（立柱桩上的格构柱，撑在用期间存在）
    if (s.struts.some(v => v === 1) && s.pileC >= 1) line(0, GEO.pit, 0, GEO.struts[0], C.temp, 1, [4, 2]);
    // 折断线（画幅左右边：两翼还在延伸）
    for (const ze of [-zv + 0.6, zv - 0.6]) { g.strokeStyle = C.ink2; g.lineWidth = 0.8; g.beginPath(); const x = X(ze); g.moveTo(x, Y(2)); g.lineTo(x, Y(-6)); g.lineTo(x - 4, Y(-8)); g.lineTo(x + 4, Y(-10)); g.lineTo(x, Y(-12)); g.lineTo(x, Y(yB + 1)); g.stroke(); }
    g.restore();

    // 标高刻度（右侧）
    const ticks = [[0, '±0.0'], [-9.2, '−9.2'], [-15.4, '−15.4'], [-20.0, '−20.0'], [GEO.pit, '−25.2']];
    for (const [y, txt] of ticks) { const yy = Y(y); if (yy < da.y0 || yy > da.y1) continue; g.strokeStyle = C.ink3; g.lineWidth = 0.6; g.beginPath(); g.moveTo(da.x1 + 2, yy); g.lineTo(da.x1 + 7, yy); g.stroke(); if (!small) label(txt, da.x1 + 9, yy, C.ink2, { fs: 9 }); }
    // 层名（板浇好后写在坑里两板之间）
    if (!small) { const nm = [['B4', '底板以上', GEO.base[1], GEO.lv[0].y0, s.base >= 1]].concat(GEO.lv.map((L, i) => [L.n, L.d, L.y1, i < 2 ? GEO.lv[i + 1].y0 : 0, s.lv[i] >= GEO.slabDone]));
      nm[0][1] = '站台层下 · 设备'; nm[1][1] = '站台层'; nm[2][1] = '换乘 · 设备'; nm[3][1] = '地铁层 · 云谷';
      for (const [n, d, ya, yb, ok] of nm) if (ok && (Y(ya) - Y(yb)) > 12) label(n + ' ' + d, X(-GEO.zIn + 1.2), (Y(ya) + Y(yb)) / 2, C.ink2, { sans: true, fs: 8 }); }
    if (ve > 1 && !small) label('竖向 ×' + ve, da.x1 - 2, da.y1 - 6, C.ink3, { al: 'r', sans: true });
    // 开挖深度标注（挖土阶段，红）
    if (s.dig < -0.5 && s.base < 1) { const x = X(-GEO.zIn + 2.5); g.strokeStyle = C.red; g.fillStyle = C.red; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, Y(0)); g.lineTo(x, Y(s.dig)); g.stroke();
      for (const y of [0, s.dig]) { g.beginPath(); g.moveTo(x - 4, Y(y)); g.lineTo(x + 4, Y(y)); g.stroke(); }
      label(Math.abs(s.dig).toFixed(1) + ' m', x + 5, (Y(0) + Y(s.dig)) / 2, C.red, { b: true }); }
    // 构件名（只在有空位时写）
    if (!small) {
      if (s.wall > 0) label('地连墙 1.0 m', X(GEO.zW1) + 4, Y(-30), C.ink2, { sans: true });
      if (s.struts.some(v => v === 1)) { const i = s.struts.indexOf(1); label('内支撑（临时）', X(GEO.zW1) + 4, Y(GEO.struts[i]) + 7, C.temp, { sans: true }); }
      if (s.wings[0].pile > 0) label('工程桩', X(30), Y(-36), C.ink2, { sans: true });
      if (s.lv[2] >= 1) label('云谷 · 向天开敞', X(0), Y(-4.5), C.ink2, { al: 'c', sans: true });
      label('北', X(-zv) + 6, Y(yT) + 6, C.ink3, { sans: true }); label('南', X(zv) - 6, Y(yT) + 6, C.ink3, { al: 'r', sans: true });
    }

    // 大数字（左栏）+ 当前工序（一行）
    const B = big(HZ, t), dayTxt = '第 ' + Math.round(t) + ' 天' + (HZ.dayDate ? ' · ' + HZ.dayDate(t) : '');
    if (!small) {
      const cx = box.x0 + 8, FS = clamp(Math.round(gut / 3.4), 28, 44);
      g.textBaseline = 'alphabetic'; g.fillStyle = C.ink; g.font = `600 ${FS}px ${MONO}`; const nt = String(B.num); g.fillText(nt, cx, box.y0 + 14 + FS);
      const nw = g.measureText(nt).width; g.font = `600 ${Math.round(FS * 0.32)}px ${SANS}`; g.fillStyle = C.ink2; g.fillText(B.unit, cx + nw + 4, box.y0 + 14 + FS);
      g.font = `${10}px ${SANS}`; g.fillStyle = C.ink2; let ly = box.y0 + 32 + FS;
      const wrap = (txt, col, fsz) => { g.font = `${fsz || 10}px ${SANS}`; g.fillStyle = col; let line0 = ''; for (const ch of txt) { if (g.measureText(line0 + ch).width > gut - 6) { g.fillText(line0, cx, ly); ly += (fsz || 10) + 4; line0 = ch; } else line0 += ch; } if (line0) { g.fillText(line0, cx, ly); ly += (fsz || 10) + 6; } };
      wrap(B.label, C.ink2); wrap(dayTxt, C.ink3, 9); ly += 4;
      for (const n of s.cur.slice(0, 3)) wrap('▸ ' + n, C.red, 10);
      if (!s.cur.length && t >= m.win[1]) wrap('地下结构封顶，转入地上', '#2f7a3a', 10);
      // 工序条：本剖面全部工序在时间窗内的位置，当前时刻一根红竖线
      const bx0 = cx, bx1 = box.x0 + gut, by1 = box.y1 - 8, rows = m.L.length, rh = clamp(Math.floor((by1 - ly - 6) / rows), 2, 6), by0 = by1 - rows * rh;
      if (by0 > ly) { const W0 = m.win[0], W1 = m.win[1], XT = v => bx0 + (v - W0) / (W1 - W0) * (bx1 - bx0);
        m.L.forEach((q, i) => { const done = t >= q.b, on = t >= q.a && t < q.b; g.fillStyle = on ? C.red : done ? C.ink2 : C.line; g.fillRect(XT(q.a), by0 + i * rh, Math.max(1, XT(q.b) - XT(q.a)), rh - 1); });
        g.strokeStyle = C.red; g.lineWidth = 1; g.beginPath(); g.moveTo(XT(clamp(t, W0, W1)), by0 - 3); g.lineTo(XT(clamp(t, W0, W1)), by1 + 1); g.stroke(); }
    } else {
      label(B.num + ' ' + B.unit, box.x0 + 6, box.y0 + 9, C.ink, { b: true, fs: 12, sans: true });
      if (s.cur[0]) label(s.cur[0], box.x0 + 6, box.y0 + 23, C.red, { sans: true, fs: 9 });
    }
    return { state: s };
  }

  const plugin = {
    id: 'S-101', name: '地下',
    window: [0, 365],
    big: t => big(G.HZ, t),
    draw,
    // 镜头关键帧（米、度）：全部从地面以上低角度看基坑，目标点 y = 0，相机高度 = dist·sin(el) > 0，不进地下
    cam: [
      { t: 0, target: [0, 0, 0], az: 35, el: 30, dist: 420 },
      { t: 90, target: [X0, 0, 0], az: 25, el: 16, dist: 170 },
      { t: 150, target: [X0, 0, 0], az: 15, el: 12, dist: 130 },
      { t: 236, target: [X0, 0, 0], az: 60, el: 20, dist: 140 },
      { t: 365, target: [0, 0, 0], az: 35, el: 28, dist: 380 },
    ],
    // 供检查与其他模块读取（只读）
    model: () => model(G.HZ), stateAt: t => stateAt(G.HZ, t), GEO,
  };
  (G.HZ_SHEET_PLUGINS = G.HZ_SHEET_PLUGINS || []).push(plugin);
})(typeof window !== 'undefined' ? window : globalThis);
