// 首屏缓慢开场与建筑内部穿越导览（HZ_MODS 模块）· g-wangmushan
// 依据：docs/proposals/g-wangmushan-first-10s-tour.md（v2）
// - 前 10 s 停在 S-000 缓慢播放，不切图；10–60 s 展开云谷低空穿行、S-301 图模跳转、x=39m 剖切与亮灯收官
// - 全部时刻用 <活动key>@<0..1比例> 表达，运行期按 HZ.K 动态解算
// - 沿用 ?noIntro + navigator.webdriver + 深链（#sheet / #focus / #camcfg）跳过自动开场
// - 复用宿主 4 事件拦截（pointerdown / wheel / keydown / touchstart）0 延迟让权
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ABORT_EVENTS = ['pointerdown', 'wheel', 'keydown', 'touchstart'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 解析 "<actKey>@<0..1>" → 模型天数 t
  function resolveT(expr, HZ) {
    if (typeof expr === 'number' && Number.isFinite(expr)) return expr;
    const m = /^([A-Za-z0-9_~-]+)@([0-9]*\.?[0-9]+)$/.exec(String(expr || '').trim());
    if (!m) return NaN;
    const a = HZ && HZ.K && HZ.K[m[1]];
    if (!a) return NaN;
    const r = Math.max(0, Math.min(1, parseFloat(m[2])));
    return a.start + (a.end - a.start) * r;
  }

  // 剧本定义（0–10 s 单图 S-000 缓播；10–60 s 穿行与核心魔术示范）
  const TOUR_BEATS = [
    {
      id: 'intro-grow',
      sec: [0, 5],
      sheet: 'S-000',
      mode: 'ink',
      cut: 0,
      t0: 'frameS@0.35',
      t1: 'floorS@1.0',
      cam0: { pos: [122, 82, 168], tgt: [0, 18, 0] },
      cam1: { pos: [92, 58, 128], tgt: [0, 20, 0] },
      caption: '3 年工期 · 1906 个构件按力学先后自己长出来',
    },
    {
      id: 'intro-roof',
      sec: [5, 10],
      sheet: 'S-000',
      mode: 'ink',
      cut: 0,
      t0: 'asm1@0',
      t1: 'wlift@1.0',
      cam0: { pos: [92, 58, 128], tgt: [0, 22, 0] },
      cam1: { pos: [112, 76, 156], tgt: [0, 32, 0] },
      caption: '1.3 万吨屋盖抬升就位 · 随时拖动或点图纸接管',
    },
    {
      id: 'cloud-fly',
      sec: [10, 22],
      sheet: 'S-000',
      mode: 'ink',
      cut: 0,
      t0: 'frameS@0.5',
      t1: 'floorS@1.0',
      // 实查验证：floorS/floorN 在 |z|<14 完全开洞；t<604 无 jigL2，|x|<=220 避开 x=±260 塔吊
      cam0: { pos: [-185, 28, 0], tgt: [120, 18, 0] },
      cam1: { pos: [185, 19, 0], tgt: [220, 18, 0] },
      caption: '穿过 28 米宽云谷 · 承轨层与候车厅在两侧展开',
    },
    {
      id: 's301-jump',
      sec: [22, 36],
      sheet: 'S-301',
      mode: 'ink',
      cut: 0,
      t0: 'lift1@0',
      t1: 'lift3@1.0',
      lifter: 22, // J23 (x=115, z=46.5)
      ripple: true,
      caption: '实际 206 台千斤顶同步发力 · 右图 32 组代表点位均可点选',
    },
    {
      id: 's301-cut',
      sec: [36, 48],
      sheet: 'S-301',
      mode: 'ink',
      cut: 1,
      t0: 'wlift@0.25',
      t1: 'wlift@1.0',
      cam0: { pos: [148, 72, 118], tgt: [39, 20, 0] },
      cam1: { pos: [136, 62, 102], tgt: [39, 20, 0] },
      caption: '沿站房切开剖面 · 一次看穿地下地铁到屋盖五层结构',
    },
    {
      id: 'open-lit',
      sec: [48, 60],
      sheet: 'S-000',
      mode: 'ink',
      modeAt: { frac: 0.65, mode: 'lit' },
      cut: 0,
      t0: 'clad@0',
      t1: 'open@1.0',
      cam0: { pos: [145, 78, 175], tgt: [0, 26, 0] },
      cam1: { pos: [125, 62, 150], tgt: [0, 26, 0] },
      caption: '屋面封闭并网 · 墨线褪去，亮灯迎来首班列车',
    },
  ];

  // 首轮精简为 2 个核心传送门
  const TOUR_PORTALS = [
    { id: 'roof', label: '钻进屋盖看提升', sheet: 'S-301', at: 'lift1@0.5', lifter: 22 },
    { id: 'cut', label: '一刀切开看五层', sheet: 'S-301', at: 'wlift@0.5', cut: 1 },
  ];

  // 沿用 ?noIntro + navigator.webdriver + 深链跳过自动开场
  function shouldAutoStart(loc, nav) {
    const L = loc || (G.location || { search: '', hash: '' });
    const N = nav || (G.navigator || { webdriver: false });
    if (/[?&]noIntro\b/.test(String(L.search || ''))) return false;
    if (N && N.webdriver) return false;
    const h = String(L.hash || '').replace(/^#/, '');
    if (h && /(?:^|&)(sheet|focus|camcfg)=[^&]+/.test(h)) return false;
    return true;
  }

  function lerp3(a, b, k) {
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }

  function sampleCam(beat, frac) {
    if (!beat || !beat.cam0 || !beat.cam1) return null;
    const k = Math.max(0, Math.min(1, frac));
    return { pos: lerp3(beat.cam0.pos, beat.cam1.pos, k), tgt: lerp3(beat.cam0.tgt, beat.cam1.tgt, k) };
  }

  // 运行态
  const state = {
    active: false,
    startedAt: 0,
    beatIdx: -1,
    modeSwitched: false,
    built: false,
    boundFallback: false,
    rafId: 0,
    pv: null,
    HZ: null,
    THREE: null,
    root: null,
    elCap: null,
    elRip: null,
    elBar: null,
  };

  function ensureStyle() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function' || document.getElementById('hz-tour-css')) return;
    const st = document.createElement('style');
    st.id = 'hz-tour-css';
    st.textContent =
      'body.tour-intro #calc,body.tour-intro #lede{opacity:0;pointer-events:none;transition:opacity .35s}' +
      '#hz-tour-cap{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);max-width:min(92%,560px);padding:7px 14px;border-radius:18px;background:rgba(24,22,20,.82);color:#fbf9f5;font:500 13px/1.4 var(--sans,system-ui,sans-serif);letter-spacing:.3px;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.18);pointer-events:none;transition:opacity .25s}' +
      '#hz-tour-cap[hidden]{display:none}' +
      '#hz-tour-rip{position:absolute;right:18px;top:50%;width:22px;height:22px;margin-top:-11px;border-radius:50%;border:2px solid #b3202a;background:rgba(179,32,42,.18);pointer-events:none;animation:hzTourRip 1.2s ease-out infinite}' +
      '#hz-tour-rip[hidden]{display:none}' +
      '@keyframes hzTourRip{0%{transform:scale(.6);opacity:.95}100%{transform:scale(2.2);opacity:0}}' +
      '#hz-tour-portals{position:absolute;left:12px;bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;pointer-events:auto}' +
      '#hz-tour-portals[hidden]{display:none}' +
      '#hz-tour-portals button{height:26px;padding:0 10px;border:1px solid rgba(28,25,22,.2);border-radius:13px;background:rgba(251,249,245,.92);color:#1c1916;font:500 12px/1 var(--sans,system-ui,sans-serif);cursor:pointer;white-space:nowrap}' +
      '#hz-tour-portals button:hover{border-color:#b3202a;color:#b3202a}' +
      'body.lit #hz-tour-portals button{background:rgba(18,20,26,.72);color:#f4efe6;border-color:rgba(255,255,255,.22)}';
    document.head.appendChild(st);
  }

  function ensureDom() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return null;
    const root = document.getElementById('mod-ui');
    if (!root) return null;
    ensureStyle();
    if (!state.elCap) {
      const cap = document.createElement('div');
      cap.id = 'hz-tour-cap';
      cap.hidden = true;
      root.appendChild(cap);
      state.elCap = cap;
    }
    if (!state.elRip) {
      const rip = document.createElement('div');
      rip.id = 'hz-tour-rip';
      rip.hidden = true;
      root.appendChild(rip);
      state.elRip = rip;
    }
    if (!state.elBar) {
      const bar = document.createElement('div');
      bar.id = 'hz-tour-portals';
      bar.innerHTML =
        TOUR_PORTALS.map(p => '<button type="button" data-p="' + esc(p.id) + '">' + esc(p.label) + '</button>').join('') +
        '<button type="button" data-p="__replay" title="重看穿越导览">▶ 导览</button>';
      bar.addEventListener('click', e => {
        const b = e.target && e.target.closest ? e.target.closest('button[data-p]') : null;
        if (!b) return;
        e.stopPropagation();
        const pid = b.dataset.p;
        if (pid === '__replay') start(0);
        else runPortal(pid);
      });
      root.appendChild(bar);
      state.elBar = bar;
    }
    state.root = root;
    return root;
  }

  function applyCam(pv, THREE, pos, tgt, flyMs) {
    if (!pv) return;
    if (flyMs && typeof pv.flyTo === 'function' && THREE && THREE.Vector3) {
      pv.flyTo(new THREE.Vector3(tgt[0], tgt[1], tgt[2]), new THREE.Vector3(pos[0], pos[1], pos[2]), flyMs);
      return;
    }
    if (pv.cam && pv.cam.position && pv.ctl && pv.ctl.target) {
      if (pv.st) pv.st.auto = false;
      pv.cam.position.set(pos[0], pos[1], pos[2]);
      pv.ctl.target.set(tgt[0], tgt[1], tgt[2]);
      if (typeof pv.ctl.update === 'function') pv.ctl.update();
      if (typeof pv.render === 'function') pv.render();
    }
  }

  function enterBeat(idx) {
    const beat = TOUR_BEATS[idx];
    const pv = state.pv, HZ = state.HZ;
    if (!beat || !pv || !HZ) return;
    state.beatIdx = idx;
    state.modeSwitched = false;
    if (beat.sheet && typeof pv.setSheet === 'function') {
      const cur = pv.TL && pv.TL.sheet;
      if (cur !== beat.sheet) pv.setSheet(beat.sheet);
    }
    if (typeof pv.opt === 'function' && beat.mode) pv.opt({ mode: beat.mode, play: false });
    if (typeof pv.setCut === 'function') pv.setCut(beat.cut ? 1 : 0);
    const t0 = resolveT(beat.t0, HZ);
    if (Number.isFinite(t0) && typeof pv.set === 'function') pv.set(t0);
    if (beat.lifter != null && typeof pv.focusLifter === 'function') pv.focusLifter(beat.lifter);
    else if (beat.cut && typeof pv.focusCut === 'function') pv.focusCut(1);
    else if (beat.cam0) applyCam(pv, state.THREE, beat.cam0.pos, beat.cam0.tgt, 700);
    if (state.elCap) { state.elCap.textContent = beat.caption; state.elCap.hidden = false; }
    if (state.elRip) state.elRip.hidden = !beat.ripple;
  }

  function step(nowMs) {
    if (!state.active) return;
    const elapsed = Math.max(0, (nowMs - state.startedAt) / 1000);
    const totalSec = TOUR_BEATS[TOUR_BEATS.length - 1].sec[1];
    if (elapsed >= totalSec) { stop('done'); return; }
    let idx = -1;
    for (let i = 0; i < TOUR_BEATS.length; i++) {
      if (elapsed >= TOUR_BEATS[i].sec[0] && elapsed < TOUR_BEATS[i].sec[1]) { idx = i; break; }
    }
    if (idx < 0) { stop('done'); return; }
    if (idx !== state.beatIdx) enterBeat(idx);
    const beat = TOUR_BEATS[idx];
    const frac = Math.max(0, Math.min(1, (elapsed - beat.sec[0]) / Math.max(0.001, beat.sec[1] - beat.sec[0])));
    const t0 = resolveT(beat.t0, state.HZ), t1 = resolveT(beat.t1, state.HZ);
    if (Number.isFinite(t0) && Number.isFinite(t1) && state.pv && typeof state.pv.set === 'function') {
      state.pv.set(t0 + (t1 - t0) * frac);
    }
    if (beat.cam0 && beat.cam1) {
      const c = sampleCam(beat, frac);
      if (c) applyCam(state.pv, state.THREE, c.pos, c.tgt, 0);
    }
    if (beat.modeAt && !state.modeSwitched && frac >= beat.modeAt.frac) {
      state.modeSwitched = true;
      if (state.pv && typeof state.pv.opt === 'function') state.pv.opt({ mode: beat.modeAt.mode });
    }
    if (typeof requestAnimationFrame === 'function') state.rafId = requestAnimationFrame(step);
  }

  function stop(reason) {
    if (!state.active && !reason) return false;
    const wasActive = state.active;
    state.active = false;
    state.beatIdx = -1;
    if (state.rafId && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(state.rafId); state.rafId = 0; }
    if (typeof document !== 'undefined' && document.body && document.body.classList) document.body.classList.remove('tour-intro');
    if (state.elCap) state.elCap.hidden = true;
    if (state.elRip) state.elRip.hidden = true;
    if (state.elBar) state.elBar.hidden = false;
    return wasActive;
  }

  function start(nowMs) {
    ensureDom();
    state.active = true;
    state.beatIdx = -1;
    state.modeSwitched = false;
    state.startedAt = nowMs != null ? nowMs : (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (typeof document !== 'undefined' && document.body && document.body.classList) document.body.classList.add('tour-intro');
    if (state.elBar) state.elBar.hidden = true;
    enterBeat(0);
    if (typeof requestAnimationFrame === 'function') state.rafId = requestAnimationFrame(step);
    return true;
  }

  function runPortal(id) {
    const p = TOUR_PORTALS.find(x => x.id === id);
    const pv = state.pv, HZ = state.HZ;
    if (!p || !pv || !HZ) return false;
    stop('portal');
    if (p.sheet && typeof pv.setSheet === 'function') pv.setSheet(p.sheet);
    const t = resolveT(p.at, HZ);
    if (Number.isFinite(t) && typeof pv.set === 'function') pv.set(t);
    if (p.lifter != null && typeof pv.focusLifter === 'function') pv.focusLifter(p.lifter);
    else if (p.cut && typeof pv.focusCut === 'function') pv.focusCut(1);
    return true;
  }

  function onUserAbort(e) {
    if (!state.active) return;
    if (e && e.target && state.elBar && typeof state.elBar.contains === 'function' && state.elBar.contains(e.target)) return;
    stop(e && e.type || 'user');
  }

  // 兜底监听（宿主未将 onTourAbort 接到第 953 行 4 事件拦截前生效）
  function bindAbortFallback() {
    if (state.boundFallback || typeof addEventListener !== 'function') return;
    state.boundFallback = true;
    for (const ev of ABORT_EVENTS) addEventListener(ev, onUserAbort, { capture: true, passive: true });
  }

  const MOD = {
    id: 'tour',
    ABORT_EVENTS,
    TOUR_BEATS,
    TOUR_PORTALS,
    resolveT,
    shouldAutoStart,
    sampleCam,
    state,
    start,
    stop,
    runPortal,
    onUserAbort,
    build(scene, HZ, THREE) {
      state.HZ = HZ;
      state.THREE = THREE;
      state.pv = G.__pv || null;
      state.built = true;
      ensureDom();
      if (state.pv) state.pv.onTourAbort = onUserAbort;
      bindAbortFallback();
      if (shouldAutoStart()) {
        // 等宿主初始化完首帧后启动（仅当宿主未显式关闭 introAuto）
        if (!state.pv || state.pv.introAuto !== false) {
          if (typeof setTimeout === 'function') setTimeout(() => { if (!state.active && shouldAutoStart()) start(); }, 0);
        }
      }
    },
    update() { /* 导览按自身 rAF 节拍驱动，渲染循环零额外开销 */ },
  };

  (G.HZ_MODS = G.HZ_MODS || []).push(MOD);
  G.HZ_TOUR = MOD;
})();
