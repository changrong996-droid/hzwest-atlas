// 近景人员与车辆（docs/tasks/mods-actors.md）· hark-darrio
// 按 HZ.acts 当前在做的工序，在作业面生成墨线小人（站 / 推 / 焊 / 指挥 4 种姿态）与车辆（混凝土罐车、平板车、履带吊）。
// 规则：只在镜头 < 120 m 时出现；数量随工序强度（在建构件数 × 工种班组系数）变；落在在场构件的顶面上（不穿模、不悬空），
// 地面 = y 0（基础底板顶面同高）。位置每小时按工序重排，确定性（同一时刻任何机器结果相同）。
// 接口：window.HZ_MODS.push({ id:'actors', build(scene, HZ, THREE, opts), update(t, cam) })；THREE 由宿主传第 3 个参数（hzview 里 THREE 是模块，不在 window 上）；
// opts.clip（THREE.Plane[]，可选）：给线材质加 clippingPlanes，剖切时小人与车一起切（D-16）。
// 不传 THREE（Node 检查）时只算布置与线段缓冲，不建 three.js 对象。
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const R_SHOW = 120;            // 镜头距离阈值（米）
  const MAXSEG = 60000;          // 线段缓冲上限
  const CELL = 16;               // 空间网格（米）
  const EPS = 0.03;              // 顶面贴合容差（米）

  // ---------- 形体（局部坐标：x 右、y 上、z 前；米；脚底 y = 0） ----------
  const S = [];                  // 临时
  const seg = (out, a, b) => { out.push(a[0], a[1], a[2], b[0], b[1], b[2]); };
  const poly = (out, pts, close) => { for (let i = 0; i < pts.length - (close ? 0 : 1); i++) seg(out, pts[i], pts[(i + 1) % pts.length]); };
  const ring = (out, c, r, axis, n) => { n = n || 8; const P = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, u = Math.cos(a) * r, v = Math.sin(a) * r;
    P.push(axis === 'x' ? [c[0], c[1] + u, c[2] + v] : axis === 'z' ? [c[0] + u, c[1] + v, c[2]] : [c[0] + u, c[1], c[2] + v]); } poly(out, P, true); };
  const boxL = (out, x0, y0, z0, x1, y1, z1) => { const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(out, v[a], v[b]); };
  const head = (out, c) => { ring(out, c, 0.11, 'z', 8); ring(out, c, 0.11, 'x', 8); seg(out, [c[0] - 0.17, c[1] + 0.06, c[2]], [c[0] + 0.17, c[1] + 0.06, c[2]]); seg(out, [c[0], c[1] + 0.06, c[2] - 0.17], [c[0], c[1] + 0.06, c[2] + 0.17]); };  // 头 + 安全帽檐
  const limb = (out, ...p) => poly(out, p, false);

  function figure(kind) { const o = [];
    if (kind === 'stand') { const H = [0, 0.95, 0], N = [0, 1.45, 0];
      seg(o, H, N); head(o, [0, 1.6, 0]); limb(o, H, [-0.1, 0.5, 0], [-0.12, 0, 0]); limb(o, H, [0.1, 0.5, 0], [0.12, 0, 0]);
      seg(o, [-0.2, 1.42, 0], [0.2, 1.42, 0]); limb(o, [-0.2, 1.42, 0], [-0.25, 1.12, 0], [-0.24, 0.86, 0.04]); limb(o, [0.2, 1.42, 0], [0.25, 1.12, 0], [0.24, 0.86, 0.04]); }
    else if (kind === 'push') { const H = [0, 0.9, -0.05], N = [0, 1.32, 0.3];   // 前倾推斗车（混凝土、铺轨）
      seg(o, H, N); head(o, [0, 1.46, 0.4]); limb(o, H, [-0.1, 0.48, 0.2], [-0.12, 0, 0.3]); limb(o, H, [0.1, 0.5, -0.25], [0.12, 0, -0.45]);
      seg(o, [-0.2, 1.3, 0.28], [0.2, 1.3, 0.28]); limb(o, [-0.2, 1.3, 0.28], [-0.22, 1.08, 0.5], [-0.22, 0.82, 0.68]); limb(o, [0.2, 1.3, 0.28], [0.22, 1.08, 0.5], [0.22, 0.82, 0.68]);
      boxL(o, -0.3, 0.3, 0.75, 0.3, 0.65, 1.3); seg(o, [-0.22, 0.82, 0.68], [-0.22, 0.6, 0.8]); seg(o, [0.22, 0.82, 0.68], [0.22, 0.6, 0.8]); ring(o, [0, 0.18, 1.35], 0.18, 'x', 8); }
    else if (kind === 'weld') { const H = [0, 0.52, -0.12], N = [0, 0.98, 0.12];   // 蹲焊
      seg(o, H, N); head(o, [0, 1.12, 0.22]); limb(o, H, [-0.15, 0.48, 0.25], [-0.15, 0, 0.12]); limb(o, H, [0.15, 0.48, 0.25], [0.15, 0, 0.12]);
      seg(o, [-0.2, 0.95, 0.1], [0.2, 0.95, 0.1]); limb(o, [-0.2, 0.95, 0.1], [-0.12, 0.7, 0.35], [0, 0.5, 0.48]); limb(o, [0.2, 0.95, 0.1], [0.12, 0.7, 0.35], [0, 0.5, 0.48]);
      seg(o, [0, 0.5, 0.48], [0, 0.08, 0.62]); boxL(o, -0.14, 1.0, 0.33, 0.14, 1.24, 0.38); }   // 焊枪 + 面罩
    else { const H = [0, 0.95, 0], N = [0, 1.45, 0];   // 指挥：一臂上举、一臂平指
      seg(o, H, N); head(o, [0, 1.6, 0]); limb(o, H, [-0.12, 0.5, 0], [-0.16, 0, 0]); limb(o, H, [0.12, 0.5, 0], [0.16, 0, 0]);
      seg(o, [-0.2, 1.42, 0], [0.2, 1.42, 0]); limb(o, [-0.2, 1.42, 0], [-0.3, 1.68, 0], [-0.32, 1.95, 0]); limb(o, [0.2, 1.42, 0], [0.45, 1.42, 0.05], [0.68, 1.43, 0.1]);
      seg(o, [-0.32, 1.95, 0], [-0.32, 2.15, 0]); seg(o, [-0.32, 2.15, 0], [-0.5, 2.08, 0]); }   // 小旗
    return new Float32Array(o); }

  // 车辆：局部 x = 车头方向；脚印 hx × hz，高 h（穿模检查只看底盘箱体）
  function vehicle(kind) { const o = [];
    const wheels = (xs, hz, r) => { for (const x of xs) for (const s of [-1, 1]) { ring(o, [x, r, s * hz], r, 'z', 10); seg(o, [x, r, s * hz - 0.15], [x, r, s * hz + 0.15]); } };
    if (kind === 'mixer') {   // 混凝土罐车 9.0 × 2.5 m
      boxL(o, -4.5, 0.9, -1.2, 4.5, 1.3, 1.2); boxL(o, 2.3, 1.3, -1.2, 4.5, 3.4, 1.2); seg(o, [2.3, 2.4, -1.2], [4.5, 2.6, -1.2]); seg(o, [2.3, 2.4, 1.2], [4.5, 2.6, 1.2]);
      const A = [-4.2, 2.1], B = [1.8, 3.1], n = 10, r0 = 1.15, r1 = 0.7, D = [];   // 倾斜搅拌筒
      for (let k = 0; k <= 4; k++) { const f = k / 4, cx = A[0] + (B[0] - A[0]) * f, cy = A[1] + (B[1] - A[1]) * f, r = (f < 0.5 ? r1 + (r0 - r1) * f * 2 : r0 - (r0 - r1) * (f - 0.5) * 2) * (k === 0 || k === 4 ? 0.75 : 1); ring(o, [cx, cy, 0], r, 'x', n); D.push([cx, cy, r]); }
      for (let i = 0; i < n; i += 2) { const a = i / n * Math.PI * 2, P = D.map(([cx, cy, r]) => [cx, cy + Math.cos(a) * r, Math.sin(a) * r]); poly(o, P, false); }
      seg(o, [-4.5, 2.0, 0], [-5.2, 1.2, 0]); seg(o, [-5.2, 1.2, 0], [-5.4, 0.9, 0]);   // 溜槽
      wheels([-3.4, -2.0, 3.4], 1.1, 0.5); return { L: new Float32Array(o), hx: 5.4, hz: 1.35, h: 4.4 }; }
    if (kind === 'flatbed') {   // 平板车 12.0 × 2.5 m，载 2 根钢构件
      boxL(o, -6, 1.1, -1.25, 4, 1.45, 1.25); boxL(o, 4, 1.1, -1.2, 6, 3.3, 1.2); seg(o, [4, 2.3, -1.2], [6, 2.5, -1.2]); seg(o, [4, 2.3, 1.2], [6, 2.5, 1.2]);
      for (const z of [-0.6, 0.6]) { boxL(o, -5.6, 1.45, z - 0.3, 3.4, 2.05, z + 0.3); seg(o, [-5.6, 1.75, z], [3.4, 1.75, z]); }
      for (const x of [-4, 0, 3]) seg(o, [x, 2.05, -1.0], [x, 1.1, -1.25]);   // 绑带
      wheels([-4.6, -3.4, 2.2, 5.0], 1.1, 0.5); return { L: new Float32Array(o), hx: 6.1, hz: 1.35, h: 3.4 }; }
    // 履带吊底盘（臂架按目标动态加）：两条履带 7.2 × 1.0、车身、配重
    for (const s of [-1, 1]) { const z0 = s * 2.3; boxL(o, -3.6, 0, z0 - 0.5, 3.6, 1.2, z0 + 0.5); for (let x = -3; x <= 3; x += 1) seg(o, [x, 0, z0 - 0.5], [x, 1.2, z0 - 0.5]); ring(o, [-3.0, 0.6, z0 + s * 0.52], 0.55, 'z', 10); ring(o, [3.0, 0.6, z0 + s * 0.52], 0.55, 'z', 10); }
    boxL(o, -2.4, 1.2, -1.8, 2.2, 3.4, 1.8); boxL(o, -3.4, 1.4, -1.6, -2.4, 3.0, 1.6); boxL(o, 1.2, 1.2, 1.0, 2.6, 3.2, 1.9);   // 车身 + 配重 + 驾驶室
    return { L: new Float32Array(o), hx: 3.7, hz: 2.9, h: 3.4 }; }

  const FIG = { stand: figure('stand'), push: figure('push'), weld: figure('weld'), signal: figure('signal') };
  const VEH = { mixer: vehicle('mixer'), flatbed: vehicle('flatbed'), crawler: vehicle('crawler') };
  const FW = 0.3, FH = 1.85;   // 小人占位半宽、高（穿模检查）

  // ---------- 工种规则 ----------
  // 每个在建构件的班组人数（白天），姿态配比；夜间 30%
  const TRADE = {
    civil: { n: 6, mix: ['push', 'push', 'stand', 'stand', 'signal'], veh: 'mixer' },
    frame: { n: 5, mix: ['push', 'push', 'stand', 'weld', 'signal'], veh: 'mixer' },
    mezz: { n: 4, mix: ['push', 'stand', 'stand', 'signal'], veh: 'mixer' },
    bridge: { n: 4, mix: ['push', 'stand', 'weld', 'signal'], veh: 'mixer' },
    track: { n: 4, mix: ['push', 'push', 'stand', 'signal'], veh: 'flatbed' },
    steel: { n: 4, mix: ['weld', 'weld', 'stand', 'signal'], veh: 'flatbed' },
    asm: { n: 5, mix: ['weld', 'weld', 'weld', 'stand', 'signal'], veh: 'flatbed' },
    jig: { n: 3, mix: ['weld', 'stand', 'signal'], veh: 'flatbed' },
    skin: { n: 4, mix: ['weld', 'stand', 'stand', 'signal'], veh: 'flatbed' },
    tod: { n: 4, mix: ['push', 'stand', 'weld', 'signal'], veh: 'mixer' },
    ym: { n: 4, mix: ['push', 'stand', 'weld', 'signal'], veh: 'mixer' },
  };
  const tradeOf = a => { for (const k in a.res) if (TRADE[k]) return k; return null; };
  const stOf = (p, t) => { if (p.st == null || t < p.st) return -1; if (p.rm && p.rm[0] >= 0 && t >= p.rm[0]) return t >= p.rm[0] + p.rm[1] ? 3 : 2; return t < p.st + p.du ? (t - p.st) / p.du : 2; };
  const present = (p, t) => { const s = stOf(p, t); return s >= 0 && s !== 3; };
  const rng = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let q = Math.imul(s ^ s >>> 15, 1 | s); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; }; };

  // ---------- 场地索引：所有固定构件的盒子（不含移动分区 grp 与网架格） ----------
  function index(HZ) { const B = [], G = new Map();
    for (const a of HZ.acts) for (const p of a.parts) { if (p.grp || p.cells || !p.geo || !p.geo.boxes) continue; for (const b of p.geo.boxes) B.push({ p, a, b }); }
    const seen = new Set();
    for (let i = 0; i < B.length; i++) { const { b } = B[i]; const k = b.min.join() + '|' + b.max.join() + '|' + B[i].p.st; if (seen.has(k)) continue; seen.add(k);   // 拆除活动共享 parts，去重
      const x0 = Math.floor(b.min[0] / CELL), x1 = Math.floor(b.max[0] / CELL), z0 = Math.floor(b.min[2] / CELL), z1 = Math.floor(b.max[2] / CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const key = x * 4096 + z; let l = G.get(key); if (!l) G.set(key, l = []); l.push(i); } }
    const crawl = []; for (const a of HZ.acts) for (const p of a.parts) if (p.crane === -1 && p.crawl) crawl.push({ a, p });
    return { B, G, crawl, stamp: new Uint32Array(B.length), gen: 0 }; }
  function near(I, x0, z0, x1, z1, fn) { const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL), cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    const multi = cx1 > cx0 || cz1 > cz0, g = multi ? ++I.gen : 0, st = I.stamp;
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) { const l = I.G.get(x * 4096 + z); if (!l) continue; for (let j = 0; j < l.length; j++) { const i = l[j]; if (multi) { if (st[i] === g) continue; st[i] = g; } if (fn(I.B[i]) === false) return false; } } return true; }
  // 体积 [x0,x1]×[y0,y1]×[z0,z1] 与在场构件不相交
  function clear(I, t, x0, y0, z0, x1, y1, z1) { return near(I, x0, z0, x1, z1, e => { const b = e.b; if (b.max[0] <= x0 || b.min[0] >= x1 || b.max[2] <= z0 || b.min[2] >= z1 || b.max[1] <= y0 || b.min[1] >= y1) return; if (present(e.p, t)) return false; }); }
  // 点 (x,z) 在高度 y 有支承：在场构件顶面（±EPS），或 y≈0 的地面且正下方无在场构件伸出地面以上
  function supportAt(I, t, x, y, z) { let ok = false;
    near(I, x, z, x, z, e => { const b = e.b; if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) return; if (Math.abs(b.max[1] - y) <= EPS && present(e.p, t)) { ok = true; return false; } });
    if (ok) return true; if (Math.abs(y) > EPS) return false;
    let pit = false; near(I, x, z, x, z, e => { const b = e.b; if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) return; if (b.max[1] < -EPS && b.min[1] < -1 && e.a.stage === 'found' && !present(e.p, t)) { pit = true; return false; } });
    return !pit; }
  // (x,z) 处、高度 ≤ ymax 的最高支承面：在场构件顶面，否则地面 0（基坑未回填处为 null）
  function surfaceAt(I, t, x, z, ymax) { let y = null; near(I, x, z, x, z, e => { const b = e.b; if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2] || b.max[1] > ymax + EPS || !present(e.p, t)) return; if (y == null || b.max[1] > y) y = b.max[1]; });
    if (y == null && ymax >= 0 && supportAt(I, t, x, 0, z)) y = 0; return y; }
  function supported(I, t, x, y, z, hx, hz, ca, sa) { for (const [u, v] of [[0, 0], [-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) if (!supportAt(I, t, x + u * ca - v * sa, y, z + u * sa + v * ca)) return false; return true; }
  // 旋转后的占位按轴对齐外包盒检查（保守）
  function clearRot(I, t, x, y, z, hx, hz, h, ca, sa) { const ex = Math.abs(hx * ca) + Math.abs(hz * sa), ez = Math.abs(hx * sa) + Math.abs(hz * ca); return clear(I, t, x - ex, y + 0.02, z - ez, x + ex, y + h, z + ez); }

  // ---------- 布置 ----------
  function plan(HZ, I, t) {
    const hr = Math.floor(t * 24), hd = (t - Math.floor(t)) * 24, day = hd >= 7 && hd < 19, out = { t, figs: [], vehs: [], cranes: [], acts: [] };
    const placed = [];   // 已放的占位（互不重叠）
    const freeOf = (x0, z0, x1, z1, y0, y1) => { for (const q of placed) if (!(q[3] <= x0 || q[0] >= x1 || q[5] <= z0 || q[2] >= z1 || q[4] <= y0 || q[1] >= y1)) return false; return true; };
    for (const a of HZ.acts) { if (a.kind === 'milestone' || a.kind === 'untemp' || !(t >= a.start && t < a.end) || !a.parts.length) continue; const tr = tradeOf(a); if (!tr) continue;
      const live = a.parts.filter(p => !p.grp && !p.cells && p.geo && p.geo.boxes && (() => { const s = stOf(p, t); return s >= 0 && s < 1; })()); if (!live.length) continue;
      const T = TRADE[tr], R = rng(hr * 7919 + a.ix * 104729 + 17); let nA = 0;
      const pick = live.length > 24 ? live.filter((_, i) => i % Math.ceil(live.length / 24) === 0) : live;
      for (const p of pick) { const nP = Math.max(1, Math.round(T.n * (day ? 1 : 0.3)));
        const tops = p.geo.boxes.filter(b => b.max[0] - b.min[0] >= 1.4 && b.max[2] - b.min[2] >= 1.4 && b.max[1] >= p.top - 0.05 && (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]) >= 6), mn = p.geo.min, mx = p.geo.max;
        for (let k = 0; k < nP; k++) { for (let tryN = 0; tryN < 6; tryN++) { let x, y, z; const yaw = R() * Math.PI * 2;
            if (tops.length && tryN < 4) { const b = tops[Math.floor(R() * tops.length)]; x = b.min[0] + 0.5 + R() * (b.max[0] - b.min[0] - 1); z = b.min[2] + 0.5 + R() * (b.max[2] - b.min[2] - 1); y = b.max[1]; }
            else {   // 窄构件（钢轨、杆件、幕墙条）与柱（顶面 < 6 m²）：人站在旁边的作业面上——外包盒外扩 2 m 内，构件顶以下 3 m 内或构件根部所在的在场顶面
              x = mn[0] - 2 + R() * (mx[0] - mn[0] + 4); z = mn[2] - 2 + R() * (mx[2] - mn[2] + 4); y = surfaceAt(I, t, x, z, p.top + 0.05); if (y == null || (p.top - y > 3 && Math.abs(y - mn[1]) > 0.05)) continue; }
          const box = [x - FW, y + 0.02, z - FW, x + FW, y + FH, z + FW]; if (!freeOf(box[0], box[2], box[3], box[5], box[1], box[4])) continue;
          if (!clear(I, t, box[0], box[1], box[2], box[3], box[4], box[5])) continue;   // 站在本构件（在建 = 在场）顶面盒内 ≥ 0.5 m，支承天然成立；check_actors 另行暴力核对
          if (!(tops.length && tryN < 4) && !supportAt(I, t, x, y, z)) continue;
          placed.push(box); out.figs.push({ x, y, z, yaw, pose: k === 0 && nP > 2 ? 'signal' : T.mix[Math.floor(R() * T.mix.length)], act: a.key }); nA++; break; } } }
      // 车辆：每 3 个在建构件 1 台，最多 4 台；停在构件外沿 4–14 m、同一支承面上，车头朝构件
      if (day && (a.kind !== 'temp' || tr === 'jig')) { const nV = Math.min(4, Math.ceil(live.length / 3)), V = VEH[T.veh];
        for (let k = 0; k < nV; k++) { const p = live[Math.floor(R() * live.length)], mn = p.geo.min, mx = p.geo.max;
          for (let tryN = 0; tryN < 6; tryN++) { const side = Math.floor(R() * 4), d = 4 + R() * 10 + V.hx, u = R();
            let x = side < 2 ? mn[0] + (mx[0] - mn[0]) * u : side === 2 ? mn[0] - d : mx[0] + d, z = side >= 2 ? mn[2] + (mx[2] - mn[2]) * u : side === 0 ? mn[2] - d : mx[2] + d;
            // 支承面：构件底面以下最近的在场顶面，否则地面
            let y = 0; near(I, x, z, x, z, e => { const b = e.b; if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2] || !present(e.p, t)) return; if (b.max[1] <= mn[1] + 0.1 && b.max[1] > y) y = b.max[1]; });
            const yaw = Math.atan2(p.c[2] - z, p.c[0] - x), ca = Math.cos(yaw), sa = Math.sin(yaw), ex = Math.abs(V.hx * ca) + Math.abs(V.hz * sa), ez = Math.abs(V.hx * sa) + Math.abs(V.hz * ca);
            if (!freeOf(x - ex, z - ez, x + ex, z + ez, y + 0.02, y + V.h)) continue;
            if (!clearRot(I, t, x, y, z, V.hx, V.hz, V.h, ca, sa) || !supported(I, t, x, y, z, V.hx * 0.9, V.hz * 0.9, ca, sa)) continue;
            placed.push([x - ex, y + 0.02, z - ez, x + ex, y + V.h, z + ez]); out.vehs.push({ x, y, z, yaw, kind: T.veh, act: a.key }); break; } } }
      if (nA) out.acts.push({ key: a.key, trade: tr, figs: nA, live: live.length }); }
    // 履带吊：R10 派给履带的构件，在吊装时段（±0.5 天）停在 hzseq 搜出的站位，臂架指向构件、吊钩落到构件顶 +1.5 m
    for (const { a, p } of I.crawl) { if (!(t >= p.st - 0.5 && t < p.st + p.du + 0.5)) continue; if (out.cranes.length >= 14) break;
      const [x, z] = p.crawl, y = p.crawlY || 0, yaw = Math.atan2(p.c[2] - z, p.c[0] - x), ca = Math.cos(yaw), sa = Math.sin(yaw), V = VEH.crawler;
      if (!clearRot(I, t, x, y, z, V.hx, V.hz, V.h, ca, sa)) continue;
      const hd = Math.hypot(p.c[0] - x, p.c[2] - z) * 0.92, tipY = Math.max(p.top + 10, y + 22);
      out.cranes.push({ x, y, z, yaw, hd, tipY, hook: p.top + 1.5, act: a.key }); }
    return out; }

  // ---------- 线段写入 ----------
  function emit(buf, n, L, x, y, z, yaw) { const c = Math.cos(yaw), s = Math.sin(yaw), m = L.length / 3;   // 局部 x 前 → 世界 (c, s)，局部 z → (-s, c)
    if ((n + m / 2) > MAXSEG) return n; let o = n * 6;
    for (let i = 0; i < L.length; i += 3) { const u = L[i], v = L[i + 1], w = L[i + 2]; buf[o++] = x + u * c - w * s; buf[o++] = y + v; buf[o++] = z + u * s + w * c; }
    return n + m / 2; }
  const camPos = cam => cam ? (cam.position ? [cam.position.x, cam.position.y, cam.position.z] : cam) : null;

  const MOD = { id: 'actors', R_SHOW, FIG, VEH, TRADE, stOf, plan, _clear: clear, _supported: supported, _index: index,
    stats: { figs: 0, vehs: 0, cranes: 0, shown: 0, segs: 0 },
    build(scene, HZ, THREE, opts) { opts = opts || {}; this.clip = Array.isArray(opts.clip) && opts.clip.length ? opts.clip : null; this.HZ = HZ; this.I = index(HZ); this.buf = new Float32Array(MAXSEG * 6); this.n = 0; this.key = null; this.P = null; this.lastCam = null;
      THREE = THREE || ROOT.THREE;
      if (THREE && scene) { const g = new THREE.BufferGeometry(); this.attr = new THREE.BufferAttribute(this.buf, 3); this.attr.setUsage && this.attr.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', this.attr); g.setDrawRange(0, 0);
        this.obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial(Object.assign({ color: 0x1c1a17, transparent: true, opacity: 0.92 }, this.clip ? { clippingPlanes: this.clip } : {}))); this.obj.frustumCulled = false; this.obj.renderOrder = 5; this.obj.name = 'hz-actors'; scene.add(this.obj); }
      return this; },
    update(t, cam) { if (!this.I) return 0; const key = Math.floor(t * 24); let dirty = false; this.calls = (this.calls || 0) + 1;
      // 播放时每帧都可能跨小时：重排最多每 6 帧一次（时间跳变 > 0.5 天时立即重排），把 2–3 ms 的布置摊到多帧
      const lag = this.P && key !== this.key && this.calls - this.planCall < 6 && Math.abs(t - this.P.t) < 0.5;
      if (key !== this.key && !lag) { this.planCall = this.calls; this.key = key; this.P = plan(this.HZ, this.I, t); dirty = true; Object.assign(this.stats, { figs: this.P.figs.length, vehs: this.P.vehs.length, cranes: this.P.cranes.length }); }
      const c = camPos(cam); if (!c) return this.n;
      if (!dirty && this.lastCam && Math.hypot(c[0] - this.lastCam[0], c[1] - this.lastCam[1], c[2] - this.lastCam[2]) < 1) return this.n;
      this.lastCam = c.slice(); const R2 = R_SHOW * R_SHOW, buf = this.buf; let n = 0, shown = 0;
      const d2 = (x, y, z) => (x - c[0]) * (x - c[0]) + (y - c[1]) * (y - c[1]) + (z - c[2]) * (z - c[2]);
      for (const f of this.P.figs) { if (d2(f.x, f.y + 1, f.z) > R2) continue; n = emit(buf, n, FIG[f.pose], f.x, f.y, f.z, f.yaw); shown++; }
      for (const v of this.P.vehs) { if (d2(v.x, v.y + 1.5, v.z) > R2) continue; n = emit(buf, n, VEH[v.kind].L, v.x, v.y, v.z, v.yaw); shown++; }
      for (const k of this.P.cranes) { if (d2(k.x, k.y + 2, k.z) > R2) continue; n = emit(buf, n, VEH.crawler.L, k.x, k.y, k.z, k.yaw); shown++;
        const ca = Math.cos(k.yaw), sa = Math.sin(k.yaw), foot = [k.x + ca * 1.8, k.y + 3.0, k.z + sa * 1.8], tip = [k.x + ca * k.hd, k.tipY, k.z + sa * k.hd];
        if (n + 6 <= MAXSEG) { let o = n * 6; const put = (a, b) => { buf.set(a, o); buf.set(b, o + 3); o += 6; n++; };
          for (const s of [-0.6, 0.6]) put([foot[0] - sa * s, foot[1], foot[2] + ca * s], [tip[0], tip[1], tip[2]]);   // 双肢臂架
          put([k.x - ca * 2.4, k.y + 3.4, k.z - sa * 2.4], [k.x + ca * k.hd * 0.45, k.tipY * 0.55 + k.y * 0.45 + 2, k.z + sa * k.hd * 0.45]);   // 变幅拉索
          put([k.x + ca * k.hd * 0.45, k.tipY * 0.55 + k.y * 0.45 + 2, k.z + sa * k.hd * 0.45], tip);
          put(tip, [tip[0], k.hook, tip[2]]); put([tip[0] - 0.5, k.hook, tip[2]], [tip[0] + 0.5, k.hook, tip[2]]); } }
      this.n = n; this.stats.shown = shown; this.stats.segs = n;
      if (this.obj) { this.obj.geometry.setDrawRange(0, n * 2); this.attr.needsUpdate = true; if (this.attr.addUpdateRange) { this.attr.clearUpdateRanges && this.attr.clearUpdateRanges(); this.attr.addUpdateRange(0, n * 6); } }
      return n; },
  };
  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(MOD);
})();
