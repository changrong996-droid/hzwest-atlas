'use strict';
// F2 穿越机 FPV 航线底座（任务 #38，hark-liuzhijie）——航线格式、取样器、候选航线登记表。
// 底座合入后冻结、视同考卷：#26 候选航线只许在文末「候选航线」区追加 HZ_FPV.add({...})，不改格式、取样器与 film.js 的接法。
//
// 一、航线格式（命名对象）
//   {
//     name: 'route-xxx',              // 必填，小写字母数字连字符；URL #fpv=<name> 用它切换
//     title: '一句话说明',              // 选填，自检报告与切换提示里显示
//     author: 'agent 名',              // 选填
//     day: [1096, 1118],              // 选填，飞行期间 3D 工期日从 day[0] 线性走到 day[1]（默认 1096→1118，开通前黄昏实景）
//     landmarks: [{ name: '云门洞', pos: [0, 34, 208], r: 25 }],   // 选填，声明经过的地标；自检要求航线某一时刻距 pos ≤ r 米
//     keyframes: [{ t: 0, pos: [x, y, z], look: [x, y, z] }, ...] // 必填，≥ 4 个；t 为秒，从 0 起严格递增，末帧 t ≤ 14
//   }
//   坐标系同宿主 hzview / hzseq：x 东西、y 高（米，地面 0）、z 南北（南为 +）；站房中心为原点。
//   变速只由关键帧 t 的间距表达：同样的路程给的时间少就快、给的时间多就慢。
//
// 二、取样：位置与目标点各自按「非均匀 Catmull-Rom（三次 Hermite，切线 = 前后两帧差 ÷ 时间差）」插值，速度连续不跳档。
//   HZ_FPV.sample(route, t) → { pos:[x,y,z], look:[x,y,z] }；t 超出 [0, 末帧 t] 时停在端点。
//
// 三、片中接法（film.js）：FPV 段为片时 50.2–64.2 秒（14 秒），片时 s 对应航线时 t = s − 50.2；
//   URL #fpv=<name> 选航线（缺省 route-classic），并直接跳到 49.8 秒待飞；名字不存在时退回缺省并在控制台警告。
//
// 四、开发自检：web/film/fpv-selfcheck.js（URL 加 #fpvcheck=1 或 #fpvcheck=<name> 在页内运行，用宿主自己的碰撞盒 __pv.solidAt
//   + 屋盖上下表面 HZ.Hs / HZ.Hc 判穿模，结果写到 window.__fpvReport 和页面角标）。独立验收器 tools/hz/check_fpv.js 归 #39，不在本底座里。
(function () {
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const T_MAX = 14;                 // FPV 段长 14 秒（片时 50.2–64.2）
  const NAME = /^[a-z0-9][a-z0-9-]{1,47}$/;

  function check(r) {
    const e = [];
    if (!r || typeof r !== 'object') return ['不是对象'];
    if (!NAME.test(r.name || '')) e.push('name 须为小写字母数字连字符（2–48 字）');
    const K = r.keyframes;
    if (!Array.isArray(K) || K.length < 4) { e.push('keyframes 至少 4 个'); return e; }
    if (K[0].t !== 0) e.push('首帧 t 须为 0');
    for (let i = 0; i < K.length; i++) {
      const k = K[i];
      if (!(typeof k.t === 'number' && isFinite(k.t))) e.push('第 ' + i + ' 帧 t 不是数');
      for (const f of ['pos', 'look']) if (!Array.isArray(k[f]) || k[f].length !== 3 || !k[f].every(v => typeof v === 'number' && isFinite(v))) e.push('第 ' + i + ' 帧 ' + f + ' 须为 [x,y,z]');
      if (i && !(k.t > K[i - 1].t)) e.push('第 ' + i + ' 帧 t 未严格递增');
      if (k.pos && k.look && Math.hypot(k.pos[0] - k.look[0], k.pos[1] - k.look[1], k.pos[2] - k.look[2]) < 1) e.push('第 ' + i + ' 帧 look 与 pos 太近（< 1 m）');
    }
    if (K[K.length - 1].t > T_MAX) e.push('末帧 t 超过 ' + T_MAX + ' 秒');
    if (r.day && !(Array.isArray(r.day) && r.day.length === 2 && r.day.every(v => typeof v === 'number'))) e.push('day 须为 [起, 止]');
    if (r.landmarks && !(Array.isArray(r.landmarks) && r.landmarks.every(l => l && l.name && Array.isArray(l.pos) && l.pos.length === 3 && l.r > 0))) e.push('landmarks 每项须有 name / pos / r');
    return e;
  }

  // 非均匀 Catmull-Rom：第 i 帧切线 = (p[i+1] − p[i−1]) / (t[i+1] − t[i−1])，端点用单侧差
  function tangents(K, f) {
    const n = K.length, m = [];
    for (let i = 0; i < n; i++) {
      const a = K[Math.max(0, i - 1)], b = K[Math.min(n - 1, i + 1)], dt = b.t - a.t;
      m.push([0, 1, 2].map(k => (b[f][k] - a[f][k]) / dt));
    }
    return m;
  }
  const cache = new WeakMap();
  function sample(r, t) {
    const K = r.keyframes, n = K.length;
    let c = cache.get(r); if (!c || c.K !== K) { c = { K, mp: tangents(K, 'pos'), ml: tangents(K, 'look') }; cache.set(r, c); }
    if (t <= K[0].t) return { pos: K[0].pos.slice(), look: K[0].look.slice() };
    if (t >= K[n - 1].t) return { pos: K[n - 1].pos.slice(), look: K[n - 1].look.slice() };
    let i = 0; while (i < n - 2 && t > K[i + 1].t) i++;
    const a = K[i], b = K[i + 1], h = b.t - a.t, u = (t - a.t) / h, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const H = (f, m) => [0, 1, 2].map(k => h00 * a[f][k] + h10 * h * m[i][k] + h01 * b[f][k] + h11 * h * m[i + 1][k]);
    return { pos: H('pos', c.mp), look: H('look', c.ml) };
  }

  const routes = [];
  const FPV = ROOT.HZ_FPV = {
    version: 1, T_MAX, FILM_T0: 50.2, DEFAULT: 'route-classic', DAY: [1096, 1118],
    routes, check, sample,
    add(r) {
      const e = check(r);
      if (routes.some(q => q.name === r.name)) e.push('name 重名：' + r.name);
      if (e.length) { (ROOT.console || { warn() {} }).warn('[HZ_FPV] 航线 ' + (r && r.name) + ' 不合格式，未登记：' + e.join('；')); return false; }
      routes.push(r); return true;
    },
    get(name) { return routes.find(r => r.name === name) || null; },
    dur(r) { return r.keyframes[r.keyframes.length - 1].t; },
    day(r, t) { const d = r.day || FPV.DAY, T = FPV.dur(r); return d[0] + (d[1] - d[0]) * Math.max(0, Math.min(1, t / T)); }
  };

  // ---------- 示例航线（由 film.js 原写死航线迁入，路线不变）----------
  // 原写法：11 个航点按序号均匀分布、再用 fpvEase 变速；这里把每个航点换算成到达秒数（fpvEase 反函数 × 11.2 s），变速改由 t 间距表达。
  FPV.add({
    name: 'route-classic',
    title: '示例：低飞穿云门 → 贴候车层掠过树状柱 → 下潜云谷 → 冲出回望',
    author: 'hark-liuzhijie（据 film 小样原航线重做：原线离结构太远、看不出尺度和速度）',
    landmarks: [
      { name: '云门洞', pos: [0, 10, 208], r: 30 },
      { name: '5F 连廊下', pos: [10, 27, 143], r: 8 },
      { name: '树状柱 (39, 112.5)', pos: [39, 26, 112.5], r: 15 },
      { name: '云谷', pos: [120, 18, 0], r: 12 }
    ],
    keyframes: [
      { t: 0.0, pos: [18, 4.5, 330], look: [24, 0, 285] },     // 南广场 6 m 低空贴地
      { t: 1.2, pos: [27, 4.5, 262], look: [32, 2, 225] },     // 贴近云门西侧门柱（洞边 x=38）
      { t: 2.3, pos: [28, 6, 208], look: [24, 12, 160] },    // 慢：擦着门洞侧壁穿过（侧壁 10 m 内）
      { t: 3.2, pos: [16, 19, 172], look: [14, 24, 130] },   // 出门洞抬升，对准站房南檐口
      { t: 3.8, pos: [10, 26.6, 156], look: [14, 24, 110] }, // 贴楼面钻进檐口（檐下沿 28.7 m，楼面 24 m）
      { t: 4.3, pos: [12, 26.6, 140], look: [22, 24.5, 95] },// 从 5F 连廊（30.5–31.5 m）下方钻过
      { t: 5.1, pos: [31, 26.4, 96], look: [36, 24.5, 45] }, // 快：贴候车层 2.4 m 高、离树状柱 8 m 掠过
      { t: 5.8, pos: [36, 26.1, 40], look: [52, 22, 8] },
      { t: 6.6, pos: [50, 24.2, 8], look: [84, 16, 10] },     // 慢：从楼板缺口（云谷 |z|<14）下潜
      { t: 7.5, pos: [76, 16.4, 8], look: [100, 13, 14] },   // 贴北侧站台沿（|z|=14）6 m
      { t: 8.6, pos: [160, 16.4, 8], look: [190, 13, 14] },  // 快：云谷峡谷贴站台高度冲刺
      { t: 9.5, pos: [212, 17.5, 4], look: [235, 19, -25] },   // 东端左转，机头扫向站房北侧
      { t: 10.5, pos: [238, 24, -30], look: [190, 28, -60] },// 慢：回身贴站房东北角拉升
      { t: 12.0, pos: [240, 44, -72], look: [120, 42, -40] },
      { t: 14.0, pos: [250, 66, -80], look: [0, 36, 0] }     // 拉远：整片四朵云屋面
    ]
  });

  // ---------- 候选航线（#26 在此区追加，每条一个 HZ_FPV.add({...})）----------
})();
