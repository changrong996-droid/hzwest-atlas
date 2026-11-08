'use strict';
// 杭州西站图册登记表（页 / 图纸 / 四态表）与图号解析纯函数，无 DOM。
(function (G) {
  const HZA = {};
  HZA.VERSION = 1;
  HZA.PROJECT = 'HZW';
  const PFX = HZA.PROJECT + '-';

  HZA.PAGES = {
    'S-000': { title: '总图', on: 1, sheets: [] },
    'S-101': { title: '地下', on: 0, sheets: ['S-301-3'] },
    'S-201': { title: '承轨层', on: 0, sheets: ['S-301-3'] },
    'S-301': { title: '整体提升', on: 1, sheets: ['S-301-1', 'S-301-2', 'S-301-3', 'S-301-4'] },
    'S-401': { title: '屋面', on: 0, sheets: ['S-301-4', 'S-301-3'] },
    'S-501': { title: '开通', on: 0, sheets: [] },
  };

  HZA.SHEETS = {
    'S-301-1': { no: PFX + 'S-301-1', title: '千斤顶平面布置 · 剖面净空', fn: 'jack', canvas: 'sh-jack', owner: 'S-301', aliases: [] },
    'S-301-2': { no: PFX + 'S-301-2', title: '屋盖提升图', fn: 'lift', canvas: 'sh-s301-2', owner: 'S-301', aliases: ['HZW-A-501'] },
    'S-301-3': { no: PFX + 'S-301-3', title: '横剖面 B–B · x = 39 m', fn: 'section', canvas: 'sh-s301-3', owner: 'S-301', aliases: ['HZW-A-301'] },
    'S-301-4': { no: PFX + 'S-301-4', title: '屋盖网架平面', fn: 'plan', canvas: 'sh-s301-4', owner: 'S-301', aliases: ['HZW-A-101'] },
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
    'S-101': sub(slot('部分', '交叉引用 S-301-3')),
    'S-201': sub(slot('部分', '交叉引用 S-301-3')),
    'S-401': sub(slot('部分', '交叉引用 S-301-4、S-301-3')),
    'S-501': sub(slot('无', '无独立图纸')),
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

  HZA.wrapFn = function (fn, no) {
    return (g, w, h, t, ctx) => fn(g, w, h, t, Object.assign({}, ctx, { tb: (w2, h2, _no, name, t2) => ctx.tb(w2, h2, no, name, t2) }));
  };

  HZA.focusFor = function (key, fracY, liftZone) {
    if (key === 'S-301-3') return 'CUT';
    if (key === 'S-301-4') return fracY < 1 / 3 ? 'ZN' : (fracY < 2 / 3 ? 'ZM' : 'ZS');
    if (key === 'S-301-2') return liftZone === 1 ? 'ZS' : (liftZone === 3 ? 'ZN' : 'ZM');
    return null;
  };

  G.HZA = HZA;

  if (typeof document === 'undefined' || !document.getElementById) return;

  const subOf = () => {
    const n = Number(new URLSearchParams((location.hash || '').slice(1)).get('sub'));
    return n === 1 || n === 2 || n === 3 || n === 4 ? n : 1;
  };

  let mounted = false;
  let canvases = [];
  let tabs = [];

  HZA.setSub = function (k) {
    const S = G.__pv;
    if (!S || !S.layout) return;
    const idx = k === 2 || k === 3 || k === 4 ? k : 1;
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

    const st = document.createElement('style');
    st.id = 'hzatlas-css';
    st.textContent = '#col{grid-template-rows:auto minmax(0,1fr)!important;position:relative}#hz-subtabs{display:flex;gap:4px;font-family:var(--mono);font-size:12px}#hz-subtabs .st{padding:3px 8px;border:1px solid var(--line);border-radius:3px;cursor:pointer;background:#fbf9f5}#hz-subtabs .st.on{background:var(--ink);color:#fff}#hz-subtabs .st small{opacity:.55;font-size:10px;font-weight:400;margin-right:5px}#hz-subtabs .hz-hint{color:#8a8175;font-size:11px;margin-left:8px;align-self:center}#col canvas.sheet.hz-off{visibility:hidden;position:absolute;inset:0;pointer-events:none}';
    document.head.appendChild(st);

    const list = HZA.sheetsOf('S-301');
    const bar = document.createElement('div');
    bar.id = 'hz-subtabs';
    tabs = list.map((item, i) => {
      const sp = document.createElement('span');
      sp.className = 'st';
      sp.setAttribute('data-id', item.id);
      sp.innerHTML = '<small>' + item.no + '</small>' + item.title.split('·')[0].trim();
      sp.onclick = () => HZA.setSub(i + 1);
      bar.appendChild(sp);
      return sp;
    });
    const hint = document.createElement('span');
    hint.className = 'hz-hint';
    hint.textContent = '点击图纸 · 镜头飞过去';
    bar.appendChild(hint);
    col.insertBefore(bar, col.firstChild);

    canvases = list.map((item) => {
      if (item.canvas === 'sh-jack') return document.getElementById('sh-jack');
      const el = document.createElement('canvas');
      el.id = item.canvas;
      el.className = 'sheet hz-off';
      el.setAttribute('aria-label', item.no + ' ' + item.title);
      col.appendChild(el);
      S.SHEETS.push({ id: item.canvas, fn: HZA.wrapFn(S.SH[item.fn], item.no), no: item.no, el, key: '', drawn: 0, n: 0, scale: '' });
      wireFly(el, item.id);
      return el;
    });

    bar.style.display = S.sheet === 'S-301' ? '' : 'none';
    HZA.setSub(subOf());

    G.addEventListener('hashchange', () => {
      if (S.sheet === 'S-301') {
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
