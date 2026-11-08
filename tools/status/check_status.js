#!/usr/bin/env node
// 校验集成看板：docs/status.json 字段合同 + web/status.html 基本规则（docs/tasks/status-ui.md）
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..');
const fail = m => { console.log('FAIL check_status: ' + m); process.exit(1); };
const d = JSON.parse(fs.readFileSync(path.join(R, 'docs/status.json'), 'utf8'));
if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(d.generated_at || '')) fail('generated_at 不是 ISO');
for (const k of ['workflows_running', 'dispatch_open', 'live_claims', 'waiting_on_owner', 'blockers', 'pending_review', 'items_done', 'items_total', 'commits_today', 'commits_total', 'files'])
  if (typeof d.headline?.[k] !== 'number') fail('headline.' + k + ' 缺失');
for (const k of ['blockers', 'stale_locks', 'dispatches_open', 'live_claims', 'claimed_items', 'free_items', 'pending_review', 'by_agent', 'recent_commits'])
  if (!Array.isArray(d[k])) fail(k + ' 不是数组');
for (const b of d.blockers) if (!b.kind || !b.what || !b.who) fail('blockers 项缺 kind/what/who');
for (const x of d.dispatches_open) if (!x.id || !x.agent) fail('dispatches_open 项缺 id/agent');
for (const k of ['live', 'board', 'repo']) if (!/^https:/.test(d.links?.[k] || '')) fail('links.' + k);
const h = fs.readFileSync(path.join(R, 'web/status.html'), 'utf8');
if (!h.includes('raw.githubusercontent.com/changrong996-droid/hzwest-atlas/main/docs/status.json')) fail('status.html 缺 file: 读取地址');
if (!h.includes('../docs/status.json')) fail('status.html 缺相对读取地址');
if (/<script[^>]+src=["']https?:/i.test(h) || /<link[^>]+href=["']https?:/i.test(h)) fail('status.html 引用了外部脚本或样式');
if (/(api[_-]?key|token|secret)\s*[:=]/i.test(h)) fail('status.html 疑似含密钥');
console.log(`OK check_status blockers=${d.blockers.length} dispatch=${d.dispatches_open.length} claims=${d.live_claims.length}`);
