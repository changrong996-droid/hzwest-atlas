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
has("const cx = { sheet: SHEET, t: S.st.t, src, root: $('mod-ui')", 'pick(part, {x,y}, ctx) 带 #mod-ui');
has("PL.modsCall([m], 'pick', [p, xy, cx], pwarn); modOwn(m);", 'pick 逐模块调用并记 #mod-ui 归属');
has("PL.modsCall([m], 'unpick', [], pwarn); modOwn(m);", 'unpick()');
// 11-08：模块停用清理（调 unpick、隐藏 3D 节点、移除 #mod-ui 元素）、挂起另一个 part 先 unpick、投影排除 z<-1
has("for (const o of (m.__nodes || [])) o.visible = false; modOwn(m); for (const n of (m.__dom || [])) if (n.parentNode) n.parentNode.removeChild(n);", '模块停用后隐藏 3D 节点并移除 #mod-ui 元素');
has("catch (e) { modOff(m, e); }", 'update 抛错走 modOff');
has("if (!p) { if (PV.focus) { PV.focus = null; PV.box = null; PV.label = ''; PFOL = null; dynKey = ''; leadKey = ''; sheetInv(); modsUnpick(); }", '挂起另一个 part 时先清选中并 unpick');
has("if (q.z > -1 && q.z < 1) xy =", 'pick 投影排除相机背后');
// 11-08：云门模块接线（web/mods/yunmen.js 生效时墨线模式隐去旧 ymf/ym/ymc 体块）、actors 加载、three 本地 vendor 优先
for (const f of ['mods/yunmen.js', 'mods/actors.js']) { if (!new RegExp('<script src="' + f.replace(/[./]/g, '\\$&') + '\\?v=\\d+"></script>').test(html)) fail('hzwest.html 未加载 ' + f); if (html.indexOf(f) > html.indexOf('hzview.js')) fail(f + ' 须在 hzview.js 之前加载'); }
has("const YMK = new Set(['ymf', 'ym', 'ymc']);", '旧云门体块标记');
has("MF[iv] = it.ym ? 3 : it.temp;", '云门顶点 aF = 3');
has("if (aF > 2.5 && uYm > 0.5) hzP = vec3(0.0, -1e5, 0.0);", '墨线填充按 uYm 隐去旧云门');
has("if (aF > 2.5) { vF = 0.0; if (uYm > 0.5) vS = -3.0; }", '墨线线条按 uYm 隐去旧云门');
has("U.uYm.value = YMON ? 1 : 0;", 'renderInk 置 uYm');
has("const YMM = MODS.find(m => m.id === 'yunmen')", '云门模块识别');
has("let loc = hp.get('three') !== 'cdn';", 'three 默认本地 vendor');
has("THREE_BASE + 'build/three.module.js'", 'three CDN 兜底');
// 屋面掠射光与光伏硬边（11-08）
has('float hzPVA(vec2 p) { float m = hzPVMask(p), fw = max(fwidth(m), 1e-4); return smoothstep(0.5 - fw, 0.5 + fw, m); }', '光伏遮罩 0.5 等值线硬边');
if ((src.match(/hzPV = hzPVA\(vWq\.xz\)/g) || []).length !== 2) fail('实景 / 墨线两处光伏都应走 hzPVA');
has("f = mix(f, clamp(1.03 + uRakeK * (dot(n, uRakeDir) - uRakeDir.y), 0.6, 1.2), uRake);", '屋面掠射光');
has("plugSelect(q.part, '3d', { x: cx - R.left, y: cy - R.top })", '3D 点击把点击位置传给 pick');
has('S.modsList = MODS;', 'S.modsList');
has("['build', 'update', 'pick', 'unpick'].some(k => typeof m[k] === 'function')", '只有 pick / unpick 的模块也进列表（build 可选）');
if (!/<div id="mod-ui"><\/div>\s*<\/div>\s*<div id="col"/.test(html)) fail('hzwest.html 应在 #v3 末尾放空容器 <div id="mod-ui"></div>');
if (!/#mod-ui\{position:absolute;inset:0;[^}]*pointer-events:none\}/.test(html)) fail('#mod-ui 应绝对定位铺满 #v3 且 pointer-events:none');
if (!/hzview\.js\?v=(\d+)/.test(html) || +/hzview\.js\?v=(\d+)/.exec(html)[1] < 21) fail('hzview.js 接云门 / three 本地 / 掠射光后版本号应 ≥ 21');
has("ug: 0 }, JSON.parse(hp.get('camcfg') || '{}'))", '镜头参数默认 ug 0（不进地铁层）');
has('CC.ug = CC.ug === 1 || CC.ug === true ? 1 : 0;', '地铁层镜头入口只在 #camcfg 显式 ug 1 时开（委托人 11-08 定默认关）');
// 图纸范围（11-09，委托人：S-201 三维显示全工程、图纸只画承轨层）：插件图纸激活时范围外构件淡显（PL.scopeMask + aGh 幽灵）
{ const { load } = require('./harness.js'), L = load({ extra: ['web/hzreal.js', 'web/sheets/s001.js', 'web/sheets/s201.js', 'web/sheets/s501.js'] }), HZ = L.HZ; HZ.make();
  const PLG = {}; for (const q of L.G.HZ_SHEET_PLUGINS) PLG[q.id] = q;
  const lk = /const LEAD_KEYS = (\{[^\n]*?\});/.exec(src); if (!lk) fail('hzview.js 缺 LEAD_KEYS 字面'); const LEAD = vm.runInContext('(' + lk[1] + ')', vm.createContext({}));
  const its = []; for (const a of HZ.acts) { if (a.kind === 'untemp' || !a.parts.length) continue; for (const p of a.parts) its.push({ key: a.key, min: p.geo.min, max: p.geo.max, st: p.st, rm: p.rm }); }
  const scopeFor = (id, pl, frag) => { pl = pl || PLG[id]; const [a, b] = pl.window, parts = []; for (let i = 0; i <= 6; i++) for (const q of PL.safeParts(pl, a + (b - a) * i / 6, { w: 560, h: 420 })) parts.push(q); return PL.scopeMask(pl, its, { leadKeys: Array.isArray(pl.leadKeys) ? null : LEAD[id], parts, midZ: HZ.P.midZ, t: a, frag }); };
  const vis = (it, t) => t >= it.st && !(it.rm && it.rm[0] >= 0 && t >= it.rm[0] + it.rm[1]);
  const s2 = scopeFor('S-201'), tm = (PLG['S-201'].window[0] + PLG['S-201'].window[1]) / 2; if (!s2.on) fail('S-201 应启用图纸范围 ' + s2.src);
  const own = new Set(['frameS', 'frameN', 'pierS', 'pierN', 'deckS', 'deckN', 'platS', 'platN', 'deckapS', 'deckapN', 'trackS', 'trackN']); let gh = 0, sc = 0;
  its.forEach((it, i) => { if (!vis(it, tm)) return; if (own.has(it.key)) { if (!s2.mask[i]) fail(`S-201 t=${tm} 承轨层构件 ${it.key} 被淡显了`); sc++; } else { if (s2.mask[i]) fail(`S-201 t=${tm} 范围外构件 ${it.key} 没有淡显`); gh++; } });
  if (!sc || gh < 100) fail(`S-201 中点在场构件：本图 ${sc}、淡显 ${gh}（淡显应 ≥ 100：候车层、雨棚、网架等）`);
  has("SCOPE_ALL = new Set(['S-001'])", 'S-001 总进度横道图全显'); if (!scopeFor('S-501').on) fail('S-501 开通前应只突出云门 / 上盖');
  const F = { id: 'S-999', window: [0, 2000], parts: () => [] };
  if (PL.scopeMask(Object.assign({ scope: false }, F), its, {}).on) fail('pl.scope = false 应全显');
  const lv = PL.scopeMask(Object.assign({ scope: { levels: [[-1, 12]], zones: ['ZS'] } }, F), its, { midZ: HZ.P.midZ }); if (!lv.on || its.some((it, i) => lv.mask[i] && (it.max[1] > 12.5 || (it.min[2] + it.max[2]) / 2 <= HZ.P.midZ + 3.5))) fail('pl.scope.levels/zones 取交不对');
  if (!PL.scopeMask(Object.assign({ scope: { keys: ['canopyS'] } }, F), its, {}).keys.includes('canopyS')) fail('pl.scope.keys 应进范围');
  // 11-09 11:04 委托人：范围外隐藏（SCOPE_OUT = 'hide'）。S-201 中点：范围外在场构件画出来的 = 0；塔吊只留服务本图（塔身在范围或吊本图构件）的，塔身随之进范围
  const OUT = (/const SCOPE_OUT = '(hide|ghost)';/.exec(src) || [])[1]; if (!OUT) fail('hzview.js 缺单一常量 SCOPE_OUT');
  if (typeof PL.scopeCranes !== 'function') fail('PL.scopeCranes 不是函数');
  const iof = new Map(); { let i = 0; for (const a of HZ.acts) { if (a.kind === 'untemp' || !a.parts.length) continue; for (const p of a.parts) { if (!iof.has(p)) iof.set(p, i); i++; } } }
  const CRS = HZ.cranes.map((c, k) => { const seq = []; for (const a of HZ.acts) for (const p of a.parts) if (p.crane === k) seq.push({ i: iof.has(p) ? iof.get(p) : -1, t: p.st + p.du * 0.5 });
    return { key: c.key, mast: its.findIndex((it, i) => it.key === c.key && [...iof].some(([p, j]) => j === i && Math.abs(p.c[0] - c.x) < 1 && Math.abs(p.c[2] - c.z) < 1)), seq }; });
  const hideOf = (id) => { const r = scopeFor(id, null, true), m2 = Uint8Array.from(r.mask), cr = PL.scopeCranes(CRS, m2, PLG[id].window); CRS.forEach((c, k) => { if (cr[k] && c.mast >= 0) m2[c.mast] = 1; }); return { r, m2, cr }; };
  { const hd = hideOf('S-201'), { m2, cr } = hd, ghostOn = OUT === 'ghost'; let drawnOut = 0, outN = 0;
    its.forEach((it, i) => { if (!vis(it, tm) || m2[i]) return; outN++; if (ghostOn) drawnOut++; });
    if (OUT === 'hide' && drawnOut) fail(`S-201 t=${tm} 范围外在场构件仍画出 ${drawnOut} 件（隐藏模式应 0）`);
    if (outN < 100) fail(`S-201 中点范围外在场构件 ${outN}（应 ≥ 100，候车层、雨棚、网架等都该隐去）`);
    CRS.forEach((c, k) => { const serve = (c.mast >= 0 && hd.r.mask[c.mast]) || c.seq.some(e => e.i >= 0 && hd.r.mask[e.i] && e.t >= PLG['S-201'].window[0] - 30 && e.t <= PLG['S-201'].window[1] + 30);
      if (!!cr[k] !== !!serve) fail(`S-201 塔吊 #${k} 显隐与是否服务本图不符`); if (cr[k] && c.mast >= 0 && !m2[c.mast]) fail(`S-201 塔吊 #${k} 留着但塔身不在范围（悬空）`); });
    if (cr[6] || cr[7]) fail('S-201 不应留云门塔吊 ycrane（吊的是云门，不属承轨层）');
    if (process.env.HZ_DBG) for (const id of Object.keys(PLG)) { const q = hideOf(id); console.log(id, q.r.on, q.r.src, 'cr=' + q.cr.join(''), 'n=' + q.r.n + '/' + q.r.live, q.r.keys.join(' ')); } }
  { const { cr, r } = hideOf('S-501'); if (!cr[6] || !cr[7]) fail('S-501 云门塔吊 ycrane 应留'); const dk = ((PLG['S-501'].scope && PLG['S-501'].scope.keys) || []), has2 = its.some((it, i) => r.mask[i] && it.key === 'asm2');
    if (dk.includes('asm2') ? !has2 : has2) fail(dk.includes('asm2') ? 'S-501 已声明屋盖 scope.keys（asm1..3 等），asm2 须在范围内（D-38）' : 'S-501 未声明屋盖 scope 时，隐藏模式不应认进「站房屋盖」盒里的屋盖碎片（o.frag）'); }
  runs++; }
has("const SCOPE_OUT = 'hide';", '范围外默认隐藏（单一常量，改 ghost 即切回 7e3b03b 淡显）');
has("if (uScope > 0.5 && vGh > 0.5) { if (vS < 1.0 || uScH > 0.5) discard;", '隐藏模式范围外墨线不画');
has("if (vS < 0.0) { if (uGhost < 0.5 || vF > 0.5 || uScope * uScH > 0.5) discard;", '分图隐藏模式不画未建设计位红线（委托人 11:05：其它淡影一并关）');
has("GHOST.visible = on && SCOPE_OUT === 'ghost'; SC_HIDE = on && SCOPE_OUT === 'hide' ? sc : null;", '隐藏模式不开幽灵网格');
has("if (SH && !(SH.cr && SH.cr[ci])) continue;", '不服务本图的塔吊不画');
has("if (SH && !(SH.crawl && SH.crawl.has(p))) continue;", '履带吊随所吊构件');
has("&& !(SH && !SH.site) ? Math.min(36,", '运输车只在现场图（S-002）画');
has("all = out || (hide && m.id === 'actors')", '隐藏模式近景人员不画');
has("for (const o of YMO) o.visible = !YMH;", '隐藏模式云门墨线范围外不画');
has('if (uScope > 0.5 && abs(step(0.5, aGh) - uGhP) > 0.5) hzP = vec3(0.0, -1e5, 0.0);', '主网格塌掉范围外 / 幽灵网格只留范围外');
has('const on = sc.on && t < TL.OPEN - 12; U.uScope.value = on ? 1 : 0;', '收官（开通前 12 天起）全显');
has('U.uT.value = Math.min(t, TL.OPEN + 0.001); scopeAt(t);', 'setT 更新图纸范围');
has("const ms = modSheet(m), out = on && ms && ms !== SHEET", '分图 3D 模块只在本图或全显时出现');
has('STR.visible = sv && !(U.uScope.value > 0.5);', '提升钢绞线在分图范围启用时不画');
console.log('OK check_linkage runs=' + runs);
