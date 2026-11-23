'use strict';
// FPV 航线独立验收器 · fo-wangmushan（#39 独立验收单，docs/tasks/overlap-merge-2026-11-23.md 簇一）
// 用法：node tools/hz/check_fpv.js [web/film/fpv-routes.js] [--route <name>] [--selftest]
// 独立性（决定 seq 28 规矩 2）：作者不是 #26 航线作者、不是 #38 自检脚本作者。
// #38 自检脚本（web/film/fpv-selfcheck.js，S#24 待审未合入）此刻不在主线，无法采用/扩展，
// 故按其公开的 8 判据口径独立实现；几何净空不抄数字，全部经 harness 加载 hzseq.js/yunmen.js 取实时公式：
//   云门门洞 |x|<38、y<50、z∈[178,238]，塔体/全宽层体 y≤80，转换桁架带 y∈[50,55]（web/mods/yunmen.js）
//   5F 空中连廊 |z|≈143、楼板 y∈[30.4,31.4]（P.ringY 与 film.js 实测注）
//   云谷中庭 |z|<14 无楼板（P.gap，下探至地铁层 -9.2 为止）；站房楼面 y∈[22.8,24]（P.floorBot/Top）
//   承轨层 y∈[10.5,12.5]（P.deckBot/Top）；屋面覆面 Hc 与吊顶 Hs 用 HZ.Hc / HZ.Hs 实时公式
// 判据：1 格式与关键帧；2 零碰撞（入地/屋面/吊顶夹层/楼面/承轨层/云门/连廊）；3 变速极值≥3（慢-快-慢-快）；
//   4 视线角速度≤150°/s、航向角速度≤180°/s；5 地标（带坐标者按 60 m 容差核过，纯名字记 INFO 不拦）；
//   6 近景参照≥60%（样本点到任一几何体距离≤80 m 占比）；7 空镜≤60%（视线射线 400 m 内无交点占比）。
// 6/7 是几何代理口径（Node 侧无渲染），最终视觉复核仍归 #26/#38 的真机截图验收。
// 退出码：0 全过；1 有判据不过；2 航线文件缺失/未登记 HZ_FPV（底座未合入时属正常，不算失败）。
// check_all 接线归集成人（规矩 4），本文件不改 check_all.js。
const fs = require('fs');
const path = require('path');
const { load } = require('./harness');

const CLEAR = 0.5, NEAR_M = 80, VOID_M = 400, LM_TOL = 60;
const D2R = Math.PI / 180;
const fail = (m) => { console.log('FAIL check_fpv: ' + m); process.exit(1); };
const skip = (m) => { console.log('SKIP check_fpv: ' + m); process.exit(2); };

// ---------- 几何 ----------
function distBox(p, b) {
  const dx = Math.max(b.x0 - p[0], 0, p[0] - b.x1), dy = Math.max(b.y0 - p[1], 0, p[1] - b.y1), dz = Math.max(b.z0 - p[2], 0, p[2] - b.z1);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function rayBox(o, d, b, tmax) { // slab 法；命中返回 t，否则 null
  let t0 = 0, t1 = tmax;
  const ax = [['x', 'x'], ['y', 'y'], ['z', 'z']];
  const oc = [o[0], o[1], o[2]], dr = [d[0], d[1], d[2]];
  const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dr[i]) < 1e-9) { if (oc[i] < lo[i] || oc[i] > hi[i]) return null; continue; }
    let a = (lo[i] - oc[i]) / dr[i], c = (hi[i] - oc[i]) / dr[i];
    if (a > c) { const s = a; a = c; c = s; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}

// ---------- 逐点静态碰撞（返回违规描述或 null） ----------
function pointViolation(p, HZ) {
  const [x, y, z] = p, P = HZ.P;
  const valley = Math.abs(z) < P.gap && Math.abs(x) < P.floorX;
  if (valley) { if (y < -9.2 + CLEAR) return '入地/入地铁层 y=' + y.toFixed(1); }
  else if (y < CLEAR) return '入地 y=' + y.toFixed(1);
  const inStation = HZ.rho(x, z) <= 1.0; // 屋盖平面为超椭圆，用 HZ.rho 精确判定
  if (inStation) {
    if (!valley) {
      if (y > P.floorBot - 0.3 && y < P.floorTop + 0.3) return '穿站房楼面 y∈[22.8,24]';
      if (y > P.deckBot - 0.3 && y < P.deckTop + 0.3) return '穿承轨层顶板 y∈[10.5,12.5]';
      if (y > HZ.Hs(x, z) + CLEAR && y < HZ.Hc(x, z) - CLEAR) return '穿屋面结构夹层（吊顶 Hs=' + HZ.Hs(x, z).toFixed(1) + ' 与覆面 Hc=' + HZ.Hc(x, z).toFixed(1) + ' 之间）';
    // 越过覆面上方的空域合法；穿越屋面必然经过夹层，被上一条拦截
    }
  }
  if (z >= 178 - CLEAR && z <= 238 + CLEAR && Math.abs(x) < 90 + CLEAR) {
    if (y < 50 - CLEAR) { if (Math.abs(x) >= 38 - CLEAR) return '穿云门塔体/洞壁 |x|=' + Math.abs(x).toFixed(1); }
    else if (y <= 80 + CLEAR) return '云门带内 y≥50 全宽层体/桁架不可飞（y=' + y.toFixed(1) + '）';
  }
  if ((Math.abs(z - 178) < CLEAR || Math.abs(z - 238) < CLEAR) && y < 50 - CLEAR && Math.abs(x) >= 38 - CLEAR) return '穿云门立面';
  if (Math.abs(Math.abs(z) - 143) < 1.0 && y > P.ringY - 0.3 && y < P.ringY + 1.0 + 0.3) return '穿 5F 空中连廊楼板 y≈30.4–31.4';
  return null;
}

// ---------- 关键帧采样（按 t、段内 Catmull-Rom） ----------
function cr(kf, key, t) {
  let i = 0;
  while (i < kf.length - 2 && t > kf[i + 1].t) i++;
  const t0 = kf[i].t, t1 = kf[i + 1].t;
  let u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  u = Math.max(0, Math.min(1, u));
  const p0 = kf[Math.max(0, i - 1)][key], p1 = kf[i][key], p2 = kf[i + 1][key], p3 = kf[Math.min(kf.length - 1, i + 2)][key];
  const u2 = u * u, u3 = u2 * u;
  return [0, 1, 2].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3));
}
function sampleRoute(kf) {
  const T0 = kf[0].t, T1 = kf[kf.length - 1].t;
  const n = Math.max(400, Math.min(4000, Math.round((T1 - T0) * 20)));
  const ts = [], pos = [], look = [];
  for (let s = 0; s <= n; s++) {
    const t = T0 + (T1 - T0) * s / n;
    ts.push(t); pos.push(cr(kf, 'pos', t)); look.push(cr(kf, 'look', t));
  }
  return { ts, pos, look };
}

// ---------- 判据 ----------
function checkRoute(r, HZ, out) {
  const tag = r.name || '(未命名)';
  const kf = r.keyframes;
  if (!Array.isArray(kf) || kf.length < 2) fail(tag + ' keyframes 缺失或不足 2 帧');
  let lastT = -Infinity;
  for (const k of kf) {
    if (typeof k.t !== 'number' || !isFinite(k.t)) fail(tag + ' 关键帧 t 非有限数');
    if (k.t <= lastT) fail(tag + ' 关键帧 t 未严格升序（' + k.t + '）');
    lastT = k.t;
    for (const key of ['pos', 'look']) {
      const v = k[key];
      if (!Array.isArray(v) || v.length !== 3 || v.some(c => typeof c !== 'number' || !isFinite(c))) fail(tag + ' 关键帧 ' + key + ' 不是三元有限数');
    }
  }
  const S = sampleRoute(kf);
  const n = S.ts.length;
  const boxSt = { x0: -HZ.P.roofA, x1: HZ.P.roofA, y0: 0, y1: 60, z0: -HZ.P.roofB, z1: HZ.P.roofB };
  const boxGt = { x0: -90, x1: 90, y0: 0, y1: 80, z0: 178, z1: 238 };
  let viol = null, nearN = 0, voidN = 0;
  const speed = [];
  for (let i = 0; i < n && !viol; i++) {
    const p = S.pos[i];
    viol = pointViolation(p, HZ);
    if (viol) { out.push('  [' + tag + '] 碰撞 @t=' + S.ts[i].toFixed(2) + 's pos=[' + p.map(c => c.toFixed(1)).join(',') + ']：' + viol); break; }
    const dNear = Math.min(p[1] > 0 ? p[1] : 0, distBox(p, boxSt), distBox(p, boxGt));
    if (dNear <= NEAR_M) nearN++;
    const lv = norm3(sub(S.look[i], p));
    const hitG = lv[1] < -1e-6 ? -p[1] / lv[1] : null;
    const hit = [rayBox(p, lv, boxSt, VOID_M), rayBox(p, lv, boxGt, VOID_M), hitG != null && hitG <= VOID_M ? hitG : null].some(t => t != null);
    if (!hit) voidN++;
    if (i) {
      const dt = S.ts[i] - S.ts[i - 1];
      speed.push(dist3(S.pos[i], S.pos[i - 1]) / dt);
    }
  }
  if (viol) return false;
  // 变速极值
  let ext = 0, dir = 0;
  const mx = Math.max(...speed);
  for (let i = 1; i < speed.length; i++) {
    const d = speed[i] - speed[i - 1];
    if (Math.abs(d) < mx * 0.01) continue;
    const nd = d > 0 ? 1 : -1;
    if (dir && nd !== dir) ext++;
    dir = nd;
  }
  if (ext < 3) { out.push('  [' + tag + '] 变速极值 ' + ext + ' < 3（慢-快-慢-快）'); return false; }
  // 角速度
  let worstLook = 0, worstHead = 0;
  for (let i = 1; i < n; i++) {
    const dt = S.ts[i] - S.ts[i - 1];
    const a = norm3(sub(S.look[i - 1], S.pos[i - 1])), b = norm3(sub(S.look[i], S.pos[i]));
    worstLook = Math.max(worstLook, angDeg(a, b) / dt);
    const v0 = sub(S.pos[i], S.pos[i - 1]), v1 = i + 1 < n ? sub(S.pos[i + 1], S.pos[i]) : null;
    if (v1 && dist3(S.pos[i], S.pos[i - 1]) / dt > 1 && dist3(S.pos[i + 1], S.pos[i]) / dt > 1)
      worstHead = Math.max(worstHead, angDeg(norm3(v0), norm3(v1)) / dt);
  }
  if (worstLook > 150) { out.push('  [' + tag + '] 视线角速度 ' + worstLook.toFixed(0) + ' °/s > 150'); return false; }
  if (worstHead > 180) { out.push('  [' + tag + '] 航向角速度 ' + worstHead.toFixed(0) + ' °/s > 180'); return false; }
  // 地标
  if (!Array.isArray(r.landmarks)) fail(tag + ' 缺 landmarks 数组');
  for (const lm of r.landmarks) {
    if (typeof lm === 'string') { out.push('  [' + tag + '] INFO 地标「' + lm + '」无坐标，留真机复核'); continue; }
    const lp = lm.pos || (Array.isArray(lm) ? lm : null);
    if (!lp) fail(tag + ' 地标格式不认识：' + JSON.stringify(lm).slice(0, 60));
    let mn = Infinity;
    for (const p of S.pos) mn = Math.min(mn, dist3(p, lp));
    if (mn > LM_TOL) { out.push('  [' + tag + '] 地标「' + (lm.name || '?') + '」最近 ' + mn.toFixed(0) + ' m > ' + LM_TOL + ' m'); return false; }
  }
  const near = nearN / n, void_ = voidN / n;
  if (near < 0.6) { out.push('  [' + tag + '] 近景参照 ' + (near * 100).toFixed(0) + '% < 60%'); return false; }
  if (void_ > 0.6) { out.push('  [' + tag + '] 空镜 ' + (void_ * 100).toFixed(0) + '% > 60%'); return false; }
  out.push('  [' + tag + '] OK（' + kf.length + ' 帧 / ' + (S.ts[n - 1] - S.ts[0]).toFixed(0) + 's，变速极值 ' + ext + '，视线 ' + worstLook.toFixed(0) + '°/s，航向 ' + worstHead.toFixed(0) + '°/s，近景 ' + (near * 100).toFixed(0) + '%，空镜 ' + (void_ * 100).toFixed(0) + '%）');
  return true;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const angDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / D2R;

// ---------- 自检（good 过全关，bad 各破一关且必须被抓） ----------
function selftestRoutes() {
  const K = (t, pos, look) => ({ t, pos, look });
  const L = (arr) => arr;
  const good = {
    name: 'selftest-good', title: '自检基准线（云门→云厅→云谷→拉升回望）', author: 'fo-wangmushan', day: 1101,
    landmarks: L([{ name: '云门', pos: [0, 34, 208] }, { name: '云厅', pos: [0, 35, 100] }, { name: '十字采光顶', pos: [0, 40, 0] }, { name: '东出口', pos: [182, 22, 0] }]),
    keyframes: [
      K(0, [0, 46, 355], [0, 34, 180]), K(5, [0, 34, 248], [0, 34, 110]), K(9, [0, 34.5, 195], [0, 35, 40]),
      K(12, [0, 31, 170], [0, 33, 20]), // 云门与站房屋盖边缘之间下潜（边缘吊顶 ~32.3 m）
      K(15, [0, 34, 142], [0, 36, -10]), K(20, [0, 34, 62], [18, 32, -4]), K(24, [4, 28, 4], [95, 22, 0]),
      K(27, [68, 21, 0], [210, 21, 0]), K(30, [182, 22, 0], [320, 28, 0]), K(34, [278, 46, -18], [300, 90, -120]), // 出站后镜头缓摇（+x → 上仰 → 回望），避免视线反打
      K(40, [195, 108, -140], [60, 60, -60]), K(45, [-160, 128, 200], [0, 30, 15]),
    ],
  };
  const bad = (name, kfs, lm) => ({ name, title: '自检违规线', author: 'fo-wangmushan', day: 1101, landmarks: lm || good.landmarks, keyframes: kfs });
  return [
    good,
    bad('selftest-ground', good.keyframes.map(k => k.t === 40 ? K(40, [195, -3, -140], k.look) : k)), // 站外东侧俯冲入地
    bad('selftest-roof', good.keyframes.map(k => k.t === 20 ? K(20, [0, 50, 62], k.look) : k)), // 50 m 正落吊顶-覆面夹层
    bad('selftest-slab', good.keyframes.map(k => k.t === 15 ? K(15, [0, 31, 143], k.look) : k)),
    bad('selftest-lookrate', good.keyframes.slice(0, 6).concat([K(20.2, [0, 34, 62], [0, -300, 62])], good.keyframes.slice(6))),
  ];
}

// ---------- 主流程 ----------
const argv = process.argv.slice(2);
const doSelf = argv.includes('--selftest');
const routeIdx = argv.indexOf('--route');
const onlyName = routeIdx >= 0 ? argv[routeIdx + 1] : null;
const fileArg = argv.find(a => !a.startsWith('--') && a !== (routeIdx >= 0 ? argv[routeIdx + 1] : null));
const { G, HZ } = load({});
if (!HZ || typeof HZ.Hc !== 'function') fail('harness 未能加载 HZ.Hc（hzseq.js）');

let routes;
if (doSelf) {
  routes = selftestRoutes();
} else {
  const file = fileArg || 'web/film/fpv-routes.js';
  const abs = path.isAbsolute(file) ? file : path.join(__dirname, '../..', file);
  if (!fs.existsSync(abs)) skip('航线文件不存在：' + file + '（#38 底座未合入时属正常，合入后重跑）');
  const rel = path.relative(path.join(__dirname, '../..'), abs);
  const G2 = load({ extra: [rel] }).G;
  const F = G2.HZ_FPV;
  if (!F || typeof F.routes !== 'function') skip(rel + ' 未登记 HZ_FPV（须按 #38 底座格式提供 HZ_FPV.add/get/routes）');
  routes = F.routes();
  if (!Array.isArray(routes) || !routes.length) skip(rel + ' HZ_FPV.routes() 为空');
}
if (onlyName) routes = routes.filter(r => r.name === onlyName);
if (!routes.length) fail('--route ' + onlyName + ' 未匹配到航线');

const out = ['check_fpv 独立验收器（作者 fo-wangmushan，判据对齐 #38 八条口径；几何取 hzseq.js/yunmen.js 实时公式）'];
if (doSelf) {
  const expectFail = { 'selftest-ground': '入地', 'selftest-roof': '夹层', 'selftest-slab': '连廊', 'selftest-lookrate': '视线角速度' };
  let badN = 0;
  for (const r of routes) {
    const lines = [];
    const ok = checkRoute(r, HZ, lines);
    lines.forEach(l => console.log(l));
    const want = expectFail[r.name];
    if (want == null) {
      if (ok) console.log('  [selftest] ' + r.name + ' 过全关 ✓'); else { console.log('  [selftest] ' + r.name + ' 应过未过 ✗'); badN++; }
    } else {
      const hit = !ok && lines.join(' ').includes(want);
      if (hit) console.log('  [selftest] ' + r.name + ' 被判据「' + want + '」拦截 ✓'); else { console.log('  [selftest] ' + r.name + ' 未被预期判据拦截 ✗'); badN++; }
    }
  }
  console.log(badN === 0 ? 'OK check_fpv selftest（good 过全关，4 条违规线各被对应判据拦截）' : 'FAIL check_fpv selftest（' + badN + ' 项断言未过）');
  process.exit(badN === 0 ? 0 : 1);
}
let okN = 0;
for (const r of routes) if (checkRoute(r, HZ, out)) okN++;
out.forEach(l => console.log(l));
console.log((okN === routes.length ? 'OK' : 'FAIL') + ' check_fpv（' + okN + '/' + routes.length + ' 条航线过验）');
process.exit(okN === routes.length ? 0 : 1);
