'use strict';
// 构件信息卡（web/mods/info.js）无头检查 · hark-cs：登记、info 行归一、实物记录挂接、按钮仅在有 t0/t1 时出现、HTML 转义。
// D-45：图钉按记录聚合（通配命中 > 3 件不出钉）、包围盒中心、屏幕 < 24 px 合并、同屏 ≤ 5、图标无裸数字、说明带单位；真数据五张图钉数 ≤ 5。
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
// D-45：实物图钉聚合（桩数据）
{
  const L3 = load({ extra: ['web/mods/info.js'] }), G3 = L3.G, M3 = G3.HZ_MODS.find(m => m.id === 'info');
  for (const k of ['pinList', 'mergeScreen', 'sheetRecords', 'summary']) if (typeof M3[k] !== 'function') fail('缺 ' + k);
  const box = (x, z) => [x - 1, 0, z - 1, x + 1, 10, z + 1];
  const parts = [];
  for (let i = 0; i < 8; i++) parts.push({ id: 'H-' + i, box: box(i * 10, 0) });          // 通配组：8 件
  parts.push({ id: 'Z-1', box: box(100, 0) }, { id: 'Z-2', box: box(120, 20) });          // 分区记录：2 件
  parts.push({ id: 'Q-1', box: box(-50, -50) });                                          // 单件：两条记录
  G3.HZ_SHEET_PLUGINS = [{ id: 'T-1', parts: () => parts }];
  const RECS = [
    { id: 'W1', kind: 'doc', date: '2021-01-01', src: { title: '新闻' }, parts: ['T-1:H-*'] },
    { id: 'W2', kind: 'measure', date: '2021-01-02', src: { title: '公布值' }, parts: ['T-1:H-*'] },
    { id: 'A1', kind: 'photo', date: '2021-02-01', src: { title: '哨兵二号 L2A 景' }, parts: ['T-1:Z-1', 'T-1:Z-2'] },
    { id: 'B1', kind: 'photo', date: '2021-03-01', src: { title: '现场照片' }, parts: ['T-1:Q-1'] },
    { id: 'B2', kind: 'photo', date: '2021-03-02', src: { title: '现场照片 2' }, parts: ['T-1:Q-1'] },
  ];
  const pm = (pat, sheet, id) => { const [s2, p2] = pat.split(':'); return s2 === sheet && (p2.endsWith('*') ? id.startsWith(p2.slice(0, -1)) : id === p2); };
  G3.HZR = { RECORDS: RECS, forPart: (sheet, id) => RECS.filter(r => r.parts.some(q => pm(q, sheet, id))) };
  const P = M3.pinList('T-1', 0);
  if (P.some(p => p.recs.includes('W1') || p.recs.includes('W2'))) fail('通配命中 > 3 件的记录不应出钉');
  if (P.length !== 2) fail('应为 2 个钉（分区组 + 单件组），实为 ' + P.length);
  const pa = P.find(p => p.recs.join() === 'A1'); if (!pa || pa.ids.length !== 2) fail('同组记录的两件应合一钉');
  if (Math.abs(pa.c[0] - 110) > 1e-9 || Math.abs(pa.c[2] - 10) > 1e-9 || pa.c[1] !== 10) fail('钉应在两件包围盒中心（顶面高度）');
  const pb = P.find(p => p.ids.join() === 'Q-1'); if (!pb || pb.recs.length !== 2 || pb.tip !== '现场照片 2 张') fail('单件两条记录：一钉、说明「现场照片 2 张」，实为 ' + (pb && pb.tip));
  if (pa.tip !== '卫星影像 1 张') fail('卫星影像说明带单位');
  const R = M3.sheetRecords('T-1', 0); if (R.length !== 5) fail('「实物 N」应计本图全部记录 5 条，实为 ' + R.length);
  if (R.find(r => r.id === 'W1').level !== 'sheet' || R.find(r => r.id === 'A1').level !== 'part') fail('图纸级 / 构件级标记');
  // 屏幕合并：< 24 px 合并，≥ 24 px 不合并，最多 5 个
  const mk = (i, x, y) => ({ id: 'p' + i, ids: ['p' + i], recs: ['B1'], tip: '', x, y });
  let S = M3.mergeScreen([mk(0, 100, 100), mk(1, 110, 110), mk(2, 200, 100)]); if (S.length !== 2 || S[0].ids.length !== 2) fail('< 24 px 应合并');
  S = M3.mergeScreen([mk(0, 100, 100), mk(1, 124, 100)]); if (S.length !== 2) fail('≥ 24 px 不应合并');
  S = M3.mergeScreen(Array.from({ length: 12 }, (_, i) => mk(i, i * 50, 10))); if (S.length !== 5) fail('同屏最多 5 个钉');
  if (/>[^<]*\d[^<]*</.test(M3.CAM_SVG)) fail('钉图标里不应有数字文字');
  for (const p of P) if (/^\d+$/.test(p.tip) || !/[张篇条]/.test(p.tip)) fail('钉说明须带单位：' + p.tip);
}
// D-45：真数据，五张图钉数 ≤ 5、通配 > 3 件不出钉
{
  const fs = require('fs'), path = require('path');
  const sh = fs.readdirSync(path.join(__dirname, '../../web/sheets')).filter(f => f.endsWith('.js')).map(f => 'web/sheets/' + f);
  const L4 = load({ extra: ['web/hzreal.js', ...sh, 'web/mods/info.js'] }); L4.HZ.make();
  const M4 = L4.G.HZ_MODS.find(m => m.id === 'info'), out = [];
  for (const [s, t] of [['S-101', 200], ['S-201', 180], ['S-201', 800], ['S-251', 640], ['S-401', 693], ['S-401', 756], ['S-501', 1100]]) {
    const P = M4.pinList(s, t), R = M4.sheetRecords(s, t);
    if (P.length > 5) fail(`${s} t=${t} 钉 ${P.length} > 5`);
    for (const p of P) for (const id of p.recs) { const r = R.find(x => x.id === id); if (!r || r.n > 3) fail(`${s} ${id} 命中 ${r && r.n} 件却出钉`); }
    out.push(`${s}@${t} 钉${P.length}/记录${R.length}`);
  }
  console.log('  实物图钉：' + out.join(' · '));
}

console.log('OK check_info');
