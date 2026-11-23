'use strict';
// S-301 钢绞线加粗模块（web/mods/strands.js）无头检查 · hark-liuzhijie（任务 #10）
// 1 登记 s301-strands（build / update，sheet = S-301）；2 显示窗口与宿主 hzview.js 的 STR 判定式一致（从宿主源码取式子逐日比对）；
// 3 每根上端 = 提升器顶（静止），下端 = HZ.xf(HZ.pose(t)) 吊点，长度 > 0，上端高于下端；4 提升期间下端随位姿上移（屋盖不是自己飘）；
// 5 build / update 用桩 THREE 走一遍：顶点数 = 4 × 根数，窗口外隐藏，opts.clip 平面进 uniform；6 update < 1 ms。
const fs = require('fs'), path = require('path');
const { load } = require('./harness');
const { G, HZ } = load({ extra: ['web/mods/strands.js'] });
HZ.make();
const fail = m => { console.log('FAIL check_strands: ' + m); process.exit(1); };
const M = (G.HZ_MODS || []).find(m => m && m.id === 's301-strands');
if (!M || typeof M.build !== 'function' || typeof M.update !== 'function') fail('未登记 HZ_MODS s301-strands（build / update）');
if (M.sheet !== 'S-301') fail('sheet 应为 S-301');
const K = HZ.K, L = K.rig.strands; if (!L || !L.length) fail('HZ.K.rig.strands 为空');

// 2 窗口与宿主一致
const src = fs.readFileSync(path.join(__dirname, '../../web/hzview.js'), 'utf8');
const hm = /sv = (t >= rig\.start \+ rig\.dur \* [\d.]+ && t < rig\.rm\.start \+ rig\.rm\.dur \* [\d.]+);/.exec(src);
if (!hm) fail('宿主 hzview.js 里找不到 STR 显示判定式（sv = …），宿主改了请同步本模块');
const hostSv = new Function('t', 'rig', 'return ' + hm[1] + ';');
const [w0, w1] = M.window(HZ); let nOn = 0;
for (let t = Math.floor(w0) - 5; t <= Math.ceil(w1) + 5; t += 0.25) { const a = M.visibleAt(HZ, t), b = hostSv(t, K.rig); if (a !== b) fail('t=' + t + ' 显示与宿主不一致（模块 ' + a + '，宿主 ' + b + '）'); if (a) nOn++; }
if (!nOn) fail('显示窗口为空');

// 3 端点
const lt = new Map(HZ.lifters.map(l => [l.x + ',' + l.z, l.top]));
for (let t = w0; t < w1; t += 0.5) {
  const E = M.ends(HZ, t), ps = HZ.pose(t); if (E.length !== L.length) fail('端点数 ' + E.length + ' ≠ 钢绞线数 ' + L.length);
  for (let i = 0; i < L.length; i++) { const e = E[i], s = L[i], b = HZ.xf(ps, s.gb, s.b);
    if ([0, 1, 2].some(k => Math.abs(e[k] - s.a[k]) > 1e-9)) fail('第 ' + i + ' 根上端不在提升器顶');
    if ([0, 1, 2].some(k => Math.abs(e[3 + k] - b[k]) > 1e-9)) fail('第 ' + i + ' 根下端不是当前位姿吊点 t=' + t);
    if (!(e[1] > e[4])) fail('第 ' + i + ' 根上端不高于下端 t=' + t);
    if (!(Math.hypot(e[0] - e[3], e[1] - e[4], e[2] - e[5]) > 0.5)) fail('第 ' + i + ' 根长度过短 t=' + t); }
}
let topsOk = 0; for (const s of L) for (const l of HZ.lifters) if (Math.abs(s.a[1] - l.top) < 1e-9 && Math.hypot(s.a[0] - l.x, s.a[2] - l.z) < 1) { topsOk++; break; }
if (topsOk !== L.length) fail('上端高度 = 提升器顶 的只有 ' + topsOk + '/' + L.length);

// 4 提升期间吊点上移：lift 开始前 vs 结束后，每根下端 y 不降、至少一根升 ≥ 0.5 m
const t0 = Math.max(w0, K.lift1.start - 1), t1 = Math.min(w1 - 0.01, K.head.start + K.head.dur);
const A = M.ends(HZ, t0).map(e => e[4]), B = M.ends(HZ, t1).map(e => e[4]); let up = 0;
for (let i = 0; i < A.length; i++) { if (B[i] < A[i] - 1e-6) fail('第 ' + i + ' 根吊点在提升期间下降'); up = Math.max(up, B[i] - A[i]); }
if (up < 0.5) fail('提升期间吊点最大升高仅 ' + up.toFixed(2) + ' m');

// 5 桩 THREE 走 build / update
const made = {};
const V2 = function (x, y) { this.x = x; this.y = y; this.set = (a, b) => { this.x = a; this.y = b; return this; }; };
const V4 = function (x, y, z, w) { this.v = [x, y, z, w]; this.set = (...a) => { this.v = a; return this; }; };
const T = {
  BufferGeometry: function () { this.attributes = {}; this.setAttribute = (n, a) => { this.attributes[n] = a; }; this.setIndex = i => { this.index = i; }; },
  BufferAttribute: function (a, n) { this.array = a; this.itemSize = n; },
  Color: function (c) { this.c = c; }, Vector2: V2, Vector4: V4, DoubleSide: 2,
  ShaderMaterial: function (o) { Object.assign(this, o); made.mat = this; },
  Mesh: function (g, m) { this.geometry = g; this.material = m; made.mesh = this; },
};
const scene = { kids: [], add(o) { this.kids.push(o); } };
const plane = { normal: { x: -1, y: 0, z: 0 }, constant: 120 };
M.build(scene, HZ, T, { clip: [plane] });
if (scene.kids.length !== 1 || scene.kids[0] !== made.mesh) fail('build 应向场景加 1 个网格');
const g = made.mesh.geometry; if (g.attributes.position.array.length !== L.length * 12) fail('顶点数应为 4 × 根数');
if (g.index.length !== L.length * 6) fail('索引数应为 6 × 根数');
M.update(w0 - 1); if (made.mesh.visible) fail('窗口前应隐藏');
const tm = (w0 + w1) / 2; M.update(tm); if (!made.mesh.visible) fail('窗口内应显示');
const P = g.attributes.position.array, E = M.ends(HZ, tm); for (let i = 0; i < L.length; i++) if (Math.abs(P[i * 12 + 7] - E[i][4]) > 1e-4) fail('第 ' + i + ' 根缓冲下端与端点不符');
made.mesh.onBeforeRender({ getDrawingBufferSize: v => v.set(1258, 540) });
const U = made.mat.uniforms; if (U.uRes.value.x !== 1258 || U.uPl.value.v[3] !== 120 || U.uPl.value.v[0] !== -1) fail('分辨率或剖切平面没进 uniform');
if (!(U.uMin.value >= 2)) fail('最小屏幕宽度应 ≥ 2 px（WebGL 1 px 线看不见是本模块的缘由）');
M.update(w1 + 1); if (made.mesh.visible) fail('窗口后应隐藏');

// 6 耗时
const n = 400, s0 = process.hrtime.bigint(); for (let i = 0; i < n; i++) M.update(w0 + (w1 - w0) * i / n); const ms = Number(process.hrtime.bigint() - s0) / 1e6 / n;
if (ms > 1) fail('update 平均 ' + ms.toFixed(3) + ' ms > 1 ms');
console.log('OK check_strands strands=' + L.length + ' window=' + w0.toFixed(1) + '–' + w1.toFixed(1) + ' maxRise=' + up.toFixed(2) + 'm update=' + ms.toFixed(3) + 'ms');
