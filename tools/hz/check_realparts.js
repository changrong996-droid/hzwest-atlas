'use strict';
// 实物挂构件：web/hzreal.js 每条记录的 parts（「图号:构件 id」，末尾 * 通配）都必须在该图插件 parts() 里找到构件；
// 构件 id 在插件时间窗内采样取并集（有的构件只在部分时刻出现）。另测 HZR.forPart 与 S-201 身份卡读到挂接记录。
const { load, sheetCtx } = require('./harness');
const SHEETS = ['s101', 's201', 's251', 's401', 's501'];
const { G, HZ, makeCtx } = load({ extra: ['web/hzreal.js'].concat(SHEETS.map(s => `web/sheets/${s}.js`)) });
HZ.make();
const fail = m => { console.log('FAIL check_realparts: ' + m); process.exit(1); };
const R = G.HZR; if (!R || typeof R.forPart !== 'function') fail('HZR.forPart 缺失');
const ids = {};
for (const P of G.HZ_SHEET_PLUGINS || []) { if (typeof P.parts !== 'function') continue; const set = ids[P.id] = new Set(); const [a, b] = P.window;
  for (let i = 0; i <= 8; i++) { const t = a + (b - a) * i / 8; try { P.draw(makeCtx().g, 560, 420, t, sheetCtx()); for (const q of P.parts(t, { w: 560, h: 420 }) || []) set.add(q.id); } catch (e) { /* 各图自己的 check 管绘制 */ } } }
let pats = 0, linked = 0;
for (const r of R.RECORDS) { if (r.parts == null) continue; if (!Array.isArray(r.parts) || !r.parts.length) fail(r.id + ' parts 应为非空数组');
  for (const p of r.parts) { if (typeof p !== 'string' || !/^S-\d{3}:[A-Z][A-Z0-9-]*\*?$/.test(p)) fail(r.id + ' parts 格式不对: ' + p);
    const sh = p.slice(0, p.indexOf(':')), set = ids[sh]; if (!set) fail(r.id + ' parts 指向无 parts() 的图 ' + sh);
    const hit = [...set].filter(id => R.pmatch(p, sh, id)); if (!hit.length) fail(`${r.id} ${p} 在 ${sh} 找不到构件`); pats++; linked += hit.length; } }
const g9 = R.forPart('S-201', 'G-N09').map(r => r.id).join(','); if (g9 !== 'R-0013,R-0015,R-0010,R-0016,R-0014') fail('forPart(S-201,G-N09) = ' + g9);
const s3 = R.forPart('S-201', 'G-S03').map(r => r.id).join(','); if (s3 !== 'R-0009,R-0010') fail('forPart(S-201,G-S03) = ' + s3);
if (R.forPart('S-201', 'D-S01').length) fail('承轨层板不应挂铺轨记录');
const PL = G.HZ_SHEET_PLUGINS.find(p => p.id === 'S-201'), I = PL.info('G-N09', 900); if (!I || !I.lines.some(l => l[0] === '实物' && /R-0013/.test(l[1]))) fail('S-201 身份卡未读到挂接记录');
console.log(`OK check_realparts records=${R.RECORDS.filter(r => r.parts).length} patterns=${pats} parts_linked=${linked}`);
