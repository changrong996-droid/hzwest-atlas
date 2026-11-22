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
  const COL = { paper: 0xefebe3, bReal: 0xe2ddd3, bFake: 0xece8df, edge: 0x2a2622, green: 0xd3e3c4, water: 0xbcd6e6, road: 0xffffff, road1: 0xfbfaf7, rail: 0x1a1a1a, pre: 0xc9c4ba, yard: 0x9a9a9a };
  const M = { id: 'osmctx', replaces: ['ctx.city', 'mtn'], stat: null, _g: null, _open: [], _pre: [], _labs: [] };

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

  M.build = function (scene, HZ, THREE, opts) {
    const D = ROOT.HZ_OSMCTX; if (!D) throw new Error('缺 web/mods/osmctx-data.js');
    M.stat = { b: D.b.length, h: D.h.length, r: D.r.length };
    if (!scene || !THREE) return;   // Node 检查：只登记
    const clip = (opts && opts.clip) || [];
    const G = new THREE.Group(); G.name = 'osmctx'; scene.add(G); M._g = G;
    const mesh = (arr, color, poly) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: poly || -1, clippingPlanes: clip })); G.add(m); return m; };
    const line = (arr, color, op) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: op < 1, opacity: op, clippingPlanes: clip })); G.add(l); return l; };
    // 面状：绿地、水体（模型系 z 南 → Shape 用 (x, -z) 再转回）
    const flat = (list, color, y) => { const arr = []; for (const o of list) { if (o.p.length < 4) continue; const sh = new THREE.Shape(o.p.map(p => new THREE.Vector2(p[0], -p[1])));
      const g = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).toNonIndexed(), a = g.attributes.position.array; for (let i = 0; i < a.length; i++) arr.push(a[i]); g.dispose(); }
      for (let i = 1; i < arr.length; i += 3) arr[i] = y; return arr.length ? mesh(arr, color) : null; };
    flat(D.g, COL.green, 0.12); flat(D.w.filter(o => o.a), COL.water, 0.18);
    line(segs(D.w.filter(o => !o.a), 0.2, []), 0x8fb7d0, 1);
    // 道路
    mesh(ribbonTris(D.h.filter(o => o.w == 3), 22, 0.25, []), COL.road); mesh(ribbonTris(D.h.filter(o => o.w == 2), 14, 0.24, []), COL.road); mesh(ribbonTris(D.h.filter(o => o.w == 1), 9, 0.23, []), COL.road1);
    line(segs(D.h.filter(o => o.w == 0), 0.22, []), 0xcfc9bd, 1); line(segs(D.h.filter(o => o.w >= 2), 0.26, []), 0xb9b2a4, 0.8);
    // 铁路与地铁
    const rs = D.r;
    line(segs(rs.filter(o => !o.m && o.y), 0.4, []), COL.yard, 1);
    mesh(ribbonTris(rs.filter(o => !o.m && !o.y && !o.x && !isNew(o)), 7, 0.5, []), COL.rail);
    M._open.push(mesh(ribbonTris(rs.filter(o => !o.m && !o.y && !o.x && isNew(o)), 7, 0.5, []), COL.rail));
    const byC = {}; for (const o of rs.filter(o => o.m && !o.x)) (byC[o.c + '|' + (isNew(o) ? 1 : 0)] = byC[o.c + '|' + (isNew(o) ? 1 : 0)] || []).push(o);
    for (const k in byC) { const [c, nw] = k.split('|'); const m = mesh(ribbonTris(byC[k], 6, 0.6, []), new THREE.Color(c).getHex()); if (nw === '1') M._open.push(m); }
    M._pre.push(mesh(ribbonTris(rs.filter(o => !o.y && !o.x && isNew(o)), 5, 0.45, []), COL.pre));
    line(segs(rs.filter(o => o.x), 0.5, []), 0x8c8c8c, 0.8);
    line(segs(D.ug, 0.3, []), 0x2f7bd0, 0.9);
    // 建筑：纸白体块 + 墨线轮廓（不受光，墨线 / 实景两遍渲染一致）；实高与默认高分两批合并
    const bArr = { r: [], f: [] }, eArr = [];
    for (const o of D.b) { if (o.p.length < 4) continue; const sh = new THREE.Shape(o.p.map(p => new THREE.Vector2(p[0], -p[1])));
      const g = new THREE.ExtrudeGeometry(sh, { depth: o.h, bevelEnabled: false }).rotateX(-Math.PI / 2).toNonIndexed(), a = g.attributes.position.array, dst = o.r ? bArr.r : bArr.f; for (let i = 0; i < a.length; i++) dst.push(a[i]);
      const e = new THREE.EdgesGeometry(g, 30), ea = e.attributes.position.array; for (let i = 0; i < ea.length; i++) eArr.push(ea[i]); g.dispose(); e.dispose(); }
    mesh(bArr.r, COL.bReal, 1); mesh(bArr.f, COL.bFake, 1); line(eArr, COL.edge, 0.5);
    // 地形（异步解压）
    if (D.dem && typeof DecompressionStream !== 'undefined') gunzipB64(D.dem.h).then(hq => { const t = demGrid(D.dem, D.frame, hq), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(t.pos, 3)); g.setIndex(new THREE.BufferAttribute(t.idx, 1)); g.computeVertexNormals();
      const nr = g.attributes.normal.array, col = new Float32Array(t.pos.length), c0 = new THREE.Color(0xe9e5dc), c1 = new THREE.Color(0xc3c9ad), c2 = new THREE.Color(0x8e9a78), cc = new THREE.Color();
      for (let k = 0; k < t.pos.length / 3; k++) { const h = t.pos[3 * k + 1]; cc.copy(c0).lerp(c1, Math.min(1, Math.max(0, h / 40))); if (h > 60) cc.lerp(c2, Math.min(1, (h - 60) / 250)); const sh = Math.max(0.55, Math.min(1.08, 0.35 + 0.75 * (nr[3 * k] * -0.45 + nr[3 * k + 1] * 0.78 + nr[3 * k + 2] * 0.43))); col[3 * k] = cc.r * sh; col[3 * k + 1] = cc.g * sh; col[3 * k + 2] = cc.b * sh; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, clippingPlanes: clip })); G.add(m); M.demOk = true; }).catch(e => console.warn('osmctx 地形解压失败', e));
    // 标注（#mod-ui 内的小字，按投影摆放）
    const root = typeof document !== 'undefined' && document.getElementById('mod-ui');
    if (root) { const box = document.createElement('div'); box.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'; root.appendChild(box); M._box = box;
      const add = (t, x, z, y, cls) => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'position:absolute;font-size:11px;white-space:nowrap;padding:0 3px;background:rgba(255,255,255,.75);border:1px solid ' + (cls === 'm' ? '#2f7bd0;color:#2f7bd0' : '#999;color:#222') + ';transform:translate(-50%,-100%);pointer-events:none;display:none'; box.appendChild(d); M._labs.push({ d, v: new THREE.Vector3(x, y, z) }); };
      const cen = p => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
      for (const o of D.ug) { if (!o.n || o.n === '火车西站') continue; const c = cen(o.p); add('Ⓜ ' + o.n, c[0], c[1], 10, 'm'); }
      const seen = new Set(); for (const o of D.b) { if (!o.n || o.n.length < 3 || seen.has(o.n)) continue; if (o.h >= 60 || /创新馆|海创园/.test(o.n)) { seen.add(o.n); const c = cen(o.p); add(o.n, c[0], c[1], o.h + 6); } } }
    M._tmp = new THREE.Vector3();
  };

  let lastOpen = null;
  M.update = function (t, cam) {
    if (!M._g) return;
    const op = t >= OPEN; if (op !== lastOpen) { lastOpen = op; for (const m of M._open) if (m) m.visible = op; for (const m of M._pre) if (m) m.visible = !op; }
    if (!M._box || !cam || !M._labs.length) return;
    const W = M._box.clientWidth, H = M._box.clientHeight, far = cam.position.length() > 900; M._box.style.display = far ? '' : 'none'; if (!far) return;
    const v = M._tmp; for (const L of M._labs) { v.copy(L.v).project(cam); const on = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
      if (!on) { if (L.d.style.display !== 'none') L.d.style.display = 'none'; continue; } L.d.style.display = ''; L.d.style.left = ((v.x + 1) / 2 * W).toFixed(0) + 'px'; L.d.style.top = ((1 - v.y) / 2 * H).toFixed(0) + 'px'; }
  };

  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(M);
})();
