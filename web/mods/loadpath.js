// 3D 传力脉络可视化模块（HZ_MODS id='loadpath'）· g-wangmushan
// 选中任意构件时，基于 HZ 引擎真实物理支承链（p.supP）与 HZ.rel（ctx.rel.up），
// 从选中构件沿重力方向逐层向下高亮传力主干至基础（永久结构朱砂红、临时胎架/支撑琥珀橙）。
// 预分配缓冲、零每帧分配、支持剖切平面 clip、unpick 立刻隐藏。
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const MAX_SEGS = 256;
  const MAX_DEPTH = 8;
  const MAX_ROOT_BRANCH = 4;
  const MAX_STEP_BRANCH = 2;
  const TEMP_RE = /^(jig|rig|tower|tcrane|crane|ycrane|brace)/i;

  function isAlive(p, t) {
    if (!p) return false;
    if (t < p.st) return false;
    if (p.rm && p.rm[0] >= 0 && t >= p.rm[0] + (p.rm[1] || 0)) return false;
    return true;
  }

  function centerOf(p) {
    if (p && Array.isArray(p.c) && p.c.length === 3) return p.c;
    if (p && p.bb && p.bb.min && p.bb.max) {
      const mn = p.bb.min, mx = p.bb.max;
      return [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    }
    return null;
  }

  function boxCenter(box) {
    if (!Array.isArray(box) || box.length !== 6) return null;
    return [(box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2];
  }

  function dist2XZ(a, b) {
    const dx = a[0] - b[0], dz = a[2] - b[2];
    return dx * dx + dz * dz;
  }

  function overlapsBox(bb, box, pad) {
    if (!bb || !bb.min || !bb.max || !box) return false;
    const mn = bb.min, mx = bb.max;
    return mx[0] >= box[0] - pad && mn[0] <= box[3] + pad &&
           mx[1] >= box[1] - pad && mn[1] <= box[4] + pad &&
           mx[2] >= box[2] - pad && mn[2] <= box[5] + pad;
  }

  // 核心纯函数：计算某选中构件在时刻 t 的向下传力主干线段
  function traceLoadPath(part, t, rel, HZ) {
    if (!part || !HZ || !HZ.K) return { segs: [], nodes: [], reachedBase: false, maxDepth: 0 };
    const startPt = boxCenter(part.box);
    if (!startPt) return { segs: [], nodes: [], reachedBase: false, maxDepth: 0 };

    const segs = [];
    const nodes = [startPt];
    const visited = new Set();
    let maxDepth = 0;
    let minY = startPt[1];

    // 1. 收集起点直连的引擎支承构件（优先 rel.up 里 rel==='sup' 的工序，再辅以 box 命中自带 supP 的构件）
    const seedParts = [];
    const upActs = new Set();
    if (rel && Array.isArray(rel.up)) {
      for (const u of rel.up) {
        if (u && u.rel === 'sup' && u.act && HZ.K[u.act]) upActs.add(u.act);
      }
    }

    for (const actKey of upActs) {
      const a = HZ.K[actKey];
      if (!a || !Array.isArray(a.parts)) continue;
      const cand = [];
      for (const p of a.parts) {
        if (!isAlive(p, t)) continue;
        const c = centerOf(p);
        if (!c || c[1] > startPt[1] + 2.0) continue;
        cand.push({ p, c, d2: dist2XZ(startPt, c) });
      }
      cand.sort((x, y) => x.d2 - y.d2);
      for (const item of cand.slice(0, MAX_STEP_BRANCH)) seedParts.push(item.p);
    }

    // 若 rel 未给出直接支承，则在 box 容差内找在场且有 supP 的引擎构件
    if (!seedParts.length && Array.isArray(HZ.acts)) {
      const cand = [];
      for (const a of HZ.acts) {
        for (const p of a.parts || []) {
          if (!isAlive(p, t) || !p.supP) continue;
          if (!overlapsBox(p.bb, part.box, 1.0)) continue;
          const c = centerOf(p);
          if (c) cand.push({ p, c, d2: dist2XZ(startPt, c) });
        }
      }
      cand.sort((x, y) => x.d2 - y.d2);
      for (const item of cand.slice(0, MAX_ROOT_BRANCH)) seedParts.push(item.p);
    }

    // 去重并按水平距离取最多 MAX_ROOT_BRANCH 个主干入口
    const uniqSeeds = [];
    const seenSeed = new Set();
    seedParts.sort((a, b) => dist2XZ(startPt, centerOf(a) || startPt) - dist2XZ(startPt, centerOf(b) || startPt));
    for (const p of seedParts) {
      if (seenSeed.has(p)) continue;
      seenSeed.add(p);
      uniqSeeds.push(p);
      if (uniqSeeds.length >= MAX_ROOT_BRANCH) break;
    }

    // 2. 沿 p.supP 递归向下直达基础（严格向下防环）
    function walk(p, fromPt, fromAct, depth) {
      if (!p || depth > MAX_DEPTH || segs.length >= MAX_SEGS) return;
      const c = centerOf(p);
      if (!c) return;
      const actKey = (p.act && p.act.key) || '';
      const temp = TEMP_RE.test(actKey);
      if (fromPt) {
        segs.push({ from: fromPt, to: c, fromAct, toAct: actKey, temp });
        nodes.push(c);
        if (c[1] < minY) minY = c[1];
        if (depth > maxDepth) maxDepth = depth;
      }
      if (visited.has(p)) return;
      visited.add(p);

      const sups = p.supP ? (Array.isArray(p.supP) ? p.supP : Array.from(p.supP)) : [];
      if (!sups.length) return;
      const next = [];
      for (const sp of sups) {
        if (!isAlive(sp, t) || visited.has(sp)) continue;
        const sc = centerOf(sp);
        // 严格向下或同标高（容差 +0.5 m），防止横向/向上环路
        if (!sc || sc[1] > c[1] + 0.5) continue;
        next.push({ p: sp, d2: dist2XZ(c, sc) });
      }
      next.sort((x, y) => x.d2 - y.d2);
      for (const item of next.slice(0, MAX_STEP_BRANCH)) {
        walk(item.p, c, actKey, depth + 1);
      }
    }

    for (const sp of uniqSeeds) {
      walk(sp, startPt, part.id || '', 1);
    }

    const reachedBase = segs.some(s => s.toAct === 'found' || s.to[1] <= 1.0);
    return { segs, nodes, reachedBase, maxDepth, minY };
  }

  // 运行态与预分配 Three.js 缓冲
  const state = {
    HZ: null,
    THREE: null,
    group: null,
    lineGeo: null,
    posArr: null,
    colArr: null,
    ptGeo: null,
    ptArr: null,
    curPart: null,
    curRel: null,
    curT: NaN,
    lastResult: null,
  };

  function upload(res) {
    state.lastResult = res;
    if (!state.group || !state.lineGeo || !state.posArr || !state.colArr) return;
    if (!res || !res.segs.length) {
      state.group.visible = false;
      state.lineGeo.setDrawRange(0, 0);
      if (state.ptGeo) state.ptGeo.setDrawRange(0, 0);
      return;
    }
    const n = Math.min(res.segs.length, MAX_SEGS);
    for (let i = 0; i < n; i++) {
      const s = res.segs[i];
      const o = i * 6;
      state.posArr[o] = s.from[0]; state.posArr[o + 1] = s.from[1]; state.posArr[o + 2] = s.from[2];
      state.posArr[o + 3] = s.to[0]; state.posArr[o + 4] = s.to[1]; state.posArr[o + 5] = s.to[2];
      // 永久结构朱砂红 (0.85, 0.17, 0.20)，临时胎架/支撑琥珀橙 (0.90, 0.52, 0.10)
      const r = s.temp ? 0.90 : 0.85, g = s.temp ? 0.52 : 0.17, b = s.temp ? 0.10 : 0.20;
      state.colArr[o] = r; state.colArr[o + 1] = g; state.colArr[o + 2] = b;
      state.colArr[o + 3] = r; state.colArr[o + 4] = g; state.colArr[o + 5] = b;
    }
    state.lineGeo.attributes.position.needsUpdate = true;
    state.lineGeo.attributes.color.needsUpdate = true;
    state.lineGeo.setDrawRange(0, n * 2);

    if (state.ptGeo && state.ptArr) {
      const m = Math.min(res.nodes.length, MAX_SEGS);
      for (let i = 0; i < m; i++) {
        state.ptArr[i * 3] = res.nodes[i][0];
        state.ptArr[i * 3 + 1] = res.nodes[i][1];
        state.ptArr[i * 3 + 2] = res.nodes[i][2];
      }
      state.ptGeo.attributes.position.needsUpdate = true;
      state.ptGeo.setDrawRange(0, m);
    }
    state.group.visible = true;
  }

  const MOD = {
    id: 'loadpath',
    MAX_SEGS,
    traceLoadPath,
    state,
    build(scene, HZ, THREE, opts) {
      state.HZ = HZ;
      state.THREE = THREE;
      if (!scene || !THREE || !THREE.BufferGeometry) return;
      const clip = (opts && opts.clip) || [];
      const grp = new THREE.Group();
      grp.name = 'mod-loadpath';
      grp.visible = false;

      const posArr = new Float32Array(MAX_SEGS * 6);
      const colArr = new Float32Array(MAX_SEGS * 6);
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      lineGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      lineGeo.setDrawRange(0, 0);
      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.95,
        depthTest: false, depthWrite: false, clippingPlanes: clip,
      });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      lines.frustumCulled = false;
      lines.renderOrder = 12;
      grp.add(lines);

      const ptArr = new Float32Array(MAX_SEGS * 3);
      const ptGeo = new THREE.BufferGeometry();
      ptGeo.setAttribute('position', new THREE.BufferAttribute(ptArr, 3));
      ptGeo.setDrawRange(0, 0);
      const ptMat = new THREE.PointsMaterial({
        color: 0xd92b34, size: 5, sizeAttenuation: false,
        depthTest: false, depthWrite: false, clippingPlanes: clip,
      });
      const pts = new THREE.Points(ptGeo, ptMat);
      pts.frustumCulled = false;
      pts.renderOrder = 13;
      grp.add(pts);

      scene.add(grp);
      state.group = grp;
      state.lineGeo = lineGeo;
      state.posArr = posArr;
      state.colArr = colArr;
      state.ptGeo = ptGeo;
      state.ptArr = ptArr;
    },
    pick(part, _xy, ctx) {
      state.curPart = part || null;
      state.curRel = (ctx && ctx.rel) || null;
      state.curT = ctx && typeof ctx.t === 'number' ? ctx.t : NaN;
      if (!state.HZ || !state.curPart || !Number.isFinite(state.curT)) { upload(null); return; }
      upload(traceLoadPath(state.curPart, state.curT, state.curRel, state.HZ));
    },
    unpick() {
      state.curPart = null;
      state.curRel = null;
      state.curT = NaN;
      upload(null);
    },
    update(t) {
      if (!state.curPart || !state.HZ) return;
      if (Math.abs(t - state.curT) < 0.25) return;
      state.curT = t;
      upload(traceLoadPath(state.curPart, t, state.curRel, state.HZ));
    },
  };

  (G.HZ_MODS = G.HZ_MODS || []).push(MOD);
  G.HZ_LOADPATH = MOD;
})();
