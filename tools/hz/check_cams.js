'use strict';
// 插件镜头扫描（任务书 docs/tasks/cam-sweep.md · hark-liuzhijie）
// 对任意 web/sheets/*.js 插件的 cam 关键帧做规则检查，不改共用文件。
//
// 用法：node tools/hz/check_cams.js [S-101 S-201 …] [--json] [--suggest]
//   不带图号 = 扫 web/sheets/ 下全部插件。退出码：任一硬规则违反 → 1。
//   --suggest：对违反的关键帧在同一目标附近搜索（方位 ±60°、仰角 8–70°、距离 ×0.6–1.6）给出满足全部规则的最近替代帧。
//
// 镜头模型与页面一致：
//   · 关键帧插值 = hzview.js camPlug()：相邻关键帧之间 smoothstep(t_i, t_{i+1}, t) 线性混合 az/el/dist/target；
//   · 机位 = hzview.js placeCam()：pos = target + d·(sin az·cos el, sin el, −cos az·cos el)；
//   · 视场 = PerspectiveCamera(28°)，按 16:9 画幅；页面上还会乘 aspK ≥ 1（竖屏拉远），这里取 1（最近、最严）。
// 构件盒：每个构件 geo.boxes（没有就用 geo.min/max）；在 [st, 拆除完成) 期间算「在场」（在建也算，偏保守）；
//   随整体提升移动的构件（grp 1–4）按 HZ.pose(t) / HZ.mat 变换后取包围盒。地面 y = 0 视为不透明。
//
// 规则（硬约束，见任务书）：
//   R1 地下：机位 y ≥ 0.5 m（地铁层开敞前一律禁止进地下）。
//   R2 遮挡：机位 → 目标的 9 条视线（目标与其周围 ±4% 距离的 8 点）不能全部被构件或地面挡住。
//   R3 主体：画面里主体投影面积 ≥ 15%。主体 = 本图活动（工期至少一半落在时间窗内的 build 活动）在该时刻已在场的构件
//        （在建 + 已完工）加上尚未开建的本图构件（幽灵盒，只算面积不挡视线）——即镜头要框住这一阶段的工区；
//        插件可用 subject(t) → 活动键数组覆盖（返回 null = 用默认）。
//        面积用 32×18 像素光线、首个命中为主体的比例计（自带遮挡）。
//   R4 穿模：机位不在任何在场构件盒内；相邻采样机位之间的连线不穿过构件盒（采样步长 ≤ 2 天，关键帧附近加密到 0.25 天）。
// 采样：每个关键帧 + 关键帧之间每 2 天一次（任务书要求）；R4 另在每段内加密。
const path = require('path');
const fs = require('fs');
const { load } = require('./harness');

const args = process.argv.slice(2), JSON_OUT = args.includes('--json'), SUGGEST = args.includes('--suggest');
// --cam=<JSON 数组>：替换（唯一选中的）插件的 cam 关键帧，用来试改镜头
const camArg = args.find(a => a.startsWith('--cam=')), camOv = camArg ? JSON.parse(camArg.slice(6)) : null;
const want = args.filter(a => !a.startsWith('--')).map(s => s.toUpperCase());
const sheetDir = path.join(__dirname, '../../web/sheets');
const files = fs.existsSync(sheetDir) ? fs.readdirSync(sheetDir).filter(f => /^s\d+\.js$/.test(f)).sort().map(f => 'web/sheets/' + f) : [];
const { G, HZ } = load({ extra: ['web/hzreal.js', ...files] });
HZ.make();
const plugins = (G.HZ_SHEET_PLUGINS || []).filter(p => !want.length || want.includes(p.id));
if (camOv) { if (plugins.length !== 1) { console.log('FAIL check_cams: --cam 只能配合一个图号'); process.exit(1); } plugins[0] = Object.assign({}, plugins[0], { cam: camOv }); }
if (!plugins.length) { console.log('FAIL check_cams: 没有可扫的插件' + (want.length ? '（' + want.join(' ') + '）' : '')); process.exit(1); }

const FOV = 28, ASPECT = 16 / 9, GRID = [32, 18], SUBJ_MIN = 0.15, Y_MIN = 0.5, STEP = 2, FINE = 0.25;
const D2R = Math.PI / 180, sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- 镜头（同 hzview.js camPlug / placeCam）----
const cv = c => ({ az: c.az, el: c.el, d: c.dist, tx: c.target[0], ty: c.target[1], tz: c.target[2] });
function camAt(cs, t) { let i = 0; while (i < cs.length - 1 && cs[i + 1].t <= t) i++;
  const a = cv(cs[i]); if (i >= cs.length - 1 || t <= cs[0].t) return cv(t <= cs[0].t ? cs[0] : cs[i]);
  const b = cv(cs[i + 1]), f = sm(cs[i].t, cs[i + 1].t, t); for (const k in a) a[k] += (b[k] - a[k]) * f; return a; }
function posOf(k) { const az = k.az * D2R, el = k.el * D2R; return [k.tx + Math.sin(az) * Math.cos(el) * k.d, k.ty + Math.sin(el) * k.d, k.tz - Math.cos(az) * Math.cos(el) * k.d]; }

// ---- 构件盒 ----
const PARTS = []; for (const a of HZ.acts) for (const p of a.parts) { if (!p.geo) continue; const bs = p.geo.boxes && p.geo.boxes.length ? p.geo.boxes : (isFinite(p.geo.min[0]) ? [{ min: p.geo.min, max: p.geo.max }] : []); if (bs.length) PARTS.push({ a, p, bs }); }
const present = (p, t) => p.st != null && t >= p.st && !(p.rm && p.rm[0] >= 0 && t >= p.rm[0] + p.rm[1]);
function xform(b, m) { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < 8; k++) { const x = k & 1 ? b.max[0] : b.min[0], y = k & 2 ? b.max[1] : b.min[1], z = k & 4 ? b.max[2] : b.min[2];
    const v = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], v[i]); mx[i] = Math.max(mx[i], v[i]); } } return { min: mn, max: mx }; }
// 本图的活动：工期至少一半落在时间窗里的施工活动（不含临时设施、拆除、里程碑）
const WA = new Map(); function winActs(pl) { if (WA.has(pl.id)) return WA.get(pl.id); const [W0, W1] = pl.window;
  const s = new Set(HZ.acts.filter(a => a.kind === 'build' && a.parts.length && (Math.min(W1, a.end) - Math.max(W0, a.start)) >= 0.5 * Math.max(1e-6, a.end - a.start)).map(a => a.key)); WA.set(pl.id, s); return s; }
function scene(t, pl) {
  const ps = HZ.pose(t), M = {}; for (const g of [1, 2, 3, 4]) M[g] = HZ.mat(ps, g);
  let subj = null; if (typeof pl.subject === 'function') { try { const v = pl.subject(t); subj = v ? new Set(v) : null; } catch (e) { subj = null; } }
  const live = winActs(pl);
  const out = [];
  for (const q of PARTS) { const isS = subj ? subj.has(q.a.key) : live.has(q.a.key), here = present(q.p, t);
    // 未建的本图构件 = 幽灵盒：只计入主体面积（镜头要框住这一阶段的工区），不挡视线、不算穿模
    if (!here && !(isS && q.p.st != null && q.p.st > t && !(q.p.rm && q.p.rm[0] >= 0 && q.p.rm[0] <= t))) continue;
    for (const b0 of q.bs) { const b = q.p.grp && M[q.p.grp] ? xform(b0, M[q.p.grp]) : b0; out.push({ b, s: isS, g: !here, name: q.a.key }); } }
  return out;
}
// 光线 ∩ 盒：返回进入参数（0..1 段内），没有返回 Infinity；起点在盒内返回 0
function hitBox(o, d, b, tmax) { let t0 = 0, t1 = tmax; for (let k = 0; k < 3; k++) { if (Math.abs(d[k]) < 1e-12) { if (o[k] < b.min[k] || o[k] > b.max[k]) return Infinity; continue; }
  let a = (b.min[k] - o[k]) / d[k], c = (b.max[k] - o[k]) / d[k]; if (a > c) { const s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity; } return t0; }
const inside = (p, b, e) => p[0] > b.min[0] + e && p[0] < b.max[0] - e && p[1] > b.min[1] + e && p[1] < b.max[1] - e && p[2] > b.min[2] + e && p[2] < b.max[2] - e;
function firstHit(o, d, tmax, S, ghosts) { let best = tmax, who = null; if (d[1] < 0) { const tg = -o[1] / d[1]; if (tg < best) { best = tg; who = 'ground'; } }
  for (const e of S) { if (e.g && !ghosts) continue; const h = hitBox(o, d, e.b, best + 1e-6); if (h < best || (h <= best + 1e-6 && who === 'ground')) { best = Math.min(best, h); who = e; } } return { t: best, who }; }   // 与地面同距（贴地板面）算构件

function basis(c, tg) { const f = norm(sub(tg, c)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f); return { f, r, u }; }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len = a => Math.hypot(a[0], a[1], a[2]), norm = a => mul(a, 1 / (len(a) || 1));

function evalShot(k, S) {
  const c = posOf(k), tg = [k.tx, k.ty, k.tz], r = {};
  r.y = c[1]; r.R1 = c[1] >= Y_MIN;
  const inBox = S.find(e => !e.g && inside(c, e.b, 0.05)); r.R4in = !inBox; r.inName = inBox && inBox.name;
  // R2：9 条视线
  const B = basis(c, tg), off = 0.04 * k.d; let clear = 0;
  for (const [i, j] of [[0, 0], [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
    const p = add(tg, add(mul(B.r, i * off), mul(B.u, j * off))), dv = sub(p, c), L = len(dv), d = mul(dv, 1 / L);
    const h = firstHit(c, d, L, S); if (h.t >= L - Math.max(1.5, 0.01 * L)) clear++; }
  r.clear = clear; r.R2 = clear > 0;
  if (!r.R2) { const dv = sub(tg, c), L = len(dv), h = firstHit(c, mul(dv, 1 / L), L, S); r.blk = h.who === 'ground' ? '地面' : h.who && h.who.name; }
  // R3：主体投影面积
  const th = Math.tan(FOV * D2R / 2), tw = th * ASPECT; let sHit = 0, n = 0;
  for (let y = 0; y < GRID[1]; y++) for (let x = 0; x < GRID[0]; x++) { const sx = ((x + 0.5) / GRID[0] * 2 - 1) * tw, sy = (1 - (y + 0.5) / GRID[1] * 2) * th;
    const d = norm(add(B.f, add(mul(B.r, sx), mul(B.u, sy)))), h = firstHit(c, d, 40000, S, true); n++; if (h.who && h.who !== 'ground' && h.who.s) sHit++; }
  r.subj = sHit / n; r.hasSubj = S.some(e => e.s); r.R3 = !r.hasSubj || r.subj >= SUBJ_MIN;
  r.pos = c; return r;
}
const segHits = (a, b, S) => { const dv = sub(b, a), L = len(dv); if (L < 1e-6) return null; const d = mul(dv, 1 / L); for (const e of S) { if (e.g) continue; if (inside(a, e.b, 0.05) || inside(b, e.b, 0.05)) continue; if (hitBox(a, d, e.b, L) < L) return e.name; } return null; };

function suggest(key, pl) {
  const S = scene(key.t, pl), base = cv(key); let best = null;
  for (let dz = 0; dz <= 60; dz += 10) for (const sg of dz ? [1, -1] : [1]) for (const el of [8, 12, 16, 20, 25, 30, 38, 46, 55, 65]) for (const f of [1, 0.8, 1.2, 0.6, 1.4, 1.6]) {
    const k = Object.assign({}, base, { az: base.az + sg * dz, el, d: base.d * f }), r = evalShot(k, S);
    if (!(r.R1 && r.R2 && r.R3 && r.R4in)) continue; const cost = dz / 10 + Math.abs(el - base.el) / 8 + Math.abs(Math.log(f)) * 4 - r.subj;
    if (!best || cost < best.cost) best = { cost, k, r }; }
  return best && { t: key.t, target: key.target, az: Math.round(best.k.az), el: best.k.el, dist: Math.round(best.k.d), subj: +best.r.subj.toFixed(2) };
}

function sweep(pl, cs) {
  cs = cs.slice().sort((a, b) => a.t - b.t); const [W0, W1] = pl.window, rows = [], viol = [], fails = [];
  if (!cs.length) viol.push('没有 cam 关键帧');
  const ts = new Set(cs.map(c => c.t)); for (let i = 0; i < cs.length - 1; i++) for (let t = cs[i].t + STEP; t < cs[i + 1].t - 1e-9; t += STEP) ts.add(+t.toFixed(3));
  ts.add(W0); ts.add(W1);
  const T = [...ts].filter(t => t >= W0 - 1e-9 && t <= W1 + 1e-9).sort((a, b) => a - b);
  for (const t of T) { const k = camAt(cs, t), S = scene(t, pl), r = evalShot(k, S), isKey = cs.some(c => c.t === t);
    const why = []; if (!r.R1) why.push(`R1 机位 y=${r.y.toFixed(1)}`); if (!r.R2) why.push('R2 视线全被挡（' + r.blk + '）'); if (!r.R3) why.push(`R3 主体 ${(r.subj * 100).toFixed(0)}%`); if (!r.R4in) why.push('R4 机位在 ' + r.inName + ' 里');
    rows.push({ t, key: isKey, subj: r.subj, why }); if (why.length) { viol.push(`t=${t}${isKey ? '（关键帧）' : ''} ` + why.join('；')); fails.push(t); } }
  if (cs.length) for (let t = W0; t < W1 - 1e-9; t += FINE) { const t1 = Math.min(W1, t + FINE), S = scene(t1, pl), hit = segHits(posOf(camAt(cs, t)), posOf(camAt(cs, t1)), S); if (hit) { viol.push(`t=${t.toFixed(2)}→${t1.toFixed(2)} R4 机位路径穿过 ${hit}`); fails.push(+t1.toFixed(2)); break; } }
  return { rows, viol, fails, minSubj: rows.reduce((a, r) => Math.min(a, r.subj), 1) };
}
// 建议：最多 6 轮。每轮取第一个违反时刻，在当时的插值机位附近搜索合规机位，替换同时刻关键帧或插入新关键帧，再整段重扫。
function repair(pl) { let cs = (pl.cam || []).map(c => Object.assign({}, c, { target: c.target.slice() })); const changes = [];
  for (let round = 0; round < 6; round++) { const sw = sweep(pl, cs); if (!sw.fails.length) return { ok: true, cs, changes };
    const t = sw.fails[0], k = camAt(cs, t), key = { t, target: [k.tx, k.ty, k.tz].map(v => +v.toFixed(1)), az: k.az, el: k.el, dist: k.d }, sg = suggest(key, pl);
    if (!sg) return { ok: false, cs, changes, stuck: t }; delete sg.subj; const i = cs.findIndex(c => c.t === t); if (i >= 0) cs[i] = sg; else cs.push(sg); cs.sort((a, b) => a.t - b.t); changes.push((i >= 0 ? '改 ' : '插 ') + JSON.stringify(sg)); }
  const sw = sweep(pl, cs); return { ok: !sw.fails.length, cs, changes }; }

let bad = 0; const report = [];
for (const pl of plugins) { const sw = sweep(pl, pl.cam || []), rep = SUGGEST && sw.viol.length ? repair(pl) : null;
  report.push({ id: pl.id, samples: sw.rows.length, keys: (pl.cam || []).length, violations: sw.viol.length, minSubj: +sw.minSubj.toFixed(3), viol: sw.viol.slice(0, 12), repair: rep && { ok: rep.ok, changes: rep.changes, cam: rep.cs } });
  bad += sw.viol.length; }
if (JSON_OUT) { console.log(JSON.stringify(report, null, 1)); process.exit(bad ? 1 : 0); }
for (const r of report) { console.log(`${r.violations ? 'FAIL' : 'ok  '} ${r.id} 采样 ${r.samples} 关键帧 ${r.keys} 违反 ${r.violations} 最小主体 ${(r.minSubj * 100).toFixed(0)}%`); for (const v of r.viol) console.log('     · ' + v);
  if (r.repair) { for (const c of r.repair.changes) console.log('     → ' + c); console.log(r.repair.ok ? '     → 修正后重扫：违反 0' : '     → 自动修正未能清零，需要作者手调'); } }
if (bad) { console.log(`FAIL check_cams 违反 ${bad}`); process.exit(1); }
console.log(`OK check_cams plugins=${report.length} samples=${report.reduce((a, r) => a + r.samples, 0)}`);
