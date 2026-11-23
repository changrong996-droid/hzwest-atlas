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

  // 1) 云门直穿 + 云谷纵冲（慢起穿洞 → 快切云厅 → 慢潜云谷 → 快冲东口 → 慢拉回望）
  FPV.add({
    name: 'route-yunmen-valley',
    title: '云门直穿 + 云谷纵冲：中轴穿洞、云谷缺口下潜高速纵冲、东端回望四朵云',
    author: 'g-liuzhijie',
    day: [1096, 1118],
    landmarks: [
      { name: '云门洞', pos: [0, 27, 208], r: 22 },
      { name: '南檐口', pos: [0, 27.5, 148], r: 16 },
      { name: '云谷中庭', pos: [60, 18, 0], r: 18 },
      { name: '东口回望', pos: [235, 58, -68], r: 30 }
    ],
    keyframes: [
      { t: 0.0,  pos: [0, 25, 315],     look: [0, 27, 150] },
      { t: 1.8,  pos: [0, 27, 248],     look: [0, 27.5, 80] },    // 慢：稳稳对准 80 m 云门中轴
      { t: 3.1,  pos: [0, 27.5, 198],   look: [0, 27.5, 20] },    // 快：直穿云门洞
      { t: 4.5,  pos: [0, 27.5, 148],   look: [15, 27.0, -20] },  // 慢：贴 5F 连廊下方进入云厅
      { t: 5.7,  pos: [4, 27.5, 62],    look: [65, 24.0, -35] },  // 快：掠过候车云厅
      { t: 6.7,  pos: [8, 27.0, 8],     look: [120, 20.0, -15] }, // 进入云谷缺口（|z|<14, |x|<95）
      { t: 7.8,  pos: [32, 18.0, 2],    look: [185, 18.0, 0] },   // 慢：云谷内下潜至站台高度
      { t: 9.0,  pos: [125, 18.0, 0],   look: [280, 19.0, -20] }, // 快：云谷峡谷全速纵冲
      { t: 10.2, pos: [195, 19.0, -4],  look: [290, 28.0, -110] },// 冲出东口，视线顺势左摇
      { t: 12.0, pos: [236, 36.0, -42], look: [120, 38.0, -120] },// 慢：东北侧圆弧抬升回转
      { t: 14.0, pos: [242, 62.0, -76], look: [0, 36, 0] }        // 展开整片四朵云屋面
    ]
  });

  // 2) 贴轨迎复兴号 + 钻云谷网架（站东引桥贴轨迎车 → 钻云谷 → 云谷内抬升仰拍十字天窗 → 西口拉升）
  FPV.add({
    name: 'route-train-chase',
    title: '贴轨迎复兴号 + 钻云谷：站东低空掠过南场股道迎车，切入云谷仰拍十字天窗',
    author: 'g-liuzhijie',
    day: [1102, 1122],
    landmarks: [
      { name: '南场股道', pos: [155, 17.5, 54.5], r: 24 },
      { name: '云谷东段', pos: [65, 18.0, 4], r: 20 },
      { name: '十字天窗下', pos: [-10, 31.0, 0], r: 18 },
      { name: '西侧回望', pos: [-235, 58, 60], r: 30 }
    ],
    keyframes: [
      { t: 0.0,  pos: [295, 18.5, 54.5],  look: [120, 16, 54.5] },
      { t: 1.7,  pos: [238, 17.8, 54.5],  look: [60, 16, 42] },     // 慢：锁定南场股道
      { t: 2.9,  pos: [155, 17.5, 54.5],  look: [-10, 17, 12] },    // 快：贴轨高速迎车
      { t: 4.5,  pos: [108, 18.0, 8.0],   look: [-60, 20, 0] },     // 慢：折入云谷东口
      { t: 5.8,  pos: [52, 18.5, 2.0],    look: [-110, 30, 0] },    // 快：云谷低空前冲
      { t: 7.3,  pos: [0, 29.0, 0.0],     look: [-160, 42, 0] },    // 慢：云谷中轴抬升仰拍天窗
      { t: 8.6,  pos: [-52, 30.5, 0.0],   look: [-220, 34, 8] },    // 快：贴天窗下方出站
      { t: 10.0, pos: [-148, 28.5, 4.0],  look: [-270, 32, 95] },   // 冲出西檐口，视线顺势左摇
      { t: 11.8, pos: [-218, 40.0, 36.0], look: [-110, 38, 115] },  // 慢：西南侧缓拉回转
      { t: 14.0, pos: [-240, 62.0, 68.0], look: [0, 36, 0] }        // 回望全站与黄昏列车
    ]
  });

  // 3) 梭形柱阵穿梭 + 十字天窗仰拍（穿云门西侧洞口 → S 形绕穿梭形柱阵 → 穿云谷至北场 → 北广场拉升）
  FPV.add({
    name: 'route-spindle-cathedral',
    title: '梭形柱阵穿梭 + 十字天窗仰拍：穿云门西侧切入梭形柱阵，横跨云谷北出',
    author: 'g-liuzhijie',
    day: [1096, 1118],
    landmarks: [
      { name: '云门西侧洞口', pos: [-24, 27.5, 208], r: 22 },
      { name: '南候车厅柱阵', pos: [-54, 27.5, 82], r: 22 },
      { name: '北候车厅柱阵', pos: [20, 27.5, -78], r: 22 },
      { name: '北侧全景', pos: [95, 58, -235], r: 30 }
    ],
    keyframes: [
      { t: 0.0,  pos: [-22, 27.5, 305], look: [-30, 27.5, 140] },
      { t: 1.8,  pos: [-24, 27.5, 244], look: [-48, 27.5, 80] },    // 慢：对准云门西侧洞内（|x|<37.5）
      { t: 3.1,  pos: [-26, 27.5, 178], look: [-70, 28.0, 25] },    // 快：紧贴门洞西壁穿出斜切
      { t: 4.7,  pos: [-56, 27.5, 105], look: [-38, 32.0, -45] },   // 慢：贴 5F 连廊下方进入南厅柱阵
      { t: 6.0,  pos: [-36, 27.8, 32],  look: [10, 38.0, -110] },   // 快：穿行梭形柱间、仰望十字采光顶
      { t: 7.6,  pos: [12, 27.6, -48],  look: [35, 30.0, -195] },   // 慢：横跨云谷进北厅柱阵
      { t: 8.9,  pos: [24, 27.5, -118], look: [65, 28.0, -265] },   // 快：贴北檐口冲出
      { t: 10.3, pos: [48, 29.0, -178], look: [135, 32.0, -245] },  // 冲出北立面，视线顺势右摇
      { t: 12.1, pos: [78, 44.0, -218], look: [90, 38.0, -115] },   // 慢：北广场圆弧拉升回转
      { t: 14.0, pos: [105, 64.0, -245], look: [0, 36, 0] }         // 俯瞰北立面与四朵云
    ]
  });

  // 4) 四朵云屋面贴顶俯冲 + 云谷穿堂（高空贴顶掠过四朵云与光伏 → 东侧大圆弧俯冲折返 → 云谷穿堂抬升 → 穿云门收尾）
  FPV.add({
    name: 'route-cloud-dive',
    title: '四朵云屋面贴顶俯冲 + 云谷穿堂：高空掠过光伏屋面，东端大圆弧俯冲穿云谷与云门',
    author: 'g-liuzhijie',
    day: [1096, 1118],
    landmarks: [
      { name: '西北云瓣屋面', pos: [-75, 65, -75], r: 25 },
      { name: '十字天窗顶', pos: [20, 68, -10], r: 22 },
      { name: '云谷穿堂', pos: [55, 19, 0], r: 22 },
      { name: '云门南出', pos: [0, 27.5, 208], r: 24 }
    ],
    keyframes: [
      { t: 0.0,  pos: [-165, 76, -155], look: [10, 56, -30] },
      { t: 1.6,  pos: [-95, 67, -95],   look: [95, 58, -20] },      // 慢：贴近西北云瓣与光伏阵列
      { t: 2.8,  pos: [12, 68, -28],    look: [185, 52, -25] },     // 快：掠过十字采光顶最高处
      { t: 4.1,  pos: [148, 56, -32],   look: [265, 36, 18] },      // 慢：飞越东檐开始大圆弧俯冲
      { t: 5.3,  pos: [232, 36, -6],    look: [220, 22, 95] },      // 快：东侧外空顺时针滑降
      { t: 6.5,  pos: [222, 20, 38],    look: [95, 19, 45] },       // 东侧圆弧切回西向
      { t: 7.7,  pos: [132, 18.5, 12],  look: [-20, 19, 10] },      // 慢：低空稳入云谷东口
      { t: 8.8,  pos: [45, 19.0, 2],    look: [-30, 26, 75] },      // 快：云谷中轴低空穿堂
      { t: 9.9,  pos: [4, 27.8, 8],     look: [-8, 27.8, 165] },    // 慢：云谷缺口内抬升至 27.8 m
      { t: 11.1, pos: [0, 27.8, 92],    look: [0, 27.5, 250] },     // 快：贴候车层平飞向南檐
      { t: 12.4, pos: [0, 27.5, 174],   look: [0, 27.0, 330] },     // 冲出南檐直穿云门洞
      { t: 14.0, pos: [0, 25.0, 285],   look: [0, 28.0, 420] }      // 穿出云门，冲向云城南广场
    ]
  });
})();
