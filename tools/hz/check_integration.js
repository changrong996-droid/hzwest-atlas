'use strict';
// 全模块同屏联合冒烟检查（任务 #46）· g-liuzhijie
// 目的：弥补单模块各自 check_*.js 无法发现「多模块同屏共存互踩 / 联合 pick 抛错 / 合计耗时叠加」的盲区。
// 1) 按 web/hzwest.html 真实 <script> 顺序一次性加载全部 core/sheets/mods 与 web/mods/ctx/layers.json 图层；
// 2) 检查 HZ_MODS 无重复 id、HZ_SHEET_PLUGINS 无重复 id、hzwest.html 引用的本地脚本全部存在；
// 3) 用桩 THREE + 桩 scene + 桩 DOM 联合执行全部模块的 build(scene, HZ, THREE, { clip:[plane] })；
// 4) 在 6 个高冲突联合时刻（180 / 385 / 640 / 750 / 1101 / 1115）对全部模块依次 update(t, cam)，断言 0 抛错、合计平均耗时 < 10 ms；
// 5) 在 S-201 / S-401 / S-501 真实构件上跑一遍全模块联合 pick → update → unpick 闭环（覆盖 info + loadpath + whatif 共存）；
// 6) 输出已入库但尚未挂载到 hzwest.html 的 web/mods/*.js 清单（INFO，供集成人集中接线参考）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load } = require('./harness');

const ROOT_DIR = path.join(__dirname, '../..');
const fail = m => { console.log('FAIL check_integration: ' + m); process.exit(1); };

// 1. 解析 web/hzwest.html 中的本地 <script src="..."> 真实加载顺序
const html = fs.readFileSync(path.join(ROOT_DIR, 'web/hzwest.html'), 'utf8');
const rawScripts = [];
for (const m of html.matchAll(/<script\s+[^>]*src="([^"]+)"/g)) {
  const src = m[1].split('?')[0];
  if (/^https?:\/\//.test(src)) continue;
  rawScripts.push(src);
}
if (!rawScripts.length) fail('未从 web/hzwest.html 解析到任何本地脚本');

// 确认引用文件全部存在，并筛出可在 Node 沙箱联合加载的模块（跳过 harness 已加载的 seq/hzseq/hzsheet 与纯渲染器 fx/look/hzview）
const SKIP = new Set(['core/seq.js', 'hzseq.js', 'hzsheet.js', 'fx.js', 'look.js', 'hzview.js']);
const extraFiles = [];
const mountedMods = new Set();
for (const rel of rawScripts) {
  const full = path.join(ROOT_DIR, 'web', rel);
  if (!fs.existsSync(full)) fail('web/hzwest.html 引用文件不存在：web/' + rel);
  if (rel.startsWith('mods/') && !rel.includes('/', 5)) mountedMods.add(rel.slice(5));
  if (!SKIP.has(rel)) extraFiles.push('web/' + rel);
}

// 附加 web/mods/ctx/layers.json 登记的全部远景图层
const ctxDir = path.join(ROOT_DIR, 'web/mods/ctx');
let ctxCount = 0;
if (fs.existsSync(path.join(ctxDir, 'layers.json'))) {
  const man = JSON.parse(fs.readFileSync(path.join(ctxDir, 'layers.json'), 'utf8'));
  for (const e of (man.layers || [])) {
    const cf = 'web/mods/ctx/' + e.file;
    if (!fs.existsSync(path.join(ROOT_DIR, cf))) fail('layers.json 登记文件不存在：' + cf);
    extraFiles.push(cf);
    ctxCount++;
  }
}

// 盘点 web/mods/ 下已入库但尚未挂载到 hzwest.html 的模块（仅 INFO，不拦）
const unmounted = fs.readdirSync(path.join(ROOT_DIR, 'web/mods'))
  .filter(f => f.endsWith('.js') && !mountedMods.has(f) && f !== 'infobar.js')
  .sort();

// 2. 在单一沙箱内先初始化基础内核与桩 DOM，再按 hzwest.html 真实顺序一次性加载全部模块
const { G, HZ } = load({});
HZ.make();

// 提供轻量桩 DOM / 定时器 / WebGL 环境（不干扰 Node 执行，覆盖 webgl-fallback / info / tour / osmctx / loadpath / whatif）
function mkEl(tag) {
  const el = {
    tagName: String(tag || 'DIV').toUpperCase(),
    id: '', className: '', innerHTML: '', textContent: '', title: '',
    style: { cssText: '', display: '' },
    children: [], parentNode: null,
    clientWidth: 1440, clientHeight: 900,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { if (f == null) f = !this._s.has(c); f ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k] || null; },
    addEventListener() {}, removeEventListener() {},
    appendChild(ch) { if (ch) { ch.parentNode = this; this.children.push(ch); } return ch; },
    removeChild(ch) { const i = this.children.indexOf(ch); if (i >= 0) this.children.splice(i, 1); if (ch) ch.parentNode = null; return ch; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30 }; },
  };
  return el;
}
const modUi = mkEl('div'); modUi.id = 'mod-ui';
const headEl = mkEl('head');
const bodyEl = mkEl('body'); bodyEl.appendChild(modUi);
const byId = { 'mod-ui': modUi, v3: bodyEl, gl: mkEl('canvas') };
G.document = {
  head: headEl, body: bodyEl,
  createElement: mkEl,
  createTextNode: t => ({ nodeType: 3, textContent: String(t || '') }),
  getElementById: id => byId[id] || null,
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
};
G.setTimeout = () => 1;
G.clearTimeout = () => {};
G.requestAnimationFrame = () => 1;
G.cancelAnimationFrame = () => {};
G.location = { search: '?noIntro', hash: '', reload() {} };
G.navigator = { webdriver: true };
G.addEventListener = () => {};
G.removeEventListener = () => {};
// 模拟支持 WebGL2 以便 webgl-fallback 走静默路径，同时支持 createElement("canvas").getContext("2d")
const _origMkEl = G.document.createElement;
G.document.createElement = function (tag) {
  const el = _origMkEl(tag);
  if (String(tag).toLowerCase() === 'canvas') {
    el.getContext = kind => kind === 'webgl2'
      ? { getExtension: n => n === 'WEBGL_lose_context' ? { loseContext() {} } : null }
      : { clearRect() {}, fillRect() {}, fillText() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, save() {}, restore() {}, measureText: t => ({ width: String(t || '').length * 7 }) };
  }
  return el;
};

for (const rel of extraFiles) {
  const full = path.join(ROOT_DIR, rel);
  try {
    vm.runInContext(fs.readFileSync(full, 'utf8'), G, { filename: full });
  } catch (e) {
    fail(`联合加载失败（${rel}）：${e && e.message || e}`);
  }
}

// 校验插件与模块 id 唯一
const mods = G.HZ_MODS || [];
const modIds = new Set();
for (const m of mods) {
  if (!m || !m.id) fail('存在无 id 的 HZ_MODS 条目');
  if (modIds.has(m.id)) fail('HZ_MODS 存在重复 id：' + m.id);
  modIds.add(m.id);
}
const plugins = G.HZ_SHEET_PLUGINS || [];
const plMap = {};
for (const pl of plugins) {
  if (!pl || !pl.id) fail('存在无 id 的 HZ_SHEET_PLUGINS 条目');
  if (plMap[pl.id]) fail('HZ_SHEET_PLUGINS 存在重复 id：' + pl.id);
  plMap[pl.id] = pl;
}

// 3. 轻量桩 THREE（覆盖 Mesh / InstancedMesh / LineSegments / Sprite / Extrude / Shape / Edges / Color / Vector / Matrix）
function mkVec3(x, y, z) {
  if (!(this instanceof mkVec3)) return new mkVec3(x, y, z);
  this.x = x || 0; this.y = y || 0; this.z = z || 0;
  this.set = (a, b, c) => { this.x = a; this.y = b; this.z = c; return this; };
  this.copy = (v) => { this.x = v.x; this.y = v.y; this.z = v.z; return this; };
  this.clone = () => new mkVec3(this.x, this.y, this.z);
  this.add = (v) => { this.x += v.x; this.y += v.y; this.z += v.z; return this; };
  this.sub = (v) => { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; };
  this.subVectors = (a, b) => { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; };
  this.multiplyScalar = (s) => { this.x *= s; this.y *= s; this.z *= s; return this; };
  this.length = () => Math.hypot(this.x, this.y, this.z);
  this.distanceTo = (v) => Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
  this.normalize = () => { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; };
  this.project = () => { this.x = 0; this.y = 0; this.z = 0.5; return this; };
  this.applyMatrix4 = () => this;
}
function mkVec4(x, y, z, w) {
  if (!(this instanceof mkVec4)) return new mkVec4(x, y, z, w);
  this.x = x || 0; this.y = y || 0; this.z = z || 0; this.w = w || 0;
  this.set = (a, b, c, d) => { this.x = a; this.y = b; this.z = c; this.w = d; return this; };
  this.copy = (v) => { this.x = v.x; this.y = v.y; this.z = v.z; this.w = v.w; return this; };
  this.clone = () => new mkVec4(this.x, this.y, this.z, this.w);
}
function mkMat4() {
  return {
    elements: new Float32Array(16),
    identity() { return this; },
    set() { return this; },
    makeRotationX() { return this; },
    compose() { return this; },
    makeTranslation() { return this; },
    makeScale() { return this; },
    makeRotationY() { return this; },
    makeRotationZ() { return this; },
    multiply() { return this; },
    copy() { return this; },
    setPosition() { return this; },
  };
}
function mkGeo() {
  return {
    attributes: { position: { array: new Float32Array(0), needsUpdate: false }, normal: { array: new Float32Array(0) } },
    setAttribute(k, v) { this.attributes[k] = v; return this; },
    setIndex(v) { this.index = v; return this; },
    setDrawRange() {},
    computeVertexNormals() {}, computeBoundingSphere() {}, computeLineDistances() {},
    translate() { return this; }, rotateX() { return this; }, rotateY() { return this; }, rotateZ() { return this; }, scale() { return this; },
    toNonIndexed() { return this; }, clone() { return mkGeo(); }, dispose() {},
  };
}
function mkObj() {
  return {
    name: '', visible: true, renderOrder: 0, frustumCulled: true, userData: {},
    position: mkVec3(), rotation: mkVec3(), scale: mkVec3(1, 1, 1),
    children: [],
    add(...a) { for (const x of a) if (x) this.children.push(x); return this; },
    remove(x) { const i = this.children.indexOf(x); if (i >= 0) this.children.splice(i, 1); },
    traverse(fn) { fn(this); for (const c of this.children) if (c && c.traverse) c.traverse(fn); },
  };
}
const THREE = {
  DoubleSide: 2, FrontSide: 0, BackSide: 1, DynamicDrawUsage: 35048, SRGBColorSpace: 'srgb',
  Vector2: function (x, y) { this.x = x || 0; this.y = y || 0; },
  Vector3: function (x, y, z) { return mkVec3(x, y, z); },
  Vector4: function (x, y, z, w) { return mkVec4(x, y, z, w); },
  Quaternion: function () { this.setFromAxisAngle = () => this; this.setFromEuler = () => this; this.setFromUnitVectors = () => this; this.identity = () => this; },
  Euler: function () { this.set = () => this; },
  Matrix4: function () { return mkMat4(); },
  Color: function () {
    this.r = 0; this.g = 0; this.b = 0;
    this.set = () => this; this.setHex = () => this; this.setRGB = () => this;
    this.copy = () => this; this.lerp = () => this; this.getHex = () => 0;
  },
  BufferGeometry: function () { return mkGeo(); },
  BoxGeometry: function () { return mkGeo(); },
  CylinderGeometry: function () { return mkGeo(); },
  SphereGeometry: function () { return mkGeo(); },
  PlaneGeometry: function () { return mkGeo(); },
  ConeGeometry: function () { return mkGeo(); },
  CircleGeometry: function () { return mkGeo(); },
  Shape: function () {},
  ShapeGeometry: function () { return mkGeo(); },
  ExtrudeGeometry: function () { return mkGeo(); },
  EdgesGeometry: function () { return mkGeo(); },
  BufferAttribute: function (arr, itemSize) { this.array = arr; this.itemSize = itemSize; this.needsUpdate = false; this.setUsage = () => this; },
  Float32BufferAttribute: function (arr, itemSize) { this.array = new Float32Array(arr); this.itemSize = itemSize; this.needsUpdate = false; },
  InstancedBufferAttribute: function (arr, itemSize) { this.array = arr; this.itemSize = itemSize; this.needsUpdate = false; },
  MeshBasicMaterial: function (o) { Object.assign(this, o); this.dispose = () => {}; },
  MeshStandardMaterial: function (o) { Object.assign(this, o); this.dispose = () => {}; },
  MeshLambertMaterial: function (o) { Object.assign(this, o); this.dispose = () => {}; },
  LineBasicMaterial: function (o) { Object.assign(this, o); this.dispose = () => {}; },
  LineDashedMaterial: function (o) { Object.assign(this, o); this.dispose = () => {}; },
  ShaderMaterial: function (o) { Object.assign(this, o); this.dispose = () => {}; },
  SpriteMaterial: function (o) { Object.assign(this, o); this.dispose = () => {}; },
  PointsMaterial: function (o) { Object.assign(this, o); this.dispose = () => {}; },
  CanvasTexture: function () { this.dispose = () => {}; },
  Group: function () { return mkObj(); },
  Object3D: function () { return mkObj(); },
  Mesh: function (g, m) { return Object.assign(mkObj(), { geometry: g || mkGeo(), material: m || {} }); },
  LineSegments: function (g, m) { return Object.assign(mkObj(), { geometry: g || mkGeo(), material: m || {}, computeLineDistances() {} }); },
  Line: function (g, m) { return Object.assign(mkObj(), { geometry: g || mkGeo(), material: m || {}, computeLineDistances() {} }); },
  Sprite: function (m) { return Object.assign(mkObj(), { material: m || {} }); },
  Points: function (g, m) { return Object.assign(mkObj(), { geometry: g || mkGeo(), material: m || {} }); },
  InstancedMesh: function (g, m, n) {
    return Object.assign(mkObj(), {
      geometry: g || mkGeo(), material: m || {}, count: n || 0,
      instanceMatrix: { array: new Float32Array((n || 0) * 16), needsUpdate: false },
      instanceColor: { array: new Float32Array((n || 0) * 3), needsUpdate: false },
      setMatrixAt() {}, setColorAt() {},
    });
  },
};

const scene = mkObj();
const clipPlane = { normal: mkVec3(1, 0, 0), constant: -39 };
const cam = { position: mkVec3(180, 95, 220) };
G.__pv = {
  sheet: 'S-000', blend: 0, st: { t: 0, play: false, auto: true },
  set() {}, setSheet(s) { this.sheet = s; }, setCut() {}, focusCut() {}, focusLifter() {}, opt() {}, flyTo() {}, setCam() {},
};

// 4. 联合 build
for (const m of mods) {
  if (typeof m.build !== 'function') continue;
  try {
    m.build(scene, HZ, THREE, { clip: [clipPlane] });
  } catch (e) {
    fail(`联合 build 失败（模块 ${m.id}）：${e && e.stack ? e.stack.split('\n')[0] : e}`);
  }
}

// 5. 6 个高冲突联合时刻全模块 update + 总耗时统计
const SHOTS = [
  { sheet: 'S-101', t: 180, blend: 0 },
  { sheet: 'S-201', t: 385, blend: 0 },
  { sheet: 'S-301', t: 640, blend: 0 },
  { sheet: 'S-401', t: 750, blend: 0 },
  { sheet: 'S-501', t: 1101, blend: 0.85 },
  { sheet: 'S-000', t: 1115, blend: 1.0 },
];
// 预热 1 轮避免首帧懒编译抖动计入稳态平均
for (const sh of SHOTS) {
  G.__pv.sheet = sh.sheet; G.__pv.blend = sh.blend; G.__pv.st.t = sh.t;
  for (const m of mods) {
    if (typeof m.update !== 'function') continue;
    try { m.update(sh.t, cam); }
    catch (e) { fail(`联合 update 失败（模块 ${m.id} @ t=${sh.t} ${sh.sheet}）：${e && e.message || e}`); }
  }
}
const ROUNDS = 10;
const t0 = process.hrtime.bigint();
for (let r = 0; r < ROUNDS; r++) {
  for (const sh of SHOTS) {
    G.__pv.sheet = sh.sheet; G.__pv.blend = sh.blend; G.__pv.st.t = sh.t;
    for (const m of mods) if (typeof m.update === 'function') m.update(sh.t, cam);
  }
}
const avgFrameMs = Number(process.hrtime.bigint() - t0) / 1e6 / (ROUNDS * SHOTS.length);
if (avgFrameMs >= 10.0) fail(`全模块联合单帧平均耗时过高：${avgFrameMs.toFixed(2)} ms（上限 10 ms）`);

// 6. 联合 pick → update → unpick 交互闭环（覆盖 info + loadpath + whatif 共存）
const PICK_CASES = [
  { sheet: 'S-201', id: 'D-S05', t: 800 },
  { sheet: 'S-401', id: 'CL-ZS-E', t: 750 },
  { sheet: 'S-501', id: 'YM', t: 1101 },
];
let pickRuns = 0;
for (const c of PICK_CASES) {
  const pl = plMap[c.sheet];
  if (!pl || typeof pl.parts !== 'function') continue;
  const part = (pl.parts(c.t) || []).find(p => String(p.id) === c.id);
  if (!part) continue;
  const rel = typeof HZ.rel === 'function' ? HZ.rel(c.sheet, c.id, c.t) : null;
  const ctx = { sheet: c.sheet, t: c.t, src: '3d', root: modUi, pv: G.__pv, rel, set() {}, select() {}, clear() {} };
  G.__pv.sheet = c.sheet; G.__pv.st.t = c.t;
  for (const m of mods) {
    if (typeof m.pick !== 'function') continue;
    try { m.pick(part, { x: 420, y: 260 }, ctx); }
    catch (e) { fail(`联合 pick 失败（模块 ${m.id} @ ${c.sheet}:${c.id}）：${e && e.message || e}`); }
  }
  for (const m of mods) {
    if (typeof m.update !== 'function') continue;
    try { m.update(c.t + 0.5, cam); }
    catch (e) { fail(`pick 后联合 update 失败（模块 ${m.id}）：${e && e.message || e}`); }
  }
  for (const m of mods) {
    if (typeof m.unpick !== 'function') continue;
    try { m.unpick(); }
    catch (e) { fail(`联合 unpick 失败（模块 ${m.id}）：${e && e.message || e}`); }
  }
  pickRuns++;
}
if (pickRuns < 2) fail('联合 pick 有效用例不足：' + pickRuns);

if (unmounted.length) {
  console.log('INFO check_integration 已入库尚未挂载到 hzwest.html 的模块：' + unmounted.join(', '));
}
console.log(`OK check_integration mods=${mods.length}(${mods.map(m => m.id).join(',')}) plugins=${plugins.length} ctx_layers=${ctxCount} shots=${SHOTS.length} picks=${pickRuns} avg_frame=${avgFrameMs.toFixed(3)}ms`);
