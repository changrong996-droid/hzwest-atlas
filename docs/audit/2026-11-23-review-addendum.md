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

## 四、main 9717243 新进内容复查（2026-11-23 10:50）
本地 check_all：**OK 26/26**（新增了 check_osmctx）。本轮没有截图：沙盒里的无头 Chromium 缺系统库，启动失败，视觉复核留到下一轮。

1. **高 · 同态检查只报告、不拦截，而且它确实报出了真问题。** check_homomorph 默认是报告模式，退出码为 0，所以 check_all 显示 OK；但它报出 S-201 有 8 处「3D 引线进度 vs 图纸进度」不一致，最大差 36%（G-S11 @t=721.7：5% vs 41%；G-N08 @t=864.3：5% vs 41%；G-N06 @t=828.7：0% vs 29%）。这正是它要抓的「第二真相源」。建议先修 S-201 的 leadAt 与 draw 口径，然后在 check_all 里打开 --strict，或者至少不能让 diffs>0 的结果显示成 OK。
2. **中 · 绿档权限过宽。** relay.scope.json 把 web/mods/** 定为绿档（可自动合），但模块可以声明 `replaces` 来摘掉宿主的城市和远山，并把拉远上限放宽到 16000（hzview.js 1248 行）。这样一个绿档 mod 就能改动宿主画面。建议：声明了 replaces 的 mod 按黄档处理，或者让宿主维护 replaces 白名单。
3. **中 · osmctx 的加载代价。** osmctx-data.js 有 582 KB，在 hzview.js 之前同步加载，每张图都要先下载解析完它才能首屏；里面 1115 栋楼、每栋都要做一次 EdgesGeometry。建议改成按需或延迟加载（拉远或首帧后再加载），首屏不阻塞。
4. **中 · osmctx 兜底不完整。** 宿主的远山 MTN 一被 replaces 摘掉，就完全依赖异步解压的 DEM；浏览器没有 DecompressionStream 或解压失败时，只打一条 console.warn，地平线就会空掉。建议解压失败时恢复 MTN。
5. **低 · 开通日写死。** osmctx.js 里 `OPEN = 1101` 是写死的，没有读 HZ 的 P.OPEN（hzseq.js 57 行），以后排程一改就会和宿主脱节。
6. **低 · 注释和提案已过时。** osmctx.js 第 5 行、docs/proposals/hark-fangyi-osm-context.md 第 27 行仍写「由 hark-cr 定」；接入请求 seq105 已经由 muse-tibo-cs 接线关单。
7. **低 · 文档漂移依旧。** README 49 行仍写「OK check_all 4/4」（实际 26/26）；BRIEF 图表状态里 S-101/S-201/S-401 仍是「待出图」。
8. **信息 · s101 冲突的解决方式和我的建议不同。** 集成人先合了 fix-s101-xray，再在 cc4d1aa 用 batch2 的整版重写解决冲突，结果和「作废 xray」等价。check_s101 已通过，S-000 的土方块需要在下一轮截图里确认。
