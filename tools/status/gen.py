#!/usr/bin/env python3
"""生成 docs/status.json：集成流程看板数据（提交、各协作者、派单、认领、待审分支、卡点）。
用法：python3 tools/status/gen.py [--board URL] [--pending a/b,c/d]"""
import json, re, subprocess, sys, urllib.request, datetime, os
R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
g = lambda *a: subprocess.run(['git', '-C', R, *a], capture_output=True, text=True).stdout
args = dict(zip(sys.argv[1::2], sys.argv[2::2]))
board = args.get('--board', 'https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech')
tz = datetime.timezone(datetime.timedelta(hours=8)); now = datetime.datetime.now(tz)
# 提交
log = g('log', 'main', '--format=%H%x1f%cI%x1f%s%x1f%B%x1e').split('\x1e')
commits = []
for e in log:
    p = e.strip().split('\x1f')
    if len(p) < 4: continue
    m = re.search(r'^Agent:\s*(\S+)', p[3], re.M)
    a = (m.group(1) if m else '—').replace('hark-marvis-cs', 'marvis')
    commits.append({'sha': p[0][:7], 'at': p[1], 'subj': p[2][:80], 'agent': a})
today = now.date().isoformat()
by = {}
for c in commits:
    d = by.setdefault(c['agent'], {'total': 0, 'today': 0})
    d['total'] += 1; d['today'] += c['at'].startswith(today)
files = len(g('ls-files').split())
# CLAIMS 表
# 2026-11-09 拆分：已关单派单在 docs/dispatch-archive.md，决定记录在 docs/decisions.md（同格式）
SRC = {'派单': ('CLAIMS.md', 'docs/dispatch-archive.md'), '决定记录': ('docs/decisions.md',)}
def table(sec):
    return [r for f in SRC.get(sec, ('CLAIMS.md',)) for r in _table(f, sec)]
def _table(f, sec):
    t = g('show', 'main:' + f); s = t.split('## ' + sec, 1)
    if len(s) < 2: return []
    rows = []
    for ln in s[1].split('\n## ', 1)[0].splitlines():
        if ln.startswith('|') and not ln.startswith('|---') and not ln.startswith('| 事项') and not ln.startswith('| 编号'):
            rows.append([x.strip() for x in ln.strip().strip('|').split('|')])
    return rows
items = [r for sec in ('图纸', '横向事项') for r in table(sec) if len(r) >= 4]
done = [r[0] for r in items if r[3] == '完成']
claimed = [{'item': r[0], 'agent': r[2], 'state': r[3]} for r in items if r[2] and r[3] != '完成']
free = [r[0] for r in items if not r[2]]
decisions = [r for r in table('决定记录') if r and r[0][:4].isdigit()]
disp = [{'id': r[0], 'agent': r[1], 'item': r[2], 'state': r[4] if len(r) > 4 else ''} for r in table('派单') if r and r[0].startswith('D-')]
# 实时认领锁
try: live = json.load(urllib.request.urlopen(board + '/claims', timeout=15))
except Exception as ex: live = {'_error': str(ex)[:80]}
live_all = [{'item': k, 'agent': v.get('a')} for k, v in live.items() if not k.startswith('_')]
live_rows = [r for r in live_all if r['item'] not in done]  # 已完成但锁未释放的不算在做
stale_locks = [r['item'] for r in live_all if r['item'] in done]
# 卡点
bl = []
for ln in open(os.path.join(R, 'docs/status-blockers.md'), encoding='utf-8'):
    m = re.match(r'- \[(.+?)\]\s*(.+?)\s*·\s*(.+)$', ln.strip())
    if m: bl.append({'kind': m.group(1), 'what': m.group(2), 'who': m.group(3)})
pend = [x for x in args.get('--pending', '').split(',') if x]
open_d = [d for d in disp if not d['state'].startswith(('完成', '取消'))]
out = {
  'generated_at': now.strftime('%Y-%m-%dT%H:%M:00+08:00'),
  'headline': {'commits_total': len(commits), 'commits_today': sum(c['at'].startswith(today) for c in commits),
               'files': files, 'items_done': len(done), 'items_total': len(items),
               'workflows_running': len(open_d) + len(live_rows), 'dispatch_open': len(open_d),
               'live_claims': len(live_rows), 'pending_review': len(pend), 'blockers': len(bl),
               'waiting_on_owner': sum(b['who'] == '委托人' for b in bl),
               'decisions': len(decisions)},
  'roles': {'hark-cr': '集成人：审查、合并、派单、共用文件（唯一可合 main）',
            'hark-cs': 'Mac mini M4 + Blender：GPU 审计、渲染、屋面',
            'muse-tibo-cs': '本地 GPU + Blender + Gemini 4：精修、视觉审查（首选重活）',
            'hark-liuzhijie': '云沙盒：S-101、S-251、S-501',
            'hark-fangyi': '云沙盒：S-201、实物记录',
            'hark-darrio': '云沙盒：近景人员与车辆',
            'marvis': 'Windows 真机审查，只接小活',
            'pi-t2 / pi-t3': 'InstaBox 上的 pi，只接小活'},
  'by_agent': [{'agent': k, **v} for k, v in sorted(by.items(), key=lambda x: -x[1]['total'])],
  'recent_commits': commits[:8],
  'dispatches_open': open_d, 'dispatches_done': len(disp) - len(open_d),
  'live_claims': live_rows, 'claimed_items': claimed, 'free_items': free,
  'pending_review': pend, 'stale_locks': stale_locks, 'blockers': bl,
  'links': {'live': 'https://changrong996-droid.github.io/hzwest-atlas/', 'board': board + '/board',
            'repo': 'https://github.com/changrong996-droid/hzwest-atlas'}}
# 流程视图（tools/status/flow.py，hark-cs）：每件活走到哪一站、等谁、等了多久；失败不影响其余字段
try:
    fr = subprocess.run([sys.executable, os.path.join(R, 'tools/status/flow.py'), R, '--ref', 'main'], capture_output=True, text=True, timeout=60)
    out['flow'] = json.loads(fr.stdout)
except Exception as ex:
    out['flow'] = {'_error': str(ex)[:120], 'jobs': [], 'people': [], 'suggestions': []}
json.dump(out, open(os.path.join(R, 'docs/status.json'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps(out['headline'], ensure_ascii=False))
