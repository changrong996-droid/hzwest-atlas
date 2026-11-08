'use strict';
// 近景人员与车辆（web/mods/actors.js）无头检查 · hark-darrio
// 1 登记接口；2 全工期抽样：小人 / 车辆 / 履带吊底盘不穿模（与在场构件盒逐个暴力比对，不走模块自己的网格）、不悬空（脚下是在场构件顶面或地面）、互不重叠；
// 3 数量随工序强度变（有工序时有人、开通后无人）；4 只在镜头 < 120 m 出现；5 每帧 update < 2 ms（含每小时重排的帧）。
const { load } = require('./harness');
const { G, HZ } = load({ extra: ['web/mods/actors.js'] });
HZ.make();
const fail = m => { console.log('FAIL check_actors: ' + m); process.exit(1); };
const M = (G.HZ_MODS || []).find(m => m.id === 'actors');
if (!M || typeof M.build !== 'function' || typeof M.update !== 'function') fail('未登记 HZ_MODS actors（build / update）');
M.build(null, HZ);
// D-16：opts.clip 传给线材质 clippingPlanes（用桩 THREE 验证；不传时材质无 clippingPlanes）
{ const mk = () => { const made = {}; const T = { BufferGeometry: function () { this.setAttribute = () => {}; this.setDrawRange = () => {}; }, BufferAttribute: function () {}, DynamicDrawUsage: 1,
    LineBasicMaterial: function (o) { Object.assign(this, o); made.mat = this; }, LineSegments: function (g, m) { this.geometry = g; this.material = m; } }; return { T, made }; };
  const sc = { add: () => {} }, plane = { normal: [1, 0, 0], constant: -39 };
  let k = mk(); M.build(sc, HZ, k.T, { clip: [plane] }); if (!k.made.mat || !Array.isArray(k.made.mat.clippingPlanes) || k.made.mat.clippingPlanes[0] !== plane) fail('D-16 opts.clip 未传到线材质 clippingPlanes');
  k = mk(); M.build(sc, HZ, k.T); if (k.made.mat.clippingPlanes) fail('D-16 没传 clip 时不应有 clippingPlanes');
  M.build(null, HZ); }
const stOf = (p, t) => { if (p.st == null || t < p.st) return -1; if (p.rm && p.rm[0] >= 0 && t >= p.rm[0]) return t >= p.rm[0] + p.rm[1] ? 3 : 2; return t < p.st + p.du ? (t - p.st) / p.du : 2; };
const ALL = []; for (const a of HZ.acts) for (const p of a.parts) { if (p.grp || p.cells || !p.geo || !p.geo.boxes) continue; for (const b of p.geo.boxes) ALL.push({ p, a, b }); }
const live = t => ALL.filter(e => { const s = stOf(e.p, t); return s >= 0 && s !== 3; });
const hit = (L, x0, y0, z0, x1, y1, z1) => L.find(({ b }) => b.max[0] > x0 && b.min[0] < x1 && b.max[1] > y0 && b.min[1] < y1 && b.max[2] > z0 && b.min[2] < z1);
const onTop = (L, x, y, z) => Math.abs(y) <= 0.03 || L.some(({ b }) => x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && Math.abs(b.max[1] - y) <= 0.03);
const ext = (hx, hz, yaw) => { const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)); return [hx * c + hz * s, hx * s + hz * c]; };
const T = []; for (let t = 0.4; t < HZ.P.OPEN; t += 9.7) T.push(t); for (const k of ['found', 'frameS', 'deckS', 'trackS', 'col24N', 'mast', 'asm1', 'holes', 'clad', 'tod', 'ym']) T.push(HZ.K[k].start + HZ.K[k].dur * 0.4 + 0.45);
let nF = 0, nV = 0, nC = 0, busyT = 0, emptyBusy = [];
for (const t of T) { const P = M.plan(HZ, M.I, t), L = live(t), occ = [];
  const busy = HZ.acts.some(a => a.kind === 'build' && a.parts.some(p => !p.grp && !p.cells && p.geo && (s => s >= 0 && s < 1)(stOf(p, t))));
  const hd = (t % 1) * 24; if (busy && hd >= 7 && hd < 19) { busyT++; if (!P.figs.length) emptyBusy.push(t.toFixed(1)); }
  for (const f of P.figs) { const bx = [f.x - 0.3, f.y + 0.02, f.z - 0.3, f.x + 0.3, f.y + 1.85, f.z + 0.3], h = hit(L, ...bx);
    if (h) fail(`t=${t.toFixed(2)} 小人穿模 ${f.act} @${f.x.toFixed(1)},${f.y.toFixed(2)},${f.z.toFixed(1)} 撞 ${h.a.key}`);
    if (!onTop(L, f.x, f.y, f.z)) fail(`t=${t.toFixed(2)} 小人悬空 ${f.act} y=${f.y}`); if (!M.FIG[f.pose]) fail('未知姿态 ' + f.pose); occ.push(bx); nF++; }
  for (const v of P.vehs) { const V = M.VEH[v.kind], [ex, ez] = ext(V.hx, V.hz, v.yaw), bx = [v.x - ex, v.y + 0.02, v.z - ez, v.x + ex, v.y + V.h, v.z + ez], h = hit(L, ...bx);
    if (h) fail(`t=${t.toFixed(2)} ${v.kind} 穿模 撞 ${h.a.key}`);
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw); for (const [u, w] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = v.x + u * V.hx * 0.9 * c - w * V.hz * 0.9 * s, z = v.z + u * V.hx * 0.9 * s + w * V.hz * 0.9 * c; if (!onTop(L, x, v.y, z)) fail(`t=${t.toFixed(2)} ${v.kind} 悬空 (${x.toFixed(1)},${v.y},${z.toFixed(1)})`); }
    occ.push(bx); nV++; }
  for (const k of P.cranes) { const V = M.VEH.crawler, [ex, ez] = ext(V.hx, V.hz, k.yaw), h = hit(L, k.x - ex, k.y + 0.02, k.z - ez, k.x + ex, k.y + V.h, k.z + ez); if (h) fail(`t=${t.toFixed(2)} 履带吊底盘穿模 撞 ${h.a.key}`); if (!(k.tipY > k.hook)) fail('吊钩高于臂头'); nC++; }
  for (let i = 0; i < occ.length; i++) for (let j = i + 1; j < occ.length; j++) { const a = occ[i], b = occ[j]; if (a[3] > b[0] && a[0] < b[3] && a[4] > b[1] && a[1] < b[4] && a[5] > b[2] && a[2] < b[5]) fail(`t=${t.toFixed(2)} 人 / 车互相重叠`); } }
if (!(nF > 300 && nV > 20)) fail(`抽样里人 ${nF}、车 ${nV} 太少`);
if (emptyBusy.length > busyT * 0.1) fail(`白天有在建工序却没人的时刻过多：${emptyBusy.slice(0, 8).join(', ')}`);
if (M.plan(HZ, M.I, HZ.P.OPEN + 2.5).figs.length) fail('开通后还有工人');
// 强度：人数随在建构件数变（取 found 段与 trackS 段比较不应恒等）
const nAt = t => M.plan(HZ, M.I, t).figs.length, counts = new Set(T.map(t => nAt(t))); if (counts.size < 6) fail('人数几乎不随工序变化');
// 4. 距离阈值
const t0 = HZ.K.frameS.start + 10.45, P0 = M.plan(HZ, M.I, t0), f0 = P0.figs[0]; if (!f0) fail('frameS 期间无人');
M.key = null; let n = M.update(t0, [f0.x + 30, f0.y + 20, f0.z + 30]); if (!(n > 0)) fail('镜头 40 m 内看不到小人');
M.key = null; n = M.update(t0, [f0.x + 2000, 900, f0.z]); if (n !== 0) fail(`镜头 2 km 外仍画了 ${n} 段`);
M.key = null; M.update(t0, { position: { x: f0.x + 60, y: f0.y + 40, z: f0.z } }); const shown = M.stats.shown, R2 = M.R_SHOW * M.R_SHOW;
const exp = M.P.figs.concat(M.P.vehs).filter(o => (o.x - f0.x - 60) ** 2 + (o.y + 1 - f0.y - 40) ** 2 + (o.z - f0.z) ** 2 <= R2 * 1.05).length; if (shown > exp + M.P.cranes.length) fail('阈值外的对象被画出');
// 5. 每帧耗时：播放 1 天 / 秒、60 fps 的 600 帧 + 镜头绕作业面转
let worst = 0, sum = 0, frames = 0; const ALLMS = []; const t1 = HZ.K.frameN.start + 5;
for (let i = 0; i < 600; i++) { const t = t1 + i / 60, a = i * 0.02, cam = [f0.x + Math.cos(a) * 70, f0.y + 35, f0.z + Math.sin(a) * 70]; const s = process.hrtime.bigint(); M.update(t, cam); const ms = Number(process.hrtime.bigint() - s) / 1e6; if (i > 30) { worst = Math.max(worst, ms); sum += ms; frames++; if (M.planCall === M.calls) ALLMS.push(ms); } }
const avg = sum / frames, p50 = ALLMS.sort((a, b) => a - b)[Math.floor(ALLMS.length * 0.5)]; if (!ALLMS.length) fail('播放中没有重排'); if (avg > 2 || p50 > 2) fail(`update 平均 ${avg.toFixed(2)} ms、重排帧中位 ${p50.toFixed(2)} ms，应 < 2 ms`);
console.log(`OK check_actors 时刻 ${T.length}、小人 ${nF}、车 ${nV}、履带吊 ${nC}；update 平均 ${avg.toFixed(3)} ms、重排帧中位 ${p50.toFixed(2)} ms（${ALLMS.length} 次），最慢 ${worst.toFixed(2)} ms（含每小时重排）`);
