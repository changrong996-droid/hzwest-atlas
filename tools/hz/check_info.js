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
console.log('OK check_info');
