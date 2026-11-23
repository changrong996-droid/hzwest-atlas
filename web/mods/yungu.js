// 云谷解说：中庭标注与图注（任务 #47，batch 3，feature）· fo-cs
// 用途：为「云谷」（湖杭场与杭临绩场之间拉开 28 m 的纵向通廊）加一处可点开的解说标注
//   与三处关键数字图注，标注点落在云谷位置，点开即见解说；解说稿由委托人 muse-cr 提供。
// 对应关系（图注与位置一一对应）：
//   云谷     → 主标注（可点开解说卡）+ 数字图注「拉开 28 m · 2022-09-22 通车起一直保留」；
//   十字天窗 → 图注「阳光沿云谷沉到地下 28 m 的地铁站厅」（天窗十字臂 |x|<11 / |z|<11，hzseq.js inSky）；
//   进站口   → 图注「地铁闸机到进站口不到 5 分钟；候车厅到最远地铁站台约 200 m（杭州东站 400 多米）」。
// 与 #26 FPV 航线打通：解说卡带「看穿越机飞云谷」入口（film/index.html#fpv=route-classic）；
//   route-classic 的云谷地标即 [120, 18, 0]（web/film/fpv-routes.js），主标注就落在这条航线穿越云谷的路径上。
// 几何取自 web/hzseq.js：P.gap=14（云谷半宽 28 m）、地铁层 −9.2 m、候车层楼面 24 m、承轨层顶 12.5 m。
// 接口：window.HZ_MODS.push({ id:'yungu', build(scene,HZ,THREE,opts), update(t,cam) })；DOM 只挂 #mod-ui。
// 说明：DOM 图注随相机投影但不做遮挡剔除（与 web/mods/info.js 图钉同一口径）。
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  if (G.__hzYungu) return; G.__hzYungu = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- 内容（解说稿一句话讲一个点，数字与公开报道口径一致，见 web/hzseq.js HZ.K）----
  const INTRO = '湖杭场与杭临绩场拉开 28 m 腾出的纵向通廊，是西站设计的核——不是施工留下的坑，完工后一直留着。';
  const POINTS = [
    ['采光', '阳光从屋顶十字天窗照进来，沿云谷一路沉到地下 28 m 深的地铁站厅，白天基本不用开灯。'],
    ['指路', '从地铁出来抬头见云谷，顺着光走就找到进站口，地铁闸机到进站口不到 5 分钟。'],
    ['缩短步行', '进站厅放中间、候车厅放两边，去最远检票口也近一大半；候车厅到最远地铁站台约 200 m，杭州东站 400 多米。'],
    ['通风与公共空间', '外窗可开启 35% 以上，自然通风；云谷里常办展览、宣讲、招聘。'],
  ];
  const NUMBERS = '28 m 拉开 · 地下 28 m · 闸机到进站口 <5 分钟 · 最远站台 200 m（东站 400+ m）· 2022-09-22 通车';
  const FPV_NOTE = '穿越机 FPV 航线的主场景就是云谷：航线贴候车层下潜、穿过云谷光井。';

  // ---- 标注与图注锚点（世界坐标 x 东西 / y 高 / z 南北，站房中心为原点）----
  // 主标注放在 route-classic 声明的云谷地标 [120, 18, 0]（航线穿越云谷的路径，r=12）。
  const ITEMS = [
    { id: 'pin', pos: [120, 18, 0], pin: true, tip: '云谷 · 点开看解说' },
    { id: 'c-gap', pos: [0, 2, 0], text: '<b>云谷</b> 拉开 28 m 的通廊 · 2022-09-22 通车起一直保留' },
    { id: 'c-sky', pos: [0, 42, 0], text: '<b>十字天窗</b> 阳光沉到地下 28 m 的地铁站厅，白天基本不用开灯' },
    { id: 'c-enter', pos: [0, 3.2, 22], text: '<b>进站口</b> 地铁闸机到进站口不到 5 分钟 · 候车厅到最远站台约 200 m（杭州东站 400 多米）' },
  ];

  let inited = false, card = null, cardOpen = false, V3 = null;

  const CSS = [
    '.hz-yg{position:absolute;transform:translate(-50%,-100%);pointer-events:none;white-space:nowrap;',
    'font:500 12px/1.45 var(--sans,system-ui,sans-serif);color:#1c1a17;background:rgba(250,248,240,.92);',
    'border:1px solid rgba(28,26,23,.35);border-radius:4px;padding:3px 8px;box-shadow:0 2px 8px rgba(28,26,23,.12)}',
    '.hz-yg b{font-weight:700}',
    '.hz-yg::after{content:"";position:absolute;left:50%;bottom:-7px;margin-left:-4px;',
    'border:4px solid transparent;border-top:5px solid rgba(28,26,23,.45)}',
    '.hz-yg-pin{position:absolute;width:24px;height:24px;transform:translate(-50%,-100%);border-radius:50%;',
    'background:rgba(28,26,23,.92);color:#f5f1e8;border:1.5px solid #f5f1e8;box-shadow:0 0 0 1px rgba(28,26,23,.7),0 2px 8px rgba(28,26,23,.25);',
    'cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;font:700 13px/1 var(--sans,system-ui,sans-serif)}',
    '.hz-yg-pin::after{content:"";position:absolute;left:50%;bottom:-8px;margin-left:-4px;',
    'border:4px solid transparent;border-top:5px solid rgba(28,26,23,.92)}',
    '.hz-yg-pin:hover{background:#b3202a}',
    '.hz-yg-card{position:absolute;width:min(340px,calc(100% - 24px));max-height:min(70%,420px);overflow:auto;',
    'background:rgba(250,248,240,.97);color:#1c1a17;border:1px solid rgba(28,26,23,.5);border-radius:8px;',
    'padding:10px 12px;box-shadow:0 6px 20px rgba(28,26,23,.22);pointer-events:auto;z-index:5;',
    'font:400 13px/1.55 var(--sans,system-ui,sans-serif)}',
    '.hz-yg-card h4{margin:0 0 4px;font-size:14px}',
    '.hz-yg-card .lede{margin:0 0 6px;color:#4a453e}',
    '.hz-yg-card ul{margin:0 0 6px;padding:0;list-style:none}',
    '.hz-yg-card li{margin:3px 0;padding-left:2px}',
    '.hz-yg-card li b{font-weight:700}',
    '.hz-yg-num{display:block;border-top:1px dashed rgba(28,26,23,.3);padding-top:5px;margin-top:2px;',
    'font-size:12px;color:#4a453e;letter-spacing:.2px}',
    '.hz-yg-card .btns{margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '.hz-yg-card a{color:#b3202a;text-decoration:none;border:1px solid rgba(179,32,42,.5);border-radius:5px;padding:3px 9px;font-size:12px}',
    '.hz-yg-card a:hover{background:rgba(179,32,42,.08)}',
    '.hz-yg-x{margin-left:auto;border:0;background:none;color:#6b655c;cursor:pointer;font-size:15px;line-height:1;padding:2px 4px}',
    '.hz-yg-x:hover{color:#1c1a17}',
  ].join('');

  function ensure(root) {
    if (inited) return;
    const st = document.createElement('style'); st.id = 'hz-yungu'; st.textContent = CSS; document.head.appendChild(st);
    for (const it of ITEMS) {
      if (it.pin) {
        const el = document.createElement('div'); el.className = 'hz-yg-pin'; el.textContent = '谷';
        el.title = it.tip; el.setAttribute('aria-label', it.tip);
        el.addEventListener('click', ev => { ev.stopPropagation(); toggleCard(root); });
        it.el = el;
      } else {
        const el = document.createElement('div'); el.className = 'hz-yg'; el.innerHTML = it.text; it.el = el;
      }
      root.appendChild(it.el);
    }
    inited = true;
  }

  function openCard(root) {
    cardOpen = true;
    if (card && card.parentNode === root) { syncCard(); return; }
    card = document.createElement('div'); card.className = 'hz-yg-card';
    card.innerHTML =
      '<h4>云谷 · 拉开 28 m 的中庭</h4>' +
      '<p class="lede">' + esc(INTRO) + '</p>' +
      '<ul>' + POINTS.map(p => '<li><b>' + esc(p[0]) + '</b>：' + esc(p[1]) + '</li>').join('') + '</ul>' +
      '<span class="hz-yg-num">' + esc(NUMBERS) + '</span>' +
      '<div class="btns"><a href="film/index.html#fpv=route-classic">看穿越机飞云谷（FPV）</a>' +
      '<span style="font-size:11px;color:#6b655c">' + esc(FPV_NOTE) + '</span>' +
      '<button class="hz-yg-x" aria-label="关闭">✕</button></div>';
    card.addEventListener('click', e => { e.stopPropagation(); if (e.target.classList && e.target.classList.contains('hz-yg-x')) closeCard(); });
    root.appendChild(card);
    syncCard();
  }
  function closeCard() { cardOpen = false; if (card && card.parentNode) card.parentNode.removeChild(card); card = null; }
  function toggleCard(root) { cardOpen ? closeCard() : openCard(root); }

  // 卡片贴主标注投影点放（钉上方），按 #mod-ui 尺寸收边
  function syncCard() {
    if (!card) return;
    const pin = ITEMS[0], r = card.parentNode;
    if (!r || !pin.sx) return;
    const w = r.clientWidth || 800, h = r.clientHeight || 600;
    let x = pin.sx - 170, y = pin.sy - 40 - card.offsetHeight;
    x = Math.min(Math.max(8, x), Math.max(8, w - card.offsetWidth - 8));
    y = Math.min(Math.max(8, y), Math.max(8, h - card.offsetHeight - 8));
    card.style.left = x + 'px'; card.style.top = y + 'px';
  }

  // 每帧：四点投影到 #mod-ui 坐标（与 info.js 图钉同一做法，不做遮挡剔除）
  function update(t, cam) {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const root = document.getElementById('mod-ui'); if (!root || !cam) return;
    ensure(root);
    if (inited && !document.getElementById('hz-yungu')) { const st = document.createElement('style'); st.id = 'hz-yungu'; st.textContent = CSS; document.head.appendChild(st); }
    const w = root.clientWidth || 0, h = root.clientHeight || 0, M = 24;
    for (const it of ITEMS) {
      if (!it._v) it._v = new (cam.position.constructor)();
      it._v.set(it.pos[0], it.pos[1], it.pos[2]).project(cam);
      const off = it._v.z > 1 || it._v.z < -1 || !isFinite(it._v.x) || !isFinite(it._v.y);
      const sx = (it._v.x * 0.5 + 0.5) * w, sy = (-it._v.y * 0.5 + 0.5) * h;
      const show = !off && w > 60 && h > 60 && sx > -M && sx < w + M && sy > -M && sy < h + M;
      it.sx = show ? sx : 0; it.sy = show ? sy : 0;
      if (!show) { if (it.el && it.el.parentNode) it.el.style.display = 'none'; continue; }
      if (it.el.parentNode !== root) root.appendChild(it.el);
      it.el.style.display = '';
      if (it.pin) { it.el.style.left = sx + 'px'; it.el.style.top = (sy - 8) + 'px'; }
      else { it.el.style.left = sx + 'px'; it.el.style.top = (sy - 6) + 'px'; }
    }
    if (cardOpen && card) syncCard();
  }

  (G.HZ_MODS = G.HZ_MODS || []).push({ id: 'yungu', build() {}, update, closeCard });
})();
