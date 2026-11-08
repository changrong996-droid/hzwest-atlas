#!/usr/bin/env python3
"""推导「每件活走到哪一站」：派出 → 开工 → 交付 → 合入 → 关单，外加退回、等谁、等了多久。
只读 git 与 CLAIMS.md，不联网。输出 JSON（给 web/status.html 的 flow 字段用）。
用法：python3 tools/status/flow.py [仓库路径] [--ref origin/main] > flow.json
作者 hark-cs（提案 docs/proposals/hark-cs-status-ui-notes.md）；11-08 由 hark-cr 移到 tools/status/，tools/status/gen.py 调用它，结果放进 docs/status.json 的 "flow" 字段。"""
import json, re, subprocess, sys, time, os, datetime

R = next((a for a in sys.argv[1:] if not a.startswith('--') and os.path.isdir(a)), '.')
REF = sys.argv[sys.argv.index('--ref') + 1] if '--ref' in sys.argv else 'origin/main'
g = lambda *a: subprocess.run(['git', '-C', R, *a], capture_output=True, text=True).stdout
NOW = int(time.time())
AMBER, RED = 2 * 3600, 4 * 3600          # 2 小时提醒，4 小时算卡住（与超时提醒同口径）
HUB = 'hark-cr'

def table(text, sec):
    s = text.split('## ' + sec, 1)
    if len(s) < 2: return []
    out = []
    for ln in s[1].split('\n## ', 1)[0].splitlines():
        if ln.startswith('|') and not ln.startswith('|---'):
            out.append([x.strip() for x in ln.strip().strip('|').split('|')])
    return out[1:]

claims = g('show', f'{REF}:CLAIMS.md')
roles = {}
# 所有提交（含各分支），按 Agent: 尾注归人
commits = []
for e in g('log', '--all', '--no-merges', '--format=%H%x1f%ct%x1f%s%x1f%B%x1e').split('\x1e'):
    p = e.strip().split('\x1f')
    if len(p) < 4: continue
    m = re.search(r'^Agent:\s*(\S+)', p[3], re.M)
    a = (m.group(1) if m else '').replace('hark-marvis-cs', 'marvis')
    commits.append({'h': p[0], 't': int(p[1]), 's': p[2], 'a': a})
# 提交 → 合入时间（主线上的 merge 提交）
merged_at = {}
for e in g('log', REF, '--first-parent', '--format=%H %ct %P').splitlines():
    h, t, *par = e.split()
    if len(par) >= 2:
        for c in g('rev-list', f'{par[0]}..{par[1]}').split(): merged_at.setdefault(c, int(t))
    else: merged_at.setdefault(h, int(t))     # 直接提交到主线
# 分支 → 提交
branch_of = {}
for b in g('branch', '-r', '--format=%(refname:short)').split():
    if '/agent/' not in '/' + b: continue
    for c in g('log', '--format=%H', f'{REF}..{b}' if b != REF else b, '-60').split() or g('log', '--format=%H', b, '-1').split(): branch_of.setdefault(c, []).append(b.split('/', 1)[1])
returns = table(claims, '退回记录')

def first_add(pat):
    ts = g('log', REF, '--format=%ct', '-S', pat, '--', 'CLAIMS.md').split()
    return int(ts[-1]) if ts else None
def first_match(regex):
    ts = g('log', REF, '--format=%ct', '-G', regex, '--', 'CLAIMS.md').split()
    return int(ts[-1]) if ts else None

jobs = []
def add(jid, title, who, kind, status, slug=None):
    keys = [jid] + ([] if jid.startswith('D-') else [re.sub(r'（.*', '', title)]) + ([slug, slug.split('-')[0] + '-'] if slug else [])
    m0 = re.match(r'S-\d+', title)
    if m0 and not jid.startswith('D-'): keys.append(m0.group(0))
    mine = [c for c in commits if c['a'] in who and (
        any(k and (k in c['s'] or any(k in b for b in branch_of.get(c['h'], []))) for k in keys))]
    mine.sort(key=lambda c: c['t'])
    t0 = first_add(f'| {jid} |') if jid.startswith('D-') else first_add(f'| {title} |')
    st = {'派出': t0}
    if mine:
        st['开工'] = mine[0]['t']; st['交付'] = mine[-1]['t']
        m = [merged_at[c['h']] for c in mine if c['h'] in merged_at]
        if m and len(m) == len(mine): st['合入'] = max(m)
    done = status.startswith('完成')
    if done:
        st['关单'] = first_match(rf'^\| {re.escape(jid if jid.startswith("D-") else title)} \|.*\| 完成') or st.get('合入') or st.get('交付')
    brs = sorted({b for c in mine for b in branch_of.get(c['h'], [])})
    ret = any(any(b in r[1] for b in brs) or jid in ' '.join(r) for r in returns if len(r) > 1) and '合入' not in st and not done
    order = ['派出', '开工', '交付', '合入', '关单']
    stage = max([i for i, k in enumerate(order) if st.get(k)] or [0])
    if done: wait = None
    elif '合入' in st: wait = {'who': HUB, 'what': '合入了，等关单', 'since': st['合入']}
    elif ret: wait = {'who': '、'.join(who), 'what': '被退回，等修改', 'since': st.get('交付')}
    elif '交付' in st: wait = {'who': HUB, 'what': '交了，等审查合入', 'since': st['交付']}
    else: wait = {'who': '、'.join(who), 'what': '还没开工', 'since': t0}
    if wait and wait['since']:
        age = NOW - wait['since']; wait['age_min'] = age // 60
        wait['level'] = 'red' if age >= RED else 'amber' if age >= AMBER else 'ok'
    jobs.append({'id': jid, 'title': title, 'who': who, 'kind': kind, 'status': status,
                 'stage': stage, 'stages': {k: v for k, v in st.items() if v}, 'returned': ret,
                 'branches': brs[-3:], 'commits': len(mine), 'wait': wait, 'done': done})

seen = set()
for r in table(claims, '派单'):
    if not r or not r[0].startswith('D-') or len(r) < 5: continue
    who = [x.strip() for x in re.split('[、,]', r[1]) if x.strip()]
    if who == ['全体']: continue
    add(r[0], r[2], who, '派单', r[4]); seen.add(r[2])
for sec in ('图纸', '横向事项'):
    for r in table(claims, sec):
        if len(r) < 4 or r[3] not in ('认领', '完成') or r[2] in ('', '—', HUB) or r[0] in seen: continue
        m = re.search(r'docs/tasks/([\w.-]+)\.md', r[1])
        add(r[0], r[0], [r[2]], '认领', r[3], m.group(1) if m else None)

# 人
last = {}
for c in commits:
    if c['a']: last[c['a']] = max(last.get(c['a'], 0), c['t'])
people = {}
for j in jobs:
    for w in j['who']:
        p = people.setdefault(w, {'name': w, 'active': [], 'done_today': 0})
        if j['done']:
            if NOW - (j['stages'].get('关单') or 0) < 86400: p['done_today'] += 1
        else: p['active'].append(j['id'])
for w in last: people.setdefault(w, {'name': w, 'active': [], 'done_today': 0})
for p in people.values():
    p['last_at'] = last.get(p['name']); idle = NOW - p['last_at'] if p['last_at'] else None
    n = len(p['active'])
    p['state'] = ('overload' if n >= 3 else 'stopped' if n and (idle is None or idle >= AMBER)
                  else 'working' if n else 'idle')
    p['idle_min'] = idle // 60 if idle is not None else None

# 建议：活太多的人，把还没开工的分出去
sug = []
J = {j['id']: j for j in jobs}
free = [p for p in people.values() if p['state'] == 'idle' and p['name'] != HUB]
for p in people.values():
    if p['state'] != 'overload': continue
    waiting = [J[i] for i in p['active'] if J[i]['stage'] == 0][1:]
    for j in waiting:
        sug.append({'job': j['id'], 'from': p['name'], 'to': [f['name'] for f in free][:3],
                    'why': f"{p['name']} 手上 {len(p['active'])} 件，这件还没开工"})
print(json.dumps({'generated_at': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec='seconds'),
                  'people': sorted(people.values(), key=lambda p: p['name']), 'jobs': jobs, 'suggestions': sug},
                 ensure_ascii=False, indent=1))
