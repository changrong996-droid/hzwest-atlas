# 提案：拆掉集成人单点（hark-cs，2026-11-09）

## 依据
委托人 2026-11-09 05:35 PST（北京 21:35）原话：「昨天我确实这么一说，但是现在情况已经变了。而且我们要解决这个问题。」
——指 CLAIMS 决定记录里 11-09 10:16「维持 hark-cr 唯一集成；不采用三档放行」那条。本提案按委托人新意见替换它，具体条文请 hark-cr 改进 AGENTS.md / CLAIMS 决定记录（共用文件归 hark-cr）。

## 昨天的账（世界一拍影子 20 拍，11-08 23:18 至 11-09 21:26 北京）
- hark-cr 离线约 11 小时（11-08 19:05 至 11-09 06:19 北京）。期间 7 个分支已合格（AUTO），干等无人合入。
- 这 7 个拼成的候选主线，20 拍 check_all 一次未挂。
- hark-cr 回来后约每 20 分钟合一次，其他分支频繁过时：「需 rebase」从 5 条涨到 8–10 条。
- 认领衰减（保鲜 6 小时）标「过期」4 条，事后均无新提交：0 误报。

病根：集成人同时干「管世界」（机械合入、出状态）和「拿主意」（审查、派单）。人一离线，机械活也停。

## 三条改动

### 1. 绿档自动合入搬到 GitHub Actions（不依赖任何人在线）
- `.github/workflows/inbox-automerge.yml`：北京 08:07–23:07 每小时一次，也可手动触发。
- `tools/inbox/automerge.py`：拉收件 agent/* 分支，按推送先后逐个试合。**规则与现在 collect.sh 的 AUTO 档完全相同**：`scope.py` 判 AUTO（含 mchecks）+ 合并无冲突 + `check_all` OK 才留下，记 CHANGELOG；其余一律不碰。
- 和 hark-cr 不打架：`concurrency: integrate-main`；推送被拒就拉最新 main、重跑 check_all 再推。
- 已测：在 4490777（hark-cr 离线时的 main）上实跑，结果见文末「测试」。在当前 8aeb98b 上空跑：0 合入、11 个按规则留下，main 不变。
- 需要 hark-cr 做的只有一件：合入这两个文件（`.github/` 是共用文件）。

### 2. 集成人变成「会过期的岗位」+ 替补
- 集成人的痕迹 = main 上带 `Agent: hark-cr` 的最新提交。保鲜 2 小时（北京 08:00–23:00 内计时）。
- 过期后，替补（建议 hark-cs）接手黄档：按同一套规则（AGENTS.md 5.1、check_all、共用文件红线）合入，提交末行写 `Agent: hark-cs（替补集成）`，并在 CLAIMS 决定记录写一行「接手 / 交还」。
- hark-cr 一有新提交即自动交还，替补停手。任何时刻只有一人在合：替补每次动手前先看痕迹。
- 需要委托人做的一件事：把 GitHub 账号 `changsheng0804-blip` 加为 `changrong996-droid/hzwest-atlas` 的协作者（Write）。

### 3. 拿主意分出去
- 绿档：脚本合（第 1 条）。
- 黄档（改别人文件、共用文件、跨图）：集成人或替补任一人审过即可，不必非得 hark-cr。
- 红档（钱、钥匙、公网暴露、删除、发布）：只问委托人。

## 顺带
- 收件推送 502 是 pre-receive 里跑 check_all 超过网关时限造成的假失败；建议改成推完再跑（post-receive 或交给第 1 条的 Actions）。
- `docs/proposals/` 不在 5.1 白名单，世界一拍里约一半 MANUAL 只因这一点。建议把「作者本人的 `docs/proposals/<作者>-*.md`」加进 AUTO。

## 测试（11-09 21:50 北京，沙箱实跑）
- 把 main 退回 4490777（hark-cr 离线那段时间的 main），跑 `automerge.py`：合入 7 个，正是世界一拍标的那 7 个（D-20-s101、D-26-north-note、D-21-s501、D-22-s401-polish2、workflow-notes、audit-pilot、vision-review）；合完 `check_all 18/18 OK`。
- 在当前 main 8aeb98b 上 `--dry-run`：0 合入，11 个按规则留下（冲突 5、MANUAL 6），main 不动。
- 跳过 `agent/*/join` 与 `agent/*/world-*`。

Agent: hark-cs
