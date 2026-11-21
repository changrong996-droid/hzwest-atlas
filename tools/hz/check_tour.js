'use strict';
// 首屏缓慢开场与穿越导览（web/mods/tour.js）无头检查 · g-wangmushan
// 断言：
// 1. HZ_MODS 登记与导出函数完整；首轮传送门恰好 2 个
// 2. TOUR_BEATS 全部使用 <actKey>@<ratio>（无硬编码天数）、key 存在于 HZ.K、时刻合法、吊点索引有效
// 3. 前 10 s 停在 S-000 不切图；字幕不含工程黑话，32 组代表点位口径明确
// 4. 云谷低空穿行段与全部自定义飞行关键帧逐帧采样，实测 0 穿模、不进地下
// 5. ?noIntro / navigator.webdriver / 深链跳过自动开场；4 事件（含 touchstart）1 帧退出
const { load } = require('./harness');
const { G, HZ } = load({ extra: ['web/mods/tour.js'] });
HZ.make();

const fail = m => { console.log('FAIL check_tour: ' + m); process.exit(1); };
const M = (G.HZ_MODS || []).find(m => m.id === 'tour');
if (!M || typeof M.build !== 'function' || typeof M.resolveT !== 'function') fail('未登记 HZ_MODS tour');

// 1. 传送门首轮精简为 2 个
if (!Array.isArray(M.TOUR_PORTALS) || M.TOUR_PORTALS.length !== 2) fail('首轮传送门应恰好 2 个，实为 ' + (M.TOUR_PORTALS && M.TOUR_PORTALS.length));
for (const p of M.TOUR_PORTALS) {
  if (typeof p.at !== 'string' || !/@/.test(p.at)) fail('传送门时刻须用 key@ratio：' + p.id);
  const t = M.resolveT(p.at, HZ);
  if (!Number.isFinite(t) || t < 0 || t > HZ.P.OPEN) fail('传送门时刻越界：' + p.id + ' → ' + t);
}

// 2. 剧本校验：全 key@ratio、时序连续、前 10 s 停在 S-000
const VALID_SHEETS = new Set(['S-000', 'S-001', 'S-002', 'S-101', 'S-201', 'S-251', 'S-301', 'S-401', 'S-501']);
const FORBIDDEN_JARGON = /(HZ\.audit|同步差|净空|S-301|S-000)/;
let prevSec = 0;
for (const b of M.TOUR_BEATS) {
  if (!Array.isArray(b.sec) || b.sec[0] !== prevSec || b.sec[1] <= b.sec[0]) fail('节拍秒数不连续：' + b.id);
  prevSec = b.sec[1];
  if (!VALID_SHEETS.has(b.sheet)) fail('未知图号：' + b.id + ' ' + b.sheet);
  if (b.sec[1] <= 10 && b.sheet !== 'S-000') fail('前 10 s 应停在 S-000 缓慢播放：' + b.id);
  for (const tk of ['t0', 't1']) {
    if (typeof b[tk] !== 'string' || !/@/.test(b[tk])) fail('剧本时刻须用 key@ratio：' + b.id + '.' + tk);
    const v = M.resolveT(b[tk], HZ);
    if (!Number.isFinite(v) || v < 0 || v > HZ.P.OPEN) fail('剧本时刻越界：' + b.id + '.' + tk + ' → ' + v);
  }
  if (b.lifter != null && (b.lifter < 0 || b.lifter >= HZ.lifters.length)) fail('吊点索引越界：' + b.id);
  if (!b.caption || FORBIDDEN_JARGON.test(b.caption)) fail('字幕含工程黑话或为空：' + b.id + ' ' + b.caption);
  if (b.caption.includes('206') && !b.caption.includes('32')) fail('提及 206 台千斤顶时须注明 32 组代表点位：' + b.id);
}
if (prevSec !== 60) fail('总时长应为 60 s，实为 ' + prevSec);

// 3. 飞行轨碰撞扫描（含云谷穿行段）：遍历真实 HZ 构件包围盒，验证 0 穿模、不进地下
const allParts = [];
for (const a of HZ.acts) {
  for (const p of a.parts || []) {
    if (p && p.bb && p.bb.min && p.bb.max) allParts.push({ key: a.key, bb: p.bb, st: p.st, rm: p.rm });
  }
}
const PAD = 1.2; // 相机安全净距（米）
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
    if (b.id === 'cloud-fly' && (Math.abs(z) > 14 || Math.abs(x) > 220 || t >= 604)) {
      fail('云谷穿行越出安全边界：' + JSON.stringify({ x, y, z, t }));
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

// 5. 4 事件拦截（含 touchstart）1 帧内退出
const reqEvents = ['pointerdown', 'wheel', 'keydown', 'touchstart'];
for (const ev of reqEvents) {
  if (!M.ABORT_EVENTS.includes(ev)) fail('缺少打断事件：' + ev);
}
const mockPv = {
  TL: { sheet: 'S-000' },
  st: { t: 0, play: false, auto: true, pref: 'ink' },
  set: t => { mockPv.st.t = t; },
  setSheet: s => { mockPv.TL.sheet = s; },
  setCut: () => {},
  focusCut: () => {},
  focusLifter: () => {},
  opt: o => { if (o.mode) mockPv.st.pref = o.mode; },
  flyTo: () => {},
};
G.__pv = mockPv;
M.build(null, HZ, null);
for (const ev of reqEvents) {
  M.start(0);
  if (!M.state.active) fail('start 后应处于 active');
  M.onUserAbort({ type: ev });
  if (M.state.active) fail('事件 ' + ev + ' 后未在 1 帧内退出导览');
}
// 传送门执行不抛错
for (const p of M.TOUR_PORTALS) {
  if (!M.runPortal(p.id)) fail('传送门执行失败：' + p.id);
}

console.log(`OK check_tour beats=${M.TOUR_BEATS.length} cam_samples=${camSamples} collisions=${collisions} portals=${M.TOUR_PORTALS.length}`);
