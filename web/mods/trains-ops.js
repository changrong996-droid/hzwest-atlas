// 开通运营期多股道列车交会与黄昏灯光模块（任务 #36 / V3）· g-liuzhijie
// 用途：在 t >= HZ.P.OPEN（1101）开通运营期，复用 HZ.makeTrain() 复兴号 8 编组流线几何，
//       在南场（湖杭场）与北场（杭临绩场）多条独立股道上调度双向错峰进出站与会车，
//       并联动黄昏光照曲线渐亮客室车窗暖光、车头双白灯与车尾双红灯（零额外动态光源，墨线/实景双模式协调）。
// 接口：window.HZ_MODS.push({ id:'trains-ops', build(scene, HZ, THREE, opts), update(t, cam), schedule(t, HZ), lightLevel(t, HZ) })
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const RAIL_DY = 0.48;          // 轮缘贴轨面高程偏移（与 hzview.js 既有首趟列车一致：deckTop + 0.48 m）
  const X_FAR = 1550;            // 站外隐藏/出场界限（m）
  const DEFAULT_HOST_Z = 54.5;   // 既有首趟列车 G9528 默认股道（46.5 + 8）

  const clamp01 = v => Math.max(0, Math.min(1, v));
  const sm = (a, b, x) => {
    const u = clamp01((x - a) / (b - a));
    return u * u * (3 - 2 * u);
  };
  const easeOut = u => 1 - Math.pow(1 - clamp01(u), 2.2);
  const easeIn = u => Math.pow(clamp01(u), 2.1);

  // 黄昏灯光曲线（与 hzview.js setDusk 同步：OPEN-3 → OPEN+14 渐入蓝调黄昏）
  function lightLevel(t, HZ) {
    const open = (HZ && HZ.P && HZ.P.OPEN != null) ? HZ.P.OPEN : 1101;
    if (t < open) return 0;
    const dusk = sm(open - 3, open + 14, t);
    const pv = ROOT.__pv;
    const blend = (pv && typeof pv.blend === 'number') ? clamp01(pv.blend) : sm(open - 12, open + 3, t);
    return clamp01(0.18 + 0.82 * dusk) * clamp01(0.35 + 0.65 * blend);
  }

  // 从 HZ.tracks(Y) 精确选取南/北场独立股道，避开既有首趟列车所在股道
  function buildRoster(HZ) {
    const sTracks = HZ.tracks(HZ.YARDS.S); // 11 线（南场湖杭场）
    const nTracks = HZ.tracks(HZ.YARDS.N); // 9 线（北场杭临绩场）
    const pv = ROOT.__pv;
    const hostZ = (pv && Array.isArray(pv.train) && Number.isFinite(pv.train[2])) ? pv.train[2] : DEFAULT_HOST_Z;

    const pick = (list, preferred) => {
      for (const z of preferred) {
        const hit = list.find(v => Math.abs(v - z) < 0.05 && Math.abs(v - hostZ) > 1.0);
        if (hit != null) return hit;
      }
      return list.find(v => Math.abs(v - hostZ) > 1.0) || list[0];
    };

    // 5 列错峰调度：覆盖南场/北场、东西双向（dir=-1 向西，dir=+1 向东），含进站停靠、发车出站与快车交会
    // 车长约定（同 HZ.makeTrain）：局部头车鼻尖=-10.5，尾车鼻尖=+199.05，站台中心停靠 tx≈-94（dir=-1）或 +94（dir=+1）
    return [
      {
        id: 'G7321', yard: 'S', z: pick(sTracks, [16.5, 32.5, 38.5]), dir: 1,
        // 向东进站停靠（靠近云谷南侧首线，穿越机掠过视野极佳）
        mode: 'arrive_dwell_depart',
        tEnter: 1.5, tStop: 10.0, tDepart: 18.0, tExit: 27.5, stopX: 94,
      },
      {
        id: 'G9532', yard: 'S', z: pick(sTracks, [82.5, 76.5, 98.5]), dir: -1,
        // 南场中区向西快车通过（与 G7321 / G9528 形成交会）
        mode: 'pass',
        tEnter: 4.0, tExit: 19.5,
      },
      {
        id: 'G7506', yard: 'S', z: pick(sTracks, [104.5, 120.5, 126.5]), dir: 1,
        // 南场外侧向东晚高峰进站停靠至结尾
        mode: 'arrive_dwell_depart',
        tEnter: 9.0, tStop: 18.5, tDepart: 31.0, tExit: 40.0, stopX: 96,
      },
      {
        id: 'G1868', yard: 'N', z: pick(nTracks, [-16.5, -32.5, -38.5]), dir: -1,
        // 北场云谷北侧首线向西进站停靠（与南场 G7321 隔云谷对称呼应）
        mode: 'arrive_dwell_depart',
        tEnter: 2.5, tStop: 12.0, tDepart: 22.0, tExit: 32.0, stopX: -94,
      },
      {
        id: 'G1965', yard: 'N', z: pick(nTracks, [-76.5, -82.5, -60.5]), dir: 1,
        // 北场中区向东发车与交会
        mode: 'pass',
        tEnter: 8.5, tExit: 25.0,
      },
    ];
  }

  // 纯数学运动学解算（无 DOM / 无 THREE 依赖，供无头校验与 update 共用）
  function evalTrain(tr, dt, HZ) {
    const T = HZ.TRAIN || { nose: 10.5, len: 199.05 };
    const y = HZ.P.deckTop + RAIL_DY;
    if (dt < tr.tEnter || dt > tr.tExit) {
      return { id: tr.id, yard: tr.yard, z: tr.z, y, dir: tr.dir, visible: false, x: 9000, xMin: 9000, xMax: 9000, speed: 0 };
    }
    let x;
    if (tr.mode === 'pass') {
      const u = clamp01((dt - tr.tEnter) / (tr.tExit - tr.tEnter));
      x = tr.dir === -1 ? (X_FAR - 2 * X_FAR * u) : (-X_FAR + 2 * X_FAR * u);
    } else {
      const xStart = tr.dir === -1 ? X_FAR : -X_FAR;
      const xEnd = tr.dir === -1 ? -X_FAR : X_FAR;
      if (dt <= tr.tStop) {
        const u = easeOut((dt - tr.tEnter) / (tr.tStop - tr.tEnter));
        x = xStart + (tr.stopX - xStart) * u;
      } else if (dt <= tr.tDepart) {
        x = tr.stopX;
      } else {
        const u = easeIn((dt - tr.tDepart) / (tr.tExit - tr.tDepart));
        x = tr.stopX + (xEnd - tr.stopX) * u;
      }
    }
    // 车体世界系 X 占据区间：dir=-1 时 [x - nose, x + len]；dir=+1（rotY=π）时 [x - len, x + nose]
    const xMin = tr.dir === -1 ? (x - T.nose) : (x - T.len);
    const xMax = tr.dir === -1 ? (x + T.len) : (x + T.nose);
    return { id: tr.id, yard: tr.yard, z: tr.z, y, dir: tr.dir, visible: true, x, xMin, xMax };
  }

  function schedule(t, HZ) {
    const open = (HZ && HZ.P && HZ.P.OPEN != null) ? HZ.P.OPEN : 1101;
    const roster = buildRoster(HZ);
    if (t < open) {
      return roster.map(tr => ({ id: tr.id, yard: tr.yard, z: tr.z, y: HZ.P.deckTop + RAIL_DY, dir: tr.dir, visible: false, x: 9000, xMin: 9000, xMax: 9000 }));
    }
    const dt = t - open;
    return roster.map(tr => evalTrain(tr, dt, HZ));
  }

  function gbToMeshGeo(gb, THREE) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(gb.P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(gb.N, 3));
    if (gb.C && gb.C.length === gb.P.length) {
      const cArr = new Float32Array(gb.C.length);
      const col = new THREE.Color();
      for (let i = 0; i < gb.C.length; i += 3) {
        if (typeof col.setRGB === 'function') {
          col.setRGB(gb.C[i], gb.C[i + 1], gb.C[i + 2], THREE.SRGBColorSpace);
          cArr[i] = col.r; cArr[i + 1] = col.g; cArr[i + 2] = col.b;
        } else {
          cArr[i] = gb.C[i]; cArr[i + 1] = gb.C[i + 1]; cArr[i + 2] = gb.C[i + 2];
        }
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cArr, 3));
    }
    return geo;
  }

  function gbToLineGeo(gb, THREE) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(gb.L || [], 3));
    return geo;
  }

  let st = null;

  const M = {
    id: 'trains-ops',
    RAIL_DY,
    schedule,
    lightLevel,

    build(scene, HZ, THREE, opts) {
      const roster = buildRoster(HZ);
      st = { HZ, roster, root: null, entries: [], mats: null };
      if (!scene || !THREE) return;

      const clip = (opts && Array.isArray(opts.clip) && opts.clip.length) ? opts.clip : null;
      const { g: trainGeo, gw: trainWGeo } = HZ.makeTrain();
      const T = HZ.TRAIN || { nose: 10.5, len: 199.05 };

      const bodyGeo = gbToMeshGeo(trainGeo, THREE);
      const winGeo = gbToMeshGeo(trainWGeo, THREE);
      const inkGeo = gbToLineGeo(trainGeo, THREE);
      const lampGeo = new THREE.BoxGeometry(0.55, 0.24, 0.36);

      const matBase = o => (clip ? Object.assign({}, o, { clippingPlanes: clip }) : o);
      const bodyMat = new THREE.MeshStandardMaterial(matBase({ vertexColors: true, roughness: 0.36, metalness: 0.25 }));
      const winMat = new THREE.MeshStandardMaterial(matBase({
        color: 0x262933, emissive: 0xffcf82, emissiveIntensity: 0.2, roughness: 0.2, metalness: 0.2,
      }));
      const inkMat = new THREE.LineBasicMaterial(matBase({ color: 0x1d1a17, transparent: true, opacity: 0.72, depthWrite: false }));
      const headMat = new THREE.MeshBasicMaterial(matBase({ color: 0xfff6dc, transparent: true, opacity: 0.9 }));
      const tailMat = new THREE.MeshBasicMaterial(matBase({ color: 0xe62922, transparent: true, opacity: 0.9 }));

      const root = new THREE.Group();
      root.name = 'trains-ops';
      root.visible = false;
      scene.add(root);

      const entries = [];
      for (const tr of roster) {
        const grp = new THREE.Group();
        grp.name = 'train-' + tr.id;
        grp.visible = false;
        grp.rotation.y = tr.dir === 1 ? Math.PI : 0;

        const body = new THREE.Mesh(bodyGeo, bodyMat);
        const win = new THREE.Mesh(winGeo, winMat);
        const ink = new THREE.LineSegments(inkGeo, inkMat);
        grp.add(body, win, ink);

        // 头灯（位于局部头车鼻部 x = -T.nose + 1.2）与尾红灯（位于局部尾车鼻部 x = T.len - 1.2）
        const lamps = [];
        for (const sz of [-0.72, 0.72]) {
          const hl = new THREE.Mesh(lampGeo, headMat);
          hl.position.set(-T.nose + 1.2, 1.38, sz);
          const tl = new THREE.Mesh(lampGeo, tailMat);
          tl.position.set(T.len - 1.2, 1.38, sz);
          grp.add(hl, tl);
          lamps.push(hl, tl);
        }

        root.add(grp);
        entries.push({ tr, grp, ink, lamps });
      }

      st.root = root;
      st.entries = entries;
      st.mats = { bodyMat, winMat, inkMat, headMat, tailMat };
    },

    update(t) {
      if (!st) return 0;
      const HZ = st.HZ;
      const open = (HZ && HZ.P && HZ.P.OPEN != null) ? HZ.P.OPEN : 1101;
      if (t < open) {
        if (st.root) st.root.visible = false;
        return 0;
      }

      const dt = t - open;
      const kLight = lightLevel(t, HZ);
      const pv = ROOT.__pv;
      const blend = (pv && typeof pv.blend === 'number') ? clamp01(pv.blend) : sm(open - 12, open + 3, t);

      if (st.mats) {
        st.mats.winMat.emissiveIntensity = 0.15 + 1.65 * kLight;
        st.mats.headMat.opacity = 0.30 + 0.70 * kLight;
        st.mats.tailMat.opacity = 0.30 + 0.70 * kLight;
        st.mats.inkMat.opacity = Math.max(0.12, 0.72 * (1 - 0.8 * blend));
      }

      let active = 0;
      for (const e of st.entries) {
        const pose = evalTrain(e.tr, dt, HZ);
        e.grp.visible = pose.visible;
        if (pose.visible) {
          active++;
          e.grp.position.set(pose.x, pose.y, pose.z);
          const showLamps = kLight > 0.15;
          for (const lm of e.lamps) lm.visible = showLamps;
        }
      }
      if (st.root) st.root.visible = active > 0;
      return active;
    },
  };

  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(M);
})();
