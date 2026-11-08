#!/usr/bin/env python3
"""机械验收（借自 relay v0.5 checks.py 的思路）：确定、不联网、不调模型。
run(repo, branch) -> [(名字, 通过, 证据)]；scope.py 调用，任一失败则不进 AUTO 档，原因写进收件报告。"""
import re, subprocess

SECRET = re.compile(r'(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[abp]-[A-Za-z0-9-]{10,})')
LEAK = re.compile(r'(<system-reminder>|<platform_message|You are Hark|\[base\]\s*$|## Identity\s*$)')
CONFLICT = re.compile(r'^\+(<<<<<<< |>>>>>>> |=======$)')


def run(repo, br):
    g = lambda *a: subprocess.run(['git', '-C', repo] + list(a), capture_output=True, text=True).stdout
    d = g('diff', f'main...{br}')
    add = [l for l in d.splitlines() if l.startswith('+') and not l.startswith('+++')]
    out = [('非空改动', bool(add), f'{len(add)} 行新增'),
           ('无冲突标记', not any(CONFLICT.match(l) for l in d.splitlines()), '<<<<<<< / ======= / >>>>>>>'),
           ('无密钥', not any(SECRET.search(l) for l in add), 'token / 私钥模式'),
           ('无提示词泄漏', not any(LEAK.search(l) for l in add), '系统提示片段')]
    msgs = g('log', '--format=%s%n%b%x00', f'main..{br}').split('\x00')
    out.append(('提交带 Agent 尾注', all('Agent:' in m for m in msgs if m.strip()), f'{len([m for m in msgs if m.strip()])} 个提交'))
    return out


if __name__ == '__main__':
    import sys
    for n, ok, ev in run(sys.argv[1], sys.argv[2]): print(('PASS ' if ok else 'FAIL ') + n + ' · ' + ev)
