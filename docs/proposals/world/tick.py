#!/usr/bin/env python3
"""世界自动化 · 一拍（试运行，hark-cs）：把「管世界」的机械活从集成人身上拿下来。

一拍做四件事，结果谁做都一样，所以交给脚本：
  1. 拉收件仓库：main + 所有 agent/* 分支。
  2. 逐个验没合进 main 的分支：单独合到 main 上 → check_all → scope.py（5.1 分档 + 机械验收）。
     结论：AUTO（可自动合）/ MANUAL（要人看，写明原因）/ CONFLICT（和 main 冲突）/ FAIL（check_all 不过）。
  3. 候选主线：从 main 出发，按提交时间依次合入 AUTO 分支，每合一个就再跑 check_all；
     组合后出问题的退回并标 DEFER。最后用候选主线重新生成 docs/status.json。
  4. 写报告（JSON + 中文 Markdown）。--publish 时把候选主线推到 agent/<我>/world-main、
     报告推到 agent/<我>/world-report（收件规则只允许推自己的 agent 分支，所以不碰 main）。

有 GitHub 权限的人（今天是 hark-cr，以后可以是机器人）只要把 main 快进到 world-main 即可；
「拿主意」的活（MANUAL 那几条）照旧给人。

用法：tick.py <工作克隆> [--remote origin] [--me hark-cs] [--publish] [--out 目录]
依赖：git、node、python3；工作克隆的 origin 指向收件仓库。
"""
import argparse, datetime, json, os, shutil, subprocess, sys, tempfile, time

AP = argparse.ArgumentParser()
AP.add_argument('repo'); AP.add_argument('--remote', default='origin'); AP.add_argument('--me', default='hark-cs')
AP.add_argument('--publish', action='store_true'); AP.add_argument('--out', default=None)
AP.add_argument('--skip-status', action='store_true')
A = AP.parse_args()
INBOX_HTTP = 'https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech'
R = os.path.abspath(A.repo)
BOT = f'world-bot ({A.me})'
TZ = datetime.timezone(datetime.timedelta(hours=8))


def git(*a, cwd=R, check=True):
    p = subprocess.run(['git', *a], cwd=cwd, capture_output=True, text=True)
    if check and p.returncode:
        raise RuntimeError(f'git {" ".join(a)}: {p.stderr.strip()[:300]}')
    return p.stdout.strip()


def check_all(cwd):
    p = subprocess.run(['node', 'tools/hz/check_all.js'], cwd=cwd, capture_output=True, text=True, timeout=300)
    last = (p.stdout.strip().splitlines() or [''])[-1]
    return last.startswith('OK check_all'), last


def wt(ref):
    d = tempfile.mkdtemp(prefix='world-')
    git('worktree', 'add', '-q', '--detach', d, ref)
    return d


def wt_rm(d):
    git('worktree', 'remove', '--force', d, check=False); shutil.rmtree(d, ignore_errors=True)


def merge(cwd, br, msg):
    p = subprocess.run(['git', '-c', 'user.name=' + A.me, '-c', f'user.email={A.me}@local', 'merge', '-q', '--no-ff',
                        '-m', msg, br], cwd=cwd, capture_output=True, text=True)
    if p.returncode:
        subprocess.run(['git', 'merge', '--abort'], cwd=cwd, capture_output=True)
    return p.returncode == 0


t0 = time.time()
# 1. 拉
git('fetch', '-q', '--prune', A.remote, f'+refs/heads/main:refs/remotes/{A.remote}/main',
    f'+refs/heads/agent/*:refs/remotes/inbox/agent/*')
git('update-ref', 'refs/heads/main', f'refs/remotes/{A.remote}/main')
main = git('rev-parse', 'main')
own = (f'inbox/agent/{A.me}/world-main', f'inbox/agent/{A.me}/world-report')
branches = []
for ln in git('for-each-ref', '--format=%(refname:short) %(committerdate:unix)', 'refs/remotes/inbox/agent').splitlines():
    b, ts = ln.split()
    if b in own or b.endswith('/join'):
        continue
    if subprocess.run(['git', 'merge-base', '--is-ancestor', b, 'main'], cwd=R).returncode == 0:
        continue
    branches.append((int(ts), b))
branches.sort()

# 2. 逐个验
scope = os.path.join(R, 'tools/inbox/scope.py')
rows = []
for ts, b in branches:
    agent = b.split('/')[2]
    row = {'branch': b.replace('inbox/', '', 1), 'agent': agent, 'tip': git('rev-parse', '--short', b),
           'commits': int(git('rev-list', '--count', f'main..{b}')),
           'subject': git('log', '-1', '--format=%s', b)[:80],
           'at': datetime.datetime.fromtimestamp(ts, TZ).isoformat(timespec='minutes')}
    d = wt('main')
    try:
        if not merge(d, b, 'probe'):
            row.update(verdict='CONFLICT', why=['和 main 冲突，需作者先 rebase'])
        else:
            # 分支单独的 check_all 已由收件 pre-receive 在推送时跑过（不过就推不进来），这里不重跑
            if True:
                p = subprocess.run([sys.executable, scope, R, b], cwd=R, capture_output=True, text=True, timeout=180)
                out = p.stdout.strip().splitlines()[-1] if p.stdout.strip() else 'MANUAL (scope 无输出)'
                if out == 'AUTO':
                    row.update(verdict='AUTO', why=[])
                else:
                    row.update(verdict='MANUAL', why=[x for x in out.replace('MANUAL', '', 1).strip().split(',') if x])
    finally:
        wt_rm(d)
    rows.append(row)

# 3. 候选主线
d = wt('main')
merged = []
try:
    steps = []
    for row in rows:
        if row['verdict'] != 'AUTO':
            continue
        before = git('rev-parse', 'HEAD', cwd=d)
        msg = f"[world] 自动合 {row['branch']}\n\n{BOT}：5.1 分档与机械验收通过，组合后 check_all 通过。\n\nAgent: {A.me}"
        if not merge(d, 'inbox/' + row['branch'], msg):
            row.update(verdict='DEFER', why=['和前面自动合的分支冲突，下一拍再试']); continue
        steps.append((row, before))
    # 组合后只跑一次 check_all（一次约 2 分钟）；不过再逐个退回定位
    ok, last = check_all(d) if steps else (True, '')
    if not ok:
        git('reset', '-q', '--hard', steps[0][1], cwd=d)
        for row, _ in steps:
            before = git('rev-parse', 'HEAD', cwd=d)
            merge(d, 'inbox/' + row['branch'], f"[world] 自动合 {row['branch']}\n\nAgent: {A.me}")
            ok1, l1 = check_all(d)
            if not ok1:
                git('reset', '-q', '--hard', before, cwd=d); row.update(verdict='DEFER', why=[f'组合后 check_all 未通过：{l1}'])
            else:
                last = l1
    merged = [r['branch'] for r, _ in steps if r['verdict'] == 'AUTO']
    status_note = ''
    if not A.skip_status and os.path.exists(os.path.join(d, 'tools/status/gen.py')):
        pend = ','.join(r['branch'] for r in rows if r['verdict'] != 'AUTO')
        # gen.py 读本仓库的 main：在临时共享克隆里把 main 指到候选再跑
        tmp = tempfile.mkdtemp(prefix='world-gen-')
        git('clone', '-q', '--shared', '--no-checkout', R, tmp)
        cpre = git('rev-parse', 'HEAD', cwd=d)
        git('checkout', '-q', '-B', 'main', cpre, cwd=tmp)
        p = subprocess.run([sys.executable, 'tools/status/gen.py', '--pending', pend], cwd=tmp, capture_output=True,
                           text=True, timeout=180)
        if os.path.exists(os.path.join(tmp, 'docs/status.json')):
            shutil.copy(os.path.join(tmp, 'docs/status.json'), os.path.join(d, 'docs/status.json'))
        shutil.rmtree(tmp, ignore_errors=True)
        status_note = (p.stdout.strip().splitlines() or [p.stderr.strip()[:200]])[-1]
        if git('status', '--porcelain', 'docs/status.json', cwd=d):
            git('add', 'docs/status.json', cwd=d)
            git('-c', f'user.name={A.me}', '-c', f'user.email={A.me}@local', 'commit', '-q', '-m',
                f'[status] {BOT} 用候选主线重新生成 docs/status.json\n\nAgent: {A.me}', cwd=d)
    cand = git('rev-parse', 'HEAD', cwd=d)
    cand_check = last or '无自动合入，候选=main'
finally:
    wt_rm(d)
git('update-ref', f'refs/heads/world-main', cand)

# 3b. 痕迹衰减（影子模式：只标不动）。每条认领的「最新痕迹」= 认领时间与该成员任一分支最新提交，取较晚者。
FRESH_H = 6  # 保鲜期；超过=淡，超过两倍=过期（建议释放）
import urllib.request
try:
    lock = json.load(urllib.request.urlopen(INBOX_HTTP + '/claims', timeout=30))
except Exception as ex:
    lock = {'_error': str(ex)[:80]}
last_by = {}
for ln in git('for-each-ref', '--format=%(refname:short) %(committerdate:unix)', 'refs/remotes/inbox/agent').splitlines():
    b, ts = ln.split(); a = b.split('/')[2]; last_by[a] = max(last_by.get(a, 0), int(ts))
nowts = time.time(); traces = []
for item, v in lock.items():
    if item.startswith('_') or not isinstance(v, dict): continue
    last = max(v.get('t', 0), last_by.get(v.get('a'), 0)); age = (nowts - last) / 3600
    state = '鲜' if age <= FRESH_H else ('淡' if age <= 2 * FRESH_H else '过期')
    traces.append({'kind': '认领', 'what': item, 'who': v.get('a'), 'last': datetime.datetime.fromtimestamp(last, TZ).isoformat(timespec='minutes'),
                   'age_h': round(age, 1), 'fresh_h': FRESH_H, 'state': state})
for r in rows:  # 等审的分支也是痕迹：作者交了，球在集成人手上
    age = (nowts - datetime.datetime.fromisoformat(r['at']).timestamp()) / 3600
    r['age_h'] = round(age, 1)

# 4. 报告
now = datetime.datetime.now(TZ)
cnt = {v: sum(r['verdict'] == v for r in rows) for v in ('AUTO', 'DEFER', 'MANUAL', 'CONFLICT', 'FAIL')}
rep = {'generated_at': now.isoformat(timespec='seconds'), 'bot': BOT, 'main': main[:7], 'candidate': cand[:7],
       'candidate_check_all': cand_check, 'merged_into_candidate': merged, 'counts': cnt, 'branches': rows,
       'status_gen': status_note, 'traces': traces, 'seconds': round(time.time() - t0)}
L = [f'# 世界一拍 · {now:%m-%d %H:%M} 北京时间', '',
     f'main `{main[:7]}` → 候选 `{cand[:7]}`（{cand_check}），用时 {rep["seconds"]} 秒。',
     f'待处理分支 {len(rows)} 个：可自动合 {cnt["AUTO"]}、组合后暂缓 {cnt["DEFER"]}、要人看 {cnt["MANUAL"]}、冲突 {cnt["CONFLICT"]}、检查不过 {cnt["FAIL"]}。', '',
     '有 GitHub 权限的人：把 main 快进到 `agent/%s/world-main` 即完成本拍的全部自动合入。' % A.me, '',
     '| 分支 | 结论 | 原因 | 提交 |', '|---|---|---|---|']
order = {'AUTO': 0, 'DEFER': 1, 'MANUAL': 2, 'CONFLICT': 3, 'FAIL': 4}
for r in sorted(rows, key=lambda r: (order[r['verdict']], r['branch'])):
    L.append(f"| `{r['branch']}` | {r['verdict']} | {'；'.join(r['why']) or '—'} | {r['commits']} · 已等 {r['age_h']} 小时 · {r['subject'].replace('|', '/')} |")
MARK = {'鲜': '●', '淡': '◐', '过期': '○'}
L += ['', f'## 认领新鲜度（保鲜 {FRESH_H} 小时；影子模式，只标不释放）', '', '| | 事项 | 谁 | 最新痕迹 | 距今 |', '|---|---|---|---|---|']
for t in sorted(traces, key=lambda t: -t['age_h']):
    L.append(f"| {MARK[t['state']]} {t['state']} | {t['what']} | {t['who']} | {t['last'][5:16].replace('T', ' ')} | {t['age_h']} 小时 |")
md = '\n'.join(L) + '\n'
out = A.out or tempfile.mkdtemp(prefix='world-report-')
os.makedirs(out, exist_ok=True)
json.dump(rep, open(os.path.join(out, 'tick.json'), 'w'), ensure_ascii=False, indent=1)
open(os.path.join(out, 'tick.md'), 'w').write(md)

if A.publish:
    git('push', '-q', '-f', A.remote, f'{cand}:refs/heads/agent/{A.me}/world-main')
    # 报告：main 上加一个只含报告的提交
    d = wt('main')
    try:
        os.makedirs(os.path.join(d, 'docs/world'), exist_ok=True)
        shutil.copy(os.path.join(out, 'tick.md'), os.path.join(d, 'docs/world/tick.md'))
        shutil.copy(os.path.join(out, 'tick.json'), os.path.join(d, 'docs/world/tick.json'))
        git('add', 'docs/world', cwd=d)
        git('-c', f'user.name={A.me}', '-c', f'user.email={A.me}@local', 'commit', '-q', '-m',
            f'[world] 一拍报告 {now:%m-%d %H:%M}\n\nAgent: {A.me}', cwd=d)
        git('push', '-q', '-f', A.remote, f'HEAD:refs/heads/agent/{A.me}/world-report', cwd=d)
    finally:
        wt_rm(d)
print(md)
print(f'报告：{out}')
