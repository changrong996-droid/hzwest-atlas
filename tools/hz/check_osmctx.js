'use strict';
// 城市远景层（web/mods/osmctx.js + osmctx-data.js）无头检查 · hark-fangyi
// 1 登记 HZ_MODS osmctx（build / update，声明 replaces）；2 数据文件 < 1 MB、带 OSM 与哥白尼署名；
// 3 坐标在模型系范围内（建筑在 ±5 × ±4 km，线状要素可伸出城区框），建筑不压站房模型包络，国铁站内段已让给模型股道；4 开通日联动的线（合杭 / 3 号线 / 19 号线）都在；
// 5 地形网格：城区框内压平（≤ 0），框外有起伏，最高 < 1600 m；6 build(null) 只登记不建网格。
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { load } = require('./harness');
const { G, HZ } = load({ extra: ['web/mods/osmctx-data.js', 'web/mods/osmctx.js'] });
HZ.make();
const fail = m => { console.log('FAIL check_osmctx: ' + m); process.exit(1); };
const M = (G.HZ_MODS || []).find(m => m.id === 'osmctx');
if (!M || typeof M.build !== 'function' || typeof M.update !== 'function') fail('未登记 HZ_MODS osmctx（build / update）');
if (!Array.isArray(M.replaces) || !M.replaces.includes('ctx.city')) fail('缺 replaces 声明');
const D = G.HZ_OSMCTX; if (!D) fail('缺 window.HZ_OSMCTX');
const sz = fs.statSync(path.join(__dirname, '../../web/mods/osmctx-data.js')).size; if (sz >= 1 << 20) fail('数据文件 ≥ 1 MB：' + sz);
const src = (D.src || []).join(' '); if (!/OpenStreetMap/.test(src) || !/ODbL/.test(src) || !/Copernicus/.test(src)) fail('缺数据署名');
const inM = (p, pad) => Math.abs(p[0]) < 670 + pad && p[1] > -170 - pad && p[1] < 245 + pad;
let n = 0;
for (const k of ['b', 'g', 'w', 'h', 'r', 'ug']) for (const o of D[k]) for (const p of o.p) { n++; const L = k === 'b' ? [5000, 4000] : [20000, 20000]; if (!(Math.abs(p[0]) < L[0] && Math.abs(p[1]) < L[1])) fail(k + ' 坐标越界 ' + p); }
for (const o of D.b) { if (!(o.h > 0 && o.h < 400)) fail('建筑高度异常 ' + o.h); if (o.p.every(p => inM(p, 0))) fail('建筑落在站房模型包络内'); }
for (const o of D.r) if (!o.m) for (const p of o.p) if (inM(p, -20)) fail('国铁站内段未剔除 ' + (o.n || '') + ' ' + p);
for (const re of [/合杭/, /3号线/, /19号线/]) if (!D.r.some(o => re.test(o.n || ''))) fail('缺开通联动线 ' + re);
// 地形
const T = D.dem, hq = new Int16Array(new Uint8Array(zlib.gunzipSync(Buffer.from(T.h, 'base64'))).buffer);
if (hq.length !== T.nx * T.ny) fail('地形网格尺寸不符');
const grid = M.geo.demGrid(T, D.frame, hq); let inMax = -1e9, outMax = -1e9;
for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) { const x = T.x0 + i * T.st, y = T.y0 + j * T.st, h = grid.pos[3 * (j * T.nx + i) + 1];
  if (Math.abs(x) < D.frame.bx && Math.abs(y) < D.frame.by) inMax = Math.max(inMax, h); else outMax = Math.max(outMax, h); }
if (inMax > 0) fail('城区框内地形未压平 ' + inMax); if (!(outMax > 100 && outMax < 1600)) fail('框外地形起伏异常 ' + outMax);
if (grid.idx.length !== (T.nx - 1) * (T.ny - 1) * 6) fail('地形索引数不符');
// 几何小工具
if (M.geo.ribbonTris([{ p: [[0, 0], [10, 0]] }], 4, 0, []).length !== 18) fail('ribbonTris 每段应 2 个三角形');
M.build(null, HZ); if (!M.stat || M.stat.b !== D.b.length) fail('build(null) 未登记统计');
M.update(0, null); M.update(1200, null);
console.log('OK check_osmctx（建筑 ' + D.b.length + '，道路 ' + D.h.length + '，铁路 / 地铁 ' + D.r.length + '，点 ' + n + '，数据 ' + (sz / 1024).toFixed(0) + ' KB，框外最高 ' + outMax.toFixed(0) + ' m）');
