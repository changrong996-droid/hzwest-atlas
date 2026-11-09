#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""交付单检查：没证据的交付只算草稿；自报的档位不能低于实际影响面。

用法：
  python3 tools/delivery.py new <交付单路径> --id D-1 --by hark --task "..."
  python3 tools/delivery.py check <交付单> [--root 仓库根] [--allowed 'docs/**' ...]
                                           [--changed a b ...] [--git BASE] [--run] [--json]

退出码：0 通过；1 不通过；2 用法错误。
"""
import argparse
import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = Path(__file__).resolve().parent / "DELIVERY.md"

REQUIRED = ["交了什么", "先看过现状", "怎么算完", "证据", "范围", "档位"]
TIERS = ["绿", "黄", "红"]
RED_PATTERNS = [".secrets/*", "*/.secrets/*", "*.token", "*.key", "*secret*", "*migration*",
                "*deploy*", "*.github/workflows/*", "*members*", "*devtokens*"]
EVIDENCE_KINDS = ("文件", "截图", "命令", "链接")


def sections(text):
    out, cur = {}, None
    for line in text.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            cur = m.group(1)
            out[cur] = []
        elif cur is not None:
            out[cur].append(line)
    body = {}
    for k, lines in out.items():
        s = re.sub(r"<!--.*?-->", "", "\n".join(lines), flags=re.S).strip()
        body[k] = s
    return body


def parse_evidence(s):
    items = []
    for line in s.splitlines():
        line = line.strip().lstrip("-*").strip()
        m = re.match(r"^(文件|截图|命令|链接)\s*[:：]\s*(.+)$", line)
        if m:
            items.append((m.group(1), m.group(2).strip().strip("`")))
    return items


def ticked_tiers(s):
    got = []
    for line in s.splitlines():
        m = re.match(r"^\s*[-*]\s*\[([xX✓])\]\s*(绿|黄|红)", line)
        if m:
            got.append(m.group(2))
    return got


def git_changed(root, base):
    r = subprocess.run(["git", "-C", str(root), "diff", "--name-only", f"{base}...HEAD"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"git diff 失败：{r.stderr.strip()}")
    return [p for p in r.stdout.splitlines() if p.strip()]


def match_any(path, pats):
    return any(fnmatch.fnmatch(path, p) for p in pats)


def actual_tier(changed, allowed):
    if any(match_any(p, RED_PATTERNS) for p in changed):
        return "红"
    if allowed and any(not match_any(p, allowed) for p in changed):
        return "黄"
    return "绿"


def check(path, root=None, allowed=None, changed=None, run=False, timeout=600):
    root = Path(root or Path(path).resolve().parent)
    problems, notes = [], []
    text = Path(path).read_text(encoding="utf-8")
    body = sections(text)

    for k in REQUIRED:
        if k not in body:
            problems.append(f"缺少「{k}」一节")
        elif k != "档位" and not body[k]:
            problems.append(f"「{k}」没填")
    if "{{" in text:
        problems.append("还有没替换的占位符 {{...}}")

    ev = parse_evidence(body.get("证据", ""))
    if not ev:
        problems.append("没有证据：至少一行「文件:/截图:/命令:/链接:」——没证据只算草稿")
    for kind, val in ev:
        if kind in ("文件", "截图"):
            p = (root / val)
            if not p.exists():
                problems.append(f"{kind}不存在：{val}")
            elif p.is_file() and p.stat().st_size == 0:
                problems.append(f"{kind}是空的：{val}")
        elif kind == "命令" and run:
            r = subprocess.run(val, shell=True, cwd=str(root), capture_output=True, text=True, timeout=timeout)
            tail = (r.stdout + r.stderr).strip().splitlines()[-3:]
            if r.returncode != 0:
                problems.append(f"命令没过（退出 {r.returncode}）：{val}｜" + " / ".join(tail))
            else:
                notes.append(f"命令通过：{val}")
        elif kind == "命令":
            notes.append(f"命令未执行（加 --run 才跑）：{val}")

    ticks = ticked_tiers(body.get("档位", ""))
    declared = None
    if len(ticks) != 1:
        problems.append(f"档位要勾且只勾一个，现在勾了 {len(ticks)} 个")
    else:
        declared = ticks[0]

    real = None
    if changed is not None:
        real = actual_tier(changed, allowed or [])
        if not changed:
            notes.append("没有改动文件")
        if declared and TIERS.index(declared) < TIERS.index(real):
            bad = [p for p in changed if match_any(p, RED_PATTERNS)] if real == "红" else \
                  [p for p in changed if not match_any(p, allowed or [])]
            problems.append(f"自报{declared}档，实际是{real}档：" + "、".join(bad[:5]))
    final = max([t for t in (declared, real) if t], key=TIERS.index, default=None)
    return {"ok": not problems, "declared": declared, "actual": real, "tier": final,
            "evidence": len(ev), "problems": problems, "notes": notes}


def main(argv=None):
    ap = argparse.ArgumentParser(description="交付单")
    sub = ap.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("new")
    n.add_argument("path")
    n.add_argument("--id", required=True)
    n.add_argument("--by", required=True)
    n.add_argument("--task", required=True)
    c = sub.add_parser("check")
    c.add_argument("path")
    c.add_argument("--root")
    c.add_argument("--allowed", nargs="*", default=[])
    c.add_argument("--changed", nargs="*")
    c.add_argument("--git", metavar="BASE")
    c.add_argument("--run", action="store_true")
    c.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)

    if a.cmd == "new":
        p = Path(a.path)
        if p.exists():
            print(f"已存在：{p}", file=sys.stderr)
            return 2
        t = TEMPLATE.read_text(encoding="utf-8")
        t = t.replace("{{ID}}", a.id).replace("{{NAME}}", a.by).replace("{{TASK}}", a.task)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(t, encoding="utf-8")
        print(f"已生成 {p}，填完后跑 check")
        return 0

    root = Path(a.root) if a.root else Path.cwd()
    changed = a.changed
    if a.git:
        changed = git_changed(root, a.git)
    res = check(a.path, root=root, allowed=a.allowed, changed=changed, run=a.run)
    if a.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        print(("通过" if res["ok"] else "不通过") + f"｜档位：{res['tier'] or '未定'}｜证据 {res['evidence']} 条")
        for p in res["problems"]:
            print("  ✗ " + p)
        for p in res["notes"]:
            print("  · " + p)
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
