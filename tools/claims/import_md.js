#!/usr/bin/env node
'use strict';
// 一次性迁移器：认领板 Markdown（CLAIMS.md + 三个归档）→ data/claims/*.jsonl。
//
// 用法：node tools/claims/import_md.js [--src <仓库根>] [--out <目录>] [--report <文件>]
//   默认 --src = 仓库根（本文件上两级），--out = data/claims。
//
// 规则（与 tools/claims/lib/model.js 的模型一致）：
//  - 六个实体各一个 JSONL；每行一条、按 id 排序、键序固定；state = open（活板）/ closed（归档）。
//  - seq = 该行在源文件中的行号（同 state 组内排序键；新增行可省略 seq 排表尾）。
//  - source（原文件:行）只进本报告，不进长期数据。
//  - status_text / issued_text / label 保留原单元格文本，保证 gen.js 可逐字节重排。
//  - 只读输入、只写 --out；不执行任何输入文件里的代码；只用 Node 内置模块。
//  - 无损：每个表格数据行必须落到恰好一个实体，否则退出码 1。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseTables } = require('./lib/mdtables');
const M = require('./lib/model');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const h8 = (s) => crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 8);
const slug = (s) => String(s || '').trim().replace(/\s+/g, '-');

function parseArgs(argv) {
  const here = path.dirname(path.dirname(path.dirname(__filename))); // tools/claims → repo root
  const args = { src: here, out: path.join(here, 'data', 'claims'), report: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src') args.src = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--report') args.report = argv[++i];
    else if (a === '--help' || a === '-h') { usage(); process.exit(0); }
    else { console.error(`未知参数: ${a}`); usage(); process.exit(2); }
  }
  return args;
}
function usage() {
  console.error('用法: node tools/claims/import_md.js [--src <仓库根>] [--out <目录>] [--report <文件>]\n' +
    '读取: <src>/CLAIMS.md, <src>/docs/{dispatch-archive,claims-archive,decisions}.md');
}

function readInput(src, rel, warnings) {
  const p = path.join(src, rel);
  if (!fs.existsSync(p)) { warnings.push(`输入缺失，已跳过: ${rel}`); return null; }
  const buf = fs.readFileSync(p);
  return { rel, bytes: buf.length, lines: buf.toString('utf8').split('\n').length, sha256: sha256(buf), text: buf.toString('utf8') };
}

function deriveYearPrefix(texts) {
  const count = new Map();
  for (const t of texts) for (const m of t.matchAll(/\b(20\d{2})-\d{2}-\d{2}\b/g)) count.set(m[1], (count.get(m[1]) || 0) + 1);
  let best = null, bestN = 0;
  for (const [y, n] of count) if (n > bestN) { best = y; bestN = n; }
  return best;
}

function normDate(raw, yearPrefix, warnings, where) {
  const s = (raw || '').trim();
  const full = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (full) return full[1];
  const md = /^(\d{2})-(\d{2})\b/.exec(s);
  if (md && yearPrefix) return `${yearPrefix}-${md[1]}-${md[2]}`;
  if (s) warnings.push(`日期无法解析（置 null）: "${s}" @ ${where}`);
  return null;
}

function normClaimStatus(raw) {
  const s = (raw || '').trim();
  if (!s || s === '—' || s === '空') return { status: 'open' };
  if (/^完成/.test(s)) return { status: 'done' };
  if (/^认领/.test(s)) return { status: 'claimed' };
  const m = /^派单\s*(D-\d{1,3})/.exec(s);
  if (m) return { status: 'dispatched' };
  return { status: 'other' };
}

function normDispatchStatus(raw) {
  const s = (raw || '').trim();
  if (/^待做/.test(s)) return 'todo';
  if (/^在做/.test(s)) return 'in_progress';
  if (/^完成/.test(s)) return 'done';
  if (/^撤回/.test(s)) return 'cancelled';
  return 'other';
}

function normRequestStatus(reply) {
  if (reply == null || reply === '') return 'open';
  if (/待委托人|需委托人|未决/.test(reply)) return 'pending_decision';
  return 'replied';
}

// 表头约定（空格归一后比对），防止表格结构被改掉后静默错位
const EXPECTED_HEADERS = {
  '图纸': ['事项', '说明', '负责人', '状态', '认领日期', '备注'],
  '横向事项': ['事项', '说明', '负责人', '状态', '认领日期', '备注'],
  '派单': ['单号', '给谁', '事项', '内容', '状态', '下发'],
  '接口请求': ['日期', '提出人', '需要的接口/要改的合同条款', '理由', 'hark-cr回复'],
  '报名': ['名字', '身份', '途径（APR/B收件）', '日期'],
  '退回记录': ['日期', '分支/PR', '原因'],
  '决定记录': ['日期', '决定', '依据/推荐人', '落地'],
  '索引': ['小节', '文件', '用途', '当前条数'],
};
const normHeader = (arr) => arr.map((c) => c.replace(/\s+/g, ''));

function fixupRow(file, table, row, fixups) {
  const want = table.header.length;
  let cells = row.cells;
  while (cells.length > want) {
    // 多余列：优先移除最靠右的空单元格（认领板里是「||」多打了一个空格位）
    let idx = -1;
    for (let i = cells.length - 1; i >= 1; i--) if (cells[i] === '') { idx = i; break; }
    if (idx < 0) throw new Error(`${file}:${row.line} 行有 ${cells.length} 列，表头 ${want} 列，且无空单元格可折叠`);
    fixups.push(`${file}:${row.line} 多余空单元格已移除（第 ${idx + 1} 格）→ ${want} 列表`);
    cells = cells.slice(0, idx).concat(cells.slice(idx + 1));
  }
  while (cells.length < want) {
    fixups.push(`${file}:${row.line} 缺列已补空（第 ${cells.length + 1} 格）→ ${want} 列表`);
    cells = cells.concat('');
  }
  return cells;
}

function main() {
  const args = parseArgs(process.argv);
  const warnings = [];
  const fixups = [];

  const files = {
    claims: readInput(args.src, 'CLAIMS.md', warnings),
    dispatchArchive: readInput(args.src, path.join('docs', 'dispatch-archive.md'), warnings),
    claimsArchive: readInput(args.src, path.join('docs', 'claims-archive.md'), warnings),
    decisions: readInput(args.src, path.join('docs', 'decisions.md'), warnings),
  };
  if (!files.claims) { console.error('FAIL import_md：缺 CLAIMS.md'); process.exit(1); }

  const yearPrefix = deriveYearPrefix(Object.values(files).filter(Boolean).map((f) => f.text));
  if (!yearPrefix) warnings.push('未能从输入推得年份前缀，MM-DD 日期将置 null');

  const data = { enrollments: [], claims: [], dispatches: [], requests: [], rejections: [], decisions: [] };
  const indexRows = [];
  const allText = (cells) => cells.join(' | ');
  const refsOf = (cells) => ({
    evidence_refs: M.extractEvidenceRefs(allText(cells)),
    dispatch_refs: M.extractDispatchRefs(allText(cells)),
    sheet_refs: M.extractSheetRefs(allText(cells)),
    doc_refs: M.extractDocRefs(allText(cells)),
  });

  for (const f of [files.claims, files.dispatchArchive, files.claimsArchive, files.decisions]) {
    if (!f) continue;
    const isLive = f === files.claims;
    const state = isLive ? 'open' : 'closed';
    for (const table of parseTables(f.text)) {
      const sec = table.section.replace(/\s+/g, '');
      const expect = EXPECTED_HEADERS[sec];
      if (expect && normHeader(table.header).join('|') !== normHeader(expect).join('|')) {
        throw new Error(`${f.rel}「${table.section}」表头与约定不符:\n  实际: ${table.header.join(' | ')}\n  期望: ${expect.join(' | ')}`);
      }
      for (const row of table.rows) {
        const cells = fixupRow(f.rel, table, row, fixups);
        const c = (i) => cells[i] || '';
        const line = row.line;

        if (sec === '图纸' || sec === '横向事项') {
          const title = c(0);
          if (!title) throw new Error(`${f.rel}:${line} 图纸/横向事项行缺少「事项」`);
          const id = `claim:${sec === '图纸' ? 'sheet' : 'cross'}:${slug(title)}`;
          if (data.claims.some((x) => x.id === id)) throw new Error(`claim id 重复: ${id} @ ${f.rel}:${line}`);
          data.claims.push({
            id, category: sec === '图纸' ? 'sheet' : 'cross', seq: line,
            title, desc: c(1),
            owner: c(2) === '—' ? null : c(2) || null,
            status: normClaimStatus(c(3)).status,
            status_text: c(3),
            claimed_at: normDate(c(4), yearPrefix, warnings, `${f.rel}:${line}`),
            notes: c(5) || null,
            ...refsOf(cells),
          });
        } else if (sec === '派单') {
          const idRaw = c(0).trim();
          if (!/^D-\d{1,3}$/.test(idRaw)) throw new Error(`${f.rel}:${line} 派单单号不合法: "${idRaw}"`);
          const id = 'D-' + idRaw.slice(2).padStart(2, '0');
          if (data.dispatches.some((x) => x.id === id)) throw new Error(`dispatch id 重复: ${id} @ ${f.rel}:${line}`);
          const r = refsOf(cells);
          data.dispatches.push({
            id, seq: line, state,
            assignees: c(1).split('、').map((s) => s.trim()).filter(Boolean),
            title: c(2), body: c(3),
            status: normDispatchStatus(c(4)), status_text: c(4),
            issued_text: c(5),
            ...r,
            // 单号列本身是 D-xx 文本，会扫出自身；引用语义是「指向别的单」，排除自引
            dispatch_refs: r.dispatch_refs.filter((x) => x !== id),
          });
        } else if (sec === '接口请求') {
          const label = c(0).trim();
          const date = normDate(label, yearPrefix, warnings, `${f.rel}:${line}`);
          const replyRaw = c(4).trim();
          const reply = replyRaw === '' ? null : replyRaw;
          const id = `req:${date || 'unknown'}:${h8(label + '|' + c(1) + '|' + c(2))}`;
          if (date == null) throw new Error(`${f.rel}:${line} 接口请求行缺日期，无法生成稳定 id`);
          if (data.requests.some((x) => x.id === id)) throw new Error(`request id 重复: ${id} @ ${f.rel}:${line}`);
          data.requests.push({
            id, seq: line, state, label, date,
            from: c(1).trim(), ask: c(2),
            reason: c(3) || null, reply,
            status: normRequestStatus(reply),
            ...refsOf(cells),
          });
        } else if (sec === '报名') {
          const name = c(0).trim().replace(/`/g, '');
          if (!name) throw new Error(`${f.rel}:${line} 报名行缺名字`);
          if (data.enrollments.some((x) => x.id === name)) throw new Error(`enrollment id 重复: ${name} @ ${f.rel}:${line}`);
          data.enrollments.push({
            id: name, seq: line, state, name,
            identity: c(1), channel_text: c(2),
            date: normDate(c(3), yearPrefix, warnings, `${f.rel}:${line}`),
          });
        } else if (sec === '退回记录') {
          const dateRaw = c(0).trim();
          const date = normDate(dateRaw, yearPrefix, warnings, `${f.rel}:${line}`);
          const id = `rej:${date || 'unknown'}:${h8(dateRaw + '|' + c(1) + '|' + c(2))}`;
          if (data.rejections.some((x) => x.id === id)) throw new Error(`rejection id 重复: ${id} @ ${f.rel}:${line}`);
          data.rejections.push({
            id, seq: line, state, date,
            branch: c(1), reason: c(2),
            evidence_refs: M.extractEvidenceRefs(allText(cells)),
            dispatch_refs: M.extractDispatchRefs(allText(cells)),
            doc_refs: M.extractDocRefs(allText(cells)),
          });
        } else if (sec === '决定记录') {
          const at = c(0).trim();
          const date = normDate(at, yearPrefix, warnings, `${f.rel}:${line}`);
          const id = `dec:${date || 'unknown'}:${h8(at + '|' + c(1))}`;
          if (data.decisions.some((x) => x.id === id)) throw new Error(`decision id 重复: ${id} @ ${f.rel}:${line}`);
          data.decisions.push({
            id, seq: line, at, decision: c(1), basis: c(2), landed: c(3),
            evidence_refs: M.extractEvidenceRefs(allText(cells)),
            dispatch_refs: M.extractDispatchRefs(allText(cells)),
            doc_refs: M.extractDocRefs(allText(cells)),
          });
        } else if (sec === '索引') {
          indexRows.push({ section: c(0), file: c(1), count: parseInt(c(3), 10) });
        }
      }
    }
  }

  // 引用完整性（R-xxxx 本轮以 web/hzreal.js 文本为准；D-xx 以派单实体为准）
  const dispatchIds = new Set(data.dispatches.map((d) => d.id));
  let evidenceIds = new Set();
  const hzrealPath = path.join(args.src, 'web', 'hzreal.js');
  if (fs.existsSync(hzrealPath)) {
    evidenceIds = new Set([...fs.readFileSync(hzrealPath, 'utf8').matchAll(/R-\d{4}/g)].map((m) => m[0]));
  } else {
    warnings.push('web/hzreal.js 不存在，R-xxxx 引用未校验');
  }
  const unresolved = [];
  for (const [entity, list] of Object.entries(data)) {
    for (const e of list) {
      for (const ref of e.evidence_refs || []) if (!evidenceIds.has(ref)) unresolved.push(`${entity}/${e.id} 证据引用 ${ref} 在 web/hzreal.js 无对应记录`);
      for (const ref of e.dispatch_refs || []) if (!dispatchIds.has(ref)) unresolved.push(`${entity}/${e.id} 派单引用 ${ref} 无对应实体`);
    }
  }
  for (const cl of data.claims) {
    const m = /^派单\s*(D-\d{1,3})/.exec(cl.status_text);
    if (m) {
      const ref = 'D-' + m[1].replace(/^D-/, '').padStart(2, '0');
      if (!cl.dispatch_refs.includes(ref)) unresolved.push(`claims/${cl.id} 状态引用 ${ref} 未进 dispatch_refs`);
    }
  }

  // 报名覆盖检查（负责人须在报名表；历史报名已移出活板的列 warning）
  const enrolled = new Set(data.enrollments.map((e) => e.id));
  for (const cl of data.claims) {
    if (cl.owner && !enrolled.has(cl.owner.replace(/`/g, ''))) warnings.push(`负责人不在报名表: ${cl.owner}（${cl.id}；历史报名已移出活板属正常）`);
  }

  // 索引计数核对
  const live = {
    '图纸': data.claims.filter((c) => c.category === 'sheet').length,
    '横向事项': data.claims.filter((c) => c.category === 'cross').length,
    '派单（开放）': data.dispatches.filter((d) => d.state === 'open').length,
    '派单（已关单）': data.dispatches.filter((d) => d.state === 'closed').length,
    '接口请求（未关）': data.requests.filter((r) => r.state === 'open').length,
    '接口请求（已回复）': data.requests.filter((r) => r.state === 'closed').length,
    '决定记录': data.decisions.length,
    '报名': data.enrollments.filter((e) => e.state === 'open').length,
    '退回记录': data.rejections.filter((r) => r.state === 'open').length,
  };
  const indexCheck = indexRows.map((r) => ({ section: r.section, claimed: r.count, actual: live[r.section] ?? null, ok: live[r.section] === r.count }));

  // 写 JSONL
  fs.mkdirSync(args.out, { recursive: true });
  const counts = {};
  for (const entity of M.ENTITIES) counts[entity] = M.writeJsonl(path.join(args.out, `${entity}.jsonl`), data[entity], M.KEYS[entity]);

  // 报告
  const rep = [];
  rep.push(`# import_md 迁移报告`);
  rep.push('');
  rep.push(`- 运行：node tools/claims/import_md.js --src ${args.src} --out ${args.out}`);
  rep.push(`- 输入：${[files.claims, files.dispatchArchive, files.claimsArchive, files.decisions].filter(Boolean).map((f) => `${f.rel}（${f.lines} 行，sha256 ${f.sha256.slice(0, 12)}…）`).join('、')}`);
  rep.push(`- 实体条数：${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  rep.push(`- 溯源：每条数据的 seq 即其在源文件中的行号（claims/报名/退回 open 行 = CLAIMS.md；dispatches closed = docs/dispatch-archive.md；requests closed 与报名/退回 closed = docs/claims-archive.md；decisions = docs/decisions.md）`);
  rep.push('');
  rep.push(`## 索引计数核对`);
  rep.push('');
  rep.push(`| 小节 | 索引声明 | 实际解析 | 一致 |`);
  rep.push(`|---|---:|---:|---|`);
  for (const ic of indexCheck) rep.push(`| ${ic.section} | ${ic.claimed} | ${ic.actual ?? '—'} | ${ic.ok ? '✓' : '✗'} |`);
  rep.push('');
  rep.push(`## 修表动作（fixups，${fixups.length} 条——均已计入 JSONL，gen.js 会按同样规则重排）`);
  rep.push('');
  rep.push(fixups.length ? fixups.map((s) => `- ${s}`).join('\n') : '（无）');
  rep.push('');
  rep.push(`## 告警（warnings，${warnings.length} 条）`);
  rep.push('');
  rep.push(warnings.length ? warnings.map((s) => `- ${s}`).join('\n') : '（无）');
  rep.push('');
  rep.push(`## 未解析引用（${unresolved.length} 条）`);
  rep.push('');
  rep.push(unresolved.length ? unresolved.map((s) => `- ${s}`).join('\n') : '（无——全部 R-/D- 引用都能落到实体）');
  rep.push('');
  const reportText = rep.join('\n');
  if (args.report) fs.writeFileSync(args.report, reportText);
  console.log(reportText);

  const bad = indexCheck.some((ic) => !ic.ok);
  const ok = unresolved.length === 0 && !bad;
  console.log(`\n${ok ? 'OK' : 'WARN'} import_md：${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}；fixups ${fixups.length} · warnings ${warnings.length} · unresolved ${unresolved.length}`);
  if (!ok) process.exitCode = 2;
}

try {
  main();
} catch (e) {
  console.error(`FAIL import_md：${e.message}`);
  process.exit(1);
}
