'use strict';
// ===== A3 四角上盖综合体与站台雨棚立面优化（web/mods/tod-detail.js · HZ_MODS）=====
// 任务 #31（docs/tasks/arch-refinement.md A3）：
// 1. 四角上盖综合体（HZ.K.tod）：按各层真实 st/du 逐层生长——幕墙 3.8 m 模数竖梃与横挺腰线、退台屋顶女儿墙与设备间格栅、开通黄昏暖色窗格内透发光（彻底改善灰盒观感）；
// 2. 站台雨棚（HZ.K.canopyS / canopyN）：沿外缘与云谷边补双道檐口铝板收口线、底面次梁分格与雨棚下方柱头斜撑；
// 3. 地面层落客高架匝道衔接示意：站房四角外侧高架落客坡道与护栏墨线（避开铁路股道与云谷 |z|<14 净空）；
// 4. 零穿模、不改 HZ 排程，遵循 opts.clip 剖切、分图 scope 隐藏与墨线/实景双模式配色；O(log N) setDrawRange 更新，update < 0.2 ms。
(function (G) {
  const COL = {
    ink: 0x1d1a17,
    inkSub: 0x5c554c,
    litMullion: 0x6f685c,
    litEdge: 0x3b3732,
    warm1: 0xffd996,
    warm2: 0xffe8b8,
  };
  const EPS = 0.08;   // 立面外偏防 Z-fighting（m）

  // 确定性哈希（0..1），用于窗格暖光随机分布
  const hash = (a, b, c) => {
    const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
    return x - Math.floor(x);
  };

  // 从 HZ.K.tod / canopyS / canopyN 实时编译全部线段与窗格，按出现时刻 t 升序排列
  function compile(HZ) {
    const tod = HZ && HZ.K && HZ.K.tod;
    const cS = HZ && HZ.K && HZ.K.canopyS;
    const cN = HZ && HZ.K && HZ.K.canopyN;
    if (!tod) return { lines: [], quads: [], towers: [], openDay: 1101 };
    const openDay = (HZ.P && HZ.P.OPEN != null) ? HZ.P.OPEN : 1101;
    const cacheKey = `${tod.start},${tod.end},${tod.parts.length},${cS ? cS.start : 0},${cN ? cN.start : 0},${openDay}`;
    if (HZ._todDetailCache && HZ._todDetailCache.key === cacheKey) return HZ._todDetailCache;

    const lines = []; // { t, c:[x0,y0,z0,x1,y1,z1], grp:'tod'|'canopy'|'ramp' }
    const quads = []; // { t, cx, cy, cz, sx, sy, sz, rotY, warm }
    const addL = (t, x0, y0, z0, x1, y1, z1, grp) => lines.push({ t, c: [x0, y0, z0, x1, y1, z1], grp });

    // ---------- 1. 四角上盖综合体：幕墙竖梃/腰线 + 退台屋顶 + 暖色窗格 ----------
    const towerMap = new Map();
    for (const p of tod.parts) {
      const b = p.geo;
      const sx = (b.min[0] + b.max[0]) > 0 ? 1 : -1;
      const sz = (b.min[2] + b.max[2]) > 0 ? 1 : -1;
      const tid = `${sx > 0 ? 'E' : 'W'}${sz > 0 ? 'S' : 'N'}`;
      if (!towerMap.has(tid)) towerMap.set(tid, { id: tid, sx, sz, glass: [], slabs: [], x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, yMax: -Infinity, tEnd: 0 });
      const tw = towerMap.get(tid);
      tw.x0 = Math.min(tw.x0, b.min[0]); tw.x1 = Math.max(tw.x1, b.max[0]);
      tw.z0 = Math.min(tw.z0, b.min[2]); tw.z1 = Math.max(tw.z1, b.max[2]);
      tw.yMax = Math.max(tw.yMax, b.max[1]);
      tw.tEnd = Math.max(tw.tEnd, (p.st || tod.start) + (p.du || 10));
      if (p.mat === 'todG') tw.glass.push(p); else tw.slabs.push(p);
    }

    const towers = [...towerMap.values()];
    for (let ti = 0; ti < towers.length; ti++) {
      const tw = towers[ti];
      // 1a) 每层玻璃幕墙：3.8 m 竖梃 + 中腰线 + 暖色窗格
      tw.glass.sort((a, b) => a.geo.min[1] - b.geo.min[1]);
      tw.glass.forEach((p, fi) => {
        const mn = p.geo.min, mx = p.geo.max;
        const x0 = mn[0] - EPS, x1 = mx[0] + EPS, y0 = mn[1], y1 = mx[1], z0 = mn[2] - EPS, z1 = mx[2] + EPS;
        const ym = (y0 + y1) * 0.5;
        const t0 = p.st != null ? p.st : tod.start, du = p.du || 20;
        const tMul = t0 + du * 0.45;
        const tWin = t0 + du * 0.85;
        // 横向中腰线（四周）
        addL(tMul, x0, ym, z0, x1, ym, z0, 'tod');
        addL(tMul, x1, ym, z0, x1, ym, z1, 'tod');
        addL(tMul, x1, ym, z1, x0, ym, z1, 'tod');
        addL(tMul, x0, ym, z1, x0, ym, z0, 'tod');
        // 南北向立面竖梃 + 窗格
        const nx = Math.max(8, Math.round((x1 - x0) / 3.8));
        const dx = (x1 - x0) / nx;
        for (let i = 0; i <= nx; i++) {
          const x = x0 + i * dx;
          addL(tMul, x, y0, z0, x, y1, z0, 'tod');
          addL(tMul, x, y0, z1, x, y1, z1, 'tod');
          if (i < nx) {
            const cx = x + dx * 0.5;
            if (hash(ti * 13 + fi, i, 1) > 0.52) quads.push({ t: tWin, cx, cy: ym, cz: z0 - 0.03, sx: dx * 0.78, sy: (y1 - y0) * 0.74, sz: 0.06, rotY: 0, warm: hash(ti, fi, i) > 0.4 ? 1 : 2 });
            if (hash(ti * 13 + fi, i, 2) > 0.52) quads.push({ t: tWin, cx, cy: ym, cz: z1 + 0.03, sx: dx * 0.78, sy: (y1 - y0) * 0.74, sz: 0.06, rotY: 0, warm: hash(ti + 7, fi, i) > 0.4 ? 1 : 2 });
          }
        }
        // 东西向立面竖梃 + 窗格
        const nz = Math.max(8, Math.round((z1 - z0) / 3.8));
        const dz = (z1 - z0) / nz;
        for (let j = 0; j <= nz; j++) {
          const z = z0 + j * dz;
          addL(tMul, x0, y0, z, x0, y1, z, 'tod');
          addL(tMul, x1, y0, z, x1, y1, z, 'tod');
          if (j < nz) {
            const cz = z + dz * 0.5;
            if (hash(ti * 17 + fi, j, 3) > 0.52) quads.push({ t: tWin, cx: x0 - 0.03, cy: ym, cz, sx: dz * 0.78, sy: (y1 - y0) * 0.74, sz: 0.06, rotY: Math.PI * 0.5, warm: hash(ti + 3, fi, j) > 0.4 ? 1 : 2 });
            if (hash(ti * 17 + fi, j, 4) > 0.52) quads.push({ t: tWin, cx: x1 + 0.03, cy: ym, cz, sx: dz * 0.78, sy: (y1 - y0) * 0.74, sz: 0.06, rotY: Math.PI * 0.5, warm: hash(ti + 9, fi, j) > 0.4 ? 1 : 2 });
          }
        }
      });

      // 1b) 退台屋顶细部：外圈女儿墙压顶 + 内缩 6 m 退台冠部 + 屋顶格栅（yMax .. yMax+2.6 m）
      const tTop = tw.tEnd - 12;
      const py0 = tw.yMax, py1 = tw.yMax + 1.1;
      const px0 = tw.x0, px1 = tw.x1, pz0 = tw.z0, pz1 = tw.z1;
      // 女儿墙顶圈
      addL(tTop, px0, py1, pz0, px1, py1, pz0, 'tod');
      addL(tTop, px1, py1, pz0, px1, py1, pz1, 'tod');
      addL(tTop, px1, py1, pz1, px0, py1, pz1, 'tod');
      addL(tTop, px0, py1, pz1, px0, py1, pz0, 'tod');
      for (const [cx, cz] of [[px0, pz0], [px1, pz0], [px1, pz1], [px0, pz1]]) addL(tTop, cx, py0, cz, cx, py1, cz, 'tod');
      // 退台冠部（内缩 7 m，高 2.6 m）
      const ix0 = px0 + 7, ix1 = px1 - 7, iz0 = pz0 + 7, iz1 = pz1 - 7, iy1 = tw.yMax + 2.6;
      addL(tTop + 4, ix0, py0, iz0, ix1, py0, iz0, 'tod'); addL(tTop + 4, ix1, py0, iz0, ix1, py0, iz1, 'tod');
      addL(tTop + 4, ix1, py0, iz1, ix0, py0, iz1, 'tod'); addL(tTop + 4, ix0, py0, iz1, ix0, py0, iz0, 'tod');
      addL(tTop + 4, ix0, iy1, iz0, ix1, iy1, iz0, 'tod'); addL(tTop + 4, ix1, iy1, iz0, ix1, iy1, iz1, 'tod');
      addL(tTop + 4, ix1, iy1, iz1, ix0, iy1, iz1, 'tod'); addL(tTop + 4, ix0, iy1, iz1, ix0, iy1, iz0, 'tod');
      for (const [cx, cz] of [[ix0, iz0], [ix1, iz0], [ix1, iz1], [ix0, iz1]]) addL(tTop + 4, cx, py0, cz, cx, iy1, cz, 'tod');
      // 冠部屋顶格栅（4 道纵向采光肋）
      for (let k = 1; k <= 4; k++) {
        const gx = ix0 + (ix1 - ix0) * (k / 5);
        addL(tTop + 6, gx, iy1, iz0, gx, iy1, iz1, 'tod');
      }
    }

    // ---------- 2. 站台雨棚立面收口、底面次梁与柱头斜撑（canopyS / canopyN）----------
    for (const act of [cS, cN]) {
      if (!act || !act.parts) continue;
      for (const p of act.parts) {
        const mn = p.geo.min, mx = p.geo.max;
        const x0 = mn[0], x1 = mx[0], y0 = mn[1], y1 = mx[1], z0 = mn[2], z1 = mx[2];
        const tOn = (p.st != null ? p.st : act.start) + (p.du || 10) * 0.65;
        const ym = (y0 + y1) * 0.5;
        // 外挑双道铝板檐口收口线（外缘 + 云谷边 + 东西端）
        const zOut = z1 > 0 ? z1 + 0.35 : z0 - 0.35;
        const zIn = z1 > 0 ? z0 - 0.15 : z1 + 0.15;
        addL(tOn, x0, y1 + 0.15, zOut, x1, y1 + 0.15, zOut, 'canopy');
        addL(tOn, x0, ym, zOut, x1, ym, zOut, 'canopy');
        addL(tOn, x0, y1 + 0.12, zIn, x1, y1 + 0.12, zIn, 'canopy');
        // 东西端边收口
        if (Math.abs(Math.abs(x0) - 225) < 2 || Math.abs(Math.abs(x0) - 125) < 2) addL(tOn, x0, ym, z0, x0, ym, z1, 'canopy');
        if (Math.abs(Math.abs(x1) - 225) < 2 || Math.abs(Math.abs(x1) - 125) < 2) addL(tOn, x1, ym, z0, x1, ym, z1, 'canopy');
        // 雨棚底面横向次梁分格（每 20 m 一道）
        const nRib = Math.max(2, Math.round((z1 - z0) / 22));
        for (let r = 1; r < nRib; r++) {
          const zr = z0 + (z1 - z0) * (r / nRib);
          addL(tOn, x0, y0 - 0.08, zr, x1, y0 - 0.08, zr, 'canopy');
        }
        // 站台雨棚柱头 V 形斜撑（y = 20.8 .. 22.8 m，位于雨棚下方、高于站台 14.5 m，不穿站台）
        const xm = (x0 + x1) * 0.5;
        for (let r = 1; r <= 3; r++) {
          const zc = z0 + (z1 - z0) * (r / 4);
          const yb = y0 - 2.0;
          addL(tOn, xm, yb, zc, xm - 2.4, y0, zc, 'canopy');
          addL(tOn, xm, yb, zc, xm + 2.4, y0, zc, 'canopy');
          addL(tOn, xm, yb, zc, xm, y0, zc - 2.4, 'canopy');
          addL(tOn, xm, yb, zc, xm, y0, zc + 2.4, 'canopy');
        }
      }
    }

    // ---------- 3. 地面层落客高架匝道衔接示意（站房四角外侧，避开股道与云谷）----------
    const tRamp = (cS ? cS.end : 540) + 40;
    const ramps = [
      { sx: -1, z0: 138, z1: 147 }, // 西南落客匝道
      { sx: 1, z0: 138, z1: 147 },  // 东南落客匝道
      { sx: -1, z0: -126, z1: -117 }, // 西北落客匝道
      { sx: 1, z0: -126, z1: -117 },  // 东北落客匝道
    ];
    for (const rm of ramps) {
      const xa = rm.sx * 225, xb = rm.sx * 278;
      const ya = 23.6, yb = 14.0;
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const u0 = i / segs, u1 = (i + 1) / segs;
        const x0 = xa + (xb - xa) * u0, x1 = xa + (xb - xa) * u1;
        const y0 = ya + (yb - ya) * u0, y1 = ya + (yb - ya) * u1;
        // 桥面两侧护栏与梁底
        addL(tRamp + i * 2, x0, y0, rm.z0, x1, y1, rm.z0, 'ramp');
        addL(tRamp + i * 2, x0, y0, rm.z1, x1, y1, rm.z1, 'ramp');
        addL(tRamp + i * 2, x0, y0 + 1.0, rm.z0, x1, y1 + 1.0, rm.z0, 'ramp');
        addL(tRamp + i * 2, x0, y0 + 1.0, rm.z1, x1, y1 + 1.0, rm.z1, 'ramp');
        if (i > 0 && i % 2 === 0) {
          // 桥墩双柱落地（y=0..y0）与横系梁
          addL(tRamp + i * 2, x0, 0, rm.z0 + 1.5, x0, y0, rm.z0 + 1.5, 'ramp');
          addL(tRamp + i * 2, x0, 0, rm.z1 - 1.5, x0, y0, rm.z1 - 1.5, 'ramp');
          addL(tRamp + i * 2, x0, y0 - 0.8, rm.z0, x0, y0 - 0.8, rm.z1, 'ramp');
        }
      }
      // 端头横线
      addL(tRamp + 12, xb, yb, rm.z0, xb, yb, rm.z1, 'ramp');
    }

    lines.sort((a, b) => a.t - b.t);
    quads.sort((a, b) => a.t - b.t);
    const out = { key: cacheKey, lines, quads, towers, openDay };
    HZ._todDetailCache = out;
    return out;
  }

  function upperBound(arr, t) {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (arr[mid].t <= t) lo = mid + 1; else hi = mid; }
    return lo;
  }

  const MOD = {
    id: 'tod-detail',
    compile,
    stat: { lines: 0, quads: 0, towers: 0, drawnLines: 0, drawnQuads: 0 },
    build(scene, HZ, THREE, opts) {
      this.HZ = HZ;
      this.data = compile(HZ);
      this.stat.lines = this.data.lines.length;
      this.stat.quads = this.data.quads.length;
      this.stat.towers = this.data.towers.length;
      if (!scene || !THREE) return;

      const clip = (opts && opts.clip) || [];
      const grp = new THREE.Group();
      grp.name = 'hz-tod-detail';
      scene.add(grp);
      this.group = grp;

      // 1. 静态预分配线段缓冲（O(log N) setDrawRange）
      const L = this.data.lines;
      const pos = new Float32Array(L.length * 6);
      for (let i = 0; i < L.length; i++) pos.set(L[i].c, i * 6);
      const lGeo = new THREE.BufferGeometry();
      lGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      lGeo.setDrawRange(0, 0);
      const lMat = new THREE.LineBasicMaterial({ color: COL.ink, transparent: true, opacity: 0.72, clippingPlanes: clip });
      const lObj = new THREE.LineSegments(lGeo, lMat);
      lObj.frustumCulled = false;
      lObj.renderOrder = 2;
      grp.add(lObj);
      this.lObj = lObj;
      this.lMat = lMat;

      // 2. 暖色窗格 InstancedMesh（1 draw call，开通黄昏/实景渐显）
      const Q = this.data.quads;
      if (Q.length && THREE.InstancedMesh && THREE.PlaneGeometry) {
        const qGeo = new THREE.PlaneGeometry(1, 1);
        const qMat = new THREE.MeshBasicMaterial({ color: COL.warm1, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false, clippingPlanes: clip });
        const qMesh = new THREE.InstancedMesh(qGeo, qMat, Q.length);
        qMesh.frustumCulled = false;
        qMesh.visible = false;
        qMesh.renderOrder = 2;
        const m4 = new THREE.Matrix4(), vPos = new THREE.Vector3(), vScl = new THREE.Vector3(), qRot = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < Q.length; i++) {
          const q = Q[i];
          vPos.set(q.cx, q.cy, q.cz);
          vScl.set(q.sx, q.sy, 1);
          if (qRot.setFromAxisAngle) qRot.setFromAxisAngle(up, q.rotY);
          m4.compose(vPos, qRot, vScl);
          qMesh.setMatrixAt(i, m4);
        }
        if (qMesh.instanceMatrix) qMesh.instanceMatrix.needsUpdate = true;
        qMesh.count = 0;
        grp.add(qMesh);
        this.qMesh = qMesh;
        this.qMat = qMat;
      }
      this._lastKey = '';
    },
    update(t) {
      if (!this.data) return 0;
      const pv = G.__pv;
      const sc = pv && pv.scope;
      // 分图范围启用且不包含 tod / canopy 时隐藏，不干扰地下/网架/屋面等分图
      const scopeHide = !!(sc && sc.on && Array.isArray(sc.keys) && !sc.keys.some(k => k === 'tod' || k === 'canopyS' || k === 'canopyN'));
      if (this.group) this.group.visible = !scopeHide;
      if (scopeHide) {
        this.stat.drawnLines = 0;
        this.stat.drawnQuads = 0;
        return 0;
      }

      const lit = !!(pv && pv.st && pv.st.pref === 'lit') || (typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('lit'));
      const openDay = this.data.openDay;
      // 开通前 12 天起随黄昏过渡渐亮窗格
      const glow = Math.max(0, Math.min(1, (t - (openDay - 12)) / 18));
      const key = `${Math.round(t * 2)}|${lit ? 1 : 0}|${Math.round(glow * 20)}`;
      if (this._lastKey === key) return this.stat.drawnLines;
      this._lastKey = key;

      const nl = upperBound(this.data.lines, t);
      this.stat.drawnLines = nl;
      if (this.lObj) {
        this.lObj.geometry.setDrawRange(0, nl * 2);
        this.lObj.visible = nl > 0;
        if (this.lMat && this.lMat.color && this.lMat.color.setHex) {
          this.lMat.color.setHex(lit ? COL.litMullion : COL.ink);
          this.lMat.opacity = lit ? 0.55 : 0.72;
        }
      }

      const nq = (lit || glow > 0.05) ? upperBound(this.data.quads, t) : 0;
      const qOp = lit ? Math.max(0.28, glow * 0.78) : glow * 0.55;
      this.stat.drawnQuads = (nq > 0 && qOp > 0.02) ? nq : 0;
      if (this.qMesh) {
        this.qMesh.count = nq;
        this.qMesh.visible = this.stat.drawnQuads > 0;
        if (this.qMat) this.qMat.opacity = qOp;
      }
      return nl;
    }
  };

  (G.HZ_MODS = G.HZ_MODS || []).push(MOD);
  if (typeof module !== 'undefined' && module.exports) module.exports = MOD;
})(typeof window !== 'undefined' ? window : globalThis);
