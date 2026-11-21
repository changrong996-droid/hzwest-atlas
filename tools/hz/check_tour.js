'use strict';
// 首屏缓慢开场与穿越导览（web/mods/tour.js）无头检查 · g-wangmushan
// 断言：
// 1. HZ_MODS 登记完整；首轮传送门恰好 2 个
// 2. TOUR_BEATS 全用 <actKey>@<ratio>；图号来自图册登记表 HZA.PAGES（不写死）；前 10 s 停在 S-000；6 拍时间严格单调不减
// 3. 云谷穿行边界读 HZ.P.gap / HZ.P.stX / HZ.K.jigL2.start，全飞行轨 0 穿模、不进地下
// 4. 与宿主同形的 mock（不含 cam/ctl）下，验证 pv.tourHook 未设时不自启；驱动 stepAt 后 setCam 被调用且相机实际位移
// 5. ?noIntro / navigator.webdriver / 深链跳过；4 事件（含 touchstart）1 帧退出
const { load } = require('./harness');
const { G, HZ } = load({ extra: ['web/hzatlas.js', 'web/mods/tour.js'] });
HZ.make();

const fail = m => { console.log('FAIL check_tour: ' + m); process.exit(1); };
const M = (G.HZ_MODS || []).find(m => m.id === 'tour');
if (!M || typeof M.build !== 'function' || typeof M.resolveT !== 'function') fail('未登记 HZ_MODS tour');
if (!G.HZA || !G.HZA.PAGES) fail('未加载图册登记表 HZA.PAGES');

// 图号白名单从图册登记表读取（含 S-000 总图）
const VALID_SHEETS = new Set(['S-000', ...Object.keys(G.HZA.PAGES)]);

// 1. 传送门首轮精简为 2 个
if (!Array.isArray(M.TOUR_PORTALS) || M.TOUR_PORTALS.length !== 2) fail('首轮传送门应恰好 2 个，实为 ' + (M.TOUR_PORTALS && M.TOUR_PORTALS.length));
for (const p of M.TOUR_PORTALS) {
  if (!VALID_SHEETS.has(p.sheet)) fail('传送门图号不在图册登记表：' + p.id + ' ' + p.sheet);
  if (typeof p.at !== 'string' || !/@/.test(p.at)) fail('传送门时刻须用 key@ratio：' + p.id);
  const t = M.resolveT(p.at, HZ);
  if (!Number.isFinite(t) || t < 0 || t > HZ.P.OPEN) fail('传送门时刻越界：' + p.id + ' → ' + t);
}

// 2. 剧本校验：全 key@ratio、时序连续、前 10 s 停在 S-000、6 拍时间严格单调不减
const FORBIDDEN_JARGON = /(HZ\.audit|同步差|净空|S-301|S-000)/;
let prevSec = 0, prevT = -Infinity;
for (const b of M.TOUR_BEATS) {
  if (!Array.isArray(b.sec) || b.sec[0] !== prevSec || b.sec[1] <= b.sec[0]) fail('节拍秒数不连续：' + b.id);
  prevSec = b.sec[1];
  if (!VALID_SHEETS.has(b.sheet)) fail('图号不在图册登记表：' + b.id + ' ' + b.sheet);
  if (b.sec[1] <= 10 && b.sheet !== 'S-000') fail('前 10 s 应停在 S-000 缓慢播放：' + b.id);
  for (const tk of ['t0', 't1']) {
    if (typeof b[tk] !== 'string' || !/@/.test(b[tk])) fail('剧本时刻须用 key@ratio：' + b.id + '.' + tk);
  }
  const vt0 = M.resolveT(b.t0, HZ), vt1 = M.resolveT(b.t1, HZ);
  if (!Number.isFinite(vt0) || !Number.isFinite(vt1) || vt0 < 0 || vt1 > HZ.P.OPEN || vt1 < vt0) {
    fail('剧本时刻越界或倒退：' + b.id + ' ' + vt0 + '→' + vt1);
  }
  if (vt0 < prevT - 1e-6) fail('跨拍时间倒退：' + b.id + ' t0=' + vt0 + ' < 上一拍 t1=' + prevT);
  prevT = vt1;
  if (b.lifter != null && (b.lifter < 0 || b.lifter >= HZ.lifters.length)) fail('吊点索引越界：' + b.id);
  if (!b.caption || FORBIDDEN_JARGON.test(b.caption)) fail('字幕含工程黑话或为空：' + b.id + ' ' + b.caption);
  if (b.caption.includes('206') && !b.caption.includes('32')) fail('提及 206 台千斤顶时须注明 32 组代表点位：' + b.id);
}
if (prevSec !== 60) fail('总时长应为 60 s，实为 ' + prevSec);

// 3. 飞行轨碰撞扫描（边界全读 HZ.P / HZ.K，不写死数字）
const CLOUD_Z_MAX = HZ.P.gap;
const CLOUD_X_MAX = HZ.P.stX - 5;
const JIGL2_START = HZ.K.jigL2.start;
const allParts = [];
for (const a of HZ.acts) {
  for (const p of a.parts || []) {
    if (p && p.bb && p.bb.min && p.bb.max) allParts.push({ key: a.key, bb: p.bb, st: p.st, rm: p.rm });
  }
}
const PAD = 1.2;
let camSamples = 0, collisions = 0;
for (const b of M.TOUR_BEATS) {
  if (!b.cam0 || !b.cam1) continue;
  const t0 = M.resolveT(b.t0, HZ), t1 = M.resolveT(b.t1, HZ);
  const N = b.id === 'cloud-fly' ? 40 : 12;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const t = t0 + (t1 - t0) * f;
    const c = M.sampleCam(b, f);
    camSamples++;
    const [x, y, z] = c.pos;
    if (y < 2.0) fail('相机进入地面以下：' + b.id + ' y=' + y);
    if (b.id === 'cloud-fly' && (Math.abs(z) > CLOUD_Z_MAX || Math.abs(x) > CLOUD_X_MAX || t >= JIGL2_START)) {
      fail('云谷穿行越出安全边界：' + JSON.stringify({ x, y, z, t, CLOUD_Z_MAX, CLOUD_X_MAX, JIGL2_START }));
    }
    for (const p of allParts) {
      const alive = t >= p.st && (!p.rm || p.rm[0] < 0 || t < p.rm[0] + (p.rm[1] || 0));
      if (!alive) continue;
      const mn = p.bb.min, mx = p.bb.max;
      if (x >= mn[0] - PAD && x <= mx[0] + PAD && y >= mn[1] - PAD && y <= mx[1] + PAD && z >= mn[2] - PAD && z <= mx[2] + PAD) {
        collisions++;
        fail(`相机穿模 ${b.id}@${f.toFixed(2)} pos=[${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}] 撞 ${p.key}`);
      }
    }
  }
}

// 4. 启动条件：?noIntro / navigator.webdriver / 深链均不自动启动
if (!M.shouldAutoStart({ search: '', hash: '' }, { webdriver: false })) fail('裸链接首访应自动启动');
if (M.shouldAutoStart({ search: '?noIntro', hash: '' }, { webdriver: false })) fail('?noIntro 不应自动启动');
if (M.shouldAutoStart({ search: '?foo=1&noIntro=1', hash: '' }, { webdriver: false })) fail('带参数的 ?noIntro 不应自动启动');
if (M.shouldAutoStart({ search: '', hash: '' }, { webdriver: true })) fail('navigator.webdriver 不应自动启动');
for (const h of ['#sheet=S-301', '#focus=J23', '#camcfg={"ug":1}']) {
  if (M.shouldAutoStart({ search: '', hash: h }, { webdriver: false })) fail('深链 ' + h + ' 不应自动启动');
}

// 5. 与宿主同形的 mock（不含 cam/ctl）：验证 tourHook 闸门 + 运镜确实移动相机 + 4 事件退出
let setCamCalls = 0, flyCalls = 0;
const camTrace = [];
const mockPv = {
  sheet: 'S-000',
  tourHook: false, // 宿主未开闸前必须保持静默
  st: { t: 0, play: false, auto: true, pref: 'ink' },
  set: t => { mockPv.st.t = t; },
  setSheet: s => { mockPv.sheet = s; },
  setCut: () => {},
  focusCut: () => {},
  focusLifter: () => {},
  opt: o => { if (o.mode) mockPv.st.pref = o.mode; },
  flyTo: (tgt, pos) => { flyCalls++; camTrace.push(pos); },
  setCam: (pos) => { setCamCalls++; camTrace.push(pos.slice()); },
};
G.__pv = mockPv;
M.build(null, HZ, null);
if (M.state.active) fail('pv.tourHook 未设 true 时不应自启');

// 模拟开闸后跑云谷穿行段（10 s → 22 s），断言相机真实移动
mockPv.tourHook = true;
M.start(0);
M.stepAt(11000); // 11 s 进入 cloud-fly
const posStart = camTrace[camTrace.length - 1];
M.stepAt(16000); // 16 s 中段
M.stepAt(21000); // 21 s 末段
const posEnd = camTrace[camTrace.length - 1];
if (setCamCalls < 3 || !posStart || !posEnd) fail('逐帧运镜未调用 pv.setCam');
const dx = Math.hypot(posEnd[0] - posStart[0], posEnd[1] - posStart[1], posEnd[2] - posStart[2]);
if (dx < 200) fail('云谷穿行相机位移不足，实测 dx=' + dx.toFixed(1));
M.stop('done');

// 4 事件（含 touchstart）1 帧退出
for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart']) {
  if (!M.ABORT_EVENTS.includes(ev)) fail('缺少打断事件：' + ev);
  M.start(0);
  if (!M.state.active) fail('start 后应处于 active');
  M.onUserAbort({ type: ev });
  if (M.state.active) fail('事件 ' + ev + ' 后未在 1 帧内退出导览');
}
for (const p of M.TOUR_PORTALS) {
  if (!M.runPortal(p.id)) fail('传送门执行失败：' + p.id);
}

console.log(`OK check_tour beats=${M.TOUR_BEATS.length} cam_samples=${camSamples} collisions=${collisions} cam_dx=${dx.toFixed(1)}m portals=${M.TOUR_PORTALS.length}`);
