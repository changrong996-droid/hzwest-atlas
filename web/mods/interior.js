// 云厅室内与十字天窗近景细部 3D 模块（V3 任务 #30 · A2 · fo-cs 2026-11-23）
// 用途：为 24 m 高架候车「云厅」与「云谷」补充近景建筑构件墨线——检票闸机岛、候车座椅排布示意、
//   5F 空中连廊玻璃护栏细部与扶梯筒体、24 根梭形柱锥形柱头细部、十字采光顶主次桁架细部。
//   全部用线段绘制，与主站墨线语言一致；按镜头距离 < 180 m 显隐（近景模块）。
// 依据：docs/tasks/arch-refinement.md A2；尺寸读 web/hzseq.js 的 HZ.P / HZ.K / HZ.masts / HZ.Ht / HZ.Hs / HZ.inSky（不写死）。
// 红线：严禁穿楼板（候车层楼面 22.8–24、雨棚上盖 22.8–24、5F 连廊 30.4–31.4）与侵占云谷净空
//   （|z| < HZ.P.gap 的光井保持贯通，只有屋面平面 y > HZ.P.roofLo 的构件可横跨）。
//   模块内置 audit() 自检：对全部线段逐条采样复核上述两条，违例即报。
// 接口：window.HZ_MODS.push({ id:'interior', build(scene, HZ, THREE, opts), update(t, cam), lines(HZ, t), audit(HZ) })；
//   支持 opts.clip（THREE.Plane[]）剖切平面，同 yunmen。
// 检查：node tools/hz/check_all.js 全绿（本文件不进任何现有检查的登记清单，属纯增量模块）；
//   update 每帧 < 1.5 ms（按 t 四分位量化 + 距离门控，仅改 drawRange，不重传缓冲）。
// 集成提示：hzwest.html 需在 hzview.js 之前补一行 <script src="mods/interior.js?v=1"></script>（不在本任务 allowed_paths，合入时由集成人加）。
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const COL = 0x1c1a17;          // 墨线颜色（与 actors / yunmen 相同）
  const MAXSEG = 12000;          // 线段缓冲上限
  const R_SHOW = 180;            // 近景显隐半径（任务书：< 180 m）
  const LIFT = 0.02;             // 家具贴楼面顶的抬升量，避免与楼面顶面共面

  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // 组装全部墨线线段并按出现时刻 tOn 升序排列（随 t 单调不减、查询 O(log N)）
  function compile(HZ) {
    const K = HZ.K, P = HZ.P;
    const key = [K.floorS, K.floorN, K.mast, K.sky, K.ring, K.head].map(a => a.start + ',' + a.dur).join('|');
    if (HZ._interiorCache && HZ._interiorCache.key === key) return HZ._interiorCache;

    const list = [];
    const add = (tOn, x0, y0, z0, x1, y1, z1) => { if (tOn == null || !Number.isFinite(tOn)) return; list.push({ t: tOn, c: [x0, y0, z0, x1, y1, z1] }); };
    // 长线段拆段：前半工期出奇数段（稀疏虚线），后半补齐（合拢实线）——与 yunmen addPhased 同形
    const addPhased = (t0, t1, x0, y0, z0, x1, y1, z1, step) => {
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const n = Math.max(2, Math.round(len / (step || 4)));
      const tm = t0 + (t1 - t0) * 0.48;
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n;
        add((i % 2 === 0 ? t0 + (tm - t0) * u0 : tm + (t1 - tm) * u0),
          x0 + (x1 - x0) * u0, y0 + (y1 - y0) * u0, z0 + (z1 - z0) * u0,
          x0 + (x1 - x0) * u1, y0 + (y1 - y0) * u1, z0 + (z1 - z0) * u1);
      }
    };

    const FT = P.floorTop + LIFT;                 // 楼面顶 24 + 抬升
    const GAP = P.gap;                            // 云谷半宽 14
    const RING_Y = P.ringY;                       // 5F 连廊楼面 30.4

    // ---------- 1. 检票闸机岛：z = ±19（距云谷边 ≥ 5 m），x -80…80，3.2 m 一道 ----------
    // 各自候车半区楼面（floorS / floorN）完工后出现，自东向西推进
    for (const [yk, ykK, sgn] of [['S', 'floorS', 1], ['N', 'floorN', -1]]) {
      const t0 = K[ykK].end, t1 = t0 + 8;
      for (const zz of [sgn * 19]) {
        for (let x = -80, gi = 0; x <= 79.9; x += 3.2, gi++) {
          const u = (x + 80) / 160, tg = t0 + (t1 - t0) * u;
          const hw = 0.8, hd = 0.35, x0 = x - hw + 0.8, x1 = x + 0.8 + hw;   // 每道闸门岛 1.6 m 宽
          const gx0 = x, gx1 = x + 1.6;
          // 岛基座：顶面两条纵线（y = FT + 0.15）
          add(tg, gx0, FT + 0.15, zz - hd, gx1, FT + 0.15, zz - hd);
          add(tg, gx0, FT + 0.15, zz + hd, gx1, FT + 0.15, zz + hd);
          // 四根立柱 + 顶盖两条横线（通道闸高 1.0 m）
          for (const cx of [gx0, gx1]) for (const cz of [zz - hd, zz + hd]) add(tg, cx, FT, cz, cx, FT + 1.0, cz);
          add(tg + 0.02, gx0, FT + 1.0, zz - hd, gx1, FT + 1.0, zz - hd);
          add(tg + 0.02, gx0, FT + 1.0, zz + hd, gx1, FT + 1.0, zz + hd);
          // 扇门摆臂示意（每道一道斜线）
          add(tg + 0.03, gx0 + 0.2, FT + 0.7, zz - hd + 0.15, gx1 - 0.2, FT + 0.7, zz + hd - 0.15);
        }
      }
    }

    // ---------- 2. 候车座椅排布示意：z = ±30/55/80/105/130，每排长凳 x -84…84 间距 12 m ----------
    for (const [yk, ykK, sgn] of [['S', 'floorS', 1], ['N', 'floorN', -1]]) {
      const t0 = K[ykK].end, t1 = t0 + 14;
      for (let ri = 0; ri < 5; ri++) {
        const zz = sgn * (30 + ri * 25), tr0 = t0 + (t1 - t0) * (ri / 5);
        for (let x = -84, bi = 0; x <= 83.9; x += 12, bi++) {
          const tg = tr0 + (t1 - t0) * (bi % 4) / 4;
          const bx0 = x, bx1 = x + 4;                       // 4 m 长凳
          add(tg, bx0, FT + 0.45, zz - 0.3, bx1, FT + 0.45, zz - 0.3);   // 座面
          add(tg, bx0, FT + 0.45, zz + 0.3, bx1, FT + 0.45, zz + 0.3);
          add(tg + 0.01, bx0, FT + 0.45, zz - 0.3, bx0, FT + 0.45, zz + 0.3);
          add(tg + 0.01, bx1, FT + 0.45, zz - 0.3, bx1, FT + 0.45, zz + 0.3);
          add(tg + 0.02, bx0, FT + 0.9, zz + 0.5, bx1, FT + 0.9, zz + 0.5);   // 靠背顶
          for (const cx of [bx0 + 0.4, bx1 - 0.4]) for (const cz of [zz - 0.25, zz + 0.25]) add(tg + 0.02, cx, FT, cz, cx, FT + 0.45, cz);
        }
      }
    }

    // ---------- 3. 5F 空中连廊：玻璃护栏细部（竖梃 + 扶手顶盖）与扶梯筒体 ----------
    // 连廊本体（楼面 / 栏板）由 hzseq 'ring' 建实体；这里加细部墨线，随 K.ring 进度出现
    {
      const t0 = K.ring.start, dur = K.ring.dur;
      const rails = [];   // [x, z0, z1, sgnOrd] 纵向四段栏板的两片玻璃面
      for (const s of [-1, 1]) for (const yk of ['S', 'N']) {
        const Y = HZ.YARDS[yk], z0 = Math.min(Y.z0, Y.z1) + 2, z1 = Math.max(Y.z0, Y.z1) - 2;
        rails.push([s * 129 + 3 - 0.05, z0, z1], [s * 129 - 3 + 0.05, z0, z1]);
      }
      let ri = 0;
      for (const [rx, z0, z1] of rails) {
        const u = ri++ / rails.length, tr0 = t0 + dur * (0.3 + 0.5 * u);
        addPhased(tr0, tr0 + dur * 0.15, rx, RING_Y + 2.1, z0, rx, RING_Y + 2.1, z1, 8);   // 扶手顶盖
        for (let z = z0 + 2; z < z1; z += 4) add(tr0 + dur * 0.05, rx, RING_Y + 1.0, z, rx, RING_Y + 2.05, z);   // 竖梃
      }
      // 扶梯筒体：纵廊 x=±127（廊柱 x=±129 r0.5，中点避柱），z 取各场柱间中点；横廊 z=±141，x=±53.75
      const esc = [];
      for (const s of [-1, 1]) for (const zz of [32, 72, 112]) esc.push([s * 127, zz]);
      for (const s of [-1, 1]) for (const zz of [-99, -79, -39]) esc.push([s * 127, zz]);
      for (const s of [-1, 1]) for (const xx of [53.75, -53.75]) esc.push([xx, s * 141]);
      const EX = 1.2, EY0 = FT, EY1 = RING_Y - LIFT;      // 24.02 → 30.38（不碰 5F 楼面底 30.4）
      let ei = 0;
      for (const [ex, ez] of esc) {
        const u = ei++ / esc.length, tg = t0 + dur * (0.35 + 0.5 * u);
        const vert = ex < 60 && ex > -60 && Math.abs(ez) < 130 ? false : Math.abs(ex) > 100;   // 纵廊扶梯沿 z 向爬升，横廊沿 x 向爬升
        if (Math.abs(ex) > 100) {
          // 纵廊筒体：x 向半宽 EX，z 向长 12 m（运行方向 z）
          const z0 = ez - 6, z1 = ez + 6;
          addPhased(tg, tg + dur * 0.08, ex - EX, EY0, z0, ex + EX, EY0, z0, 6);
          addPhased(tg, tg + dur * 0.08, ex - EX, EY0, z1, ex + EX, EY0, z1, 6);
          addPhased(tg + dur * 0.04, tg + dur * 0.1, ex - EX, EY1, z0, ex + EX, EY1, z0, 6);
          addPhased(tg + dur * 0.04, tg + dur * 0.1, ex - EX, EY1, z1, ex + EX, EY1, z1, 6);
          for (const cx of [ex - EX, ex + EX]) for (const cz of [z0, z1]) add(tg + dur * 0.02, cx, EY0, cz, cx, EY1, cz);
          // 梯级折线（斜梯段，两跑）
          add(tg + dur * 0.06, ex - 0.7, EY0, z1, ex - 0.7, EY1, z0);
          add(tg + dur * 0.08, ex + 0.7, EY0, z1, ex + 0.7, EY1, z0);
          add(tg + dur * 0.07, ex, EY0 + (EY1 - EY0) / 2, ez + 3, ex, EY0 + (EY1 - EY0) / 2 + 0.1, ez - 3);
        } else {
          // 横廊筒体：z 向半宽 EX，x 向长 12 m（运行方向 x）
          const x0 = ex - 6, x1 = ex + 6;
          addPhased(tg, tg + dur * 0.08, x0, EY0, ez - EX, x0, EY0, ez + EX, 6);
          addPhased(tg, tg + dur * 0.08, x1, EY0, ez - EX, x1, EY0, ez + EX, 6);
          addPhased(tg + dur * 0.04, tg + dur * 0.1, x0, EY1, ez - EX, x0, EY1, ez + EX, 6);
          addPhased(tg + dur * 0.04, tg + dur * 0.1, x1, EY1, ez - EX, x1, EY1, ez + EX, 6);
          for (const cx of [x0, x1]) for (const cz of [ez - EX, ez + EX]) add(tg + dur * 0.02, cx, EY0, cz, cx, EY1, cz);
          add(tg + dur * 0.06, x1, EY0, ez - 0.7, x0, EY1, ez - 0.7);
          add(tg + dur * 0.08, x1, EY0, ez + 0.7, x0, EY1, ez + 0.7);
        }
      }
    }

    // ---------- 4. 梭形柱锥形柱头细部：24 根，K.head（柱头连接）期出现 ----------
    {
      const t0 = K.head.start, dur = K.head.dur;
      HZ.masts.forEach((m, mi) => {
        const u = mi / HZ.masts.length, tr0 = t0 + dur * 0.7 * u;
        const y0 = m.top + 0.02, y1 = HZ.Ht(m.x, m.z) - 0.2, r0 = 0.67, r1 = 2.52;
        for (let i = 0; i < 8; i++) {
          const th = i / 8 * Math.PI * 2;
          add(tr0 + dur * 0.02, m.x + Math.cos(th) * r0, y0, m.z + Math.sin(th) * r0,
            m.x + Math.cos(th) * r1, y1, m.z + Math.sin(th) * r1);
        }
        for (const [f, rr] of [[0.4, r0 + (r1 - r0) * 0.4], [0.75, r0 + (r1 - r0) * 0.75]]) {
          const yy = y0 + (y1 - y0) * f;
          let px = null;
          for (let i = 0; i <= 8; i++) {
            const th = i / 8 * Math.PI * 2, q = [m.x + Math.cos(th) * rr, yy, m.z + Math.sin(th) * rr];
            if (px) add(tr0 + dur * (0.05 + 0.1 * f), px[0], px[1], px[2], q[0], q[1], q[2]);
            px = q;
          }
        }
      });
    }

    // ---------- 5. 十字采光顶主次桁架细部：随 K.sky 进度沿两臂自南向北出现 ----------
    {
      const t0 = K.sky.start, dur = K.sky.dur;
      const RB = P.roofA, RBz = P.roofB;
      // 拱高（同 hzseq Hc 的天窗拱项）：轴心满高 1.6，|min(x,z)| ≥ skyW 归零
      const archH = (x, z) => 1.6 * (1 - sm(P.skyW - 3, P.skyW, Math.min(Math.abs(x), Math.abs(z))));
      // 主桁架：两臂轴线上 ±3.5 双片，下弦 Ht+0.12，上弦贴拱顶 -0.06，7 m 一节竖杆 + 斜腹杆
      for (const arm of ['x', 'z']) {
        const L = arm === 'x' ? RB - 2.5 : RBz - 3;
        const nB = Math.round(2 * L / 7);
        for (let i = 0; i <= nB; i++) {
          const c = -L + 2 * L * i / nB;
          const xA = arm === 'x' ? c : 0, zA = arm === 'x' ? 0 : c;
          const uS = (c + L) / (2 * L);                     // 自南向北（z 轴臂）/ 自东向西
          const tr0 = t0 + dur * 0.25 * uS, tr1 = t0 + dur * (0.25 + 0.6 * uS);
          for (const off of [-3.5, 3.5]) {
            const xb = arm === 'x' ? xA : off, zb = arm === 'x' ? off : zA;
            add(tr0 + dur * 0.05, xb, HZ.Ht(xb, zb) + 0.12, zb, xb, HZ.Ht(xb, zb) + archH(xb, zb) - 0.06, zb);
          }
          if (i < nB) {
            const c2 = -L + 2 * L * (i + 1) / nB;
            for (const off of [-3.5, 3.5]) {
              const xa = arm === 'x' ? c : off, za = arm === 'x' ? off : c;
              const xb2 = arm === 'x' ? c2 : off, zb2 = arm === 'x' ? off : c2;
              addPhased(tr0 + dur * 0.08, tr1, xa, HZ.Ht(xa, za) + 0.12, za, xb2, HZ.Ht(xb2, zb2) + 0.12, zb2, 7);
              addPhased(tr0 + dur * 0.12, tr1, xa, HZ.Ht(xa, za) + archH(xa, za) - 0.06, za, xb2, HZ.Ht(xb2, zb2) + archH(xb2, zb2) - 0.06, zb2, 7);
            }
            const xv = arm === 'x' ? c2 : 0, zv = arm === 'x' ? 0 : c2;
            for (const off of [-3.5, 3.5]) {
              const xo = arm === 'x' ? xv : off, zo = arm === 'x' ? off : zv;
              add(tr0 + dur * 0.15, xo, HZ.Ht(xo, zo) + 0.12, zo, xo, HZ.Ht(xo, zo) + archH(xo, zo) - 0.06, zo);
              add(tr0 + dur * 0.2, arm === 'x' ? c : off, HZ.Ht(arm === 'x' ? c : off, arm === 'x' ? off : c) + 0.12, arm === 'x' ? off : c,
                xv, HZ.Ht(xv, zv) + archH(xv, zv) - 0.06, zv);
            }
          }
        }
        // 次桁架：垂直于臂向横跨天窗 ±9，浅截面（下弦 Ht+0.25，上弦 Ht+0.75），14 m 一道，3.5 m 竖杆
        const nS = Math.floor(2 * L / 14);
        for (let i = 1; i <= nS; i++) {
          const c = -L + i * 14;
          const xA = arm === 'x' ? c : 0, zA = arm === 'x' ? 0 : c;
          const uS = (c + L) / (2 * L);
          const tr0 = t0 + dur * (0.3 + 0.55 * uS);
          for (const sgn of [-1, 1]) {
            const pts = [];
            for (let w = -9; w <= 9.01; w += 3.5) {
              const xq = arm === 'x' ? xA : w * sgn, zq = arm === 'x' ? w * sgn : zA;
              pts.push([xq, zq]);
            }
            for (let k = 0; k < pts.length; k++) {
              const [xq, zq] = pts[k], yq = HZ.Ht(xq, zq);
              if (k < pts.length - 1) {
                const [xr, zr] = pts[k + 1], yr = HZ.Ht(xr, zr);
                addPhased(tr0, tr0 + dur * 0.12, xq, yq + 0.25, zq, xr, yr + 0.25, zr, 3.5);
                addPhased(tr0 + dur * 0.03, tr0 + dur * 0.15, xq, yq + 0.75, zq, xr, yr + 0.75, zr, 3.5);
              }
              add(tr0 + dur * 0.06, xq, yq + 0.25, zq, xq, yq + 0.75, zq);
            }
          }
        }
      }
    }

    list.sort((a, b) => a.t - b.t);
    const n = list.length;
    const tOns = new Float64Array(n);
    const coords = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) { tOns[i] = list[i].t; coords.set(list[i].c, i * 6); }
    const cache = { key, t0: K.found ? K.found.start : 0, n, tOns, coords };
    HZ._interiorCache = cache;
    return cache;
  }

  // 二分查找时刻 t 已出现的线段数
  function countAt(C, t) {
    if (t < C.t0) return 0;
    const T = C.tOns;
    let lo = 0, hi = C.n;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (T[mid] <= t) lo = mid + 1; else hi = mid; }
    return lo;
  }

  // 时刻 t 的线段坐标缓冲（Float32Array，每 6 个数一条 [x0,y0,z0,x1,y1,z1]）
  function lines(HZ, t) {
    const C = compile(HZ);
    const m = countAt(C, t);
    return m === 0 ? new Float32Array(0) : C.coords.subarray(0, m * 6);
  }

  // ---------- 内置审计：穿楼板 = 0、云谷净空保持 = 0 违例 ----------
  // 楼面盒全部由 HZ.P 推出（不写死）：候车层楼面、雨棚上盖、5F 连廊楼面；逐段 9 点采样。
  function audit(HZ) {
    const C = compile(HZ), P = HZ.P, out = [];
    const FB = P.floorBot + 0.02, FT = P.floorTop - 0.02, RY0 = P.ringY + 0.02, RY1 = P.ringY + 1.0 - 0.02;
    const slabs = [
      { key: 'floorS', box: [-P.floorX, FB, P.gap, P.floorX, FT, P.floorZ] },
      { key: 'floorN', box: [-P.floorX, FB, -P.floorZ, P.floorX, FT, -P.gap] },
      { key: 'canopyS', box: [125, FB, P.gap, 225, FT, 138] },
      { key: 'canopyN', box: [-225, FB, -117, -125, FT, -P.gap] },
      { key: 'ringE', box: [126, RY0, -115, 132, RY1, 136] },
      { key: 'ringW', box: [-132, RY0, -115, -126, RY1, 136] },
      { key: 'ringS', box: [-92, RY0, 140, 92, RY1, 146] },
      { key: 'ringN', box: [-92, RY0, -146, 92, RY1, -140] },
    ];
    const inSlab = (x, y, z) => { for (const s of slabs) { const b = s.box; if (x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]) return s.key; } return null; };
    for (let i = 0; i < C.n; i++) {
      const c = C.coords, o = i * 6;
      for (let k = 0; k <= 8; k++) {
        const f = k / 8;
        const x = c[o] + (c[o + 3] - c[o]) * f, y = c[o + 1] + (c[o + 4] - c[o + 1]) * f, z = c[o + 2] + (c[o + 5] - c[o + 2]) * f;
        if (Math.abs(z) < P.gap && y <= P.roofLo) { out.push('云谷净空 seg' + i + ' @' + f.toFixed(2) + ' z=' + z.toFixed(1) + ' y=' + y.toFixed(1)); k = 9; break; }
        const s = inSlab(x, y, z);
        if (s) { out.push('穿楼板 ' + s + ' seg' + i + ' @' + f.toFixed(2)); k = 9; break; }
      }
    }
    return { ok: out.length === 0, n: C.n, violations: out.slice(0, 20) };
  }

  const MOD = {
    id: 'interior',
    COL,
    MAXSEG,
    lines,
    audit,
    mode: 'detail',
    modeFor() { return 'detail'; },
    stats: { segs: 0 },
    build(scene, HZ, THREE, opts) {
      opts = opts || {};
      this.clip = Array.isArray(opts.clip) && opts.clip.length ? opts.clip : null;
      this.HZ = HZ;
      this.C = HZ ? compile(HZ) : null;
      this.buf = new Float32Array(MAXSEG * 6);
      if (this.C) this.buf.set(this.C.coords.subarray(0, Math.min(this.C.n, MAXSEG) * 6));
      this.n = 0; this.key = null;
      THREE = THREE || ROOT.THREE;
      if (THREE && scene) {
        const g = new THREE.BufferGeometry();
        this.attr = new THREE.BufferAttribute(this.buf, 3);
        this.attr.setUsage && this.attr.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('position', this.attr);
        g.setDrawRange(0, 0);
        const matOpts = Object.assign({ color: COL, transparent: true, opacity: 0.92 }, this.clip ? { clippingPlanes: this.clip } : {});
        this.obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial(matOpts));
        this.obj.frustumCulled = false;
        this.obj.renderOrder = 6;
        this.obj.name = 'hz-interior';
        scene.add(this.obj);
      }
      return this;
    },
    // 近景显隐：相机到「云厅」包围盒最近点的距离 < R_SHOW 才画（R_SHOW = 180 m）
    _near(cam) {
      if (!cam || !Number.isFinite(cam.position ? cam.position.x : NaN)) return true;
      const P = this.HZ && this.HZ.P ? this.HZ.P : null;
      const fx = P ? P.floorX : 95, fz = P ? P.floorZ : 150;
      const px = cam.position.x, py = cam.position.y, pz = cam.position.z;
      const cx = Math.max(-fx, Math.min(fx, px)), cy = Math.max(24, Math.min(33, py)), cz = Math.max(-fz, Math.min(fz, pz));
      return Math.hypot(px - cx, py - cy, pz - cz) < R_SHOW;
    },
    update(t, cam) {
      if (!this.HZ) return 0;
      const vis = this._near(cam);
      const key = (vis ? '1' : '0') + ':' + Math.floor(t * 4);
      if (key === this.key) return this.n;
      this.key = key;
      const C = this.C || (this.C = compile(this.HZ));
      const n = vis ? Math.min(countAt(C, t), MAXSEG) : 0;
      this.n = n; this.stats.segs = n;
      if (this.obj) this.obj.geometry.setDrawRange(0, n * 2);   // 缓冲 build 时一次写满，这里只改绘制范围
      return this.n;
    },
  };
  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(MOD);
  // Node 侧自检用：加载后按 HZ.P 校准包围盒
  if (typeof module !== 'undefined' && module.exports) module.exports = MOD;
})();
