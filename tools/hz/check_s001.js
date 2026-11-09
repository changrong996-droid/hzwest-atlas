'use strict';
// S-001 总进度插件（web/sheets/s001.js）无头检查：登记字段、绘制、大数字、关键链、parts、竖长画布、镜头、改 HZ 图跟着变。
const { load, makeCtx, sheetCtx } = require('./harness');
const { G, HZ } = load({ extra: ['web/hzatlas.js', 'web/sheets/s001.js'] });
HZ.make();
const fail = (m) => { console.log('FAIL check_s001: ' + m); process.exit(1); };
const pl = (G.HZ_SHEET_PLUGINS || []).find((p) => p && p.id === 'S-001');
if (!pl) fail('HZ_SHEET_PLUGINS 里没有 S-001');
for (const k of ['draw', 'big', 'parts', 'stats']) if (typeof pl[k] !== 'function') fail('缺 ' + k);
const K = HZ.K, all = Object.values(K), [w0, w1] = pl.window;
if (!(w0 === Math.min(...all.map(a => a.start)) && w1 === Math.max(...all.map(a => a.end)))) fail(`时间窗 ${w0}–${w1} 与排程首尾不一致`);
const NO = G.HZA.PROJECT + '-S-001-1';
// 1 绘制：9 个时刻 × 5 尺寸
let runs = 0;
for (let t = w0 - 1; t <= w1 + 1; t += (w1 - w0 + 2) / 8) for (const [w, h] of [[600, 420], [300, 160], [600, 984], [800, 1200], [566, 480]]) {
  const c = makeCtx(), ctx = sheetCtx(), t0 = Date.now();
  try { pl.draw(c.g, w, h, t, ctx); } catch (e) { fail(`draw t=${t} ${w}x${h} 抛错 ${e && e.message}`); }
  if (Date.now() - t0 > 200) fail(`绘制过慢 t=${t} ${w}x${h}`);
  if (ctx.seenNo !== NO) fail(`图号 期望 ${NO} 实得 ${ctx.seenNo}`);
  if (!((c.calls.fillRect || 0) >= 1) || c.texts.length < 1) fail(`t=${t} ${w}x${h} 未画图或未写字`);
  runs++;
}
// 2 大数字 = 当天在施工序数（含拆除），逐日与排程直接数一致
const rmKeys = new Set(all.filter(a => /~rm$/.test(a.key)).map(a => a.key));
for (let t = w0; t <= w1; t += 7) {
  const want = new Set(); for (const a of all) if (t >= a.start && t < a.end) want.add(/~rm$/.test(a.key) ? (a.of.key || a.of) : a.key);
  const b = pl.big(t); if (!b || b.num !== want.size) fail(`big(${t}) = ${b && b.num}，排程直接数 ${want.size}`);
}
if (pl.big(w1 + 1).num !== 0) fail('开通后仍有在施工序');
// 3 关键链：含开通与首道工序，链上相邻两道前后衔接
const ch = pl.chain(); if (ch.length < 8) fail('关键链过短：' + ch.join(','));
if (!ch.includes(all.reduce((m, a) => (a.start < m.start ? a : m), all[0]).key)) fail('关键链没有回到首道工序');
// 4 parts：窗内每个采样时刻 ≥1 项、id 唯一、hit 在画布内、box 有限且非零体积、info ≥3 行；focus 绘制不抛错
let nParts = 0;
for (const [w, h] of [[600, 420], [300, 560], [600, 984], [800, 1200]]) {
  const c0 = makeCtx(); pl.draw(c0.g, w, h, w0, sheetCtx());
  for (let t = w0; t <= w1; t += (w1 - w0) / 6) {
    const ps = pl.parts(t, { w, h }); if (!ps.length) fail(`parts(${t}) 为空`);
    const ids = new Set();
    for (const q of ps) {
      if (ids.has(q.id)) fail('part id 重复 ' + q.id); ids.add(q.id);
      const [x, y, ww, hh] = q.hit; if (!(x >= 0 && y >= 0 && x + ww <= w + 0.5 && y + hh <= h + 0.5 && ww > 0 && hh > 0)) fail(`hit 越界 ${q.id} @${w}x${h}`);
      const b = q.box; if (!(b.every(Number.isFinite) && b[3] > b[0] && b[4] > b[1] && b[5] > b[2])) fail('box 非法 ' + q.id);
      if (!q.label || !Array.isArray(q.info) || q.info.length < 3) fail('label / info 缺 ' + q.id);
    }
    nParts = ps.length;
  }
}
if (nParts < 40) fail('可点工序过少：' + nParts);
for (const id of ['K-clad', 'K-found', 'K-jig1']) { const c = makeCtx(); try { pl.draw(c.g, 600, 984, 700, sheetCtx(null, { focus: id })); } catch (e) { fail('focus=' + id + ' 抛错 ' + e.message); } }
// 5 镜头：窗内递增、不入地、机位高于 150 m
let lt = -1e9;
for (const k of pl.cam || []) {
  if (!(k.t >= w0 && k.t <= w1) || k.t <= lt) fail('镜头关键帧时间不在窗内或未递增 t=' + k.t);
  if (!(k.target[1] >= 0 && k.el > 0 && k.dist > 0) || k.dist * Math.sin(k.el * Math.PI / 180) + k.target[1] < 150) fail('镜头过低 t=' + k.t);
  lt = k.t;
}
// 6 改 HZ 图跟着变：金属屋面推后 20 天 → 同一时刻在施工序数与 K-clad 工期跟着变
const tp = K.clad.start + 5, a0 = pl.big(tp).num, i0 = JSON.stringify(pl.parts(tp).find(q => q.id === 'K-clad').info);
K.clad.start += 20; K.clad.end += 20; const a1 = pl.big(tp).num, i1 = JSON.stringify(pl.parts(tp).find(q => q.id === 'K-clad').info); K.clad.start -= 20; K.clad.end -= 20;
if (a1 !== a0 - 1) fail(`改 HZ.K.clad 后在施工序数未变 ${a0} → ${a1}`);
if (i0 === i1) fail('改 HZ.K.clad 后 parts 工期未变');
// 7 屋面工序 3D 盒子独立性与点选规则断言
const roofKeys = ['merge', 'lift1', 'lift2', 'lift3', 'wlift', 'head', 'holes', 'sky', 'clad', 'pv'];
const ps0 = pl.parts(w0), byId0 = new Map(ps0.map(q => [q.id, q]));
for (let i = 0; i < roofKeys.length; i++) {
  const pa = byId0.get('K-' + roofKeys[i]); if (!pa) fail('缺屋面工序 K-' + roofKeys[i]);
  for (let j = i + 1; j < roofKeys.length; j++) {
    const pb = byId0.get('K-' + roofKeys[j]); if (!pb) fail('缺屋面工序 K-' + roofKeys[j]);
    if (pa.box.every((v, k) => Math.abs(v - pb.box[k]) < 1e-6)) fail(`屋面工序 K-${roofKeys[i]} 与 K-${roofKeys[j]} 盒子完全相同`);
  }
}
for (const q of ps0.filter(x => x.id === 'K-merge' || x.id.startsWith('K-merge-'))) {
  const dz = q.box[5] - q.box[2]; if (!(dz > 0 && dz <= 30)) fail(`${q.id} 盒子 z 向宽度 ${dz} > 30 m`);
}
const pickBox = (parts, x, y, z, m = 1.5) => {
  let best = null, bv = Infinity;
  for (const p of parts) {
    const b = p.box;
    if (x >= b[0] - m && x <= b[3] + m && y >= b[1] - m && y <= b[4] + m && z >= b[2] - m && z <= b[5] + m) {
      const v = Math.abs((b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]));
      if (v < bv) { bv = v; best = p; }
    }
  }
  return best;
};
const psClad = pl.parts(K.clad.start + 10);
for (const [x, z] of [[60, 100], [-60, -100]]) {
  const hit = pickBox(psClad, x, HZ.Hc(x, z) + 0.5, z);
  if (!hit || hit.id.startsWith('K-merge')) fail(`t=clad+10 点(${x},${z}) 误选 ${hit && hit.id}`);
  if (!hit.id.startsWith('K-clad')) fail(`t=clad+10 点(${x},${z}) 未选中 K-clad*，实得 ${hit.id}`);
}
// (a) t = K.clad.end + 1 时 parts 里没有 K-clad- 开头的子盒，且有且只有一个 'K-clad'
const psAfterClad = pl.parts(K.clad.end + 1);
if (psAfterClad.some(q => q.id.startsWith('K-clad-'))) fail('t=clad.end+1 仍有 K-clad- 子盒');
if (psAfterClad.filter(q => q.id === 'K-clad').length !== 1) fail('t=clad.end+1 K-clad 整盒数量不为 1');
// (b) t = K.pv 在施中点，点 (60, HZ.Hc(60,100)+0.5, 100) 和 (-60, HZ.Hc(-60,-100)+0.5, -100)（均在 HZ.pvMask 范围内）：选中 id 以 'K-pv' 开头
const tPvMid = (K.pv.start + K.pv.end) / 2, psPvMid = pl.parts(tPvMid);
for (const [x, z] of [[60, 100], [-60, -100]]) {
  const hit = pickBox(psPvMid, x, HZ.Hc(x, z) + 0.5, z);
  if (!hit || !hit.id.startsWith('K-pv')) fail(`t=pv中点(${tPvMid}) 点(${x},${z}) 未选中 K-pv*，实得 ${hit && hit.id}`);
}
// (c) 所有屋面工序均已完工且之后再无屋面工序在施的时刻（t = K.pv.end + 5），点同一屋面点，选中的是最近完工的屋面工序（pv）
const tRoofDone = K.pv.end + 5, psRoofDone = pl.parts(tRoofDone);
const lastRoofKey = roofKeys.reduce((best, k) => (K[k].end > K[best].end ? k : best), roofKeys[0]);
for (const [x, z] of [[60, 100], [-60, -100]]) {
  const hit = pickBox(psRoofDone, x, HZ.Hc(x, z) + 0.5, z);
  if (!hit || !hit.id.startsWith('K-' + lastRoofKey)) fail(`t=${tRoofDone} 点(${x},${z}) 未选中最近完工屋面工序 K-${lastRoofKey}，实得 ${hit && hit.id}`);
}
// (e) 在 t = pv 中点 与 t = pv.end+5，对屋面网格（x -110..110、z -150..150 步长 10，HZ.rho<=1）点 (x, Hc+0.5, z)，选中 'K-pv' 开头的比例 >= 90%
for (const [tag, ps] of [['pv中点', psPvMid], ['pv.end+5', psRoofDone]]) {
  let tot = 0, ok = 0;
  for (let x = -110; x <= 110; x += 10) for (let z = -150; z <= 150; z += 10) {
    if (HZ.rho(x, z) > 1) continue;
    tot++;
    const hit = pickBox(ps, x, HZ.Hc(x, z) + 0.5, z);
    if (hit && hit.id.startsWith('K-pv')) ok++;
  }
  if (!tot || ok / tot < 0.9) fail(`t=${tag} 屋面网格选中 K-pv* 比例 ${ok}/${tot} < 90%`);
}
// (f) 对 roofKeys 每道工序，parts(t) 不带 focus 时它的 box 与带 focus 时一致（保证点横道飞镜用的是真实盒）
for (const t of [w0, K.merge.start + 3, K.clad.start + 10, tPvMid, tRoofDone]) {
  const psNoFoc = new Map(pl.parts(t, { w: 600, h: 420 }).map(q => [q.id, q.box]));
  for (const k of roofKeys) {
    const id = 'K-' + k, b0 = psNoFoc.get(id), b1 = (pl.parts(t, { w: 600, h: 420, focus: id }).find(q => q.id === id) || {}).box;
    if (!b0 || !b1 || !b0.every((v, i) => Math.abs(v - b1[i]) < 1e-6)) fail(`t=${t} ${id} 不带 focus 与带 focus 的 box 不一致`);
  }
}
const psMerge = pl.parts(K.merge.start + 3);
for (const z of [40, -40]) {
  const hit = pickBox(psMerge, 0, 50, z);
  if (!hit || !hit.id.startsWith('K-merge')) fail(`t=merge+3 点(0,50,${z}) 未选中 K-merge，实得 ${hit && hit.id}`);
}
console.log(`OK check_s001 runs=${runs} parts=${nParts} chain=${ch.length} live@700=${pl.big(700).num}`);
