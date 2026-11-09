// 构件信息卡（D-28 第一片）· hark-cs
// 选中插件图纸的构件时，在 #mod-ui 里弹一张小卡：标题、part.info 各行、挂接的实物记录（HZR.forPart）。
// 若 part 带 t0 / t1（HZ 天数，开工 / 完工），卡上多两个按钮「看开工时 / 看建成后」调 ctx.set(t)；没有就不显示按钮。
// 第二片：当前图纸里挂有实物记录（HZR.forPart 非空）的构件，在 3D 里打一个小图钉（DOM，随相机投影），点图钉 = 选中该构件（弹卡）。DOM 只挂 #mod-ui；卡片自带关闭键。
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
  function html(part, ctx) {
    const R = recs(ctx.sheet, part.id), out = [];
    out.push('<div class="hz-info-h"><b>' + esc(part.label || part.id) + '</b><span class="hz-info-x" data-a="x">×</span></div>');
    for (const [k, v] of rows(part.info)) out.push('<div class="hz-info-r">' + (k ? '<i>' + esc(k) + '</i>' : '') + esc(v) + '</div>');
    if (R.length) {
      out.push('<div class="hz-info-r"><i>实物记录</i></div>');
      for (const r of R) out.push('<div class="hz-info-r">' + esc(r.id) + ' · ' + esc(r.date) + ' · ' + (r.url ? '<a target="_blank" rel="noopener" href="' + esc(r.url) + '">' + esc(r.title || '原链接') + '</a>' : esc(r.title)) + '</div>');
    }
    const b = [];
    if (typeof part.t0 === 'number') b.push('<button data-a="t0">看开工时</button>');
    if (typeof part.t1 === 'number') b.push('<button data-a="t1">看建成后</button>');
    if (b.length) out.push('<div class="hz-info-b">' + b.join('') + '</div>');
    return out.join('');
  }
  let card = null;
  function style() {
    if (typeof document === 'undefined' || document.getElementById('hz-info-css')) return;
    const s = document.createElement('style'); s.id = 'hz-info-css';
    s.textContent = '.hz-info{position:absolute;max-width:260px;background:rgba(250,248,240,.95);color:#222;border:1px solid #333;padding:8px 10px;font:12px/1.5 sans-serif;box-shadow:2px 2px 0 #3334}' +
      '.hz-info-h{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px}.hz-info-x{cursor:pointer;padding:0 4px}' +
      '.hz-pin{position:absolute;width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#c0392b;border:1.5px solid #fff;box-shadow:0 0 0 1px #333;cursor:pointer;color:#fff;font:bold 9px/13px sans-serif;text-align:center}' +
      '.hz-info-r i{font-style:normal;color:#a60;margin-right:6px}.hz-info-b{margin-top:6px}.hz-info-b button{margin-right:6px;font-size:12px}';
    document.head.appendChild(s);
  }

  // ---- 实物图钉（第二片）----
  const pins = {}; let last = -1e9, cache = [], lastSheet = '';
  function pinList(sheet, t) {
    const R = G.HZR, P = G.HZ_SHEET_PLUGINS || [];
    if (!R || typeof R.forPart !== 'function') return [];
    const pl = P.find(q => q && (q.id === sheet)); if (!pl || typeof pl.parts !== 'function') return [];
    let ps = []; try { ps = pl.parts(t, { w: 800, h: 600, t, sheet }) || []; } catch (e) { return []; }
    return ps.filter(p => p && p.id && Array.isArray(p.box) && p.box.length === 6 && R.forPart(sheet, p.id).length).slice(0, 40)
      .map(p => ({ id: String(p.id), n: R.forPart(sheet, p.id).length, c: [(p.box[0] + p.box[3]) / 2, p.box[4], (p.box[2] + p.box[5]) / 2] }));
  }
  function pinsUpdate(t, cam, pv, root) {
    if (!cam || !pv || !root || typeof document === 'undefined') return;
    const sheet = pv.sheet, now = Date.now();
    if (sheet !== lastSheet || now - last > 1000) { cache = pinList(sheet, t); last = now; lastSheet = sheet; }
    style(); cam.updateMatrixWorld();
    const W = root.clientWidth || 800, H = root.clientHeight || 600, seen = {};
    for (const p of cache) {
            const q = new (cam.position.constructor)(p.c[0], p.c[1], p.c[2]).project(cam);
      let el = pins[p.id];
      if (!el) { el = pins[p.id] = document.createElement('div'); el.className = 'hz-pin'; el.title = '实物记录 ' + p.n + ' 条：点开看';
        el.addEventListener('click', ev => { ev.stopPropagation(); if (pv.plugSelect) pv.plugSelect(el.getAttribute('data-id')); }); root.appendChild(el); }
      el.setAttribute('data-id', p.id); el.textContent = p.n > 1 ? p.n : '';
      const x = (q.x + 1) / 2 * W, y = (1 - q.y) / 2 * H, ok = q.z < 1 && x > 4 && y > 4 && x < W - 4 && y < H - 4;
      el.style.display = ok ? 'block' : 'none'; el.style.left = (x - 8) + 'px'; el.style.top = (y - 20) + 'px'; seen[p.id] = 1;
    }
    for (const k of Object.keys(pins)) if (!seen[k]) { const e = pins[k]; if (e.parentNode) e.parentNode.removeChild(e); delete pins[k]; }
  }
  const MOD = {
    update(t, cam) { if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return; pinsUpdate(t, cam, G.__pv, document.getElementById('mod-ui')); },
    pinList,
    id: 'info',
    html,
    rows,
    pick(part, pos, ctx) {
      if (typeof document === 'undefined' || !ctx || !ctx.root) return;
      style(); MOD.unpick();
      card = document.createElement('div'); card.className = 'hz-info'; card.innerHTML = html(part, ctx);
      const w = ctx.root.clientWidth || 800, h = ctx.root.clientHeight || 600;
      const x = isFinite(pos.x) ? Math.min(Math.max(pos.x + 12, 8), w - 270) : 12, y = isFinite(pos.y) ? Math.min(Math.max(pos.y + 12, 8), h - 160) : 12;
      card.style.left = x + 'px'; card.style.top = y + 'px';
      card.addEventListener('click', e => { const a = e.target && e.target.getAttribute && e.target.getAttribute('data-a');
        if (a === 'x') { ctx.clear && ctx.clear(); MOD.unpick(); } else if (a === 't0') ctx.set(part.t0); else if (a === 't1') ctx.set(part.t1); });
      ctx.root.appendChild(card);
    },
    unpick() { if (card && card.parentNode) card.parentNode.removeChild(card); card = null; },
  };
  (G.HZ_MODS = G.HZ_MODS || []).push(MOD);
})();
