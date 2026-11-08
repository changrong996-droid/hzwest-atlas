'use strict';
// 联动接口 v2 宿主侧（web/hzview.js 的 <plugLink> 段）无头检查：
// 视图变换与逆变换互逆、缩放 2× + 平移后点 part 中心能命中、hash 读写 focus 且保留其它参数、parts 抛异常不外抛且只 warn 一次、
// 3D 盒拾取取最小体积；并对源码做接线断言（draw 前施加变换、ctx.focus / ctx.zoom、hashchange 先读 focus、S-501 接线）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'web/hzview.js'), 'utf8');
const fail = m => { console.log('FAIL check_linkage: ' + m); process.exit(1); };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);

// 0. 截取 <plugLink> 段在 vm 里求值
const m = /\/\/ <plugLink>[\s\S]*?\n([\s\S]*?)\/\/ <\/plugLink>/.exec(src);
if (!m) fail('hzview.js 缺少 // <plugLink> … // </plugLink> 段');
const ctx = vm.createContext({ URLSearchParams, console });
let PL;
try { PL = vm.runInContext('(() => {\n' + m[1] + '\nreturn PL; })()', ctx, { filename: 'hzview.js#plugLink' }); } catch (e) { fail('plugLink 段求值失败 ' + (e && e.message)); }
for (const k of ['apply', 'fwd', 'inv', 'clamp', 'zoomAt', 'centerOn', 'center', 'hitPart', 'pickBox', 'safeParts', 'byId', 'parseHash', 'hashWith', 'modsCall']) if (typeof PL[k] !== 'function') fail('PL.' + k + ' 不是函数');

// 假插件：两个 part（一小一大，小的压在大的上面），parts 返回两个盒
const W = 560, H = 420;
const FAKE = {
  id: 'S-999', name: '假图',
  parts: (t) => [
    { id: 'A-01', label: '大件', hit: [100, 100, 200, 120], box: [-50, 0, -20, 50, 10, 20] },
    { id: 'B-02', label: '小件', hit: [380, 300, 20, 16], box: [10 + t, 2, 0, 14 + t, 6, 4] },
  ],
};
const parts = FAKE.parts(0);
let runs = 0;

// 1. fwd / inv 互逆；apply 的矩阵 = fwd
{ const v = { k: 1, px: 0, py: 0 };
  PL.zoomAt(v, W, H, 2, 150, 120); v.px += -37; v.py += 21; PL.clamp(v, W, H);
  if (!near(v.k, 2)) fail('zoomAt 2× 后 k=' + v.k);
  for (const [x, y] of [[0, 0], [123.4, 56.7], [W, H], [390, 308]]) { const s = PL.fwd(v, W, H, x, y), q = PL.inv(v, W, H, s[0], s[1]); if (!near(q[0], x, 1e-9) || !near(q[1], y, 1e-9)) fail(`inv(fwd(${x},${y})) = ${q}`); runs++; }
  // 记录 translate/scale 组合成仿射矩阵，应与 fwd 一致
  let M = [1, 0, 0, 1, 0, 0]; const g = { translate: (x, y) => { M = [M[0], M[1], M[2], M[3], M[4] + M[0] * x + M[2] * y, M[5] + M[1] * x + M[3] * y]; }, scale: (a, b) => { M = [M[0] * a, M[1] * a, M[2] * b, M[3] * b, M[4], M[5]]; } };
  PL.apply(g, v, W, H); const s = PL.fwd(v, W, H, 77, 88); if (!near(M[0] * 77 + M[2] * 88 + M[4], s[0], 1e-9) || !near(M[1] * 77 + M[3] * 88 + M[5], s[1], 1e-9)) fail('apply 的变换与 fwd 不一致'); runs++;
  // 2. 缩放 2× + 平移后点每个 part 的中心 → 命中该 part
  for (const p of parts) { const [hx, hy, hw, hh] = p.hit, sc = PL.fwd(v, W, H, hx + hw / 2, hy + hh / 2), h = PL.hitPart(parts, v, W, H, sc[0], sc[1]); if (!h || h.id !== p.id) fail(`缩放 ${v.k}× 平移 (${v.px},${v.py}) 点 ${p.id} 中心命中 ${h && h.id}`); runs++; }
  // 未变换坐标点（即没做逆变换）应命中不到小件
  { const p = parts[1], [hx, hy, hw, hh] = p.hit, h = PL.hitPart(parts, v, W, H, hx + hw / 2, hy + hh / 2, 0); if (h && h.id === p.id) fail('未做逆变换也命中了 B-02（逆变换没起作用）'); runs++; }
  // 空白处不命中
  { const sc = PL.fwd(v, W, H, 20, 400); if (PL.hitPart(parts, v, W, H, sc[0], sc[1])) fail('空白处误命中'); runs++; } }
// 重叠时取面积最小
{ const ov = [{ id: 'big', hit: [0, 0, 300, 300] }, { id: 'small', hit: [100, 100, 10, 10] }], v = { k: 1, px: 0, py: 0 }; const h = PL.hitPart(ov, v, W, H, 105, 105); if (!h || h.id !== 'small') fail('重叠命中应取面积最小'); runs++; }
// 3. 缩放上下限与平移夹紧；centerOn
{ const v = { k: 1, px: 0, py: 0 }; PL.zoomAt(v, W, H, 50, 10, 10); if (v.k !== PL.KMAX) fail('缩放上限应为 8，实得 ' + v.k); PL.zoomAt(v, W, H, 0.1, 10, 10); if (v.k !== PL.KMIN || v.px !== 0 || v.py !== 0) fail('缩到 1× 应复位平移'); runs++;
  const p = parts[0], [hx, hy, hw, hh] = p.hit; PL.centerOn(v, W, H, hx + hw / 2, hy + hh / 2, 3); const c = PL.fwd(v, W, H, hx + hw / 2, hy + hh / 2); if (!near(v.k, 3) || !near(c[0], W / 2, 1e-6) || !near(c[1], H / 2, 1e-6)) fail('centerOn ×3 后 part 中心不在画布中央 ' + c); const cc = PL.center(v, W, H); if (!near(cc[0], hx + hw / 2, 1e-6)) fail('center() 不等于居中点'); runs++;
  // 角落 part 放大 ×3 也能居中（允许平移越过边缘，同 S-301）
  PL.centerOn(v, W, H, 8, 8, 3); const c2 = PL.fwd(v, W, H, 8, 8); if (!near(c2[0], W / 2, 1e-6) || !near(c2[1], H / 2, 1e-6)) fail('角落 part ×3 未能居中 ' + c2); runs++; }
// 4. hash：读 / 写 focus，保留 sheet、sub、t 等其它参数
{ const a = PL.parseHash('#sheet=s-101&focus=W-03&sub=S-301-3'); if (a.sheet !== 'S-101' || a.focus !== 'W-03') fail('parseHash ' + JSON.stringify(a));
  const b = PL.parseHash(''); if (b.sheet !== null || b.focus !== null) fail('空 hash 应为 null');
  const h1 = PL.hashWith('#sheet=S-101&sub=S-301-3&t=12.5&fv=te:99,tz:16.5', 'W-03'), q1 = new URLSearchParams(h1);
  if (q1.get('focus') !== 'W-03' || q1.get('sheet') !== 'S-101' || q1.get('sub') !== 'S-301-3' || q1.get('t') !== '12.5' || q1.get('fv') !== 'te:99,tz:16.5') fail('hashWith 丢了参数 ' + h1);
  if (!/fv=te:99,tz:16.5/.test(h1)) fail('hashWith 应保留逗号原样 ' + h1);
  const h2 = PL.hashWith(h1, null), q2 = new URLSearchParams(h2); if (q2.has('focus') || q2.get('sub') !== 'S-301-3') fail('hashWith(null) 应只删 focus ' + h2);
  const h3 = PL.hashWith('sheet=S-101&focus=OLD', 'NEW'); if (new URLSearchParams(h3).get('focus') !== 'NEW') fail('hashWith 应覆盖旧 focus');
  if (PL.parseHash('#' + PL.hashWith('sheet=S-501', 'TR-G9528')).focus !== 'TR-G9528') fail('focus 往返不一致'); runs++; }
// 5. parts 容错：抛异常 → []，不外抛，只 warn 一次；非数组 → []；无 id 的项丢弃
{ const warns = []; const bad = { id: 'S-998', parts: () => { throw new Error('boom'); } };
  let r; try { r = PL.safeParts(bad, 1, {}, w => warns.push(w)); r = PL.safeParts(bad, 2, {}, w => warns.push(w)); } catch (e) { fail('parts 抛异常时 safeParts 外抛了 ' + e.message); }
  if (!Array.isArray(r) || r.length) fail('抛异常时应返回 []'); if (warns.length !== 1 || !/S-998/.test(warns[0])) fail('应只 warn 一次，实得 ' + warns.length);
  if (PL.safeParts({ id: 'x', parts: () => 7 }, 0, {}).length !== 0) fail('非数组应返回 []');
  if (PL.safeParts({ id: 'x' }, 0, {}).length !== 0) fail('无 parts 应返回 []');
  if (PL.safeParts({ id: 'x', parts: () => [{ hit: [0, 0, 1, 1] }, null, { id: 'k' }] }, 0, {}).length !== 1) fail('无 id 项应丢弃');
  const ok = PL.safeParts(FAKE, 3, {}); if (ok.length !== 2 || PL.byId(ok, 'B-02').box[0] !== 13) fail('正常插件 parts(t) 应原样返回'); runs++; }
// 6. 3D 盒拾取：命中点在盒内 → 该 part；多个取体积最小；外扩 margin；盒外 null
{ if ((PL.pickBox(parts, 11, 4, 2) || {}).id !== 'B-02') fail('点在小盒内应取小件（体积最小）');
  if ((PL.pickBox(parts, -40, 5, 0) || {}).id !== 'A-01') fail('点在大盒内应取大件');
  if (PL.pickBox(parts, 0, 11.2, 0) !== null) fail('盒外不应命中'); if ((PL.pickBox(parts, 0, 11.2, 0, 1.5) || {}).id !== 'A-01') fail('外扩 1.5 m 应命中');
  if (PL.pickBox([{ id: 'n', box: [0, 0, 0, NaN, 1, 1] }], 0, 0, 0) !== null) fail('非有限盒应忽略'); runs++; }
// 7. 时间跟随：同 id 在新时刻换盒（盒中心位移 = 跟随量）
{ const a = PL.byId(FAKE.parts(0), 'B-02').box, b = PL.byId(FAKE.parts(5), 'B-02').box, dx = (b[0] + b[3] - a[0] - a[3]) / 2; if (!near(dx, 5)) fail('跟随位移应为 5，实得 ' + dx); runs++; }

// 8. 源码接线断言
const has = (s, msg) => { if (!src.includes(s)) fail('hzview.js 缺少接线：' + msg + '（' + s + '）'); };
has('S.plugLink = PL', 'window.__pv.plugLink');
has('PL.apply(g, PV, w, h); try { pl.draw(g, w, h, t, cx); }', 'draw 前施加缩放平移');
has('cx.focus = PV.focus; cx.zoom = PV.k', 'ctx.focus / ctx.zoom');
has("const f = PL.parseHash(location.hash).focus || ''; setSheet(sheetOf()); applyFocusHash(f);", 'hashchange 先读 focus 再切图');
has('plugFollow(dt)', '时间跟随');
has("$('sh-plug')", 'sh-plug 指针交互');
if (!/\['S-501',\s*'开通',\s*1\]/.test(src)) fail('SHEETS_ALL 中 S-501 应 on=1');
const html = fs.readFileSync(path.join(root, 'web/hzwest.html'), 'utf8');
if (!/<script src="sheets\/s501\.js\?v=\d+"><\/script>/.test(html)) fail('hzwest.html 未加载 sheets/s501.js');
if (html.indexOf('sheets/s501.js') > html.indexOf('hzview.js')) fail('s501.js 须在 hzview.js 之前加载');
// S-001 / S-002 插件与 3D 模块钩子（11-08 接线）
for (const f of ['sheets/s001.js', 'sheets/s002.js', 'mods/s101.js']) { if (!new RegExp('<script src="' + f.replace(/[./]/g, '\\$&') + '\\?v=\\d+"></script>').test(html)) fail('hzwest.html 未加载 ' + f); if (html.indexOf(f) > html.indexOf('hzview.js')) fail(f + ' 须在 hzview.js 之前加载'); }
if (html.indexOf('mods/s101.js') < html.indexOf('sheets/s101.js')) fail('mods/s101.js 须在 sheets/s101.js 之后加载（读 S-101 插件 stateAt）');
has("PLUG[SHEET].focusZoom !== false", '插件 focusZoom:false 选中不放大图纸');
has("m.build(scene, HZ, THREE, { clip: [CUTP] })", 'HZ_MODS build(scene, HZ, THREE, {clip})');
has("modsUpdate(S.st.t); rebuildDyn(S.st.t);", 'HZ_MODS 每次渲染前 update(t, cam)');
// 合同：SHEETS[0] 仍是千斤顶图、id 不变
if (!/const SHEETS = \[\{ id: 'sh-jack'/.test(src)) fail('SHEETS[0] 必须仍是 sh-jack');
if (!/if \(w < 20 \|\| h < 20\) (return;|\{[^}]*return; \})/.test(src)) fail('drawSheet 须保留 clientWidth<20 跳过');
// 结尾列车：车头停进站台、湖杭场股道
{ const fv = /tz: HZ\.tracks\(HZ\.YARDS\.S\)\[0\], te: (-?[\d.]+), tw: 1/.exec(src); if (!fv) fail('FV 默认 tz 应取湖杭场股道 HZ.tracks(HZ.YARDS.S)[0]、tw 1');
  const te = +fv[1], L = 8 * (25.5 + 0.8), head = te + 12, tail = te - L; if (Math.abs(head) > 225 || Math.abs(tail) > 225) fail(`首趟列车 头 ${head} 尾 ${tail} 应都在站台 ±225 内`); runs++; }

// HZ_MODS pick / unpick 钩子（11-08）：modsCall 跳过没有该方法的模块、抛错只 warn 一次且不连坐；宿主接线与 #mod-ui 容器
{ const log = [], warns = []; const A = { id: 'a', pick: (p, xy, c) => log.push('a:' + p.id + ':' + xy.x + ':' + c.sheet), unpick: () => log.push('a:un') }, B = { id: 'b', update() { } }, C = { id: 'c', pick() { throw new Error('boom'); } };
  const n1 = PL.modsCall([A, B, C, null], 'pick', [{ id: 'K-1' }, { x: 5, y: 6 }, { sheet: 'S-999' }], w => warns.push(w));
  const n2 = PL.modsCall([A, B, C], 'pick', [{ id: 'K-2' }, { x: 7, y: 8 }, { sheet: 'S-999' }], w => warns.push(w));
  const n3 = PL.modsCall([A, B, C], 'unpick', [], w => warns.push(w));
  if (n1 !== 1 || n2 !== 1 || n3 !== 1) fail('modsCall 调用数应为 1/1/1，实得 ' + [n1, n2, n3]);
  if (log.join(',') !== 'a:K-1:5:S-999,a:K-2:7:S-999,a:un') fail('modsCall 调用顺序/参数不对 ' + log.join(','));
  if (warns.length !== 1 || !/c\.pick/.test(warns[0])) fail('模块 pick 抛错应只 warn 一次 ' + JSON.stringify(warns));
  if (PL.modsCall(undefined, 'pick', []) !== 0) fail('modsCall(undefined) 应返回 0'); runs++; }
has('S.plugSel = (S.plugSel || 0) + 1; hashSync(); modsPick(p, src, xy); return true; }', '选中 part 后调 HZ_MODS pick');
has("if (had) { dynKey = ''; leadKey = ''; sheetInv(); } modsUnpick(); }", 'plugClear 调 HZ_MODS unpick');
has("PL.modsCall(L, 'pick', [p, xy, { sheet: SHEET, t: S.st.t, src, root: $('mod-ui')", 'pick(part, {x,y}, ctx) 带 #mod-ui');
has("PL.modsCall(S.modsList, 'unpick', [], pwarn)", 'unpick()');
has("plugSelect(q.part, '3d', { x: cx - R.left, y: cy - R.top })", '3D 点击把点击位置传给 pick');
has('S.modsList = MODS;', 'S.modsList');
has("['build', 'update', 'pick', 'unpick'].some(k => typeof m[k] === 'function')", '只有 pick / unpick 的模块也进列表（build 可选）');
if (!/<div id="mod-ui"><\/div>\s*<\/div>\s*<div id="col"/.test(html)) fail('hzwest.html 应在 #v3 末尾放空容器 <div id="mod-ui"></div>');
if (!/#mod-ui\{position:absolute;inset:0;[^}]*pointer-events:none\}/.test(html)) fail('#mod-ui 应绝对定位铺满 #v3 且 pointer-events:none');
if (!/hzview\.js\?v=(\d+)/.test(html) || +/hzview\.js\?v=(\d+)/.exec(html)[1] < 17) fail('hzview.js 加 pick 钩子后版本号应 ≥ 17');
has("ug: 0 }, JSON.parse(hp.get('camcfg') || '{}'))", '镜头参数默认 ug 0（不进地铁层）');
has('CC.ug = CC.ug === 1 || CC.ug === true ? 1 : 0;', '地铁层镜头入口只在 #camcfg 显式 ug 1 时开（委托人 11-08 定默认关）');
console.log('OK check_linkage runs=' + runs);
