#!/usr/bin/env python3
"""收件多镜像轮值（AGENTS.md 6B）。在集成人沙盒里跑，需 instabox 凭据；不放任何密钥到机器上。
  python3 tools/inbox/mirror.py url       打印当前主镜像 URL（collect.sh 用）
  python3 tools/inbox/mirror.py vm        打印当前主镜像机器名
  python3 tools/inbox/mirror.py rotate    按轮值表切换主镜像（到点、或当前主镜像进冷却时）：
                                          新主镜像从 GitHub 同步 main、从所有在跑的镜像补 agent/* 分支、合并认领锁，
                                          再把 primary.txt 写到新主镜像与其它在跑的镜像
  python3 tools/inbox/mirror.py status    各镜像状态、已跑时长、冷却
轮值见 SHIFTS：两台每 80 分钟交替，交接后立刻挂起下班的机器。
"""
import json, os, sys, time, datetime, subprocess
sys.path.insert(0, '/workspace/work/ibx'); import ibx
D = '/data/workspace/inbox'
STATE = '/workspace/work/inbox/primary.json'
# 镜像机器：(机器名, 机器 id)。顺序 = 替补顺序。test-1 只做最后替补（别的项目也在用它，运行时长不归我们管）
MIRRORS = [('test-5', 'm_agqw7hn5d3p3sl4cbll4o2rf5e'),   # maxRunMinutes 480
           ('test-4', 'm_agqw5j356gn4k75di4h3ixq2ki'),   # maxRunMinutes 120（免费机由平台管，改不了）
           ('test-1', 'm_agqw476xysfznjvxms7h7jpmse')]   # maxRunMinutes 360
# 轮值表（北京时间）：两台每 80 分钟交替一次（委托人 11-11 15:43：单台短开、轮换冷却）。
# 80 分钟卡在 collect 每 20 分钟一轮的整点上，低于 test-4 的 120 分钟上限；交接后立刻挂起下班的机器，运行时长清零
SHIFTS = [(f'{(480 + 80 * k) // 60:02d}:{(480 + 80 * k) % 60:02d}', ('test-5', 'test-4')[k % 2]) for k in range(12)]
URL = lambda mid: f'https://8090-{mid[2:]}.instabox.tech'
BJ = datetime.timezone(datetime.timedelta(hours=8))

def now_bj(): return datetime.datetime.now(BJ)
def info(mid):
    c, d = ibx.req('GET', f'/v1/machines/{mid}'); return d if c == 200 else {}
def has_port(mid):
    c, d = ibx.req('GET', f'/v1/machines/{mid}/ports')
    return c == 200 and any(x.get('port') == 8090 and x.get('name') == 'hzinbox' for x in d.get('ports', []))
def _t(v):
    if not v: return None
    for f in (lambda x: datetime.datetime.fromisoformat(x.replace('Z', '+00:00')),
              lambda x: datetime.datetime.strptime(x.split(' (')[0].replace(' CST', ''), '%a %Y-%m-%d %I:%M %p').replace(tzinfo=BJ)):
        try: return f(v)
        except Exception: pass
    return None
def cooling(d):
    t = _t(d.get('cooldownUntil')); return bool(t and t > now_bj())
def usable(d):
    """没在冷却，且（在跑时）离运行上限还有 25 分钟以上"""
    if not d or cooling(d): return False
    if d.get('state') == 'running':
        t = _t(d.get('runStartedAt'))
        if t and (now_bj() - t).total_seconds() / 60 > (d.get('maxRunMinutes') or 120) - 25: return False
    return True
def load():
    try: return json.load(open(STATE))
    except Exception: return {'vm': 'test-5', 'mid': MIRRORS[0][1], 'url': URL(MIRRORS[0][1]), 'since': ''}
def sh(mid, cmd, t=180):
    c, d = ibx.ex(mid, cmd, t); return d.get('stdout', '') + d.get('stderr', '') if isinstance(d, dict) else f'{c} {d}'

def scheduled():
    hm = now_bj().strftime('%H:%M')
    if hm < SHIFTS[0][0] or hm >= '23:00': return None
    name = [n for t, n in SHIFTS if t <= hm][-1]
    return next(i for i, m in enumerate(MIRRORS) if m[0] == name)

def rotate(force=False):
    st = load(); cur = next((i for i, m in enumerate(MIRRORS) if m[0] == st['vm']), 0)
    want = scheduled()
    if want is None: print('KEEP', st['vm'], '(非工作时段，不唤醒)'); return
    order = [want] + [i for i in range(len(MIRRORS)) if i != want]
    if cur in order[1:] and usable(info(MIRRORS[cur][1])): order.remove(cur); order.insert(1, cur)   # 排班机不可用时，先留在当前机，少折腾
    tgt = None
    for i in order:
        if has_port(MIRRORS[i][1]) and usable(info(MIRRORS[i][1])): tgt = i; break
    if tgt is None: print('NO-MIRROR 全部冷却'); sys.exit(2)
    if tgt == cur and not force: print('KEEP', st['vm']); return
    name, mid = MIRRORS[tgt][0], MIRRORS[tgt][1]
    d = info(mid)
    if d.get('state') != 'running':
        ibx.req('POST', f'/v1/machines/{mid}/resume', {}, headers={'Idempotency-Key': os.urandom(8).hex()}); time.sleep(25)
    # 接班前按仓库里的版本重装收件服务、钩子与名册（幂等），保证各镜像同一套规矩
    subprocess.run(['bash', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mirror_setup.sh'), name], capture_output=True, timeout=300)
    running = [m for m in MIRRORS if m[1] != mid and has_port(m[1]) and info(m[1]).get('state') == 'running']
    peers = ' '.join(URL(m[1]) + '/hzwest-atlas.git' for m in running)
    out = sh(mid, f"""cd {D} && git -C hzwest-atlas.git fetch -q https://github.com/changrong996-droid/hzwest-atlas.git +main:main
for p in {peers}; do git -C hzwest-atlas.git fetch -q "$p" 'refs/heads/agent/*:refs/heads/agent/*' 2>/dev/null || echo "PEER-SKIP $p"; done
sudo systemctl is-active hzinbox""", 240)
    # 认领锁合并：取所有在跑镜像与新主镜像的并集，同一事项留最早的
    lock = {}
    for m in running + [MIRRORS[tgt]]:
        try: L = json.loads(sh(m[1], f'cat {D}/claims.lock.json 2>/dev/null', 60).strip() or '{}')
        except Exception: L = {}
        for k, v in (L or {}).items():
            if isinstance(v, dict) and 'a' in v and (k not in lock or v['t'] < lock[k]['t']): lock[k] = v
    tmp = '/tmp/claims.lock.json'; json.dump(lock, open(tmp, 'w'), ensure_ascii=False, indent=1)
    ibx.req('PUT', f'/v1/machines/{mid}/files?path={D}/claims.lock.json&parents=true', raw=open(tmp, 'rb').read())
    url = URL(mid); stamp = now_bj().strftime('%m-%d %H:%M')
    open('/tmp/primary.txt', 'w').write(f'{url}（{name}，{stamp} 起）\n')
    for m in running + [MIRRORS[tgt]]:
        ibx.req('PUT', f'/v1/machines/{m[1]}/files?path={D}/primary.txt&parents=true', raw=open('/tmp/primary.txt', 'rb').read())
    json.dump({'vm': name, 'mid': mid, 'url': url, 'since': stamp}, open(STATE, 'w'))
    # 下班的旧主镜像立刻挂起（不等 30 分钟闲置），免得拖着跑满上限进冷却；有人推它会自动唤醒
    old = MIRRORS[cur][1]
    if old != mid and info(old).get('state') == 'running':
        ibx.req('POST', f'/v1/machines/{old}/suspend', {}, headers={'Idempotency-Key': os.urandom(8).hex()})
    print('SWITCH', st['vm'], '->', name, url, '| locks', len(lock), '|', out.strip().replace('\n', ' '))

def status():
    st = load(); print('primary', st)
    for m in MIRRORS:
        d = info(m[1]); rs = d.get('runStartedAt') or ''
        print(f"{m[0]:7} {d.get('state', '?'):10} 可用 {usable(d)!s:5} max {d.get('maxRunMinutes')} 起跑 {rs} 冷却到 {d.get('cooldownUntil')}")

if __name__ == '__main__':
    a = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if a == 'url': print(load()['url'])
    elif a == 'vm': print(load()['vm'])
    elif a == 'rotate': rotate('--force' in sys.argv)
    else: status()
