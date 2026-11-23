'use strict';
// 轻量缓存版本号防漏检查（零构建架构）：
// 1. 校验 web/hzwest.html 与 web/hzatlas.html 中所有本地 JS/CSS 引用均带合法 ?v=<正整数>、目标文件存在、无重复引用。
// 2. 可选 --base=<ref>（加 --strict 时未升版本号退出 1）：对比基准提交，检查改动的本地 JS/CSS 是否同步递增了 ?v=N。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '../..');
const webDir = path.join(root, 'web');
const fail = m => { console.log('FAIL check_cachebust: ' + m); process.exit(1); };

function parseAssets(html) {
  const out = [];
  const re = /<(?:script\b[^>]*\bsrc|link\b[^>]*\bhref)=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (/^(?:https?:|data:|#|\/\/)/i.test(raw)) continue;
    if (!/\.(?:js|css)(?:\?|$)/i.test(raw)) continue;
    if (/^vendor\//i.test(raw)) continue;
    const [file, qs = ''] = raw.split('?');
    const vm = /(?:^|&)v=(\d+)(?:&|$)/.exec(qs);
    out.push({ raw, file, v: vm ? parseInt(vm[1], 10) : null });
  }
  return out;
}

const htmlFiles = ['web/hzwest.html', 'web/hzatlas.html'];
const currentMap = new Map(); // 'web/<file>' -> { html, v }
let total = 0;

for (const hf of htmlFiles) {
  const full = path.join(root, hf);
  if (!fs.existsSync(full)) continue;
  const html = fs.readFileSync(full, 'utf8');
  const assets = parseAssets(html);
  const seen = new Set();
  for (const a of assets) {
    total++;
    if (seen.has(a.file)) fail(`${hf} 重复引用 ${a.file}`);
    seen.add(a.file);
    if (!(a.v >= 1)) fail(`${hf} 引用 ${a.raw} 缺少正整数 ?v=N`);
    const target = path.join(webDir, a.file);
    if (!fs.existsSync(target)) fail(`${hf} 引用目标不存在：web/${a.file}`);
    currentMap.set('web/' + a.file, { html: hf, v: a.v });
  }
}

const baseArg = process.argv.find(a => a.startsWith('--base='));
const strict = process.argv.includes('--strict');
let unbumped = 0;

if (baseArg) {
  const baseRef = baseArg.slice('--base='.length);
  const changed = execFileSync('git', ['diff', '--name-only', baseRef, '--', 'web/'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
  const baseVersions = new Map();
  for (const hf of htmlFiles) {
    try {
      const oldHtml = execFileSync('git', ['show', `${baseRef}:${hf}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      for (const a of parseAssets(oldHtml)) baseVersions.set('web/' + a.file, a.v);
    } catch (_) {}
  }
  for (const f of changed) {
    if (!currentMap.has(f)) continue;
    const curV = currentMap.get(f).v;
    const oldV = baseVersions.get(f);
    if (oldV != null && curV <= oldV) {
      unbumped++;
      console.log(`  WARN check_cachebust: ${f} 相对 ${baseRef} 已改动，但 ${currentMap.get(f).html} 中 ?v=${curV} 未递增（原 ?v=${oldV}）`);
    }
  }
  if (strict && unbumped > 0) fail(`有 ${unbumped} 个改动文件未递增 ?v=N`);
}

console.log(`OK check_cachebust html=${htmlFiles.length} assets=${total}${baseArg ? ` unbumped=${unbumped}` : ''}`);
