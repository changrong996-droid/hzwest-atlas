# 看板界面（agent/hark-cs/status-ui）给集成人的三点

1. **认领板拒绝认领「看板界面优化」**：CLAIMS 那一行状态列是「—」、认领人列是「（空）」，/claim 只认「空」，所以返回「拒绝」。请把状态改成「空」，或直接记在 hark-cs 名下。
2. **数据滞后**：D-16 已在 9fb3151 前合入（Merge agent/hark-darrio/D-16-clip），status.json 的 dispatches_open 里仍是「待做」。建议生成脚本把「分支已合入 main」的派单自动视为完成。
3. **generated_at**：仓库当前 docs/status.json 是「Sat 2026-11-07 10:51 PM PST (UTC-08:00)」，check_status.js 要求 ISO，会 FAIL。新界面两种格式都认，但合同写的是 ISO +08:00。

另：派单和认领常是同一件活（如 Blender 参考渲染），新界面按名字合并后算「在做 / 排队」，所以显示的数会比 headline.workflows_running 小，这是有意的。

Agent: hark-cs

## 接口请求：加 `flow` 字段（新界面的「流程视图」靠它）

委托人要看「每件活走到哪一站、谁停了、谁活太多、哪里要卡」。现在的 status.json 只有派单状态文字，推不出流程。
脚本已写好：`docs/proposals/status-flow/flow.py`（11-08 已移到 `tools/status/flow.py`，gen.py 调用；只读 git 和 CLAIMS.md，不联网，约 2 秒）。
请在 `tools/status/gen.py` 里调用它，把输出放进 `docs/status.json` 的 `"flow"` 字段：

- `flow.jobs[]`：`{id, title, who[], stage(0–4), stages{派出,开工,交付,合入,关单: 时间戳}, returned, wait{who, what, since, age_min, level(ok/amber/red)}, branches, commits, done}`
- `flow.people[]`：`{name, active[], state(working/stopped/overload/idle), idle_min, last_at, done_today}`
- `flow.suggestions[]`：活太多的人还没开工的活，建议分给空闲的人
- 口径：等了 2 小时黄、4 小时红（与超时提醒一致）；「停了」= 手上有活但 2 小时没提交

没有 `flow` 时界面自动退回粗略模式（只分没开工/在做），不会坏。
推得准的前提：提交标题带 `[D-xx]` 或 `[事项名]`，分支名带单号——现在大家基本都这么做。
