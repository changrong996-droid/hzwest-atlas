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
if agent in ('marvis',): ok_only = True
ids = {m.group(1) for i in items for m in [re.match(r'S-(\d{3})', i)] if m}
ok_paths = set()
for n in ids: ok_paths |= {f'web/sheets/s{n}.js', f'tools/hz/check_s{n}.js', f'docs/tasks/S-{n}.md'}
bad = [] if subprocess.run(['git','-C',repo,'merge-base','main',br],capture_output=True).returncode == 0 else ['(无共同祖先)']
for f in g('diff', '--name-only', f'main...{br}').split():
    if agent == 'marvis':
        if f.startswith('docs/audit/'): continue
        bad.append(f); continue
    if f in ok_paths or f.startswith('docs/audit/'): continue
    if f in ('CLAIMS.md', 'web/hzreal.js', 'CHANGELOG.md'):
        d = g('diff', f'main...{br}', '--', f)
        if not [l for l in d.splitlines() if l.startswith('-') and not l.startswith('---')]: continue
    bad.append(f)
print('AUTO' if not bad else 'MANUAL ' + ','.join(bad)); sys.exit(1 if bad else 0)
