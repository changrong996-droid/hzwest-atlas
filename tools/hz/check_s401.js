'use strict';
// S-401 屋面插件（web/sheets/s401.js）无头检查：登记字段、7 个时刻 × 2 尺寸绘制、图号、大数字单调、终态数值、镜头不入地。
const { load, makeCtx, sheetCtx } = require('./harness');
const { G, HZ } = load({ extra: ['web/hzatlas.js', 'web/sheets/s401.js'] });
HZ.make();
const fail = (m) => { console.log('FAIL check_s401: ' + m); process.exit(1); };
const pl = (G.HZ_SHEET_PLUGINS || []).find((p) => p && p.id === 'S-401');
if (!pl) fail('HZ_SHEET_PLUGINS 里没有 S-401');
if (typeof pl.draw !== 'function' || typeof pl.big !== 'function') fail('缺 draw / big');
const K = HZ.K, [w0, w1] = pl.window;
if (!(w0 === K.holes.start && w1 === K.pv.end)) fail(`时间窗 ${w0}–${w1} 与 holes.start ${K.holes.start} / pv.end ${K.pv.end} 不一致`);
const NO = G.HZA.PROJECT + '-S-401-1';

// 1 绘制：时间窗内 7 个时刻（含前后各外延 1 天）× 2 尺寸
const times = [w0 - 1, K.holes.start + 5, K.sky.start + 10, K.clad.start + 30, K.clad.end - 2, K.pv.start + 15, w1 + 1];
let runs = 0, slow = 0;
for (const t of times) for (const [w, h] of [[560, 420], [300, 160]]) {
  const c = makeCtx(), ctx = sheetCtx();
  const t0 = Date.now();
  try { pl.draw(c.g, w, h, t, ctx); } catch (e) { fail(`draw t=${t} ${w}x${h} 抛错 ${e && e.message}`); }
  if (Date.now() - t0 > 200) slow++;
  if (ctx.seenNo !== NO) fail(`图号 期望 ${NO} 实得 ${ctx.seenNo}`);
  if (!((c.calls.fillRect || 0) >= 1) || c.texts.length < 1) fail(`t=${t} ${w}x${h} 未画图框或未写字`);
  runs++;
}
if (slow > 2) fail('绘制过慢（>200 ms）次数 ' + slow);

// 2 大数字：0–100、单调不减；起点 0、金属屋面完成后 100
let prev = -1;
for (let t = w0 - 2; t <= w1 + 2; t += 0.5) {
  const b = pl.big(t);
  if (!b || typeof b.num !== 'number' || !(b.num >= 0 && b.num <= 100)) fail(`big(${t}) 越界 ${JSON.stringify(b)}`);
  if (b.num < prev) fail(`big 不单调：t=${t} ${b.num} < ${prev}`);
  prev = b.num;
}
if (pl.big(K.sky.start - 0.01).num !== 0) fail('采光顶开工前封闭率应为 0');
if (pl.big(Math.max(K.sky.end, K.clad.end) + 0.01).num !== 100) fail('采光顶 + 金属屋面完成后封闭率应为 100');

// 3 终态：提升孔全补、光伏面积 = HZ.pvArea；光伏开工前为 0
const sEnd = pl.stats(w1 + 0.01), sPv0 = pl.stats(K.pv.start - 0.01);
if (sEnd.holesOpen !== 0) fail('完成时仍有提升孔未补：' + sEnd.holesOpen);
if (Math.abs(sEnd.pv - HZ.pvArea) > 1) fail(`光伏终值 ${sEnd.pv} ≠ HZ.pvArea ${HZ.pvArea}`);
if (sPv0.pv !== 0) fail('光伏开工前面积应为 0');
let pp = -1; for (let t = K.pv.start; t <= K.pv.end; t += 1) { const v = pl.stats(t).pv; if (v < pp - 1e-6) fail('光伏面积不单调 t=' + t); pp = v; }
// D-42 光伏南先北后（与 hzview.js 同式 z ≥ 175 − 345·u）：中段面积约为终值一半；u = 0.25 时引线落在南半（z > 0）、u = 0.75 时落在北半（z < 0）
{ const r = pl.stats((K.pv.start + K.pv.end) / 2).pv / sEnd.pv; if (!(r > 0.35 && r < 0.65)) fail('光伏中段面积占比 ' + r.toFixed(3) + ' 不在 0.35–0.65');
  const La = pl.leadAt(K.pv.start + 0.25 * K.pv.dur), Lb = pl.leadAt(K.pv.start + 0.75 * K.pv.dur);
  if (!(La && La.p[2] > 0 && Lb && Lb.p[2] < 0)) fail('光伏引线未按南先北后推进 ' + (La && La.p[2]) + ' / ' + (Lb && Lb.p[2])); }

// 4 镜头：关键帧在时间窗内、按时间递增、目标在地面以上、仰角 > 0
let lt = -1e9;
for (const k of pl.cam || []) {
  if (!(k.t >= w0 && k.t <= w1) || k.t <= lt) fail('镜头关键帧时间不在窗内或未递增 t=' + k.t);
  if (!(k.target[1] > 0 && k.el > 0 && k.dist > 0)) fail('镜头关键帧会入地或参数非法 t=' + k.t);
  if (k.dist * Math.sin(k.el * Math.PI / 180) + k.target[1] < 70) fail('镜头机位低于屋面以上 70 m t=' + k.t);
  lt = k.t;
}
if (!(pl.cam && pl.cam.length >= 2)) fail('镜头关键帧不足 2 个');

// 5 二稿 parts：窗内每个采样时刻 ≥1 项、id 唯一、hit 在画布内、box 有限且非零体积；选中项绘制不抛错
if (typeof pl.parts !== 'function') fail('缺 parts()');
let nParts = 0;
for (const [w, h] of [[600, 420], [300, 560], [1258 * 0.45, 540 - 60], [600, 984], [800, 1200]]) {
  const c0 = makeCtx(); pl.draw(c0.g, w, h, w0, sheetCtx());   // 先画一次，parts 用同一版面
  for (let t = w0; t <= w1; t += (w1 - w0) / 8) {
    const ps = pl.parts(t, { w, h });
    if (!ps.length) fail(`parts(${t}) 为空`);
    const ids = new Set();
    for (const q of ps) {
      if (ids.has(q.id)) fail('part id 重复 ' + q.id); ids.add(q.id);
      const [x, y, ww, hh] = q.hit; if (!(x >= 0 && y >= 0 && x + ww <= w + 0.5 && y + hh <= h + 0.5 && ww > 0 && hh > 0)) fail(`hit 越界 ${q.id} ${q.hit.map(v => v.toFixed(1))} @${w}x${h}`);
      const b = q.box; if (!(b.every(Number.isFinite) && b[3] > b[0] && b[4] > b[1] && b[5] > b[2])) fail('box 非法 ' + q.id + ' ' + b);
      if (!q.label || !Array.isArray(q.info) || q.info.length < 3) fail('label / info 缺 ' + q.id);
    }
    nParts = ps.length;
  }
}
const kinds = new Set(pl.parts(w1).map(q => q.kind)); for (const k of ['hole', 'sky', 'clad', 'pv']) if (!kinds.has(k)) fail('parts 缺类别 ' + k);
for (const id of ['CL-ZN-E', 'SK-ZM', 'PV-ZS-W']) { const c = makeCtx(); try { pl.draw(c.g, 600, 420, K.pv.start + 10, sheetCtx(null, { focus: id })); } catch (e) { fail('focus=' + id + ' 绘制抛错 ' + e.message); } }
const hj = pl.parts(w0).filter(q => q.kind === 'hole' && /^H-J\d\d[ab]$/.test(q.id)).length;
if (hj < 40) fail('提升孔与提升器 Jnn 对应过少：' + hj);
// 5b 竖长画布（D-08）：平面转向后比横放大 ≥1.4 倍；转向后 focus 绘制不抛错、选中项 hit 仍在画布内
{ const sc = [];
  for (const [w, h] of [[600, 420], [600, 984]]) { let got = 0; const c = makeCtx(); pl.draw(c.g, w, h, w1, Object.assign(sheetCtx(), { setScale: v => { got = v; } })); sc.push(got); }
  const cl = makeCtx(); pl.draw(cl.g, 600, 600 * 0.42, w1, Object.assign(sheetCtx(), { setScale: v => { sc.push(v); } }));
  if (!(sc[1] >= sc[2] * 1.4)) fail(`竖栏未放大：600x984 比例 ${sc[1]} vs 同宽横排 ${sc[2]}`);
  for (const id of ['CL-ZN-E', 'H-J07a']) { const c = makeCtx(); try { pl.draw(c.g, 600, 984, id[0] === 'H' ? w0 : w1, sheetCtx(null, { focus: id })); } catch (e) { fail('竖栏 focus=' + id + ' 抛错 ' + e.message); } }
}
// 6 改 HZ 图跟着变：光伏开工推后 10 天 → 同一时刻光伏面积变小、PV 构件工期跟着变
const tp = K.pv.start + 15, pvA = pl.stats(tp).pv, pvInfo = JSON.stringify(pl.parts(tp).find(q => q.kind === 'pv').info);
K.pv.start += 10; const pvB = pl.stats(tp).pv, pvInfo2 = JSON.stringify(pl.parts(tp).find(q => q.kind === 'pv').info); K.pv.start -= 10;
if (!(pvB < pvA)) fail(`改 HZ.K.pv.start 后光伏面积未变 ${pvA} → ${pvB}`);
if (pvInfo === pvInfo2) fail('改 HZ.K.pv.start 后 parts 工期未变');

// 7 屋盖工序（holes、sky、clad、pv）整体 +7 / −7 天：pl.window 与 pl.cam 首尾帧跟着变，检查完恢复原值
{
  const roofKeys = ['holes', 'sky', 'clad', 'pv'];
  const cam0 = pl.cam.map(k => k.t), c0 = cam0[0], c1 = cam0[cam0.length - 1];
  for (const d of [7, -7]) {
    for (const k of roofKeys) { K[k].start += d; K[k].end += d; }
    const [nw0, nw1] = pl.window, cm = pl.cam, nc0 = cm[0].t, nc1 = cm[cm.length - 1].t;
    for (const k of roofKeys) { K[k].start -= d; K[k].end -= d; }
    if (nw0 !== w0 + d || nw1 !== w1 + d) fail(`屋盖工序 ${d > 0 ? '+' : ''}${d} 天后 window 期望 [${w0 + d},${w1 + d}] 实得 [${nw0},${nw1}]`);
    if (nc0 !== c0 + d || nc1 !== c1 + d || cm.some((k, i) => k.t !== cam0[i] + d)) fail(`屋盖工序 ${d > 0 ? '+' : ''}${d} 天后 cam 首尾期望 [${c0 + d},${c1 + d}] 实得 [${nc0},${nc1}]`);
  }
  if (pl.window[0] !== w0 || pl.window[1] !== w1 || pl.cam[0].t !== c0 || pl.cam[pl.cam.length - 1].t !== c1) fail('屋盖工序恢复后 window / cam 未回到原值');
}

// 前沿方向标签：横排北在左（←北），竖排北在上（↑北）
{ const src = require('fs').readFileSync(require('path').join(__dirname, '../../web/sheets/s401.js'), 'utf8'); if (!src.includes("'铺设 ↑北' : '铺设 ←北'")) fail('S-401 铺设前沿方向标签应为 ↑北 / ←北'); }

console.log(`OK check_s401 runs=${runs} parts=${nParts} close=${pl.big(w1).num}% pv=${Math.round(sEnd.pv)} holes=${sEnd.holesTot}`);

