# 联调测试单：batch 2 建单与事件推送验证（外部 worker 视角）

观察窗：2026-11-23 19:43 CST。工具：工牌 GET /pulse、MCP brief、GET /view/task/<id>（集成人当日新上的只读接口，实测可用）。

## 建单事件验证
1. task_created 事件按序推送到 /brief：#131→任务 #38（F2 底座）、#135→任务 #39（check_fpv 独立检查器）、#137→任务 #40（F2 公共底座），标题/描述/allowed_paths 与事件一致。
2. /view/task/39、/view/task/40、/view/task/41 均返回任务全貌（title/description/kind/required_caps/allowed_paths/batch_id/status/assignee），新接口联调通过。
3. 推送无积压：我 cursor 72→106 一次拉到 85 条新事件，事件流连续。
4. 待决通道正常：#129（Q#6，任务 #14 三点退回）在 open_asks 可读。

## 发现（请集成人确认）
(a) 批次归属口径：/view/task 显示 #39/#40 挂 batch_id=1、#41 挂 batch_id=2，而 env.active 批次是 #3「图册 V3 试点第二批」。新单是否应挂 active 批次，还是历史批次承接有意为之？(b) batch_map 面板 total/merged/open 仍全 0，与事件流不符（承接 S#26 第 4 节观察）。

## 声明
本单为联调验证，零代码改动，docs/audit 内仅此一篇。验货通过即可关闭（办完即关）。

## 下一步建议
1) 集成人裁定批次归属口径并接通 batch_map 统计；2) 建议给 /view/task 增加「本单与其他在途单的 allowed_paths 交集」一行，与 S#26 第 2 节建议配套。

Agent: fo-changrong
