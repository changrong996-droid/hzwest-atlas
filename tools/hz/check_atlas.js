'use strict';
// 校验 web/hzatlas.js 登记表与 hzview / hzsheet / hzwest 的一致性及纯函数行为。
// 西站专属断言（如 SHEETS_ALL 页序、别名防误映射）为项目级检查，不属于内核。
// 别名防误映射断言已经指挥官仲裁：卡面数字比较式与 A-301 数据自相矛盾，改为别名必须解析到登记表指定短号。
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { load, makeCtx, sheetCtx } = require('./harness');
const { G, HZ, HZS } = load({ extra: ['web/hzreal.js', 'web/sheets/s101.js', 'web/sheets/s201.js', 'web/sheets/s251.js', 'web/sheets/s401.js', 'web/sheets/s501.js', 'web/hzatlas.js'] });
const HZA = G.HZA;
HZ.make();
const SH = HZS.make(HZ);
const root = path.join(__dirname, '../..');

function fail(msg) { console.log('FAIL check_atlas: ' + msg); process.exit(1); }
function check(msg, fn) { try { fn(); } catch (e) { fail(msg + (e && e.message ? ' (' + e.message.split('\n')[0] + ')' : '')); } }

// 1 页序与 on
check('页序/on 与 hzview.js SHEETS_ALL 不一致', () => {
  const src = fs.readFileSync(path.join(root, 'web/hzview.js'), 'utf8');
  const ex = [...src.matchAll(/\['(S-\d{3})',\s*'[^']*',\s*(\d)\]/g)].map((m) => [m[1], Number(m[2])]);
  assert.strictEqual(JSON.stringify(ex.map((e) => e[0])), JSON.stringify(Object.keys(HZA.PAGES)));
  for (const [id, on] of ex) assert.strictEqual(HZA.PAGES[id].on, on, id + ' on');
});

const keys = Object.keys(HZA.SHEETS);
// 2
for (const k of keys) {
  const s = HZA.SHEETS[k];
  if (s.plugin) {
    const pl = (G.HZ_SHEET_PLUGINS || []).find((p) => p.id === s.plugin);
    if (!pl || typeof pl.draw !== 'function') fail(k + ' 的 plugin ' + s.plugin + ' 在 HZ_SHEET_PLUGINS 中不存在或 draw 非函数');
  } else if (typeof SH[s.fn] !== 'function') {
    fail(k + ' 的 fn 在 SH 中不存在或非函数');
  }
}
// 3
const canv = new Set();
for (const k of keys) {
  const s = HZA.SHEETS[k];
  if (s.no !== HZA.PROJECT + '-' + k) fail(k + ' no 不等于 PROJECT-键');
  if (canv.has(s.canvas)) fail('canvas 重复: ' + s.canvas);
  canv.add(s.canvas);
  if (!Object.prototype.hasOwnProperty.call(HZA.PAGES, s.owner)) fail(k + ' owner 不是 PAGES 的键');
}
// 4
const seen = new Set();
let nal = 0;
for (const k of keys) for (const a of HZA.SHEETS[k].aliases) {
  if (seen.has(a)) fail('别名重复: ' + a);
  seen.add(a); nal++;
  if (HZA.resolve(a) !== k) fail('别名 ' + a + ' 解析为 ' + HZA.resolve(a) + '，应为 ' + k);
}
// 5
for (const p of Object.keys(HZA.PAGES)) for (const id of HZA.PAGES[p].sheets) {
  if (!Object.prototype.hasOwnProperty.call(HZA.SHEETS, id)) fail(p + ' 引用了不存在的图 ' + id);
}
// 6
check('resolve 用例', () => {
  assert.strictEqual(HZA.resolve('HZW-A-501'), 'S-301-2');
  assert.strictEqual(HZA.resolve('HZW-A-301'), 'S-301-3');
  assert.strictEqual(HZA.resolve('HZW-A-101'), 'S-301-4');
  assert.strictEqual(HZA.resolve('A-501'), 'S-301-2');
  assert.strictEqual(HZA.resolve('S-301-3'), 'S-301-3');
  assert.strictEqual(HZA.resolve('HZW-S-301-4'), 'S-301-4');
  assert.strictEqual(HZA.resolve('X'), null);
});
// 7
check('sheetsOf 用例', () => {
  assert.strictEqual(JSON.stringify(HZA.sheetsOf('S-301').map((s) => s.id)), JSON.stringify(['S-301-1', 'S-301-2', 'S-301-3', 'S-301-4']));
  assert.strictEqual(JSON.stringify(HZA.sheetsOf('S-999')), '[]');
});
// 8
const T = HZ.K.lift1.start + 1.5;
for (const [fn, no] of [['section', 'HZW-S-301-3'], ['plan', 'HZW-S-301-4'], ['lift', 'HZW-S-301-2']]) {
  check('wrapFn ' + fn, () => {
    const w = HZA.wrapFn(SH[fn], no);
    w(makeCtx().g, 560, 420, T, sheetCtx());
    const c = sheetCtx();
    w(makeCtx().g, 560, 420, T, c);
    assert.strictEqual(c.seenNo, no);
  });
}
// 9
const html = fs.readFileSync(path.join(root, 'web/hzwest.html'), 'utf8');
if (!html.includes('id="sh-jack"')) fail('hzwest.html 缺少 id="sh-jack"');
if (HZA.SHEETS['S-301-1'].canvas !== 'sh-jack') fail('S-301-1 canvas 不是 sh-jack');

// 10 HZ-04 静态断言
const atlasJs = fs.readFileSync(path.join(root, 'web/hzatlas.js'), 'utf8');
for (const s of ['HZA.mount', 'HZA.setSub', 'hz-subtabs', 'S.SHEETS.push']) {
  if (!atlasJs.includes(s)) fail('hzatlas.js 缺少 ' + s);
}
for (const s of ['S.SHEETS[0] =', 'S.SHEETS.splice', 'S.SHEETS.length = ']) {
  if (atlasJs.includes(s)) fail('hzatlas.js 含禁用写法 ' + s);
}
const atlasHtml = fs.readFileSync(path.join(root, 'web/hzatlas.html'), 'utf8');
for (const s of ["fetch('hzwest.html'", 'hzatlas.js?v=']) {
  if (!atlasHtml.includes(s)) fail('hzatlas.html 缺少 ' + s);
}

// 11 HZ2-01 点图飞镜头断言
check('focusFor 用例', () => {
  assert.strictEqual(typeof HZA.focusFor, 'function');
  assert.strictEqual(HZA.focusFor('S-301-3', 0.5, 2), 'CUT');
  assert.strictEqual(HZA.focusFor('S-301-4', 0.1, 2), 'ZN');
  assert.strictEqual(HZA.focusFor('S-301-4', 0.5, 2), 'ZM');
  assert.strictEqual(HZA.focusFor('S-301-4', 0.9, 2), 'ZS');
  assert.strictEqual(HZA.focusFor('S-301-2', 0.5, 1), 'ZS');
  assert.strictEqual(HZA.focusFor('S-301-2', 0.5, 2), 'ZM');
  assert.strictEqual(HZA.focusFor('S-301-2', 0.5, 3), 'ZN');
  assert.strictEqual(HZA.focusFor('X', 0.5, 2), null);
});
for (const s of ['HZA.focusFor', 'wireFly', 'location.hash = ', 'hz-hint']) {
  if (!atlasJs.includes(s)) fail('hzatlas.js 缺少 ' + s);
}
if (!atlasHtml.includes('hzatlas.js?v=6')) fail('hzatlas.html 缺少 hzatlas.js?v=6');

// 12 HZ2-02 平面图小地图断言
const approx = (a, b, tol = 0.75) => assert.ok(Math.abs(a - b) <= tol, a + ' !≈ ' + b);
const approxPose = (p, e, tol = 1e-6) => {
  assert.ok(p && typeof p === 'object', 'pose 应为对象');
  for (const k of ['camX', 'camZ', 'tgtX', 'tgtZ']) approx(p[k], e[k], tol);
};
check('planMap 用例', () => {
  const pm = HZA.planMap(1000, 700, 22);
  approx(pm.s, 2.4827);
  approx(pm.ox, 72.98);
  approx(pm.oy, 22);
  approx(pm.X(-172), 72.98);
  approx(pm.X(0), 500);
  approx(pm.X(172), 927.02);
  approx(pm.Y(130), 22);
  approx(pm.Y(39), 247.93);
  approx(pm.Y(-130), 667.5);
  assert.ok(pm.X(-110) < pm.X(0) && pm.X(0) < pm.X(110), '北在左');
  assert.ok(pm.Y(100) < pm.Y(0), '东在上');
});
check('planCamPose 用例', () => {
  approxPose(
    HZA.planCamPose({ st: { auto: true, t: 0 }, camKey: () => ({ az: 0, el: 0, d: 100, tx: 10, ty: 0, tz: 20 }) }),
    { camX: 10, camZ: -80, tgtX: 10, tgtZ: 20 }
  );
  approxPose(
    HZA.planCamPose({ st: { auto: false, t: 0 }, focusHash: 'cut', cutShot: { pos: { x: 1, y: 2, z: 3 }, tgt: { x: 39, y: 5, z: 0 } }, camKey: () => null }),
    { camX: 1, camZ: 3, tgtX: 39, tgtZ: 0 }
  );
  approxPose(
    HZA.planCamPose({ st: { auto: false, t: 0 }, focusHash: 'J05', focusShot: { i: 4, pos: { x: 7, y: 8, z: 9 }, tgt: { x: 11, y: 0, z: 12 } }, camKey: () => null }),
    { camX: 7, camZ: 9, tgtX: 11, tgtZ: 12 }
  );
  approxPose(
    HZA.planCamPose({ st: { auto: false, t: 0 }, focusHash: 'J05', focusShot: { i: 7, pos: { x: 0, y: 0, z: 0 }, tgt: { x: 0, y: 0, z: 0 } }, shotFor: (i) => ({ i, pos: { x: i, y: 0, z: i }, tgt: { x: 0, y: 0, z: 0 } }), camKey: () => null }),
    { camX: 4, camZ: 4, tgtX: 0, tgtZ: 0 }
  );
  approxPose(
    HZA.planCamPose({ st: { auto: false, t: 0 }, focusHash: 'ZN', camKey: () => ({ az: 90, el: 0, d: 50, tx: 0, ty: 0, tz: 0 }) }),
    { camX: 50, camZ: 0, tgtX: 0, tgtZ: 0 }
  );
  assert.strictEqual(HZA.planCamPose(null), null);
  assert.strictEqual(HZA.planCamPose({}), null);
});
for (const s of ['HZA.planMap', 'HZA.planCamPose']) {
  if (!atlasJs.includes(s)) fail('hzatlas.js 缺少 ' + s);
}
if (!atlasHtml.includes('hzatlas.js?v=6')) fail('hzatlas.html 缺少 hzatlas.js?v=6');

// 13 接新图断言
check('接新图断言', () => {
  assert.strictEqual(JSON.stringify(HZA.sheetsOf('S-101').map((s) => s.id)), JSON.stringify(['S-101-1']));
  assert.strictEqual(JSON.stringify(HZA.sheetsOf('S-201').map((s) => s.id)), JSON.stringify(['S-201-1']));
  assert.strictEqual(JSON.stringify(HZA.sheetsOf('S-401').map((s) => s.id)), JSON.stringify(['S-401-1']));
  assert.strictEqual(JSON.stringify(HZA.sheetsOf('S-501').map((s) => s.id)), JSON.stringify(['S-501-1']));
  assert.strictEqual(HZA.resolve('HZW-S-101-1'), 'S-101-1');
  assert.strictEqual(HZA.resolve('S-501-1'), 'S-501-1');
  assert.strictEqual(JSON.stringify(HZA.sheetsOf('S-251').map((s) => s.id)), JSON.stringify(['S-251-1']));
  assert.strictEqual(HZA.resolve('HZW-S-251-1'), 'S-251-1');
  assert.strictEqual(HZA.FORMS['S-251'].sheet.status, '有');
  assert.strictEqual(HZA.FORMS['S-501'].sheet.status, '有');
  assert.strictEqual(HZA.FORMS['S-101'].sheet.status, '有');
});

console.log('OK check_atlas pages=' + Object.keys(HZA.PAGES).length + ' sheets=' + keys.length + ' aliases=' + nal);
