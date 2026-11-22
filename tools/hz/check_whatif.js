'use strict';
// 试拆支承反事实推演模块（web/mods/whatif.js）无头检查 · g-wangmushan
// 断言：
// 1. HZ_MODS 登记完整（build / pick / unpick / simulateRemove / triggerSim / clearSim）
// 2. 试拆真实承重/临时支承构件（S-201:D-S05 承轨板、rig 提升架、jigL1 落地胎架）均推演出 >0 件失稳，且微垂位移 dropY < 0
// 3. 试拆无下游支承的末端构件（S-201:G-S03 股道）返回 violations=0，不误报
// 4. 推演纯只读：不篡改 HZ.audit().zero === true；triggerSim → clearSim 状态 100% 复原
const fs = require('fs');
const path = require('path');
const { load } = require('./harness');

const sh = fs.readdirSync(path.join(__dirname, '../../web/sheets'))
  .filter(f => f.endsWith('.js')).sort().map(f => 'web/sheets/' + f);
const { G, HZ } = load({ extra: ['web/hzreal.js', ...sh, 'web/hzrel.js', 'web/mods/whatif.js'] });
HZ.make();

const fail = m => { console.log('FAIL check_whatif: ' + m); process.exit(1); };
const M = (G.HZ_MODS || []).find(m => m.id === 'whatif');
if (!M || typeof M.simulateRemove !== 'function' || typeof M.triggerSim !== 'function' || typeof M.clearSim !== 'function') {
  fail('未完整登记 HZ_MODS whatif');
}

const byId = {};
for (const pl of G.HZ_SHEET_PLUGINS || []) byId[pl.id] = pl;

M.build(null, HZ, null, {});

// 1. 真实承轨板 S-201:D-S05 @ t=800 试拆 → 必致站台/上层构件失稳
const dS05 = (byId['S-201'].parts(800) || []).find(p => p.id === 'D-S05');
if (!dS05) fail('未找到 S-201:D-S05');
const simDeck = M.simulateRemove(dS05, 800, HZ.rel('S-201', 'D-S05', 800), HZ);
if (simDeck.violations <= 0) fail('试拆承轨板 D-S05 应检出失稳构件');
for (const f of simDeck.failed) {
  if (!(f.dropY < 0) || !f.bb) fail('失稳构件缺微垂位移或包围盒');
}

// 2. 临时设施（提升架 rig @ t=645、落地胎架 jigL1 @ t=625）试拆 → 均检出下游失稳
const simRig = M.simulateRemove({ id: 'RIG', actKey: 'rig' }, 645, null, HZ);
if (simRig.violations <= 0) fail('试拆临时提升架 rig 应检出失稳构件');
const simJig = M.simulateRemove({ id: 'JIGL1', actKey: 'jigL1' }, 625, null, HZ);
if (simJig.violations <= 0) fail('试拆落地胎架 jigL1 应检出失稳构件');

// 3. 末端非支承构件（股道 S-201:G-S03 @ t=800）试拆 → 0 失稳，不误报
const gS03 = (byId['S-201'].parts(800) || []).find(p => p.id === 'G-S03');
if (!gS03) fail('未找到 S-201:G-S03');
const simTrack = M.simulateRemove(gS03, 800, HZ.rel('S-201', 'G-S03', 800), HZ);
if (simTrack.violations !== 0) fail('试拆末端股道不应误报失稳，实为 ' + simTrack.violations);

// 4. pick → triggerSim → clearSim / unpick 状态完整闭环且不污染 HZ
M.pick(dS05, { x: 100, y: 100 }, { sheet: 'S-201', t: 800, rel: HZ.rel('S-201', 'D-S05', 800) });
const res = M.triggerSim();
if (!M.state.active || !res || res.violations !== simDeck.violations) fail('triggerSim 未激活或计数不符');
M.clearSim();
if (M.state.active || M.state.lastSim !== null) fail('clearSim 未复原');
M.unpick();
if (M.state.curPart !== null) fail('unpick 未清空 curPart');
if (!HZ.audit().zero) fail('推演不应篡改 HZ 原始排程审计');

console.log(`OK check_whatif deck_fail=${simDeck.violations} rig_fail=${simRig.violations} jig_fail=${simJig.violations} track_fail=${simTrack.violations} audit_zero=true`);
