'use strict';
// 无头检查 S-201 承轨层插件：时间窗内 7 个时刻 × 2 档画布绘制不抛错、标题栏图号正确、大数字合理；镜头关键帧不进实体、不入地下。
const path = require('path');
const { load, sheetCtx } = require('./harness');
const { G, HZ, makeCtx } = load({ extra: ['web/sheets/s201.js'] });
HZ.make();
const fail = m => { console.log('FAIL check_s201: ' + m); process.exit(1); };
const PL = (G.HZ_SHEET_PLUGINS || []).find(p => p.id === 'S-201');
if (!PL) fail('未登记 HZ_SHEET_PLUGINS S-201');
for (const k of ['draw', 'big']) if (typeof PL[k] !== 'function') fail(k + ' 不是函数');
const [T0, T1] = PL.window; if (!(T0 === 365 && T1 === 900)) fail('时间窗应为 365–900，实得 ' + PL.window);
const K = HZ.K;
const times = [T0, K.frameS.start + 20, K.deckS.start + 22, K.platS.start + 10, K.trackS.start + 80, K.trackN.start + 80, T1];
const sizes = [[560, 420], [300, 160]];
let runs = 0;
for (const t of times) for (const [w, h] of sizes) {
  const c = makeCtx(), ctx = sheetCtx();
  try { PL.draw(c.g, w, h, t, ctx); } catch (e) { fail(`draw t=${t} ${w}x${h} ${e && e.stack}`); }
  if (ctx.seenNo !== 'HZW-S-201-1') fail(`图号 期望 HZW-S-201-1 实得 ${ctx.seenNo}`);
  if (!((c.calls.fillRect || 0) >= 1) || !(c.texts.length >= 1)) fail(`t=${t} ${w}x${h} 未画图框或未写标题栏`);
  runs++;
}
// 大数字：逐日采样，同一单位内单调不减，终值 = 总量，且只有两种单位、按顺序切换
let prev = null, units = [];
for (let t = T0; t <= T1; t += 1) {
  const b = PL.big(t); if (!b || typeof b.num !== 'number' || !isFinite(b.num) || !b.unit || !b.label) fail('big(' + t + ') 字段缺失');
  if (!units.length || units[units.length - 1] !== b.unit) units.push(b.unit);
  if (prev && prev.unit === b.unit && b.num < prev.num - 1e-9) fail(`big 在 t=${t} 回落 ${prev.num} → ${b.num}`);
  prev = b;
}
if (units.join('|') !== '万 m²|km') fail('大数字单位顺序 ' + units.join('|'));
const S = PL.stats(T1); if (Math.abs(S.km - S.kmTot) > 1e-6 || S.done !== S.lines || S.lines !== 20) fail(`终态 铺轨 ${S.km}/${S.kmTot} km 贯通 ${S.done}/${S.lines}`);
const S0 = PL.stats(T0); if (S0.km !== 0 || S0.area !== 0) fail('起点应为 0');
// 镜头：机位在地上、不在任何该时刻已开工构件的包围盒内（含 1 m 余量）
let camBad = 0;
for (const k of PL.cam) {
  const az = k.az * Math.PI / 180, el = k.el * Math.PI / 180, [tx, ty, tz] = k.target;
  const p = [tx + Math.sin(az) * Math.cos(el) * k.dist, ty + Math.sin(el) * k.dist, tz - Math.cos(az) * Math.cos(el) * k.dist];
  if (p[1] < 2) { camBad++; console.log(`  cam t=${k.t} 机位入地 y=${p[1].toFixed(1)}`); continue; }
  for (const a of HZ.acts) for (const q of a.parts) { if (q.st == null || q.st > k.t || q.grp) continue; for (const b of q.geo.boxes)
    if (p[0] > b.min[0] - 1 && p[0] < b.max[0] + 1 && p[1] > b.min[1] - 1 && p[1] < b.max[1] + 1 && p[2] > b.min[2] - 1 && p[2] < b.max[2] + 1) { camBad++; console.log(`  cam t=${k.t} 机位在 ${a.key} 内`); } }
}
if (camBad) fail('镜头违反 ' + camBad);
console.log(`OK check_s201 times=7 sizes=2 runs=${runs} cams=${PL.cam.length} cam_bad=0 track=${S.kmTot.toFixed(1)}km lines=${S.lines}`);
