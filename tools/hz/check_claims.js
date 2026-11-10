#!/usr/bin/env node
'use strict';
// 认领板数据校验：data/claims/*.jsonl 是唯一真相，本脚本保证它与生成的 Markdown 不分叉。
//
// 用法：node tools/hz/check_claims.js
// 检查项：
//  1) gen --check：CLAIMS.md 与三个归档必须与 JSONL 生成结果逐行一致；
//  2) 逐行 schema 校验（data/claims/schema.json，内置校验器）+ 键序固定 + 按 id 排序 + id 唯一；
//  3) 引用完整性：D-xx / R-xxxx 可解析（R 以 web/hzreal.js 文本中的 id 为准，只读不执行），
//     且存储的 *_refs 与按文本重算的一致（防手改 JSONL 漏更新引用）；
//  4) claims.owner / requests.from 必须在报名表或 AGENTS.md 名册里（派单对象为自由文本，只告警）。
// 成功时最后一行打印 OK check_claims 与各实体条数。任一失败退出 1。
// 只用 Node 内置模块；接入 check_all 由集成人做（本文件不改 check_all.js）。

const fs = require('fs');
const path = require('path');
const M = require('../claims/lib/model');
const gen = require('../claims/gen');

const ROOT = path.dirname(path.dirname(__dirname));
const DATA = path.join(ROOT, 'data', 'claims');

const fails = [];
const warns = [];
const fail = (msg) => fails.push(msg);

// ---- 迷你 schema 校验器（支持 type/required/properties/additionalProperties/enum/pattern/
//      items/minItems/minLength/minimum；schema.json 未用 $ref，全部内联） ----
function validate(schema, value, where) {
  const errs = [];
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  const types = Array.isArray(schema.type) ? schema.type : [schema.type].filter(Boolean);
  const typeOk = types.length === 0 || types.some((t) => (t === 'integer' ? typeof value === 'number' && Number.isInteger(value) : t === typeOf(value)));
  if (types.length && !typeOk) {
    errs.push(`${where} 类型应为 ${types.join('|')}，实际 ${typeOf(value)}`);
    return errs;
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${where} 值 ${JSON.stringify(value)} 不在枚举里`);
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${where} 不匹配 ${schema.pattern}: ${JSON.stringify(value.slice(0, 60))}`);
    if (schema.minLength != null && value.length < schema.minLength) errs.push(`${where} 长度 < ${schema.minLength}`);
  }
  if (typeof value === 'number' && schema.minimum != null && value < schema.minimum) errs.push(`${where} < 最小值 ${schema.minimum}`);
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errs.push(`${where} 元素数 < ${schema.minItems}`);
    if (schema.uniqueItems && new Set(value.map((x) => JSON.stringify(x))).size !== value.length) errs.push(`${where} 元素重复`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, `${where}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required || []) if (!(k in value)) errs.push(`${where} 缺必填字段 ${k}`);
    const props = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) if (!(k in props)) errs.push(`${where} 多余字段 ${k}`);
    }
    for (const [k, sub] of Object.entries(props)) {
      if (k in value) errs.push(...validate(sub, value[k], `${where}.${k}`));
    }
  }
  return errs;
}

// ---- AGENTS.md 名册（第 1 节名册表 + 1.1 本地能力表的第一列；pi-t2、pi-t3 拆开） ----
function rosterFromAgents() {
  const text = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  const names = new Set();
  const grab = (seg) => {
    for (const ln of seg.split('\n')) {
      if (!ln.trim().startsWith('|') || /^\|[\s:|-]+\|/.test(ln.trim())) continue;
      const cell = ln.trim().replace(/^\|/, '').split('|')[0].trim().replace(/`/g, '');
      for (const n of cell.split('、')) {
        const t = n.trim();
        if (/^[a-z][a-z0-9-]{2,23}$/.test(t)) names.add(t);
      }
    }
  };
  const s1 = text.indexOf('## 1. 名册');
  const s2 = text.indexOf('## 2. 统一标注');
  if (s1 >= 0 && s2 > s1) grab(text.slice(s1, s2));
  return names;
}

function main() {
  // 1) gen --check
  const genResults = gen.checkAll();
  for (const r of genResults) {
    if (r.ok) console.log(`  OK gen ${r.rel} 与 JSONL 一致`);
    else {
      fail(`gen: ${r.rel} 与 data/claims/*.jsonl 生成结果不一致（改了 JSONL 就重跑 node tools/claims/gen.js）`);
      for (const h of r.hunks.slice(0, 3)) {
        fail(`  ${r.rel}@@${h.at}: -${(h.del[0] || '').slice(0, 80)} +${(h.add[0] || '').slice(0, 80)}`);
      }
    }
  }

  // 2) 逐行 schema 校验 + 键序 + 排序 + 唯一
  const schema = JSON.parse(fs.readFileSync(path.join(DATA, 'schema.json'), 'utf8'));
  const data = {};
  for (const entity of M.ENTITIES) {
    const file = path.join(DATA, `${entity}.jsonl`);
    const def = schema.$defs[entity];
    if (!def) { fail(`schema.json 缺 $defs.${entity}`); continue; }
    let rows;
    try { rows = M.readJsonl(file, entity); } catch (e) { fail(e.message); continue; }
    const seen = new Set();
    let prevId = null;
    for (const { line, entity: obj } of rows) {
      const where = `${entity}.jsonl:${line}`;
      for (const e of validate(def, obj, where)) fail(e);
      // 键序：出现过的键必须按 KEYS 定义的相对顺序
      const order = M.KEYS[entity];
      const idxs = Object.keys(obj).map((k) => order.indexOf(k));
      if (idxs.some((i) => i < 0) || [...idxs].sort((a, b) => a - b).join() !== idxs.join()) {
        fail(`${where} 键序不符合 model.js KEYS 约定`);
      }
      if (seen.has(obj.id)) fail(`${where} id 重复: ${obj.id}`);
      seen.add(obj.id);
      if (prevId != null && !(prevId < obj.id)) fail(`${where} 未按 id 排序（${prevId} → ${obj.id}）`);
      prevId = obj.id;
    }
    data[entity] = rows.map((r) => r.entity);
    console.log(`  OK ${entity}.jsonl ${rows.length} 行（schema/键序/排序/唯一）`);
  }

  // 3) 引用完整性：重算比对 + 解析
  const hzrealPath = path.join(ROOT, 'web', 'hzreal.js');
  const evidenceIds = fs.existsSync(hzrealPath)
    ? new Set([...fs.readFileSync(hzrealPath, 'utf8').matchAll(/R-\d{4}/g)].map((m) => m[0]))
    : null;
  if (!evidenceIds) warns.push('web/hzreal.js 不存在，R-xxxx 引用未校验');
  const dispatchIds = new Set(data.dispatches.map((d) => d.id));
  const RECALC = {
    evidence_refs: M.extractEvidenceRefs,
    dispatch_refs: M.extractDispatchRefs,
    sheet_refs: M.extractSheetRefs,
    doc_refs: M.extractDocRefs,
  };
  const textField = {
    evidence_refs: (e) => [e.status_text, e.issued_text, e.label, e.ask, e.reason, e.reply, e.title, e.desc, e.body, e.notes, e.identity, e.branch, e.reason, e.decision, e.basis, e.landed, e.channel_text].filter((x) => typeof x === 'string').join(' | '),
  };
  for (const [entity, list] of Object.entries(data)) {
    for (const e of list) {
      const text = textField.evidence_refs(e);
      for (const [field, fn] of Object.entries(RECALC)) {
        if (!M.KEYS[entity].includes(field)) continue; // 该实体按设计不带此引用字段（如 enrollments）
        const stored = e[field] || [];
        const want = field === 'dispatch_refs' && entity === 'dispatches'
          ? fn(text).filter((x) => x !== e.id) // 单号列本身是 D-xx，排除自引（与 import_md 一致）
          : fn(text);
        const a = JSON.stringify(stored), b = JSON.stringify(want);
        if (a !== b) fail(`${entity}.jsonl:${e.id} ${field} 与文本重算不一致：存储 ${a.slice(0, 120)} 重算 ${b.slice(0, 120)}`);
        for (const ref of stored) {
          if (field === 'evidence_refs' && evidenceIds && !evidenceIds.has(ref)) fail(`${entity}/${e.id} 证据引用 ${ref} 在 web/hzreal.js 无对应记录`);
          if (field === 'dispatch_refs' && !dispatchIds.has(ref)) fail(`${entity}/${e.id} 派单引用 ${ref} 无对应实体`);
        }
      }
    }
  }
  console.log(`  OK 引用完整性（R-xxxx ${evidenceIds ? evidenceIds.size + ' 条候选' : '未校验'} · D-xx ${dispatchIds.size} 条 · 存储与重算比对）`);

  // 4) 负责人在报名表或 AGENTS.md 名册
  const known = new Set([...rosterFromAgents(), ...data.enrollments.map((e) => e.id)]);
  const leadToken = (s) => (String(s).replace(/`/g, '').match(/^[a-z][a-z0-9-]{2,23}/) || [''])[0];
  for (const c of data.claims) {
    if (c.owner && !known.has(c.owner.replace(/`/g, ''))) fail(`claims/${c.id} 负责人 ${c.owner} 不在报名表或 AGENTS.md 名册`);
  }
  for (const r of data.requests) {
    if (!known.has(r.from)) fail(`requests/${r.id} 提出人 ${r.from} 不在报名表或 AGENTS.md 名册`);
  }
  for (const d of data.dispatches) {
    for (const a of d.assignees) {
      const t = leadToken(a);
      if (t && !known.has(t) && !['全体', '委托人'].some((w) => a.includes(w))) {
        warns.push(`dispatches/${d.id} 派单对象「${a}」首词 ${t || '（空）'} 未在名册（自由文本，仅告警）`);
      }
    }
  }
  console.log(`  OK 负责人核对（claims.owner / requests.from 严格；派单对象自由文本告警）`);

  // 汇总
  for (const w of warns) console.log(`  WARN ${w}`);
  const counts = M.ENTITIES.map((e) => `${e}=${data[e].length}`).join(' ');
  if (fails.length) {
    for (const f of fails) console.log(`  FAIL ${f}`);
    console.log(`FAIL check_claims（${fails.length} 处失败，${warns.length} 条告警）`);
    process.exit(1);
  }
  console.log(`OK check_claims ${counts}`);
}

try {
  main();
} catch (e) {
  console.error(`FAIL check_claims：${e.message}`);
  process.exit(1);
}
