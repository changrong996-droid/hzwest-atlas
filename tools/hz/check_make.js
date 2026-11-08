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
console.log('OK check_make acts=55 cells=1432 lifters=32 D=5.8 zero=true');
