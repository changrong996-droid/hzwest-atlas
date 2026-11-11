#!/usr/bin/env python3
"""收件自动合入（绿档）：在 GitHub Actions 里跑，集成人不在线也照转。

做的事和 collect.sh 里「AUTO 档」完全相同，只是不依赖任何人的沙箱：
  1. 拉收件仓库的 agent/* 分支（公开，无需账号）；
  2. 按推送时间从旧到新，逐个试合到当前 main：合并无冲突 + check_all OK + scope.py 判 AUTO
     （含 mchecks 机械验收）才保留，否则丢弃这次试合；
  3. 每合入一个，CHANGELOG 记一行；
  4. 打印报告（Actions 摘要），由 workflow 推送 main。

不做的事：MANUAL / 冲突 / 黄档红档一律不碰，留给集成人或替补；不改共用文件；不释放认领。
usage: automerge.py <repo> [--dry-run] [--inbox URL]
"""
import os, subprocess, sys, time, datetime

repo = os.path.abspath(sys.argv[1])
DRY = '--dry-run' in sys.argv
INBOXES = [u + '/hzwest-atlas.git' for u in [l.strip() for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mirrors.txt')) if l.startswith('https://')]]   # 多镜像（AGENTS.md 6B）
if '--inbox' in sys.argv:
    INBOXES = [sys.argv[sys.argv.index('--inbox') + 1]]
HERE = os.path.dirname(os.path.abspath(__file__))
BOT = ['-c', 'user.name=inbox-bot', '-c', 'user.email=inbox-bot@hzwest.invalid']
SKIP = ('/join', )                      # 报名分支走人工
SKIP_IN = ('/world-',)                  # 候选主线/报告类分支不是交付


def git(*a, check=True, cwd=None):
    r = subprocess.run(['git', '-C', cwd or repo] + list(a), capture_output=True, text=True)
    if check and r.returncode:
        raise RuntimeError(f'git {" ".join(a)}: {r.stderr.strip()[:300]}')
    return r.stdout.strip()


# 收件机会休眠：第一次请求可能要 10–30 秒唤醒，失败隔 30 秒重试
for i in range(4):
    try:
        for INBOX in INBOXES: git('fetch', '-q', INBOX, '+refs/heads/agent/*:refs/remotes/inbox/agent/*')   # 各镜像取并集；不 --prune，免得一台没有的分支被删
        break
    except RuntimeError as e:
        if i == 3:
            print(f'收件仓库拉取失败：{e}'); sys.exit(2)
        time.sleep(30)

git('checkout', '-q', 'main')
start = git('rev-parse', 'HEAD')
cands = []
for ln in git('for-each-ref', '--format=%(refname:short) %(committerdate:unix)', 'refs/remotes/inbox/agent').splitlines():
    b, ts = ln.split()
    if b.endswith(SKIP) or any(s in b for s in SKIP_IN):
        continue
    if subprocess.run(['git', '-C', repo, 'merge-base', '--is-ancestor', b, 'main']).returncode == 0:
        continue
    cands.append((int(ts), b))
cands.sort()

merged, held = [], []
for ts, b in cands:
    agent = b.split('/')[2]
    head = git('rev-parse', 'HEAD')
    # 先判档（scope.py 比较 main...分支，必须在试合前）
    sc = subprocess.run([sys.executable, os.path.join(HERE, 'scope.py'), repo, b], capture_output=True, text=True, cwd=repo)
    tier = sc.stdout.strip()
    if not tier.startswith('AUTO'):
        held.append((b, tier or sc.stderr.strip()[:120])); continue
    r = subprocess.run(['git', '-C', repo] + BOT + ['merge', '-q', '--no-ff', '--no-edit', '-m',
                        f'[收件] 自动合入 {b[6:]}\n\nAgent: inbox-bot', b], capture_output=True, text=True)
    if r.returncode:
        git('merge', '--abort', check=False); git('reset', '-q', '--hard', head)
        held.append((b, '和 main 冲突，需作者 rebase')); continue
    ck = subprocess.run(['node', 'tools/hz/check_all.js'], cwd=repo, capture_output=True, text=True)
    last = (ck.stdout.strip().splitlines() or [''])[-1]
    if ck.returncode or not last.startswith('OK'):
        git('reset', '-q', '--hard', head); held.append((b, 'check_all 未过：' + last[:100])); continue
    day = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(hours=8)
    subj = git('log', '-1', '--format=%s', b)
    cl = os.path.join(repo, 'CHANGELOG.md')
    if os.path.exists(cl):
        lines = open(cl, encoding='utf-8').read().split('\n')
        at = next((i for i, l in enumerate(lines) if l.startswith('- ')), len(lines))
        lines.insert(at, f'- {day:%Y-%m-%d} · [收件] · inbox-bot · 自动合入 {b[6:]}（{agent}）：{subj}')
        open(cl, 'w', encoding='utf-8').write('\n'.join(lines))
        git('add', 'CHANGELOG.md'); git(*BOT, 'commit', '-q', '--amend', '--no-edit')
    merged.append((b, subj))

print(f'## 收件自动合入 · {(datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(hours=8)):%m-%d %H:%M} 北京')
print(f'合入 {len(merged)} 个，留给集成人 {len(held)} 个。')
for b, s in merged: print(f'- 合入 `{b[6:]}`：{s}')
for b, why in held: print(f'- 留下 `{b[6:]}`：{why}')
if DRY:
    git('reset', '-q', '--hard', start)
print('MOVED' if merged and not DRY else 'UNCHANGED')
