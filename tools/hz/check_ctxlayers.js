'use strict';
// 远景图层机制检查（web/mods/ctx/layers.json + 图层文件，规则 docs/ctx-layers.md）· hark-fangyi
// 1 清单每行有 id / file / by，文件存在、单个 < 300 KB、合计 < 1 MB、不重名；2 每个文件只 push 一个图层，id 与清单一致；
// 3 图层过 osmctx 的 M.validate（字段、署名许可、坐标在地形范围 ±16 × ±12 km、标注有名、体块高度）；4 M.ll 与 tools/hz/ctxlayer.py 换算一致（站心 → 0）；
// 5 时间窗：from < to；6 清单外的 ctx/*.js 视为漏登记。
const fs = require('fs'), path = require('path');
const { load } = require('./harness');
const dir = path.join(__dirname, '../../web/mods/ctx');
const fail = m => { console.log('FAIL check_ctxlayers: ' + m); process.exit(1); };
let man; try { man = JSON.parse(fs.readFileSync(path.join(dir, 'layers.json'), 'utf8')); } catch (e) { fail('读不了 web/mods/ctx/layers.json：' + e.message); }
if (!Array.isArray(man.layers)) fail('layers.json 缺 layers 数组');
const files = man.layers.map(e => 'web/mods/ctx/' + e.file);
const { G } = load({ extra: ['web/mods/osmctx-data.js', 'web/mods/osmctx.js'].concat(files) });
const M = (G.HZ_MODS || []).find(m => m.id === 'osmctx'); if (!M || typeof M.validate !== 'function' || typeof M.addLayer !== 'function') fail('osmctx 缺图层机制（validate / addLayer）');
const z = M.ll(119.9817, 30.3004); if (Math.hypot(z[0] + 10 * Math.cos(4.3 * Math.PI / 180), z[1] + 10 * Math.sin(4.3 * Math.PI / 180)) > 0.01) fail('M.ll 站心换算不符 ' + z);
const R = G.HZ_CTX_LAYERS || []; if (R.length !== man.layers.length) fail('清单 ' + man.layers.length + ' 行，文件 push 了 ' + R.length + ' 个图层');
let tot = 0, nItems = 0; const ids = new Set();
man.layers.forEach((e, i) => {
  if (!e.id || !e.file || !e.by) fail('清单第 ' + (i + 1) + ' 行缺 id / file / by'); if (ids.has(e.id)) fail('清单 id 重复 ' + e.id); ids.add(e.id);
  if (!/^[a-z0-9._-]+\.js$/.test(e.file)) fail('文件名须小写 .js：' + e.file);
  const sz = fs.statSync(path.join(dir, e.file)).size; if (sz >= 300 << 10) fail(e.file + ' ≥ 300 KB（' + sz + '），请抽稀或拆层'); tot += sz;
  const L = R[i]; if (!L || L.id !== e.id) fail('第 ' + (i + 1) + ' 个文件的图层 id（' + (L && L.id) + '）与清单（' + e.id + '）不一致或顺序不对');
  const bad = M.validate(L); if (bad.length) fail(e.id + '：' + bad.join('；'));
  if (L.from != null && L.to != null && !(L.from < L.to)) fail(e.id + ' 时间窗 from ≥ to');
  for (const o of L.items || []) if (o.from != null && o.to != null && !(o.from < o.to)) fail(e.id + ' 条目时间窗 from ≥ to');
  if (!M.addLayer(L)) fail(e.id + ' addLayer 未登记'); nItems += (L.items || []).length;
});
if (tot >= 1 << 20) fail('图层合计 ≥ 1 MB');
for (const f of fs.readdirSync(dir)) if (f.endsWith('.js') && !man.layers.some(e => e.file === f)) fail('ctx/' + f + ' 未登记到 layers.json');
if (M.addLayer({ id: 'Bad', items: [] }) !== null) fail('不合格图层应被拒');
console.log('OK check_ctxlayers（图层 ' + man.layers.length + '，条目 ' + nItems + '，' + (tot / 1024).toFixed(1) + ' KB）');
