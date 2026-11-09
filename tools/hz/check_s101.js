'use strict';
// S-101 地下（web/sheets/s101.js）无头检查：绘制不抛错、图号正确、大数字单调、镜头不进地下、施工物理不变量。
const { load, sheetCtx } = require('./harness');
const { G, HZ, makeCtx } = load({ extra: ['web/sheets/s101.js', 'web/mods/s101.js'] });
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
if (!/已完成层数 4 \/ 4/.test(P.big(W1).label)) fail('收尾标签没有报 已完成层数 4 / 4');
for (const tt of [91.3, 182.5]) if (/地下结构已完成/.test(P.big(tt).label)) fail('t=' + tt + ' 副标题读起来像全部完成（GPU 审计 #4）');
if (P.stateAt(91.3).dig > -1.5 && !/中央坑/.test(P.big(91.3).label)) fail('t=91.3 中央坑只挖 1 m，副标题没点明在做什么（GPU 审计 #5）');
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
// ---- 3D 模块 web/mods/s101.js（地下体量）：登记、体积守恒、坑线只在地下且深度 = 图纸、方块不压在场构件、update 耗时、opts.clip ----
let modTxt = '';
{ const MD = (G.HZ_MODS || []).find(m => m.id === 's101-volume');
  if (!MD || typeof MD.build !== 'function' || typeof MD.update !== 'function') fail('未登记 HZ_MODS s101-volume（build / update）');
  const BX = []; for (const a of HZ.acts) for (const p of a.parts) { if (p.grp || !p.geo) continue; const bs = p.geo.boxes && p.geo.boxes.length ? p.geo.boxes : (isFinite(p.geo.min[0]) ? [{ min: p.geo.min, max: p.geo.max }] : []); for (const b of bs) BX.push({ p, a, b }); }
  const here = (p, t) => p.st != null && t >= p.st && !(p.rm && p.rm[0] >= 0 && t >= p.rm[0] + p.rm[1]);
  let aMax = 0, nPit = 0, nFace = 0;
  for (let t = 0; t <= MD.SHOW[1] + 1e-9; t += 2) { const L = MD.lines(HZ, t), s = P.stateAt(t);
    if (Math.abs(L.a ** 3 - s.vol) > Math.max(5, s.vol * 0.001)) fail(`t=${t} 土方块体积 ${(L.a ** 3).toFixed(0)} ≠ 出土 ${s.vol.toFixed(0)} m³`);
    for (let i = 1; i < L.pit.length; i += 3) if (L.pit[i] > 0) fail(`t=${t} 坑线高出地面 y=${L.pit[i]}`);
    for (let i = 1; i < L.face.length; i += 3) if (L.face[i] > 4.7) fail(`t=${t} 施工面线高出地面 y=${L.face[i]}（挖机臂最高 4.6 m，浅坑时可露出地面）`);
    { const liveT = s.tiles.filter(o => o.dig < -0.05 && o.dig / o.q.depth < 0.999 && o.roof < 1).length; if (L.live.filter(k => k !== 'C-METRO').length !== liveT) fail(`t=${t} 施工面数 ${L.live.length} ≠ 在挖分坑 ${liveT}`);
      if (L.live.length && !L.ex) fail(`t=${t} 有施工面没有挖机`); nFace += L.live.length ? 1 : 0; }
    const minY = L.pit.reduce((a, v, i) => i % 3 === 1 ? Math.min(a, v) : a, 0), deep = Math.min(0, ...s.tiles.filter(o => o.roof < 1).map(o => o.dig), (s.base < 1 || s.lv.some(v => v < 1)) ? (s.coreDig != null ? s.coreDig : s.dig) : 0);
    if (Math.abs(minY - deep) > 1e-6 && L.pit.length) fail(`t=${t} 坑线最深 ${minY} ≠ 图纸开挖 ${deep}`);
    if (L.a > 0.5) { const x0 = L.A.x - L.a / 2, x1 = L.A.x + L.a / 2, z0 = L.A.zS - L.a, z1 = L.A.zS;
      const hit = BX.find(e => here(e.p, t) && e.b.max[1] > 0.05 && e.b.max[0] > x0 && e.b.min[0] < x1 && e.b.max[2] > z0 && e.b.min[2] < z1 && e.b.min[1] < L.a);
      if (hit) fail(`t=${t} 土方块压在构件 ${hit.a.key} 上`); }
    aMax = Math.max(aMax, L.a); nPit += L.pit.length ? 1 : 0; }
  if (Math.abs(aMax - Math.cbrt(MD.VPUB)) > 0.5) fail(`挖完时方块边长 ${aMax.toFixed(1)} 应约 ${Math.cbrt(MD.VPUB).toFixed(1)} m（120 万 m³）`);
  if (!nPit) fail('全程没有坑线');
  if (nFace < 100) fail(`有施工面的抽样只有 ${nFace} 个`);
  // 桩 THREE：opts.clip 传到三种材质；update 每帧 < 2 ms
  const made = []; const T = { BufferGeometry: function () { this.setAttribute = () => {}; this.setDrawRange = () => {}; }, BufferAttribute: function () {}, DynamicDrawUsage: 1, DoubleSide: 2,
    LineBasicMaterial: function (o) { Object.assign(this, o); made.push(this); }, LineDashedMaterial: function (o) { Object.assign(this, o); made.push(this); }, MeshBasicMaterial: function (o) { Object.assign(this, o); made.push(this); },
    LineSegments: function (g, m) { this.geometry = g; this.material = m; this.computeLineDistances = () => {}; }, BoxGeometry: function () {}, Mesh: function (g, m) { this.material = m; this.scale = { set: () => {} }; this.position = { set: () => {} }; } };
  const plane = { normal: [0, 0, 1], constant: 0 }; MD.build({ add: () => {} }, HZ, T, { clip: [plane] });
  if (made.length < 4 || made.some(m => !m.clippingPlanes || m.clippingPlanes[0] !== plane)) fail('opts.clip 未传到全部材质');
  const ms = [], re = []; let key = null; for (let f = 0; f < 1800; f++) { const t = 100 + f / 60, k = Math.round(t * 8), t0 = process.hrtime.bigint(); MD.update(t, [0, 50, 300]); const d = Number(process.hrtime.bigint() - t0) / 1e6; if (f > 30) { ms.push(d); if (k !== key) re.push(d); } key = k; }
  re.sort((a, b) => a - b); const avg = ms.reduce((a, b) => a + b, 0) / ms.length, worst = re[re.length >> 1];   // 同 check_actors：按 60 帧/秒、1 天/秒播放，平均与重算帧中位都 < 2 ms
  if (avg > 2 || worst > 2) fail(`update 平均 ${avg.toFixed(2)} ms、重算帧中位 ${worst.toFixed(2)} ms，应 < 2 ms`);
  // D-20 ②：t=182「回筑 B2 板、拆第 3 道撑」——3D 有中央坑虚线、在用内支撑、已浇底板与 B3 板（墨线，透地面）、B2 板在浇（红）
  { const L = MD.lines(HZ, 182), s = P.stateAt(182), c = P.model().core, atY = (arr, y) => { let n = 0; for (let i = 0; i < arr.length; i += 6) if (Math.abs(arr[i + 1] - y) < 0.01 && Math.abs(arr[i + 4] - y) < 0.01) n++; return n; };
    if (!(s.lv[0] >= 1 && s.lv[1] > 0 && s.lv[1] < 1)) fail('t=182 状态与任务书不符（应 B3 已浇、B2 在浇）');
    if (atY(L.built, P.GEO.base[1]) < 4) fail('t=182 3D 未画中央坑底板'); if (atY(L.built, P.GEO.lv[0].y1) < 4) fail('t=182 3D 未画已回筑 B3 板');
    if (atY(L.built, P.GEO.lv[1].y1) > 0) fail('t=182 B2 板未浇完却画成墨线'); if (atY(L.face, P.GEO.lv[1].y1) < 4) fail('t=182 B2 板在浇未画红框');
    for (let i = 0; i < 3; i++) if (s.struts[i] === 1 && atY(L.pit, P.GEO.struts[i]) < 3) fail(`t=182 第 ${i + 1} 道在用内支撑 3D 未画`);
    if (atY(L.pit, P.GEO.struts[3]) > 0) fail('t=182 已拆第 4 道撑仍在画');
    if (!L.pit.some((v, i) => i % 6 === 1 && Math.abs(v - s.coreDig) < 0.01)) fail('t=182 中央深坑轮廓未画'); }
  // D-20 ⑤：窗外 update 直接返回、节点隐藏
  { MD.update(MD.SHOW[1] + 5, [0, 50, 300]); if (!MD.off) fail('t > SHOW[1] 后 update 未进入隐藏态'); const t0 = process.hrtime.bigint(); for (let i = 0; i < 1000; i++) MD.update(MD.SHOW[1] + 5 + i / 60, [0, 50, 300]);
    const us = Number(process.hrtime.bigint() - t0) / 1e6; if (us > 5) fail(`窗外 1000 帧 update 共 ${us.toFixed(2)} ms，应近 0`); }
  modTxt = ` mod_a=${aMax.toFixed(1)} mod_face=${nFace} mod_ms=${worst.toFixed(2)}`; }
console.log(`OK check_s101 runs=${runs} samples=${samples} cam=${P.cam.length} phases=${M.L.length} parts=${nParts}${modTxt}`);
