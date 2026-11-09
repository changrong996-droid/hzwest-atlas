'use strict';
// S-251 网架拼装（web/sheets/s251.js）无头检查：绘制不抛错、图号、大数字单调（已拼单元 x / 总数）、
// 数据从 HZ 读（改单元工期图跟着变）、联动 v2 parts()、镜头不进地下且跟着正在拼的单元走。
const { load, sheetCtx } = require('./harness');
const { G, HZ, makeCtx } = load({ extra: ['web/sheets/s251.js', 'web/mods/s251.js'] });
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
// ---- D-37 拼装面基座：胎架底 = 候车层楼面顶 P.floorTop；胎架下方楼板已建且在本图范围（宿主同款 PL.scopeMask，keys 声明）；楼板的柱也在范围 ----
let baseTxt = '', baseTxt0 = '';
{ const fs = require('fs'), path = require('path'), vm = require('vm'), src = fs.readFileSync(path.join(__dirname, '../../web/hzview.js'), 'utf8');
  const pm = /\/\/ <plugLink>[\s\S]*?\n([\s\S]*?)\/\/ <\/plugLink>/.exec(src); if (!pm) fail('hzview.js 缺 <plugLink> 段');
  const PL = vm.runInContext('(() => {\n' + pm[1] + '\nreturn PL; })()', vm.createContext({ URLSearchParams, console }));
  if (!P.scope || !Array.isArray(P.scope.keys)) fail('S-251 未声明 scope.keys（D-37）');
  const its = [], iof = new Map(); for (const a of HZ.acts) { if (a.kind === 'untemp' || !a.parts.length) continue; for (const p of a.parts) { if (!iof.has(p)) iof.set(p, its.length); its.push({ key: a.key, min: p.geo.min, max: p.geo.max, st: p.st, rm: p.rm, p }); } }
  const [w0, w1] = P.window, parts = []; for (let i = 0; i <= 6; i++) for (const q of PL.safeParts(P, w0 + (w1 - w0) * i / 6, { w: 560, h: 420 })) parts.push(q);
  const r = PL.scopeMask(P, its, { leadKeys: null, parts, midZ: HZ.P.midZ, t: w0, frag: true }); if (!r.on) fail('S-251 范围未启用');
  const inScope = p => iof.has(p) && r.mask[iof.get(p)];
  const FT = HZ.P.floorTop, FL = (P.floorKeys || []).flatMap(k => HZ.K[k] ? HZ.K[k].parts.map(p => ({ k, p })) : []); if (!FL.length) fail('S-251 floorKeys 为空');
  let nj = 0;
  for (const jk of ['jig1', 'jig2', 'jig3']) for (const j of (HZ.K[jk] || { parts: [] }).parts) { nj++;
    if (Math.abs(j.geo.min[1] - FT) > 1e-6) fail(`${jk} 胎架底 ${j.geo.min[1]} ≠ 候车层楼面顶 ${FT}`);
    if (!inScope(j)) fail(`${jk} 胎架不在 S-251 范围`);
    const x = (j.geo.min[0] + j.geo.max[0]) / 2, z = (j.geo.min[2] + j.geo.max[2]) / 2;
    const s = FL.find(e => e.p.geo.boxes.some(b => b.min[0] <= x && b.max[0] >= x && b.min[2] <= z && b.max[2] >= z && Math.abs(b.max[1] - FT) < 1e-6));
    if (!s) fail(`${jk} 胎架 (${x.toFixed(1)}, ${z.toFixed(1)}) 下方没有楼板`);
    if (!inScope(s.p)) fail(`${jk} 胎架下方楼板 ${s.k} 不在 S-251 范围（3D 会悬空）`);
    if (s.p.st + s.p.du > j.st + 1e-6) fail(`${jk} 胎架第 ${j.st.toFixed(1)} 天开始，下方楼板 ${s.k} 第 ${(s.p.st + s.p.du).toFixed(1)} 天才建完`); }
  // 落地胎架 jigL1..3（宿主 11-09 方案①）：底 = p.low.y0（脚下最高已建面顶），所站构件开工前已建；地坪 on = 'ground' 底须 = 0
  let nL = 0; for (const jk of ['jigL1', 'jigL2', 'jigL3']) for (const j of (HZ.K[jk] || { parts: [] }).parts) { nL++;
    if (!j.low || (j.low.on === 'ground' ? !(j.geo.min[1] <= j.low.y0 + 1e-6 && j.geo.min[1] >= j.low.y0 - 1) : Math.abs(j.geo.min[1] - j.low.y0) > 1e-6)) fail(`${jk} 胎架底 ${j.geo.min[1]} ≠ low.y0 ${j.low && j.low.y0}（地坪允许埋入垫块 ≤ 1 m）`);
    if (!inScope(j)) fail(`${jk} 落地胎架不在 S-251 范围`);
    const x = (j.geo.min[0] + j.geo.max[0]) / 2, z = (j.geo.min[2] + j.geo.max[2]) / 2;
    if (j.low.on === 'ground') { if (Math.abs(j.low.y0) > 1e-6) fail(`${jk} 落地坪胎架底 ${j.low.y0} ≠ 0`); continue; }
    const sp = (HZ.K[j.low.on] || { parts: [] }).parts.find(q => (q.geo.boxes || [q.geo]).some(b => b.min[0] <= x && b.max[0] >= x && b.min[2] <= z && b.max[2] >= z && Math.abs(b.max[1] - j.low.y0) < 1e-6));
    if (!sp) fail(`${jk} 胎架 (${x.toFixed(1)}, ${z.toFixed(1)}) 脚下没有 ${j.low.on}`); else if (sp.st + sp.du > j.st + 1e-6) fail(`${jk} 胎架第 ${j.st.toFixed(1)} 天开始，脚下 ${j.low.on} 第 ${(sp.st + sp.du).toFixed(1)} 天才建完`); }
  if (!nL) fail('没读到落地胎架 jigL1..3');
  if (P.model().jigs.filter(j => j.low).length !== nL) fail(`s251 模型收进落地胎架 ${P.model().jigs.filter(j => j.low).length} ≠ ${nL}`);
  if (P.model().floorY !== FT) fail('floorY ≠ P.floorTop');
  for (const k of ['col24S', 'col24N']) if (HZ.K[k]) for (const p of HZ.K[k].parts) if (!inScope(p)) fail(`${k} 柱不在 S-251 范围（楼板会悬空）`);
  // 二维轴测：零点 = floorTop，画出楼板基座
  const calls = []; const ctx2 = new Proxy({ measureText: s => ({ width: String(s).length * 6 }) }, { get: (o, k) => (k in o ? o[k] : (...a) => { if (k === 'fillText') calls.push(String(a[0])); }), set: () => true });
  P.draw(ctx2, 1100, 620, (w0 + w1) / 2, {}); if (!calls.some(s => s.startsWith('候车层楼面 ▽+' + FT.toFixed(2)))) fail('二维轴测未画候车层楼面基座');
  // 报告（不判失败，宿主排程问题，已提接口请求）：整单元没有一个胎架、也没有一格落在楼板上的单元
  const P2 = P.model(), noSup = P2.units.filter(u => !P2.jigs.some(j => u.cells.includes(j.p.jigOf)) && !u.cells.some(c => FL.some(e => e.p.geo.boxes.some(b => b.min[0] <= c.xc && b.max[0] >= c.xc && b.min[2] <= c.zc && b.max[2] >= c.zc)))).map(u => u.id);
  // 端部悬挑 = 吊装（论文：南侧悬挑采用吊装；北端按对称推定）：须在楼面以外、南端至少 1 个、标了出处
  { const H = P2.units.filter(u => u.hoist); if (!H.some(u => u.hoistEnd === 'S' && u.hoistSrc === '论文')) fail('南端悬挑单元未标为吊装');
    for (const u of H) if (u.cells.some(c => FL.some(e => e.p.geo.boxes.some(b => b.min[0] <= c.xc && b.max[0] >= c.xc && b.min[2] <= c.zc && b.max[2] >= c.zc)))) fail(`${u.id} 有格子落在楼面上，却标成吊装`);
    if (H.length) { const c3 = []; const cx3 = new Proxy({ measureText: s => ({ width: String(s).length * 6 }) }, { get: (o, k) => (k in o ? o[k] : (...a) => { if (k === 'fillText') c3.push(String(a[0])); }), set: () => true });
      const hu = H[0]; P.draw(cx3, 1100, 620, (hu.st + hu.en) / 2, {}); if (!c3.some(s => /端悬挑 \d+ 单元 · .*吊装/.test(s))) fail('平面未注「端悬挑 · 吊装」'); }
    baseTxt0 = ` hoist_units=${H.length}`; }
  if (noSup.length) fail(`${noSup.length} 个单元下方既无胎架也无楼板：${noSup.join(' ')}`);
  baseTxt = baseTxt0 + ` jigs_on_floor=${nj} jigs_low=${nL} unsupported_units=${noSup.length} scope=${r.n != null ? r.n : r.mask.filter(Boolean).length}`; }
// ---- 3D 施工面模块 web/mods/s251.js：在拼单元数 = stateAt.live、红杆件根数 = 进度、每台汽车吊脚下有楼面且不压构件（暴力比对，不走模块网格）、耗时、opts.clip ----
let faceTxt = '';
{ const MD = (G.HZ_MODS || []).find(m => m.id === 's251-face');
  if (!MD || typeof MD.build !== 'function' || typeof MD.update !== 'function') fail('未登记 HZ_MODS s251-face（build / update）');
  const stOf = (p, t) => { if (p.st == null || t < p.st) return -1; if (p.rm && p.rm[0] >= 0 && t >= p.rm[0]) return t >= p.rm[0] + p.rm[1] ? 3 : 2; return t < p.st + p.du ? (t - p.st) / p.du : 2; };
  const BX = []; for (const a of HZ.acts) if (a.kind !== 'untemp') for (const p of a.parts) { if (p.grp || p.cells || !p.geo || !p.geo.boxes) continue; for (const b of p.geo.boxes) BX.push({ p, a, b }); }
  let nLive = 0, nCr = 0, nSeg = 0, nHo = 0; const W = P.window, FT = HZ.P.floorTop;
  for (let t = W[0]; t <= W[1]; t += 0.5) { const L = MD.lines(HZ, t), s = P.stateAt(t);
    if (L.live.length !== s.live.length) fail(`t=${t} 施工面单元 ${L.live.length} ≠ 在拼 ${s.live.length}`);
    const want = s.live.reduce((a, u) => a + Math.floor(u.rods * s.frac(u)), 0); if (L.rods !== want) fail(`t=${t} 红杆件 ${L.rods} ≠ 进度应有 ${want}`);
    if (L.cranes.length !== L.live.length) fail(`t=${t} 在拼单元 ${L.live.length} 个、汽车吊 ${L.cranes.length} 台`);
    for (const c of L.cranes) { const here = BX.filter(e => { const k = stOf(e.p, t); return k >= 0 && k < 3; });
      if (c.hoist) { const u = P.model().units.find(v => v.id === c.unit); nHo++;   // 吊装单元：履带吊在楼面端头以外、比楼面低，脚下是地面或在场构件顶面，周围不压构件
        if (!u || !u.hoist) fail(`t=${t} ${c.unit} 不是吊装单元却用了履带吊`);
        if (c.y > FT - 1 || (u.hoistEnd === 'S' ? c.z <= u.zb : c.z >= u.za)) fail(`t=${t} 履带吊 ${c.unit} 不在楼面端头以外的下层 (${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})`);
        if (c.y > 0.01 && !here.some(e => e.b.min[0] <= c.x && e.b.max[0] >= c.x && e.b.min[2] <= c.z && e.b.max[2] >= c.z && Math.abs(e.b.max[1] - c.y) < 0.01)) fail(`t=${t} 履带吊 ${c.unit} 脚下悬空`);
        const h2 = here.find(e => e.b.max[0] > c.x - 4 && e.b.min[0] < c.x + 4 && e.b.max[2] > c.z - 4 && e.b.min[2] < c.z + 4 && e.b.max[1] > c.y + 0.05 && e.b.min[1] < c.y + 5); if (h2) fail(`t=${t} 履带吊 ${c.unit} 压在 ${h2.a.key} 上`); continue; }
      if (!here.some(e => /^floor[SN]$/.test(e.a.key) && e.b.min[0] <= c.x && e.b.max[0] >= c.x && e.b.min[2] <= c.z && e.b.max[2] >= c.z && Math.abs(e.b.max[1] - c.y) < 0.6)) fail(`t=${t} 汽车吊 ${c.unit} 脚下没有楼面 (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
      const hit = here.find(e => e.b.max[0] > c.x - 3.5 && e.b.min[0] < c.x + 3.5 && e.b.max[2] > c.z - 3.5 && e.b.min[2] < c.z + 3.5 && e.b.max[1] > c.y + 0.05 && e.b.min[1] < c.y + 4);
      if (hit) fail(`t=${t} 汽车吊 ${c.unit} 压在 ${hit.a.key} 上`); }
    nLive += L.live.length; nCr += L.cranes.length; nSeg = Math.max(nSeg, L.face.length / 6); }
  if (nLive < 100) fail(`施工面抽样只有 ${nLive}`); if (P.model().units.some(u => u.hoist) && !nHo) fail('吊装单元在拼期间没有履带吊');
  const made = []; const T = { BufferGeometry: function () { this.setAttribute = () => {}; this.setDrawRange = () => {}; }, BufferAttribute: function () {}, DynamicDrawUsage: 1,
    LineBasicMaterial: function (o) { Object.assign(this, o); made.push(this); }, LineSegments: function (g, m) { this.geometry = g; this.material = m; } };
  const plane = { normal: [0, 0, 1], constant: 0 }; MD.build({ add: () => {} }, HZ, T, { clip: [plane] });
  if (!made.length || made.some(m => !m.clippingPlanes || m.clippingPlanes[0] !== plane)) fail('opts.clip 未传到材质');
  MD.build(null, HZ);
  const ms = [], re = []; let key = null; for (let f = 0; f < 2400; f++) { const t = W[0] + 8 + f / 60, k = Math.round(t * 8), t0 = process.hrtime.bigint(); MD.update(t, [0, 50, 0]); const d = Number(process.hrtime.bigint() - t0) / 1e6; if (f > 30) { ms.push(d); if (k !== key) re.push(d); } key = k; }
  re.sort((a, b) => a - b); const avg = ms.reduce((a, b) => a + b, 0) / ms.length, med = re[re.length >> 1];   // 同 check_actors：60 帧/秒、1 天/秒播放
  if (avg > 2 || med > 2) fail(`update 平均 ${avg.toFixed(2)} ms、重算帧中位 ${med.toFixed(2)} ms，应 < 2 ms`);
  faceTxt = ` face=${nLive} cranes=${nCr} crawler=${nHo} segmax=${nSeg} face_ms=${avg.toFixed(2)}`; }
console.log(`OK check_s251 real ${devTxt} runs=${runs} units=${N} parts=${nParts} cam=${P.cam.length}${faceTxt}${baseTxt}`);
