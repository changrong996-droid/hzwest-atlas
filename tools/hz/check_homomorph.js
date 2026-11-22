'use strict';
// 二维/三维同态一致性检查（tools/hz/check_homomorph.js）· g-wangmushan
// 默认报告模式（打印全部偏差并退出 0，不阻断现有 CI）；加 --strict 参数时发现偏差退出 1。
// 检查四类同态：
// 1. big(t) 大数字 vs draw() 图纸文字 vs HZ 真排程（S-001 工序数 / S-401 封闭率 / S-501 距开通天数等）
// 2. leadAt(t) 3D 引线构件进度 vs draw() 二维图纸同一构件进度（专抓「第二真相源」，如 S-201 G-N09 48% vs 70%）
// 3. big(t) 数值健壮性（无 NaN/undefined）与百分比单调性
// 4. parts(t) 活跃/几何合法性与无重复 id
const fs = require('fs');
const path = require('path');
const { load, makeCtx, sheetCtx } = require('./harness');

const STRICT = process.argv.includes('--strict');
const sheetFiles = fs.readdirSync(path.join(__dirname, '../../web/sheets'))
  .filter(f => f.endsWith('.js')).sort().map(f => 'web/sheets/' + f);

const { G, HZ } = load({ extra: ['web/hzreal.js', ...sheetFiles] });
HZ.make();

const plugins = (G.HZ_SHEET_PLUGINS || []).slice();
const diffs = [];
const warns = [];
let checks = 0;

function addDiff(sheet, t, kind, detail) {
  diffs.push({ sheet, t: Math.round(t * 10) / 10, kind, detail });
}

function drawTexts(pl, t) {
  const { g, texts } = makeCtx();
  const ctx = sheetCtx(pl.id);
  pl.draw(g, 560, 720, t, ctx);
  return texts.map(s => String(s == null ? '' : s));
}

const FRACS_7 = [0, 0.15, 0.35, 0.5, 0.7, 0.85, 1.0];

for (const pl of plugins) {
  const [t0, t1] = pl.window;
  let prevPct = -Infinity;

  // A. 7 分位点：big(t) vs draw() vs HZ 排程
  for (const f of FRACS_7) {
    const t = t0 + (t1 - t0) * f;
    const b = pl.big ? pl.big(t) : null;
    const texts = drawTexts(pl, t);
    const joined = texts.join(' | ');
    checks++;

    if (b) {
      const ns = String(b.num);
      if (ns === 'NaN' || ns === 'undefined' || ns === 'null') {
        addDiff(pl.id, t, 'big_nan', `big(t).num 异常：${ns}`);
      }
      if (b.unit === '%' && Number.isFinite(Number(b.num))) {
        const v = Number(b.num);
        if (v < 0 || v > 100) addDiff(pl.id, t, 'pct_range', `big(t) 百分比越界：${v}%`);
        if (v < prevPct - 1e-6) addDiff(pl.id, t, 'pct_regress', `big(t) 百分比倒退：${prevPct}% → ${v}%`);
        prevPct = v;
      }
    }

    // 针对各图的强同态比对
    if (pl.id === 'S-001' && b) {
      // HZ 当天在施工序数（与 S-001 图纸标题比对）
      const m = /今天在做\s*(\d+)\s*道/.exec(joined);
      if (m && Number(m[1]) !== Number(b.num)) {
        addDiff('S-001', t, 'big_vs_draw', `big=${b.num}道 vs 图纸「今天在做 ${m[1]} 道」`);
      }
    }
    if (pl.id === 'S-101' && b) {
      const numStr = String(b.num);
      if (!texts.some(s => s.includes(numStr))) {
        addDiff('S-101', t, 'big_vs_draw', `big=${numStr} 未出现在图纸大数字中`);
      }
    }
    if (pl.id === 'S-251' && b) {
      const numStr = String(b.num);
      if (!texts.some(s => s.replace(/\s+/g, '').includes(numStr.replace(/\s+/g, '')))) {
        addDiff('S-251', t, 'big_vs_draw', `big=${numStr} 未出现在图纸文字中`);
      }
    }
    if (pl.id === 'S-401' && b) {
      const m = /屋面封闭\s*(\d+)%/.exec(joined);
      if (m && Math.abs(Number(m[1]) - Number(b.num)) > 1) {
        addDiff('S-401', t, 'big_vs_draw', `big=${b.num}% vs 图纸「屋面封闭 ${m[1]}%」`);
      }
    }
    if (pl.id === 'S-501' && b && t < HZ.P.OPEN - 1) {
      const expectDays = Math.max(0, Math.ceil(HZ.P.OPEN - t));
      if (Number.isFinite(Number(b.num)) && Math.abs(Number(b.num) - expectDays) > 1) {
        addDiff('S-501', t, 'big_vs_hz', `big=${b.num}天 vs HZ.P.OPEN-t=${expectDays}天`);
      }
    }

    // parts(t) 合法性与唯一性
    if (pl.parts) {
      const ps = pl.parts(t) || [];
      const seen = new Set();
      for (const p of ps) {
        if (!p || p.id == null) { addDiff(pl.id, t, 'part_id', '存在无 id 构件'); break; }
        const id = String(p.id);
        if (seen.has(id)) { addDiff(pl.id, t, 'part_dup', `parts(t) 重复 id：${id}`); break; }
        seen.add(id);
      }
    }
  }

  // B. 15 时刻密集扫描：leadAt(t) 3D 引线 vs draw() 图纸同构件进度（专抓第二真相源）
  if (typeof pl.leadAt === 'function') {
    const STEPS = 15;
    for (let i = 1; i < STEPS; i++) {
      const t = t0 + (t1 - t0) * (i / STEPS);
      const ld = pl.leadAt(t);
      checks++;
      if (!ld || !ld.t1 || !ld.t2) continue;
      const idMatch = /([A-Z]-[A-Z0-9]+)/.exec(String(ld.t1));
      const pctMatch = /(\d+(?:\.\d+)?)%/.exec(String(ld.t2));
      if (!idMatch || !pctMatch) continue;
      const partCode = idMatch[1];
      const leadPct = Number(pctMatch[1]);
      const texts = drawTexts(pl, t);
      // 在 draw() 输出中找该构件 id 紧邻的百分比（同一字符串或下一条相邻文本）
      let drawPct = null;
      for (let j = 0; j < texts.length; j++) {
        if (!texts[j].includes(partCode)) continue;
        const mSame = /(\d+(?:\.\d+)?)%/.exec(texts[j]);
        const mNext = j + 1 < texts.length ? /(\d+(?:\.\d+)?)%/.exec(texts[j + 1]) : null;
        const mHit = mSame || mNext;
        if (mHit) { drawPct = Number(mHit[1]); break; }
      }
      if (drawPct != null && Math.abs(leadPct - drawPct) > 1) {
        addDiff(pl.id, t, 'lead_vs_draw', `${partCode} 3D引线=${leadPct}% vs 图纸=${drawPct}%（差 ${Math.abs(leadPct - drawPct)}%）`);
      }
    }
  }
}

// 打印详细偏差清单
for (const d of diffs) {
  console.log(`  DIFF [${d.sheet} @ t=${d.t}] (${d.kind}) ${d.detail}`);
}
for (const w of warns) {
  console.log(`  WARN ${w}`);
}

const summary = `plugins=${plugins.length} checks=${checks} diffs=${diffs.length}`;
if (STRICT && diffs.length > 0) {
  console.log(`FAIL check_homomorph ${summary}（严格模式）`);
  process.exit(1);
}
console.log(`OK check_homomorph ${summary}${STRICT ? '（严格模式）' : '（报告模式）'}`);
