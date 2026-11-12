#!/usr/bin/env python3
"""Claim lock for CLAIMS.md, run from pre-receive.
usage: claims_gate.py <agent> <base_sha> <new_sha> <lockfile>
Rules: an agent may only change rows it owns or rows that are free ('—'); claiming a free row takes a
first-come lock (visible at GET /claims); max 2 active claims per agent; locks expire after 3 days with
no push from that agent. Exit 1 with a Chinese reason on violation."""
import sys, json, time, subprocess, re, os, fcntl

agent, base, new, lockf = sys.argv[1:5]  # base = main; changes are measured from merge-base
TTL = 3 * 86400
ACTIVE = ('认领', '进行', '待合并')


def show(rev):
    r = subprocess.run(['git', 'show', f'{rev}:CLAIMS.md'], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ''


def rows(text):
    out, sec, hdr = {}, '', None
    for ln in text.splitlines():
        if ln.startswith('## '):
            sec, hdr = ln[3:].strip(), None; continue
        if not ln.startswith('|'):
            continue
        cells = [c.strip() for c in ln.strip().strip('|').split('|')]
        if hdr is None:
            hdr = cells; continue
        if set(''.join(cells)) <= set('-: '):
            continue
        d = dict(zip(hdr, cells))
        out[(sec, cells[0])] = (d, ln.strip())
    return out


def owner(d):
    return d.get('负责人', d.get('提出人', d.get('名字', ''))).strip('` ')


ORDER = ['Windows', 'S-251', '近景', 'Blender', '屋面云纹', '履带吊', '小屏', '公开数据', '难懂字幕', 'GPU', '插件镜头', '实物层']


def free_items():
    taken = {k for k, v in lock.items()} if 'lock' in globals() else set()
    out = []
    for (sec, item), (d, _) in live.items():
        if sec in ('图纸', '横向事项') and owner(d) in ('—', '') and item not in taken:
            out.append(item)
    out.sort(key=lambda x: next((i for i, p in enumerate(ORDER) if x.startswith(p)), 99))
    return out


def _addr():
    """当前主镜像地址：锁文件同目录的 primary.txt 第一段；读不到就写占位。"""
    try: return open(os.path.join(os.path.dirname(os.path.abspath(lockf)), 'primary.txt'), encoding='utf-8').read().split('（')[0].split()[0].rstrip('/')
    except Exception: return '<收件地址>'


def die(msg):
    f = free_items() if 'live' in globals() else []
    tip = ('\n  还空着的（推荐从第一项开始）：' + '、'.join(f) + '\n  任务书在 docs/tasks/，简报 docs/BRIEF.md；实时锁：' + _addr() + '/claims') if f else ''
    print('拒绝（认领规则）：' + msg + tip, file=sys.stderr); sys.exit(1)


mb = subprocess.run(['git', 'merge-base', base, new], capture_output=True, text=True).stdout.strip() or base
old, cur, live = rows(show(mb)), rows(show(new)), rows(show(base))
if old == cur:
    sys.exit(0)

fd = os.open(lockf, os.O_RDWR | os.O_CREAT, 0o644)
fcntl.flock(fd, fcntl.LOCK_EX)
raw = os.read(fd, 1 << 20).decode() or '{}'
lock = json.loads(raw)
now = time.time()
lock = {k: v for k, v in lock.items() if now - v['t'] < TTL}

for key in set(old) | set(cur):
    sec, item = key
    o, n = old.get(key), cur.get(key)
    if o and n and o[1] == n[1]:
        continue
    if sec in ('报名', '接口请求', '退回记录'):
        if o and not n and owner(o[0]) != agent:
            die(f'不能删除别人的行：{sec} / {item}')
        if o and n and owner(o[0]) not in (agent, '', '—'):
            die(f'不能改别人的行：{sec} / {item}')
        continue
    if not n:
        die(f'不能删除认领板的事项行：{item}（改状态即可）')
    if not o:
        continue  # new item row proposed; integrator reviews
    oo, no = owner((live.get(key) or o)[0]), owner(n[0])
    if oo not in ('—', '', agent):
        die(f'「{item}」已由 {oo} 认领，不能改这一行')
    if no not in ('—', '', agent):
        die(f'不能替别人认领「{item}」（负责人只能写你自己：{agent}）')
    k = item
    if no == agent and n[0].get('状态', '') in ACTIVE:
        holder = lock.get(k)
        if holder and holder['a'] != agent:
            die(f'「{item}」已被 {holder["a"]} 先认领（{time.strftime("%m-%d %H:%M", time.gmtime(holder["t"] + 8*3600))} 北京时间），请另选一项')
        mine = [x for x, v in lock.items() if v['a'] == agent and x != k]
        if len(mine) >= 2:
            die(f'你已认领 2 项（{"、".join(mine)}），完成或放回一项后再认领')
        lock[k] = {'a': agent, 't': now}
    elif oo == agent and no in ('—', ''):
        lock.pop(k, None)  # released

# refresh this agent's other locks (activity)
for v in lock.values():
    if v['a'] == agent:
        v['t'] = now
os.lseek(fd, 0, 0); os.ftruncate(fd, 0); os.write(fd, json.dumps(lock, ensure_ascii=False, indent=1).encode())
fcntl.flock(fd, fcntl.LOCK_UN); os.close(fd)
