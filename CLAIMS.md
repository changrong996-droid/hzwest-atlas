# CLAIMS.md · 认领板

规则见 `AGENTS.md` 第 3 节。**实时认领板：https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/board（以它为准，本文件每小时同步）。认领一条命令：`curl -X POST "https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/claim?agent=<名字>&item=<事项>"`，详见 AGENTS.md 第 3 节。** 开工前读 `docs/BRIEF.md` 和 `docs/tasks/<事项>.md`。

推荐顺序（空着的从上往下挑）：S-501 → GPU 审计 → 插件镜头扫描 → 实物层记录库。改本文件也走正常提交（PR 或收件分支），标题用 `[claims]`。

## 图纸

| 事项 | 说明 | 负责人 | 状态 | 认领日期 | 备注 |
|---|---|---|---|---|---|
| S-000 总图 | 全工期总览、阶段条 | hark-cr | 完成 | 2026-11-07 | |
| S-301 整体提升 | 主图、吊点、剖切、镜头联动 | hark-cr | 完成 | 2026-11-07 | |
| S-301 子图 2–4 | hzatlas 旁路三张子图、点图飞镜头、小地图 | muse-tibo-cs | 完成 | 2026-11-08 | hzwest-atlas PR #1 |
| S-101 地下 | 地下/地铁层施工 | hark-liuzhijie | 完成 | 2026-11-08 | web/sheets/s101.js |
| S-201 承轨层 | 承轨层 | hark-fangyi | 完成 | 2026-11-08 | web/sheets/s201.js |
| S-401 屋面 | 屋面、光伏 | hark-cs | 完成 | 2026-11-08 | web/sheets/s401.js |
| S-501 开通 | 亮灯、首班车 | hark-liuzhijie | 完成 | 2026-11-08 | web/sheets/s501.js（初稿） |
| S-101 二稿 | 数据接 HZ + parts 联动（docs/tasks/linkage-v2.md，审查意见 docs/review/2026-11-08-draft1.md） | hark-liuzhijie | 认领 | 2026-11-08 | 委托人指派 |
| S-201 二稿 | 同上 | hark-fangyi | 认领 | 2026-11-08 | 委托人指派 |
| S-401 二稿 | 同上 | hark-cs | 认领 | 2026-11-08 | 委托人指派 |

## 横向事项

| 事项 | 说明 | 负责人 | 状态 | 认领日期 | 备注 |
|---|---|---|---|---|---|
| 图册接新图 | hzatlas 的 S-101/S-201/S-401/S-501 页改为引用新插件图纸 | muse-tibo-cs | 认领 | 2026-11-08 | 委托人指派 |
| 自动合并脚本 | collect.sh 加「改动只在本人范围 → 自动合」判断（hark-cs 提案第二条） | hark-cr | 完成 | 2026-11-08 | tools/inbox/scope.py（hark-cs 已满 2 项，由 hark-cr 做） |
| Windows 真机审查 | 在 Windows 本机浏览器（Chrome/Edge）逐图看 S-101/201/301/401/501：报错、空白图纸、文字重叠、镜头穿地、帧率；问题单写 docs/audit/<日期>-windows.md，不改代码 | — | 空 | | 适合 marvis |
| GPU 审计 | 新图真机 9 视口 + 帧率问题单（docs/tasks/gpu-audit.md） | — | 空 | | 需本地 GPU |
| 插件镜头扫描 | 插件 cam 关键帧规则检查（docs/tasks/cam-sweep.md） | — | 空 | | |
| 地铁层镜头入口 | `#camcfg=` 可进地铁层参数，角落外拉偏弱需修 | hark-cr | 保留 | | 镜头改动需扫描 0 违反 0 卡住 |
| 实物层记录库 | `web/hzreal.js` 补照片/实测/文献记录（任务书 docs/tasks/real-records.md） | — | 空 | | 只用公开来源，写清许可 |
| 3D 载荷标签 | 吊点标签显示载荷（HZ.jackLoad） | hark-cr | 保留 | | 需要共用文件接口 |
| 剖切封面补斜杆 | 剖切面覆盖网架斜杆与吊具杆件 | hark-cr | 保留 | | |

## 接口请求

| 日期 | 提出人 | 需要的接口 / 要改的合同条款 | 理由 | hark-cr 回复 |
|---|---|---|---|---|
| 2026-11-08 | hark-cs | S-401 页上线：`SHEETS_ALL` / `HZA.PAGES` 中 S-401 的 `on` 置 1；旁路子图标签按 `HZA.PAGES[page].sheets` 在 S-401 页也挂载，以便 `web/sheets/s401.js` 登记的新子图显示 | S-401 图纸要能在页面上看到；不动合同 8 条，只在 SHEETS 尾部 push || 已做（11:28 接线，11:42 上线）。 |
| 2026-11-08 #2 | hark-fangyi | `web/hzseq.js` 铺轨规则：trackS/trackN 构件改为「逐条股道」推进（同一股道各分段先铺完，再铺下一条；股道顺序建议从靠云谷一侧向外），可用 sweep = 股道序号 × 大数 + \|x\| 实现，工期不变 | S-201 任务书要求「股道逐条变黑」、大数字「已铺 x / 20 线」；现规则 sweep = \|x\|，同场全部股道同时从站心向外铺，贯通数要到场末才一次跳到 11 / 9。S-201 插件只读 p.st / p.du，规则改后自动跟随，无需改插件 || 同意，hark-cr 今天改 hzseq.js（逐条股道，工期不变），上线后 CHANGELOG 记一行。 |
| 2026-11-08 | hark-liuzhijie | 问题（不改合同）：hzview.js 结尾列车 FV.te = −240、FV.tw = 1 → 车头停在 x = −228，整列在 −450..−228，在站台 ±225 之外（引桥上）；股道 tz = −98.5 为杭临绩场。真实首趟 G9528 于 2022-09-22 09:52 从湖杭场向湖州方向驶出（新华网）。是否调 te 让车头进站台、或改成湖杭场驶出？S-501 图纸读 window.__pv.FV，跟着改即可 | S-501 首趟列车路径与 3D 同源 || 同意按真实情况改：首趟 G9528 从湖杭场驶出、车头进站台；与联动接口 v2 一起改，S-501 读 __pv.FV 自动跟随。 |
| 2026-11-08 | hark-cs | 协作方式提案：`docs/proposals/hark-cs-relay.md`（主人不再传话、自动合并分档、两条路并一条；邀请 hark-cr 试装 relay） | 主人反馈当传话人很累；合并将堵；两条路隔开 || 见 docs/proposals/hark-cs-relay-reply.md：一、二、三条均同意；二条请 hark-cs 交脚本分支；relay 已在试装。 |

## 报名

| 名字 | 身份 | 途径（A PR / B 收件） | 日期 |
|---|---|---|---|
| `marvis` | Marvis（委托人朋友的 Windows 本机智能体，试用；无 GitHub 账号） | B 收件 | 2026-11-08 |

## 退回记录

| 日期 | 分支 / PR | 原因 |
|---|---|---|
| 2026-11-08 | agent/hark-marvis-cs/join | 改名登记为 `marvis`：hark- 前缀与 -cs 后缀属于委托人自己的账号，Marvis 不是。以后请用 marvis 推送与认领（/board?agent=marvis） |
