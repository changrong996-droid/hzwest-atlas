// 云门细化墨线 3D 模块（派单 D-23）· hark-cr（Traycer 起草）
// 用途：将杭州西站南侧「云门」（180×60×80 m，中间门洞）由简模灰盒细化为分阶段生长的建筑墨线模型（基础→主体→幕墙），全部用线段绘制，不画实体面。
// 数据来源：杭州市政府网 2022-09-20（云门长 180 m、宽 60 m、高 80 m，中间门洞）；包络与排程同 web/hzseq.js 第 303–313 行（HZ.K.ymf / HZ.K.ym / HZ.K.ymc）。
// 接口：window.HZ_MODS.push({ id:'yunmen', build(scene, HZ, THREE, opts), update(t, cam), lines(HZ, t) })；支持 opts.clip（THREE.Plane[]）剖切平面。
// 检查：node tools/hz/check_yunmen.js（登记、opts.clip、随 t 单调生长、包络越界、门洞净空 9 点采样、与 ym 包围盒一致、update 耗时 < 1 ms）。
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const COL = 0x1c1a17;          // 墨线颜色（与 actors 相同）
  const MAXSEG = 12000;          // 线段缓冲上限
  const ZA = 178, ZB = 238;      // 云门主体南北界（宽 60 m）
  const X0 = -90, X1 = 90;       // 云门主体东西界（长 180 m）
  const XP = 38, YP = 50, YT = 80; // 门洞半宽 38 m、洞高 50 m、总高 80 m

  // 组装全部墨线线段并按出现时刻 tOn 升序排列（保证随 t 单调不减、查询 O(log N)）
  function compile(HZ) {
    const ymf = HZ.K.ymf, ym = HZ.K.ym, ymc = HZ.K.ymc;
    const key = `${ymf.start},${ymf.dur},${ym.start},${ym.dur},${ymc.start},${ymc.dur}`;
    if (HZ._yunmenCache && HZ._yunmenCache.key === key) return HZ._yunmenCache;

    const list = [];
    const add = (tOn, x0, y0, z0, x1, y1, z1) => {
      list.push({ t: tOn, c: [x0, y0, z0, x1, y1, z1] });
    };
    // 将长线段拆分为 n 段子线段：前半工期先出奇数段（形成在建虚线/稀疏线），后半工期补齐偶数段（合拢为实线）
    const addPhased = (t0, t1, x0, y0, z0, x1, y1, z1, step) => {
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const n = Math.max(2, Math.round(len / (step || 4)));
      const tm = t0 + (t1 - t0) * 0.48;
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n;
        const ax = x0 + (x1 - x0) * u0, ay = y0 + (y1 - y0) * u0, az = z0 + (z1 - z0) * u0;
        const bx = x0 + (x1 - x0) * u1, by = y0 + (y1 - y0) * u1, bz = z0 + (z1 - z0) * u1;
        const frac = i / n;
        const tOn = (i % 2 === 0) ? (t0 + (tm - t0) * frac) : (tm + (t1 - tm) * frac);
        add(tOn, ax, ay, az, bx, by, bz);
      }
    };

    // ---------- 1. 基础期（ymf）：基坑与基础底板 x∈[-92,92] y∈[-1.5,0] z∈[176,240] ----------
    {
      const t0 = ymf.start, dur = ymf.dur;
      const fx0 = -92, fx1 = 92, fz0 = ZA - 2, fz1 = ZB + 2, fy0 = -1.5, fy1 = 0;
      // 阶段 1a (0 ~ 0.35)：坑底外框与周边竖向边棱
      const tA = t0 + dur * 0.35;
      addPhased(t0, tA, fx0, fy0, fz0, fx1, fy0, fz0, 8);
      addPhased(t0, tA, fx1, fy0, fz0, fx1, fy0, fz1, 8);
      addPhased(t0, tA, fx1, fy0, fz1, fx0, fy0, fz1, 8);
      addPhased(t0, tA, fx0, fy0, fz1, fx0, fy0, fz0, 8);
      for (let x = fx0; x <= fx1; x += 23) {
        const u = (x - fx0) / (fx1 - fx0);
        add(t0 + dur * (0.1 + 0.25 * u), x, fy0, fz0, x, fy1, fz0);
        add(t0 + dur * (0.1 + 0.25 * u), x, fy0, fz1, x, fy1, fz1);
      }
      for (let z = fz0 + 16; z < fz1; z += 16) {
        const u = (z - fz0) / (fz1 - fz0);
        add(t0 + dur * (0.15 + 0.2 * u), fx0, fy0, z, fx0, fy1, z);
        add(t0 + dur * (0.15 + 0.2 * u), fx1, fy0, z, fx1, fy1, z);
      }
      // 阶段 1b (0.35 ~ 0.70)：底板顶面外框与筏板纵横分格线
      const tB = t0 + dur * 0.7;
      addPhased(tA, tB, fx0, fy1, fz0, fx1, fy1, fz0, 8);
      addPhased(tA, tB, fx1, fy1, fz0, fx1, fy1, fz1, 8);
      addPhased(tA, tB, fx1, fy1, fz1, fx0, fy1, fz1, 8);
      addPhased(tA, tB, fx0, fy1, fz1, fx0, fy1, fz0, 8);
      for (const z of [ZA, 193, 208, 223, ZB]) {
        const u = (z - ZA) / (ZB - ZA);
        addPhased(tA + dur * 0.05 * u, tB, fx0, fy1, z, fx1, fy1, z, 12);
      }
      for (const x of [-90, -77, -64, -51, -38, -19, 0, 19, 38, 51, 64, 77, 90]) {
        const u = Math.abs(x) / 90;
        addPhased(tA + dur * 0.05 * (1 - u), tB, x, fy1, fz0, x, fy1, fz1, 12);
      }
      // 阶段 1c (0.70 ~ 1.00)：东西两塔底座承台轮廓
      const tC = t0 + dur;
      for (const [xa, xb] of [[X0, -XP], [XP, X1]]) {
        addPhased(tB, tC, xa, fy1, ZA, xb, fy1, ZA, 6.5);
        addPhased(tB, tC, xb, fy1, ZA, xb, fy1, ZB, 6);
        addPhased(tB, tC, xb, fy1, ZB, xa, fy1, ZB, 6.5);
        addPhased(tB, tC, xa, fy1, ZB, xa, fy1, ZA, 6);
      }
    }

    // ---------- 2. 主体期（ym）：每 5 m 一层，共 16 层（0–50 m 两塔 10 层，50–80 m 顶部 6 层） ----------
    {
      const t0 = ym.start, dur = ym.dur, nFloors = 16, dt = dur / nFloors;
      const zGrid = [178, 190, 202, 214, 226, 238];
      const towerX = [[-90, -77, -64, -51, -38], [38, 51, 64, 77, 90]];

      // 2a. 两塔主体 0–50 m（10 层，k = 0..9）
      for (let k = 0; k < 10; k++) {
        const y0 = k * 5, y1 = (k + 1) * 5;
        const fk0 = t0 + k * dt, fk1 = fk0 + dt;
        for (const xs of towerX) {
          const xa = xs[0], xb = xs[xs.length - 1];
          // 框架柱（外圈与内核）
          for (let xi = 0; xi < xs.length; xi++) {
            for (let zi = 0; zi < zGrid.length; zi++) {
              const isEdge = xi === 0 || xi === xs.length - 1 || zi === 0 || zi === zGrid.length - 1;
              const isCore = (xi === 1 || xi === 3) && (zi === 2 || zi === 3);
              if (!isEdge && !isCore) continue;
              const order = ((xi + zi) % 2 === 0) ? 0.12 : 0.55;
              add(fk0 + dt * order, xs[xi], y0, zGrid[zi], xs[xi], y1, zGrid[zi]);
            }
          }
          // 楼层外框梁与主次梁（在建层前半段出虚线/稀疏段，后半段合拢为实线）
          addPhased(fk0 + dt * 0.08, fk1, xa, y1, ZA, xb, y1, ZA, 6.5);
          addPhased(fk0 + dt * 0.08, fk1, xa, y1, ZB, xb, y1, ZB, 6.5);
          addPhased(fk0 + dt * 0.12, fk1, xa, y1, ZA, xa, y1, ZB, 6);
          addPhased(fk0 + dt * 0.12, fk1, xb, y1, ZA, xb, y1, ZB, 6);
          for (let xi = 1; xi < xs.length - 1; xi++) {
            addPhased(fk0 + dt * 0.2, fk1, xs[xi], y1, ZA, xs[xi], y1, ZB, 10);
          }
          for (let zi = 1; zi < zGrid.length - 1; zi++) {
            addPhased(fk0 + dt * 0.2, fk1, xa, y1, zGrid[zi], xb, y1, zGrid[zi], 10);
          }
        }
        // 门洞两侧塔楼内侧面（x = ±38）分格线
        for (const xp of [-XP, XP]) {
          addPhased(fk0 + dt * 0.18, fk1, xp, y0 + 2.5, ZA, xp, y0 + 2.5, ZB, 6);
          for (let z = ZA + 6; z < ZB; z += 12) {
            add(fk0 + dt * 0.35, xp, y0, z, xp, y1, z);
          }
        }
      }

      // 2b. 顶部体量 50–80 m（6 层，k = 10..15；第 10 层 50–55 m 为转换桁架层，先出横跨门洞的桁架线与洞顶底面分格）
      const portalX = [-38, -30.4, -22.8, -15.2, -7.6, 0, 7.6, 15.2, 22.8, 30.4, 38];
      const topX = [-90, -77, -64, -51, -38, -22.8, -7.6, 7.6, 22.8, 38, 51, 64, 77, 90];
      for (let k = 10; k < 16; k++) {
        const y0 = k * 5, y1 = (k + 1) * 5;
        const fk0 = t0 + k * dt, fk1 = fk0 + dt;
        let bodyStart = fk0;

        if (k === 10) {
          // 转换桁架层（50 m 处）：先出现门洞顶底面（y=50）分格线与横跨门洞的转换桁架线
          const trEnd = fk0 + dt * 0.48;
          // 门洞顶面 y = 50 底面分格线（x ∈ [-38, 38], z ∈ [178, 238]）
          for (let z = ZA; z <= ZB; z += 6) {
            addPhased(fk0, trEnd * 0.9 + fk0 * 0.1, -XP, YP, z, XP, YP, z, 7.6);
          }
          for (const x of portalX) {
            addPhased(fk0 + dt * 0.05, trEnd, x, YP, ZA, x, YP, ZB, 6);
          }
          // 横跨门洞的主转换桁架（6 榀：z = 178, 190, 202, 214, 226, 238，高 y ∈ [50, 55]）
          for (const z of zGrid) {
            const isFace = z === ZA || z === ZB;
            for (let i = 0; i < portalX.length - 1; i++) {
              const xa = portalX[i], xb = portalX[i + 1];
              const u = i / (portalX.length - 1);
              const tTr = fk0 + dt * (0.06 + 0.32 * u);
              add(tTr, xa, y0, z, xa, y1, z);
              add(tTr + dt * 0.04, xa, y0, z, xb, y1, z);
              if (isFace || i % 2 === 0) {
                add(tTr + dt * 0.06, xa, y1, z, xb, y0, z);
              }
            }
            add(fk0 + dt * 0.38, XP, y0, z, XP, y1, z);
          }
          bodyStart = fk0 + dt * 0.42;
        }

        // 全宽层柱与楼面梁框（x ∈ [-90, 90], z ∈ [178, 238]）
        for (let xi = 0; xi < topX.length; xi++) {
          for (let zi = 0; zi < zGrid.length; zi++) {
            const isEdge = xi === 0 || xi === topX.length - 1 || zi === 0 || zi === zGrid.length - 1;
            const isCore = (xi % 3 === 0) && (zi === 2 || zi === 3);
            if (!isEdge && !isCore) continue;
            const order = ((xi + zi) % 2 === 0) ? 0.1 : 0.55;
            add(bodyStart + (fk1 - bodyStart) * order, topX[xi], y0, zGrid[zi], topX[xi], y1, zGrid[zi]);
          }
        }
        // 转换桁架层及顶层立面斜腹杆（南北两立面）
        if (k === 10 || k === 15) {
          for (const z of [ZA, ZB]) {
            for (const xs of towerX) {
              for (let i = 0; i < xs.length - 1; i++) {
                add(bodyStart + (fk1 - bodyStart) * (0.25 + 0.1 * i), xs[i], y0, z, xs[i + 1], y1, z);
                add(bodyStart + (fk1 - bodyStart) * (0.3 + 0.1 * i), xs[i], y1, z, xs[i + 1], y0, z);
              }
            }
          }
        }
        // 全宽外框梁与横纵主梁
        addPhased(bodyStart + (fk1 - bodyStart) * 0.08, fk1, X0, y1, ZA, X1, y1, ZA, 7.5);
        addPhased(bodyStart + (fk1 - bodyStart) * 0.08, fk1, X0, y1, ZB, X1, y1, ZB, 7.5);
        addPhased(bodyStart + (fk1 - bodyStart) * 0.12, fk1, X0, y1, ZA, X0, y1, ZB, 6);
        addPhased(bodyStart + (fk1 - bodyStart) * 0.12, fk1, X1, y1, ZA, X1, y1, ZB, 6);
        for (let xi = 1; xi < topX.length - 1; xi++) {
          addPhased(bodyStart + (fk1 - bodyStart) * 0.2, fk1, topX[xi], y1, ZA, topX[xi], y1, ZB, 10);
        }
        for (let zi = 1; zi < zGrid.length - 1; zi++) {
          addPhased(bodyStart + (fk1 - bodyStart) * 0.2, fk1, X0, y1, zGrid[zi], X1, y1, zGrid[zi], 12);
        }
      }
    }

    // ---------- 3. 幕墙期（ymc）：立面每 4 m 一根竖梃、横向每层一根，自下而上覆盖南北两立面与东西端面 ----------
    {
      const t0 = ymc.start, dur = ymc.dur, nFloors = 16, dt = dur / nFloors;
      for (let k = 0; k < nFloors; k++) {
        const y0 = k * 5, y1 = (k + 1) * 5, ymMid = y0 + 2.5;
        const fc0 = t0 + k * dt, fc1 = fc0 + dt;

        // 3a. 南北两立面（z = 178, z = 238）：每 4 m 一根竖梃，横向每层分格（|x| < 38 且 y < 50 门洞处严格留空）
        for (const z of [ZA, ZB]) {
          for (let x = X0; x <= X1; x += 4) {
            if (k < 10 && Math.abs(x) < XP) continue;
            const u = (x - X0) / (X1 - X0);
            const tM = fc0 + dt * (0.05 + 0.55 * u);
            add(tM, x, y0, z, x, y1, z);
            if (x + 4 <= X1 && !(k < 10 && Math.abs(x + 2) < XP)) {
              // 每层横向横梁与窗带中横梃（良渚玉琮横向密纹）
              add(fc0 + dt * (0.35 + 0.55 * u), x, y1, z, x + 4, y1, z);
              add(fc0 + dt * (0.45 + 0.5 * u), x, ymMid, z, x + 4, ymMid, z);
            }
          }
        }

        // 3b. 东西两端面（x = -90, x = 90）：每 4 m 一根竖梃，横向每层一根
        for (const x of [X0, X1]) {
          for (let z = ZA; z <= ZB; z += 4) {
            const v = (z - ZA) / (ZB - ZA);
            add(fc0 + dt * (0.1 + 0.55 * v), x, y0, z, x, y1, z);
            if (z + 4 <= ZB) {
              add(fc0 + dt * (0.4 + 0.5 * v), x, y1, z, x, y1, z + 4);
              add(fc0 + dt * (0.5 + 0.45 * v), x, ymMid, z, x, ymMid, z + 4);
            }
          }
        }

        // 3c. 门洞内表面幕墙加密分格（两侧内壁 x = ±38 竖梃，洞顶 y = 50 吊顶分格）
        if (k < 10) {
          for (const xp of [-XP, XP]) {
            for (let z = ZA + 4; z < ZB; z += 4) {
              if ((z - ZA) % 6 === 0) continue; // 避开主体已画的 6 m 分格线
              const v = (z - ZA) / (ZB - ZA);
              add(fc0 + dt * (0.2 + 0.6 * v), xp, y0, z, xp, y1, z);
            }
          }
        } else if (k === 10) {
          for (let x = -XP + 4; x < XP; x += 4) {
            const u = (x + XP) / (2 * XP);
            addPhased(fc0 + dt * 0.15, fc0 + dt * (0.5 + 0.45 * u), x, YP, ZA, x, YP, ZB, 10);
          }
        }
      }
    }

    list.sort((a, b) => a.t - b.t);
    const n = list.length;
    const tOns = new Float64Array(n);
    const coords = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      tOns[i] = list[i].t;
      coords.set(list[i].c, i * 6);
    }
    const cache = { key, t0: ymf.start, n, tOns, coords };
    HZ._yunmenCache = cache;
    return cache;
  }

  // 二分查找时刻 t 已出现的线段数
  function countAt(C, t) {
    if (t < C.t0) return 0;
    const T = C.tOns;
    let lo = 0, hi = C.n;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (T[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // 返回时刻 t 的线段坐标缓冲（Float32Array，每 6 个数为一条线段 [x0,y0,z0,x1,y1,z1]）
  function lines(HZ, t) {
    const C = compile(HZ);
    const m = countAt(C, t);
    return m === 0 ? new Float32Array(0) : C.coords.subarray(0, m * 6);
  }

  const MOD = {
    id: 'yunmen',
    COL,
    MAXSEG,
    lines,
    stats: { segs: 0 },
    build(scene, HZ, THREE, opts) {
      opts = opts || {};
      this.clip = Array.isArray(opts.clip) && opts.clip.length ? opts.clip : null;
      this.HZ = HZ;
      this.C = HZ ? compile(HZ) : null;
      this.buf = new Float32Array(MAXSEG * 6);
      if (this.C) this.buf.set(this.C.coords.subarray(0, Math.min(this.C.n, MAXSEG) * 6));
      this.n = 0;
      this.key = null;
      this.obj = null;
      THREE = THREE || ROOT.THREE;
      if (THREE && scene) {
        const g = new THREE.BufferGeometry();
        this.attr = new THREE.BufferAttribute(this.buf, 3);
        this.attr.setUsage && this.attr.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('position', this.attr);
        g.setDrawRange(0, 0);
        const matOpts = Object.assign(
          { color: COL, transparent: true, opacity: 0.92 },
          this.clip ? { clippingPlanes: this.clip } : {}
        );
        this.obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial(matOpts));
        this.obj.frustumCulled = false;
        this.obj.renderOrder = 5;
        this.obj.name = 'hz-yunmen';
        scene.add(this.obj);
      }
      return this;
    },
    update(t, cam) {
      if (!this.HZ) return 0;
      const key = Math.floor(t * 4);
      if (key === this.key) return this.n;
      this.key = key;
      const C = this.C || (this.C = compile(this.HZ));
      const n = Math.min(countAt(C, t), MAXSEG);
      this.n = n;
      this.stats.segs = n;
      if (this.obj) {
        this.obj.geometry.setDrawRange(0, n * 2);   // 缓冲在 build 时一次写满（按出现时刻排序），这里只改绘制范围，不重传
      }
      return n;
    },
  };

  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(MOD);
})();
