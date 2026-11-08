'use strict';
// 杭州西站图册登记表（页 / 图纸 / 四态表）与图号解析纯函数，无 DOM。
(function (G) {
  const HZA = {};
  HZA.VERSION = 1;
  HZA.PROJECT = 'HZW';
  const PFX = HZA.PROJECT + '-';

  HZA.PAGES = {
    'S-000': { title: '总图', on: 1, sheets: [] },
    'S-101': { title: '地下', on: 1, sheets: ['S-101-1'] },
    'S-201': { title: '承轨层', on: 1, sheets: ['S-201-1'] },
    'S-251': { title: '网架拼装', on: 1, sheets: ['S-251-1'] },
    'S-301': { title: '整体提升', on: 1, sheets: ['S-301-1', 'S-301-2', 'S-301-3', 'S-301-4'] },
    'S-401': { title: '屋面', on: 1, sheets: ['S-401-1'] },
    'S-501': { title: '开通', on: 1, sheets: ['S-501-1'] },
  };

  HZA.SHEETS = {
    'S-101-1': { no: PFX + 'S-101-1', title: '地下横剖面 · 向东看', plugin: 'S-101', canvas: 'sh-s101-1', owner: 'S-101', aliases: [] },
    'S-201-1': { no: PFX + 'S-201-1', title: '承轨层平面', plugin: 'S-201', canvas: 'sh-s201-1', owner: 'S-201', aliases: [] },
    'S-251-1': { no: PFX + 'S-251-1', title: '网架拼装平面', plugin: 'S-251', canvas: 'sh-s251-1', owner: 'S-251', aliases: [] },
    'S-301-1': { no: PFX + 'S-301-1', title: '千斤顶平面布置 · 剖面净空', fn: 'jack', canvas: 'sh-jack', owner: 'S-301', aliases: [] },
    'S-301-2': { no: PFX + 'S-301-2', title: '屋盖提升图', fn: 'lift', canvas: 'sh-s301-2', owner: 'S-301', aliases: ['HZW-A-501'] },
    'S-301-3': { no: PFX + 'S-301-3', title: '横剖面 B–B · x = 39 m', fn: 'section', canvas: 'sh-s301-3', owner: 'S-301', aliases: ['HZW-A-301'] },
    'S-301-4': { no: PFX + 'S-301-4', title: '屋盖网架平面', fn: 'plan', canvas: 'sh-s301-4', owner: 'S-301', aliases: ['HZW-A-101'] },
    'S-401-1': { no: PFX + 'S-401-1', title: '屋面铺设平面', plugin: 'S-401', canvas: 'sh-s401-1', owner: 'S-401', aliases: [] },
    'S-501-1': { no: PFX + 'S-501-1', title: '站区总平面', plugin: 'S-501', canvas: 'sh-s501-1', owner: 'S-501', aliases: [] },
  };

  const slot = (status, note) => ({ status, note });
  const sub = (sheetSlot) => ({
    sheet: sheetSlot,
    grow: slot('有', '包含在 S-000 时间轴内，无独立时间窗'),
    built: slot('部分', '同 S-000'),
    real: slot('无', '见 hzreal.js'),
  });
  HZA.FORMS = {
    'S-000': {
      sheet: slot('无', '3D 总图无 2D 图纸'),
      grow: slot('有', '全工期 0 → OPEN+30'),
      built: slot('部分', 't ≥ OPEN 终态 + 竣工章，无验收字段'),
      real: slot('无', '见 hzreal.js'),
    },
    'S-301': {
      sheet: slot('有', 'S-301-1…4'),
      grow: slot('有', 'K.lift1.start → K.head.end，按小时加权'),
      built: slot('部分', '同上'),
      real: slot('无', '同上'),
    },
    'S-101': sub(slot('有', 'S-101-1')),
    'S-201': sub(slot('有', 'S-201-1')),
    'S-251': sub(slot('有', 'S-251-1')),
    'S-401': sub(slot('有', 'S-401-1')),
    'S-501': sub(slot('有', 'S-501-1')),
  };

  const strip = (s) => (s.startsWith(PFX) ? s.slice(PFX.length) : s);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  HZA.resolve = function (id) {
    if (typeof id !== 'string') return null;
    if (has(HZA.SHEETS, id)) return id;
    const s = strip(id);
    if (has(HZA.SHEETS, s)) return s;
    for (const k of Object.keys(HZA.SHEETS)) {
      for (const a of HZA.SHEETS[k].aliases) if (strip(a) === s) return k;
    }
    return null;
  };

  HZA.sheetsOf = function (page) {
    if (!has(HZA.PAGES, page)) return [];
    return HZA.PAGES[page].sheets.map((id) => Object.assign({ id }, HZA.SHEETS[id]));
  };

  HZA.wrapFn = function (fn, no, kind) {
    let seenTb = 22;
    return (g, w, h, t, ctx) => {
      const r = fn(g, w, h, t, Object.assign({}, ctx, {
        tb: (w2, h2, _no, name, t2) => {
          const o = ctx.tb(w2, h2, no, name, t2);
          if (o && typeof o.tb === 'number') seenTb = o.tb;
          return o;
        },
      }));
      if (kind === 'plan') {
        const S = G.__pv;
        const pose = S && HZA.planCamPose(S);
        if (pose) {
          const m = HZA.planMap(w, h, seenTb);
          const cx = m.X(pose.camZ), cy = m.Y(pose.camX);
          const tx = m.X(pose.tgtZ), ty = m.Y(pose.tgtX);
          g.save();
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.strokeStyle = 'rgba(180,32,42,.55)';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(tx, ty);
          g.stroke();
          g.strokeStyle = '#1d1a17';
          g.lineWidth = 1.4;
          g.beginPath();
          g.arc(tx, ty, 5, 0, Math.PI * 2);
          g.moveTo(tx - 8, ty);
          g.lineTo(tx + 8, ty);
          g.moveTo(tx, ty - 8);
          g.lineTo(tx, ty + 8);
          g.stroke();
          g.beginPath();
          g.arc(cx, cy, 4.5, 0, Math.PI * 2);
          g.fillStyle = '#b4202a';
          g.fill();
          g.lineWidth = 1.6;
          g.strokeStyle = '#ffffff';
          g.stroke();
          g.restore();
        }
      }
      return r;
    };
  };

  HZA.focusFor = function (key, fracY, liftZone) {
    if (key === 'S-301-3') return 'CUT';
    if (key === 'S-301-4') return fracY < 1 / 3 ? 'ZN' : (fracY < 2 / 3 ? 'ZM' : 'ZS');
    if (key === 'S-301-2') return liftZone === 1 ? 'ZS' : (liftZone === 3 ? 'ZN' : 'ZM');
    return null;
  };

  HZA.planMap = function (w, h, tb) {
    const box = { x0: 8, y0: 8, x1: w - 8, y1: h - 8.5 - tb };
    const dw = box.x1 - box.x0 - 8;
    const dh = box.y1 - box.y0 - 16;
    const s = Math.min(dw / 344, dh / 260);
    const ox = box.x0 + 4 + (dw - 344 * s) / 2;
    const oy = box.y0 + 14 + (dh - 260 * s) / 2;
    const X = (z) => ox + (z + 172) * s;
    const Y = (x) => oy + (130 - x) * s;
    return { s, ox, oy, X, Y };
  };

  let shotMemoKey = '';
  let shotMemoVal = null;
  HZA.planCamPose = function (S) {
    if (!S || !S.st || typeof S.st !== 'object') return null;
    if (S.st.auto === false && typeof S.focusHash === 'string') {
      const m = S.focusHash.match(/^J(\d+)$/);
      if (m) {
        const i = Number(m[1]) - 1;
        let shot = null;
        if (S.focusShot && S.focusShot.i === i) {
          shot = S.focusShot;
        } else if (typeof S.shotFor === 'function') {
          const key = i + '|' + Math.round(S.st.t);
          if (shotMemoKey === key && shotMemoVal) {
            shot = shotMemoVal;
          } else {
            shot = S.shotFor(i, S.st.t);
            shotMemoKey = key;
            shotMemoVal = shot;
          }
        }
        if (shot && shot.pos && shot.tgt) {
          return { camX: shot.pos.x, camZ: shot.pos.z, tgtX: shot.tgt.x, tgtZ: shot.tgt.z };
        }
      } else if (S.focusHash === 'cut' || S.focusHash === 'gap') {
        if (S.cutShot && S.cutShot.pos && S.cutShot.tgt) {
          return { camX: S.cutShot.pos.x, camZ: S.cutShot.pos.z, tgtX: S.cutShot.tgt.x, tgtZ: S.cutShot.tgt.z };
        }
      }
    }
    if (typeof S.camKey === 'function') {
      const k = S.camKey(S.st.t);
      if (!k) return null;
      const az = k.az * Math.PI / 180;
      const el = k.el * Math.PI / 180;
      const camX = k.tx + Math.sin(az) * Math.cos(el) * k.d;
      const camZ = k.tz - Math.cos(az) * Math.cos(el) * k.d;
      return { camX, camZ, tgtX: k.tx, tgtZ: k.tz };
    }
    return null;
  };

  G.HZA = HZA;

  if (typeof document === 'undefined' || !document.getElementById) return;

  const subOf = () => {
    const n = Number(new URLSearchParams((location.hash || '').slice(1)).get('sub'));
    return Number.isInteger(n) && n >= 1 && n <= 8 ? n : 1;
  };

  let mounted = false;
  let builtPage = null;
  let baseLen = 0;
  let pushedCount = 0;
  let canvases = [];
  let tabs = [];

  HZA.setSub = function (k) {
    const S = G.__pv;
    if (!S || !S.layout) return;
    const idx = Number.isInteger(k) && k >= 1 && k <= canvases.length ? k : 1;
    canvases.forEach((el, i) => {
      if (el) el.classList.toggle('hz-off', i + 1 !== idx);
    });
    tabs.forEach((sp, i) => {
      sp.classList.toggle('on', i + 1 === idx);
    });
    const q = new URLSearchParams((location.hash || '').slice(1));
    q.set('sub', String(idx));
    const h = q.toString().replace(/%2C/g, ',');
    history.replaceState(null, '', '#' + h);
    S.layout();
  };

  const TITLES = {
    'S-301-2': '点击：镜头飞到本图当前分区的视角',
    'S-301-3': '点击：镜头飞到剖面切口',
    'S-301-4': '点击：镜头按点击位置飞到北 / 中 / 南区',
  };

  function wireFly(el, key) {
    el.style.cursor = 'pointer';
    if (TITLES[key]) el.title = TITLES[key];
    el.addEventListener('click', (e) => {
      if (!el.clientHeight) return;
      const fracY = e.offsetY / el.clientHeight;
      const S = window.__pv;
      let liftZone = 2;
      if (S && S.st && typeof S.st.t === 'number' && window.HZ && HZ.K) {
        const t = S.st.t;
        liftZone = t < HZ.K.lift2.start ? 1 : (t < HZ.K.lift3.start ? 2 : 3);
      }
      const f = HZA.focusFor(key, fracY, liftZone);
      if (!f) return;
      const q = new URLSearchParams(location.hash.slice(1));
      q.set('focus', f);
      location.hash = q.toString();
    });
  }

  HZA.mount = function () {
    if (mounted) return;
    const S = G.__pv;
    if (!S || !S.SHEETS || !S.SH || !S.layout) {
      console.warn('hzatlas: __pv 接口缺失');
      return;
    }
    const col = document.getElementById('col');
    if (!col) return;
    mounted = true;
    baseLen = S.SHEETS.length;

    const st = document.createElement('style');
    st.id = 'hzatlas-css';
    st.textContent = '#col{grid-template-rows:auto minmax(0,1fr)!important;position:relative}#hz-subtabs{display:flex;gap:4px;font-family:var(--mono);font-size:12px}#hz-subtabs .st{padding:3px 8px;border:1px solid var(--line);border-radius:3px;cursor:pointer;background:#fbf9f5}#hz-subtabs .st.on{background:var(--ink);color:#fff}#hz-subtabs .st small{opacity:.55;font-size:10px;font-weight:400;margin-right:5px}#hz-subtabs .hz-hint{color:#8a8175;font-size:11px;margin-left:8px;align-self:center}#col canvas.sheet.hz-off{visibility:hidden;position:absolute;inset:0;pointer-events:none}';
    document.head.appendChild(st);

    const bar = document.createElement('div');
    bar.id = 'hz-subtabs';
    col.insertBefore(bar, col.firstChild);

    function teardown() {
      canvases.forEach((el) => {
        if (el && el.id !== 'sh-jack' && el.parentNode) el.parentNode.removeChild(el);
      });
      while (pushedCount > 0 && S.SHEETS.length > baseLen) {
        S.SHEETS.pop();
        pushedCount--;
      }
      pushedCount = 0;
      canvases = [];
      tabs = [];
      builtPage = null;
    }

    function buildFor(page) {
      const list = HZA.sheetsOf(page);
      bar.innerHTML = '';
      tabs = [];
      canvases = [];
      list.forEach((item) => {
        if (item.plugin) {
          const pl = (G.HZ_SHEET_PLUGINS || []).find((p) => p && p.id === item.plugin);
          if (!pl || typeof pl.draw !== 'function') {
            console.warn('hzatlas: 插件图纸缺失 ' + item.plugin);
          }
          return;
        }
        const idx = tabs.length + 1;
        const sp = document.createElement('span');
        sp.className = 'st';
        sp.setAttribute('data-id', item.id);
        sp.innerHTML = '<small>' + item.no + '</small>' + item.title.split('·')[0].trim();
        sp.onclick = () => HZA.setSub(idx);
        bar.appendChild(sp);
        tabs.push(sp);
        if (item.canvas === 'sh-jack') {
          canvases.push(document.getElementById('sh-jack'));
          return;
        }
        const drawFn = S.SH[item.fn];
        if (typeof drawFn !== 'function') {
          console.warn('hzatlas: 图纸函数缺失 ' + item.fn);
          return;
        }
        const el = document.createElement('canvas');
        el.id = item.canvas;
        el.className = 'sheet hz-off';
        el.setAttribute('aria-label', item.no + ' ' + item.title);
        col.appendChild(el);
        S.SHEETS.push({ id: item.canvas, fn: HZA.wrapFn(drawFn, item.no, item.fn), no: item.no, el, key: '', drawn: 0, n: 0, scale: '' });
        pushedCount++;
        if (TITLES[item.id]) wireFly(el, item.id);
        canvases.push(el);
      });
      if (page === 'S-301') {
        const hint = document.createElement('span');
        hint.className = 'hz-hint';
        hint.textContent = '点击图纸 · 镜头飞过去';
        bar.appendChild(hint);
      }
      builtPage = page;
    }

    const p0 = S.sheet || 'S-301';
    buildFor(p0);
    if (pushedCount > 0) {
      bar.style.display = '';
      HZA.setSub(subOf());
    } else {
      bar.style.display = 'none';
    }

    G.addEventListener('hashchange', () => {
      const p = S.sheet;
      if (p !== builtPage) {
        teardown();
        buildFor(p);
      }
      if (pushedCount > 0) {
        bar.style.display = '';
        HZA.setSub(subOf());
      } else {
        bar.style.display = 'none';
      }
    });
  };

  let tries = 0;
  const timer = setInterval(() => {
    if (G.__pv && G.__pv.ready) {
      clearInterval(timer);
      HZA.mount();
    } else if (++tries >= 600) {
      clearInterval(timer);
      console.warn('hzatlas: __pv 未就绪');
    }
  }, 50);
})(typeof window !== 'undefined' ? window : globalThis);
