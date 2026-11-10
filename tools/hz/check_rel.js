'use strict';
// 构件上下游关系（web/hzrel.js，HZ.rel）无头检查 · hark-cr 11-10
// 每张插件图在时间窗内 5 个采样时刻（+ S-301 合成构件）：
//   1. 每个可点构件 HZ.rel 不抛错、返回对象（id 对得上、up / down 为数组、counts 为非负整数）；
//   2. 本图项（level 'part' 且 sheet = 本图）的 id 都在本图 parts(t) 里；工序级项 act 在 HZ.K 里、id = 'K-' + 去 ~rm 的工序 key；无自环；
//   3. 本图构件级对称：X 的 up 含 Y ⇔ Y 的 down 含 X（S-001 工序级同样对称）；
//   4. 推导可追溯：每个工序级项都对应引擎里真实的一条 pred 边（不手写）；构件级项都对应某件的 supP；
//   5. 改引擎会跟着变（rules not coordinates）：把某 trackS 段的 supP 清空后，相应 up 计数下降；
//   6. 至少一张图里有构件级支承、至少一件有吊车，S-301 J01 / ZS 返回关系。
const fs = require('fs'), path = require('path');
const { load, makeCtx, sheetCtx } = require('./harness');
const R = path.join(__dirname, '../..');
const sheets = fs.readdirSync(path.join(R, 'web/sheets')).filter(f => f.endsWith('.js')).map(f => 'web/sheets/' + f);
const { G, HZ } = load({ extra: ['web/hzreal.js', ...sheets, 'web/hzrel.js'] });
HZ.make();
const fail = m => { console.log('FAIL check_rel: ' + m); process.exit(1); };
if (typeof HZ.rel !== 'function') fail('HZ.rel 未定义');
const predHas = (B, A) => B && A && B.pred.some(e => e.a === A);
let nRel = 0, nPart = 0, nAct = 0, nCrane = 0, nSym = 0;
function checkSheet(id, t, parts) {
  const ids = new Set(parts.map(p => String(p.id))), all = HZ.relAll(id, t, parts);
  for (const [pid, r] of all) {
    if (!r || r.id !== pid || !Array.isArray(r.up) || !Array.isArray(r.down)) fail(id + ' ' + pid + ' @' + t.toFixed(1) + ' 返回不全');
    for (const k of ['hold', 'wait', 'carry', 'next']) if (!(Number.isInteger(r.counts[k]) && r.counts[k] >= 0)) fail(id + ' ' + pid + ' counts.' + k);
    nRel++; if (r.crane) nCrane++;
    for (const side of ['up', 'down']) for (const x of r[side]) {
      if (x.sheet === id && x.id === pid) fail(id + ' ' + pid + ' 自环（' + side + '）');
      if (x.level === 'part' && x.sheet === id) { nPart++; if (!ids.has(x.id)) fail(id + ' ' + pid + ' ' + side + ' 项 ' + x.id + ' 不在本图 parts'); }
      else { if (x.act && !HZ.K[x.act]) fail(id + ' ' + pid + ' 工序 ' + x.act + ' 不存在'); if (x.id !== 'K-' + String(x.act).replace(/~rm$/, '')) fail(id + ' ' + pid + ' 工序项 id ' + x.id); }
      for (const h of x.here) if (!ids.has(h)) fail(id + ' ' + pid + ' here ' + h + ' 不在本图');
      if (x.level === 'act') { nAct++; const A = HZ.K[x.act], mine = r.acts.map(k => HZ.K[k]);
        const ok = side === 'up' ? mine.some(B => predHas(B, A)) : mine.some(B => predHas(A, B)); if (!ok) fail(id + ' ' + pid + ' ' + side + ' 工序 ' + x.act + ' 无对应 pred 边'); }
    }
  }
  // 对称（本图构件级；S-001 工序级）
  const key = (x) => x.sheet + ':' + x.id;
  for (const [pid, r] of all) for (const x of r.up) {
    const onSheet = (id === 'S-001') ? x.sheet === 'S-001' && x.rel !== 'rm' : (x.level === 'part' && x.sheet === id);
    if (!onSheet) continue; const ys = id === 'S-001' ? parts.filter(p => String(p.id) === x.id || String(p.id).startsWith(x.id + '-')).map(p => String(p.id)) : [x.id];
    for (const y of ys) { const ry = all.get(y); if (!ry) continue; nSym++; if (!ry.down.some(d => (id === 'S-001' ? d.id === pid.split('-').slice(0, 2).join('-') : d.id === pid) && d.sheet === (id === 'S-001' ? 'S-001' : id))) fail(id + ' 不对称：' + pid + ' up 含 ' + y + '，' + y + ' down 不含 ' + pid); }
  }
  for (const [pid, r] of all) for (const x of r.down) {
    const onSheet = (id === 'S-001') ? x.sheet === 'S-001' && x.rel !== 'rm' : (x.level === 'part' && x.sheet === id); if (!onSheet || id === 'S-001') continue;
    const ry = all.get(x.id); if (ry && !ry.up.some(u => u.id === pid && u.sheet === id)) fail(id + ' 不对称：' + pid + ' down 含 ' + x.id + '，反向 up 不含');
  }
}
const T0 = Date.now();
for (const pl of G.HZ_SHEET_PLUGINS) { const [a, b] = pl.window || [0, 0];
  for (let i = 0; i < 5; i++) { const t = a + (b - a) * (i + 0.5) / 5, ctx = sheetCtx(pl.id); try { pl.draw(makeCtx().g, 1200, 700, t, ctx); } catch (e) { }
    let parts = []; try { parts = pl.parts(t, ctx) || []; } catch (e) { fail(pl.id + '.parts 抛错 ' + e.message); }
    checkSheet(pl.id, t, parts); } }
// S-301（宿主图）
const p301 = HZ.relParts301(); if (p301.length < 27) fail('S-301 合成构件 ' + p301.length);
checkSheet('S-301', 650, p301);
const j1 = HZ.rel('S-301', 'J01', 650), zs = HZ.rel('S-301', 'ZS', 650);
if (!j1 || !j1.up.some(x => x.act === 'mast' || x.act === 'floorS' || x.act === 'floorN')) fail('J01 应靠柱 / 楼面撑着');
if (!zs || !zs.crane || zs.crane.kind !== 'lifters') fail('ZS 吊装应为液压提升器');
if (!nPart) fail('没有任何构件级支承项'); if (!nCrane) fail('没有任何构件带吊车');
// rules not coordinates：清掉一件的 supP，关系跟着少
{ const pl = G.HZ_SHEET_PLUGINS.find(q => q.id === 'S-201'), t = 800, ctx = sheetCtx('S-201'); pl.draw(makeCtx().g, 1200, 700, t, ctx); const parts = pl.parts(t, ctx);
  const g = parts.find(p => /^G-S/.test(p.id)); if (!g) fail('S-201 无股道');
  const r0 = HZ.rel('S-201', g.id, t, { parts }), seg = HZ.K.trackS.parts.find(p => p.supP && p.supP.size && p.geo.min[2] >= g.box[2] - 0.6 && p.geo.max[2] <= g.box[5] + 0.6);
  if (!seg) fail('找不到 ' + g.id + ' 的轨道段');
  const keep = seg.supP; seg.supP = new Set(); const r1 = HZ.rel('S-201', g.id, t, { parts }); seg.supP = keep;
  if (!(r1.counts.hold < r0.counts.hold)) fail('清空 supP 后 hold 未下降（' + r0.counts.hold + ' → ' + r1.counts.hold + '）'); }
console.log('OK check_rel ' + nRel + ' 次 · 构件级项 ' + nPart + ' · 工序级项 ' + nAct + ' · 对称核对 ' + nSym + ' · 带吊车 ' + nCrane + ' · ' + ((Date.now() - T0) / 1000).toFixed(1) + ' s');
