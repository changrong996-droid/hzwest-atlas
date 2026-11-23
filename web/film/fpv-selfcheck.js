'use strict';
// F2 穿越机航线开发自检（任务 #38 底座，hark-liuzhijie）——开发自用；独立验收器 tools/hz/check_fpv.js 归 #39，不在这里。
// 用法：web/film/index.html#fpvcheck=1（查全部航线）或 #fpvcheck=<name>（只查一条）。film.js 见到 fpvcheck 才加载本文件。
// 结果：window.__fpvReport（数组，每条航线一项）；控制台打印一行 `FPVCHECK {json}`；页面右上角出角标（OK / FAIL）。
//
// 判据（每条航线按 0.02 秒取样，3D 工期日随航线走 route.day）：
//   1 穿模：用宿主自己的碰撞盒 __pv.solidAt(x, y, z, 留量)（站房楼板、柱、墙、云门、站台、雨棚……与镜头防撞同一套数据），
//     留量 MARGIN = 1.0 m；任何取样点命中即 FAIL（报秒数、坐标、命中构件材质与包围盒）。
//   2 穿屋面：屋盖网架不在碰撞盒里（宿主只拿它做遮盖判定），另按屋盖下表面 HZ.Hs 与上表面 HZ.Hc 判：
//     在屋盖投影内（HZ.rho ≤ 1）且 Hs − 留量 < y < Hc + 留量 即 FAIL。
//   3 入地：y < 留量 且不在已开挖的地下空间（同 solidAt 的 'ground'）即 FAIL。
//   4 变速：按 0.1 秒算速度，内部速度极值（峰与谷，显著度 ≥ 最高速 15 %）不少于 3 个，否则 FAIL（没有「慢-快-慢-快」）。
//   5 平顺：视线方向角速度 ≤ 150°/秒，速度 > 3 m/s 时航向角速度 ≤ 180°/秒，超过即 FAIL（急折会晕）。
//   6 地标：route.landmarks 每项航线最近距离 ≤ r，否则 FAIL。
//   7 近景参照：穿越机的速度感和尺度感全靠身边掠过的东西（柱、楼板沿、连廊栏杆、站台、列车）。按 0.1 秒取样，
//     在宿主镜头视锥（竖直 28°、16:9）内打 8×5 条视线，命中实体 / 屋盖 / 地面的距离取第 25 百分位为「近景距离」；
//     近景距离 ≤ 30 m 的时间须占全程 ≥ 60 %，否则 FAIL（镜头离什么都远，看不出多大多快）。
//   8 空镜：同一组视线里没命中、或命中在 300 m 以外的算「空」；任一取样空视线 > 60 % 即 FAIL（只有天和远处地面的画面）。
//     收尾回望（末 2 秒）豁免第 8 条。
//   附带报告（不判）：最小净距档（1/2/4/8 m 留量下首个命中前的最大档）、最高速、最大加速度、时长。
(function () {
  const MARGIN = 1.0, DT = 0.02, DTV = 0.1, MAX_LOOK = 150, MAX_HEAD = 180;
  const FOV = 28, ASP = 16 / 9, NX = 8, NY = 5, NEAR_D = 30, NEAR_SHARE = 0.6, FAR_D = 300, EMPTY_MAX = 0.6, END_FREE = 2;
  const deg = r => r * 180 / Math.PI;
  const ang = (a, b) => { const la = Math.hypot(...a), lb = Math.hypot(...b); if (la < 1e-9 || lb < 1e-9) return 0; return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / la / lb))); };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const r1 = v => Math.round(v * 10) / 10;

  function hitAt(PV, HZ, p, m) {
    const e = PV.solidAt(p[0], p[1], p[2], m);
    if (e) return e === 'ground' ? { kind: '入地' } : { kind: '穿模', what: typeof e === 'string' ? e : ((e.p && e.p.geo && e.p.geo.mat) || '构件') + ' ' + JSON.stringify(e.b.min.map(Math.round)) + '–' + JSON.stringify(e.b.max.map(Math.round)) };
    if (HZ.rho(p[0], p[2]) <= 1) { const lo = HZ.Hs(p[0], p[2]), hi = HZ.Hc(p[0], p[2]); if (p[1] > lo - m && p[1] < hi + m) return { kind: '穿屋面', what: '屋盖 ' + r1(lo) + '–' + r1(hi) + ' m' }; }
    return null;
  }

  // 视锥采样：返回 { near: 第 25 百分位命中距离, empty: 空视线比例 }
  function viewProbe(PV, HZ, c, look) {
    const f = sub(look, c), lf = Math.hypot(...f); f[0] /= lf; f[1] /= lf; f[2] /= lf;
    let r = [f[2], 0, -f[0]]; const lr = Math.hypot(...r); if (lr < 1e-6) r = [1, 0, 0]; else r = r.map(v => v / lr);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const th = Math.tan(FOV * Math.PI / 360), ta = th * ASP, hits = []; let empty = 0;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      const a = ((i + 0.5) / NX * 2 - 1) * ta, b = ((j + 0.5) / NY * 2 - 1) * th;
      const d = [f[0] + r[0] * a + u[0] * b, f[1] + r[1] * a + u[1] * b, f[2] + r[2] * a + u[2] * b], L = Math.hypot(...d);
      let hit = -1;
      for (let s = 0.5; s < FAR_D; s += Math.max(0.5, s * 0.03)) {
        const x = c[0] + d[0] / L * s, y = c[1] + d[1] / L * s, z = c[2] + d[2] / L * s;
        if (y < 0 || PV.solidAt(x, y, z, 0)) { hit = s; break; }
        if (HZ.rho(x, z) <= 1 && y > HZ.Hs(x, z) && y < HZ.Hc(x, z)) { hit = s; break; }
      }
      if (hit < 0) empty++; else hits.push(hit);
    }
    hits.sort((p, q) => p - q);
    return { near: hits.length ? hits[Math.floor((hits.length - 1) * 0.25)] : Infinity, empty: empty / (NX * NY) };
  }

  function checkRoute(PV, HZ, FPV, r) {
    const fails = [], T = FPV.dur(r);
    const fe = FPV.check(r); if (fe.length) return { name: r.name, ok: false, fails: fe.map(x => '格式：' + x) };
    let lastDay = -1, firstHit = null, clear = 8;
    const LM = (r.landmarks || []).map(l => ({ l, d: Infinity }));
    for (let t = 0; t <= T + 1e-9; t += DT) {
      const day = FPV.day(r, t); if (Math.abs(day - lastDay) > 0.5) { PV.set(day); lastDay = day; }
      const p = FPV.sample(r, t).pos;
      for (const x of LM) x.d = Math.min(x.d, Math.hypot(p[0] - x.l.pos[0], p[1] - x.l.pos[1], p[2] - x.l.pos[2]));
      const h = hitAt(PV, HZ, p, MARGIN);
      if (h) { if (!firstHit) firstHit = { t: r1(t * 10) / 10, p: p.map(r1), ...h }; clear = 0; continue; }
      for (const m of [8, 4, 2]) { if (m > clear) continue; if (!hitAt(PV, HZ, p, m)) break; clear = m / 2; }
    }
    if (firstHit) fails.push(firstHit.kind + '：t=' + firstHit.t.toFixed(2) + ' 秒 @ [' + firstHit.p.join(', ') + ']' + (firstHit.what ? ' · ' + firstHit.what : ''));
    // 速度、加速度、转角
    const S = [], P = [], D = [];
    for (let t = 0; t <= T + 1e-9; t += DTV) { const q = FPV.sample(r, t); P.push(q.pos); D.push(sub(q.look, q.pos)); }
    for (let i = 1; i < P.length; i++) S.push(Math.hypot(...sub(P[i], P[i - 1])) / DTV);
    const vmax = Math.max(...S); let amax = 0; for (let i = 1; i < S.length; i++) amax = Math.max(amax, Math.abs(S[i] - S[i - 1]) / DTV);
    // 显著速度极值：交替峰谷、相邻两极值落差 ≥ 15 % 最高速（去抖）
    const ext = []; let dir = 0, piv = S[0], pivI = 0;
    for (let i = 1; i < S.length; i++) {
      const v = S[i];
      if (dir >= 0 && v > piv) { piv = v; pivI = i; if (dir === 0 && v - S[0] > 0.15 * vmax) dir = 1; continue; }
      if (dir <= 0 && v < piv) { piv = v; pivI = i; if (dir === 0 && S[0] - v > 0.15 * vmax) dir = -1; continue; }
      if (dir === 1 && piv - v > 0.15 * vmax) { ext.push(['峰', pivI * DTV, piv]); dir = -1; piv = v; pivI = i; }
      else if (dir === -1 && v - piv > 0.15 * vmax) { ext.push(['谷', pivI * DTV, piv]); dir = 1; piv = v; pivI = i; }
    }
    if (ext.length < 3) fails.push('变速：显著速度极值只有 ' + ext.length + ' 个（要 ≥ 3，慢-快-慢-快）');
    let lookMax = 0, lookAt = 0, headMax = 0, headAt = 0;
    for (let i = 1; i < D.length; i++) { const w = deg(ang(D[i], D[i - 1])) / DTV; if (w > lookMax) { lookMax = w; lookAt = i * DTV; } }
    for (let i = 2; i < P.length; i++) { if (S[i - 1] < 3 || S[i - 2] < 3) continue; const w = deg(ang(sub(P[i], P[i - 1]), sub(P[i - 1], P[i - 2]))) / DTV; if (w > headMax) { headMax = w; headAt = i * DTV; } }
    // 7、8 近景参照与空镜（视锥采样）
    let nearOk = 0, nS = 0, worst = { e: 0, t: 0 }; lastDay = -1; const trace = [];
    for (let i = 0; i < P.length; i++) {
      const t = i * DTV, day = FPV.day(r, t); if (Math.abs(day - lastDay) > 0.5) { PV.set(day); lastDay = day; }
      const q = FPV.sample(r, t), v = viewProbe(PV, HZ, q.pos, q.look); nS++; if (v.near <= NEAR_D) nearOk++; if (i % 5 === 0) trace.push(t.toFixed(1) + 's ' + (isFinite(v.near) ? Math.round(v.near) + 'm' : '∞') + ' 空' + Math.round(v.empty * 100) + '%');
      if (t <= T - END_FREE && v.empty > worst.e) worst = { e: v.empty, t };
    }
    const nearShare = nearOk / nS;
    if (nearShare < NEAR_SHARE) fails.push('近景参照：近景距离 ≤ ' + NEAR_D + ' m 的时间只占 ' + Math.round(nearShare * 100) + ' %（要 ≥ ' + NEAR_SHARE * 100 + ' %）');
    if (worst.e > EMPTY_MAX) fails.push('空镜：t=' + worst.t.toFixed(1) + ' 秒 空视线 ' + Math.round(worst.e * 100) + ' %（上限 ' + EMPTY_MAX * 100 + ' %）');
    if (lookMax > MAX_LOOK) fails.push('平顺：视线角速度 ' + Math.round(lookMax) + '°/秒 @ t=' + lookAt.toFixed(1) + '（上限 ' + MAX_LOOK + '）');
    if (headMax > MAX_HEAD) fails.push('平顺：航向角速度 ' + Math.round(headMax) + '°/秒 @ t=' + headAt.toFixed(1) + '（上限 ' + MAX_HEAD + '）');
    for (const x of LM) if (!(x.d <= x.l.r)) fails.push('地标：离「' + x.l.name + '」最近 ' + r1(x.d) + ' m（要 ≤ ' + x.l.r + '）');
    return {
      name: r.name, ok: !fails.length, fails, dur: T, nearShare: Math.round(nearShare * 100) + '%', worstEmpty: Math.round(worst.e * 100) + '% @' + worst.t.toFixed(1) + 's', viewTrace: trace, minClear: clear ? '≥ ' + clear + ' m' : '< ' + MARGIN + ' m',
      vmax: r1(vmax), amax: r1(amax), lookMax: Math.round(lookMax), headMax: Math.round(headMax),
      extrema: ext.map(e => e[0] + ' ' + e[1].toFixed(1) + 's ' + Math.round(e[2]) + 'm/s'), landmarks: LM.map(x => x.l.name + ' ' + r1(x.d) + 'm')
    };
  }

  function run() {
    const st = window.__film && window.__film.state(), stage = document.getElementById('stage'), w = stage && stage.contentWindow;
    if (!st || !st.ready || !window.HZ_FPV || !w || !w.__pv || !w.HZ) return setTimeout(run, 300);
    const FPV = window.HZ_FPV, PV = w.__pv, HZ = w.HZ, want = new URLSearchParams(location.hash.slice(1)).get('fpvcheck');
    const list = want && want !== '1' ? FPV.routes.filter(r => r.name === want) : FPV.routes;
    const t0 = performance.now(), rep = list.map(r => checkRoute(PV, HZ, FPV, r));
    if (!rep.length) rep.push({ name: want, ok: false, fails: ['没有这条航线'] });
    window.__fpvReport = rep;
    const ok = rep.every(x => x.ok);
    console.log('FPVCHECK ' + JSON.stringify({ ok, ms: Math.round(performance.now() - t0), routes: rep }));
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;right:12px;top:12px;z-index:99999;max-width:46vw;padding:8px 12px;font:12px/1.5 ui-monospace,monospace;background:#f4efe4;border:1.5px solid ' + (ok ? '#2a6b3a' : '#b3261e') + ';color:#1c1a17;white-space:pre-wrap';
    el.textContent = 'FPV 自检 ' + (ok ? 'OK' : 'FAIL') + '\n' + rep.map(x => (x.ok ? '✓ ' : '✗ ') + x.name + (x.ok ? '  净距' + x.minClear + ' · 最高 ' + x.vmax + ' m/s · 极值 ' + (x.extrema || []).length : '\n   ' + x.fails.join('\n   '))).join('\n');
    document.body.appendChild(el);
  }
  run();
})();
