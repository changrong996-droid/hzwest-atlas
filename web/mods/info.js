// 构件信息卡（D-28 第一片）· hark-cs
// D-44（11-10）：ctx.rel（HZ.rel）在卡上分层：第 2 层最多三行「靠谁撑着 N 件 · 等谁先装 N 件 · 吊车（站位）」，无数据的行不显示；
// 第 3 层「更多」默认收起，展开为上 / 下游清单（label · whyText，工序级标注）、出现在哪些图、实物记录。
// 选中插件图纸的构件时，在 #mod-ui 里弹一张小卡：标题、part.info 各行、挂接的实物记录（HZR.forPart）。
// 若 part 带 t0 / t1（HZ 天数，开工 / 完工），卡上多两个按钮「看开工时 / 看建成后」调 ctx.set(t)；没有就不显示按钮。
// 第二片：当前图纸里挂有实物记录（HZR.forPart 非空）的构件，在 3D 里打一个小图钉（DOM，随相机投影），点图钉 = 选中该构件（弹卡）。DOM 只挂 #mod-ui；卡片自带关闭键。
// D-45（11-10）：图钉按记录聚合、通配 > 3 件的记录不打钉、相机图标无裸数字、同屏 ≤ 5、默认收起到左下角「实物 N」。
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 把 part.info 统一成 [[键, 值], …]；接受二维数组、对象或字符串
  function rows(info) {
    if (!info) return [];
    if (Array.isArray(info)) return info.map(r => Array.isArray(r) ? [r[0], r[1]] : ['', r]);
    if (typeof info === 'object') return Object.keys(info).map(k => [k, info[k]]);
    return [['', info]];
  }
  function recs(sheet, id) {
    const R = G.HZR; if (!R || typeof R.forPart !== 'function') return [];
    return R.forPart(sheet, id).map(r => ({ id: r.id, date: r.date, title: r.src && r.src.title, url: r.src && r.src.url }));
  }
  // ---- 构件关系（D-44）：ctx.rel = HZ.rel(...) 的结果；第 2 层最多三行，第 3 层「更多」默认收起 ----
  const BLUE = '#1f63c6', GREEN = '#13955a';
  const dot = c => '<span class="hz-info-dot" style="background:' + c + '"></span>';
  const n0 = v => (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0;
  // 第 2 层：靠谁撑着 / 等谁先装 / 吊车；没有数据的行不显示 → 返回 [行 HTML]
  function relRows(rel) {
    if (!rel) return [];
    const c = rel.counts || {}, out = [];
    if (n0(c.hold)) out.push('<div class="hz-info-r hz-rel-l2" data-k="hold">' + dot(BLUE) + '靠谁撑着 ' + n0(c.hold) + ' 件</div>');
    if (n0(c.wait)) out.push('<div class="hz-info-r hz-rel-l2" data-k="wait">' + dot(BLUE) + '等谁先装 ' + n0(c.wait) + ' 件</div>');
    const cr = rel.crane;
    if (cr && cr.name) { const st = Array.isArray(cr.station) && cr.station.length === 2 && cr.station.every(Number.isFinite) ? '（站位 ' + Math.round(cr.station[0]) + ', ' + Math.round(cr.station[1]) + '）' : '';
      out.push('<div class="hz-info-r hz-rel-l2" data-k="crane">' + dot('#777') + '吊车 ' + esc(cr.name) + esc(st) + '</div>'); }
    return out.slice(0, 3);
  }
  const GROUP_UP = { sup: '撑着它的', seq: '要先装的', rm: '拆之前要等' }, GROUP_DN = { sup: '它撑着的', seq: '等它装完的', rm: '用完它才拆的' };
  const MAXI = 12;
  function itemHtml(x, ctx) {
    const tag = (x.level === 'act' ? '<em class="hz-rel-act">工序级</em>' : '') + (x.level === 'part' && x.n > 1 ? '<em>' + x.n + ' 件</em>' : '');
    const lab = esc(x.label || x.id), why = x.whyText ? ' · ' + esc(x.whyText) : '';
    if (x.level === 'part' && x.sheet === ctx.sheet) return '<div class="hz-rel-i"><a href="javascript:void 0" data-a="sel" data-id="' + esc(x.id) + '">' + lab + '</a>' + why + tag + '</div>';
    return '<div class="hz-rel-i"><a href="#sheet=' + esc(x.sheet || 'S-001') + '&amp;focus=' + esc(x.id) + '">' + lab + '</a>' + why + tag + '</div>';
  }
  function listHtml(L, G2, color, title, ctx) {
    if (!Array.isArray(L) || !L.length) return '';
    const out = ['<div class="hz-rel-h">' + dot(color) + title + '</div>'];
    for (const r of ['sup', 'seq', 'rm']) { const S = L.filter(x => x && x.rel === r); if (!S.length) continue;
      out.push('<div class="hz-rel-g">' + G2[r] + '</div>'); for (const x of S.slice(0, MAXI)) out.push(itemHtml(x, ctx));
      if (S.length > MAXI) out.push('<div class="hz-rel-i">…另 ' + (S.length - MAXI) + ' 项</div>'); }
    return out.join('');
  }
  function recHtml(R) {
    if (!R.length) return '';
    const out = ['<div class="hz-info-r"><i>实物记录</i></div>'];
    for (const r of R) out.push('<div class="hz-info-r">' + esc(r.id) + ' · ' + esc(r.date) + ' · ' + (r.url ? '<a target="_blank" rel="noopener" href="' + esc(r.url) + '">' + esc(r.title || '原链接') + '</a>' : esc(r.title)) + '</div>');
    return out.join('');
  }
  // 第 3 层：上下游清单、所在图纸、实物记录；默认 hidden
  function moreHtml(rel, R, ctx) {
    const out = [listHtml(rel.up, GROUP_UP, BLUE, '上游', ctx), listHtml(rel.down, GROUP_DN, GREEN, '下游', ctx)];
    const S = Array.isArray(rel.sheets) ? rel.sheets : [];
    if (S.length) out.push('<div class="hz-rel-h">出现在</div><div class="hz-rel-i">' + S.map(s => s.id ? '<a href="#sheet=' + esc(s.sheet) + '&amp;focus=' + esc(s.id) + '">' + esc(s.name || s.sheet) + '</a>' : '<a href="#sheet=' + esc(s.sheet) + '">' + esc(s.name || s.sheet) + '</a>').join('、') + '</div>');
    out.push(recHtml(R));
    return out.join('');
  }
  function html(part, ctx) {
    const R = recs(ctx.sheet, part.id), out = [], rel = ctx.rel || null;
    out.push('<div class="hz-info-h"><b>' + esc(part.label || part.id) + '</b><span class="hz-info-x" data-a="x">×</span></div>');
    for (const [k, v] of rows(part.info)) out.push('<div class="hz-info-r">' + (k ? '<i>' + esc(k) + '</i>' : '') + esc(v) + '</div>');
    if (rel) out.push(...relRows(rel)); else out.push(recHtml(R));
    const b = [];
    if (typeof part.t0 === 'number') b.push('<button data-a="t0">看开工时</button>');
    if (typeof part.t1 === 'number') b.push('<button data-a="t1">看建成后</button>');
    if (rel) b.push('<button data-a="more">更多</button>');
    if (b.length) out.push('<div class="hz-info-b">' + b.join('') + '</div>');
    if (rel) out.push('<div class="hz-info-more" hidden>' + moreHtml(rel, R, ctx) + '</div>');
    return out.join('');
  }
  let card = null;
  function style() {
    if (typeof document === 'undefined' || document.getElementById('hz-info-css')) return;
    const s = document.createElement('style'); s.id = 'hz-info-css';
    s.textContent = '.hz-info{position:absolute;max-width:260px;background:rgba(250,248,240,.95);color:#222;border:1px solid #333;padding:8px 10px;font:12px/1.5 sans-serif;box-shadow:2px 2px 0 #3334}' +
      '.hz-info-h{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px}.hz-info-x{cursor:pointer;padding:0 4px}' +
      '.hz-pin{position:absolute;width:22px;height:22px;border-radius:50%;background:#c0392b;color:#fff;border:1.5px solid #fff;box-shadow:0 0 0 1px #333;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
      '.hz-pin::after{content:"";position:absolute;left:50%;bottom:-6px;margin-left:-4px;border:4px solid transparent;border-top:5px solid #333}' +
      '.hz-pin:hover::before{content:attr(data-tip);position:absolute;left:26px;top:0;white-space:nowrap;background:rgba(250,248,240,.96);color:#222;border:1px solid #333;padding:2px 6px;font:12px/1.4 sans-serif}' +
      '.hz-real-btn{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:4px;padding:3px 9px;background:rgba(250,248,240,.95);color:#222;border:1px solid #333;font:12px/1.5 sans-serif;cursor:pointer;box-shadow:2px 2px 0 #3334}.hz-real-btn svg{color:#c0392b}' +
      '.hz-real-list{position:absolute;left:12px;bottom:44px;max-width:320px;max-height:220px;overflow:auto;background:rgba(250,248,240,.95);color:#222;border:1px solid #333;padding:6px 9px;font:12px/1.5 sans-serif;box-shadow:2px 2px 0 #3334}' +
      '.hz-real-h{font-weight:bold;margin-bottom:2px}.hz-real-i em{font-style:normal;color:#666;margin-left:6px;font-size:11px}.hz-real-list a{color:#1f4f99}' +
      '.hz-info-r i{font-style:normal;color:#a60;margin-right:6px}.hz-info-b{margin-top:6px}.hz-info-b button{margin-right:6px;font-size:12px}' +
      '.hz-info-dot{display:inline-block;width:9px;height:9px;margin-right:6px;vertical-align:0}.hz-info-more{margin-top:6px;border-top:1px dashed #999;padding-top:4px;max-height:230px;overflow:auto}' +
      '.hz-rel-h{font-weight:bold;margin-top:4px}.hz-rel-g{color:#a60;margin-top:2px}.hz-rel-i{padding-left:10px}.hz-rel-i em{font-style:normal;color:#666;margin-left:6px;font-size:11px}.hz-rel-i em.hz-rel-act{color:#a60}.hz-info a{color:#1f4f99}';
    document.head.appendChild(s);
  }

  // ---- 实物图钉（第二片；D-45 11-10 改：按记录聚合、相机图标不写裸数字、同屏 ≤ 5、默认收起）----
  // 规则（对所有图纸一样，不按图号特判）：
  //   一条记录在当前图纸命中 > 3 个构件 = 图纸级记录（多是全站新闻 / 公布值，通配挂件），不打钉，只列进左下角「实物 N」；
  //   命中 ≤ 3 个构件的记录才打钉：挂着同一组记录的构件合成一个钉，放在它们包围盒的中心（高度取顶面，免得钉埋进构件里）；
  //   屏幕上相距 < 24 px 的钉再合并，每张图同屏最多 5 个；钉上只有相机图标，悬停 / 点开才显示「现场照片 2 张 · 卫星影像 1 张」。
  //   默认收起：只显示「实物 N」按钮（N = 本图记录数），点开才显示钉和记录清单；选中构件时信息卡照常列出其记录。
  const WILD_MAX = 3, PIN_MAX = 5, MERGE_PX = 24;
  const KIND = { photo: ['现场照片', '张'], sat: ['卫星影像', '张'], doc: ['报道', '篇'], measure: ['公布数据', '条'] };
  function kindOf(r) {
    const t = (r && r.src && r.src.title) || '';
    if (r && r.kind === 'photo') return /卫星|影像|哨兵|Sentinel|Wayback/i.test(t) ? 'sat' : 'photo';
    return r && KIND[r.kind] ? r.kind : 'doc';
  }
  // 「现场照片 2 张 · 卫星影像 1 张」：按类别计数，带单位
  function summary(R) { return kindsText((R || []).map(kindOf)); }
  function kindsText(ks) {
    const c = {}; for (const k of ks) c[k] = (c[k] || 0) + 1;
    return Object.keys(KIND).filter(k => c[k]).map(k => KIND[k][0] + ' ' + c[k] + ' ' + KIND[k][1]).join(' · ');
  }
  // 本图（t 时刻插件给出的构件）上每条记录命中了哪些构件
  function sheetHits(sheet, t) {
    const R = G.HZR, P = G.HZ_SHEET_PLUGINS || [], hits = new Map();
    if (!R || typeof R.forPart !== 'function') return { parts: [], hits };
    const pl = P.find(q => q && (q.id === sheet)); if (!pl || typeof pl.parts !== 'function') return { parts: [], hits };
    let ps = []; try { ps = pl.parts(t, { w: 800, h: 600, t, sheet }) || []; } catch (e) { return { parts: [], hits }; }
    ps = ps.filter(p => p && p.id && Array.isArray(p.box) && p.box.length === 6 && p.box.every(Number.isFinite));
    const own = new Map();
    for (const p of ps) { const L = R.forPart(sheet, p.id); if (!L.length) continue; own.set(p, L);
      for (const r of L) { let h = hits.get(r.id); if (!h) hits.set(r.id, h = { rec: r, parts: [] }); h.parts.push(p); } }
    return { parts: ps, own, hits };
  }
  // 本图记录（「实物 N」的 N 与清单）：命中本图构件的全部记录，按日期；level = 'sheet'（命中 > 3 件，不打钉）或 'part'
  function sheetRecords(sheet, t) {
    const { hits } = sheetHits(sheet, t);
    return [...hits.values()].map(h => ({ id: h.rec.id, date: h.rec.date, kind: kindOf(h.rec), title: h.rec.src && h.rec.src.title, url: h.rec.src && h.rec.src.url, n: h.parts.length, level: h.parts.length > WILD_MAX ? 'sheet' : 'part' }))
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }
  // 钉（世界坐标，未做屏幕合并）：同一组「可打钉记录」的构件合一钉
  function pinList(sheet, t) {
    const { own, hits } = sheetHits(sheet, t); if (!own) return [];
    const groups = new Map();
    for (const [p, L] of own) {
      const ok = L.filter(r => hits.get(r.id).parts.length <= WILD_MAX); if (!ok.length) continue;
      const key = ok.map(r => r.id).sort().join(',');
      let g = groups.get(key); if (!g) groups.set(key, g = { recs: ok, parts: [] }); g.parts.push(p);
    }
    return [...groups.values()].map(g => {
      const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const p of g.parts) for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], p.box[i]); b[i + 3] = Math.max(b[i + 3], p.box[i + 3]); }
      return { id: String(g.parts[0].id), ids: g.parts.map(p => String(p.id)), recs: g.recs.map(r => r.id), tip: summary(g.recs), n: g.recs.length, c: [(b[0] + b[3]) / 2, b[4], (b[2] + b[5]) / 2] };
    }).sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1));
  }
  // 屏幕合并：pts = [{…pin, x, y}]（已投影、在屏内），相距 < px 的并成一个（记录去重），最多 max 个
  function mergeScreen(pts, px, max) {
    px = px || MERGE_PX; max = max || PIN_MAX; const out = [];
    for (const p of pts) {
      const q = out.find(o => Math.hypot(o.x - p.x, o.y - p.y) < px);
      if (q) { for (const id of p.ids) if (!q.ids.includes(id)) q.ids.push(id); for (const r of p.recs) if (!q.recs.includes(r)) q.recs.push(r); q.merged = (q.merged || 1) + 1; }
      else out.push(Object.assign({}, p, { ids: p.ids.slice(), recs: p.recs.slice() }));
    }
    const R = G.HZR, all = (R && R.RECORDS) || [];
    for (const o of out) { o.n = o.recs.length; if (o.merged) o.tip = summary(o.recs.map(id => all.find(r => r.id === id)).filter(Boolean)); }
    return out.slice(0, max);
  }
  const CAM_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M5.5 3 4.6 4.5H2.5A1.5 1.5 0 0 0 1 6v6a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 15 12V6a1.5 1.5 0 0 0-1.5-1.5h-2.1L10.5 3z"/><circle cx="8" cy="9" r="2.6" fill="#fff"/><circle cx="8" cy="9" r="1.5" fill="currentColor"/></svg>';
  const pinEls = []; let last = -1e9, cache = [], recCache = [], lastSheet = '', open = false, btn = null, panel = null;
  function panelHtml(L) {
    const out = ['<div class="hz-real-h">本图实物记录 ' + L.length + ' 条' + (L.length ? '（' + esc(kindsText(L.map(r => r.kind))) + '）' : '') + '</div>'];
    for (const r of L) out.push('<div class="hz-real-i">' + esc(r.date) + ' · ' + esc(KIND[r.kind][0]) + ' · ' + (r.url ? '<a target="_blank" rel="noopener" href="' + esc(r.url) + '">' + esc(r.title || r.id) + '</a>' : esc(r.title || r.id)) +
      (r.level === 'sheet' ? '<em>全图 · ' + r.n + ' 件</em>' : '') + '</div>');
    return out.join('');
  }
  function uiSync(root, pv) {
    if (!btn) { btn = document.createElement('button'); btn.className = 'hz-real-btn'; btn.type = 'button';
      btn.addEventListener('click', ev => { ev.stopPropagation(); open = !open; last = -1e9; uiSync(root, pv); }); }
    if (btn.parentNode !== root) root.appendChild(btn);
    const N = recCache.length; btn.style.display = N ? '' : 'none';
    const lab = (open ? '收起实物 ' : '实物 ') + N; if (btn._lab !== lab) { btn._lab = lab; btn.innerHTML = CAM_SVG + ' ' + lab; }
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && N) { if (!panel) { panel = document.createElement('div'); panel.className = 'hz-real-list'; }
      if (panel.parentNode !== root) root.appendChild(panel); const h = panelHtml(recCache); if (panel._h !== h) { panel._h = h; panel.innerHTML = h; } }
    else if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  }
  function pinsUpdate(t, cam, pv, root) {
    if (!cam || !pv || !root || typeof document === 'undefined') return;
    const sheet = pv.sheet, now = Date.now();
    if (sheet !== lastSheet || now - last > 1000) { cache = pinList(sheet, t); recCache = sheetRecords(sheet, t); last = now; lastSheet = sheet; }
    style(); uiSync(root, pv);
    let shown = [];
    if (open && cache.length) {
      cam.updateMatrixWorld();
      const W = root.clientWidth || 800, H = root.clientHeight || 600, pts = [];
      for (const p of cache) { const q = new (cam.position.constructor)(p.c[0], p.c[1], p.c[2]).project(cam);
        const x = (q.x + 1) / 2 * W, y = (1 - q.y) / 2 * H; if (q.z < 1 && x > 12 && y > 24 && x < W - 12 && y < H - 12) pts.push(Object.assign({}, p, { x, y })); }
      shown = mergeScreen(pts, MERGE_PX, PIN_MAX);
    }
    while (pinEls.length < shown.length) { const el = document.createElement('div'); el.className = 'hz-pin'; el.innerHTML = CAM_SVG;
      el.addEventListener('click', ev => { ev.stopPropagation(); if (pv.plugSelect) pv.plugSelect(el.getAttribute('data-id')); }); pinEls.push(el); }
    pinEls.forEach((el, i) => { const p = shown[i];
      if (!p) { if (el.parentNode) el.parentNode.removeChild(el); return; }
      if (el.parentNode !== root) root.appendChild(el);
      el.setAttribute('data-id', p.id); el.setAttribute('data-tip', p.tip); el.title = p.tip + '（点开看）';
      el.style.left = (p.x - 11) + 'px'; el.style.top = (p.y - 26) + 'px'; });
  }
  const MOD = {
    update(t, cam) { if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return; pinsUpdate(t, cam, G.__pv, document.getElementById('mod-ui')); },
    pinList,
    mergeScreen,
    CAM_SVG,
    sheetRecords,
    summary,
    kindOf,
    WILD_MAX, PIN_MAX, MERGE_PX,
    id: 'info',
    html,
    rows,
    relRows,
    pick(part, pos, ctx) {
      if (typeof document === 'undefined' || !ctx || !ctx.root) return;
      style(); MOD.unpick();
      card = document.createElement('div'); card.className = 'hz-info'; card.innerHTML = html(part, ctx);
      const w = ctx.root.clientWidth || 800, h = ctx.root.clientHeight || 600;
      const x = isFinite(pos.x) ? Math.min(Math.max(pos.x + 12, 8), w - 270) : 12, y = isFinite(pos.y) ? Math.min(Math.max(pos.y + 12, 8), h - 160) : 12;
      card.style.left = x + 'px'; card.style.top = y + 'px';
      card.addEventListener('click', e => { const a = e.target && e.target.getAttribute && e.target.getAttribute('data-a');
        if (a === 'x') { ctx.clear && ctx.clear(); MOD.unpick(); } else if (a === 't0') ctx.set(part.t0); else if (a === 't1') ctx.set(part.t1);
        else if (a === 'more') { const m = card.querySelector('.hz-info-more'); if (m) { m.hidden = !m.hidden; e.target.textContent = m.hidden ? '更多' : '收起';
          const H = ctx.root.clientHeight || 600; if (card.offsetTop + card.offsetHeight > H - 8) card.style.top = Math.max(8, H - card.offsetHeight - 8) + 'px'; } }
        else if (a === 'sel') { e.preventDefault(); const id = e.target.getAttribute('data-id'); if (id && ctx.select) ctx.select(id); } });
      ctx.root.appendChild(card);
    },
    unpick() { if (card && card.parentNode) card.parentNode.removeChild(card); card = null; },
  };
  (G.HZ_MODS = G.HZ_MODS || []).push(MOD);
})();
