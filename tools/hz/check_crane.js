'use strict';
// 履带吊臂长规则检查（R10b）· hark-darrio
// 读 HZ.assignCranes() 派给履带吊的每次吊装（p.crane === -1，站位 p.crawl = [x, z]，构件中心 p.c），
// 吊距 R = 站位到构件中心的水平距离；单吊重量 W 按 docs/rules/crane-reach.md 表 2 取（推算）。
// 规则：W × 1.1（吊钩、索具） ≤ 机型在 R 处的额定起重量，否则换站位或换机型。
// 默认只报告不判失败；加 --strict 时，有 1000 t 级也够不着的吊次就退出码 1（规则落地到 hzseq.js 后再接入 check_all）。
const { load } = require('./harness');
const { HZ } = load();
HZ.make();

// 表 1 · 额定起重量包络（t，360° 回转，各臂长组合取最大值），出处见 docs/rules/crane-reach.md
// 650 t 级：Liebherr LR 1600/2 SDB（主臂 36–144 m + 超起 36 m，超起配重 0–350 t），Felbermayr 起重性能表
const C650 = [[20, 397], [24, 335], [30, 265], [36, 215], [40, 191], [44, 170], [48, 153], [52, 138], [56, 125], [60, 114], [64, 104], [68, 94], [72, 85], [76, 78], [80, 72], [84, 66], [88, 60], [92, 54], [96, 49.4], [100, 44.3], [104, 39.9], [108, 35.5], [112, 30.8], [116, 27], [120, 22.7], [124, 19.4], [128, 16.6], [132, 14.1], [136, 11.3], [140, 7.9]];
// 1000 t 级：Liebherr LR 11000 SL2DB（主臂 42–156 m + 超起 36–42 m，B2 悬挂配重），技术资料起重性能表
const C1000 = [[24, 580], [26, 554], [28, 527], [30, 502], [32, 472], [34, 444], [36, 417], [38, 394], [40, 373], [44, 334], [48, 301], [52, 271], [56, 248], [60, 225], [64, 207], [68, 188], [72, 174], [76, 161], [80, 149], [84, 137], [88, 127], [92, 119], [96, 111], [100, 104], [104, 97.8], [108, 89.9], [112, 80.8], [116, 75.1], [120, 69.9], [124, 65.2], [128, 60.3], [132, 56.8]];
// 参照：650 t 级常用工况 LR 1600/2 S（主臂 24–96 m，无超起），同一性能表；只做提示，不算违例
const C650S = [[10, 346], [12, 280], [14, 223], [16, 181], [18, 152], [20, 130], [24, 100], [30, 72], [36, 54], [40, 45], [44, 37], [48, 32], [52, 26.2], [56, 20.5], [60, 17.4], [64, 12.5], [68, 8], [72, 5.2]];
// 表外（小于首行）按首行算；大于末行 = 够不着。行间取较小一行（保守，不插值）。
const cap = (T, R) => { if (R <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (R <= T[i][0]) return T[i][1]; return 0; };
const rmax = (T, W) => { let r = 0; for (const [R, c] of T) if (c >= W) r = R; return r; };

// 表 2 · 单吊重量（t，推算）：构件自带 p.tons 的用 p.tons；其余按材料类别取一钩的典型重量
const PICK = { conc: 8, plat: 8, found: 8, ym: 8, ymG: 10, todG: 10, todB: 10, glass: 6, steel: 20, red: 20 };
const KIND = { conc: '现浇（吊斗/钢筋/模板）', plat: '现浇（吊斗/钢筋/模板）', found: '现浇（吊斗/钢筋/模板）', ym: '现浇（吊斗/钢筋/模板）', ymG: '幕墙/屋面单元', todG: '幕墙/屋面单元', todB: '幕墙/屋面单元', glass: '幕墙/屋面单元', steel: '钢构件', red: '临时支架分段' };
const pick = p => (p.tons ? { w: p.tons, src: 'p.tons' } : { w: PICK[p.mat] != null ? PICK[p.mat] : 10, src: 'class' });
const HOOK = 1.1;

const seen = new Set(), rows = [];
for (const a of HZ.acts) for (const p of a.parts) {
  if (p.crane !== -1 || seen.has(p)) continue; seen.add(p);   // 拆除工序（xx~rm）与安装共用同一构件与站位，按一次计
  if (!p.crawl) { rows.push({ a, p, R: NaN, W: 0 }); continue; }
  const R = Math.hypot(p.c[0] - p.crawl[0], p.c[2] - p.crawl[1]), { w } = pick(p), need = w * HOOK;
  rows.push({ a, p, R, W: w, need, c650: cap(C650, R), c1000: cap(C1000, R), cS: cap(C650S, R) });
}
const n = rows.length, noSt = rows.filter(r => isNaN(r.R)).length;
const ok650 = rows.filter(r => r.need <= r.c650).length;
const only1000 = rows.filter(r => r.need > r.c650 && r.need <= r.c1000);
const none = rows.filter(r => !isNaN(r.R) && r.need > r.c1000);
const noSuper = rows.filter(r => r.need > r.cS).length;
const Rs = rows.map(r => r.R).filter(x => !isNaN(x)).sort((x, y) => x - y), q = f => Rs[Math.min(Rs.length - 1, Math.floor(f * Rs.length))];

console.log(`履带吊吊次 ${n}（HZ.lift.crawler=${HZ.lift.crawler}；拆除与安装共用构件，按一次计）· 无站位 ${noSt}`);
console.log(`吊距 R：中位 ${q(0.5).toFixed(0)} m · 90% ${q(0.9).toFixed(0)} m · 最大 ${Rs[Rs.length - 1].toFixed(0)} m`);
console.log(`不装超起（650 t 级常用 S 工况）够得着 ${n - noSuper - noSt}，要装超起或更大机型 ${noSuper}`);
console.log(`650 t 级够得着 ${ok650} · 只有 1000 t 级够得着 ${only1000.length} · 两种都超限 ${none.length}`);
const by = {};
for (const r of rows) { if (isNaN(r.R)) continue; const k = r.a.key.replace(/~rm$/, ''), b = by[k] || (by[k] = { 类别: KIND[r.p.mat] || r.p.mat, 吊次: 0, 单吊t: r.W, 最大R: 0, 超650: 0, 超1000: 0, 'R上限650': rmax(C650, r.need), 'R上限1000': rmax(C1000, r.need) });
  b.吊次++; b.最大R = Math.max(b.最大R, Math.round(r.R)); if (r.need > r.c650) b.超650++; if (r.need > r.c1000) b.超1000++; b.单吊t = Math.max(b.单吊t, Math.round(r.W)); b['R上限650'] = Math.min(b['R上限650'], rmax(C650, r.need)); b['R上限1000'] = Math.min(b['R上限1000'], rmax(C1000, r.need)); }
const over = Object.entries(by).filter(([, b]) => b.超650 || b.超1000);
if (over.length) { console.log('超限工序（R 上限 = 该工序最重一吊在表 1 中还能吊的最远吊距）：'); console.table(Object.fromEntries(over)); }
for (const r of none.slice(0, 8)) console.log(`  超 1000 t 级：${r.a.key} @(${r.p.c[0].toFixed(0)},${r.p.c[2].toFixed(0)}) 站位(${r.p.crawl[0].toFixed(0)},${r.p.crawl[1].toFixed(0)}) R=${r.R.toFixed(0)} m W=${r.W.toFixed(0)} t 需 ${r.need.toFixed(1)} t > ${r.c1000} t`);
const strict = process.argv.includes('--strict');
if (strict && (none.length || noSt)) { console.log(`FAIL check_crane: ${none.length} 吊超出 1000 t 级包络，${noSt} 吊无站位`); process.exit(1); }
console.log(`OK check_crane 吊次=${n} 超650=${n - ok650 - noSt} 超1000=${none.length} 需超起=${noSuper}${strict ? '' : '（报告模式）'}`);
