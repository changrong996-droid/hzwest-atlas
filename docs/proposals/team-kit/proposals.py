#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""提议闸：建议要写清服务哪个目标，每人同时挂着的建议有上限；转化率一眼看出有没有空转。

建议是目录里的一份份 Markdown（默认 proposals/），每份开头几行：
  # P-3 标题
  - 提议人: hark-cs
  - 服务目标: G-1
  - 不做会怎样: ...
  - 状态: 提议 | 派单 | 合入 | 上线 | 放弃
目标清单可选：GOALS.md 里形如「- G-1 ...」的行。有这个文件时，服务目标必须在里面。

用法：
  python3 tools/proposals.py new --by hark-cs --goal G-1 --title "..." --why "..." [--dir proposals]
  python3 tools/proposals.py set P-3 派单
  python3 tools/proposals.py check
  python3 tools/proposals.py funnel [--json]
上限：--cap 或环境变量 RELAY_PROPOSAL_CAP，默认 2。
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

STAGES = ["提议", "派单", "合入", "上线"]
ALL = STAGES + ["放弃"]
FIELDS = ["提议人", "服务目标", "不做会怎样", "状态"]


def load(d):
    out = []
    for p in sorted(Path(d).glob("P-*.md"), key=lambda x: int(re.sub(r"\D", "", x.stem) or 0)):
        text = p.read_text(encoding="utf-8")
        item = {"id": p.stem, "path": str(p), "title": ""}
        m = re.search(r"^#\s+\S+\s+(.+)$", text, re.M)
        if m:
            item["title"] = m.group(1).strip()
        for f in FIELDS:
            m = re.search(rf"^\s*-\s*{f}\s*[:：]\s*(.*)$", text, re.M)
            item[f] = m.group(1).strip() if m else ""
        out.append(item)
    return out


def goals(root):
    g = Path(root) / "GOALS.md"
    if not g.exists():
        return None
    return set(re.findall(r"^\s*-\s*(G-\d+)", g.read_text(encoding="utf-8"), re.M))


def problems(items, cap, goal_ids):
    probs = []
    open_by = {}
    for it in items:
        for f in FIELDS:
            if not it[f]:
                probs.append(f"{it['id']} 缺「{f}」")
        if it["状态"] and it["状态"] not in ALL:
            probs.append(f"{it['id']} 状态「{it['状态']}」不认识（只能是 {'/'.join(ALL)}）")
        if goal_ids is not None and it["服务目标"] and it["服务目标"].split()[0] not in goal_ids:
            probs.append(f"{it['id']} 服务目标「{it['服务目标']}」不在 GOALS.md 里")
        if it["状态"] == "提议":
            open_by.setdefault(it["提议人"], []).append(it["id"])
    for who, ids in open_by.items():
        if len(ids) > cap:
            probs.append(f"{who} 同时挂着 {len(ids)} 条建议，上限 {cap}：{'、'.join(ids)}")
    return probs


def funnel(items):
    reached = {s: 0 for s in STAGES}
    for it in items:
        st = it["状态"]
        if st in STAGES:
            for s in STAGES[:STAGES.index(st) + 1]:
                reached[s] += 1
        elif st == "放弃":
            reached["提议"] += 1
    total = reached["提议"]
    rate = {s: (round(reached[s] / total, 2) if total else 0.0) for s in STAGES}
    per = {}
    for it in items:
        p = per.setdefault(it["提议人"] or "?", {"提": 0, "上线": 0, "放弃": 0})
        p["提"] += 1
        if it["状态"] == "上线":
            p["上线"] += 1
        if it["状态"] == "放弃":
            p["放弃"] += 1
    return {"total": total, "reached": reached, "rate": rate, "by_person": per,
            "dropped": sum(1 for i in items if i["状态"] == "放弃")}


def main(argv=None):
    ap = argparse.ArgumentParser(description="提议闸")
    ap.add_argument("--dir", default="proposals")
    ap.add_argument("--root", default=".")
    ap.add_argument("--cap", type=int, default=int(os.environ.get("RELAY_PROPOSAL_CAP", "2")))
    sub = ap.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("new")
    n.add_argument("--by", required=True)
    n.add_argument("--goal", required=True)
    n.add_argument("--title", required=True)
    n.add_argument("--why", required=True, help="不做会怎样")
    s = sub.add_parser("set")
    s.add_argument("id")
    s.add_argument("stage", choices=ALL)
    sub.add_parser("check")
    f = sub.add_parser("funnel")
    f.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)

    d = Path(a.root) / a.dir
    d.mkdir(parents=True, exist_ok=True)
    items = load(d)
    gids = goals(a.root)

    if a.cmd == "new":
        if not a.goal.strip() or not a.why.strip():
            print("服务目标和「不做会怎样」都要写", file=sys.stderr)
            return 1
        if gids is not None and a.goal.split()[0] not in gids:
            print(f"服务目标 {a.goal} 不在 GOALS.md 里（有：{'、'.join(sorted(gids)) or '无'}）", file=sys.stderr)
            return 1
        mine = [i["id"] for i in items if i["提议人"] == a.by and i["状态"] == "提议"]
        if len(mine) >= a.cap:
            print(f"{a.by} 已挂着 {len(mine)} 条建议（上限 {a.cap}）：{'、'.join(mine)}。先等它们被派单或放弃。",
                  file=sys.stderr)
            return 1
        nums = [int(re.sub(r"\D", "", i["id"]) or 0) for i in items]
        pid = f"P-{max(nums, default=0) + 1}"
        (d / f"{pid}.md").write_text(
            f"# {pid} {a.title}\n\n- 提议人: {a.by}\n- 服务目标: {a.goal}\n- 不做会怎样: {a.why}\n- 状态: 提议\n",
            encoding="utf-8")
        print(pid)
        return 0

    if a.cmd == "set":
        p = d / f"{a.id}.md"
        if not p.exists():
            print(f"没有 {a.id}", file=sys.stderr)
            return 1
        t = p.read_text(encoding="utf-8")
        t2, k = re.subn(r"^(\s*-\s*状态\s*[:：]\s*).*$", lambda m: m.group(1) + a.stage, t, count=1, flags=re.M)
        if not k:
            t2 = t.rstrip("\n") + f"\n- 状态: {a.stage}\n"
        p.write_text(t2, encoding="utf-8")
        print(f"{a.id} → {a.stage}")
        return 0

    if a.cmd == "check":
        probs = problems(items, a.cap, gids)
        for x in probs:
            print("  ✗ " + x)
        print(("通过" if not probs else "不通过") + f"｜{len(items)} 条建议")
        return 0 if not probs else 1

    res = funnel(items)
    if a.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        r = res["reached"]
        print(f"建议 {r['提议']} → 派单 {r['派单']} → 合入 {r['合入']} → 上线 {r['上线']}"
              f"（上线率 {int(res['rate']['上线'] * 100)}%，放弃 {res['dropped']}）")
        for who, p in sorted(res["by_person"].items()):
            print(f"  {who}：提 {p['提']}，上线 {p['上线']}，放弃 {p['放弃']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
