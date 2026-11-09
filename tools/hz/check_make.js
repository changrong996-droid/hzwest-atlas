'use strict';
// 加载无头基座，执行 HZ.make()/HZ.audit() 并断言构件计数基线。
const { load } = require('./harness');
const fs = require('fs'), path = require('path');

const { HZ } = load();
HZ.make();
const audit = HZ.audit();

const checks = [
  ['acts.length', 63, HZ.acts.length],
  ['cells.length', 1432, HZ.cells.length],
  ['lifters.length', 32, HZ.lifters.length],
  ['D≈5.8', true, Math.abs(HZ.D - 5.8) < 1e-9, HZ.D],
  ['audit.zero', true, audit && audit.zero],
  ['keys(K).length', 63, Object.keys(HZ.K).length],
];
for (const [name, exp, got, raw] of checks) {
  if (got !== exp) {
    console.log(`FAIL check_make: ${name} 期望 ${exp} 实得 ${raw !== undefined ? raw : got}`);
    process.exit(1);
  }
}
// 吊点载荷 HZ.jackLoad（11-08，推算）：提升前 0；三区提升完后合计 = 三区网架钢重；合龙后再加嵌补杆件；卸载完回 0；任何时刻无负值
{ const K = HZ.K, J = HZ.jackLoad, zs = [1, 2, 3].reduce((a, z) => a + (K['asm' + z].tally.steel || 0), 0), near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, b), bad = m => { console.log('FAIL check_make: jackLoad ' + m); process.exit(1); };
  if (typeof J !== 'function') bad('HZ.jackLoad 不存在');
  if (J(K.lift1.start - 0.01).total !== 0) bad('提升前应为 0');
  if (!near(J(K.lift3.end).total, zs)) bad('三区提升后合计 ' + J(K.lift3.end).total + ' ≠ 三区钢重 ' + zs);
  if (!near(J(K.merge.end).total, zs + (K.merge.tally.steel || 0))) bad('合龙后应加嵌补杆件');
  if (J(K.head.end).total !== 0) bad('卸载完应回 0');
  for (let t = K.lift1.start - 1; t < K.head.end + 1; t += 0.5) if (J(t).rows.some(v => !(v >= 0))) bad('t=' + t + ' 有负值或非数'); }
const vsrc = fs.readFileSync(path.join(__dirname, '../../web/hzview.js'), 'utf8'); if (!/JL = HZ\.jackLoad \? HZ\.jackLoad\(t\) : null/.test(vsrc) || (vsrc.match(/ld\(q\.i\)/g) || []).length < 2) { console.log('FAIL check_make: S-301 吊点标签未接 HZ.jackLoad 载荷'); process.exit(1); }
// 剖切封面补杆件（11-08）：网架杆件（含斜杆）穿过剖切面 x = SEC_X 的根数 > 0、其中斜杆 > 0；CAP 带 aG 并按 uG 变换；分区矩阵不改 x（绕平行 x 的轴转），封面才能留在剖切面上
{ const SX = HZ.SEC_X, bad = m => { console.log('FAIL check_make: 剖切封面 ' + m); process.exit(1); }; let n = 0, dg = 0;
  for (const a of HZ.acts) for (const p of a.parts) if (p.cells) for (const c of p.cells) for (const [ra, rb] of (c.rods || [])) if ((ra[0] - SX) * (rb[0] - SX) < 0) { n++; if (Math.abs(rb[1] - ra[1]) > 0.5) dg++; }
  if (!(n > 0 && dg > 0)) bad('穿过剖切面的网架杆件 ' + n + '、斜杆 ' + dg);
  for (const t of [HZ.K.lift1.start + 1, HZ.K.lift3.start + 2, HZ.K.wlift.start + 1]) { const ps = HZ.pose(t); for (const g of [1, 2, 3, 4]) { const M = HZ.mat(ps, g); if (Math.abs(M[0] - 1) > 1e-12 || M[1] || M[2] || M[4] || M[8] || M[12]) bad('分区 ' + g + ' 矩阵改了 x（封面会离开剖切面）'); } }
  if (!/const rodTri = \(it, y0p, a, b, r\)/.test(vsrc) || !/g\.setAttribute\('aG', new THREE\.Float32BufferAttribute\(Gg, 1\)\)/.test(vsrc) || !/q = \(uG\[int\(aG \+ 0\.5\)\] \* vec4\(q, 1\.0\)\)\.xyz;\n\s*if \(uT < s \|\| k < 1e-4 \|\| uCut < -1e8\)/.test(vsrc)) bad('hzview.js CAP 未接杆件三角形 / aG / uG'); }
// 屋面云纹（11-08 委托人定 C 版「四朵云」，docs/proposals/roof-waves.md）：只叠在覆面 Hc；四块屋面中心各鼓起 ≈3.5 m、天窗两侧归零、最高点仍是天窗中心、钢结构 Ht / 吊顶 Hs 不受影响
{ const P = HZ.P, W = P.wv, bad = m => { console.log('FAIL check_make: 屋面云纹 ' + m); process.exit(1); };
  if (typeof HZ.Wv !== 'function' || !W || W.A1 !== 3.5 || W.A2 !== 0.5) bad('HZ.Wv / P.wv 缺失或参数不是 C 版（A1 3.5、A2 0.5）');
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const w = HZ.Wv(sx * 0.5 * P.roofA, sz * 0.5 * P.roofB); if (!(w > 3.0 && w < 4.2)) bad('云心鼓起 ' + w.toFixed(2) + ' m 不在 3.0–4.2'); }
  for (const [x, z] of [[0, 60], [80, 0], [P.skyW, 100]]) if (Math.abs(HZ.Wv(x, z)) > 1e-9) bad('天窗缝 (' + x + ',' + z + ') 应为 0');
  let mx = -1e9, at = null; for (let x = -P.roofA; x <= P.roofA; x += 2) for (let z = -P.roofB; z <= P.roofB; z += 2) { if (HZ.rho(x, z) > 1) continue; const y = HZ.Hc(x, z); if (y > mx) { mx = y; at = [x, z]; } if (HZ.Hc(x, z) - HZ.Ht(x, z) < -0.5) bad('覆面低于结构顶 (' + x + ',' + z + ')'); }
  if (Math.abs(at[0]) > 4 || Math.abs(at[1]) > 4) bad('屋面最高点不在天窗中心 ' + at);
  if (P.skinTop != null && Math.abs(mx - P.skinTop) > 0.05) bad('屋面最高点 ' + mx.toFixed(2) + ' m ≠ 公开 ' + P.skinTop + ' m');
  if (Math.abs(HZ.Ht(0, 0) - 55.2) > 0.05) bad('钢结构最高点应仍为 55.2 m（公开 55.237 m）'); }
{ const T = HZ.makeTrain && HZ.makeTrain().T; if (!T || Math.abs(T.nose + T.len - 209.55) > 0.01 || T.W !== 3.36 || T.H !== 4.05) { console.log('FAIL check_make: 首趟列车尺寸不是复兴号 8 编组（209.55 m / 3.36 / 4.05）'); process.exit(1); } }
// 开口段落地胎架（11-09，S-251 方案①）：jigL1..3 底 = 脚下最高已建面（地铁层底板顶 −9.20 / 地坪 ±0.00），开工 / 拆除 = 本区 jig，下方支承在胎架开工时已建，scopeWith 随 jig 进范围
let jlTxt = '';
{ const K = HZ.K, bad = m => { console.log('FAIL check_make: 落地胎架 ' + m); process.exit(1); }; let n = 0; const on = {};
  for (const z of [1, 2, 3]) { const a = K['jigL' + z]; if (!a) continue; const j = K['jig' + z];
    if (a.start !== j.start || a.rm.start !== j.rm.start) bad(`jigL${z} 开工 ${a.start} / 拆除 ${a.rm.start} ≠ jig${z} ${j.start} / ${j.rm.start}`);
    for (const p of a.parts) { n++; const b = p.geo.boxes[0], y0 = p.low.y0; if (Math.abs(b.min[1] - y0) > 1e-9) bad('胎架底 ' + b.min[1] + ' ≠ 支承面 ' + y0);
      if (!p.jigOf || !(p.scopeWith || []).includes('jig' + z)) bad('缺 jigOf / scopeWith');
      if (p.low.on === 'ground') { if (y0 !== 0) bad('落地胎架底应 = 地坪 0'); }
      else { const s = K[p.low.on].parts.find(q => q.scopeWith && q.geo.boxes.some(e => Math.abs(e.max[1] - y0) < 1e-9 && e.min[0] <= b.min[0] && e.max[0] >= b.max[0] && e.min[2] <= b.min[2] && e.max[2] >= b.max[2]));
        if (!s) bad(`(${b.min[0].toFixed(1)}, ${b.min[2].toFixed(1)}) 下方没有顶面 ${y0} 的 ${p.low.on} 构件`); if (s.st + s.du > p.st + 1e-6) bad(`支承 ${p.low.on} 第 ${(s.st + s.du).toFixed(1)} 天才建完，胎架第 ${p.st.toFixed(1)} 天`); }
      const k = z + ':' + p.low.on + '@' + y0.toFixed(2); on[k] = (on[k] || 0) + 1; } }
  if (!n) bad('没有落地胎架'); jlTxt = ' jigL=' + n + '(' + Object.entries(on).map(([k, v]) => k + '×' + v).join(' ') + ')'; }
// D-25 塔吊表：HZ.TOWERS 与 docs/rules/crane-stations.json 一致；4 台进 HZ.cranes（下标 8–11，不动 crane 0–5 / ycrane 6–7）；lift1 前退场；mast / rig 内侧 8 吊改派塔吊且在臂长内（额定复算见 check_crane）
let tcTxt = '';
{ const J = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/rules/crane-stations.json'), 'utf8')), T = HZ.TOWERS, K = HZ.K, bad = m => { console.log('FAIL check_make: D-25 塔吊 ' + m); process.exit(1); };
  if (!T || T.model !== J.towerModel.name || T.jib !== J.towerModel.jib || T.Lc !== J.towerModel.Lc || T.mast !== J.towerModel.mast || JSON.stringify(T.chart) !== JSON.stringify(J.towerModel.chart)) bad('型号 / 臂长 / 额定表与 json 不一致');
  if (T.list.length !== J.towers.length) bad('台数 ' + T.list.length + ' ≠ ' + J.towers.length);
  J.towers.forEach((u, i) => { const v = T.list[i], c = HZ.cranes[8 + i]; if (!v || v.id !== u.id || v.x !== u.x || v.z !== u.z || v.jy !== u.jy) bad(u.id + ' 塔位与 json 不一致');
    if (!c || c.key !== 'tcrane' || c.x !== u.x || c.z !== u.z || c.L !== T.jib || c.jy !== u.jy) bad(u.id + ' 未进 HZ.cranes[' + (8 + i) + ']');
    if (K.tcrane.start !== u.erect[0] || K.tcrane.end !== u.erect[1] || K['tcrane~rm'].start !== u.remove[0] || K['tcrane~rm'].end !== u.remove[1]) bad(u.id + ' 进场 / 拆除日期与 json 不一致'); });
  if (HZ.cranes.slice(0, 6).some(c => c.key !== 'crane') || HZ.cranes.slice(6, 8).some(c => c.key !== 'ycrane')) bad('crane / ycrane 下标被挪');
  if (!(K['tcrane~rm'].end <= K.lift1.start)) bad('拆除完成晚于 lift1');
  let n = 0; const seen = new Set(); for (const a of HZ.acts) for (const p of a.parts) { if (!(p.crane >= 8) || seen.has(p)) continue; seen.add(p); n++; const c = HZ.cranes[p.crane], R = Math.hypot(p.c[0] - c.x, p.c[2] - c.z);
    if (!['mast', 'rig'].includes(a.key.replace(/~rm$/, ''))) bad(c.id + ' 吊了 ' + a.key + '（表里只派 mast / rig）'); if (R > T.jib) bad(c.id + ' 吊距 ' + R.toFixed(1)); }
  if (n !== 8) bad('改派塔吊 ' + n + ' 吊（应 8：mast ×4、rig ×4）'); tcTxt = ' towers=' + T.list.length + '×' + T.jib + 'm lifts=' + n; }
console.log('OK check_make acts=63 cells=1432 lifters=32 D=5.8 zero=true' + jlTxt + tcTxt);
