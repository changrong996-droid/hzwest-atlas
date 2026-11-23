// WebGL 不可用检测与静态兜底图模块（任务 #15）· g-liuzhijie
// 职责：
// 1. 轻量探测浏览器是否支持 WebGL2 / WebGL1；支持时零侵入、立即释放探测上下文。
// 2. 不支持或触发 webglcontextcreationerror / WebGLRenderer 初始化异常时，在 #v3 内呈现纸墨风格静态兜底卡（含 film/img/hzwest.jpg 静态全景图与排查提示），避免白屏。
// 3. 支持 ?forceFallback=1 便于任意浏览器实测兜底画面；导出 window.HZ_WEBGL_FALLBACK 供无头自测。
(function (G) {
  'use strict';

  const FALLBACK_IMG = 'film/img/hzwest.jpg';
  const FALLBACK_ID = 'hz-webgl-fallback';
  const STYLE_ID = 'hz-webgl-fallback-css';

  function hasWebGL(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || typeof d.createElement !== 'function') return false;
    try {
      const c = d.createElement('canvas');
      if (!c || typeof c.getContext !== 'function') return false;
      const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return false;
      try {
        const ext = typeof gl.getExtension === 'function' && gl.getExtension('WEBGL_lose_context');
        if (ext && typeof ext.loseContext === 'function') ext.loseContext();
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  function ensureStyle(d) {
    if (!d || !d.head || d.getElementById(STYLE_ID)) return;
    const s = d.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#' + FALLBACK_ID + '{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:20px;background:#efe9dd;color:#1d1a17;font:14px/1.6 system-ui,-apple-system,sans-serif;box-sizing:border-box}' +
      '#' + FALLBACK_ID + ' .card{max-width:680px;width:100%;background:rgba(250,248,242,.96);border:1.5px solid #1d1a17;box-shadow:4px 4px 0 rgba(29,26,23,.18);padding:18px 20px}' +
      '#' + FALLBACK_ID + ' .hd{display:flex;align-items:baseline;gap:8px;margin:0 0 8px;font-size:16px;font-weight:700}' +
      '#' + FALLBACK_ID + ' .hd b{color:#b3202a}' +
      '#' + FALLBACK_ID + ' .shot{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border:1px solid #8a8175;background:#e4ded2;margin:10px 0 12px}' +
      '#' + FALLBACK_ID + ' .shot img{width:100%;height:100%;object-fit:cover;display:block}' +
      '#' + FALLBACK_ID + ' .shot .cap{position:absolute;right:8px;bottom:6px;padding:2px 7px;font-size:11px;background:rgba(29,26,23,.72);color:#fbf9f5}' +
      '#' + FALLBACK_ID + ' ul{margin:6px 0 12px;padding-left:18px;font-size:13px;color:#3d3832}' +
      '#' + FALLBACK_ID + ' .ft{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px;color:#625a50}' +
      '#' + FALLBACK_ID + ' button{padding:5px 12px;border:1px solid #1d1a17;background:#1d1a17;color:#fbf9f5;font:inherit;cursor:pointer}' +
      '#' + FALLBACK_ID + ' a{color:#b3202a;text-decoration:none;border-bottom:1px solid rgba(179,32,42,.4)}';
    d.head.appendChild(s);
  }

  function show(root, reason, doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return null;
    const host = root || d.getElementById('v3') || d.body;
    if (!host) return null;
    const existing = d.getElementById(FALLBACK_ID);
    if (existing) return existing;

    ensureStyle(d);
    const wrap = d.createElement('div');
    wrap.id = FALLBACK_ID;
    wrap.setAttribute('role', 'alert');

    const msg = reason ? '（' + String(reason).slice(0, 80) + '）' : '';
    wrap.innerHTML =
      '<div class="card">' +
        '<div class="hd"><b>杭州西站 · 施工推演图册</b><span>当前浏览器暂不支持实时 3D（WebGL）</span></div>' +
        '<p style="margin:0;font-size:13px;color:#4a433b">未能初始化 WebGL 渲染上下文' + msg + '，已切换为静态全景预览。</p>' +
        '<div class="shot">' +
          '<img src="' + FALLBACK_IMG + '" alt="杭州西站静态全景预览" onerror="this.style.display=\'none\'">' +
          '<span class="cap">杭州西站 · 静态兜底预览</span>' +
        '</div>' +
        '<ul>' +
          '<li>桌面端：请在浏览器设置中开启「硬件加速」，或升级至新版 Chrome / Edge / Safari。</li>' +
          '<li>移动端：微信或内置 WebView 可能受限，建议点右上角用系统浏览器打开。</li>' +
          '<li>远程桌面 / 虚拟机：若无 GPU 驱动，可启用软件渲染后刷新重试。</li>' +
        '</ul>' +
        '<div class="ft">' +
          '<button type="button" id="hz-webgl-retry">重新检测</button>' +
          '<a href="https://github.com/changsheng0804-blip/hzwest-atlas#readme" target="_blank" rel="noopener">查看项目说明</a>' +
        '</div>' +
      '</div>';

    host.appendChild(wrap);
    const btn = typeof wrap.querySelector === 'function' ? wrap.querySelector('#hz-webgl-retry') : null;
    if (btn) btn.onclick = function () { if (G.location && typeof G.location.reload === 'function') G.location.reload(); };
    return wrap;
  }

  function hide(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    const el = d && typeof d.getElementById === 'function' ? d.getElementById(FALLBACK_ID) : null;
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function init() {
    if (typeof document === 'undefined') return;
    const force = G.location && /[?&]forceFallback=1\b/.test(G.location.search || '');
    if (force || !hasWebGL(document)) {
      show(null, force ? '预览模式' : '未检测到 WebGL 上下文', document);
      return;
    }
    const glCanvas = document.getElementById('gl');
    if (glCanvas && typeof glCanvas.addEventListener === 'function') {
      glCanvas.addEventListener('webglcontextcreationerror', function (ev) {
        show(null, (ev && ev.statusMessage) || 'WebGL 上下文创建失败', document);
      }, { once: true });
    }
    if (typeof G.addEventListener === 'function') {
      G.addEventListener('error', function (ev) {
        const m = String((ev && ev.message) || '');
        if (/WebGL|Error creating WebGL context/i.test(m)) show(null, m, document);
      });
    }
  }

  G.HZ_WEBGL_FALLBACK = { hasWebGL, show, hide, init, FALLBACK_IMG, FALLBACK_ID };
  init();
})(typeof window !== 'undefined' ? window : globalThis);
