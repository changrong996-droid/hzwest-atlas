'use strict';
// 三维引线标注按当前图号取材（web/hzview.js 的 <leadPick> 段）无头检查：
// 每张插件图在时间窗起 / 中 / 末与审计串台时刻，选中的标注工序必须属于本图（LEAD_KEYS 或 pl.leadKeys），宁缺毋串；
// 总图（S-000）不过滤、沿用全局 caption；并对源码 / 样式做接线断言（衬底 .lb 两种模式、避让含 #big、hzview 版本号）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load } = require('./harness');
const root = path.join(__dirname, '../..');
const fail = m => { console.log('FAIL check_callouts: ' + m); process.exit(1); };
const src = fs.readFileSync(path.join(root, 'web/hzview.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web/hzwest.html'), 'utf8');
const m = /\/\/ <leadPick>[^\n]*\n([\s\S]*?)\/\/ <\/leadPick>/.exec(src);
if (!m) fail('hzview.js 缺少 // <leadPick> … // </leadPick> 段');
let LP;
try { LP = vm.runInContext('(() => {\n' + m[1] + '\nreturn { LEAD_KEYS, leadOwn, leadOwns, leadAct }; })()', vm.createContext({}), { filename: 'hzview.js#leadPick' }); } catch (e) { fail('leadPick 段求值失败 ' + (e && e.message)); }

const { G, HZ } = load({ extra: ['web/hzreal.js', 'web/sheets/s101.js', 'web/sheets/s201.js', 'web/sheets/s401.js', 'web/sheets/s501.js', 'web/sheets/s251.js'] });
HZ.make();
const K = HZ.K, PLS = G.HZ_SHEET_PLUGINS || [];
if (PLS.length < 5) fail('插件不足 5 张：' + PLS.map(p => p.id));
let runs = 0;
const pick = (pl, t) => { const own = LP.leadOwn(pl.id, pl), la = LP.leadAct(K, own, t, HZ.caption(t).act); return { own, key: la ? la.leadKey : null, a: la && la.a }; };
for (const pl of PLS) {
  const own = LP.leadOwn(pl.id, pl);
  if (!Array.isArray(own) || !own.length) fail(pl.id + ' 未登记标注工序（LEAD_KEYS / leadKeys）');
  for (const k of own) if (!K[k]) fail(pl.id + ' 的标注工序 ' + k + ' 不在 HZ.K 里');
  const [a, b] = pl.window; let hit = 0;
  for (const t of [a, (a + b) / 2, b]) { const r = pick(pl, t); if (r.key !== null && own.indexOf(r.key) < 0) fail(`${pl.id} t=${t} 标注 ${r.key} 不属于本图`); runs++; }
  for (let t = a; t <= b; t += 1) { const r = pick(pl, t); if (r.key !== null) { if (own.indexOf(r.key) < 0) fail(`${pl.id} t=${t} 标注 ${r.key} 不属于本图`); if (!r.a.parts.some(p => p.st <= t)) fail(`${pl.id} t=${t} 选中 ${r.key} 但无已开工构件`); hit++; } runs++; }
  if (!hit) fail(pl.id + ' 整个时间窗都没有本图标注');
}
// 审计串台时刻（docs/audit/2026-11-08-visual.md）：全局 caption 是别图工序，过滤后应落回本图（11-08 屋盖排程校准后移 4 天：S-201 时刻 632 → 636）
const byId = id => PLS.find(p => p.id === id);
for (const [id, t, bad, want] of [['S-201', 636, 'lift1', 'trackS'], ['S-401', 685, 'trackS', 'holes'], ['S-501', 710, 'clad', 'ymf']]) {
  const c = HZ.caption(t).act; if (!c || c.key !== bad) fail(`前提变了：t=${t} 全局 caption 应为 ${bad}，实得 ${c && c.key}`);
  if (LP.leadOwns(LP.leadOwn(id, byId(id)), 'lift1')) fail(id + ' 不应标转轴（S-301 工序）');
  const r = pick(byId(id), t); if (!r.key || r.key === bad || r.own.indexOf(r.key) < 0) fail(`${id} t=${t} 应标本图工序（如 ${want}），实得 ${r.key}`); runs++;
}
// 总图不过滤
{ const own = LP.leadOwn('S-000', undefined); if (own !== null) fail('总图应不过滤'); const t = 620, c = HZ.caption(t).act, la = LP.leadAct(K, own, t, c); if (c && c.parts.length && c.parts.some(p => p.st <= t) && la !== c) fail('总图应沿用全局 caption'); runs++; }
// 未登记的插件图：空表，什么都不标
{ const r = LP.leadAct(K, LP.leadOwn('S-999', { id: 'S-999' }), 636, HZ.caption(636).act); if (r) fail('未登记插件图应不标注'); runs++; }
// 接线 / 样式
if (!/leadAct\(K, own, t, ca\)/.test(src)) fail('lead() 未经 leadAct 取材');
if (!/leadOwns\(own, key\) && t >= A\.start/.test(src)) fail('转轴标注未按图号过滤');
if ((src.match(/<rect class="lb"/g) || []).length < 2) fail('lead / lead301 未画衬底 rect.lb');
if (!/const OBSEL = '#big[^']*'/.test(src)) fail('避让障碍应含 #big 信息卡');
if (!/#lead \.lb\{fill:rgba\(246,242,234/.test(html) || !/body\.lit #lead \.lb\{fill:rgba\(18,20,26/.test(html)) fail('hzwest.html 缺少墨线 / 实景两套 .lb 衬底样式');
if (!/hzview\.js\?v=(\d+)/.test(html) || +/hzview\.js\?v=(\d+)/.exec(html)[1] < 15) fail('hzview.js 改动后版本号应 ≥ 15');
console.log('OK check_callouts ' + runs + ' runs');
