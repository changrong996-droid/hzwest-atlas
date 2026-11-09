#!/usr/bin/env python3
"""Auto-merge tier (AGENTS.md 5.1): exit 0 if branch only touches files in its author's claimed scope.
usage: scope.py <repo> <branch inbox/agent/<name>/...> <claims.json path or ->"""
import sys, subprocess, json, re, urllib.request
repo, br = sys.argv[1], sys.argv[2]
agent = br.split('/')[2]
g = lambda *a: subprocess.run(['git', '-C', repo] + list(a), capture_output=True, text=True).stdout
try: lock = json.load(urllib.request.urlopen('https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/claims', timeout=30))
except Exception: lock = {}
items = {k for k, v in lock.items() if v['a'] == agent}
for ln in g('show', 'main:CLAIMS.md').splitlines():
    c = [x.strip() for x in ln.strip().strip('|').split('|')]
    if ln.startswith('| S-') and len(c) > 2 and c[2].strip('`') == agent: items.add(c[0])
WEAK = ('marvis', 'pi-t2', 'pi-t3')
if agent in WEAK: ok_only = True
ids = {m.group(1) for i in items for m in [re.match(r'S-(\d{3})', i)] if m}
ok_paths = set()
for n in ids: ok_paths |= {f'web/sheets/s{n}.js', f'tools/hz/check_s{n}.js', f'docs/tasks/S-{n}.md'}
UI = '看板界面优化'  # docs/tasks/status-ui.md：认领人只可改 web/status.html 与 web/status/
for ln in g('show', 'main:CLAIMS.md').splitlines():
    c = [x.strip() for x in ln.strip().strip('|').split('|')]
    if len(c) > 2 and c[0] == UI and c[2].strip('`') == agent: items.add(UI)
ui_ok = UI in items
bad = [] if subprocess.run(['git','-C',repo,'merge-base','main',br],capture_output=True).returncode == 0 else ['(无共同祖先)']
for f in g('diff', '--name-only', f'main...{br}').split():
    if agent in WEAK:
        if f.startswith('docs/audit/'): continue
        bad.append(f); continue
    if f in ok_paths or f.startswith('docs/audit/'): continue
    # 作者本人的提案（AGENTS 5.1，2026-11-10）：docs/proposals/<作者>-*.md，不含子目录
    if f.startswith(f'docs/proposals/{agent}-') and f.endswith('.md') and '/' not in f[len('docs/proposals/'):]: continue
    if ui_ok and (f == 'web/status.html' or f.startswith('web/status/')): continue
    if f in ('CLAIMS.md', 'web/hzreal.js', 'CHANGELOG.md'):
        d = g('diff', f'main...{br}', '--', f)
        if not [l for l in d.splitlines() if l.startswith('-') and not l.startswith('---')]: continue
    bad.append(f)
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mchecks, tempfile
if ui_ok:  # 用分支的 status.html + main 的数据跑 check_status
    t = tempfile.mkdtemp()
    for f, ref in (('web/status.html', br), ('docs/status.json', 'main'), ('tools/status/check_status.js', 'main')):
        os.makedirs(os.path.join(t, os.path.dirname(f)), exist_ok=True)
        open(os.path.join(t, f), 'w').write(g('show', f'{ref}:{f}'))
    if subprocess.run(['node', os.path.join(t, 'tools/status/check_status.js')], capture_output=True).returncode: bad.append('CHECK:check_status')
bad += ['CHECK:' + n for n, ok, _ in mchecks.run(repo, br) if not ok]
print('AUTO' if not bad else 'MANUAL ' + ','.join(bad)); sys.exit(1 if bad else 0)
