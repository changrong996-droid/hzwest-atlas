'use strict';
// 图纸范围「隐藏模式」镜头不空屏检查（11-09，委托人：范围外不画后，分图镜头里还得有东西看）。
// 镜头 = hzview.js camPlug（同 check_cams）；画出来的 = 本图范围内（宿主同款 PL.scopeMask + 塔吊随范围 PL.scopeCranes）且此刻在场的构件；
// 只有这些构件和地面挡视线（隐藏模式下范围外构件不画、也不挡）。32×18 光线命中「画出的构件」比例 = 可见量。
// 判定：hzview.js 的 SCOPE_OUT 为 'hide' 时，下列各图的「中点 / 末尾 / S-501 收官前」等指定时刻可见量 ≥ MIN（2%），且全窗口每 4 天采样里
//       可见量为 0 的连续段 ≤ 6 天（窗口开头 ≤ 12 天还没东西可以空，长时间空屏不行）；现场图（声明塔吊工序的 S-002）同宿主：吊机所吊构件一并画。SCOPE_OUT 为 'ghost' 时只报告。
// 用法：node tools/hz/check_scopecam.js [--json]
const fs = require('fs'), path = require('path'), vm = require('vm');
const { load } = require('./harness');
const root = path.join(__dirname, '../..'), src = fs.readFileSync(path.join(root, 'web/hzview.js'), 'utf8');
const fail = m => { console.log('FAIL check_scopecam: ' + m); process.exit(1); };
const pm = /\/\/ <plugLink>[\s\S]*?\n([\s\S]*?)\/\/ <\/plugLink>/.exec(src); if (!pm) fail('缺 <plugLink> 段');
const PL = vm.runInContext('(() => {\n' + pm[1] + '\nreturn PL; })()', vm.createContext({ URLSearchParams, console }));
const lit = re => { const m = re.exec(src); if (!m) fail('hzview.js 缺 ' + re); return vm.runInContext('(' + m[1] + ')', vm.createContext({})); };
const LEAD = lit(/const LEAD_KEYS = (\{[^\n]*?\});/), HOST = lit(/SCOPE_HOST = (\{[^\n]*?\}\s*\}); let scopeSheet/), ALL = lit(/SCOPE_ALL = new Set\((\[[^\]]*\])\)/);
const OUT = (/const SCOPE_OUT = '(hide|ghost)';/.exec(src) || [])[1] || 'ghost';
const files = fs.readdirSync(path.join(root, 'web/sheets')).filter(f => /^s\d+\.js$/.test(f)).sort().map(f => 'web/sheets/' + f);
const { G, HZ } = load({ extra: ['web/hzreal.js', ...files] }); HZ.make();
const PLG = {}; for (const q of G.HZ_SHEET_PLUGINS || []) PLG[q.id] = q;
const its = [], iof = new Map(); for (const a of HZ.acts) { if (a.kind === 'untemp' || !a.parts.length) continue; for (const p of a.parts) { if (!iof.has(p)) iof.set(p, its.length); its.push({ key: a.key, min: p.geo.min, max: p.geo.max, st: p.st, rm: p.rm, p }); } }
const CRS = HZ.cranes.map((c, k) => { const seq = []; for (const a of HZ.acts) for (const p of a.parts) if (p.crane === k) seq.push({ i: iof.has(p) ? iof.get(p) : -1, t: p.st + p.du * 0.5 });
  return { mast: its.findIndex(it => it.key === c.key && Math.abs(it.p.c[0] - c.x) < 1 && Math.abs(it.p.c[2] - c.z) < 1), seq }; });
function scopeOf(id) { const pl = PLG[id]; if (ALL.includes(id)) return null; const [a, b] = pl.window, parts = [];
  for (let i = 0; i <= 6; i++) for (const q of PL.safeParts(pl, a + (b - a) * i / 6, { w: 560, h: 420 })) parts.push(q);
  const r = PL.scopeMask(pl.scope === undefined && HOST[id] ? Object.assign(Object.create(pl), { scope: HOST[id] }) : pl, its, { leadKeys: Array.isArray(pl.leadKeys) ? null : LEAD[id], parts, midZ: HZ.P.midZ, t: a });
  if (r.on && OUT === 'hide' && ((HOST[id] && pl.scope === undefined ? HOST[id] : (typeof pl.scope === 'object' && pl.scope) || {}).keys || []).some(k => /crane/.test(k))) its.forEach((it, i) => { const p = it.p; if ((p.crane >= 0 || p.crawl) && p.st <= b && p.st + (p.du || 0) >= a) r.mask[i] = 1; });   // 同宿主：现场图连同所吊构件
  if (r.on) { const cr = PL.scopeCranes(CRS, r.mask, pl.window); CRS.forEach((c, k) => { if (cr[k] && c.mast >= 0) r.mask[c.mast] = 1; }); } return r; }
const FOV = 28, ASPECT = 16 / 9, GRID = [32, 18], MIN = 0.02, D2R = Math.PI / 180, sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cv = c => ({ az: c.az, el: c.el, d: c.dist, tx: c.target[0], ty: c.target[1], tz: c.target[2] });
function camAt(cs, t) { let i = 0; while (i < cs.length - 1 && cs[i + 1].t <= t) i++; const a = cv(cs[i]); if (i >= cs.length - 1 || t <= cs[0].t) return cv(t <= cs[0].t ? cs[0] : cs[i]); const b = cv(cs[i + 1]), f = sm(cs[i].t, cs[i + 1].t, t); for (const k in a) a[k] += (b[k] - a[k]) * f; return a; }
const posOf = k => { const az = k.az * D2R, el = k.el * D2R; return [k.tx + Math.sin(az) * Math.cos(el) * k.d, k.ty + Math.sin(el) * k.d, k.tz - Math.cos(az) * Math.cos(el) * k.d]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm = a => mul(a, 1 / (Math.hypot(...a) || 1));
function xform(b, m) { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let k = 0; k < 8; k++) { const x = k & 1 ? b.max[0] : b.min[0], y = k & 2 ? b.max[1] : b.min[1], z = k & 4 ? b.max[2] : b.min[2];
  const v = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], v[i]); mx[i] = Math.max(mx[i], v[i]); } } return { min: mn, max: mx }; }
function hitBox(o, d, b, tmax) { let t0 = 0, t1 = tmax; for (let k = 0; k < 3; k++) { if (Math.abs(d[k]) < 1e-12) { if (o[k] < b.min[k] || o[k] > b.max[k]) return Infinity; continue; } let a = (b.min[k] - o[k]) / d[k], c = (b.max[k] - o[k]) / d[k]; if (a > c) { const s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity; } return t0; }
const present = (it, t) => it.st != null && t >= it.st && !(it.rm && it.rm[0] >= 0 && t >= it.rm[0] + it.rm[1]);
function seen(id, sc, t) { const ps = HZ.pose(t), M = {}; for (const g of [1, 2, 3, 4]) M[g] = HZ.mat(ps, g); const B = [];
  its.forEach((it, i) => { if (!present(it, t) || (sc && !sc.mask[i] && t < HZ.TL_OPEN_12)) return; const g = it.p.geo, bs = g.boxes && g.boxes.length ? g.boxes : [{ min: g.min, max: g.max }]; for (const b0 of bs) B.push(it.p.grp && M[it.p.grp] ? xform(b0, M[it.p.grp]) : b0); });
  const k = camAt(PLG[id].cam, t), c = posOf(k), f = norm(sub([k.tx, k.ty, k.tz], c)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), th = Math.tan(FOV * D2R / 2), tw = th * ASPECT; let hit = 0, n = 0;
  for (let y = 0; y < GRID[1]; y++) for (let x = 0; x < GRID[0]; x++) { const d = norm(add(f, add(mul(r, ((x + 0.5) / GRID[0] * 2 - 1) * tw), mul(u, (1 - (y + 0.5) / GRID[1] * 2) * th)))); let best = d[1] < 0 ? -c[1] / d[1] : 40000, who = 0;
    for (const b of B) { const h = hitBox(c, d, b, best + 1e-6); if (h <= best) { best = h; who = 1; } } n++; hit += who; } return hit / n; }
const OPEN = HZ.K.open ? HZ.K.open.start : Infinity; HZ.TL_OPEN_12 = OPEN - 12;
// 指定时刻：中点 / 末尾（S-501 末尾取收官前 13 天）
const SHOTS = [['S-201', 'mid'], ['S-201', 'end'], ['S-101', 'mid'], ['S-401', 'mid'], ['S-251', 'mid'], ['S-002', 'mid'], ['S-501', 'pre']];
const tOf = (id, w) => { const [a, b] = PLG[id].window; return w === 'mid' ? (a + b) / 2 : w === 'end' ? b : Math.min(b, OPEN - 13); };
const out = [], bad = [];
for (const [id, w] of SHOTS) { if (!PLG[id]) { bad.push(id + ' 插件缺'); continue; } const sc = scopeOf(id), t = tOf(id, w), v = seen(id, sc && sc.on ? sc : null, t); out.push({ id, w, t: +t.toFixed(1), on: !!(sc && sc.on), vis: +v.toFixed(3) }); if (v < MIN) bad.push(`${id} ${w} t=${t.toFixed(1)} 可见 ${(v * 100).toFixed(1)}%`); }
for (const id of Object.keys(PLG)) { const sc = scopeOf(id); if (!sc || !sc.on) continue; const [a, b] = PLG[id].window; let run = 0, worst = 0, at = null, lead = true;
  for (let t = a; t <= b; t += 4) { if (seen(id, sc, t) <= 0) { run += 4; if (!(lead && run <= 12) && run > worst) { worst = run; at = t; } } else { run = 0; lead = false; } }   // 窗口开头 ≤ 12 天还没东西（塔吊刚立、细塔身光线打不中）不算
  out.push({ id, emptyRun: worst, at }); if (worst > 6) bad.push(`${id} 连续空屏约 ${worst} 天（至 t=${at}）`); }
if (process.argv.includes('--json')) console.log(JSON.stringify(out));
else for (const o of out) console.log('  ' + (o.w ? `${o.id} ${o.w} t=${o.t} 范围${o.on ? '开' : '关'} 可见 ${(o.vis * 100).toFixed(1)}%` : `${o.id} 最长空屏 ${o.emptyRun} 天${o.at != null ? ' @' + o.at : ''}`));
if (OUT === 'hide' && bad.length) fail(bad.join('；'));
console.log(`OK check_scopecam mode=${OUT} shots=${SHOTS.length}` + (bad.length ? ' 报告：' + bad.join('；') : ''));
