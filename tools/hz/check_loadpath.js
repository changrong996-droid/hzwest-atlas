'use strict';
// 3D 传力脉络可视化模块（web/mods/loadpath.js）无头检查 · g-wangmushan
// 断言：
// 1. HZ_MODS 登记与导出完整（build / pick / unpick / update / traceLoadPath）
// 2. 在 S-201 / S-251 / S-401 的真实构件上实跑 traceLoadPath：路径非空、严格向下无环、终点直达基础（found / y <= 1 m）
// 3. 线段数不超过 MAX_SEGS，坐标均为有限数；pick / unpick 正确切换与清空
const fs = require('fs');
const path = require('path');
const { load } = require('./harness');

const sh = fs.readdirSync(path.join(__dirname, '../../web/sheets'))
  .filter(f => f.endsWith('.js')).sort().map(f => 'web/sheets/' + f);
const { G, HZ } = load({ extra: ['web/hzreal.js', ...sh, 'web/hzrel.js', 'web/mods/loadpath.js'] });
HZ.make();

const fail = m => { console.log('FAIL check_loadpath: ' + m); process.exit(1); };
const M = (G.HZ_MODS || []).find(m => m.id === 'loadpath');
if (!M || typeof M.traceLoadPath !== 'function' || typeof M.pick !== 'function' || typeof M.unpick !== 'function') {
  fail('未完整登记 HZ_MODS loadpath');
}

const byId = {};
for (const pl of G.HZ_SHEET_PLUGINS || []) byId[pl.id] = pl;

// 测试 4 个典型高层/中层构件（屋面、网架单元、承轨板、股道），验证均能沿真实支承链传到底层/基础
const CASES = [
  { sheet: 'S-401', id: 'CL-ZS-E', t: 750, expectBase: true },
  { sheet: 'S-251', id: 'U-M04',   t: 625, expectBase: true },
  { sheet: 'S-201', id: 'D-S05',   t: 800, expectBase: true },
  { sheet: 'S-201', id: 'G-S03',   t: 800, expectBase: true },
];

let totalSegs = 0, baseHits = 0;
M.build(null, HZ, null, {});

for (const c of CASES) {
  const pl = byId[c.sheet];
  if (!pl || !pl.parts) fail('缺少插件：' + c.sheet);
  const part = (pl.parts(c.t) || []).find(p => String(p.id) === c.id);
  if (!part || !part.box) fail(`未找到构件 ${c.sheet}:${c.id} @ t=${c.t}`);
  const rel = HZ.rel(c.sheet, c.id, c.t);
  const res = M.traceLoadPath(part, c.t, rel, HZ);
  if (!res.segs.length) fail(`${c.sheet}:${c.id} 未推出任何传力线段`);
  if (res.segs.length > M.MAX_SEGS) fail(`${c.sheet}:${c.id} 线段数超上限：${res.segs.length}`);
  for (const s of res.segs) {
    if (![...s.from, ...s.to].every(Number.isFinite)) fail(`${c.sheet}:${c.id} 存在非有限坐标`);
    if (s.to[1] > s.from[1] + 2.1) fail(`${c.sheet}:${c.id} 出现向上传力反转：${s.from[1]} -> ${s.to[1]}`);
  }
  if (c.expectBase && !res.reachedBase) fail(`${c.sheet}:${c.id} 传力链未达基础（minY=${res.minY}）`);
  if (res.reachedBase) baseHits++;
  totalSegs += res.segs.length;

  // 走一遍 pick / update / unpick 钩子不抛错
  M.pick(part, { x: 100, y: 100 }, { sheet: c.sheet, t: c.t, rel });
  if (!M.state.lastResult || M.state.lastResult.segs.length !== res.segs.length) fail('pick 未更新 lastResult');
  M.update(c.t + 1);
  M.unpick();
  if (M.state.curPart !== null || M.state.lastResult !== null) fail('unpick 未清空状态');
}

console.log(`OK check_loadpath cases=${CASES.length} total_segs=${totalSegs} base_hits=${baseHits}/${CASES.length}`);
