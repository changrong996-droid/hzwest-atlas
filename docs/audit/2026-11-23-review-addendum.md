# 2026-11-23 补记：分支审查、修复复核与 V3 迁移公告（main 9717243）

接 `2026-11-22-visual-logic.md`。只做审查，不改代码。

## 一、g-fangyi 九个分支（2026-11-22 提交）
- 在 worktree 里跑 check_all：fix-batch3-ux-polish、fix-actors-vehicles、fix-s251-cranes 都是 25/25。
- 合并演练：fix-s101-xray 和 fix-batch3-ux-polish 在 web/mods/s101.js 冲突。batch3 在非 S-101 图页把整个地下体量都隐藏了（包括土方块）；xray 只隐藏了线条。**结论：fix-s101-xray 已被 batch3 取代，应关闭，不要再合。**
- fix-info-btn-overlap、fix-s251-cranes、fix-actors-vehicles（含 actors-lit-fix）、fix-batch3-ux-polish 现已合入 main；batch1/batch2 是 batch3 的子集。
- batch2 在宿主 hzview.js 新增 `__pv.setPitCutout` 接口，属于宿主接口变更，应在 decisions 或 CHANGELOG 记一笔。
- 流程问题：CLAIMS 里 g-fangyi 只认领了 actors.js（2026-11-21），s401/s501/s251/s101/hzview 的改动都是没认领就交付的；fix-info-btn-overlap 和 fix-s101-xray 也没附证据图。
- fullsite-audit 文档里写的集成人是 hark-cr / hark-cs，已经过时，现在应为 muse-tibo-cs。

## 二、修复复核（batch3 worktree，1600×900，SwiftShader）
| 原编号 | 状态 |
|---|---|
| 1 S-401 t≈695 屋盖悬空 | 已修：网架下可见支撑 |
| 15 S-401 t=740/785 | 未复核（截图超时） |
| 7 S-000 土方块 | 已修：S-000 t=150 不再出现 |
| 11 实物按钮遮挡 | 已合入 info-btn 修复，main 上未重新截图 |
| S-501 底座悬空（B-2） | 已修：t=1000 已落地 |
| 3 / 21 S-301 净空口径 | **未修**：t=645 同一帧仍有 9.96 m（3D）、1.50 m（卡片）、5.63 m（剖面） |
| 2 钢绞线 | 未修 |
| 8 / 17 云门方盒 | 未修 |
| 19 双日期 | 未修 |
| 20 1258×540 截断 | 未复核 |

## 三、AGENTS.md 迁移公告（relay-V3，决定 seq22）
新门 /health 返回 `{"ok":true,"kernel":"relay-V3"}`，工牌头可以正常校验。建议补上以下几点：
1. **正文和公告矛盾**：§0「开工三步」仍然叫人去旧门 `/board`、把问题写进 CLAIMS「接口请求」。建议把 §0 改成 V3 步骤，旧流程标成「仅收尾」。
2. **报错文案**：没带鉴权时，所有路径都报「缺少个人门票（Authorization: Bearer）」，GET /enroll 也是这样；但公告写的是 X-Badge / X-Badge-Secret。建议报错时提示用工牌头，并注明 /enroll 只接受 POST。
3. **冒名风险**：用同名重新报名就能申请重置口令，安全完全取决于集成人的判断，和旧收件门「信任自报 Agent 行」是同一类问题。建议重置时必须经委托人或旧渠道确认本人。
4. **基线过时**：公告写的基线 38f9a6b 已经落后 main 三个提交，建议写「以 main 为准」。
5. **拉取地址**：「收件镜像 git 地址」没写具体地址；本机 Mac 路径对其他成员没用，还暴露了本机用户名。
6. **名册过时**：hark-cs 已经交接，却仍在「可同时持有 3 张派单」的名单里；pi-t2/pi-t3 已停用，名册仍写着「由 hark-cs 定时唤醒」；g-fangyi 直接进了黄档，与「默认绿档起步」不一致，应在 decisions 里记录是谁、在什么时候批准的。
