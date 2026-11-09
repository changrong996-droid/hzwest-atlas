'use strict';
// 认领板数据模型：六个实体 JSONL 的固定键序、读取与引用抽取。
// import_md.js（写入）、gen.js（渲染）、check_claims.js（校验）共用本文件。
// 约定：每行一条、按 id 排序、键序 = KEYS[entity]；state 只加在带归档语义的实体上
//（open = 活板，closed = 归档）；claims / decisions 无归档语义，不带 state。
const fs = require('fs');

const ENTITIES = ['enrollments', 'claims', 'dispatches', 'requests', 'rejections', 'decisions'];

// 固定键序（check_claims 按此顺序核对实际键序；lock 为可选扩展字段，排在末尾）
const KEYS = {
  enrollments: ['id', 'seq', 'state', 'name', 'identity', 'channel_text', 'date'],
  claims: ['id', 'category', 'seq', 'title', 'desc', 'owner', 'status', 'status_text', 'claimed_at', 'notes', 'evidence_refs', 'dispatch_refs', 'sheet_refs', 'doc_refs', 'lock'],
  dispatches: ['id', 'seq', 'state', 'assignees', 'title', 'body', 'status', 'status_text', 'issued_text', 'evidence_refs', 'dispatch_refs', 'sheet_refs', 'doc_refs'],
  requests: ['id', 'seq', 'state', 'label', 'date', 'from', 'ask', 'reason', 'reply', 'status', 'evidence_refs', 'dispatch_refs', 'sheet_refs', 'doc_refs'],
  rejections: ['id', 'seq', 'state', 'date', 'branch', 'reason', 'evidence_refs', 'dispatch_refs', 'doc_refs'],
  decisions: ['id', 'seq', 'at', 'decision', 'basis', 'landed', 'evidence_refs', 'dispatch_refs', 'doc_refs'],
};

// state 归属：哪些实体有 open/closed
const HAS_STATE = new Set(['enrollments', 'dispatches', 'requests', 'rejections']);

// 自由文本里的引用抽取（import 与 check 共用同一实现，check 时重算比对防漂移）
function extractEvidenceRefs(text) {
  const refs = new Set();
  for (const m of text.matchAll(/R-(\d{4})\s*[…~～-]\s*R-(\d{4})/g)) {
    let a = +m[1], b = +m[2];
    if (a > b) [a, b] = [b, a];
    if (b - a > 200) throw new Error(`证据区间引用过大: ${m[0]}`);
    for (let k = a; k <= b; k++) refs.add('R-' + String(k).padStart(4, '0'));
  }
  for (const m of text.matchAll(/R-\d{4}(?![\d…~～-])/g)) refs.add(m[0]);
  return [...refs].sort();
}

function extractDispatchRefs(text) {
  const refs = new Set();
  for (const m of text.matchAll(/D-(\d{1,3})\s*[…~～-]\s*D-(\d{1,3})/g)) {
    let a = +m[1], b = +m[2];
    if (a > b) [a, b] = [b, a];
    if (b - a > 200) throw new Error(`派单区间引用过大: ${m[0]}`);
    for (let k = a; k <= b; k++) refs.add('D-' + String(k).padStart(2, '0'));
  }
  for (const m of text.matchAll(/D-\d{1,3}(?![\d…~～-])/g)) refs.add(m[0]);
  return [...refs].sort();
}

const extractSheetRefs = (text) => [...new Set([...text.matchAll(/S-\d{3}(?![\d])/g)].map(m => m[0]))].sort();
const extractDocRefs = (text) => [...new Set([...text.matchAll(/docs\/[^\s，。；）"'|]+/g)].map(m => m[0].replace(/[.，；]+$/, '')))].sort();

// 读 JSONL：逐行 JSON.parse，行号进错误信息；返回 [{ line, entity }]
function readJsonl(path, entity) {
  const text = fs.readFileSync(path, 'utf8');
  const out = [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop(); // 末尾换行
  lines.forEach((ln, i) => {
    if (ln.trim() === '') throw new Error(`${path}:${i + 1} 空行（JSONL 不允许空行）`);
    let obj;
    try { obj = JSON.parse(ln); } catch (e) { throw new Error(`${path}:${i + 1} 不是合法 JSON: ${e.message}`); }
    out.push({ line: i + 1, entity: obj });
  });
  return out;
}

// 写 JSONL：按 id 排序、紧凑序列化、单换行结尾
function writeJsonl(path, list, keyOrder) {
  const sorted = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const body = sorted.map((o) => {
    const row = {};
    for (const k of keyOrder) if (o[k] !== undefined) row[k] = o[k];
    for (const k of Object.keys(o)) if (!(k in row)) throw new Error(`实体字段 ${k} 不在键序定义里（${path}）`);
    return JSON.stringify(row);
  });
  fs.writeFileSync(path, body.join('\n') + (body.length ? '\n' : ''));
  return sorted.length;
}

module.exports = {
  ENTITIES, KEYS, HAS_STATE,
  extractEvidenceRefs, extractDispatchRefs, extractSheetRefs, extractDocRefs,
  readJsonl, writeJsonl,
};
