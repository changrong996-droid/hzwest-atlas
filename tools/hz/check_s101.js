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

// 2. 大数字：挖土段（m）单调不减、≤ 25.2；回筑段（层）单调不减、0..4、收尾 = 4
let lastM = -1, lastL = -1, seenL = false;
for (let t = W0; t <= W1 + 1e-9; t += 0.5) {
  const b = P.big(t);
  if (!b || typeof b.num !== 'number' || !isFinite(b.num) || !b.unit || !b.label) fail(`big(${t}) 格式不对`);
  if (b.unit === 'm') { if (seenL) fail(`t=${t} 回筑后又回到挖深`); if (b.num < lastM - 1e-9) fail(`t=${t} 挖深回退 ${lastM}→${b.num}`); if (b.num > 25.2 + 1e-9) fail(`挖深 ${b.num} 超过坑底`); lastM = b.num; }
  else { seenL = true; if (b.num < lastL || b.num < 0 || b.num > 4) fail(`t=${t} 层数 ${b.num} 不合理`); lastL = b.num; }
}
if (lastM < 25.2 - 1e-6) fail('挖深没有到设计坑底 25.2 m');
if (lastL !== 4) fail('时间窗结束时地下层数不是 4');

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
const end = P.stateAt(W1);
if (end.struts.some(v => v === 1)) fail('时间窗结束时仍有临时支撑未拆');
console.log(`OK check_s101 runs=${runs} samples=${samples} cam=${P.cam.length} phases=${M.L.length}`);
