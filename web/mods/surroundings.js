// 杭州西站周边远景生长聚合模块（HZ_MODS 脚手架）· g-liuzhijie
// 用途：聚合 window.HZ_ENV_LAYERS 中各独立周边图层（铁路高架、快速路匝道、南北综合体、云城肌理），
//       按 3 级圈层透明度合并为 3 个单缓冲 THREE.LineSegments，随时间轴 t 单调生长（O(log N)）。
// 显隐：仅在 S-000（总图）与 S-501（开通）显示，其余分图自动隐藏，不干扰施工特写。
// 校验：node tools/hz/check_surroundings.js
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const COL = 0x1c1a17;
  const RING_OPACITY = { 1: 0.36, 2: 0.24, 3: 0.14 };
  const MAX_PER_RING = 30000;
  const VISIBLE_SHEETS = { 'S-000': true, 'S-501': true };

  function makeApi(bucket) {
    const add = (tOn, x0, y0, z0, x1, y1, z1) => {
      bucket.push({ t: tOn, c: [x0, y0, z0, x1, y1, z1] });
    };
    const addPhased = (t0, t1, x0, y0, z0, x1, y1, z1, step) => {
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const n = Math.max(2, Math.round(len / (step || 16)));
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
    const box = (t0, t1, x0, y0, z0, x1, y1, z1, step) => {
      const s = step || 24;
      const c = [
        [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
        [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
      ];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        addPhased(t0, t1, c[i][0], c[i][1], c[i][2], c[j][0], c[j][1], c[j][2], s);
        addPhased(t0, t1, c[4 + i][0], c[4 + i][1], c[4 + i][2], c[4 + j][0], c[4 + j][1], c[4 + j][2], s);
        addPhased(t0, t1, c[i][0], c[i][1], c[i][2], c[4 + i][0], c[4 + i][1], c[4 + i][2], s);
      }
    };
    return { add, addPhased, box };
  }

  function compile(HZ) {
    const layers = Array.isArray(ROOT.HZ_ENV_LAYERS) ? ROOT.HZ_ENV_LAYERS : [];
    const key = layers.map(l => l.id + ':' + l.ring).join('|') + '@' + HZ.P.OPEN;
    if (HZ._surroundingsCache && HZ._surroundingsCache.key === key) return HZ._surroundingsCache;

    const raw = { 1: [], 2: [], 3: [] };
    for (const layer of layers) {
      if (!layer || typeof layer.build !== 'function') continue;
      const ring = RING_OPACITY[layer.ring] ? layer.ring : 2;
      layer.build(HZ, makeApi(raw[ring]));
    }

    const rings = {};
    for (const r of [1, 2, 3]) {
      const list = raw[r];
      list.sort((a, b) => a.t - b.t);
      const n = Math.min(list.length, MAX_PER_RING);
      const times = new Float32Array(n);
      const pos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        times[i] = list[i].t;
        const c = list[i].c, o = i * 6;
        pos[o] = c[0]; pos[o + 1] = c[1]; pos[o + 2] = c[2];
        pos[o + 3] = c[3]; pos[o + 4] = c[4]; pos[o + 5] = c[5];
      }
      rings[r] = { times, pos, count: n };
    }

    const out = { key, rings, layerIds: layers.map(l => l.id) };
    HZ._surroundingsCache = out;
    return out;
  }

  function countAt(times, t) {
    let lo = 0, hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (times[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function shouldShow() {
    const sh = ROOT.__pv && ROOT.__pv.sheet;
    return !sh || !!VISIBLE_SHEETS[sh];
  }

  let st = null;

  const mod = {
    id: 'surroundings',
    layers() {
      return (Array.isArray(ROOT.HZ_ENV_LAYERS) ? ROOT.HZ_ENV_LAYERS : []).slice();
    },
    lines(HZ, t, ring) {
      const data = compile(HZ);
      if (ring && data.rings[ring]) {
        const b = data.rings[ring];
        return b.pos.subarray(0, countAt(b.times, t) * 6);
      }
      let total = 0;
      const slices = [];
      for (const r of [1, 2, 3]) {
        const b = data.rings[r];
        const n = countAt(b.times, t);
        if (n > 0) {
          slices.push(b.pos.subarray(0, n * 6));
          total += n * 6;
        }
      }
      const out = new Float32Array(total);
      let off = 0;
      for (const s of slices) { out.set(s, off); off += s.length; }
      return out;
    },
    build(scene, HZ, THREE, opts) {
      const data = compile(HZ);
      st = { data, meshes: {}, lastN: { 1: -1, 2: -1, 3: -1 }, lastShow: null };
      if (!scene || !THREE) return;
      const clip = opts && Array.isArray(opts.clip) && opts.clip.length ? opts.clip : null;
      for (const r of [1, 2, 3]) {
        const b = data.rings[r];
        if (!b.count) continue;
        const geo = new THREE.BufferGeometry();
        const attr = new THREE.BufferAttribute(b.pos, 3);
        geo.setAttribute('position', attr);
        geo.setDrawRange(0, 0);
        const matOpts = { color: COL, transparent: true, opacity: RING_OPACITY[r], depthWrite: false };
        if (clip) matOpts.clippingPlanes = clip;
        const mat = new THREE.LineBasicMaterial(matOpts);
        const mesh = new THREE.LineSegments(geo, mat);
        mesh.name = 'surroundings-ring-' + r;
        mesh.frustumCulled = false;
        scene.add(mesh);
        st.meshes[r] = mesh;
      }
    },
    update(t) {
      if (!st) return 0;
      const show = shouldShow();
      let sum = 0;
      for (const r of [1, 2, 3]) {
        const b = st.data.rings[r];
        const n = show ? countAt(b.times, t) : 0;
        sum += n;
        const mesh = st.meshes[r];
        if (mesh && (n !== st.lastN[r] || show !== st.lastShow)) {
          mesh.visible = n > 0;
          mesh.geometry.setDrawRange(0, n * 2);
        }
        st.lastN[r] = n;
      }
      st.lastShow = show;
      return sum;
    },
  };

  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(mod);
})();
