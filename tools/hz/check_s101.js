'use strict';
// S-101 地下（web/sheets/s101.js）无头检查：绘制不抛错、图号正确、大数字单调、镜头不进地下、施工物理不变量。
const { load, sheetCtx } = require('./harness');
const { G, HZ, makeCtx } = load({ extra: ['web/sheets/s101.js'] });
HZ.make();
const fail = m => { console.log('FAIL check_s101: ' + m); process.exit(1); };
const P = (G.HZ_SHEET_PLUGINS || []).find(p => p.id === 'S-101');
if (!P) fail('未登记 HZ_SHEET_PLUGINS S-101');
const F = HZ.K.found;
if (P.window[0] !== F.start || P.window[1] !== F.end) fail(`时间窗 ${P.window} 与 found ${F.start}–${F.end} 不一致`);
const PJ = (G.HZA && G.HZA.PROJECT) || HZ.PROJECT || 'HZW', NO = PJ + '-S-101-1';

// 1. 七个时刻 × 两档尺寸绘制
const [W0, W1] = P.window, times = [0, 1, 2, 3, 4, 5, 6].map(i => W0 + (W1 - W0) * i / 6);
const sizes = [[560, 420], [300, 160]];
let runs = 0;
for (const t of times) for (const [w, h] of sizes) {
  const c = makeCtx(), ctx = sheetCtx();
  try { P.draw(c.g, w, h, t, ctx); } catch (e) { fail(`draw t=${t.toFixed(1)} ${w}x${h} ${e && e.stack}`); }
  if (ctx.seenNo !== NO) fail(`图号 期望 ${NO} 实得 ${ctx.seenNo}`);
  if (!((c.calls.fillRect || 0) >= 1) || !(c.texts.length >= 1)) fail(`t=${t} ${w}x${h} 未画图框或未写字`);
  runs++;
}

// 2. 大数字：全场已挖土方（万 m³）单调不减、≤ 120，收尾 = 120 且标签报 4 / 4 层；比例与分坑状态一致
let lastV = -1;
for (let t = W0; t <= W1 + 1e-9; t += 0.5) {
  const b = P.big(t);
  if (!b || typeof b.num !== 'number' || !isFinite(b.num) || b.unit !== '万 m³' || !b.label) fail(`big(${t}) 格式不对`);
  if (b.num < lastV - 1e-9) fail(`t=${t} 土方回退 ${lastV}→${b.num}`); if (b.num > 120 + 1e-9) fail(`土方 ${b.num} 超过 120 万 m³`); lastV = b.num;
}
if (Math.abs(lastV - 120) > 1e-6) fail('时间窗结束时土方不是 120 万 m³');
if (!/4 \/ 4 层/.test(P.big(W1).label)) fail('收尾标签没有报 4 / 4 层');
// 土方车流：累计车次单调、收尾 = 120 万 m³ ÷ 每车方量（约 8 万）；挖土期间每天有车，日车次之和 ≈ 总车次
{ let lc = -1, sum = 0; for (let t = W0; t <= W1; t += 1) { const k = P.trucks(t); if (k.cum < lc) fail(`t=${t} 累计车次倒退`); lc = k.cum; sum += k.day; }
  const kE = P.trucks(W1); if (kE.cum !== kE.total || kE.total < 7e4 || kE.total > 9e4) fail(`收尾累计车次 ${kE.cum} / ${kE.total}`);
  if (Math.abs(sum - kE.total) / kE.total > 0.05) fail(`日车次之和 ${sum} 与总车次 ${kE.total} 差太多`); }
{ const M0 = P.model(); for (let t = W0; t <= W1; t += 1) { const s = P.stateAt(t);
  for (const o of s.tiles) { if (o.base > 0 && o.dig > o.q.depth + 1e-9) fail(`t=${t} 分坑 x=${o.q.x0} 未挖到底就浇底板`); if (o.roof > 0 && o.base < 1) fail(`t=${t} 分坑 x=${o.q.x0} 顶板早于底板`); }
  const tl = s.tiles.find(o => o.q.x0 <= 39 && o.q.x1 > 39 && o.q.z0 > 0), W = s.wings[0]; if (tl && (Math.abs(tl.dig - W.dig) > 1e-6 || Math.abs(tl.roof - W.roof) > 1e-6)) fail(`t=${t} 斜俯图与剖面的 x=39 南翼分坑状态不一致`); }
  if (!(M0.Vtot > 1e5)) fail('几何土方总量异常'); }

// 3. 镜头：相机在地面以上，关键帧时间在窗内且递增
let lt = -1;
for (const k of P.cam) {
  if (k.t < W0 || k.t > W1 || k.t <= lt) fail(`镜头关键帧 t=${k.t} 越窗或不递增`); lt = k.t;
  const camY = k.target[1] + k.dist * Math.sin(k.el * Math.PI / 180);
  if (!(k.target[1] >= 0) || !(camY > 5)) fail(`镜头 t=${k.t} 进地下（目标 y=${k.target[1]}，相机 y=${camY.toFixed(1)}）`);
}

// 4. 物理不变量（规则优先，不靠坐标硬凑）
const GEO = P.GEO, M = P.model();
const metro = F.parts.find(p => p.geo && p.geo.mat === 'metro');
if (metro && Math.abs(M.UGT - (metro.st + metro.du)) > 1e-6) fail('中央坑收尾时刻与 3D metro 构件不一致');
let samples = 0;
for (let t = W0; t <= W1 + 1e-9; t += 0.25) {
  const s = P.stateAt(t); samples++;
  if (s.dig < s.wallY - 1e-9) fail(`t=${t} 挖深 ${s.dig} 超过地连墙成槽深度 ${s.wallY}`);
  if (s.dig < GEO.pit - 1e-9) fail(`t=${t} 超挖`);
  if (s.dig < -2.0 - 1e-9 && s.dewater < 1) fail(`t=${t} 未完成降水就挖到第 2 层`);
  GEO.struts.forEach((y, i) => { if (s.struts[i] === 1 && s.dig > y) fail(`t=${t} 第 ${i + 1} 道撑悬在未挖的土里`); });
  // 每层挖到撑下 1 m 之前，下一层不能开挖：挖深越过撑标高 −1.5 m 时撑必须已架
  GEO.struts.forEach((y, i) => { if (s.dig < y - 1.5 && s.struts[i] === 0) fail(`t=${t} 挖过第 ${i + 1} 道撑却未架撑`); });
  if (s.base > 0 && s.dig > GEO.pit + 1e-9) fail(`t=${t} 未挖到坑底就浇底板`);
  GEO.lv.forEach((L, i) => { const below = i ? s.lv[i - 1] : s.base; if (s.lv[i] > 0 && below < (i ? GEO.slabDone : 1)) fail(`t=${t} ${L.n} 在下层完成前开始`); });
  // 内衬墙 / 侧墙向上长时不能穿过在用的撑
  GEO.lv.forEach((L, i) => { const k = s.lv[i]; if (k <= 0) return; const yb = i ? GEO.lv[i - 1].y1 : GEO.base[1], yw = yb + (L.y0 - yb) * Math.min(1, k / 0.45);
    GEO.struts.forEach((y, j) => { if (s.struts[j] === 1 && y > yb && y < yw) fail(`t=${t} ${L.n} 内衬墙穿过在用的第 ${j + 1} 道撑`); }); });
  if (s.lv[2] > GEO.slabDone && s.struts.some(v => v === 1)) fail(`t=${t} 地铁层侧墙上长时仍有撑在用`);
  for (const W of s.wings) { if (W.base > 0 && W.dig > GEO.fPit + 1e-9) fail(`t=${t} 翼部未挖到底就浇底板`); if (W.roof > 0 && W.base < 1) fail(`t=${t} 翼部顶板早于底板`); if (W.dig < 0 && s.wall < 1) fail(`t=${t} 地连墙未闭合就挖翼部`); if (W.dig < 0 && W.pile < 1) fail(`t=${t} 翼部桩未完成就挖土`); }
}
// 5. 联动 v2：parts() 每个采样时刻 ≥ 1 项、id 唯一、hit 在画布内、box 有限且非零体积；focus 描黄不抛错
let nParts = 0;
for (const [w, h] of [[760, 420], [1258, 540], [300, 160]]) for (let t = W0; t <= W1 + 1e-9; t += 5) {
  const c = makeCtx(); P.draw(c.g, w, h, t, sheetCtx());
  const ps = P.parts(t, sheetCtx()); if (!Array.isArray(ps) || !ps.length) fail(`parts(${t}) ${w}x${h} 为空`);
  const ids = new Set();
  for (const q of ps) { if (!q.id || ids.has(q.id)) fail(`parts(${t}) id 重复或为空：${q.id}`); ids.add(q.id);
    const [x, y, ww, hh] = q.hit; if (!(x >= 0 && y >= 0 && ww > 0 && hh > 0 && x + ww <= w + 1e-6 && y + hh <= h + 1e-6)) fail(`parts(${t}) ${q.id} hit 越出画布 ${q.hit}`);
    const b = q.box; if (b.length !== 6 || !b.every(Number.isFinite) || !(b[3] > b[0] && b[4] > b[1] && b[5] > b[2])) fail(`parts(${t}) ${q.id} box 无效 ${b}`); nParts++; }
  if (w === 760) { const f = ps[ps.length - 1].id; const c2 = makeCtx(), cx2 = sheetCtx(); cx2.focus = f; try { P.draw(c2.g, w, h, t, cx2); } catch (e) { fail(`focus=${f} 绘制出错 ${e.message}`); } }
}
// 6. 改 HZ，图跟着变：地铁层构件工期 +30 天 → 中央坑收尾时刻与大数字跟着变；SEC_X 改 → 剖切位置跟着变；改完复原
{ const mt = F.parts.find(p => p.geo && p.geo.mat === 'metro'), du0 = mt.du, U0 = P.model().UGT, tq = Math.round(U0 * 0.5), b0 = P.big(tq).num;
  mt.du = du0 + 30; const U1 = P.model().UGT, b1 = P.big(tq).num; mt.du = du0;
  if (Math.abs(U1 - U0 - 30) > 1e-6) fail(`改 metro 工期后中央坑收尾没跟着变（${U0}→${U1}）`); if (b1 === b0) fail('改 metro 工期后大数字没变');
  const sx0 = HZ.SEC_X; HZ.SEC_X = sx0 + 10; const pr = P.parts(W1 - 1, sheetCtx()).find(q => q.id === 'SEC'); HZ.SEC_X = sx0; P.model();
  if (!pr || Math.abs(pr.box[0] - (sx0 + 9.5)) > 1e-6) fail('改 HZ.SEC_X 后剖面位置没跟着变'); P.parts(W0, sheetCtx()); }

const end = P.stateAt(W1);
if (end.struts.some(v => v === 1)) fail('时间窗结束时仍有临时支撑未拆');
console.log(`OK check_s101 runs=${runs} samples=${samples} cam=${P.cam.length} phases=${M.L.length} parts=${nParts}`);
