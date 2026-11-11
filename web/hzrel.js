'use strict';
// ===== 构件上下游关系（relations，11-10 · hark-cr）：点一个构件 → 它靠谁撑着 / 等谁先装 / 它撑着谁 / 谁在等它 / 由哪台吊车 =====
// 只读引擎已有的数据，不手写关系表：
//   · 构件级支承 = hzseq.js supRule 的同一 R1 判定（盒顶面贴合 / 侧挂 / host），记在 engine part 的 p.supP（谁撑着这一件）；
//   · 工序级先后 = core/seq.js 推出的 a.pred（R3 工序先后、R4 临时设施搭 / 拆、R5 同一套设备、R8 提升扫掠让路、erect / served 等）；
//   · 吊车 = HZ.assignCranes 写的 p.crane（HZ.cranes 下标）/ p.crawl（履带吊站位 [x, z]）；屋盖网架行（p.grp 1–4）由本区液压提升器提。
// 图纸构件（插件 parts(t) 的一项）↔ 引擎构件：S-001 按 'K-<工序>'；S-301 按 J<n> 提升器 / ZS·ZM·ZN 分区；其余按 part.box 紧包（容差 0.6 m），
// 一件引擎构件归包它的最小盒（各图内是一个划分）；某盒一件也没分到（被更小的盒分光）时退回「盒内全部」。
// 纯函数、无 DOM：宿主 hzview.js 选中时调用并据此在图纸与 3D 里同时亮起；tools/hz/check_rel.js 在 Node 里逐图逐件验。
(function (G) {
  const HZ = G.HZ; if (!HZ) return;
  const TOL = 0.6;
  const WHY = { R1: '支承', R2: '先挖后建', R3: '工序先后', R4: '临时设施（先搭后用）', R5: '同一套设备轮流', R6: '采购到货', R7: '分期让路', R8: '提升扫掠让路', erect: '先搭后拆', served: '用完才拆', dig: '先挖后建', temp: '临时支承', gate: '闸门' };
  const base = k => String(k).replace(/~rm$/, '');
  const stOf = (a, t) => !a ? -1 : t < a.start ? 0 : t < a.end ? 1 : 2;   // 0 未开工 · 1 在建 · 2 已完成

  // ---------- 引擎索引（随 HZ.make 重建；按 HZ.acts 身份缓存）----------
  let IX = null;
  function index() {
    if (IX && IX.acts === HZ.acts) return IX;
    const all = [], inv = new Map(), actOf = new Map();
    for (const a of HZ.acts) { if (a.kind === 'untemp') continue; for (const p of a.parts) { if (actOf.has(p)) continue; actOf.set(p, a); all.push(p); } }
    for (const e of all) if (e.supP) for (const f of e.supP) { if (f === e) continue; let L = inv.get(f); if (!L) inv.set(f, L = []); L.push(e); }
    const succ = new Map(); for (const a of HZ.acts) for (const ed of a.pred) { let L = succ.get(ed.a); if (!L) succ.set(ed.a, L = []); L.push({ a, why: ed.why }); }
    IX = { acts: HZ.acts, all, inv, actOf, succ, graphs: new Map() };
    return IX;
  }
  // 'open'（开通）这个里程碑被规定在全部工序之后（hzseq.js 的一揽子 R3）：每件都「被开通等着」，信息量为零 → 两头都不计
  const skipAct = a => !a || a.kind === 'milestone';

  // ---------- S-301：宿主自画图（提升器 J01… / 分区 ZS·ZM·ZN），合成可点构件 ----------
  function parts301() {
    const out = [], K = HZ.K, rigP = K.rig ? K.rig.parts : [];
    HZ.lifters.forEach((L, i) => { const p = rigP.find(q => q.lift === L); if (!p) return; out.push({ id: 'J' + String(i + 1).padStart(2, '0'), label: '提升器 J' + String(i + 1).padStart(2, '0'), eng: [p], box: [p.geo.min[0], p.geo.min[1], p.geo.min[2], p.geo.max[0], p.geo.max[1], p.geo.max[2]] }); });
    for (const [z, id, nm] of [[1, 'ZS', '南区'], [2, 'ZM', '中区'], [3, 'ZN', '北区']]) { const a = K['asm' + z]; if (a) out.push({ id, label: nm + '网架', eng: a.parts.slice() }); }
    return out;
  }
  HZ.relParts301 = parts301;

  // ---------- 一张图的节点图：节点 = 图上可点构件；members = 它代表的引擎构件 ----------
  function graph(sheet, parts) {
    parts = (parts || []).filter(p => p && p.id != null);   // 封单深审：空项先滤掉，再算签名
    const ix = index(), sig = sheet + '|' + parts.map(p => p.id + ':' + (Array.isArray(p.box) ? p.box.map(v => (+v).toFixed(2)).join(',') : '')).join(';');
    const hit = ix.graphs.get(sheet); if (hit && hit.sig === sig) return hit;
    const nodes = parts.filter(p => p && p.id != null).map(p => ({ id: String(p.id), label: p.label || String(p.id), M: [], acts: new Set() }));
    if (sheet === 'S-001') {
      nodes.forEach(n => { const k = n.id.slice(2).split('-')[0], a = HZ.K[k]; if (!/^K-/.test(n.id) || !a) return; n.acts.add(a.key); if (a.rm) n.acts.add(a.rm.key); n.M = a.parts.slice(); n.act = a; });
    } else if (sheet === 'S-301') {
      const P = parts301(), by = new Map(P.map(q => [q.id, q])); nodes.forEach(n => { const q = by.get(n.id); if (q) n.M = q.eng.slice(); });
    } else {
      const bx = parts.filter(p => p && p.id != null).map(p => { const b = Array.isArray(p.box) && p.box.length === 6 && p.box.every(Number.isFinite) ? p.box : null; return b ? [Math.min(b[0], b[3]), Math.min(b[1], b[4]), Math.min(b[2], b[5]), Math.max(b[0], b[3]), Math.max(b[1], b[4]), Math.max(b[2], b[5])] : null; });
      const vol = b => (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]), inside = [];
      nodes.forEach(() => inside.push([]));
      for (const e of ix.all) { const mn = e.geo.min, mx = e.geo.max; let best = -1, bv = Infinity;
        for (let i = 0; i < nodes.length; i++) { const b = bx[i]; if (!b) continue;
          if (mn[0] >= b[0] - TOL && mn[1] >= b[1] - TOL && mn[2] >= b[2] - TOL && mx[0] <= b[3] + TOL && mx[1] <= b[4] + TOL && mx[2] <= b[5] + TOL) { inside[i].push(e); const v = vol(b); if (v < bv) { bv = v; best = i; } } }
        if (best >= 0) nodes[best].M.push(e); }
      nodes.forEach((n, i) => { if (!n.M.length && inside[i].length) { n.M = inside[i]; n.nested = 'inside'; } });
      // 剖面 / 条带一类的薄盒（S-101 横剖面、翼地下室）：没有整件落在盒里 → 退回「与盒相交（体积 > 0）」的永久构件（临时的塔吊塔身穿过剖面不算）
      nodes.forEach((n, i) => { const b = bx[i]; if (n.M.length || !b) return; for (const e of ix.all) { const ea = ix.actOf.get(e); if (ea && ea.kind === 'temp') continue; const mn = e.geo.min, mx = e.geo.max;
        if (Math.min(mx[0], b[3]) - Math.max(mn[0], b[0]) > 0.05 && Math.min(mx[1], b[4]) - Math.max(mn[1], b[1]) > 0.05 && Math.min(mx[2], b[5]) - Math.max(mn[2], b[2]) > 0.05) n.M.push(e); } if (n.M.length) n.nested = 'overlap'; });
    }
    const memberOf = new Map(), actNodes = new Map();
    nodes.forEach((n, i) => { for (const e of n.M) { let L = memberOf.get(e); if (!L) memberOf.set(e, L = []); L.push(i); const a = ix.actOf.get(e); if (a) { n.acts.add(a.key); if (a.rm) n.acts.add(a.rm.key); } }
      for (const k of n.acts) { let S = actNodes.get(k); if (!S) actNodes.set(k, S = new Set()); S.add(i); } });
    const g = { sig, sheet, nodes, memberOf, actNodes, byId: new Map(nodes.map((n, i) => [n.id, i])) };
    ix.graphs.set(sheet, g); return g;
  }

  // ---------- 吊车：成员里最多的那台 ----------
  function craneOf(M) {
    const tally = new Map(), put = (k, o) => { const c = tally.get(k); if (c) c.n++; else tally.set(k, Object.assign({ n: 1 }, o)); };
    for (const e of M) {
      if (e.crane >= 0) { const c = HZ.cranes[e.crane], a = HZ.K[c.key]; put('T' + e.crane, { kind: 'tower', idx: e.crane, id: 'T' + (e.crane + 1), name: (c.id || ('塔吊 T' + (e.crane + 1))) + (c.model ? '（' + c.model + '）' : '') + (a ? ' · ' + a.name : ''), station: [c.x, c.z], sheet: 'S-002' }); }
      else if (e.crawl) put('C' + e.crawl.join(','), { kind: 'crawler', idx: -1, id: null, name: '履带吊', station: e.crawl.map(v => Math.round(v * 10) / 10), sheet: 'S-002' });
      else if (e.grp >= 1 && e.grp <= 4) { const z = e.grp === 4 ? 0 : e.grp, n = HZ.lifters.filter(L => !z || L.zone === z).length; put('L' + z, { kind: 'lifters', idx: -1, id: null, name: (z ? ['', '南区', '中区', '北区'][z] : '整体') + '液压提升器 ' + n + ' 台', station: null, zone: z, sheet: 'S-301' }); }
    }
    const L = [...tally.values()].sort((a, b) => b.n - a.n);
    return { crane: L[0] || null, cranes: L };
  }

  // ---------- 这件出现在哪些图（按各图声明的范围工序；S-001 总进度含全部工序）----------
  const SHEET_KEYS_HOST = { 'S-101': ['found'], 'S-301': ['jig1', 'jig2', 'jig3', 'jigL1', 'jigL2', 'jigL3', 'asm1', 'asm2', 'asm3', 'rig', 'lift1', 'lift2', 'lift3', 'merge', 'wlift', 'head'] };
  HZ.REL_SHEET_KEYS = SHEET_KEYS_HOST;
  function sheetsOf(acts, t) {
    const out = [], P = G.HZ_SHEET_PLUGINS || [], ks = [...acts].map(base);
    for (const pl of P) { if (!pl || !pl.id) continue; let keys = null;
      if (pl.id === 'S-001') keys = null;
      else { let sc = null; try { sc = typeof pl.scope === 'function' ? pl.scope((pl.window || [0])[0]) : pl.scope; } catch (e) { sc = null; } keys = sc && Array.isArray(sc.keys) ? sc.keys : SHEET_KEYS_HOST[pl.id] || []; }
      const hitK = keys === null ? ks : ks.filter(k => keys.includes(k)); if (hitK.length) out.push({ sheet: pl.id, name: pl.name || pl.id, id: pl.id === 'S-001' ? 'K-' + hitK[0] : null }); }
    if (ks.some(k => SHEET_KEYS_HOST['S-301'].includes(k)) && !out.some(s => s.sheet === 'S-301')) out.push({ sheet: 'S-301', name: '整体提升', id: null });
    return out;
  }

  // ---------- 主入口 ----------
  // HZ.rel(sheet, partId, t, opt?) → null（图上没有这件）或
  // { sheet, id, label, t, n, nested, up:[项], down:[项], crane, cranes, sheets, acts, counts:{hold, wait, carry, next}, records }
  //   项 = { sheet, id, label, rel:'sup'|'seq'|'rm', level:'part'|'act', why, whyText, act, here:[本图 id], n, state }
  //   up  = rel 'sup'：靠谁撑着（构件级 R1）；rel 'seq'：等谁先装（工序级 pred，非 R1；或 R1 但构件级没覆盖到，如屋面靠合龙 / 柱头）
  //   down = 反向：它撑着谁 / 谁在等它
  //   opt.parts：本图此刻的 parts(t)（宿主传缓存的那份）；不给则宿主外自己调 pl.parts(t, {})（S-301 自动合成）
  // 不可枚举的 .hl = { self:Set, up:Set, down:Set }（引擎构件），供宿主 3D 着色。
  HZ.rel = function (sheet, id, t, opt) {
    opt = opt || {}; if (!HZ.acts || id == null) return null; sheet = String(sheet || '').toUpperCase(); id = String(id);
    let parts = opt.parts;
    if (!parts) { if (sheet === 'S-301') parts = parts301(); else { const pl = (G.HZ_SHEET_PLUGINS || []).find(q => q && q.id === sheet); if (!pl || typeof pl.parts !== 'function') return null; try { parts = pl.parts(t, opt.ctx || {}) || []; } catch (e) { return null; } } }
    const ix = index(), g = graph(sheet, parts), xi = g.byId.get(id); if (xi == null) return null;
    const X = g.nodes[xi], MX = new Set(X.M), hl = { self: MX, up: new Set(), down: new Set() };
    const up = [], down = [], upAct = new Set(), dnAct = new Set();
    const item = (rel, level, why, a, here, n, idOn) => ({ sheet: idOn ? sheet : 'S-001', id: idOn || 'K-' + base(a.key), label: idOn ? g.nodes[g.byId.get(idOn)].label : a.name, rel, level, why, whyText: WHY[why] || why, act: a ? a.key : null, here, n, state: stOf(a, t) });
    // ---- 构件级支承（S-001 节点是工序，全部走工序级）----
    if (sheet !== 'S-001') {
      const side = (dir) => { const onSheet = new Map(), off = new Map();
        for (const e of X.M) { const L = dir === 'up' ? (e.supP ? [...e.supP] : []) : (ix.inv.get(e) || []);
          for (const f of L) { if (f === e) continue; const fa = ix.actOf.get(f); if (!fa || skipAct(fa)) continue; (dir === 'up' ? hl.up : hl.down).add(f);
            const ns = g.memberOf.get(f); let placed = false;
            if (ns) for (const j of ns) { if (j === xi) continue; placed = true; let o = onSheet.get(j); if (!o) onSheet.set(j, o = { n: 0, acts: new Map() }); o.n++; o.acts.set(fa.key, fa); }
            if (!placed && !MX.has(f)) { let o = off.get(fa.key); if (!o) off.set(fa.key, o = { a: fa, n: 0 }); o.n++; } } }
        const out = dir === 'up' ? up : down, seen = dir === 'up' ? upAct : dnAct;
        for (const [j, o] of onSheet) { const a = [...o.acts.values()][0]; for (const k of o.acts.keys()) seen.add(k); out.push(item('sup', 'part', 'R1', a, [g.nodes[j].id], o.n, g.nodes[j].id)); }
        for (const o of off.values()) { seen.add(o.a.key); out.push(item('sup', 'part', 'R1', o.a, [...(g.actNodes.get(o.a.key) || [])].filter(j => j !== xi).map(j => g.nodes[j].id), o.n)); } };
      side('up'); side('down');
    }
    // ---- 工序级先后 ----
    const mine = X.acts, ups = new Map(), dns = new Map();
    // rel：R1 → 'sup'（构件级没覆盖到的工序级支承，如屋面靠合龙 / 柱头、网架靠楼面）；拆除工序（untemp）的前驱 → 'rm'（「拆之前要等」）；其余 → 'seq'
    const relOf = (why, rmSide) => rmSide ? 'rm' : why === 'R1' ? 'sup' : 'seq';
    for (const k of mine) { const B = HZ.K[k]; if (!B || skipAct(B)) continue;
      for (const ed of B.pred) { const A = ed.a; if (mine.has(A.key) || skipAct(A)) continue; if (ed.why === 'R1' && sheet !== 'S-001' && upAct.has(A.key)) continue; const r = relOf(ed.why, B.kind === 'untemp'), kk = A.key + '|' + r; if (!ups.has(kk)) ups.set(kk, { a: A, why: ed.why, r }); }
      for (const ed of ix.succ.get(B) || []) { const C = ed.a; if (mine.has(C.key) || skipAct(C)) continue; if (ed.why === 'R1' && sheet !== 'S-001' && dnAct.has(C.key)) continue; const r = relOf(ed.why, C.kind === 'untemp'), kk = C.key + '|' + r; if (!dns.has(kk)) dns.set(kk, { a: C, why: ed.why, r }); } }
    const hereOf = a => [...(g.actNodes.get(a.key) || [])].filter(j => j !== xi).map(j => g.nodes[j].id);
    for (const { a, why, r } of ups.values()) { up.push(item(r, 'act', why, a, hereOf(a), a.parts.length)); if (r !== 'rm') for (const p of a.parts) if (!MX.has(p)) hl.up.add(p); }
    for (const { a, why, r } of dns.values()) { down.push(item(r, 'act', why, a, hereOf(a), a.parts.length)); if (r !== 'rm') for (const p of a.parts) if (!MX.has(p)) hl.down.add(p); }
    for (const p of hl.up) if (MX.has(p)) hl.up.delete(p); for (const p of hl.down) if (MX.has(p) || hl.up.has(p)) hl.down.delete(p);
    // ---- 汇总 ----
    const cnt = (L, r) => L.filter(x => x.rel === r).reduce((s, x) => s + (x.level === 'part' ? x.n : 1), 0);
    const cr = craneOf(X.M);
    const R = { sheet, id, label: X.label, t, n: X.M.length, nested: X.nested || false, up, down, crane: cr.crane, cranes: cr.cranes, sheets: sheetsOf(mine, t), acts: [...mine],
      counts: { hold: cnt(up, 'sup'), wait: cnt(up, 'seq'), carry: cnt(down, 'sup'), next: cnt(down, 'seq'), rmWait: cnt(up, 'rm'), rmNext: cnt(down, 'rm') },
      records: G.HZR && typeof G.HZR.forPart === 'function' ? G.HZR.forPart(sheet, id).map(r => r.id) : [] };
    Object.defineProperty(R, 'hl', { value: hl, enumerable: false });
    return R;
  };
  HZ.relWhy = WHY;
  // 一张图里全部节点的关系（检查用）：返回 Map id → rel
  HZ.relAll = function (sheet, t, parts) { const out = new Map(); for (const p of parts || []) if (p && p.id != null && !out.has(String(p.id))) out.set(String(p.id), HZ.rel(sheet, p.id, t, { parts })); return out; };
})(typeof window !== 'undefined' ? window : globalThis);
