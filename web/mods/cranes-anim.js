'use strict';
// ===== V2 塔吊与履带吊动作同步及夜间警示模块（web/mods/cranes-anim.js · HZ_MODS）=====
// 任务 #35（docs/tasks/vehicles-machinery.md V2）：
// 1. 塔吊动作真实同步：按 HZ.acts 中分配给每台塔吊（p.crane >= 0）的构件 sweep/st 序列，实时联动回转角 yaw、小车变幅 r 与吊钩高度 hookY，钩头对准构件中心 p.c，不空转；
// 2. 履带吊吊装同步：对当前在吊构件（p.crane === -1 && p.crawl），实时渲染臂顶→构件中心吊索与吊钩落位动画；
// 3. 航空障碍红灯与吊臂探照光效：在场塔吊塔顶与臂端挂错峰微闪航空障碍红灯；黄昏/实景模式下正在吊装的塔吊小车下方投射柔和作业探照光锥（墨线模式自动隐藏光锥，保持纸上墨线克制）；
// 4. 严守物理规则与范围契约：不改 HZ 排程与塔吊坐标（R9 塔吊回转净空 = 0 不变），接入 opts.clip 剖切平面，并遵循 __pv.scope.cranes 分图显隐。
(function (G) {
  const MAX_CRAWL = 32;
  const COL = {
    ink: 0x1d1a17,
    inkBusy: 0xb3202a,
    litCable: 0x262a30,
    beacon: 0xe62b2b,
    beaconGlow: 0xff5a4a,
    cone: 0xffe6b0,
  };

  const sm = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a)));
    return t * t * (3 - 2 * t);
  };
  const angLerp = (a, b, f) => {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * f;
  };

  // 构建 12 台塔吊作业队列 + 履带吊作业表（纯数据，Node 与浏览器共用）
  function buildSchedule(HZ) {
    const K = HZ.K || {};
    const cranes = (HZ.cranes || []).map((c, k) => {
      const seq = [];
      for (const a of HZ.acts || []) {
        for (const p of a.parts || []) {
          if (p.crane === k && p.st != null && p.du > 0 && p.c) {
            const dx = p.c[0] - c.x, dz = p.c[2] - c.z;
            seq.push({
              p,
              key: a.key,
              t0: p.st,
              t1: p.st + p.du,
              t: p.st + p.du * 0.5,
              sweep: p.sweep || 0,
              yaw: Math.atan2(dz, dx),
              r: Math.hypot(dx, dz),
              cx: p.c[0],
              cz: p.c[2],
              top: p.top != null ? p.top : (p.geo ? p.geo.max[1] : 10),
            });
          }
        }
      }
      seq.sort((a, b) => (a.t0 - b.t0) || (a.sweep - b.sweep));
      const act = K[c.key] || null;
      return Object.assign({}, c, { idx: k, seq, act });
    });

    const crawlers = [];
    for (const a of HZ.acts || []) {
      for (const p of a.parts || []) {
        if (p.crane === -1 && p.crawl && p.st != null && p.du > 0 && p.c) {
          crawlers.push({
            p,
            key: a.key,
            t0: p.st,
            t1: p.st + p.du,
            cx: p.c[0],
            cz: p.c[2],
            top: p.top != null ? p.top : (p.geo ? p.geo.max[1] : 10),
            sx: p.crawl[0],
            sz: p.crawl[1],
          });
        }
      }
    }
    crawlers.sort((a, b) => a.t0 - b.t0);
    return { cranes, crawlers, openDay: (HZ.P && HZ.P.OPEN != null) ? HZ.P.OPEN : 1101 };
  }

  // 计算第 k 台塔吊在时刻 t 的同步姿态（与 hzview craneState 同源且精确对准当前落位构件中心）
  function towerState(c, t) {
    if (!c.act || !c.act.rm) return null;
    const live = t >= c.act.start + c.act.dur * 0.5 && t < c.act.rm.start + c.act.rm.dur * 0.5;
    if (!live) return null;
    const q = c.seq;
    let yaw = c.yaw0, r = c.L * 0.55, hookY = c.jy - 6, busy = false, target = null;
    if (q.length) {
      const cur = q.find(e => t >= e.t0 && t < e.t1);
      if (cur) {
        busy = true;
        target = cur;
        yaw = cur.yaw;
        r = cur.r;
        // 构件吊装落位曲线：0..0.25 提离过渡 → 0.25..0.85 平稳下放至构件顶面 → 0.85..1.0 摘钩微提
        const u = (t - cur.t0) / Math.max(0.05, cur.t1 - cur.t0);
        const hiY = Math.max(cur.top + 8, Math.min(c.jy - 5, cur.top + 18));
        const loY = Math.min(c.jy - 4, cur.top + 1.4);
        if (u < 0.25) hookY = hiY;
        else if (u < 0.85) hookY = hiY + (loY - hiY) * sm(0.25, 0.85, u);
        else hookY = loY + (hiY - loY) * 0.35 * sm(0.85, 1.0, u);
      } else {
        const i = q.findIndex(e => e.t > t);
        if (i < 0) { yaw = q[q.length - 1].yaw; r = q[q.length - 1].r; }
        else if (i === 0) { yaw = angLerp(c.yaw0, q[0].yaw, sm(q[0].t0 - 15, q[0].t0, t)); r = q[0].r; }
        else {
          const a = q[i - 1], b = q[i], f = sm(a.t1, Math.max(a.t1 + 0.01, b.t0), t);
          yaw = angLerp(a.yaw, b.yaw, f);
          r = a.r + (b.r - a.r) * f;
        }
      }
    }
    const clampedR = Math.max(6, Math.min(c.L - 2, r));
    const hx = c.x + Math.cos(yaw) * clampedR;
    const hz = c.z + Math.sin(yaw) * clampedR;
    const tipX = c.x + Math.cos(yaw) * c.L;
    const tipZ = c.z + Math.sin(yaw) * c.L;
    return { idx: c.idx, yaw, r: clampedR, hx, hz, hookY, topY: c.jy - 0.5, tipX, tipZ, mastTop: c.top + 0.8, busy, target };
  }

  // 获取时刻 t 正在吊装的履带吊动作列表
  function activeCrawlers(crawlers, t, scopeKeys) {
    const out = [];
    for (let i = 0; i < crawlers.length && out.length < MAX_CRAWL; i++) {
      const e = crawlers[i];
      if (e.t0 > t) break;
      if (t >= e.t1) continue;
      if (scopeKeys && !scopeKeys.has(e.key)) continue;
      const u = (t - e.t0) / Math.max(0.05, e.t1 - e.t0);
      const boomY = Math.max(e.top + 14, 34);
      const loY = e.top + 1.2;
      const hookY = boomY - 3 + (loY - (boomY - 3)) * sm(0.15, 0.85, u);
      out.push({ key: e.key, cx: e.cx, cz: e.cz, boomY, hookY, u });
    }
    return out;
  }

  const MOD = {
    id: 'cranes-anim',
    buildSchedule,
    towerState,
    activeCrawlers,
    stat: { towers: 0, liveTowers: 0, busyTowers: 0, activeCrawlers: 0, beacons: 0, cones: 0 },
    build(scene, HZ, THREE, opts) {
      this.HZ = HZ;
      this.sched = buildSchedule(HZ);
      this.stat.towers = this.sched.cranes.length;
      if (!scene || !THREE) return;

      const clip = (opts && opts.clip) || [];
      const grp = new THREE.Group();
      grp.name = 'hz-cranes-anim';
      scene.add(grp);
      this.group = grp;

      const maxT = Math.max(1, this.sched.cranes.length);
      // 1. 吊钩与小车滑轮组（InstancedMesh）
      const hookCap = maxT * 2 + MAX_CRAWL;
      const hGeo = new THREE.BoxGeometry(1.4, 0.9, 1.4);
      const hMat = new THREE.MeshBasicMaterial({ color: COL.ink, clippingPlanes: clip });
      const hMesh = new THREE.InstancedMesh(hGeo, hMat, hookCap);
      hMesh.frustumCulled = false; hMesh.count = 0; hMesh.renderOrder = 3;
      grp.add(hMesh);
      this.hMesh = hMesh; this.hMat = hMat;

      // 2. 起吊双钢索（预分配 LineSegments：每台塔吊 2 根 + 每台履带吊 1 根）
      const maxSegs = maxT * 2 + MAX_CRAWL;
      const cPos = new Float32Array(maxSegs * 6);
      const cGeo = new THREE.BufferGeometry();
      const cAttr = new THREE.BufferAttribute(cPos, 3);
      cGeo.setAttribute('position', cAttr);
      cGeo.setDrawRange(0, 0);
      const cMat = new THREE.LineBasicMaterial({ color: COL.ink, transparent: true, opacity: 0.85, clippingPlanes: clip });
      const cObj = new THREE.LineSegments(cGeo, cMat);
      cObj.frustumCulled = false; cObj.renderOrder = 3;
      grp.add(cObj);
      this.cObj = cObj; this.cPos = cPos; this.cAttr = cAttr; this.cMat = cMat;

      // 3. 塔顶与臂端航空障碍红灯（InstancedMesh，每台塔吊 2 盏）
      const bGeo = new THREE.SphereGeometry(0.65, 8, 6);
      const bMat = new THREE.MeshBasicMaterial({ color: COL.beacon, transparent: true, opacity: 0.95, clippingPlanes: clip });
      const bMesh = new THREE.InstancedMesh(bGeo, bMat, maxT * 2);
      bMesh.frustumCulled = false; bMesh.count = 0; bMesh.renderOrder = 4;
      grp.add(bMesh);
      this.bMesh = bMesh; this.bMat = bMat;

      // 4. 吊臂作业探照光锥（仅实景/黄昏模式下对在吊塔吊显示）
      const lGeo = new THREE.CylinderGeometry(0.8, 7.5, 1, 10, 1, true);
      const lMat = new THREE.MeshBasicMaterial({ color: COL.cone, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clip });
      const lMesh = new THREE.InstancedMesh(lGeo, lMat, maxT);
      lMesh.frustumCulled = false; lMesh.count = 0; lMesh.visible = false; lMesh.renderOrder = 3;
      grp.add(lMesh);
      this.lMesh = lMesh; this.lMat = lMat;

      this._m4 = new THREE.Matrix4();
      this._vP = new THREE.Vector3();
      this._vS = new THREE.Vector3();
      this._q0 = new THREE.Quaternion();
    },
    update(t) {
      if (!this.sched) return 0;
      const pv = G.__pv;
      const sc = pv && pv.scope;
      const scopeOn = !!(sc && sc.on);
      const scopeCranes = scopeOn && Array.isArray(sc.cranes) ? sc.cranes : null;
      const scopeKeys = scopeOn && Array.isArray(sc.keys) ? new Set(sc.keys) : null;
      const lit = !!(pv && pv.st && pv.st.pref === 'lit') || (typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('lit'));
      const dusk = Math.max(0, Math.min(1, (t - (this.sched.openDay - 40)) / 40));

      let liveT = 0, busyT = 0, hN = 0, sN = 0, bN = 0, lN = 0;
      const nowSec = (typeof performance !== 'undefined' && performance.now) ? performance.now() * 0.001 : t * 10;

      const setInst = (mesh, idx, x, y, z, sx, sy, sz) => {
        if (!mesh) return;
        this._vP.set(x, y, z);
        this._vS.set(sx, sy, sz);
        this._m4.compose(this._vP, this._q0, this._vS);
        mesh.setMatrixAt(idx, this._m4);
      };
      const putSeg = (ax, ay, az, bx, by, bz) => {
        if (!this.cPos) return;
        const o = sN * 6;
        this.cPos[o] = ax; this.cPos[o + 1] = ay; this.cPos[o + 2] = az;
        this.cPos[o + 3] = bx; this.cPos[o + 4] = by; this.cPos[o + 5] = bz;
        sN++;
      };

      for (const c of this.sched.cranes) {
        if (scopeCranes && !scopeCranes[c.idx]) continue;
        const st = towerState(c, t);
        if (!st) continue;
        liveT++;
        if (st.busy) busyT++;

        // 小车与吊钩实体
        setInst(this.hMesh, hN++, st.hx, st.topY, st.hz, 1.5, 0.7, 1.5);
        setInst(this.hMesh, hN++, st.hx, st.hookY, st.hz, 1.1, 1.1, 1.1);

        // 双起吊钢索（偏置 ±0.28 m 防单线过细）
        const ox = -Math.sin(st.yaw) * 0.28, oz = Math.cos(st.yaw) * 0.28;
        putSeg(st.hx + ox, st.topY, st.hz + oz, st.hx + ox, st.hookY, st.hz + oz);
        putSeg(st.hx - ox, st.topY, st.hz - oz, st.hx - ox, st.hookY, st.hz - oz);

        // 塔顶 + 臂端航空障碍红灯微闪
        const pulse = 0.65 + 0.35 * Math.sin(nowSec * 3.2 + c.idx * 1.1);
        const bs = (lit || dusk > 0.2 ? 1.15 : 0.75) * pulse;
        setInst(this.bMesh, bN++, c.x, st.mastTop, c.z, bs, bs, bs);
        setInst(this.bMesh, bN++, st.tipX, st.topY + 0.9, st.tipZ, bs * 0.85, bs * 0.85, bs * 0.85);

        // 黄昏/实景下的吊臂作业探照光锥（仅在吊时开启）
        if (st.busy && (lit || dusk > 0.25)) {
          const coneH = Math.max(6, st.topY - st.hookY + 4);
          setInst(this.lMesh, lN++, st.hx, st.topY - coneH * 0.5, st.hz, 1, coneH, 1);
        }
      }

      // 履带吊当前在吊构件吊索与吊钩同步
      const crList = activeCrawlers(this.sched.crawlers, t, scopeKeys);
      for (const cr of crList) {
        setInst(this.hMesh, hN++, cr.cx, cr.hookY, cr.cz, 1.0, 1.0, 1.0);
        putSeg(cr.cx, cr.boomY, cr.cz, cr.cx, cr.hookY, cr.cz);
      }

      this.stat.liveTowers = liveT;
      this.stat.busyTowers = busyT;
      this.stat.activeCrawlers = crList.length;
      this.stat.beacons = bN;
      this.stat.cones = lN;

      if (this.hMesh) {
        this.hMesh.count = hN; this.hMesh.visible = hN > 0;
        if (this.hMesh.instanceMatrix) this.hMesh.instanceMatrix.needsUpdate = true;
        if (this.hMat && this.hMat.color && this.hMat.color.setHex) this.hMat.color.setHex(lit ? COL.litCable : (busyT > 0 ? COL.inkBusy : COL.ink));
      }
      if (this.cObj) {
        this.cObj.geometry.setDrawRange(0, sN * 2); this.cObj.visible = sN > 0;
        if (this.cAttr) this.cAttr.needsUpdate = true;
        if (this.cMat && this.cMat.color && this.cMat.color.setHex) this.cMat.color.setHex(lit ? COL.litCable : (busyT > 0 ? COL.inkBusy : COL.ink));
      }
      if (this.bMesh) {
        this.bMesh.count = bN; this.bMesh.visible = bN > 0;
        if (this.bMesh.instanceMatrix) this.bMesh.instanceMatrix.needsUpdate = true;
        if (this.bMat && this.bMat.color && this.bMat.color.setHex) {
          this.bMat.color.setHex(lit || dusk > 0.2 ? COL.beaconGlow : COL.beacon);
          this.bMat.opacity = lit || dusk > 0.2 ? 0.96 : 0.72;
        }
      }
      if (this.lMesh) {
        this.lMesh.count = lN; this.lMesh.visible = lN > 0;
        if (this.lMesh.instanceMatrix) this.lMesh.instanceMatrix.needsUpdate = true;
      }
      return liveT + crList.length;
    }
  };

  (G.HZ_MODS = G.HZ_MODS || []).push(MOD);
  if (typeof module !== 'undefined' && module.exports) module.exports = MOD;
})(typeof window !== 'undefined' ? window : globalThis);
