'use strict';
// 构件信息卡（web/mods/info.js）无头检查 · hark-cs：登记、info 行归一、实物记录挂接、按钮仅在有 t0/t1 时出现、HTML 转义。
const { load } = require('./harness');
const { G } = load({ extra: ['web/mods/info.js'] });
const fail = m => { console.log('FAIL check_info: ' + m); process.exit(1); };
const M = (G.HZ_MODS || []).find(m => m.id === 'info');
if (!M || typeof M.pick !== 'function' || typeof M.unpick !== 'function') fail('未登记 HZ_MODS info（pick / unpick）');
const r = M.rows([['工序', '补孔'], ['位置', 'x 1']]); if (r.length !== 2 || r[0][1] !== '补孔') fail('info 数组行归一');
if (M.rows({ a: 1 })[0][0] !== 'a' || M.rows('x')[0][1] !== 'x' || M.rows(null).length) fail('info 对象/字符串/空归一');
let h = M.html({ id: 'X', label: '<b>"x"</b>', info: [['k', '<s>']] }, { sheet: 'S-401' });
if (/<b>"x"/.test(h) || /<s>/.test(h)) fail('未转义');
if (/data-a="t0"|data-a="t1"/.test(h)) fail('无 t0/t1 不应有按钮');
h = M.html({ id: 'X', label: 'x', info: [], t0: 10, t1: 20 }, { sheet: 'S-401' }); if (!/data-a="t0"/.test(h) || !/data-a="t1"/.test(h)) fail('有 t0/t1 应有两按钮');
if (G.HZR && G.HZR.forPart) { const R = G.HZR.forPart('S-201', 'G-N09'); h = M.html({ id: 'G-N09', label: 'g', info: [] }, { sheet: 'S-201' }); if (R.length && !h.includes(R[0].id)) fail('实物记录未挂接'); }
M.pick({ id: 'X' }, { x: 1, y: 1 }, { root: null }); M.unpick();
if (typeof M.update !== 'function' || typeof M.pinList !== 'function') fail('缺图钉 update/pinList');
M.update(0, null); if (M.pinList('无此图', 0).length) fail('无此图应无图钉');
// D-44：关系两层（ctx.rel）
{
  const rel = { counts: { hold: 3, wait: 0, carry: 1, next: 2 }, crane: null, up: [{ sheet: 'S-201', id: 'D-S05', label: '承轨板 D-S05', rel: 'sup', level: 'part', whyText: '支承', n: 2 }, { sheet: 'S-001', id: 'K-colB', label: '线下框架柱', rel: 'seq', level: 'act', whyText: '工序先后', n: 40 }], down: [], sheets: [{ sheet: 'S-001', name: '总进度', id: 'K-trackS' }], records: [] };
  h = M.html({ id: 'G-S03', label: 'g', info: [] }, { sheet: 'S-201', rel });
  if (!h.includes('靠谁撑着 3 件')) fail('有 hold 应显示「靠谁撑着 3 件」');
  if (h.includes('等谁先装')) fail('wait=0 不应显示「等谁先装」行');
  if (h.includes('吊车')) fail('crane=null 不应显示吊车行');
  if (!/data-a="more"/.test(h)) fail('有 rel 应有「更多」按钮');
  if (!/class="hz-info-more" hidden>/.test(h)) fail('「更多」默认应收起（hidden）');
  if (!/data-a="sel" data-id="D-S05"/.test(h)) fail('本图构件级项应可点选');
  if (!/工序级/.test(h) || !/#sheet=S-001&amp;focus=K-colB/.test(h)) fail('工序级项应标注并链到 S-001');
  if (!/focus=K-trackS/.test(h)) fail('出现在：S-001 深链');
  const rows2 = M.relRows({ counts: { hold: 1, wait: 2 }, crane: { name: '塔吊 T3', station: [12.4, -30.6] } });
  if (rows2.length !== 3 || !rows2[1].includes('等谁先装 2 件') || !rows2[2].includes('（站位 12, -31）')) fail('三行（含站位）');
  if (M.relRows({ counts: {}, crane: null }).length) fail('全无数据应不显示任何关系行');
  h = M.html({ id: 'X', label: 'x', info: [] }, { sheet: 'S-201', rel: null }); if (/data-a="more"|靠谁撑着/.test(h)) fail('rel=null 卡片照旧');
  // 真数据：S-201 D-S05 / G-S03 @ t=800（有 HZ.rel 时）
  const fs = require('fs'), path = require('path');
  const sh = fs.readdirSync(path.join(__dirname, '../../web/sheets')).filter(f => f.endsWith('.js')).map(f => 'web/sheets/' + f);
  const L2 = load({ extra: ['web/hzreal.js', ...sh, 'web/hzrel.js', 'web/mods/info.js'] }); L2.HZ.make();
  const M2 = (L2.G.HZ_MODS || []).find(m => m.id === 'info');
  for (const id of ['D-S05', 'G-S03']) { const r2 = L2.HZ.rel('S-201', id, 800); if (!r2) fail('S-201 ' + id + ' 无关系'); const h2 = M2.html({ id, label: id, info: [] }, { sheet: 'S-201', rel: r2 });
    if (r2.counts.hold > 0 && !h2.includes('靠谁撑着 ' + r2.counts.hold + ' 件')) fail(id + ' hold 行');
    if (!(r2.counts.wait > 0) && h2.includes('等谁先装')) fail(id + ' wait=0 却显示');
    if ((h2.match(/hz-rel-l2/g) || []).length > 3) fail(id + ' 第 2 层多于 3 行'); }
}
console.log('OK check_info');
