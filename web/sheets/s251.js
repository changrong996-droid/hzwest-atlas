'use strict';
// ===== S-251 网架拼装 · 候车层楼面分单元拼装平面 + 当前单元杆件轴测 · 插件模块（hark-liuzhijie）=====
// 整体提升前最「手工」的一段：屋盖网架先在 24 m 候车层楼面上搭胎架，分南 / 中 / 北三区一条一条拼起来，拼完再脱胎提升（S-301）。
//
// 数据全部来自同一份排程，不另排（改 HZ 图跟着变）：
//  · 拼装单元 = HZ.K.asm1 / asm2 / asm3（南 / 中 / 北区）的每个构件；单元的格子、杆件、吨位、[st, st+du] 都读构件自身（cells / rods / t）；
//  · 胎架 = HZ.K.jig1..3 的构件（jigOf 指向所托的格子），按自身 st / rm 出现、拆除；
//  · 提升时刻读 HZ.K.lift1..3.start；时间窗 = [最早胎架开始, 最晚单元拼完 + 3 天]。
// 大数字：已拼单元 x / 总数。杆件根数 = 单元各格 rods 之和；「焊口」按每根杆件两端各一个焊接接头计（模型口径，不是公开数字）。
// 公开对照（REAL，只读不改排程）：
//  · 2021-05-31 杭州网（杭州发布）「网架桁架拼装累计完成 46.5%」https://hznews.hangzhou.com.cn/chengshi/content/2021-05/31/content_7975948.htm
//  · 2021-06-28 屋盖钢结构整体提升完成，比计划提前一个月；206 台液压同步提升设备；先南区旋转提升，再中区、北区；节省拼装胎架 2 700 m
//    （央广网 2021-06-30 http://news.cnr.cn/native/city/20210630/t20210630_525524643.shtml）
//  图上把模型达到同一进度的日期与公开日期并排写出（偏差 = 模型日期 − 公开日期，负 = 模型偏早），供排程校准；46.5% 的口径（按量还是按单元）原文未说，按钢量比较。
// 公开口径（HZ.FACTS「屋盖施工」）：候车层楼面拼装 → 分南 / 中 / 北三区液压旋转提升 → 嵌补合龙 → 整体提升到位。
(function (G) {
  const C = { paper: '#f6f2ea', ink: '#1d1a17', ink2: '#5d564c', ink3: '#948b7d', line: '#d4cbbb', faint: '#e4dccd', red: '#b3202a', red3: '#f3dcd8', temp: '#c46a12', steel: '#cfc8bb' };
  const MONO = '"SF Mono","JetBrains Mono",Menlo,Consolas,"DejaVu Sans Mono","Noto Sans Mono CJK SC",monospace';
  const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const REAL = [
    { date: '2021-05-31', kind: 'frac', v: 0.465, txt: '拼装累计 46.5%', src: '杭州网' },
    { date: '2021-06-28', kind: 'lift', txt: '整体提升完成（206 台提升器）', src: '央广网' }];
  const SCOPE_KEYS = ['asm1', 'asm2', 'asm3', 'jig1', 'jig2', 'jig3', 'floorS', 'floorN', 'col24S', 'col24N', 'deckS', 'deckN', 'frameS', 'frameN', 'platS', 'platN'];
  const ZONES = [['asm1', 'jig1', 'lift1', 'S', '南区'], ['asm2', 'jig2', 'lift2', 'M', '中区'], ['asm3', 'jig3', 'lift3', 'N', '北区']];
  // 构件状态：-1 未开始 / 0..1 进行中 / 2 完成 / 3 已拆（同 hzsheet.js stOf）
  const stOf = (p, t) => { if (p.st == null || t < p.st) return -1; if (p.rm && p.rm[0] >= 0 && t >= p.rm[0]) return t >= p.rm[0] + p.rm[1] ? 3 : 2; return t < p.st + p.du ? (t - p.st) / p.du : 2; };

  // ---- 模型：只从 HZ 取 ----
  let M = null;
  function model(HZ) {
    const K = HZ.K, sig = ZONES.map(z => [z[0], z[1], z[2]].map(k => K[k] ? K[k].start + ':' + K[k].end + ':' + K[k].parts.map(p => p.st + '/' + p.du).join(',') : '').join(';')).join('|');
    if (M && M.HZ === HZ && M.sig === sig) return M;
    const units = [], jigs = [], zones = [];
    for (const [ak, jk, lk, Z, zn] of ZONES) {
      const A = K[ak]; if (!A) continue;
      const us = A.parts.filter(p => p.cells && p.cells.length).slice().sort((a, b) => a.st - b.st || a.geo.min[2] - b.geo.min[2]);
      const zu = us.map((p, i) => {
        const cells = p.cells.slice().sort((a, b) => a.i - b.i || a.j - b.j);
        const rods = cells.reduce((a, c) => a + c.rods.length, 0);
        const xa = Math.min(...cells.map(c => c.xa)), xb = Math.max(...cells.map(c => c.xb)), za = Math.min(...cells.map(c => c.za)), zb = Math.max(...cells.map(c => c.zb));
        return { id: 'U-' + Z + String(i + 1).padStart(2, '0'), zone: Z, zn, p, cells, rods, tons: p.t || 0, st: p.st, en: p.st + p.du, xa, xb, za, zb, box: [p.geo.min[0], p.geo.min[1], p.geo.min[2], p.geo.max[0], p.geo.max[1], p.geo.max[2]] };
      });
      units.push(...zu);
      for (const k of [jk, jk.replace('jig', 'jigL')]) if (K[k]) for (const p of K[k].parts) if (p.geo && p.jigOf) jigs.push({ p, zone: Z, low: !!p.low, x: (p.geo.min[0] + p.geo.max[0]) / 2, z: (p.geo.min[2] + p.geo.max[2]) / 2 });
      zones.push({ Z, zn, ak, units: zu, lift: K[lk] ? K[lk].start : null, liftName: K[lk] ? K[lk].name : '', st: A.start, en: A.end,
        xa: Math.min(...zu.map(u => u.xa)), xb: Math.max(...zu.map(u => u.xb)), za: Math.min(...zu.map(u => u.za)), zb: Math.max(...zu.map(u => u.zb)) });
    }
    const jst = ZONES.map(z => K[z[1]] && K[z[1]].start).filter(Number.isFinite);
    const win = [Math.floor(Math.min(...jst, ...units.map(u => u.st))), Math.ceil(Math.max(...units.map(u => u.en)) + 3)];
    const ext = { xa: Math.min(...zones.map(z => z.xa)), xb: Math.max(...zones.map(z => z.xb)), za: Math.min(...zones.map(z => z.za)), zb: Math.max(...zones.map(z => z.zb)) };
    const floorY = HZ.P.floorTop;   // 收进落地胎架 jigL 后最低胎架底是 −9.20，基准仍取候车层楼面顶
    // 端部悬挑单元 = 吊装（不在楼面拼）：整个单元落在候车层楼板（floorS/N）南北端以外。出处：张翔宇等《杭州西站站房钢结构屋盖施工技术》（fx361.com/page/2022/0428/14548749.shtml）
    // 「钢结构屋盖采用楼面拼装 + 分区旋转 + 合龙整体提升的方法安装，屋盖南侧悬挑网架结构采用吊装方法安装」；该文只写南区，北端按对称推定（hoistSrc = '推定'）
    const FB = ['floorS', 'floorN'].flatMap(k => K[k] ? K[k].parts.flatMap(p => p.geo.boxes || [p.geo]) : []);
    if (FB.length) { const fz0 = Math.min(...FB.map(b => b.min[2])), fz1 = Math.max(...FB.map(b => b.max[2]));
      for (const u of units) if (u.za >= fz1 - 0.5 || u.zb <= fz0 + 0.5) { u.hoist = true; u.hoistEnd = u.za >= fz1 - 0.5 ? 'S' : 'N'; u.hoistSrc = u.hoistEnd === 'S' ? '论文' : '推定'; } }
    M = { HZ, sig, units, jigs, zones, win, ext, floorY, N: units.length, tonsAll: units.reduce((a, u) => a + u.tons, 0), rodsAll: units.reduce((a, u) => a + u.rods, 0) };
    return M;
  }

  function stateAt(HZ, t) {
    const m = model(HZ);
    const done = m.units.filter(u => t >= u.en), live = m.units.filter(u => t >= u.st && t < u.en);
    const frac = u => clamp((t - u.st) / (u.en - u.st), 0, 1);
    const rodsDone = m.units.reduce((a, u) => a + (t >= u.en ? u.rods : t > u.st ? Math.floor(u.rods * frac(u)) : 0), 0);
    const tons = m.units.reduce((a, u) => a + u.tons * frac(u), 0);
    const jigOn = m.jigs.filter(j => { const s = stOf(j.p, t); return s >= 0 && s < 3; }).length;
    return { done: done.length, live, frac, rodsDone, tons, jigOn };
  }

  // 公开节点对照：模型达到同一进度的天 vs 公开日期（天数差，负 = 模型偏早）
  function dayOf(HZ, date) { for (let t = 0; t < 3000; t += 0.5) if (HZ.dayDate(t) >= date) return t; return NaN; }
  function realCmp(HZ) { const m = model(HZ);
    return REAL.map(r => { const tr = dayOf(HZ, r.date); let tm = NaN;
      if (r.kind === 'frac') { for (let t = m.win[0]; t <= m.win[1] + 30; t += 0.5) if (stateAt(HZ, t).tons / m.tonsAll >= r.v) { tm = t; break; } }
      else tm = Math.max(...ZONES.map(z => HZ.K[z[2]] ? HZ.K[z[2]].end : -Infinity));
      return Object.assign({}, r, { tReal: tr, tModel: tm, dev: Math.round(tm - tr) }); }); }
  function big(HZ, t) {
    const m = model(HZ), s = stateAt(HZ, t);
    if (s.done >= m.N) { const L = Math.min(...m.zones.map(z => z.lift).filter(Number.isFinite)); return { num: m.N + ' / ' + m.N, unit: '单元', label: '网架拼完 · ' + (t < L ? '第 ' + Math.round(L) + ' 天起脱胎提升' : '脱胎提升中（S-301）') }; }
    if (s.done === 0 && !s.live.length) return { num: '0 / ' + m.N, unit: '单元', label: '搭拼装胎架 · ' + s.jigOn + ' 组已就位' };
    return { num: s.done + ' / ' + m.N, unit: '单元', label: '已拼网架单元 · 已焊杆件 ' + s.rodsDone.toLocaleString('en-US') + ' 根' };
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

  // 拼装面基座（D-37）：窗口格子下方的楼板块（承托胎架、已建）、板下柱、在位胎架；全从 HZ 读
  const FLOOR_KEYS = ['floorS', 'floorN'], COL_KEYS = ['col24S', 'col24N'];
  function baseOf(HZ, m, cells, t) {
    const K = HZ.K, xa = Math.min(...cells.map(c => c.xa)), xb = Math.max(...cells.map(c => c.xb)), za = Math.min(...cells.map(c => c.za)), zb = Math.max(...cells.map(c => c.zb)), pad = 7;
    const X0 = xa - pad, X1 = xb + pad, Z0 = za - pad, Z1 = zb + pad, frame = [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]];
    // 楼板 = 已建楼面构件盒与窗口的交（中区 |z| < 14 m 是楼面开口，没有板就不画，如实露出来）
    const keys = new Set(), slabs = []; for (const k of FLOOR_KEYS) if (K[k]) for (const p of K[k].parts) { if (stOf(p, t) < 2) continue; for (const b of p.geo.boxes) { const a0 = Math.max(X0, b.min[0]), a1 = Math.min(X1, b.max[0]), c0 = Math.max(Z0, b.min[2]), c1 = Math.min(Z1, b.max[2]); if (a1 - a0 > 0.5 && c1 - c0 > 0.5) { slabs.push([[a0, c0], [a1, c0], [a1, c1], [a0, c1]]); keys.add(K[k].name); } } }
    const under = cells.filter(c => slabs.some(q => q[0][0] <= c.xc && q[1][0] >= c.xc && q[0][1] <= c.zc && q[2][1] >= c.zc)).length;
    const cols = []; for (const k of COL_KEYS) if (K[k]) for (const p of K[k].parts) { const x = (p.geo.min[0] + p.geo.max[0]) / 2, z = (p.geo.min[2] + p.geo.max[2]) / 2; if (x > xa - pad && x < xb + pad && z > za - pad && z < zb + pad) cols.push([x, z]); }
    const cs = new Set(cells), jigs = m.jigs.filter(j => cs.has(j.p.jigOf) && (s => s >= 0 && s < 3)(stOf(j.p, t))).map(j => ({ x: j.x, z: j.z, y0: j.p.geo.min[1], y1: j.p.geo.max[1] }));
    return { frame, slabs, cols, jigs, open: cells.length - under, slabKey: [...keys].join(' / ') || '无楼板' };
  }

  let HITS = [], HITW = null;
  function draw(g, w, h, t, ctx) {
    const HZ = G.HZ; ctx = ctx || {};
    const PJ = (G.HZA && G.HZA.PROJECT) || HZ.PROJECT || 'HZW', no = PJ + '-S-251-1';
    const tbo = ctx.tb ? ctx.tb(w, h, no, ['网架拼装 · 候车层楼面分单元平面 · 当前单元杆件', '网架拼装 · 平面'], t) : { tb: 20, no, name: '网架拼装' };
    const box = frame(g, w, h, tbo), m = model(HZ), s = stateAt(HZ, t);
    HITS = []; HITW = { w, h, t };
    const labels = [];
    const label = (txt, x, y, col, o) => { o = o || {}; const fs = o.fs || 9; g.font = `${o.b ? '600 ' : ''}${fs}px ${o.mono ? MONO : SANS}`; const tw = g.measureText(txt).width, th = fs + 2;
      let lx = o.al === 'c' ? x - tw / 2 : o.al === 'r' ? x - tw : x; lx = clamp(lx, box.x0 + 2, box.x1 - tw - 2); let ly = clamp(y - th / 2, box.y0 + 1, box.y1 - th - 1);
      for (let k = 0; k < 6 && labels.some(r => lx < r[0] + r[2] && lx + tw > r[0] && ly < r[1] + r[3] && ly + th > r[1]); k++) ly += th;
      labels.push([lx, ly, tw, th]); g.fillStyle = 'rgba(246,242,234,.85)'; g.fillRect(lx - 1, ly, tw + 2, th); g.fillStyle = col; g.textBaseline = 'middle'; g.fillText(txt, lx, ly + th / 2); };
    const addHit = (id, lbl, r, b, clip) => { const x0 = Math.max(clip[0], r[0]), y0 = Math.max(clip[1], r[1]), x1 = Math.min(clip[2], r[0] + r[2]), y1 = Math.min(clip[3], r[1] + r[3]);
      if (x1 - x0 < 2 || y1 - y0 < 2 || !b.every(Number.isFinite)) return; HITS.push({ id, label: lbl, hit: [x0, y0, x1 - x0, y1 - y0], box: b }); };
    const small = h < 260 || w < 420;

    // 版面：左栏大数字；中间平面（北上东右）；右边当前单元轴测（宽画幅才有）
    // 竖长条（D-08：右栏约 600×980、800×1200）：大数字改顶部横带（两列），平面满宽居中，当前单元轴测移到底部满宽
    const BW = box.x1 - box.x0, BH = box.y1 - box.y0, tall = !small && BH > BW * 1.15 && BH >= 460;
    const topH = tall ? Math.round(clamp(BH * 0.15, 120, 170)) : 0, botH = tall ? Math.round(clamp(BH * 0.27, 160, 340)) : 0;
    const gut = small || tall ? 0 : clamp(Math.round(w * 0.2), 130, 220);
    const right = tall ? 1 : !small && w - gut > 520 ? clamp(Math.round((w - gut) * 0.36), 200, 420) : 0;
    const pa = { x0: box.x0 + gut + 6, y0: box.y0 + (small ? 30 : tall ? topH : 16), x1: box.x1 - (tall ? 0 : right) - 8, y1: box.y1 - 16 - botH };
    const E = m.ext, k = Math.min((pa.x1 - pa.x0) / (E.xb - E.xa), (pa.y1 - pa.y0) / (E.zb - E.za));
    const ox = (pa.x0 + pa.x1) / 2 - (E.xa + E.xb) / 2 * k, oy = (pa.y0 + pa.y1) / 2 - (E.za + E.zb) / 2 * k;
    const X = x => ox + x * k, Y = z => oy + z * k;
    const clip = [pa.x0, pa.y0, pa.x1, pa.y1];

    // 平面：每格一个方框；未开始淡线，拼装中红（已焊的格子按进度变黑），拼完墨灰
    g.save(); g.beginPath(); g.rect(pa.x0 - 2, pa.y0 - 2, pa.x1 - pa.x0 + 4, pa.y1 - pa.y0 + 4); g.clip();
    for (const u of m.units) {
      const f = s.frac(u), nOn = t >= u.en ? u.cells.length : t > u.st ? Math.floor(u.cells.length * f) : 0, live = t >= u.st && t < u.en;
      u.cells.forEach((c, i) => { const x = X(c.xa), y = Y(c.za), cw = (c.xb - c.xa) * k, ch = (c.zb - c.za) * k;
        if (i < nOn) { g.fillStyle = live ? C.red3 : C.steel; g.fillRect(x, y, cw, ch); g.strokeStyle = live ? C.red : C.ink2; g.lineWidth = 0.5; g.strokeRect(x, y, cw, ch);
          if (cw > 7) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + cw, y + ch); g.moveTo(x + cw, y); g.lineTo(x, y + ch); g.strokeStyle = live ? C.red : C.ink3; g.lineWidth = 0.35; g.stroke(); } }
        else { g.strokeStyle = live ? C.red : C.faint; g.lineWidth = live ? 0.6 : 0.4; g.strokeRect(x, y, cw, ch); } });
      if (live) { g.strokeStyle = C.red; g.lineWidth = 1.4; g.strokeRect(X(u.xa), Y(u.za), (u.xb - u.xa) * k, (u.zb - u.za) * k); }
    }
    // 端部悬挑吊装单元：外框橙色虚线（与胎架同为临时措施色），区别于楼面拼装
    g.setLineDash([3, 2]); g.strokeStyle = C.temp; g.lineWidth = 0.9; for (const u of m.units) if (u.hoist) g.strokeRect(X(u.xa) - 1, Y(u.za) - 1, (u.xb - u.xa) * k + 2, (u.zb - u.za) * k + 2); g.setLineDash([]);
    // 楼面基座（D-37）：候车层楼板块外框（淡墨）与板下柱位（小点），与 S-201 / S-301 同一轴网
    g.strokeStyle = C.line; g.lineWidth = 0.5; for (const fk of FLOOR_KEYS) if (HZ.K[fk]) for (const p of HZ.K[fk].parts) if (stOf(p, t) >= 2) for (const b of p.geo.boxes) g.strokeRect(X(b.min[0]), Y(b.min[2]), (b.max[0] - b.min[0]) * k, (b.max[2] - b.min[2]) * k);
    g.fillStyle = C.ink3; for (const ck of COL_KEYS) if (HZ.K[ck]) for (const p of HZ.K[ck].parts) { const x = (p.geo.min[0] + p.geo.max[0]) / 2, z = (p.geo.min[2] + p.geo.max[2]) / 2; g.fillRect(X(x) - 1, Y(z) - 1, 2, 2); }
    // 胎架：在位的画成小方块（临时，橙）
    g.fillStyle = C.temp; const js = clamp(k * 1.2, 1.2, 3);
    for (const j of m.jigs) { const st = stOf(j.p, t); if (st < 0 || st >= 3) continue; g.fillRect(X(j.x) - js / 2, Y(j.z) - js / 2, js, js); }
    // 三区分界与区名
    for (const z of m.zones) { g.strokeStyle = C.ink; g.lineWidth = 0.8; g.setLineDash([4, 3]); g.strokeRect(X(z.xa), Y(z.za), (z.xb - z.xa) * k, (z.zb - z.za) * k); g.setLineDash([]); }
    g.restore();
    if (!small) for (const e of ['S', 'N']) { const hu = m.units.filter(u => u.hoist && u.hoistEnd === e); if (!hu.length) continue; const zz = e === 'S' ? Math.max(...hu.map(u => u.zb)) : Math.min(...hu.map(u => u.za)), xx = Math.min(...hu.map(u => u.xa));
      label((e === 'S' ? '南' : '北') + '端悬挑 ' + hu.length + ' 单元 · 落地胎架 + 履带吊吊装' + (hu[0].hoistSrc === '推定' ? '（按南端推定）' : ''), X(xx), Y(zz) + (e === 'S' ? 9 : -4), C.temp, { fs: 8 }); }
    if (!small) for (const z of m.zones) { const dn = z.units.filter(u => t >= u.en).length; label(z.zn + ' ' + dn + '/' + z.units.length, X(z.xb) - 2, Y(z.za) + 8, C.ink2, { al: 'r', b: true }); }
    // 可点：三个拼装区（小画幅也点得到）+ 每个单元（平面框 → 3D 世界盒）
    for (const z of m.zones) { const bs = z.units.map(u => u.box); addHit('Z-' + z.Z, z.zn + '拼装区（' + z.units.length + ' 个单元）', [X(z.xa), Y(z.za), (z.xb - z.xa) * k, (z.zb - z.za) * k], [0, 1, 2].map(i => Math.min(...bs.map(b => b[i]))).concat([3, 4, 5].map(i => Math.max(...bs.map(b => b[i])))), clip); }
    for (const u of m.units) addHit(u.id, '网架单元 ' + u.id + '（' + u.zn + '，' + u.cells.length + ' 格，' + Math.round(u.tons) + ' t）', [X(u.xa), Y(u.za), (u.xb - u.xa) * k, (u.zb - u.za) * k], u.box, clip);
    if (!small) { label('北 ↑', pa.x1 - 2, pa.y0 - 6, C.ink3, { al: 'r' });
      const sb = 50 * k; g.strokeStyle = C.ink2; g.lineWidth = 1; g.beginPath(); g.moveTo(pa.x0, pa.y1 + 8); g.lineTo(pa.x0 + sb, pa.y1 + 8); g.stroke(); label('50 m', pa.x0 + sb + 4, pa.y1 + 8, C.ink3, {}); }

    // 右栏：当前单元杆件轴测（拼装中最新开工的那个；没有就画最近拼完的），已焊杆件墨线、待焊淡线，节点 = 焊口
    let focusU = ctx.focus && m.units.find(u => u.id === ctx.focus);
    const cur = focusU || s.live.slice().sort((a, b) => b.st - a.st)[0] || m.units.filter(u => t >= u.en).sort((a, b) => b.en - a.en)[0] || m.units[0];
    if (right && cur) {
      const ra = tall ? { x0: box.x0 + 10, y0: box.y1 - botH + 8, x1: box.x1 - 10, y1: box.y1 - 40 } : { x0: box.x1 - right + 4, y0: box.y0 + 16, x1: box.x1 - 6, y1: box.y1 - 40 };
      g.strokeStyle = C.line; g.lineWidth = 0.6; g.beginPath(); if (tall) { g.moveTo(box.x0 + 6, ra.y0 - 8); g.lineTo(box.x1 - 6, ra.y0 - 8); } else { g.moveTo(ra.x0 - 6, box.y0 + 6); g.lineTo(ra.x0 - 6, box.y1 - 6); } g.stroke();
      // 局部：只画正在焊的那几格（单元是 7 m 一格的长条，整条画出来只剩一根线）；正等轴测，竖向 ×2 看得出上下弦与腹杆
      const nCell = cur.cells.length, fC = s.frac(cur), cOn = t >= cur.en ? nCell : Math.floor(nCell * fC), NW = Math.min(4, nCell);
      const i0 = clamp(cOn - Math.floor(NW / 2), 0, nCell - NW), win = cur.cells.slice(i0, i0 + NW);
      // D-37：零点 = 候车层楼面顶 P.floorTop（S-201 楼面、S-301 提升起点同一标高）；杆件按当前位姿 HZ.xf(HZ.pose(t)) 落在胎架上（与 3D 同口径）
      const c30 = Math.cos(Math.PI / 6), s30 = 0.5, KY = 2, FT = HZ.P.floorTop, FB = HZ.P.floorBot, P0 = (x, y, z) => [(x - z) * c30, (x + z) * s30 - KY * (y - FT)];
      const ps = HZ.pose(t), rods = [], onFlag = []; win.forEach((c, ci) => { const gi = i0 + ci, cf = gi < cOn ? 1 : gi === cOn && t < cur.en ? nCell * fC - cOn : 0; c.rods.forEach((r, ri) => { rods.push([HZ.xf(ps, c.grp, r[0]), HZ.xf(ps, c.grp, r[1]), r[2]]); onFlag.push(ri < Math.floor(c.rods.length * cf + 1e-9)); }); });
      const base = baseOf(HZ, m, win, t), pts = rods.flatMap(r => [P0(...r[0]), P0(...r[1])]).concat(base.frame.flatMap(q => [P0(q[0], FT, q[1]), P0(q[0], FB - 4, q[1])]));
      const bx = [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0]))], by = [Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1]))];
      const kk = Math.min((ra.x1 - ra.x0) / (bx[1] - bx[0] || 1), (ra.y1 - ra.y0 - 34) / (by[1] - by[0] || 1));
      const ox2 = (ra.x0 + ra.x1) / 2 - (bx[0] + bx[1]) / 2 * kk, oy2 = (ra.y0 + 34 + ra.y1) / 2 - (by[0] + by[1]) / 2 * kk;
      const Q = v => { const p = P0(v[0], v[1], v[2]); return [ox2 + p[0] * kk, oy2 + p[1] * kk]; };
      const liveU = t >= cur.st && t < cur.en;
      // 楼面基座：楼板（顶面 + 板厚）、板下候车层柱（断开画）、胎架（橙）
      const poly = (vs, fill, stroke, lw) => { g.beginPath(); vs.forEach((v, i) => { const q = Q(v); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 0.8; g.stroke(); } };
      for (const SL of base.slabs) { for (const [a0, a1] of [[1, 2], [2, 3]]) poly([[SL[a0][0], FT, SL[a0][1]], [SL[a1][0], FT, SL[a1][1]], [SL[a1][0], FB, SL[a1][1]], [SL[a0][0], FB, SL[a0][1]]], '#d9d0bf', C.ink2, 0.8);
        poly(SL.map(q => [q[0], FT, q[1]]), '#ebe4d6', C.ink2, 0.9); }
      g.setLineDash([3, 3]); poly(base.frame.map(q => [q[0], FT, q[1]]), null, C.line, 0.6); g.setLineDash([]);
      g.strokeStyle = C.ink3; g.lineWidth = 1.2; for (const c of base.cols) { const a = Q([c[0], FB, c[1]]), b = Q([c[0], FB - 4, c[1]]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(b[0] - 3, b[1] - 1); g.lineTo(b[0] + 3, b[1] + 1); g.stroke(); }
      g.save(); g.beginPath(); g.rect(ra.x0, ra.y0, ra.x1 - ra.x0, box.y1 - 44 - ra.y0); g.clip();   // 落地胎架（地坪 / 地铁层底板）比楼面胎架长 24–33 m，裁在本栏内
      g.strokeStyle = C.temp; g.lineWidth = 1.4; for (const j of base.jigs) { const a = Q([j.x, j.y0, j.z]), b = Q([j.x, j.y1, j.z]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); } g.restore();
      { const F = base.frame, q = Q([F[2][0], FT, F[2][1]]); label('候车层楼面 ▽+' + FT.toFixed(2) + '（' + base.slabKey + '）' + (base.open ? ' · 本段 ' + base.open + ' 格下方无楼板（开口或楼面外）' : ''), q[0] + 4, q[1] + 6, base.open ? C.red : C.ink2, { fs: 8 }); }
      rods.forEach((r, i) => { const a = Q(r[0]), b = Q(r[1]); g.strokeStyle = onFlag[i] ? (liveU ? C.red : C.ink) : C.line; g.lineWidth = r[2] >= 0.3 ? 1.6 : 0.8; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
      const seen = new Set(); g.fillStyle = C.ink;
      rods.forEach((r, i) => { if (!onFlag[i]) return; for (const v of [r[0], r[1]]) { const key = v.map(q => q.toFixed(1)).join(); if (seen.has(key)) continue; seen.add(key); const q = Q(v); g.beginPath(); g.arc(q[0], q[1], 2.2, 0, 7); g.fill(); } });
      const rodsAll = cur.cells.reduce((a2, c) => a2 + c.rods.length, 0), cc = cur.cells[cOn];
      const rodsOn = t >= cur.en ? rodsAll : cur.cells.slice(0, cOn).reduce((a2, c) => a2 + c.rods.length, 0) + (cc && t >= cur.st ? Math.floor(cc.rods.length * (nCell * fC - cOn) + 1e-9) : 0);
      const nOn = clamp(rodsOn, 0, rodsAll);
      label('单元 ' + cur.id + ' · ' + cur.zn + ' · ' + nCell + ' 格 · ' + Math.round(cur.tons) + ' t', ra.x0, ra.y0, C.ink, { b: true });
      label('杆件 ' + nOn + ' / ' + rodsAll + ' 根 · 焊口 ' + nOn * 2 + ' / ' + rodsAll * 2, ra.x0, ra.y0 + 13, liveU ? C.red : C.ink2, {});
      label('局部：第 ' + (i0 + 1) + '–' + (i0 + NW) + ' 格（每格 7 m，竖向 ×' + KY + '）', ra.x0, ra.y0 + 26, C.ink3, { fs: 8 });
      label('上弦粗线 · 腹杆细线 · 黑点 = 已焊节点 · 橙 = 胎架 ' + base.jigs.length + ' 组', ra.x0, box.y1 - 30, C.ink3, { fs: 8 });
    }

    // 左栏：大数字
    const B = big(HZ, t), dayTxt = '第 ' + Math.round(t) + ' 天' + (HZ.dayDate ? ' · ' + HZ.dayDate(t) : '');
    if (!small) {
      const colW = tall ? Math.round(BW * 0.48) : gut, FS = tall ? clamp(Math.round(BW / 15), 30, 48) : clamp(Math.round(gut / 4.2), 24, 40);
      let cx = box.x0 + 8;
      g.textBaseline = 'alphabetic'; g.fillStyle = C.ink; g.font = `600 ${FS}px ${MONO}`; const nt = String(B.num); g.fillText(nt, cx, box.y0 + 12 + FS);
      g.font = `600 ${Math.round(FS * 0.36)}px ${SANS}`; g.fillStyle = C.ink2; g.fillText(B.unit, cx, box.y0 + 26 + FS + Math.round(FS * 0.2));
      let ly = box.y0 + 46 + FS + Math.round(FS * 0.2);
      const wrap = (txt, col, fsz) => { g.font = `${fsz || 10}px ${SANS}`; g.fillStyle = col; let line0 = ''; for (const ch of txt) { if (g.measureText(line0 + ch).width > colW - 10) { g.fillText(line0, cx, ly); ly += (fsz || 10) + 4; line0 = ch; } else line0 += ch; } if (line0) { g.fillText(line0, cx, ly); ly += (fsz || 10) + 4; } };
      wrap(B.label, C.ink2); wrap(dayTxt, C.ink3, 9); ly += 4;
      if (tall) { cx = box.x0 + 8 + colW + 12; ly = box.y0 + 22; }
      wrap('已拼钢量约 ' + Math.round(s.tons).toLocaleString('en-US') + ' / ' + Math.round(m.tonsAll).toLocaleString('en-US') + ' t', C.ink2, 9);
      wrap('在位胎架 ' + s.jigOn + ' 组', C.temp, 9);
      for (const u of s.live.slice(0, 3)) wrap('▸ ' + u.zn + ' ' + u.id + ' 拼装中', C.red, 10);
      // 公开对照（墨灰小字）：公开日期 · 事件 · 模型偏差
      ly += 6; wrap('公开对照', C.ink3, 8);
      for (const r of realCmp(HZ)) wrap(r.date.slice(5) + ' ' + r.txt + '（' + r.src + '）· 模型' + (r.dev === 0 ? '同日' : r.dev < 0 ? '早 ' + -r.dev + ' 天' : '晚 ' + r.dev + ' 天'), t >= r.tReal ? C.ink2 : C.ink3, 8);
    } else {
      label(B.num + ' ' + B.unit, box.x0 + 6, box.y0 + 9, C.ink, { b: true, fs: 12 });
      if (s.live[0]) label(s.live[0].zn + ' ' + s.live[0].id + ' 拼装中', box.x0 + 6, box.y0 + 23, C.red, {});
    }

    const fh = ctx.focus && HITS.find(o => o.id === ctx.focus);
    if (fh) { g.save(); g.strokeStyle = '#f2b705'; g.lineWidth = 2.2; g.strokeRect(fh.hit[0] + 0.5, fh.hit[1] + 0.5, fh.hit[2] - 1, fh.hit[3] - 1); g.restore(); label(fh.label, fh.hit[0] + 2, Math.max(box.y0 + 8, fh.hit[1] - 7), '#8a6a00', { b: true }); }
    return { state: s };
  }

  function nullCtx() { const noop = () => {}; return new Proxy({ measureText: s => ({ width: String(s).length * 6 }) }, { get: (o, k) => (k in o ? o[k] : noop), set: () => true }); }
  function parts(t, ctx) {
    if (!HITW || Math.abs(HITW.t - t) > 1e-9) draw(nullCtx(), HITW ? HITW.w : 760, HITW ? HITW.h : 420, t, Object.assign({}, ctx || {}, { focus: null }));
    return HITS.map(o => ({ id: o.id, label: o.label, hit: o.hit.slice(), box: o.box.slice() }));
  }

  // 镜头：由拼装节拍推导——每 3 天一帧，目标 = 正在拼的单元的中心、高度在其上弦之上（没有就全场），站在东南高处斜看候车层楼面
  let CAM = null;
  function cams(HZ) {
    const m = model(HZ); if (CAM && CAM.sig === m.sig) return CAM.k;
    const out = [], [W0, W1] = m.win, cx = (m.ext.xa + m.ext.xb) / 2, cz = (m.ext.za + m.ext.zb) / 2;
    for (let t = W0; t <= W1 + 1e-9; t += 3) {
      const live = m.units.filter(u => t >= u.st && t < u.en), sel = live.length ? live : null;
      const tx = sel ? sel.reduce((a, u) => a + (u.xa + u.xb) / 2, 0) / sel.length : cx, tz = sel ? sel.reduce((a, u) => a + (u.za + u.zb) / 2, 0) / sel.length : cz;
      const spread = sel ? Math.max(60, ...sel.map(u => Math.hypot((u.xa + u.xb) / 2 - tx, (u.za + u.zb) / 2 - tz) * 2 + Math.max(u.xb - u.xa, u.zb - u.za))) : 330;
      const ty = Math.max(...(sel || m.units).map(u => u.box[4])) + 2;   // 目标放在网架上弦之上，视线不被网架自身挡住
      out.push({ t, target: [Math.round(tx * 0.6 + cx * 0.4), Math.round(ty), Math.round(tz * 0.6 + cz * 0.4)], az: 135, el: 28, dist: Math.round(clamp(spread * 1.25, 260, 520)) });
    }
    CAM = { sig: m.sig, k: out }; return out;
  }

  const plugin = {
    id: 'S-251', name: '网架拼装',
    get window() { return model(G.HZ).win; },
    big: t => big(G.HZ, t),
    draw, parts,
    get cam() { return cams(G.HZ); },
    subject: () => ['asm1', 'asm2', 'asm3', 'jig1', 'jig2', 'jig3'],
    // D-37 图纸范围：网架 + 胎架 + 托胎架的候车层楼面及其柱 + 下面的承轨层（框架柱、承轨层板、站台），与 S-201 末、S-301 起衔接
    get scope() { const K = G.HZ && G.HZ.K || {}; return { keys: SCOPE_KEYS.filter(k => K[k]) }; },
    floorKeys: FLOOR_KEYS,
    model: () => model(G.HZ), realCmp: () => realCmp(G.HZ), stateAt: t => stateAt(G.HZ, t),
  };
  (G.HZ_SHEET_PLUGINS = G.HZ_SHEET_PLUGINS || []).push(plugin);
})(typeof window !== 'undefined' ? window : globalThis);
