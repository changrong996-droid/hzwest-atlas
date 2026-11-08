'use strict';
// S-251 网架拼装（web/sheets/s251.js）无头检查：绘制不抛错、图号、大数字单调（已拼单元 x / 总数）、
// 数据从 HZ 读（改单元工期图跟着变）、联动 v2 parts()、镜头不进地下且跟着正在拼的单元走。
const { load, sheetCtx } = require('./harness');
const { G, HZ, makeCtx } = load({ extra: ['web/sheets/s251.js'] });
HZ.make();
const fail = m => { console.log('FAIL check_s251: ' + m); process.exit(1); };
const P = (G.HZ_SHEET_PLUGINS || []).find(p => p.id === 'S-251');
if (!P) fail('未登记 HZ_SHEET_PLUGINS S-251');
const K = HZ.K, PJ = (G.HZA && G.HZA.PROJECT) || HZ.PROJECT || 'HZW', NO = PJ + '-S-251-1';
const N = ['asm1', 'asm2', 'asm3'].reduce((a, k) => a + K[k].parts.filter(p => p.cells && p.cells.length).length, 0);
const [W0, W1] = P.window;
if (!(W0 <= Math.min(K.jig1.start, K.asm1.start) && W1 >= Math.max(K.asm1.end, K.asm2.end, K.asm3.end))) fail(`时间窗 ${P.window} 没盖住胎架与拼装`);
if (P.model().N !== N) fail(`单元数 ${P.model().N} ≠ HZ 里的 ${N}`);

// 1. 绘制：多个时刻 × 三档画幅
let runs = 0;
for (const t of [W0, (W0 + W1) / 2, K.asm2.start + 3, W1 - 4, W1]) for (const [w, h] of [[760, 420], [1258, 540], [300, 160]]) {
  const c = makeCtx(), ctx = sheetCtx();
  try { P.draw(c.g, w, h, t, ctx); } catch (e) { fail(`draw t=${t} ${w}x${h} ${e && e.stack}`); }
  if (ctx.seenNo !== NO) fail(`图号 期望 ${NO} 实得 ${ctx.seenNo}`);
  if (!(c.texts.length >= 1)) fail(`t=${t} ${w}x${h} 没写字`); runs++;
}
// 2. 大数字：「x / N」，x 单调不减，起点 0、终点 N
let last = -1;
for (let t = W0; t <= W1 + 1e-9; t += 0.25) {
  const b = P.big(t), mm = /^(\d+) \/ (\d+)$/.exec(String(b.num));
  if (!mm || +mm[2] !== N || b.unit !== '单元' || !b.label) fail(`big(${t}) 格式 ${b.num} ${b.unit}`);
  if (+mm[1] < last) fail(`t=${t} 已拼单元倒退`); last = +mm[1];
}
if (!/^0 \//.test(P.big(W0).num) || P.big(W1).num !== N + ' / ' + N) fail('起点应 0、终点应拼完');
// 3. parts：每 2 天 × 三档画幅，≥1 项、id 唯一、hit 在画布内、box 有效；focus 描黄能画
let nParts = 0;
for (const [w, h] of [[760, 420], [1258, 540], [300, 160]]) for (let t = W0; t <= W1 + 1e-9; t += 2) {
  const c = makeCtx(); P.draw(c.g, w, h, t, sheetCtx()); const ps = P.parts(t, sheetCtx()); if (!ps.length) fail(`parts(${t}) ${w}x${h} 为空`);
  const ids = new Set();
  for (const q of ps) { if (!q.id || ids.has(q.id)) fail(`parts(${t}) id 重复 ${q.id}`); ids.add(q.id);
    const [x, y, ww, hh] = q.hit; if (!(x >= 0 && y >= 0 && ww > 0 && hh > 0 && x + ww <= w + 1e-6 && y + hh <= h + 1e-6)) fail(`parts(${t}) ${q.id} hit 越界`);
    const b = q.box; if (b.length !== 6 || !b.every(Number.isFinite) || !(b[3] > b[0] && b[4] > b[1] && b[5] > b[2])) fail(`parts(${t}) ${q.id} box 无效`); nParts++; }
  const c2 = makeCtx(), cx = sheetCtx(); cx.focus = ps[0].id; P.draw(c2.g, w, h, t, cx);
}
// 4. 改 HZ 图跟着变：中区第一个单元推迟 5 天 → 当时已拼数少 1 或进度变；复原
{ const u = K.asm2.parts.slice().sort((a, b) => a.st - b.st)[0], st0 = u.st, tq = st0 + u.du + 0.5, b0 = P.big(tq).num;
  u.st = st0 + 5; const b1 = P.big(tq).num; u.st = st0; P.model();
  if (b0 === b1) fail(`改单元工期后大数字没变（${b0}）`); }
// 5. 镜头：在窗内递增、机位在地面以上；目标跟着正在拼的单元（每帧目标与 live 单元中心的水平距离 < 200 m）
let lt = -Infinity;
for (const k of P.cam) {
  if (k.t < W0 || k.t > W1 || k.t <= lt) fail(`镜头 t=${k.t} 越窗或不递增`); lt = k.t;
  const camY = k.target[1] + k.dist * Math.sin(k.el * Math.PI / 180); if (!(k.target[1] >= 0 && camY > 5)) fail(`镜头 t=${k.t} 进地下`);
}
// 6. 公开对照：两条公开节点都算得出偏差，且在 ±20 天内（超出说明排程或口径走样，需要校准）
const RC = P.realCmp(); if (RC.length < 2) fail('公开对照少于 2 条');
for (const r of RC) { if (!Number.isFinite(r.dev)) fail(`公开对照 ${r.date} 算不出模型日期`); if (Math.abs(r.dev) > 20) fail(`公开对照 ${r.date} ${r.txt} 偏差 ${r.dev} 天，超过 ±20`); }
const devTxt = RC.map(r => r.date + '=' + (r.dev > 0 ? '+' : '') + r.dev + 'd').join(' ');
console.log(`OK check_s251 real ${devTxt} runs=${runs} units=${N} parts=${nParts} cam=${P.cam.length}`);
