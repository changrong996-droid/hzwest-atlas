'use strict';
// 周边远景生长模块（web/mods/surroundings.js + web/mods/env/*.js）无头检查 · g-liuzhijie
// 1) 自动扫描 web/mods/env/*.js 并加载 surroundings.js，检查 HZ_MODS 登记与图层合同；
// 2) 用桩 THREE 验证 opts.clip 传到各圈层线材质 clippingPlanes、不传时没有；
// 3) 全工期单调生长校验（t = 0..HZ.P.OPEN 段数单调不减，开通时 > 0）；
// 4) 主站区禁入包络校验（任何线段 5 点采样不得落入 |x|<645 且 z∈(-245,245)）与外包络校验；
// 5) 分图显隐守卫校验（S-201 等分图下 update 返回 0，S-000 / S-501 下返回正数）；
// 6) update 200 次平均耗时 < 1 ms。
const fs = require('fs');
const path = require('path');
const { load } = require('./harness');

const fail = m => { console.log('FAIL check_surroundings: ' + m); process.exit(1); };

const envDir = path.join(__dirname, '../../web/mods/env');
const envFiles = fs.existsSync(envDir)
  ? fs.readdirSync(envDir).filter(f => f.endsWith('.js')).sort().map(f => 'web/mods/env/' + f)
  : [];

if (!envFiles.length) fail('web/mods/env/ 下没有任何图层文件');

const { G, HZ } = load({ extra: [...envFiles, 'web/mods/surroundings.js'] });
HZ.make();

// 1. 登记与图层合同
const M = (G.HZ_MODS || []).find(m => m.id === 'surroundings');
if (!M || typeof M.build !== 'function' || typeof M.update !== 'function' || typeof M.lines !== 'function') {
  fail('未登记 HZ_MODS surroundings（build / update / lines）');
}
const layers = M.layers();
if (layers.length !== envFiles.length) {
  fail(`图层注册数 ${layers.length} 与文件数 ${envFiles.length} 不一致`);
}
const seenIds = new Set();
for (const l of layers) {
  if (!l || typeof l.id !== 'string' || !/^[a-z0-9-]+$/.test(l.id)) fail('图层 id 非法: ' + (l && l.id));
  if (seenIds.has(l.id)) fail('图层 id 重复: ' + l.id);
  seenIds.add(l.id);
  if (![1, 2, 3].includes(l.ring)) fail(`图层 ${l.id} ring 非法: ${l.ring}`);
  if (typeof l.build !== 'function') fail(`图层 ${l.id} 缺少 build 函数`);
}

// 2. 桩 THREE 验证 opts.clip
{
  const mk = () => {
    const mats = [];
    const T = {
      BufferGeometry: function () { this.setAttribute = () => {}; this.setDrawRange = () => {}; },
      BufferAttribute: function () {},
      LineBasicMaterial: function (o) { Object.assign(this, o); mats.push(this); },
      LineSegments: function (g, m) { this.geometry = g; this.material = m; this.visible = true; },
    };
    return { T, mats };
  };
  const sc = { add: () => {} }, plane = { normal: [1, 0, 0], constant: -39 };
  let k = mk();
  M.build(sc, HZ, k.T, { clip: [plane] });
  if (!k.mats.length || !k.mats.every(m => Array.isArray(m.clippingPlanes) && m.clippingPlanes[0] === plane)) {
    fail('opts.clip 未传到所有圈层线材质 clippingPlanes');
  }
  k = mk();
  M.build(sc, HZ, k.T);
  if (!k.mats.length || k.mats.some(m => m.clippingPlanes)) {
    fail('未传 clip 时不应有 clippingPlanes');
  }
  M.build(null, HZ);
}

// 3. 单调生长校验
const sampleT = [0, 365, 500, 650, 740, 900, HZ.P.OPEN];
const counts = sampleT.map(t => {
  const L = M.lines(HZ, t);
  if (L.length % 6 !== 0) fail(`t=${t} lines 长度不是 6 的倍数`);
  return L.length / 6;
});
for (let i = 1; i < counts.length; i++) {
  if (counts[i] < counts[i - 1]) fail(`段数倒退：t=${sampleT[i - 1]} (${counts[i - 1]}) -> t=${sampleT[i]} (${counts[i]})`);
}
if (counts[counts.length - 1] < 100) fail(`开通时刻段数过少：${counts[counts.length - 1]}`);

let prev = 0;
for (let t = 0; t <= HZ.P.OPEN; t += 15) {
  const n = M.lines(HZ, t).length / 6;
  if (n < prev) fail(`密采样段数倒退：t=${t} (${n} < ${prev})`);
  prev = n;
}

// 4. 禁入主站包络与外包络校验
const LDone = M.lines(HZ, HZ.P.OPEN);
const nDone = LDone.length / 6;
for (let i = 0; i < nDone; i++) {
  const o = i * 6;
  const x0 = LDone[o], y0 = LDone[o + 1], z0 = LDone[o + 2];
  const x1 = LDone[o + 3], y1 = LDone[o + 4], z1 = LDone[o + 5];
  for (const [x, y, z] of [[x0, y0, z0], [x1, y1, z1]]) {
    if (Math.abs(x) > 2500.1 || Math.abs(z) > 2500.1 || y < -30.1 || y > 420.1) {
      fail(`第 ${i} 段端点越出外包络: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
  for (let s = 0; s <= 4; s++) {
    const u = s / 4;
    const x = x0 + (x1 - x0) * u;
    const z = z0 + (z1 - z0) * u;
    if (Math.abs(x) < 645 && z > -245 && z < 245) {
      fail(`第 ${i} 段闯入主站禁入区: (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
}

// 5. 分图显隐守卫校验
G.__pv = { sheet: 'S-201' };
if (M.update(HZ.P.OPEN) !== 0) fail('分图 S-201 下周边图层未隐藏');
G.__pv = { sheet: 'S-000' };
if (M.update(HZ.P.OPEN) !== nDone) fail('总图 S-000 下周边图层未显示完整段数');
G.__pv = { sheet: 'S-501' };
if (M.update(HZ.P.OPEN) !== nDone) fail('开通图 S-501 下周边图层未显示完整段数');

// 6. 性能基准（200 次 update 平均 < 1 ms）
const t0 = process.hrtime.bigint();
for (let i = 0; i < 200; i++) M.update((i / 199) * HZ.P.OPEN);
const avgMs = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
if (avgMs >= 1.0) fail(`update 平均耗时过高: ${avgMs.toFixed(4)} ms`);

console.log(`OK check_surroundings layers=${layers.length}(${layers.map(l => l.id).join(',')}) segs=${counts.join('->')} avg=${avgMs.toFixed(4)}ms`);
