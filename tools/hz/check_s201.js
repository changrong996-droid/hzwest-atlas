'use strict';
// 无头检查 S-201 承轨层插件：时间窗内 7 个时刻 × 2 档画布绘制不抛错、标题栏图号正确、大数字合理；镜头关键帧不进实体、不入地下。
const path = require('path');
const { load, sheetCtx } = require('./harness');
const { G, HZ, makeCtx } = load({ extra: ['web/hzreal.js', 'web/sheets/s201.js'] });
HZ.make();
const fail = m => { console.log('FAIL check_s201: ' + m); process.exit(1); };
const PL = (G.HZ_SHEET_PLUGINS || []).find(p => p.id === 'S-201');
if (!PL) fail('未登记 HZ_SHEET_PLUGINS S-201');
for (const k of ['draw', 'big']) if (typeof PL[k] !== 'function') fail(k + ' 不是函数');
const [T0, T1] = PL.window; if (!(T0 === 365 && T1 === 900)) fail('时间窗应为 365–900，实得 ' + PL.window);
const K = HZ.K;
const times = [T0, K.frameS.start + 20, K.deckS.start + 22, K.platS.start + 10, K.trackS.start + 80, K.trackN.start + 80, T1];
const sizes = [[560, 420], [300, 160], [584, 950], [800, 1200]];
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
if (units.join('|') !== '%') fail('大数字应只有一个量（%），实得 ' + units.join('|'));
if (PL.big(T0).num !== 0 || PL.big(T1).num !== 100) fail(`完成度 起 ${PL.big(T0).num} 终 ${PL.big(T1).num}`);
for (let t = T0; t <= T1; t += 5) if (/(^|[^\d.])0 ?万 ?m²/.test(PL.big(t).label + PL.big(t).num + PL.big(t).unit) ) fail('出现「0 万 m²」 t=' + t);
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
// ---- 联动接口 v2：parts ----
let pRuns = 0, pMin = Infinity;
for (const [w, h] of [[560, 420], [1258, 540], [300, 160], [584, 950], [390, 700]]) { const ctx0 = sheetCtx(); PL.draw(makeCtx().g, w, h, T0, ctx0);
  for (let t = T0; t <= T1; t += 25) { const ps = PL.parts(t, {}); if (!Array.isArray(ps) || ps.length < 1) fail(`parts(${t}) 为空`); pMin = Math.min(pMin, ps.length);
    const ids = new Set(); for (const q of ps) { if (!q.id || ids.has(q.id)) fail('part id 缺失或重复 ' + q.id); ids.add(q.id);
      const [x, y, hw, hh] = q.hit; if (![x, y, hw, hh].every(isFinite) || hw <= 0 || hh <= 0 || x < 0 || y < 0 || x + hw > w + 0.5 || y + hh > h + 0.5) fail(`${q.id} hit 出界 ${q.hit} @${w}x${h}`);
      const b = q.box; if (!b || b.length !== 6 || !b.every(isFinite) || !(b[3] > b[0] && b[4] > b[1] && b[5] > b[2])) fail(`${q.id} box 无效 ${b}`); }
    for (const k of ['G-S01', 'G-N09', 'P-S6', 'P-N5', 'D-S01', 'B-N26']) if (!ids.has(k)) fail('缺 part ' + k);
    pRuns++; } }
// 选中绘制 + 身份卡（含实物记录与偏差）
for (const id of ['G-S03', 'G-N09', 'P-S2', 'D-S05', 'B-N03']) { const ctx = sheetCtx(); ctx.focus = id; ctx.zoom = 3; try { PL.draw(makeCtx().g, 560, 420, 760, ctx); } catch (e) { fail('focus ' + id + ' ' + e.stack); } const I = PL.info(id, 760); if (!I || !I.lines.length) fail('info ' + id); }
{ const I = PL.info('G-N09', 760), r = I.lines.find(l => l[0] === '实物'); if (!r || !/R-0009/.test(r[1]) || !/全部铺完 2022-03-05（早 19 天）/.test(r[1])) fail('G-N09 实物行 ' + JSON.stringify(r)); }
// ---- 「改 HZ，图跟着变」：挪一座站台、推迟一条股道，parts 与身份卡随之变化 ----
{ const hitOf = id => PL.parts(760, {}).find(q => q.id === id), a0 = hitOf('P-S2'), i0 = PL.info('G-S01', 760).lines.find(l => l[0] === '工期')[1];
  const Y = HZ.YARDS.S, z0 = Y.islands[1]; Y.islands[1] = z0 + 4; HZ.make();
  const a1 = hitOf('P-S2'); if (!(Math.abs((a1.box[2] + a1.box[5]) / 2 - (a0.box[2] + a0.box[5]) / 2 - 4) < 1e-6)) fail('改 HZ.YARDS 后 P-S2 的 3D 盒没跟着移 4 m');
  if (!(a1.hit[1] > a0.hit[1])) fail('改 HZ.YARDS 后 P-S2 的图上位置没跟着移');
  Y.islands[1] = z0; HZ.make();
  const segs = HZ.K.trackS.parts.filter(p => Math.abs((p.geo.min[2] + p.geo.max[2]) / 2 - 16.5) < 0.01); for (const p of segs) p.st += 30;
  const i1 = PL.info('G-S01', 760).lines.find(l => l[0] === '工期')[1]; if (i1 === i0) fail('改股道工期后身份卡未变');
  for (const p of segs) p.st -= 30; HZ.make(); }
// 竖长条（审计 #7）：转向后平面沿轨方向占满高度的 80% 以上
{ for (const [w, h] of [[584, 950], [800, 1200]]) { PL.draw(makeCtx().g, w, h, 700, sheetCtx()); const ps = PL.parts(700, {}); let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
    for (const q of ps) { y0 = Math.min(y0, q.hit[1]); y1 = Math.max(y1, q.hit[1] + q.hit[3]); x0 = Math.min(x0, q.hit[0]); x1 = Math.max(x1, q.hit[0] + q.hit[2]); }
    if ((y1 - y0) < 0.8 * (h - 40)) fail(`${w}x${h} 平面只占高度 ${(y1 - y0).toFixed(0)} px`);
    const g = ps.find(q => q.id === 'G-S01'); if (!(g.hit[3] > g.hit[2])) fail(`${w}x${h} 转向后股道应为竖向`); } }
console.log(`OK check_s201 parts_runs=${pRuns} parts_min=${pMin} hz_follow=ok`);
console.log(`OK check_s201 times=7 sizes=4 runs=${runs} cams=${PL.cam.length} cam_bad=0 track=${S.kmTot.toFixed(1)}km lines=${S.lines}`);
