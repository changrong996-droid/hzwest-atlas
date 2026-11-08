// 构件信息卡（D-28 第一片）· hark-cs
// 选中插件图纸的构件时，在 #mod-ui 里弹一张小卡：标题、part.info 各行、挂接的实物记录（HZR.forPart）。
// 若 part 带 t0 / t1（HZ 天数，开工 / 完工），卡上多两个按钮「看开工时 / 看建成后」调 ctx.set(t)；没有就不显示按钮。
// 图钉（3D 小图钉）留给下一片。DOM 只挂 #mod-ui；卡片自带关闭键。
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
      '.hz-info-r i{font-style:normal;color:#a60;margin-right:6px}.hz-info-b{margin-top:6px}.hz-info-b button{margin-right:6px;font-size:12px}';
    document.head.appendChild(s);
  }
  const MOD = {
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
