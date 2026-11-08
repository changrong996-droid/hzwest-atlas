'use strict';
// 加载无头基座，执行 HZ.make()/HZ.audit() 并断言构件计数基线。
const { load } = require('./harness');
const fs = require('fs'), path = require('path');

const { HZ } = load();
HZ.make();
const audit = HZ.audit();

const checks = [
  ['acts.length', 55, HZ.acts.length],
  ['cells.length', 1432, HZ.cells.length],
  ['lifters.length', 32, HZ.lifters.length],
  ['D≈5.8', true, Math.abs(HZ.D - 5.8) < 1e-9, HZ.D],
  ['audit.zero', true, audit && audit.zero],
  ['keys(K).length', 55, Object.keys(HZ.K).length],
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
console.log('OK check_make acts=55 cells=1432 lifters=32 D=5.8 zero=true');
