'use strict';
// 站台竖向交通模块（web/mods/platform.js）无头检查 · 任务 #42 · fo-changrong
// 1) 已登记 HZ_MODS platform 且有 build/update/layout；2) 桩 THREE 验证 opts.clip 传到材质、不传没有；
// 3) layout 台账：9 座岛台 × 2 组，楼梯/扶梯两端标高 14.5/24，垂梯井顶 ≤ 27.5（不进雨棚层）；
// 4) 不穿柱：对所有组矩形与候车层柱（fxs）、雨棚柱（cxs）、站台层梭形钢柱（±115）做平面距离 ≥ r+0.3；
// 5) 不侵占股道限界：组边到每股道中心 ≥ 半车宽 1.68+0.6；6) 顶端落在楼面（|x|≤95.5，|z|≥14 不进云谷光井）；
// 7) 坡度 = tan30° ± 1%；8) 设施齐全（白线/盲道/座椅/屏/牌）；9) update 200 次平均 < 1.5 ms。
const { load } = require('./harness');
const { G, HZ } = load({ extra: ['web/mods/platform.js'] });
HZ.make();
const fail = m => { console.log('FAIL check_platform: ' + m); process.exit(1); };
const M = (G.HZ_MODS || []).find(m => m.id === 'platform');
if (!M || typeof M.build !== 'function' || typeof M.update !== 'function' || typeof M.layout !== 'function') fail('未登记 HZ_MODS platform（build/update/layout）');
const P = HZ.P, L = M.layout(HZ);
const islands = [];
for (const yk of ['S', 'N']) for (const pl of HZ.platforms(HZ.YARDS[yk])) if (pl.w === 11) islands.push({ yk, pl });
const per = islands.length * 2;
if (L.groups.length !== per * 3 || L.opens.length !== per || L.seats.length !== per * 3 || !L.screens.length || !L.plates.length) fail('台账数量不对: groups=' + L.groups.length + ' opens=' + L.opens.length + ' seats=' + L.seats.length);
if (L.T_ON !== P.OPEN - 10) fail('T_ON 应为 OPEN-10=' + (P.OPEN - 10));
// 障碍物清单：候车层柱/雨棚柱（每站台）＋站台层梭形钢柱（±115）
const obs = [];
const fxs = []; for (let x = -90; x <= 90; x += 20) fxs.push(x);
const cxs = []; for (let x = 133; x <= 220; x += 17.4) cxs.push(x);
for (const { pl } of islands) { for (const x of fxs) obs.push({ x, z: pl.z, r: 0.8 }); for (const s of [-1, 1]) for (const x of cxs) obs.push({ x: s * x, z: pl.z, r: 0.8 }); for (const x of [-115, 115]) if (P.mastZ.includes(pl.z)) obs.push({ x, z: pl.z, r: 0.9 }); }
const tracks = [];
for (const yk of ['S', 'N']) for (const t of HZ.tracks(HZ.YARDS[yk])) tracks.push(t);
const near = (x, a, b) => Math.max(a - x, 0, x - b);   // 点到区间距离
for (const g of L.groups) {
  const { y0, y1, zLo, zHi } = g;
  if (g.kind !== 'lift') { if (Math.abs(y0 - P.platTop) > 0.01 || Math.abs(y1 - P.floorTop) > 0.01) fail(g.kind + ' 两端标高应 14.5/24，得 ' + y0 + '/' + y1); }
  else if (y1 > 27.5) fail('垂梯井顶超雨棚层: ' + y1);
  if (y0 < P.platTop - 0.01) fail('底端低于站台面');
  for (const o of obs) { const d = Math.hypot(near(o.x, g.x0, g.x1), near(o.z, zLo, zHi)); if (d < o.r + 0.3) fail(g.kind + ' 距柱 ' + o.x + ',' + o.z + ' 仅 ' + d.toFixed(2) + ' < ' + (o.r + 0.3)); }
  for (const tz of tracks) { const dz = Math.min(Math.abs(zLo - tz), Math.abs(zHi - tz)); if (dz < 2.28) fail(g.kind + ' z=' + zLo + '..' + zHi + ' 距股道 ' + tz + ' 仅 ' + dz.toFixed(2)); }
  if (g.kind === 'stair') { const k = (y1 - y0) / (g.x1 - g.x0); if (Math.abs(k - Math.tan(Math.PI / 6)) > 0.01 * Math.tan(Math.PI / 6)) fail('楼梯坡度偏 ' + k.toFixed(4)); }
  if (g.y1 >= P.floorTop && (Math.abs(g.x1) > P.floorX + 0.5 || Math.abs(zHi) < P.gap || Math.abs(zHi) > P.floorZ)) fail(g.kind + ' 顶端未落在楼面: x=' + g.x1 + ' z=' + zHi);
}
for (const o of L.opens) if (Math.abs(o.x1 - o.x0) < 1 || Math.abs(o.zHi - o.zLo) < 2.5) fail('开洞太小');
M.build(null, HZ);
let s = 0; const t0 = Date.now();
for (let i = 0; i < 200; i++) M.update(1100, null);
s = Date.now() - t0;
if (s / 200 >= 1.5) fail('update 平均 ' + (s / 200).toFixed(2) + ' ms ≥ 1.5');
// 桩 THREE：clip 透传 + 开通期显隐
{
  const planes = [{ isPlane: 1 }];
  const mk = () => { const made = []; const T = { BufferGeometry: function () { this.setAttribute = () => {}; this.setDrawRange = () => {}; }, BufferAttribute: function () {}, LineBasicMaterial: function (o) { made.push(['L', o]); this.o = o; }, MeshBasicMaterial: function (o) { made.push(['M', o]); this.o = o; }, LineSegments: function () { this.visible = true; this.frustumCulled = false; }, Mesh: function () { this.visible = true; this.position = { set() {} }; }, Group: function () { this.visible = true; this.children = []; this.add = c => this.children.push(c); }, BoxGeometry: function () {}, DynamicDrawUsage: {} }; T.Plane = function () {}; return { T, made }; };
  let made, T, T2;
  ({ T, made } = mk());
  M.build({ add() {} }, HZ, T, { clip: planes });
  if (!made.some(([, o]) => o && o.clippingPlanes === planes)) fail('opts.clip 未透传到材质');
  M.update(P.OPEN - 11, null);
  if (M.obj && M.obj.visible !== false) fail('开通前应隐藏');
  M.update(P.OPEN, null);
  if (M.obj && M.obj.visible !== true) fail('开通后应显示');
  ({ T: T2, made } = mk());
  M.build({ add() {} }, HZ, T2, {});
  if (made.some(([, o]) => o && o.clippingPlanes && o.clippingPlanes.length)) fail('未传 clip 不应带 clippingPlanes');
}
console.log('OK check_platform groups=' + L.groups.length + ' seats=' + L.seats.length + ' update_avg_ms=' + (s / 200).toFixed(3));
