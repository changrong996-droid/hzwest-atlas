#!/usr/bin/env node
'use strict';
// 认领板生成器：data/claims/*.jsonl → CLAIMS.md、docs/decisions.md、
// docs/dispatch-archive.md、docs/claims-archive.md。
//
// 用法：node tools/claims/gen.js            # 生成并写入四个文件
//       node tools/claims/gen.js --check    # 只比对，不一致退出 1 并打印行级 diff
//
// 规则：
//  - 每节表头/列数固定（tools/claims/lib/model.js KEYS 与本文件 TABLES 对应）；
//    行序 = seq 升序（同 seq 按 id），state=open 进活板、closed 进归档。
//  - 单元格原样输出（不转义 |）；活板与归档的「||」空格位、缺列行由迁移时归一，
//    规范化差异逐类记录在 docs/proposals/zcode-cs-claims-json.md。
//  - 只用 Node 内置模块。

const fs = require('fs');
const path = require('path');
const M = require('./lib/model');

const ROOT = path.dirname(path.dirname(path.dirname(__filename))); // 仓库根
const DATA = path.join(ROOT, 'data', 'claims');
const TPL = path.join(DATA, 'tpl');

const SEP = (n) => '|' + Array(n).fill('---').join('|') + '|';
// 单元格内出现的 | 一律转义成 \|：保证 GitHub 表格渲染不破列；
// 迁移时解析器已把 \| 还原为字面 |，这里再转义回去，与源文件的 \|x\| 写法逐字节一致。
const cell = (c) => (c == null ? '' : String(c)).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, '　');
const row = (cells) => '| ' + cells.map(cell).join(' | ') + ' |';

function table(headerCells, rows) {
  return [row(headerCells), SEP(headerCells.length), ...rows].join('\n');
}

// 由 seq 排序（缺 seq 视为排表尾；同 seq 按 id）
const bySeq = (a, b) => ((a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function load() {
  const data = {};
  for (const entity of M.ENTITIES) {
    data[entity] = M.readJsonl(path.join(DATA, `${entity}.jsonl`), entity).map((x) => x.entity);
  }
  return data;
}

function renderClaimsTable(list) {
  return table(
    ['事项', '说明', '负责人', '状态', '认领日期', '备注'],
    [...list].sort(bySeq).map((c) => row([c.title, c.desc, c.owner ?? '—', c.status_text, c.claimed_at ?? '', c.notes ?? '']))
  );
}

function renderDispatchTable(list) {
  return table(
    ['单号', '给谁', '事项', '内容', '状态', '下发'],
    [...list].sort(bySeq).map((d) => row([d.id, d.assignees.join('、'), d.title, d.body, d.status_text, d.issued_text]))
  );
}

function renderRequestTable(list) {
  return table(
    ['日期', '提出人', '需要的接口 / 要改的合同条款', '理由', 'hark-cr 回复'],
    [...list].sort(bySeq).map((r) => row([r.label, r.from, r.ask, r.reason ?? '', r.reply ?? '']))
  );
}

function renderEnrollmentTable(list) {
  return table(
    ['名字', '身份', '途径（A PR / B 收件）', '日期'],
    [...list].sort(bySeq).map((e) => row([e.name, e.identity, e.channel_text, e.date ?? '']))
  );
}

function renderRejectionTable(list) {
  return table(
    ['日期', '分支 / PR', '原因'],
    [...list].sort(bySeq).map((r) => row([r.date ?? '', r.branch, r.reason]))
  );
}

function renderDecisionTable(list) {
  return table(
    ['日期', '决定', '依据 / 推荐人', '落地'],
    [...list].sort(bySeq).map((d) => row([d.at, d.decision, d.basis, d.landed]))
  );
}

const tpl = (name) => fs.readFileSync(path.join(TPL, `${name}.md`), 'utf8');

// 索引表：静态的 文件/用途 文案 + 由 JSONL 实时计算的条数
function renderIndex(data) {
  const n = {
    sheet: data.claims.filter((c) => c.category === 'sheet').length,
    cross: data.claims.filter((c) => c.category === 'cross').length,
    dispOpen: data.dispatches.filter((d) => d.state === 'open').length,
    dispClosed: data.dispatches.filter((d) => d.state === 'closed').length,
    reqOpen: data.requests.filter((r) => r.state === 'open').length,
    reqClosed: data.requests.filter((r) => r.state === 'closed').length,
    rejOpen: data.rejections.filter((r) => r.state === 'open').length,
    enrOpen: data.enrollments.filter((e) => e.state === 'open').length,
    dec: data.decisions.length,
  };
  return table(
    ['小节', '文件', '用途', '当前条数'],
    [
      row(['图纸', 'CLAIMS.md', '分图认领（认领锁、board、scope 读）', n.sheet]),
      row(['横向事项', 'CLAIMS.md', '横向事项认领（认领锁、board、scope 读）', n.cross]),
      row(['派单（开放）', 'CLAIMS.md', '未关单的派单，给谁谁做', n.dispOpen]),
      row(['派单（已关单）', 'docs/dispatch-archive.md', '完成 / 取消的派单原样归档（gen.py、flow.py 合并读取）', n.dispClosed]),
      row(['接口请求（未关）', 'CLAIMS.md', '未回复或待定的接口请求', n.reqOpen]),
      row(['接口请求（已回复）', 'docs/claims-archive.md', '已回复关掉的接口请求原样归档', n.reqClosed]),
      row(['决定记录', 'docs/decisions.md', '委托人决定，按时间', n.dec]),
      row(['报名', 'CLAIMS.md', '近 7 天报名（更早的移入 docs/claims-archive.md）', n.enrOpen]),
      row(['退回记录', 'CLAIMS.md', '近 7 天退回（更早的移入 docs/claims-archive.md）', n.rejOpen]),
    ]
  );
}

// 生成四个文件的完整文本。节与节之间、表与下一节标题之间空一行；
// CLAIMS.md 的「派单」节有一段介绍文字（与 main 现文件一致）。
const CLAIMS_DISPATCH_INTRO = 'hark-cr 按合并与审查结果下发的后续小单。给谁的就由谁做，不占认领名额；提交写 `[D-xx]`。状态：待做 / 在做 / 完成 / 撤回。';

function generateAll(data) {
  const out = {};

  out['CLAIMS.md'] =
    tpl('claims.head') +
    renderIndex(data) + '\n\n' +
    '## 图纸\n\n' + renderClaimsTable(data.claims.filter((c) => c.category === 'sheet')) + '\n\n' +
    '## 横向事项\n\n' + renderClaimsTable(data.claims.filter((c) => c.category === 'cross')) + '\n\n' +
    '## 派单\n\n' + CLAIMS_DISPATCH_INTRO + '\n\n' + renderDispatchTable(data.dispatches.filter((d) => d.state === 'open')) + '\n\n' +
    '## 接口请求\n\n' + renderRequestTable(data.requests.filter((r) => r.state === 'open')) + '\n\n' +
    '## 报名\n\n' + renderEnrollmentTable(data.enrollments.filter((e) => e.state === 'open')) + '\n\n' +
    '## 退回记录\n\n' + renderRejectionTable(data.rejections.filter((r) => r.state === 'open')) + '\n';

  out['docs/dispatch-archive.md'] =
    tpl('dispatch-archive.head') +
    renderDispatchTable(data.dispatches.filter((d) => d.state === 'closed')) + '\n';

  out['docs/claims-archive.md'] =
    tpl('claims-archive.head') +
    renderRequestTable(data.requests.filter((r) => r.state === 'closed')) + '\n\n' +
    '## 报名\n\n' + renderEnrollmentTable(data.enrollments.filter((e) => e.state === 'closed')) + '\n\n' +
    '## 退回记录\n\n' + renderRejectionTable(data.rejections.filter((r) => r.state === 'closed')) + '\n';

  out['docs/decisions.md'] =
    tpl('decisions.head') +
    renderDecisionTable(data.decisions) + '\n';

  return out;
}

// ---- 行级 diff（LCS），供 --check 打印 ----
function diffLines(oldText, newText) {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hunks = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; continue; }
    const hunk = { at: i + 1, del: [], add: [] };
    while (i < n && j < m && a[i] !== b[j]) {
      if (dp[i + 1][j] >= dp[i][j + 1]) { hunk.del.push(a[i]); i++; }
      else { hunk.add.push(b[j]); j++; }
    }
    while (i < n && (j >= m || a[i] !== b[j])) { hunk.del.push(a[i]); i++; } // 可能为空
    while (j < m && (i >= n || a[i] !== b[j])) { hunk.add.push(b[j]); j++; }
    hunks.push(hunk);
  }
  while (i < n) { hunks.push({ at: i + 1, del: [a[i]], add: [] }); i++; }
  while (j < m) { hunks.push({ at: i + 1, del: [], add: [b[j]] }); j++; }
  return hunks;
}

const TARGETS = ['CLAIMS.md', 'docs/decisions.md', 'docs/dispatch-archive.md', 'docs/claims-archive.md'];

function checkAll() {
  const generated = generateAll(load());
  const results = [];
  for (const rel of TARGETS) {
    const abs = path.join(ROOT, rel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    const hunks = diffLines(current, generated[rel]);
    results.push({ rel, ok: hunks.length === 0, hunks });
  }
  return results;
}

function main() {
  const check = process.argv.includes('--check');
  if (check) {
    const results = checkAll();
    let bad = 0;
    for (const r of results) {
      if (r.ok) { console.log(`  OK ${r.rel} 与 JSONL 生成结果一致`); continue; }
      bad++;
      console.log(`  DIFF ${r.rel}（仓库文件 ≠ 生成结果，${r.hunks.length} 处）：`);
      for (const h of r.hunks.slice(0, 10)) {
        console.log(`    @@ ${h.at} @@`);
        for (const l of h.del.slice(0, 6)) console.log(`    - ${l.slice(0, 160)}`);
        for (const l of h.add.slice(0, 6)) console.log(`    + ${l.slice(0, 160)}`);
      }
      if (r.hunks.length > 10) console.log(`    … 共 ${r.hunks.length} 处，只显示前 10 处`);
    }
    console.log(`${bad === 0 ? 'OK' : 'FAIL'} gen --check：${results.length - bad}/${results.length} 与仓库一致`);
    if (bad) process.exit(1);
    return;
  }
  const generated = generateAll(load());
  for (const rel of TARGETS) {
    fs.writeFileSync(path.join(ROOT, rel), generated[rel]);
    console.log(`  写入 ${rel}（${generated[rel].split('\n').length - 1} 行）`);
  }
  console.log('OK gen：四个文件已由 data/claims/*.jsonl 生成');
}

if (require.main === module) main();
module.exports = { generateAll, checkAll, load };
