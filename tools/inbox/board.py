"""Live claim board for the inbox server: GET /board, POST /claim, POST /release.
Shares claims.lock.json (and its flock) with claims_gate.py. Items come from main's CLAIMS.md."""
import json, os, time, fcntl, subprocess, urllib.parse
TTL, MAXN = 3 * 86400, 2
SMALL_ONLY = {'marvis': 1, 'pi-t2': 1, 'pi-t3': 1}  # 只接备注含「小活」的事项，最多 1 项（委托人 2026-11-08）
ORDER = ['Windows', 'S-251', '近景', 'Blender 参考', 'Blender 终版', '屋面云纹', '履带吊', '小屏', '公开数据', '难懂字幕', 'GPU', '插件镜头', '实物层']


def _items(root):
    t = subprocess.run(['git', '-C', os.path.join(root, 'hzwest-atlas.git'), 'show', 'main:CLAIMS.md'],
                       capture_output=True, text=True).stdout
    out, sec, hdr = [], '', None
    for ln in t.splitlines():
        if ln.startswith('## '):
            sec, hdr = ln[3:].strip(), None; continue
        if not ln.startswith('|') or not (sec.startswith('图纸') or sec.startswith('横向')):
            continue
        c = [x.strip() for x in ln.strip().strip('|').split('|')]
        if hdr is None:
            hdr = c; continue
        if set(''.join(c)) <= set('-: '):
            continue
        d = dict(zip(hdr, c))
        out.append({'item': c[0], 'owner': d.get('负责人', '—').strip('` '), 'state': d.get('状态', ''), 'note': d.get('备注', '')})
    return out


def _local(root):
    t = subprocess.run(['git', '-C', os.path.join(root, 'hzwest-atlas.git'), 'show', 'main:AGENTS.md'], capture_output=True, text=True).stdout
    sec = t.split('### 1.1', 1)[-1].split('##', 1)[0] if '### 1.1' in t else ''
    out = set()
    for ln in sec.splitlines():
        c = [x.strip().strip('`') for x in ln.strip().strip('|').split('|')]
        if len(c) >= 3 and c[2].startswith('有'):
            out.add(c[0])
    return out


def _agents(root):
    try:
        return {l.strip() for l in open(os.path.join(root, 'agents.txt')) if l.strip()}
    except OSError:
        return set()


def _bj(t):
    return time.strftime('%m-%d %H:%M', time.gmtime(t + 8 * 3600))


def _git(root, *a):
    return subprocess.run(['git', '-C', os.path.join(root, 'hzwest-atlas.git')] + list(a), capture_output=True, text=True).stdout


def _requests(root, a):
    t = _git(root, 'show', 'main:CLAIMS.md'); sec = ''; out = []
    for ln in t.splitlines():
        if ln.startswith('## '):
            sec = ln[3:].strip(); continue
        if sec.startswith('接口请求') and ln.startswith('|') and f'| {a} |' in ln:
            c = [x.strip() for x in ln.strip().strip('|').split('|')]
            out.append((c[2][:60], c[-1] if len(c) >= 5 and c[-1] else '（未回复）'))
    return out


def _age(root, needle):
    t = _git(root, 'log', 'main', '--reverse', '--format=%ct', '-S', needle, '--', 'CLAIMS.md').split()
    return time.time() - int(t[0]) if t else 0


def _done_on_branch(root, a, did):
    return bool(_git(root, 'log', '--format=%s', '--grep', f'[{did}]', '--fixed-strings', f'--glob=refs/heads/agent/{a}/*').strip())


def _orders(root, a):
    """派单 + 超时提醒（借 relay nudge）：待做 >24 h 且你的分支里没有 [D-xx] 提交 → 标 ⚠；>48 h 集成人改派。"""
    t = _git(root, 'show', 'main:CLAIMS.md'); sec = ''; out = []
    for ln in t.splitlines():
        if ln.startswith('## '):
            sec = ln[3:].strip(); continue
        if sec.startswith('派单') and ln.startswith('|'):
            c = [x.strip() for x in ln.strip().strip('|').split('|')]
            if len(c) >= 5 and c[0].startswith('D-') and (a in [x.strip() for x in c[1].replace('，', '、').split('、')] or c[1] == '全体') and c[4] not in ('完成', '撤回'):
                h = _age(root, f'| {c[0]} |') / 3600; sent = _done_on_branch(root, a, c[0])
                tag = '已推送，待合并' if sent else ('⚠ 已等 %d 小时，请先做或在该行写原因（48 小时改派）' % h if h > 24 else '已等 %d 小时' % h)
                out.append(f'  {c[0]} · {c[2]} · {c[3]} · {tag}')
    return out


def _bounced(root, a, since):
    t = _git(root, 'show', 'main:CLAIMS.md'); sec = ''; out = []
    for ln in t.splitlines():
        if ln.startswith('## '):
            sec = ln[3:].strip(); continue
        if sec.startswith('退回') and ln.startswith('|') and f'| {a} |' in ln:
            c = [x.strip() for x in ln.strip().strip('|').split('|')]
            out.append('  ' + ' · '.join(c[1:])[:120])
    return out[-3:]


def agent_view(root, a, items, lock, now):
    vf = os.path.join(root, 'visits.json')
    try: vis = json.load(open(vf))
    except Exception: vis = {}
    last = vis.get(a, now - 86400)
    L = [f'{a} 的进门画面（{_bj(now)} 北京时间；上次来：{_bj(last)}）', '']
    mine = [f'  {k} · 锁到 {_bj(v["t"] + TTL)}' for k, v in lock.items() if v['a'] == a]
    mine += [f'  {i["item"]} · {i["state"]}' for i in items if i['owner'] == a and i['item'] not in lock and i['state'] not in ('完成',)]
    od = _orders(root, a); bo = _bounced(root, a, last)
    L += ['谁在等你 · 派给你的单（集成人按合并情况下发，先做；提交写 [D-xx]）：'] + (od or ['  （无）']) + ['']
    if bo: L += ['谁在等你 · 你被退回的（改完重推）：'] + bo + ['']
    L += ['你手上的事项：'] + (mine or ['  （无）'])
    merged = set(_git(root, 'branch', '--format=%(refname:short)', '--merged', 'main').split())
    br = [b for b in _git(root, 'for-each-ref', '--format=%(refname:short)', f'refs/heads/agent/{a}/').split() if not b.endswith('/join')]
    L += ['', '你的分支：'] + ([f'  {b} · {"已合入 main" if b in merged else "待合并"}' for b in br] or ['  （无）'])
    rq = _requests(root, a)
    L += ['', '你的接口请求：'] + ([f'  {q} → {r}' for q, r in rq] or ['  （无）'])
    since = time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime(last))
    ch = _git(root, 'log', 'main', f'--since={since}', '--format=  %h %s', '--', 'AGENTS.md', 'docs/BRIEF.md', 'docs/tasks', 'docs/review', 'docs/hz-atlas-check.md').strip()
    L += ['', '上次来之后规矩/任务书/审查的变化（git pull 后细读）：', ch or '  （无）']
    vis[a] = now
    try: json.dump(vis, open(vf, 'w'))
    except OSError: pass
    return '\n'.join(L) + '\n\n'


def handle(root, path, query):
    q = {k: v[0] for k, v in urllib.parse.parse_qs(query).items()}
    lf = os.path.join(root, 'claims.lock.json')
    fd = os.open(lf, os.O_RDWR | os.O_CREAT, 0o644)
    fcntl.flock(fd, fcntl.LOCK_EX)
    try:
        lock = json.loads(os.read(fd, 1 << 20).decode() or '{}')
        now = time.time()
        lock = {k: v for k, v in lock.items() if now - v['t'] < TTL}
        items = _items(root)
        names = [i['item'] for i in items]
        msg, code = '', 200
        if path in ('/claim', '/release'):
            a, want = q.get('agent', ''), q.get('item', '')
            hit = [n for n in names if n == want] or [n for n in names if n.startswith(want)] if want else []
            if a not in _agents(root):
                msg, code = f'拒绝：{a or "（缺 agent=）"} 不在名册，先报名（AGENTS.md 6B）', 403
            elif len(hit) != 1:
                msg, code = f'拒绝：找不到唯一事项「{want}」，用下表的事项名（前缀即可，如 S-401）', 404
            else:
                k = hit[0]; row = next(i for i in items if i['item'] == k)
                h = lock.get(k)
                if path == '/claim':
                    if row['owner'] not in ('—', '', a) or row['state'] in ('保留', '完成'):
                        msg, code = f'拒绝：「{k}」{row["state"] or "已有负责人"}（{row["owner"]}）', 409
                    elif '需本地' in row.get('note', '') and a not in _local(root):
                        msg, code = f'拒绝：此项需本地 Blender，先在 AGENTS.md 1.1 自报本地能力', 409
                    elif a in SMALL_ONLY and '小活' not in row.get('note', ''):
                        msg, code = f'拒绝：{a} 目前只接备注标「小活」的事项', 409
                    elif a in SMALL_ONLY and not h and sum(v['a'] == a for v in lock.values()) >= SMALL_ONLY[a]:
                        msg, code = f'拒绝：{a} 同时最多 {SMALL_ONLY[a]} 项，先完成或 release', 409
                    elif h and h['a'] != a:
                        msg, code = f'拒绝：「{k}」已被 {h["a"]} 于 {_bj(h["t"])} 认领', 409
                    elif not h and sum(v['a'] == a for v in lock.values()) >= MAXN:
                        msg, code = f'拒绝：你已认领 {MAXN} 项，先完成或 release 一项', 409
                    else:
                        lock[k] = {'a': a, 't': h['t'] if h else now}
                        msg = f'成功：「{k}」归 {a}（锁 3 天，任何推送自动续期）。任务书 docs/tasks/，开工前读 docs/BRIEF.md'
                else:
                    if h and h['a'] == a:
                        lock.pop(k); msg = f'已放回：「{k}」'
                    else:
                        msg, code = f'拒绝：「{k}」不在你名下', 409
                os.lseek(fd, 0, 0); os.ftruncate(fd, 0)
                os.write(fd, json.dumps(lock, ensure_ascii=False, indent=1).encode())
        rows = []
        for i in sorted(items, key=lambda i: next((n for n, p in enumerate(ORDER) if i['item'].startswith(p)), 99)):
            h = lock.get(i['item'])
            if h:
                st = f'已认领 · {h["a"]} · {_bj(h["t"])}'
            elif i['owner'] not in ('—', ''):
                st = f'{i["state"]} · {i["owner"]}'
            else:
                st = '空 ← 可认领'
            rows.append(f'{i["item"]:<14}  {st}')
        free = [i['item'] for i in items if i['item'] not in lock and i['owner'] in ('—', '')]
        head = agent_view(root, q['agent'], items, lock, now) if path == '/board' and q.get('agent') in _agents(root) else ''
        body = (msg + '\n\n' if msg else '') + head + f'认领板（实时，{_bj(now)} 北京时间）\n' + '\n'.join(rows) + \
            ('\n\n推荐下一项：' + sorted(free, key=lambda x: next((n for n, p in enumerate(ORDER) if x.startswith(p)), 99))[0] if free else '\n\n全部已认领') + \
            '\n\n认领：curl -X POST "<收件地址>/claim?agent=<名字>&item=S-401"\n放回：curl -X POST "<收件地址>/release?agent=<名字>&item=S-401"\n'
        return code, body
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN); os.close(fd)
