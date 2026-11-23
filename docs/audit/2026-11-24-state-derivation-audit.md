# 状态现算审计（任务 #54，fo-cs，2026-11-24 交付）

## 方法
现算依据 = 本会话心跳各圈捕获的事件快照（事件 376–408，2026-11-23 12:0x–14:4x PST）+ /view/task/<id> 账本字段（status / assignee / submissions{author,tier,verify_ok,created_at} / fail_count / created_by）+ 重叠单合并纪要 docs/tasks/overlap-merge-2026-11-23.md。按事件序列（认领→提交→验货→评审→合入/裁定）重推每张单应处状态，与账本现状态逐张对表。快照时点：14:41 PST（批次三，#40–#55）。

## 对表（单号 | 账本状态 | 现算状态 | 依据）

| 单号 | 账本 | 现算 | 依据 |
|---|---|---|---|
| 40 | open | **已撤销（差异，见下）** | 事件 380（Q#30 裁定：与 #38 重复并撤销）+ 重叠单纪要 seq 28；事件 376 认领/378 放回 |
| 41 | merged | merged | submissions #27 green verify_ok=1（fo-changrong） |
| 42 | merged | merged | submissions #33 yellow→#34 green→#46 green（fo-changrong） |
| 43 | merged | merged | submissions #40 green verify_ok=1（fo-cs） |
| 44 | open | 裁定已下、待集成人执行（注记，见下） | 事件 379（Q#31）/381（裁定：恢复定期同步并入集成人例行动作） |
| 45 | open | open | 14:00/14:38 两次实测 open、无 assignee |
| 46 | merged | merged | submissions #41 green（g-liuzhijie） |
| 47 | merged | merged | submissions #43 yellow verify_ok=0 → #45 green（fo-cs，S#47）；事件 364/365 评审通过与合入 90b74ac7 |
| 48 | merged | merged | submissions #51 green（fo-changrong，13:27 前后）；matching 在 13:00→13:30 圈间将其出列，时序吻合 |
| 49 | merged | merged | 事件 403 认领/404 提交 S#53/406 green/407 合入 88b3037b（fo-changrong，14:30 前后） |
| 50 | merged | merged | 事件 382 S#50/383 验货 yellow/385 muse-tibo-cs 批准（fo-changrong） |
| 51 | merged | merged | submissions #49 green verify_ok=1（fo-cs，S#49）；事件 402 前合入 f34b3cb6 链 |
| 52 | open | open | 前置 #45 未合入，两次实测 open |
| 53 | merged | merged | 事件 395 认领/396 S#52/399 验货 yellow 触碰考卷标注/400+401 双批准（muse-tibo-cs、muse-cr）/402 合入 f34b3cb6 |
| 54 | claimed | claimed | fo-cs 14:39 认领（本审计执行中） |
| 55 | open | open | 14:41 实测 open |

## 差异与注记
1. **#40（唯一硬差异）**：账本 open 且持续出现在 matching_open（14:38 实测 [40,44,54,55]），但撤单裁定早已落锤（事件 380：Q#30 裁定「不用等、也不要开工：#40 早在主人裁定 ask #5 时就已定性为与 #38 重复并撤销」+ 纪要 seq 28）。后果已实际发生一次：12:09 被 fo-cs 误认领（事件 376），12:14 放回（378）。建议维护者把 #40 置 closed/撤单态，止住再次误领。
2. **#44（注记，非差异）**：账本 open 合理——Q#31 已裁定方向（事件 381），单子应开着等集成人把镜像同步落成例行；但 matching 继续把它推给 worker 会与集成人的活相撞，建议在单上标注「集成人执行中，worker 勿领」。
3. **数据不足（逐单列明，未猜）**：/brief 不支持游标翻页（/brief?cursor=N 返回 404）、无独立 /events 路由，事件流只回最新一条。本表对 376–408 逐事件有据；#41–#51 更早的完整评审/合入轨迹仅有 submissions 元数据（author/tier/verify_ok/created_at）与本会话快照作旁证，无法逐事件复核。上表凡标注「事件」者为直接证据，仅标注 submissions 者为元数据旁证。
4. **#54 自身**：claimed by fo-cs，现算与账本一致；本审计只读，未改任何状态。

## 结论
15/16 张批次单账本状态与事件序列现算一致；唯一硬差异是 #40 账本未跟进撤单裁定（证据：事件 380 + 纪要 seq 28 + matching 持续放单 + 一次实际误领链 376/378/380）。
