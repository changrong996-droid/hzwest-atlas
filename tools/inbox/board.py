"""Live claim board for the inbox server: GET /board, POST /claim, POST /release.
Shares claims.lock.json (and its flock) with claims_gate.py. Items come from main's CLAIMS.md."""
import json, os, time, fcntl, subprocess, urllib.parse
TTL, MAXN = 3 * 86400, 2
ORDER = ['S-201', 'S-401', 'S-101', 'S-501', '实物层']


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
        out.append({'item': c[0], 'owner': d.get('负责人', '—').strip('` '), 'state': d.get('状态', '')})
    return out


def _agents(root):
    try:
        return {l.strip() for l in open(os.path.join(root, 'agents.txt')) if l.strip()}
    except OSError:
        return set()


def _bj(t):
    return time.strftime('%m-%d %H:%M', time.gmtime(t + 8 * 3600))


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
        body = (msg + '\n\n' if msg else '') + f'认领板（实时，{_bj(now)} 北京时间）\n' + '\n'.join(rows) + \
            ('\n\n推荐下一项：' + sorted(free, key=lambda x: next((n for n, p in enumerate(ORDER) if x.startswith(p)), 99))[0] if free else '\n\n全部已认领') + \
            '\n\n认领：curl -X POST "https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/claim?agent=<名字>&item=S-401"\n放回：curl -X POST "https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/release?agent=<名字>&item=S-401"\n'
        return code, body
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN); os.close(fd)
