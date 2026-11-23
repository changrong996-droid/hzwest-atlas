// 左上信息栏收拢（hark-fangyi 提案样机）：默认压成一行细条「图号 · 第几天 / 总天数 · 工序」，点一下展开 / 收回（记在本机）；
// 拖动、滚轮转视角时整条变淡，松手 0.8 秒后恢复。只加样式和点击，不改宿主文件；宿主采纳后应移进 hzwest.html，本文件删除。
// 目前由 web/mods/osmctx.js 顺带加载（宿主未挂载本文件前的预览办法）。
(function () {
  if (typeof document === 'undefined' || window.__hzInfobar) return; window.__hzInfobar = 1;
  const css = `
#big{transition:opacity .25s,padding .2s;pointer-events:auto!important;cursor:pointer}
#big::after{content:'收起 ▴';position:absolute;right:8px;bottom:6px;font:11px var(--sans,sans-serif);color:#9a9184}
#big.hb-mini{display:flex;align-items:baseline;gap:10px;flex-wrap:nowrap;white-space:nowrap;padding:4px 30px 5px 10px!important;max-width:none!important}
#big.hb-mini::after{content:'▾';right:9px;bottom:auto;top:5px;font-size:12px}
#big.hb-mini .lede{display:none}
#big.hb-mini .k{font-size:13px!important}
#big.hb-mini .n{font-size:20px!important;margin:0!important;line-height:1.2}
#big.hb-mini .n small{font-size:12px!important;margin-left:3px}
#big.hb-mini .c{font-size:14px!important;margin:0!important;overflow:hidden;text-overflow:ellipsis;max-width:42vw}
#big.hb-fade{opacity:.18}`;
  const st = document.createElement('style'); st.id = 'hz-infobar'; st.textContent = css; document.head.appendChild(st);
  const go = () => {
    const b = document.getElementById('big'); if (!b) return setTimeout(go, 300);
    const KEY = 'hz.infobar.full'; if (localStorage.getItem(KEY) !== '1') b.classList.add('hb-mini');
    b.title = '点一下展开 / 收起';
    b.addEventListener('click', e => { e.stopPropagation(); const mini = b.classList.toggle('hb-mini'); try { localStorage.setItem(KEY, mini ? '0' : '1'); } catch (_) {} });
    let tm = 0; const fade = () => { b.classList.add('hb-fade'); clearTimeout(tm); }, back = () => { clearTimeout(tm); tm = setTimeout(() => b.classList.remove('hb-fade'), 800); };
    const isView = e => e.target && e.target.tagName === 'CANVAS';
    let down = false;
    window.addEventListener('pointerdown', e => { if (isView(e)) { down = true; } }, true);
    window.addEventListener('pointermove', e => { if (down) fade(); }, true);
    window.addEventListener('pointerup', () => { if (down) { down = false; back(); } }, true);
    window.addEventListener('wheel', e => { if (isView(e)) { fade(); back(); } }, { capture: true, passive: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
