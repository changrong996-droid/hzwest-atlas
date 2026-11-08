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

// 4 镜头：关键帧在时间窗内、按时间递增、目标在地面以上、仰角 > 0
let lt = -1e9;
for (const k of pl.cam || []) {
  if (!(k.t >= w0 && k.t <= w1) || k.t <= lt) fail('镜头关键帧时间不在窗内或未递增 t=' + k.t);
  if (!(k.target[1] > 0 && k.el > 0 && k.dist > 0)) fail('镜头关键帧会入地或参数非法 t=' + k.t);
  if (k.dist * Math.sin(k.el * Math.PI / 180) + k.target[1] < 70) fail('镜头机位低于屋面以上 70 m t=' + k.t);
  lt = k.t;
}
if (!(pl.cam && pl.cam.length >= 2)) fail('镜头关键帧不足 2 个');

console.log(`OK check_s401 runs=${runs} close=${pl.big(w1).num}% pv=${Math.round(sEnd.pv)} holes=${sEnd.holesTot}`);
