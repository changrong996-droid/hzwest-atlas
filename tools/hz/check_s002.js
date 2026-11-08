'use strict';
// S-002 吊装资源（web/sheets/s002.js）无头检查 · hark-darrio
// 绘制不抛错、图号、大数字 = 塔吊在场台数 + 履带吊台数、数据从 HZ 读（改塔吊拆除时间图跟着变）、
// 超吊距吊次与 check_crane.js 一致、联动 v2 parts()、镜头不进地下。
const { spawnSync } = require('child_process');
const path = require('path');
const { load, sheetCtx } = require('./harness');
const { G, HZ, makeCtx } = load({ extra: ['web/sheets/s002.js'] });
HZ.make();
const fail = m => { console.log('FAIL check_s002: ' + m); process.exit(1); };
const P = (G.HZ_SHEET_PLUGINS || []).find(p => p.id === 'S-002');
if (!P) fail('未登记 HZ_SHEET_PLUGINS S-002');
const K = HZ.K, PJ = (G.HZA && G.HZA.PROJECT) || HZ.PROJECT || 'HZW', NO = PJ + '-S-002-1';
const [W0, W1] = P.window, m = P.model();
if (!(W0 <= K.crane.start && W1 >= K['crane~rm'].start)) fail(`时间窗 ${P.window} 没盖住塔吊在场`);
if (m.towers.length !== HZ.cranes.length) fail(`塔吊 ${m.towers.length} ≠ HZ.cranes ${HZ.cranes.length}`);
if (m.lifts.length !== HZ.lift.crawler) fail(`履带吊吊次 ${m.lifts.length} ≠ HZ.lift.crawler ${HZ.lift.crawler}`);

// 1. 绘制：多个时刻 × 三档画幅
let runs = 0;
for (const t of [W0, 400, 600, 615, 900, W1]) for (const [w, h] of [[760, 420], [1258, 540], [300, 160], [600, 980]]) {
  const c = makeCtx(), ctx = sheetCtx();
  try { P.draw(c.g, w, h, t, ctx); } catch (e) { fail(`draw t=${t} ${w}x${h} ${e && e.stack}`); }
  if (ctx.seenNo !== NO) fail(`图号 期望 ${NO} 实得 ${ctx.seenNo}`);
  if (!(c.texts.length >= 1)) fail(`t=${t} ${w}x${h} 没写字`); runs++;
}
// 2. 大数字：整数台，= 当天在场塔吊 + 履带吊台数；塔吊在场时 ≥ 塔吊台数
let peak = 0;
for (let t = W0; t <= W1; t += 1) {
  const b = P.big(t), s = P.stateAt(t), n = +b.num;
  if (!/^\d+$/.test(b.num) || b.unit !== '台' || !b.label) fail(`big(${t}) 格式 ${b.num} ${b.unit}`);
  if (n !== s.tw.length + s.crane.length) fail(`big(${t}) ${n} ≠ 塔吊 ${s.tw.length} + 履带吊 ${s.crane.length}`);
  const twIn = HZ.cranes.filter(c => t >= K[c.key].start && t < K[c.key + '~rm'].end).length;
  if (s.tw.length !== twIn) fail(`t=${t} 塔吊在场 ${s.tw.length} ≠ HZ ${twIn}`);
  for (const c of s.crane) for (const l of c.lifts) if (Math.hypot(l.x - c.x, l.z - c.z) > 30 + 1e-6) fail(`t=${t} 同台站位相距 > 30 m`);
  peak = Math.max(peak, n);
}
// 3. 超吊距与 check_crane.js 同算法：总数一致
const cc = spawnSync(process.execPath, [path.join(__dirname, 'check_crane.js')], { encoding: 'utf8' });
const mm = /超650=(\d+)/.exec(cc.stdout || ''); if (!mm) fail('读不到 check_crane 的 超650');
if (m.nOver !== +mm[1]) fail(`超吊距 ${m.nOver} ≠ check_crane 超650=${mm[1]}`);
// 4. parts：每 10 天 × 三档画幅，≥1 项、id 唯一、hit 在画布内、box 有效；focus 描黄能画
let nParts = 0;
for (const [w, h] of [[760, 420], [1258, 540], [300, 160]]) for (let t = W0; t <= W1 + 1e-9; t += 10) {
  const c = makeCtx(); P.draw(c.g, w, h, t, sheetCtx()); const ps = P.parts(t, sheetCtx()); if (!ps.length) fail(`parts(${t}) ${w}x${h} 为空`);
  const ids = new Set();
  for (const q of ps) { if (!q.id || ids.has(q.id)) fail(`parts(${t}) id 重复 ${q.id}`); ids.add(q.id);
    const [x, y, ww, hh] = q.hit; if (!(x >= 0 && y >= 0 && ww > 0 && hh > 0 && x + ww <= w + 1e-6 && y + hh <= h + 1e-6)) fail(`parts(${t}) ${q.id} hit 越界`);
    const b = q.box; if (b.length !== 6 || !b.every(Number.isFinite) || !(b[3] > b[0] && b[4] > b[1] && b[5] > b[2])) fail(`parts(${t}) ${q.id} box 无效`); nParts++; }
  const c2 = makeCtx(), cx = sheetCtx(); cx.focus = ps[0].id; P.draw(c2.g, w, h, t, cx);
}
// 5. 改 HZ 图跟着变：塔吊组提前 30 天拆 → 那 30 天里大数字少 6；复原
{ const R = K['crane~rm'], s0 = R.start, e0 = R.end, tq = s0 - 15, b0 = +P.big(tq).num;
  R.start = s0 - 30; R.end = e0 - 30; const b1 = +P.big(tq).num; R.start = s0; R.end = e0; P.model();
  const nT = HZ.cranes.filter(c => c.key === 'crane').length;
  if (b0 - b1 !== nT) fail(`塔吊提前拆后大数字 ${b0} → ${b1}，应少 ${nT}`); }
// 6. 镜头：在窗内递增、机位在地面以上
let lt = -Infinity;
for (const k of P.cam) {
  if (k.t < W0 || k.t > W1 || k.t <= lt) fail(`镜头 t=${k.t} 越窗或不递增`); lt = k.t;
  const camY = k.target[1] + k.dist * Math.sin(k.el * Math.PI / 180); if (!(k.target[1] >= 0 && camY > 5)) fail(`镜头 t=${k.t} 进地下`);
}
console.log(`OK check_s002 runs=${runs} 窗=[${W0},${W1}] 峰值=${peak} 台 履带吊=${m.lifts.length} 超吊距=${m.nOver} parts=${nParts} cam=${P.cam.length}`);
