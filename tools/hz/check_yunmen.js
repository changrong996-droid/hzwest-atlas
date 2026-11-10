'use strict';
// 云门细化墨线 3D 模块（web/mods/yunmen.js）无头检查 · hark-cr（Traycer 起草）
// 1) 已登记 HZ_MODS yunmen 且有 build / update / lines；
// 2) 用桩 THREE 验证 opts.clip 传到线材质 clippingPlanes、不传时没有；
// 3) 在 ymf.start-1、ymf 中段、ym 中段、ymc 中段、ymc 结束+1、HZ.P.OPEN 等时刻调 lines(HZ,t)：t < ymf.start 为 0 段，段数随 t 单调不减；
// 4) 所有段端点在包络 x∈[-92,92]、y∈[-1.5,80.5]、z∈[176,240] 内；
// 5) 门洞内无段：对每条线段采样 9 点，任何一点落在门洞内部空间（|x|<37.5, 0.5<y<49.5, z∈(178,238)）即失败；
// 6) 完成时的线段包围盒与现有云门 ym 构件包围盒一致（各方向差 ≤ 2.5 m）；
// 7) update 100 次平均 < 1 ms（不传 THREE 时）；
// 8) D-41 示意线型：S-000 用 schem、其它图 detail；示意段 t<ymf.start 为 0、单调不减、只含长划（9 m）与点（0.8 m）两种段长、
//    在包络内、不穿门洞、完成态包围盒与 ym 一致；__pv.sheet=S-000 时 update 只画示意段、细化段为 0；注记含「示意」。
const { load } = require('./harness');
const { G, HZ } = load({ extra: ['web/mods/yunmen.js'] });
HZ.make();

const fail = m => { console.log('FAIL check_yunmen: ' + m); process.exit(1); };

// 1. 登记与方法检查
const M = (G.HZ_MODS || []).find(m => m.id === 'yunmen');
if (!M || typeof M.build !== 'function' || typeof M.update !== 'function' || typeof M.lines !== 'function') {
  fail('未登记 HZ_MODS yunmen（build / update / lines）');
}
M.build(null, HZ);

// 2. 桩 THREE 验证 opts.clip → clippingPlanes
{
  const mk = () => {
    const made = {};
    const T = {
      BufferGeometry: function () { this.setAttribute = () => {}; this.setDrawRange = () => {}; },
      BufferAttribute: function () {},
      DynamicDrawUsage: 1,
      LineBasicMaterial: function (o) { Object.assign(this, o); made.mat = this; },
      LineSegments: function (g, m) { this.geometry = g; this.material = m; },
    };
    return { T, made };
  };
  const sc = { add: () => {} }, plane = { normal: [1, 0, 0], constant: -39 };
  let k = mk();
  M.build(sc, HZ, k.T, { clip: [plane] });
  if (!k.made.mat || !Array.isArray(k.made.mat.clippingPlanes) || k.made.mat.clippingPlanes[0] !== plane) {
    fail('opts.clip 未传到线材质 clippingPlanes');
  }
  if (!(M.update(HZ.K.ym.start + 20) > 0)) fail('桩 THREE 下 update 未返回正段数');
  k = mk();
  M.build(sc, HZ, k.T);
  if (k.made.mat.clippingPlanes) {
    fail('没传 clip 时不应有 clippingPlanes');
  }
  M.build(null, HZ);
}

// 3. 关键时刻与逐日单调性检查
const ymf = HZ.K.ymf, ym = HZ.K.ym, ymc = HZ.K.ymc;
const keyTimes = [
  ymf.start - 1,
  ymf.start + ymf.dur * 0.5,
  ym.start + ym.dur * 0.5,
  ymc.start + ymc.dur * 0.5,
  ymc.start + ymc.dur + 1,
  HZ.P.OPEN,
];
const keyCounts = keyTimes.map(t => {
  const L = M.lines(HZ, t);
  if (L.length % 6 !== 0) fail(`t=${t} lines 返回长度 ${L.length} 不是 6 的倍数`);
  return L.length / 6;
});
if (keyCounts[0] !== 0) fail(`t=${keyTimes[0]} (ymf.start-1) 段数应为 0，实为 ${keyCounts[0]}`);
for (let i = 1; i < keyCounts.length; i++) {
  if (keyCounts[i] < keyCounts[i - 1]) {
    fail(`关键时刻段数倒退：t=${keyTimes[i - 1]} (${keyCounts[i - 1]}) -> t=${keyTimes[i]} (${keyCounts[i]})`);
  }
  if (i <= 4 && keyCounts[i] <= keyCounts[i - 1]) {
    fail(`阶段推进段数未增长：t=${keyTimes[i - 1]} (${keyCounts[i - 1]}) -> t=${keyTimes[i]} (${keyCounts[i]})`);
  }
}

// 加密采样验证全程单调不减
let prevN = 0;
for (let t = ymf.start - 5; t <= HZ.P.OPEN + 5; t += 2.5) {
  const n = M.lines(HZ, t).length / 6;
  if (t < ymf.start && n !== 0) fail(`t=${t} < ymf.start 段数应为 0，实为 ${n}`);
  if (n < prevN) fail(`t=${t} 段数 ${n} < 前一时刻 ${prevN}`);
  prevN = n;
}

// 4 & 5. 包络检查与门洞净空 9 点采样检查（对完成态包含的全部线段逐条核验）
const LDone = M.lines(HZ, HZ.P.OPEN);
const nDone = LDone.length / 6;
if (nDone < 500) fail(`完成时线段数过少：${nDone}`);

const lMin = [Infinity, Infinity, Infinity], lMax = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < nDone; i++) {
  const o = i * 6;
  const x0 = LDone[o], y0 = LDone[o + 1], z0 = LDone[o + 2];
  const x1 = LDone[o + 3], y1 = LDone[o + 4], z1 = LDone[o + 5];

  // 4. 端点包络检查 x∈[-92,92]、y∈[-1.5,80.5]、z∈[176,240]
  for (const [x, y, z] of [[x0, y0, z0], [x1, y1, z1]]) {
    if (x < -92 - 1e-5 || x > 92 + 1e-5 || y < -1.5 - 1e-5 || y > 80.5 + 1e-5 || z < 176 - 1e-5 || z > 240 + 1e-5) {
      fail(`线段 #${i} 端点越出包络：(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
    }
    if (x < lMin[0]) lMin[0] = x;
    if (y < lMin[1]) lMin[1] = y;
    if (z < lMin[2]) lMin[2] = z;
    if (x > lMax[0]) lMax[0] = x;
    if (y > lMax[1]) lMax[1] = y;
    if (z > lMax[2]) lMax[2] = z;
  }

  // 5. 门洞内部空间（|x|<37.5, 0.5<y<49.5, z∈(178,238)）9 点采样检查
  for (let k = 0; k < 9; k++) {
    const u = k / 8;
    const x = x0 + (x1 - x0) * u;
    const y = y0 + (y1 - y0) * u;
    const z = z0 + (z1 - z0) * u;
    if (Math.abs(x) < 37.5 && y > 0.5 && y < 49.5 && z > 178 && z < 238) {
      fail(`线段 #${i} 穿过门洞内部空间 (k=${k}/8): (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
}

// 6. 完成时的线段包围盒与现有云门 ym 构件包围盒一致（各方向差 ≤ 2.5 m）
const ymAct = HZ.acts.find(a => a.key === 'ym');
if (!ymAct || !ymAct.parts || !ymAct.parts.length) fail('未找到 HZ.acts 中 key==="ym" 的构件');
const ymMin = [Infinity, Infinity, Infinity], ymMax = [-Infinity, -Infinity, -Infinity];
for (const p of ymAct.parts) {
  for (const b of (p.geo && p.geo.boxes) || []) {
    for (let d = 0; d < 3; d++) {
      if (b.min[d] < ymMin[d]) ymMin[d] = b.min[d];
      if (b.max[d] > ymMax[d]) ymMax[d] = b.max[d];
    }
  }
}
for (let d = 0; d < 3; d++) {
  const diffMin = Math.abs(lMin[d] - ymMin[d]);
  const diffMax = Math.abs(lMax[d] - ymMax[d]);
  if (diffMin > 2.5 || diffMax > 2.5) {
    fail(`轴 ${['x', 'y', 'z'][d]} 包围盒偏差超 2.5 m：lines=[${lMin[d]}, ${lMax[d]}] vs ym=[${ymMin[d]}, ${ymMax[d]}]`);
  }
}

// 7. update 100 次平均 < 1 ms（不传 THREE 时）
M.build(null, HZ);
const tStart = process.hrtime.bigint();
for (let i = 0; i < 100; i++) {
  const t = ymf.start - 5 + i * 3.6;
  M.update(t, [0, 50, 300]);
}
const avgMs = Number(process.hrtime.bigint() - tStart) / 1e6 / 100;
if (avgMs >= 1) fail(`update 100 次平均耗时 ${avgMs.toFixed(3)} ms >= 1 ms`);

// 8. D-41 示意线型（S-000 总图）
{
  if (typeof M.schemLines !== 'function' || typeof M.modeFor !== 'function') fail('缺 schemLines / modeFor');
  if (M.modeFor('S-000') !== 'schem') fail('S-000 应为示意线型');
  for (const s of ['S-501', 'S-002', 'S-401', undefined]) if (M.modeFor(s) !== 'detail') fail(`${s} 应为细化墨线`);
  if (!(M.LABEL || []).join('').includes('示意')) fail('注记缺「示意」');
  if (M.schemLines(HZ, ymf.start - 1).length) fail('示意段在 ymf.start 前应为 0');
  let pv = 0;
  for (let t = ymf.start - 5; t <= HZ.P.OPEN + 5; t += 2.5) { const n = M.schemLines(HZ, t).length / 6; if (n < pv) fail(`示意段 t=${t} 倒退`); pv = n; }
  const S = M.schemLines(HZ, HZ.P.OPEN), ns = S.length / 6;
  if (ns < 100) fail(`示意段过少：${ns}`);
  if (M.schemLines(HZ, ymf.start + 1).length / 6 >= ns) fail('示意段应随主体施工往上长');
  const sMin = [Infinity, Infinity, Infinity], sMax = [-Infinity, -Infinity, -Infinity];
  let dash = 0, dots = 0;
  for (let i = 0; i < ns; i++) {
    const o = i * 6, a = [S[o], S[o + 1], S[o + 2]], b = [S[o + 3], S[o + 4], S[o + 5]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (len > 9 + 1e-3) fail(`示意段 #${i} 长 ${len.toFixed(2)} m，超过长划 9 m（不是虚线）`);
    if (Math.abs(len - 0.8) < 1e-3) dots++; else if (Math.abs(len - 9) < 1e-3) dash++;
    for (const [x, y, z] of [a, b]) {
      if (x < -92 || x > 92 || y < -1.5 || y > 80.5 || z < 176 || z > 240) fail(`示意段 #${i} 越出包络`);
      for (let d = 0; d < 3; d++) { const v = [x, y, z][d]; if (v < sMin[d]) sMin[d] = v; if (v > sMax[d]) sMax[d] = v; }
    }
    for (let k = 0; k <= 8; k++) { const u = k / 8, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u, z = a[2] + (b[2] - a[2]) * u;
      if (Math.abs(x) < 37.5 && y > 0.5 && y < 49.5 && z > 178 && z < 238) fail(`示意段 #${i} 穿过门洞`); }
  }
  if (dots < dash * 1.5) fail(`双点画线应每个长划配两点：长划 ${dash}、点 ${dots}`);
  for (let d = 0; d < 3; d++) if (Math.abs(sMin[d] - ymMin[d]) > 2.5 || Math.abs(sMax[d] - ymMax[d]) > 2.5) fail(`示意轮廓轴 ${'xyz'[d]} 与 ym 包围盒偏差超 2.5 m`);
  // update 跟随 __pv.sheet
  G.__pv = { sheet: 'S-000' }; M.build(null, HZ); M.update(HZ.P.OPEN);
  if (M.mode !== 'schem' || M.stats.segs !== 0 || M.stats.schem !== ns) fail(`S-000 update 应只画示意段（mode=${M.mode} segs=${M.stats.segs} schem=${M.stats.schem}）`);
  G.__pv.sheet = 'S-501'; M.update(HZ.P.OPEN);
  if (M.mode !== 'detail' || M.stats.schem !== 0 || !(M.stats.segs > 0)) fail('S-501 update 应画细化墨线');
  delete G.__pv; M.build(null, HZ);
  console.log(`  示意线型：段 ${ns}（长划 ${dash} · 点 ${dots}）`);
}

console.log(`OK check_yunmen segs=${keyCounts.join('->')} bbox=[${lMin.join(',')}..${lMax.join(',')}] avg=${avgMs.toFixed(4)}ms`);
