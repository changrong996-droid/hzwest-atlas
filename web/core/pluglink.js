'use strict';
// ===== 联动接口 v2 宿主侧纯函数核（docs/tasks/linkage-v2.md）=====
// 视图变换 / 逆变换命中 / 3D 盒拾取 / #focus= 读写 / parts 容错 / HZ_MODS 钩子调度 / 图纸范围 scopeMask & scopeCranes。
// 不依赖 DOM 与 three；浏览器挂在 window.HZ_PL（并由 hzview.js 暴露为 window.__pv.plugLink），Node 检查可直接 require。
(function (G) {
  const PL = (() => {
    const KMIN = 1, KMAX = 8;
    // 视图 v = { k, px, py }，画布 w×h：屏幕 = 中心 + (绘图坐标 − 中心)·k + 平移
    const apply = (g, v, w, h) => { g.translate(w / 2 + v.px, h / 2 + v.py); g.scale(v.k, v.k); g.translate(-w / 2, -h / 2); };
    const fwd = (v, w, h, x, y) => [w / 2 + (x - w / 2) * v.k + v.px, h / 2 + (y - h / 2) * v.k + v.py];
    const inv = (v, w, h, sx, sy) => [w / 2 + (sx - w / 2 - v.px) / v.k, h / 2 + (sy - h / 2 - v.py) / v.k];
    // 放大后允许把边缘的构件平移到画面中央（同 S-301 svClamp）
    function clamp(v, w, h) { v.k = Math.max(KMIN, Math.min(KMAX, v.k)); const ex = v.k - 1 + Math.min(1, v.k - 1), mx = ex * w / 2, my = ex * h / 2; v.px = Math.max(-mx, Math.min(mx, v.px)); v.py = Math.max(-my, Math.min(my, v.py)); return v; }
    // 以屏幕点 (mx, my) 为不动点缩放到 k1
    function zoomAt(v, w, h, k1, mx, my) { k1 = Math.max(KMIN, Math.min(KMAX, k1)); const cx = w / 2, cy = h / 2; v.px = mx - cx - (mx - cx - v.px) * k1 / v.k; v.py = my - cy - (my - cy - v.py) * k1 / v.k; v.k = k1; return clamp(v, w, h); }
    // 让绘图坐标 (x, y) 落在画布中央、倍数 k
    function centerOn(v, w, h, x, y, k) { v.k = Math.max(KMIN, Math.min(KMAX, k)); v.px = -(x - w / 2) * v.k; v.py = -(y - h / 2) * v.k; return clamp(v, w, h); }
    // 视图中心对应的绘图坐标（动画用：k 按指数、中心按线性插值）
    const center = (v, w, h) => inv(v, w, h, w / 2, h / 2);
    const okHit = p => p && Array.isArray(p.hit) && p.hit.length === 4 && p.hit.every(Number.isFinite);
    const okBox = p => p && Array.isArray(p.box) && p.box.length === 6 && p.box.every(Number.isFinite);
    // 屏幕点 → 逆变换 → 命中 part.hit（容差按屏幕 4 px 折回绘图坐标；多个命中取面积最小）
    function hitPart(parts, v, w, h, sx, sy, padPx) { const [x, y] = inv(v, w, h, sx, sy), pad = (padPx == null ? 4 : padPx) / v.k; let best = null, ba = Infinity;
      for (const p of parts || []) { if (!okHit(p)) continue; const [hx, hy, hw, hh] = p.hit, x0 = Math.min(hx, hx + hw), x1 = Math.max(hx, hx + hw), y0 = Math.min(hy, hy + hh), y1 = Math.max(hy, hy + hh);
        if (x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad) { const a = (x1 - x0) * (y1 - y0); if (a < ba) { ba = a; best = p; } } }
      return best; }
    const inBox = (b, x, y, z, m) => { m = m || 0; return x >= Math.min(b[0], b[3]) - m && x <= Math.max(b[0], b[3]) + m && y >= Math.min(b[1], b[4]) - m && y <= Math.max(b[1], b[4]) + m && z >= Math.min(b[2], b[5]) - m && z <= Math.max(b[2], b[5]) + m; };
    const vol = b => Math.abs((b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]));
    // 3D 命中点落在哪个 part.box 内（多个取体积最小）
    function pickBox(parts, x, y, z, m) { let best = null, bv = Infinity; for (const p of parts || []) { if (!okBox(p) || !inBox(p.box, x, y, z, m)) continue; const q = vol(p.box); if (q < bv) { bv = q; best = p; } } return best; }
    // parts(t, ctx) 容错：抛异常 / 非数组 → []，并只 warn 一次（warn 由调用方给，便于测试）；只保留有 id 的项
    function safeParts(pl, t, ctx, warn) { if (!pl || typeof pl.parts !== 'function') return []; let r;
      try { r = pl.parts(t, ctx); } catch (e) { if (warn && !pl.__plWarned) { pl.__plWarned = 1; warn('[hzview] ' + pl.id + '.parts() 抛异常，已忽略：' + (e && e.message || e)); } return []; }
      return Array.isArray(r) ? r.filter(p => p && p.id != null) : []; }
    const byId = (parts, id) => (parts || []).find(p => String(p.id) === String(id)) || null;
    // hash：读 sheet / focus；写 focus 时保留其它参数（hzatlas 的 sub 等）
    function parseHash(h) { const q = new URLSearchParams(String(h || '').replace(/^#/, '')); return { sheet: (q.get('sheet') || '').toUpperCase() || null, focus: q.get('focus') || null }; }
    function hashWith(h, focus) { const q = new URLSearchParams(String(h || '').replace(/^#/, '')); if (focus) q.set('focus', focus); else q.delete('focus'); return q.toString().replace(/%2C/g, ',').replace(/%3A/g, ':'); }
    // HZ_MODS 可选钩子（pick / unpick 等）：逐个调 m[name](...args)，没有该方法跳过；抛错只 warn 一次（每模块每钩子），不停用、不连坐；返回实际调用数
    function modsCall(list, name, args, warn) { let n = 0; for (const m of list || []) { if (!m || typeof m[name] !== 'function') continue; try { m[name](...(args || [])); n++; } catch (e) { const w = m.__plWarn || (m.__plWarn = {}); if (warn && !w[name]) { w[name] = 1; warn('[hzview] HZ_MODS ' + m.id + '.' + name + '() 抛异常，已忽略：' + (e && e.message || e)); } } } return n; }
    // 图纸范围（11-09，委托人：S-201 三维与图纸对不上）：插件图纸激活时，本图内容在 3D 里照常画，其余淡显成幽灵。
    // items = [{ key, min:[x,y,z], max:[x,y,z], st, rm }]（宿主的构件表，一项一个 HZ part）；返回 { on, mask(1 = 本图内容), n, live, src, keys }。
    // 范围 = pl.scope.keys ∪ (pl.leadKeys 或宿主 LEAD_KEYS) 的工序 ∪ parts(t) 各 box 紧包的构件（一个 box 至多认 16 件、每件至少占盒体积 2%，免得「全场」「分区」大盒把整站认进来）
    //        ∪ pl.scope.levels（标高带 [[y0, y1]]，可与 zones 取交）∪ pl.scope.zones（'ZS' / 'ZM' / 'ZN'，按构件中心 z）∪ pl.scope.boxes；
    // 只认本图时间窗内出现过的构件。pl.scope === false 或 { all: true } → 全显；推不出任何构件或已占在场构件 ≥ 90% → 全显（宁可不淡）。
    function scopeMask(pl, items, o) { o = o || {}; const n = items.length, m = new Uint8Array(n); let sc = pl ? pl.scope : null;
      if (typeof sc === 'function') { try { sc = sc(o.t); } catch (e) { sc = null; } }
      const all = src => ({ on: false, mask: m.fill(1), n, live: n, src, keys: [] });
      if (!pl || sc === false || (sc && sc.all)) return all('all');
      sc = sc && typeof sc === 'object' ? sc : {};
      const W = Array.isArray(pl.window) ? pl.window : [-Infinity, Infinity], src = [];
      const live = it => it.st != null && it.st <= W[1] && !(it.rm && it.rm[0] >= 0 && it.rm[0] + it.rm[1] <= W[0]);
      const keys = new Set([].concat(sc.keys || [], Array.isArray(pl.leadKeys) ? pl.leadKeys : (o.leadKeys || [])).map(k => String(k).replace(/~rm$/, '')));
      if (keys.size) { src.push('keys'); for (let i = 0; i < n; i++) { const it = items[i], sw = it.p && it.p.scopeWith; if (keys.has(it.key) || (Array.isArray(sw) && sw.some(k => keys.has(k)))) m[i] = 1; } }   // 构件 p.scopeWith = [工序 key]：随这些工序进范围（11-09：开口段落地胎架 jigL* 与其所站地铁层底板随 jig1..3）
      const ids = Array.isArray(sc.ids) ? new Set(sc.ids.map(String)) : null, CAP = o.cap || 16, tol = 0.6;
      const vol0 = b => (Math.abs(b[3] - b[0]) + 0.2) * (Math.abs(b[4] - b[1]) + 0.2) * (Math.abs(b[5] - b[2]) + 0.2);   // box 认件只认「占这个盒子一块」的构件（≥ 2% 体积），细高的塔吊盒不顺带认进楼板碎块
      const inside = (it, b, e) => { for (let k = 0; k < 3; k++) if (it.min[k] < Math.min(b[k], b[k + 3]) - e || it.max[k] > Math.max(b[k], b[k + 3]) + e) return false; return true; };
      let nb = 0; for (const p of o.parts || []) { if (!okBox(p) || (ids && !ids.has(String(p.id)))) continue; const hit = [];
        const bv = vol0(p.box); for (let i = 0; i < n && hit.length <= CAP; i++) { const it = items[i]; if (live(it) && inside(it, p.box, tol) && vol0([...it.min, ...it.max]) >= 0.02 * bv) hit.push(i); }
        if (o.frag && hit.length && hit.length <= CAP) { const hk = {}, ik = {}; for (const i of hit) hk[items[i].key] = (hk[items[i].key] || 0) + 1;   // o.frag（隐藏模式）：盒子只认到某工序在盒内构件的一小撮（< 50%，例 S-501「站房屋盖」盒只认进 2 块合龙段）→ 这一撮是碎片，不认，免得半空悬一条
          for (let i = 0; i < n; i++) { const k = items[i].key; if (hk[k] && live(items[i]) && inside(items[i], p.box, tol)) ik[k] = (ik[k] || 0) + 1; }
          for (let j = hit.length - 1; j >= 0; j--) { const k = items[hit[j]].key; if (hk[k] < 0.5 * ik[k]) hit.splice(j, 1); } }
        if (hit.length && hit.length <= CAP) { nb++; for (const i of hit) m[i] = 1; } }
      if (nb) src.push('parts');
      const lv = (sc.levels || []).filter(b => Array.isArray(b) && b.length === 2 && b.every(Number.isFinite)), zs = (sc.zones || []).map(String), bx = (sc.boxes || []).filter(b => okBox({ box: b })), mz = o.midZ == null ? 17 : o.midZ;
      const zoneOf = it => { const z = (it.min[2] + it.max[2]) / 2; return Math.abs(z) <= mz + 3.5 ? 'ZM' : z > 0 ? 'ZS' : 'ZN'; };
      if (lv.length || zs.length) { src.push('band'); for (let i = 0; i < n; i++) { const it = items[i]; if (!live(it)) continue;
        if (lv.length && !lv.some(b => it.min[1] >= Math.min(b[0], b[1]) - 0.5 && it.max[1] <= Math.max(b[0], b[1]) + 0.5)) continue; if (zs.length && !zs.includes(zoneOf(it))) continue; m[i] = 1; } }
      if (bx.length) { src.push('boxes'); for (let i = 0; i < n; i++) if (live(items[i]) && bx.some(b => inside(items[i], b, tol))) m[i] = 1; }
      let k = 0, L = 0; const ks = new Set(); for (let i = 0; i < n; i++) { if (m[i]) ks.add(items[i].key); if (!live(items[i])) continue; L++; if (m[i]) k++; }
      if (!k) return all('none'); if (k >= 0.9 * L) return all('most');
      return { on: true, mask: m, n: k, live: L, src: src.join('+'), keys: [...ks] }; }
    // 现场机械随范围（11-09 委托人：范围外隐藏）：塔吊 cr[i] = { mast: 塔身构件下标 | -1, seq: [{ i: 所吊构件下标, t: 吊装时刻 }] }；
    // 塔身已在范围内，或它吊的构件里有范围内的、且吊装时刻落在本图时间窗 ±30 天 → 留（返回 1）；否则 0 = 隐藏
    function scopeCranes(cr, mask, W) { W = Array.isArray(W) ? W : [-Infinity, Infinity]; return cr.map(c => (c.mast >= 0 && mask[c.mast]) || c.seq.some(e => e.i >= 0 && mask[e.i] && e.t >= W[0] - 30 && e.t <= W[1] + 30) ? 1 : 0); }
    return { KMIN, KMAX, apply, fwd, inv, clamp, zoomAt, centerOn, center, hitPart, pickBox, inBox, vol, okBox, okHit, safeParts, byId, parseHash, hashWith, modsCall, scopeMask, scopeCranes };
  })();

  G.HZ_PL = PL;
  if (typeof module !== 'undefined' && module.exports) module.exports = PL;
})(typeof window !== 'undefined' ? window : globalThis);
