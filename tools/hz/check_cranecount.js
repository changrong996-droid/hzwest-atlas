'use strict';
// 履带吊台数检查 · hark-darrio（报告模式，不判失败）
// 排程只给每一吊的站位（p.crawl = [x, z]）和时间（p.st、p.du），不给机号。这里按两种口径数「台」：
//   在吊：同一天有吊装、站位相距 ≤ SAME m 的记作同一台（与 S-002 图同一口径）；
//   在场：一台履带吊吊完后，GAP 天内在 SAME m 内又有吊装，视为没撤场（650 t 级拆装转场要好几天），中间几天也算在场。
// 输出：两种口径的每天台数峰值、超过上限 CAP 的天数和区段、峰值日的站位分布。
// 参数：--cap=N 全场同日上限（默认 14）、--per=N 同一工序同日上限（默认 5）、--gap=N（默认 7）、--same=N（默认 30）、--json、--strict（在吊口径超 CAP 即退出码 1）
// 上限 14 / 5 由 hark-darrio 拟定（用户 2026-11-08 授权），理由见 docs/rules/crane-count.md；公开报道未见履带吊台数。
const { load } = require('./harness');
const { HZ } = load();
HZ.make();

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? Number(a.split('=')[1]) : d; };
const CAP = arg('cap', 14), PER = arg('per', 5), GAP = arg('gap', 7), SAME = arg('same', 30), asJson = process.argv.includes('--json'), strict = process.argv.includes('--strict');

const seen = new Set(), lifts = [];
for (const a of HZ.acts) for (const p of a.parts) {
  if (p.crane !== -1 || !p.crawl || seen.has(p)) continue; seen.add(p);   // 拆除工序与安装共用构件，按一次计
  lifts.push({ key: a.key.replace(/~rm$/, ''), x: p.crawl[0], z: p.crawl[1], st: p.st, en: p.st + p.du });
}
if (!lifts.length) { console.log('FAIL check_cranecount: 没有派给履带吊的吊次（p.crane === -1）'); process.exit(1); }
const d0 = Math.floor(Math.min(...lifts.map(l => l.st))), d1 = Math.ceil(Math.max(...lifts.map(l => l.en))) - 1;

// 口径一 · 在吊：逐日聚类
const busy = [];
for (let d = d0; d <= d1; d++) {
  const live = lifts.filter(l => l.st < d + 1 && l.en > d).sort((a, b) => a.st - b.st), cl = [];
  for (const l of live) { const k = cl.find(c => Math.hypot(c.x - l.x, c.z - l.z) <= SAME); if (k) k.n++; else cl.push({ x: l.x, z: l.z, n: 1, keys: new Set() }); (k || cl[cl.length - 1]).keys.add(l.key); }
  busy.push({ d, cl });
}

// 口径二 · 在场：按时间顺序把每天的聚类接到 GAP 天内、SAME m 内最近的一台上，接不上就进场一台新的
const fleet = [];   // { x, z, first, last }
for (const { d, cl } of busy) for (const c of cl) {
  let best = null, bd = Infinity;
  for (const f of fleet) { if (f.last >= d || d - f.last > GAP) continue; const r = Math.hypot(f.x - c.x, f.z - c.z); if (r <= SAME && r < bd) { bd = r; best = f; } }
  if (best) { best.last = d; best.x = c.x; best.z = c.z; best.used.add(d); } else fleet.push({ x: c.x, z: c.z, first: d, last: d, used: new Set([d]) });
}
const onsite = []; for (let d = d0; d <= d1; d++) onsite.push({ d, n: fleet.filter(f => f.first <= d && f.last >= d).length });

// 按「同一工序同日 ≤ PER 台」限流后的在吊台数（简化：多出的站位由同工序已在场的吊机当天转站完成，工期不变）
const perDay = busy.map(({ d }) => { const by = {}; for (const l of lifts) { if (!(l.st < d + 1 && l.en > d)) continue; const c = by[l.key] || (by[l.key] = []); if (!c.some(q => Math.hypot(q.x - l.x, q.z - l.z) <= SAME)) c.push(l); } let n = 0; for (const k in by) n += Math.min(PER, by[k].length); return n; });
const nb = busy.map(b => b.cl.length), peakB = Math.max(...nb), peakS = Math.max(...onsite.map(o => o.n));
const runs = arr => { const r = []; let s = null; arr.forEach((o, i) => { if (o.over && s == null) s = i; if ((!o.over || i === arr.length - 1) && s != null) { const e = o.over ? i : i - 1; r.push([arr[s].d, arr[e].d, Math.max(...arr.slice(s, e + 1).map(x => x.n))]); s = null; } }); return r; };
const overB = busy.map(b => ({ d: b.d, n: b.cl.length, over: b.cl.length > CAP })), overS = onsite.map(o => ({ ...o, over: o.n > CAP }));
const rB = runs(overB), rS = runs(overS);
const dayPeak = busy[nb.indexOf(peakB)];

if (asJson) { console.log(JSON.stringify({ CAP, GAP, SAME, d0, d1, busy: nb, onsite: onsite.map(o => o.n), fleet: fleet.length })); process.exit(0); }

console.log(`履带吊吊次 ${lifts.length} · 第 ${d0}–${d1} 天 · 口径：同站位 ≤ ${SAME} m 记一台；在场口径空档 ≤ ${GAP} 天不撤场`);
console.log(`在吊：峰值 ${peakB} 台（第 ${dayPeak.d} 天）· 有吊装的天数 ${nb.filter(n => n).length} · 超 ${CAP} 台的天数 ${overB.filter(o => o.over).length}`);
console.log(`在场：峰值 ${peakS} 台 · 全程进场 ${fleet.length} 台次 · 超 ${CAP} 台的天数 ${overS.filter(o => o.over).length}`);
const fmt = r => r.map(([a, b, m]) => (a === b ? `${a}` : `${a}–${b}`) + `（${m}）`).join('、') || '无';
console.log(`在吊超 ${CAP} 台的区段：${fmt(rB)}`);
console.log(`在场超 ${CAP} 台的区段：${fmt(rS)}`);
const byKey = {}; for (const c of dayPeak.cl) for (const k of c.keys) byKey[k] = (byKey[k] || 0) + 1;
console.log(`第 ${dayPeak.d} 天在吊 ${peakB} 台，按工序：` + Object.entries(byKey).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('、'));
console.log(`同工序同日限 ${PER} 台后：在吊峰值 ${Math.max(...perDay)} 台 · 超 ${CAP} 台的天数 ${perDay.filter(n => n > CAP).length}`);
const nOver = overB.filter(o => o.over).length;
if (strict && nOver) { console.log(`FAIL check_cranecount 在吊超 ${CAP} 台 ${nOver} 天`); process.exit(1); }
console.log(`OK check_cranecount 在吊峰值=${peakB} 在场峰值=${peakS} 超${CAP}天数(在吊/在场)=${nOver}/${overS.filter(o => o.over).length} 限流后峰值=${Math.max(...perDay)}${strict ? '' : '（报告模式）'}`);
