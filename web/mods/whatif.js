// 试拆支承反事实推演模块（HZ_MODS id='whatif'）· g-wangmushan
// 依据：docs/decisions.md（2026-11-11 第④条）——入口放在构件信息卡里，不占主画面；
// 抽掉选中支承构件时，基于 HZ 引擎真实物理支承图（p.supP）做纯只读 BFS 级联连通性搜索：
// 失去全部在场支承的下游构件以警示琥珀红线框微垂示意（dy = -0.35 * depth），并弹出 R1 违规计数；
// 松手 / 取消选中立刻 100% 复原，绝不篡改原始 HZ 排程。
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const MAX_BOXES = 256;
  const MAX_DEPTH = 6;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function isAlive(p, t) {
    if (!p) return false;
    if (t < p.st) return false;
    if (p.rm && p.rm[0] >= 0 && t >= p.rm[0] + (p.rm[1] || 0)) return false;
    return true;
  }

  function overlapsBox(bb, box, pad) {
    if (!bb || !bb.min || !bb.max || !box) return false;
    const mn = bb.min, mx = bb.max;
    return mx[0] >= box[0] - pad && mn[0] <= box[3] + pad &&
           mx[1] >= box[1] - pad && mn[1] <= box[4] + pad &&
           mx[2] >= box[2] - pad && mn[2] <= box[5] + pad;
  }

  // 构建（并缓存）反向支承邻接表：supPart -> [dependentParts]
  function getDownMap(HZ) {
    if (!HZ) return new Map();
    if (HZ.__whatifDownMap) return HZ.__whatifDownMap;
    const mp = new Map();
    for (const a of HZ.acts || []) {
      for (const p of a.parts || []) {
        if (!p || !p.supP) continue;
        const sups = Array.isArray(p.supP) ? p.supP : Array.from(p.supP);
        for (const sp of sups) {
          if (!sp) continue;
          let arr = mp.get(sp);
          if (!arr) { arr = []; mp.set(sp, arr); }
          arr.push(p);
        }
      }
    }
    HZ.__whatifDownMap = mp;
    return mp;
  }

  // 核心纯函数：反事实试拆推演（纯只读，不改 HZ 任何状态）
  function simulateRemove(part, t, rel, HZ) {
    const empty = { removed: [], failed: [], byAct: {}, violations: 0, maxDepth: 0 };
    if (!part || !HZ || !Array.isArray(HZ.acts)) return empty;

    // 1. 找出当前时刻 t 在场、位于选中 part.box 内的被拆构件
    const removed = new Set();
    if (Array.isArray(part.box) && part.box.length === 6) {
      for (const a of HZ.acts) {
        for (const p of a.parts || []) {
          if (!isAlive(p, t)) continue;
          if (overlapsBox(p.bb, part.box, 0.4)) removed.add(p);
        }
      }
    }
    // 兜底：若按 box 未命中且传入了明确 actKey（如工序级试拆）
    if (!removed.size && part.actKey && HZ.K && HZ.K[part.actKey]) {
      for (const p of HZ.K[part.actKey].parts || []) {
        if (isAlive(p, t)) removed.add(p);
      }
    }
    if (!removed.size) return empty;

    // 2. 沿反向支承表 BFS：若某在场下游构件的所有在场支承都已消失，则判定失稳并继续向上传播
    const downMap = getDownMap(HZ);
    const lost = new Set(removed);
    const failed = [];
    const byAct = {};
    const queue = [];
    let maxDepth = 0;

    for (const r of removed) {
      for (const dep of downMap.get(r) || []) queue.push({ p: dep, depth: 1 });
    }
    // 同时检查临时设施的 a.serves（如 jig1/jigL1 服务 asm1/lift1，rig 服务 lift1..3/merge/wlift/head）
    const removedActs = new Set(Array.from(removed).map(r => r.act && r.act.key).filter(Boolean));
    for (const ak of removedActs) {
      const act = HZ.K && HZ.K[ak];
      if (!act || act.kind !== "temp" || !Array.isArray(act.serves)) continue;
      // 仅当在规定拆除前（t < act.rm.start）提前拆除，才触发临时设施服务的对象失稳
      if (act.rm && t >= act.rm.start) continue;
      for (const sv of act.serves) {
        if (!sv) continue;
        const targets = (sv.parts && sv.parts.length) ? sv.parts
          : (sv.liftZone && HZ.K["asm" + sv.liftZone] ? HZ.K["asm" + sv.liftZone].parts : []);
        for (const p of targets || []) {
          if (p && !lost.has(p) && isAlive(p, t)) queue.push({ p, depth: 1, byActSup: true });
        }
      }
    }

    const queued = new Set();
    while (queue.length && failed.length < MAX_BOXES) {
      const { p, depth, byActSup } = queue.shift();
      if (!p || depth > MAX_DEPTH || lost.has(p) || !isAlive(p, t)) continue;
      let unstable = false;
      if (byActSup) {
        unstable = true;
      } else {
        const sups = p.supP ? (Array.isArray(p.supP) ? p.supP : Array.from(p.supP)) : [];
        if (!sups.length) continue;
        let aliveSups = 0, stillSupported = false;
        for (const sp of sups) {
          if (!isAlive(sp, t)) continue;
          aliveSups++;
          if (!lost.has(sp)) { stillSupported = true; break; }
        }
        unstable = aliveSups > 0 && !stillSupported;
      }
      if (unstable) {
        lost.add(p);
        const actKey = (p.act && p.act.key) || 'unknown';
        byAct[actKey] = (byAct[actKey] || 0) + 1;
        if (depth > maxDepth) maxDepth = depth;
        failed.push({
          act: actKey,
          depth,
          bb: p.bb,
          dropY: -Math.min(1.2, 0.35 * depth),
        });
        for (const nxt of downMap.get(p) || []) {
          if (!lost.has(nxt) && !queued.has(nxt)) {
            queued.add(nxt);
            queue.push({ p: nxt, depth: depth + 1 });
          }
        }
      }
    }

    return {
      removed: Array.from(removed),
      failed,
      byAct,
      violations: failed.length,
      maxDepth,
    };
  }

  // 把一个包围盒写入 12 条线框边（24 顶点 = 72 float）
  function writeBoxEdges(arr, offset, mn, mx, dy) {
    const x0 = mn[0], y0 = mn[1] + dy, z0 = mn[2];
    const x1 = mx[0], y1 = mx[1] + dy, z1 = mx[2];
    const E = [
      x0,y0,z0, x1,y0,z0,  x1,y0,z0, x1,y0,z1,  x1,y0,z1, x0,y0,z1,  x0,y0,z1, x0,y0,z0,
      x0,y1,z0, x1,y1,z0,  x1,y1,z0, x1,y1,z1,  x1,y1,z1, x0,y1,z1,  x0,y1,z1, x0,y1,z0,
      x0,y0,z0, x0,y1,z0,  x1,y0,z0, x1,y1,z0,  x1,y0,z1, x1,y1,z1,  x0,y0,z1, x0,y1,z1,
    ];
    for (let i = 0; i < E.length; i++) arr[offset + i] = E[i];
  }

  const state = {
    HZ: null,
    THREE: null,
    active: false,
    curPart: null,
    curRel: null,
    curT: NaN,
    lastSim: null,
    group: null,
    geo: null,
    posArr: null,
    elBanner: null,
    elBtn: null,
  };

  function ensureStyle() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function' || document.getElementById('hz-whatif-css')) return;
    const st = document.createElement('style');
    st.id = 'hz-whatif-css';
    st.textContent =
      '#hz-whatif-banner{position:absolute;left:50%;top:14px;transform:translateX(-50%);max-width:min(92%,540px);padding:7px 14px;border-radius:16px;background:rgba(179,32,42,.92);color:#fff;font:600 12.5px/1.4 var(--sans,system-ui,sans-serif);box-shadow:0 4px 14px rgba(179,32,42,.35);pointer-events:auto;display:flex;align-items:center;gap:10px}' +
      '#hz-whatif-banner[hidden]{display:none}' +
      '#hz-whatif-banner button{border:1px solid rgba(255,255,255,.55);background:transparent;color:#fff;border-radius:10px;padding:2px 8px;font-size:12px;cursor:pointer}' +
      'button[data-a="whatif"]{color:#b3202a!important;border-color:rgba(179,32,42,.45)!important}' +
      'button[data-a="whatif"].on{background:#b3202a!important;color:#fff!important}';
    document.head.appendChild(st);
  }

  function ensureBanner(root) {
    if (!root || typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    ensureStyle();
    if (!state.elBanner) {
      const b = document.createElement('div');
      b.id = 'hz-whatif-banner';
      b.hidden = true;
      b.addEventListener('click', e => {
        if (e.target && e.target.tagName === 'BUTTON') { e.stopPropagation(); clearSim(); }
      });
      root.appendChild(b);
      state.elBanner = b;
    }
    return state.elBanner;
  }

  function renderSim(sim) {
    state.lastSim = sim;
    if (!sim || !sim.failed.length) {
      if (state.group) state.group.visible = false;
      if (state.geo) state.geo.setDrawRange(0, 0);
      if (state.elBanner) state.elBanner.hidden = true;
      return;
    }
    if (state.group && state.geo && state.posArr) {
      const n = Math.min(sim.failed.length, MAX_BOXES);
      for (let i = 0; i < n; i++) {
        const f = sim.failed[i];
        if (f.bb && f.bb.min && f.bb.max) writeBoxEdges(state.posArr, i * 72, f.bb.min, f.bb.max, f.dropY);
      }
      state.geo.attributes.position.needsUpdate = true;
      state.geo.setDrawRange(0, n * 24);
      state.group.visible = true;
    }
    if (state.elBanner) {
      const topActs = Object.entries(sim.byAct).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}×${v}`).join('、');
      state.elBanner.innerHTML =
        `<span>⚠ 违反支承规则 R1：提前拆除将致 <b>${sim.violations}</b> 件失稳（${esc(topActs)}）</span>` +
        '<button type="button">复原</button>';
      state.elBanner.hidden = false;
    }
  }

  function triggerSim() {
    if (!state.HZ || !state.curPart || !Number.isFinite(state.curT)) return null;
    const sim = simulateRemove(state.curPart, state.curT, state.curRel, state.HZ);
    state.active = sim.violations > 0;
    renderSim(sim);
    if (state.elBtn) state.elBtn.classList.toggle('on', state.active);
    if (G.__pv && typeof G.__pv.render === 'function') G.__pv.render();
    return sim;
  }

  function clearSim() {
    state.active = false;
    state.lastSim = null;
    if (state.group) state.group.visible = false;
    if (state.geo) state.geo.setDrawRange(0, 0);
    if (state.elBanner) state.elBanner.hidden = true;
    if (state.elBtn) state.elBtn.classList.remove('on');
    if (G.__pv && typeof G.__pv.render === 'function') G.__pv.render();
  }

  // 非侵入式挂入 info.js 构件信息卡底部按钮区（不占主画面）
  function attachCardButton(root, simPreview) {
    if (!root || typeof root.querySelector !== 'function' || !simPreview || simPreview.violations <= 0) return;
    ensureStyle();
    const card = root.querySelector('.hz-info');
    if (!card) return;
    let bar = card.querySelector('.hz-info-b');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'hz-info-b';
      card.appendChild(bar);
    }
    const old = bar.querySelector('button[data-a="whatif"]');
    if (old) old.remove();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.a = 'whatif';
    btn.textContent = `试拆（${simPreview.violations}件失稳）`;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (state.active) clearSim();
      else triggerSim();
    });
    bar.appendChild(btn);
    state.elBtn = btn;
  }

  const MOD = {
    id: 'whatif',
    MAX_BOXES,
    simulateRemove,
    triggerSim,
    clearSim,
    state,
    build(scene, HZ, THREE, opts) {
      state.HZ = HZ;
      state.THREE = THREE;
      if (!scene || !THREE || !THREE.BufferGeometry) return;
      const clip = (opts && opts.clip) || [];
      const grp = new THREE.Group();
      grp.name = 'mod-whatif';
      grp.visible = false;
      const posArr = new Float32Array(MAX_BOXES * 72);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geo.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({
        color: 0xe65100, transparent: true, opacity: 0.92,
        depthTest: false, depthWrite: false, clippingPlanes: clip,
      });
      const lines = new THREE.LineSegments(geo, mat);
      lines.frustumCulled = false;
      lines.renderOrder = 14;
      grp.add(lines);
      scene.add(grp);
      state.group = grp;
      state.geo = geo;
      state.posArr = posArr;
    },
    pick(part, _xy, ctx) {
      clearSim();
      state.curPart = part || null;
      state.curRel = (ctx && ctx.rel) || null;
      state.curT = ctx && typeof ctx.t === 'number' ? ctx.t : NaN;
      if (!state.HZ || !state.curPart || !Number.isFinite(state.curT)) return;
      const root = ctx && ctx.root;
      if (root) ensureBanner(root);
      const preview = simulateRemove(state.curPart, state.curT, state.curRel, state.HZ);
      if (preview.violations > 0 && root) {
        // 等 info.js 同轮渲染卡片完毕后挂入按钮
        if (typeof setTimeout === 'function') setTimeout(() => attachCardButton(root, preview), 0);
        else attachCardButton(root, preview);
      }
    },
    unpick() {
      clearSim();
      state.curPart = null;
      state.curRel = null;
      state.curT = NaN;
      state.elBtn = null;
    },
    update() { /* 仅在用户主动触发试拆时渲染，平时零开销 */ },
  };

  (G.HZ_MODS = G.HZ_MODS || []).push(MOD);
  G.HZ_WHATIF = MOD;
})();
