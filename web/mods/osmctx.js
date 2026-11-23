// 城市远景层（OSM 现状 + 哥白尼地形）· hark-fangyi · 提案 docs/proposals/hark-fangyi-osm-context.md
// 数据 web/mods/osmctx-data.js（window.HZ_OSMCTX，已换到模型系：x 东、z 南，原点站房中心，OSM 铁路方位对齐 4.3°、东移 10 m）。
// 内容：真实建筑体块（有 height / 层数的按实高，其余 8 m）、道路、水体、绿地、国铁与地铁线、地下站轮廓、站周 32 × 24 km 地形（城区框内压平）。
// 与工期联动：合杭高铁、地铁 3 / 19 号线在开通日（HZ.P/TL OPEN = 1101）前画成浅灰预留线，开通后上色。
// 只增不改：不碰宿主几何；宿主的程序化城市 CTX.city / 远山 MTN 是否让位，见提案「接口请求」（替换开关由 hark-cr 定）。
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const OPEN = 1101;
  const isNew = o => /合杭|3号线|19号线/.test(o.n || '');
  // 枢纽施工红线（模型系，示意）：站房两侧落客匝道、东西大道站前段、云余西街、杭衢街等随站房一起建的路与楼，开通日前只画浅灰预留线。
  //   红线外的城市何时出现另算（规划 T1，用公开历史影像日期旁证）。
  const SITE = [-1450, 1450, -600, 600];
  const inSite = o => { let x = 0, z = 0; for (const q of o.p) { x += q[0]; z += q[1]; } x /= o.p.length; z /= o.p.length; return x > SITE[0] && x < SITE[1] && z > SITE[2] && z < SITE[3]; };
  const COL = { paper: 0xefebe3, bReal: 0xe2ddd3, bFake: 0xece8df, edge: 0x2a2622, green: 0xd3e3c4, water: 0xbcd6e6, road: 0xffffff, road1: 0xfbfaf7, rail: 0x1a1a1a, pre: 0xc9c4ba, yard: 0x9a9a9a };
  const M = { id: 'osmctx', replaces: ['ctx.city', 'mtn'], stat: null, _g: null, _open: [], _pre: [], _labs: [], layers: [] };

  // —— 纯几何（不依赖 three，供 check_osmctx 在 Node 里测）——
  const area = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };
  function ribbonTris(list, w, y, out) {   // 折线 → 地面带（三角形，xyz 平铺）
    for (const o of list) for (let i = 1; i < o.p.length; i++) {
      const a = o.p[i - 1], b = o.p[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.5) continue;
      const ex = dx / L * w * 0.3, ez = dz / L * w * 0.3, nx = -dz / L * w / 2, nz = dx / L * w / 2;
      const A = [a[0] - ex + nx, y, a[1] - ez + nz], B = [a[0] - ex - nx, y, a[1] - ez - nz], C = [b[0] + ex - nx, y, b[1] + ez - nz], Dd = [b[0] + ex + nx, y, b[1] + ez + nz];
      out.push(...A, ...B, ...C, ...A, ...C, ...Dd);
    }
    return out;
  }
  function segs(list, y, out) { for (const o of list) for (let i = 1; i < o.p.length; i++) { const a = o.p[i - 1], b = o.p[i]; out.push(a[0], y, a[1], b[0], y, b[1]); } return out; }
  // 地形网格：DEM 在地图系（x 东、y 北）→ 模型系
  function demGrid(D, F, hq) {
    const ra = F.rot * Math.PI / 180, ca = Math.cos(ra), sa = Math.sin(ra), nx = D.nx, ny = D.ny, pos = new Float32Array(nx * ny * 3);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i, X = D.x0 + i * D.st - F.dx, Y = D.y0 + j * D.st - F.dy, h = hq[k] / 2;
      pos[3 * k] = X * ca + Y * sa; pos[3 * k + 1] = h <= 0 ? -1.5 : h; pos[3 * k + 2] = -(-X * sa + Y * ca); }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6); let n = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; idx[n++] = a; idx[n++] = a + nx; idx[n++] = a + 1; idx[n++] = a + 1; idx[n++] = a + nx; idx[n++] = a + nx + 1; }
    return { pos, idx };
  }
  M.geo = { area, ribbonTris, segs, demGrid };

  async function gunzipB64(b64) {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const s = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Int16Array(await new Response(s).arrayBuffer());
  }

  // —— 图层机制（docs/ctx-layers.md）——
  // 任何人往 web/mods/ctx/ 放一个图层文件（HZ_CTX_LAYERS.push({...})）并在 ctx/layers.json 加一行，即被本模块加载、渲染、按工期显隐、进图层开关；不动宿主文件。
  // 图层字段：id（小写.分隔，唯一）、name（开关上显示）、by（作者智能体）、src{text, license, url}（署名，必填）、from / to（可选，工期 t 天，[from, to) 内显示）、on（默认开否）、
  //   items：[{ k, p, n, h, w, c, y, from, to }]，k ∈ area 面 | line 线 | road 带 | bldg 体块 | label 标注 | pin 竖针；p 为模型系 [x 东, z 南]（m），label / pin 的 p 为单点；
  //   或 build(api)：自己画（api.mesh / line / flat / label / ribbonTris / segs / ll / ground / THREE），画进当前图层组。
  const LIC = /ODbL|CC[- ]?BY|CC0|公有领域|public domain|自绘|hzwest-atlas/i;
  M.FRAME = { rot: 4.3, dx: 10, dy: 0, lon0: 119.9817, lat0: 30.3004 };
  M.ll = function (lon, lat) {   // 经纬度 → 模型系 [x, z]，与 tools/hz/osmctx_build.py、tools/hz/ctxlayer.py 同一换算
    const F = M.FRAME, KX = 111320 * Math.cos(F.lat0 * Math.PI / 180), KY = 110540, ra = F.rot * Math.PI / 180;
    const X = (lon - F.lon0) * KX - F.dx, Y = (lat - F.lat0) * KY - F.dy; return [X * Math.cos(ra) + Y * Math.sin(ra), -(-X * Math.sin(ra) + Y * Math.cos(ra))];
  };
  M.ground = function (x, z) {   // 模型系点的地形高（m）；地形未解压或在城区框内返回 0
    const H = M.demH; if (!H) return 0; const F = H.F, D = H.D, ra = F.rot * Math.PI / 180, ca = Math.cos(ra), sa = Math.sin(ra), my = -z;
    const X = x * ca - my * sa + F.dx, Y = x * sa + my * ca + F.dy, fi = (X - D.x0) / D.st, fj = (Y - D.y0) / D.st, i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= D.nx - 1 || j >= D.ny - 1) return 0; const g = (a, b) => H.hq[(j + b) * D.nx + i + a] / 2, u = fi - i, v = fj - j;
    return Math.max(0, (g(0, 0) * (1 - u) + g(1, 0) * u) * (1 - v) + (g(0, 1) * (1 - u) + g(1, 1) * u) * v);
  };
  M.drape = function (g, how) {   // 贴地形：each 每个顶点抬到地形高 + 1.5 m（水面、道路、线）；base 体块按所在点地形抬（同一 x、z 的上下两点同量，不变形）
    if (!g || !M.demH) return; const a = g.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) { const h = M.ground(a[i], a[i + 2]); if (h > 0) a[i + 1] += h + (how === 'base' ? 0 : 1.5); }
    g.attributes.position.needsUpdate = true; g.computeBoundingSphere();
  };
  M.validate = function (L) {   // 返回问题列表（空 = 合格）；check_ctxlayers 与运行时共用
    const bad = []; if (!L || typeof L !== 'object') return ['不是对象'];
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(L.id || '')) bad.push('id 须小写字母数字 . _ -'); if (!L.name) bad.push('缺 name'); if (!L.by) bad.push('缺 by（作者）');
    if (!L.src || !L.src.text || !LIC.test(L.src.license || '')) bad.push('src.license 须为 ODbL / CC-BY / CC0 / 公有领域 / 自绘（不收商业或卫星影像）');
    if (!Array.isArray(L.items) && typeof L.build !== 'function') bad.push('须有 items 或 build(api)');
    for (const [i, o] of (L.items || []).entries()) { const pt = o.k === 'label' || o.k === 'pin';
      if (!['area', 'line', 'road', 'bldg', 'label', 'pin'].includes(o.k)) { bad.push('items[' + i + '].k 未知：' + o.k); continue; }
      const P = pt ? [o.p] : o.p; if (!Array.isArray(P) || !P.length || (!pt && P.length < 2)) { bad.push('items[' + i + '].p 点数不足'); continue; }
      for (const q of P) if (!Array.isArray(q) || !isFinite(q[0]) || !isFinite(q[1]) || Math.abs(q[0]) > 16000 || Math.abs(q[1]) > 16000) { bad.push('items[' + i + '] 坐标越界或非数：' + q); break; }
      if ((o.k === 'area' || o.k === 'bldg') && new Set(P.map(q => q[0] + ',' + q[1])).size < 3) bad.push('items[' + i + '] 面不足 3 个不同点');
      if ((o.k === 'label' || o.k === 'pin') && !o.n) bad.push('items[' + i + '] 标注缺 n');
      if (o.k === 'bldg' && !(o.h > 0 && o.h < 600)) bad.push('items[' + i + '] 体块高度异常：' + o.h); }
    if (M.layers.some(q => q.id === L.id && q.L !== L)) bad.push('id 重复：' + L.id);
    return bad;
  };
  M._defOff = {};
  M.addLayer = function (L) {
    const bad = M.validate(L); if (bad.length) { console.warn('osmctx 图层 ' + (L && L.id) + ' 不合格：' + bad.join('；')); return null; }
    const e = { id: L.id, name: L.name, src: L.src.text, by: L.by, from: L.from, to: L.to, L, on: L.on !== false && !M._defOff[L.id], items: [] };
    M.layers.push(e); const A = M._api; if (!A) return e;   // Node 检查：只登记
    const THREE = A.THREE, g = new THREE.Group(); g.name = 'osmctx:' + L.id; A.G0.add(g); e.g = g; M._cur = g; M._curId = L.id;
    const groups = {}; for (const o of L.items || []) { const key = (o.from == null && o.to == null) ? '' : o.from + '|' + o.to; (groups[key] = groups[key] || []).push(o); }
    for (const key in groups) { const gg = key ? new THREE.Group() : g; if (key) { g.add(gg); const [f, t] = key.split('|'); e.items.push({ g: gg, from: f === 'undefined' ? null : +f, to: t === 'undefined' ? null : +t }); } M._cur = gg;
      const its = groups[key], byC = {}; for (const o of its) { const c = o.c || ({ area: '#cfe0ea', line: '#5b88a8', road: '#ffffff', bldg: '#e6e1d7' })[o.k] || '#2a2622'; (byC[o.k + '|' + c + '|' + (o.w || '') + '|' + (o.y || '')] = byC[o.k + '|' + c + '|' + (o.w || '') + '|' + (o.y || '')] || []).push(o); }
      for (const k in byC) { const [kind, c, w, y] = k.split('|'), list = byC[k], col = new THREE.Color(c).getHex(), Y = y ? +y : 0, n0 = gg.children.length;
        if (kind === 'area') A.flat(list.filter(o => o.p.length >= 3).map(o => ({ p: o.p.length && (o.p[0][0] !== o.p[o.p.length - 1][0] || o.p[0][1] !== o.p[o.p.length - 1][1]) ? o.p.concat([o.p[0]]) : o.p })), col, Y || 0.2);
        else if (kind === 'line') A.line(segs(list, Y || 0.3, []), col, 1);
        else if (kind === 'road') A.mesh(ribbonTris(list, +w || 8, Y || 0.27, []), col);
        else if (kind === 'bldg') { const arr = [], ed = []; for (const o of list) { const sh = new THREE.Shape(o.p.map(p => new THREE.Vector2(p[0], -p[1]))), gq = new THREE.ExtrudeGeometry(sh, { depth: o.h, bevelEnabled: false }).rotateX(-Math.PI / 2).toNonIndexed();
            if (Y) gq.translate(0, Y, 0); const a = gq.attributes.position.array; for (let i = 0; i < a.length; i++) arr.push(a[i]); const eg = new THREE.EdgesGeometry(gq, 30), ea = eg.attributes.position.array; for (let i = 0; i < ea.length; i++) ed.push(ea[i]); gq.dispose(); eg.dispose(); }
          A.mesh(arr, col, 1); A.line(ed, COL.edge, 0.5); }
        else for (const o of list) { const yy = (o.y != null ? +o.y : 0) + (kind === 'pin' ? (o.h || 120) : 12);
          if (kind === 'pin') { const pinY = M.ground(o.p[0], o.p[1]); A.line([o.p[0], pinY, o.p[1], o.p[0], pinY + (o.h || 120), o.p[1]], col, 0.9); }
            A.label(o.n, o.p[0], o.p[1], M.ground(o.p[0], o.p[1]) + yy, kind === 'pin' ? 'p' : 'l'); }
        if (kind === 'area' || kind === 'line' || kind === 'road' || kind === 'bldg') for (const ch of gg.children.slice(n0)) M.drape(ch.geometry, kind === 'bldg' ? 'base' : 'each'); } }
    M._cur = g; if (typeof L.build === 'function') { try { L.build(Object.assign({}, A, { group: g, layer: L })); } catch (err) { console.warn('osmctx 图层 ' + L.id + ' build 失败', err); } }
    g.visible = e.on; M._lastT = null; if (M._uiAdd) M._uiAdd(e); return e;
  };
  M.setLayer = function (id, on) { for (const e of M.layers) if (e.id === id || e.id.indexOf(id + '.') === 0) { e.on = !!on; if (e.g) e.g.visible = e.on; } M._lastT = null; };
  const inWin = (t, f, to) => (f == null || t >= f) && (to == null || t < to);
  M._ui = function (root) {
    const box = document.createElement('div'); box.className = 'osmctx-layers'; box.style.cssText = 'position:absolute;right:10px;top:10px;font:12px/1.5 system-ui,sans-serif;background:rgba(255,255,255,.86);border:1px solid #999;padding:2px 8px;pointer-events:auto;max-width:220px;z-index:5';
    const hd = document.createElement('div'); hd.textContent = '远景图层 ▸'; hd.style.cursor = 'pointer'; box.appendChild(hd); const ls = document.createElement('div'); ls.style.display = 'none'; box.appendChild(ls);
    hd.onclick = () => { const o = ls.style.display === 'none'; ls.style.display = o ? '' : 'none'; hd.textContent = '远景图层 ' + (o ? '▾' : '▸'); };
    root.appendChild(box); M._uiBox = box;
    M._uiAdd = e => { const r = document.createElement('label'); r.style.cssText = 'display:block;white-space:nowrap;cursor:pointer'; r.title = e.src + (e.by ? ' · ' + e.by : '');
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = e.on; c.style.marginRight = '4px'; c.onchange = () => M.setLayer(e.id, c.checked); r.appendChild(c); r.appendChild(document.createTextNode(e.name + (e.base ? '' : '（' + (e.by || '外挂') + '）'))); ls.appendChild(r); };
    for (const e of M.layers) M._uiAdd(e);
  };
  try { const cs = typeof document !== 'undefined' && document.currentScript; if (cs && cs.src) M.base = cs.src.replace(/[^/]*$/, ''); } catch (e) {}

  M.build = function (scene, HZ, THREE, opts) {
    const D = ROOT.HZ_OSMCTX; if (!D) throw new Error('缺 web/mods/osmctx-data.js');
    M.stat = { b: D.b.length, h: D.h.length, r: D.r.length };
    if (!scene || !THREE) return;   // Node 检查：只登记
    const clip = (opts && opts.clip) || [];
    const G0 = new THREE.Group(); G0.name = 'osmctx'; scene.add(G0); M._g = G0; let G = G0;
    const sub = (id, name, src) => { const g = new THREE.Group(); g.name = 'osmctx:' + id; G0.add(g); G = g; M.layers.push({ id, name, src, base: 1, g, on: true }); return g; };
    const mesh = (arr, color, poly) => { if (!arr.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: poly || -1, clippingPlanes: clip })); G.add(m); return m; };
    const line = (arr, color, op) => { if (!arr.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: op < 1, opacity: op, clippingPlanes: clip })); G.add(l); return l; };
    // 面状：绿地、水体（模型系 z 南 → Shape 用 (x, -z) 再转回）
    const flat = (list, color, y) => { const arr = []; for (const o of list) { if (o.p.length < 4) continue; const sh = new THREE.Shape(o.p.map(p => new THREE.Vector2(p[0], -p[1])));
      const g = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).toNonIndexed(), a = g.attributes.position.array; for (let i = 0; i < a.length; i++) arr.push(a[i]); g.dispose(); }
      for (let i = 1; i < arr.length; i += 3) arr[i] = y; return arr.length ? mesh(arr, color) : null; };
    const OSM = '© OpenStreetMap 贡献者（ODbL 1.0）';
    sub('osm.water', '水体与绿地', OSM); flat(D.g, COL.green, 0.12); flat(D.w.filter(o => o.a), COL.water, 0.18);
    line(segs(D.w.filter(o => !o.a), 0.2, []), 0x8fb7d0, 1);
    sub('osm.road', '道路', OSM);
    for (const nw of [false, true]) { const H = D.h.filter(o => inSite(o) === nw), ms = [];
      ms.push(mesh(ribbonTris(H.filter(o => o.w == 3), 22, 0.25, []), COL.road), mesh(ribbonTris(H.filter(o => o.w == 2), 14, 0.24, []), COL.road), mesh(ribbonTris(H.filter(o => o.w == 1), 9, 0.23, []), COL.road1));
      ms.push(line(segs(H.filter(o => o.w == 0), 0.22, []), 0xcfc9bd, 1), line(segs(H.filter(o => o.w >= 2), 0.26, []), 0xb9b2a4, 0.8));
      if (nw) { M._open.push(...ms); M._pre.push(line(segs(H.filter(o => o.w >= 1), 0.22, []), COL.pre, 0.55)); } }
    // 铁路与地铁
    sub('osm.rail', '铁路与地铁', OSM); const rs = D.r;
    line(segs(rs.filter(o => !o.m && o.y), 0.4, []), COL.yard, 1);
    mesh(ribbonTris(rs.filter(o => !o.m && !o.y && !o.x && !isNew(o)), 7, 0.5, []), COL.rail);
    M._open.push(mesh(ribbonTris(rs.filter(o => !o.m && !o.y && !o.x && isNew(o)), 7, 0.5, []), COL.rail));
    const byC = {}; for (const o of rs.filter(o => o.m && !o.x)) (byC[o.c + '|' + (isNew(o) ? 1 : 0)] = byC[o.c + '|' + (isNew(o) ? 1 : 0)] || []).push(o);
    for (const k in byC) { const [c, nw] = k.split('|'); const m = mesh(ribbonTris(byC[k], 6, 0.6, []), new THREE.Color(c).getHex()); if (nw === '1') M._open.push(m); }
    M._pre.push(mesh(ribbonTris(rs.filter(o => !o.y && !o.x && isNew(o)), 5, 0.45, []), COL.pre));
    line(segs(rs.filter(o => o.x), 0.5, []), 0x8c8c8c, 0.8);
    line(segs(D.ug, 0.3, []), 0x2f7bd0, 0.9);
    // 建筑：纸白体块 + 墨线轮廓（不受光，墨线 / 实景两遍渲染一致）；实高与默认高分两批合并
    sub('osm.bldg', '建筑', OSM); const bArr = { r: [], f: [], n: [] }, eArr = [], enArr = [];
    for (const o of D.b) { if (o.p.length < 4) continue; const sh = new THREE.Shape(o.p.map(p => new THREE.Vector2(p[0], -p[1]))), nw = inSite(o);
      const g = new THREE.ExtrudeGeometry(sh, { depth: o.h, bevelEnabled: false }).rotateX(-Math.PI / 2).toNonIndexed(), a = g.attributes.position.array, dst = nw ? bArr.n : o.r ? bArr.r : bArr.f; for (let i = 0; i < a.length; i++) dst.push(a[i]);
      const e = new THREE.EdgesGeometry(g, 30), ea = e.attributes.position.array, ed = nw ? enArr : eArr; for (let i = 0; i < ea.length; i++) ed.push(ea[i]); g.dispose(); e.dispose(); }
    mesh(bArr.r, COL.bReal, 1); mesh(bArr.f, COL.bFake, 1); line(eArr, COL.edge, 0.5);
    M._open.push(mesh(bArr.n, COL.bReal, 1), line(enArr, COL.edge, 0.5));   // 红线内的楼开通后才出现
    // 地形（异步解压）
    const GT = sub('dem', '地形', 'Copernicus DEM GLO-30'); G = G0;
    let demDone; M._ready = new Promise(r => { demDone = r; }); setTimeout(() => demDone(), 8000);
    if (!(D.dem && typeof DecompressionStream !== 'undefined')) demDone();
    else gunzipB64(D.dem.h).then(hq => { const t = demGrid(D.dem, D.frame, hq), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(t.pos, 3)); g.setIndex(new THREE.BufferAttribute(t.idx, 1)); g.computeVertexNormals();
      const nr = g.attributes.normal.array, col = new Float32Array(t.pos.length), c0 = new THREE.Color(0xe9e5dc), c1 = new THREE.Color(0xc3c9ad), c2 = new THREE.Color(0x8e9a78), cc = new THREE.Color();
      for (let k = 0; k < t.pos.length / 3; k++) { const h = t.pos[3 * k + 1]; cc.copy(c0).lerp(c1, Math.min(1, Math.max(0, h / 40))); if (h > 60) cc.lerp(c2, Math.min(1, (h - 60) / 250)); const sh = Math.max(0.55, Math.min(1.08, 0.35 + 0.75 * (nr[3 * k] * -0.45 + nr[3 * k + 1] * 0.78 + nr[3 * k + 2] * 0.43))); col[3 * k] = cc.r * sh; col[3 * k + 1] = cc.g * sh; col[3 * k + 2] = cc.b * sh; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, clippingPlanes: clip })); GT.add(m); M.demH = { D: D.dem, F: D.frame, hq }; M.demOk = true; demDone(); }).catch(e => { console.warn('osmctx 地形解压失败', e); demDone(); });
    // 标注（#mod-ui 内的小字，按投影摆放）
    const root = typeof document !== 'undefined' && document.getElementById('mod-ui');
    if (root) { const box = document.createElement('div'); box.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'; root.appendChild(box); M._box = box;
      const add = (t, x, z, y, cls, lid) => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'position:absolute;font-size:11px;white-space:nowrap;padding:0 3px;background:rgba(255,255,255,.75);border:1px solid ' + (cls === 'm' ? '#2f7bd0;color:#2f7bd0' : '#999;color:#222') + ';transform:translate(-50%,-100%);pointer-events:none;display:none'; box.appendChild(d); M._labs.push({ d, v: new THREE.Vector3(x, y, z), lid: lid || (cls === 'm' ? 'osm.rail' : 'osm.bldg'), grp: lid ? M._cur : null }); }; M._addLab = add;
      const cen = p => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
      for (const o of D.ug) { if (!o.n || o.n === '火车西站') continue; const c = cen(o.p); add('Ⓜ ' + o.n, c[0], c[1], 10, 'm'); }
      const seen = new Set(); for (const o of D.b) { if (!o.n || o.n.length < 3 || seen.has(o.n)) continue; if (o.h >= 60 || /创新馆|海创园/.test(o.n)) { seen.add(o.n); const c = cen(o.p); add(o.n, c[0], c[1], o.h + 6); } } }
    M._tmp = new THREE.Vector3();
    // —— 外挂图层（docs/ctx-layers.md）：先收已加载的 HZ_CTX_LAYERS，再按清单 web/mods/ctx/layers.json 动态加载 ——
    M._api = { THREE, G0, clip, COL, mesh: (arr, c, poly) => { G = M._cur; return mesh(arr, c, poly); }, line: (arr, c, op) => { G = M._cur; return line(arr, c, op); }, flat: (list, c, y) => { G = M._cur; return flat(list, c, y); }, label: (t, x, z, y, cls) => M._addLab && M._addLab(t, x, z, y, cls, M._curId), ribbonTris, segs, ll: M.ll, ground: M.ground };
    const reg = ROOT.HZ_CTX_LAYERS = ROOT.HZ_CTX_LAYERS || []; const take = L => M._ready.then(() => { try { M.addLayer(L); } catch (e) { console.warn('osmctx 图层 ' + (L && L.id) + ' 失败', e); } });
    for (const L of reg.slice()) take(L); reg.push = function (...a) { for (const L of a) { Array.prototype.push.call(reg, L); take(L); } return reg.length; };
        if (typeof document !== 'undefined' && M.base) fetch(M.base + 'ctx/layers.json').then(r => r.ok ? r.json() : { layers: [] }).then(j => { for (const e of j.layers || []) { if (e.on === false) M._defOff[e.id] = 1; const sc = document.createElement('script'); sc.src = M.base + 'ctx/' + e.file + (e.v ? '?v=' + e.v : ''); document.head.appendChild(sc); } }).catch(() => {});
    if (root) M._ui(root);
  };

  let lastOpen = null;
  M.update = function (t, cam) {
    if (!M._g) return;
    const op = t >= OPEN; if (op !== lastOpen) { lastOpen = op; for (const m of M._open) if (m) m.visible = op; for (const m of M._pre) if (m) m.visible = !op; }
    if (M._lastT !== t) { M._lastT = t; for (const e of M.layers) { if (!e.g) continue; e.g.visible = e.on && inWin(t, e.from, e.to); for (const it of e.items || []) it.g.visible = inWin(t, it.from, it.to); } }
    if (!M._box || !cam || !M._labs.length) return;
    const W = M._box.clientWidth, H = M._box.clientHeight, far = cam.position.length() > 900; M._box.style.display = far ? '' : 'none'; if (!far) return;
    const v = M._tmp; for (const L of M._labs) { v.copy(L.v).project(cam); const on = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
      const ly = L.lid && M.layers.find(e => e.id === L.lid); const vis = (!ly || !ly.g || ly.g.visible) && (!L.grp || L.grp.visible); if (!on || !vis) { if (L.d.style.display !== 'none') L.d.style.display = 'none'; continue; } L.d.style.display = ''; L.d.style.left = ((v.x + 1) / 2 * W).toFixed(0) + 'px'; L.d.style.top = ((1 - v.y) / 2 * H).toFixed(0) + 'px'; }
  };

  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(M);
})();
