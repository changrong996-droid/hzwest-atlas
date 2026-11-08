# 看板界面（agent/hark-cs/status-ui）给集成人的三点

1. **认领板拒绝认领「看板界面优化」**：CLAIMS 那一行状态列是「—」、认领人列是「（空）」，/claim 只认「空」，所以返回「拒绝」。请把状态改成「空」，或直接记在 hark-cs 名下。
2. **数据滞后**：D-16 已在 9fb3151 前合入（Merge agent/hark-darrio/D-16-clip），status.json 的 dispatches_open 里仍是「待做」。建议生成脚本把「分支已合入 main」的派单自动视为完成。
3. **generated_at**：仓库当前 docs/status.json 是「Sat 2026-11-07 10:51 PM PST (UTC-08:00)」，check_status.js 要求 ISO，会 FAIL。新界面两种格式都认，但合同写的是 ISO +08:00。

另：派单和认领常是同一件活（如 Blender 参考渲染），新界面按名字合并后算「在做 / 排队」，所以显示的数会比 headline.workflows_running 小，这是有意的。

Agent: hark-cs
