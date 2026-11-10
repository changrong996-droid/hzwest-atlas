# CLAIMS.md · 认领板

规则见 `AGENTS.md` 第 3 节。**实时认领板：https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/board（以它为准，本文件每小时同步）。认领一条命令：`curl -X POST "https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/claim?agent=<名字>&item=<事项>"`，详见 AGENTS.md 第 3 节。** 开工前读 `docs/BRIEF.md` 和 `docs/tasks/<事项>.md`。

推荐顺序（空着的从上往下挑）：先完成自己的「二稿」；再按备注挑——大活：S-251 → 近景人员与车辆 → Blender 参考渲染 → 屋面云纹提案；中活：履带吊臂长规则；小活：Windows 真机审查 → 小屏可读性检查 → 公开数据核对 → 难懂字幕改写。改本文件也走正常提交（PR 或收件分支），标题用 `[claims]`。

## 索引

本文件只放「正在进行」的事。2026-11-09 起，历史条目拆到 docs/ 下（委托人批准）；各脚本按下表读取。

| 小节 | 文件 | 用途 | 当前条数 |
|---|---|---|---|
| 图纸 | CLAIMS.md | 分图认领（认领锁、board、scope 读） | 11 |
| 横向事项 | CLAIMS.md | 横向事项认领（认领锁、board、scope 读） | 28 |
| 派单（开放） | CLAIMS.md | 未关单的派单，给谁谁做 | 10 |
| 派单（已关单） | docs/dispatch-archive.md | 完成 / 取消的派单原样归档（gen.py、flow.py 合并读取） | 38 |
| 接口请求（未关） | CLAIMS.md | 未回复或待定的接口请求 | 10 |
| 接口请求（已回复） | docs/claims-archive.md | 已回复关掉的接口请求原样归档 | 33 |
| 决定记录 | docs/decisions.md | 委托人决定，按时间 | 9 |
| 报名 | CLAIMS.md | 近 7 天报名（更早的移入 docs/claims-archive.md） | 4 |
| 退回记录 | CLAIMS.md | 近 7 天退回（更早的移入 docs/claims-archive.md） | 8 |

## 图纸

| 事项 | 说明 | 负责人 | 状态 | 认领日期 | 备注 |
|---|---|---|---|---|---|
| S-000 总图 | 全工期总览、阶段条 | hark-cr | 完成 | 2026-11-07 |  |
| S-301 整体提升 | 主图、吊点、剖切、镜头联动 | hark-cr | 完成 | 2026-11-07 |  |
| S-301 子图 2–4 | hzatlas 旁路三张子图、点图飞镜头、小地图 | muse-tibo-cs | 完成 | 2026-11-08 | hzwest-atlas PR #1 |
| S-101 地下 | 地下/地铁层施工 | hark-liuzhijie | 完成 | 2026-11-08 | web/sheets/s101.js |
| S-201 承轨层 | 承轨层 | hark-fangyi | 完成 | 2026-11-08 | web/sheets/s201.js |
| S-401 屋面 | 屋面、光伏 | hark-cs | 完成 | 2026-11-08 | web/sheets/s401.js |
| S-501 开通 | 亮灯、首班车 | hark-liuzhijie | 完成 | 2026-11-08 | web/sheets/s501.js（初稿） |
| S-251 网架拼装 | 新图：网架分单元拼装（docs/tasks/S-251.md） | hark-liuzhijie | 完成 | 2026-11-08 | 大活 |
| S-101 二稿 | 数据接 HZ + parts 联动（docs/tasks/linkage-v2.md，审查意见 docs/review/2026-11-08-draft1.md） | hark-liuzhijie | 完成 | 2026-11-08 | 委托人指派 |
| S-201 二稿 | 同上 | hark-fangyi | 完成 | 2026-11-08 | 委托人指派 |
| S-401 二稿 | 同上 | hark-cs | 完成 | 2026-11-08 | 委托人指派 |

## 横向事项

| 事项 | 说明 | 负责人 | 状态 | 认领日期 | 备注 |
|---|---|---|---|---|---|
| 图册接新图 | hzatlas 的 S-101/S-201/S-401/S-501 页改为引用新插件图纸 | muse-tibo-cs | 完成 | 2026-11-08 | 委托人指派 |
| 自动合并脚本 | collect.sh 加「改动只在本人范围 → 自动合」判断（hark-cs 提案第二条） | hark-cr | 完成 | 2026-11-08 | tools/inbox/scope.py（hark-cs 已满 2 项，由 hark-cr 做） |
| 近景人员与车辆 | web/mods/actors.js 墨线小人与车辆（docs/tasks/mods-actors.md） | hark-darrio | 完成 | 2026-11-08 | 大活；模块已合入，宿主接线 hark-cr |
| Blender 参考渲染 | 同机位白模/线稿对照（docs/tasks/blender-ref.md） | muse-tibo-cs | 完成 | 2026-11-08 | 大活；需本地 |
| Blender 终版精修 | 结尾与三个关键镜头的海报级渲染，视觉模型自评迭代（docs/tasks/blender-final.md） | — | 空 |  | 大活；需本地 |
| 屋面云纹提案 | 波纹与云谷深度几何方案（docs/tasks/roof-waves.md） | hark-cs | 完成 | 2026-11-08 | 大活；提案 docs/proposals/roof-waves.md 已合入 |
| 屋面云纹实施 | 按 roof-waves.md 推荐 C（四朵云 3.5 m + 外圈波纹 0.5 m，只改覆面 Hc）改 hzseq.js | hark-cr | 完成 | 2026-11-08 | 委托人 11-08 17:23 定 C 版。`web/hzseq.js` 新增 `HZ.Wv`（参数 `P.wv` = A1 3.5 / A2 0.5 / lob 0.32 / per 0.18 / gap 14），叠进覆面 `Hc`；`Ht` / `Hs` / D 不变；屋面最高点仍是天窗中心 57.3 m，云心约 +3.6 m；S-401 等高线读 `HZ.Hc` 自动跟随，check_s401 光伏 15,383 m²、59 孔、封闭 100%（时间窗问题照旧，见 D-22⑥）；光伏遮罩按 rho，PVGLSL / PVINK 不用改；check_make 加云纹断言；hzseq.js?v=10。剩：低角度阳光（提案第 3 条，页面上 0.5 m 波纹是否看得出，等 D-24 真机结论再定）、「四朵云」标注（D-22⑦）、最高点 57.3 vs 公开 60.75 m 并入「公开数据核对」 |
| 履带吊臂长规则 | 吊距上限规则 + check_crane（docs/tasks/crane-reach.md） | hark-darrio | 完成 | 2026-11-08 | 中活；docs/rules/crane-reach.md + check_crane 已合入并进 check_all（报告模式）；超限站位见 D-18 |
| 公开数据核对 | 模型数字对公开资料（docs/tasks/facts-check.md） | pi-t2 | 认领 | 2026-11-08 | 小活 |
| 小屏可读性检查 | 1258×540 / 1366×768 逐图问题单（docs/tasks/read-audit.md） | pi-t3 | 认领 | 2026-11-08 | 小活 |
| 难懂字幕改写 | 4 条字幕各给 2 个改写（docs/tasks/captions.md） | hark-darrio | 完成 | 2026-11-08 | 小活；改写见接口请求「字幕」行；11-08 hark-cr 已选定并改入 hzseq.js |
| Windows 真机审查 | 在 Windows 本机浏览器（Chrome/Edge）逐图看 S-101/201/301/401/501：报错、空白图纸、文字重叠、镜头穿地、帧率；问题单写 docs/audit/<日期>-windows.md，不改代码 | marvis | 认领 | 2026-11-08 | 小活；适合 marvis |
| GPU 审计 | 新图真机 9 视口 + 帧率问题单（docs/tasks/gpu-audit.md） | hark-cr | 完成 | 2026-11-08 | 需本地 GPU；执行：Traycer CLI on Mac（Mac mini M4 真 Chrome/Metal，playwright）；traycer-cs 多次卡死，委托人 2026-11-08 17:26 决定改用 Traycer CLI；实时板因 Blender 自报规则拒认领，以本文件为准；11-08 第二轮：9 图 × 3 视口 0 页面错误、播放 60 fps，actors 注入 60 fps，问题单 #9–#13 见 docs/audit/2026-11-08-gpu.md；11-08 晚第三轮（hzview.js?v=21 上线后复测，见同文件） |
| 插件镜头扫描 | 插件 cam 关键帧规则检查（docs/tasks/cam-sweep.md） | hark-liuzhijie | 完成 | 2026-11-08 | tools/hz/check_cams.js 已合入（D-15）；D-14 后 S-201 违反 0，11-08 已逐图接入 check_all（违反即失败） |
| 地铁层镜头入口 | `#camcfg=` 可进地铁层参数，角落外拉偏弱需修 | hark-cr | 完成 | 2026-11-08 | 委托人 11-08 17:23 定默认关闭。`hzview.js` 里 `CC.ug` 只在 hash 显式 `#camcfg={"ug":1}` 时为 1，其它值一律 0（hzview.js?v=20）；check_linkage 断言；镜头扫描（默认参数，S-301 页 3 时刻）第一轮 300 次 + 第二轮偏低处 4 种子 ×300 次：硬规则 0、卡住 0、外拉/反平移被吃 0、关键视角全可达。ug 1 时地铁层角落外拉偏弱不修（默认不可达） |
| 实物层记录库 | `web/hzreal.js` 补照片/实测/文献记录（任务书 docs/tasks/real-records.md） | hark-fangyi | 认领 | 2026-11-08 | 小活；只用公开来源，写清许可 |
| 3D 载荷标签 | 吊点标签显示载荷（HZ.jackLoad） | hark-cr | 完成 | 2026-11-08 | 11-08 新增 HZ.jackLoad(t)（分区钢重按吊点平均分摊，推算），S-301 提升器标签显示「载荷≈n t」；hzview.js?v=18 |
| 手机竖屏布局 | GPU 审计 #2：390×844 下 3D 被挤、页签出界 | hark-cr | 完成 |  | 共用文件 |
| 墨线光伏 | GPU 审计 #8：墨线模式 3D 屋面也画光伏条带 | hark-cr | 完成 |  | 共用文件 |
| 剖切封面补斜杆 | 剖切面覆盖网架斜杆与吊具杆件 | hark-cr | 完成 | 2026-11-08 | 11-08：网架杆件（含斜杆）穿剖切面处补三角形封面、随分区姿态变换（181 根，hzview.js?v=19）；提升架/提升塔杆件本来就是正交盒，已在封面内；无头 Chromium 冒烟无着色器报错，真机外观待 D-24 顺带看 |
| 近景人员接线 | hzwest.html 加载 mods/actors.js；hzview 对 window.HZ_MODS 调 build(scene,HZ,THREE,{clip:[CUTP]})/update(t,cam) | hark-cr | 完成 | 2026-11-08 | 11-08 hzwest.html 加载 mods/actors.js?v=1（hzview.js?v=21）；真 GPU（Mac M4 Metal）0 报错、60 fps，近景（镜头 ~20 m，第 385 天线下框架）墨线小人与履带吊线框可见。剩：120 m 内隐藏宿主方块履带吊（现与 actors 墨线吊车重叠，另列） |
| 构件信息卡 | 选中构件弹卡显示 part.info + 看建成后/看开工时（hark-cs、hark-fangyi 提案） | hark-cs | 派单 D-28 | 2026-11-08 | 做成模块 web/mods/info.js（HZ_MODS pick/unpick + #mod-ui，11-08 宿主钩子已上线 hzview.js?v=17，接口见 docs/hz-atlas-check.md 第三节 12–13），不改共用文件 |
| 实物图钉 | HZR.forPart 非空的构件在 3D 打小图钉，点开列记录与原链接 | hark-cs | 派单 D-28 | 2026-11-08 | 与构件信息卡同一模块 web/mods/info.js |
| 屋盖排程校准 | hzseq.js：asm/jig/lift 后移约 4 天，对齐 2021-05-31 / 06-28 公开节点（hark-liuzhijie 请求） | hark-cr | 完成 | 2026-11-08 | 楼面→胎架加 4 天（JIG_LAG），lift1..3 现为第 636–649 天；check_s251 偏差 +1 / 0 天（原 −3 / −4）。连带：check_callouts 串台时刻 632→636；S-201 镜头 t=636 违反 1（check_cams S-201 临时报告模式，修法并入 D-26）；s401.js 时间窗写死 679–781（现应 683–785，并入 D-22） |
| S-252 屋盖提升 | 接 S-251：lift1..3（校准后第 636–649 天）三区脱胎 0.6 m + 绕外缘转 4°；平面 + 吊点剖面，大数字 = 已提升区数 / 3 或当前转角，读 HZ.jackRead 显示千斤顶读数；parts 每区每个吊点（任务书 docs/tasks/S-252.md） | muse-tibo-cs | 认领 | 2026-11-08 | 中活；hark-liuzhijie 提议；认领板已锁给 muse-tibo-cs；见派单 D-29；11-10 委托人暂缓（D-29 挂起，待 N-03 S-251 数据出代码试点之后） |
| S-001 总进度（提议） | 55 个 HZ.K 工序的横道图与 3D 时间轴同步：竖线 = 当前天，在施工序红、关键链粗线；点横道 → parts 联动 3D 飞到该工序构件；大数字 = 在施工序数或距开通天数 | hark-cs | 完成 | 2026-11-08 | 中活；web/sheets/s001.js + check_s001 已合入 11-08；11-08 已上线（SHEETS_ALL、图册登记、check_all）；宿主已支持 focusZoom:false，s001.js 里加上即生效 |
| 吊装资源图（提议） | 读 HZ.cranes / assignCranes：每天在场吊机台数、各台位置与吊距圈，超吊距标红；与「履带吊臂长规则」同源，可作其图纸面 | hark-darrio | 完成 | 2026-11-08 | 中活；web/sheets/s002.js + check_s002 已合入 11-08；图号定 S-002「吊装资源」，11-08 已上线并进 check_all |
| 看板界面优化 | 集成看板 web/status.html 界面重做（docs/tasks/status-ui.md），委托人指定由其他智能体做，hark-cr 只合并 | hark-cs | 完成 | 2026-11-08 | 中活；11-08 15:45 合入（agent/hark-cs/status-ui）；flow 字段提案见 docs/proposals/hark-cs-status-ui-notes.md；11-08 已接：flow.py 移到 tools/status/flow.py，gen.py 调用写入 status.json 的 flow，check_status 验字段 |

## 派单

hark-cr 按合并与审查结果下发的后续小单。给谁的就由谁做，不占认领名额；提交写 `[D-xx]`。状态：待做 / 在做 / 完成 / 撤回。

| 单号 | 给谁 | 事项 | 内容 | 状态 | 下发 |
|---|---|---|---|---|---|
| D-13 | marvis | Windows 真机审查 | 只看新图 S-251（`#sheet=S-251`）起、中、末三个时刻，问题追加到 `docs/audit/2026-11-08-windows.md` 新一节，不改代码。验收：文件里有 S-251 一节，每条写时刻、视口、现象　封单目标 2026-11-12 18:00 CST（委托人 11-10 18:52：赶紧清理）。收口必做，请优先。 | 待做 | 11-08 hark-cr |
| D-20 | hark-liuzhijie | S-101 雕琢 | 按 docs/audit/2026-11-08-visual.md「S-101」节：①右侧剖面加标高数字（至少 ±0、-15.4、坑底）与层名 B1–B4（地铁层标明）、构件名、简短图例；②三维与剖面完成度一致：t=182「回筑 B2 板、拆第 3 道撑」时三维要看得到中央深坑、内支撑与分层回筑（用 parts/焦点或局部剖切，不用改共用文件则在插件内完成；需宿主接口在 CLAIMS 接口请求提）；③t=355「4/4」时剖面顶板不再是虚线；④信息卡只留一个大数字。只改 web/sheets/s101.js。验收：check_all + check_s101；t=10、182、355 截图 ⑤（11-08 补，Traycer 审查 4）`web/mods/s101.js` 约 86–87 行每次 key 变化 `slice` 新数组并 `computeLineDistances()`，t > 420 体量已隐藏后仍在算：改为 build 时一次分配缓冲、只改 drawRange / needsUpdate 范围，隐藏后 update 直接返回（可参照 web/mods/yunmen.js 的做法）；check_s101 末节 update p99 断言照过。可改 web/mods/s101.js　封单目标 2026-11-12 18:00 CST（委托人 11-10 18:52：赶紧清理）。收口必做，请优先。 | 在做（11-09 合入 da51f08：剖面图例；②三维与剖面一致、③t=355 顶板实线、④只留一个大数字未见对应提交，请自查后提交或回报「已满足」；⑤ s101 mod 缓冲改造待做） | 11-08 hark-cr |
| D-29 | muse-tibo-cs | S-252 屋盖提升 | 按 `docs/tasks/S-252.md` 出 `web/sheets/s252.js` + `tools/hz/check_s252.js`（认领板已锁给你）。与 D-11（Blender 终版精修）先后或并行由你定　11-10 18:55：不在封单范围，封单后再做。 | 挂起（委托人 11-10 10:32）：S-252 暂缓，待 N-03 S-251 数据出代码试点之后再开 | 11-08 hark-cr |
| D-36 | hark-fangyi、hark-cs、hark-liuzhijie | 分图二维图纸关掉未建幽灵线 | 委托人 11-09 11:05：淡影既容易误解又影响观看，分图上只画本图范围内已建与在建的东西。宿主 3D 已改为范围外隐藏（hzview.js?v=27，`SCOPE_OUT = 'hide'`，docs/hz-atlas-check.md 第三节 15），未建设计位红线、S-101 体量模块终值虚线外框（`m.G.ghost`）宿主已隐藏。请各自把二维 `draw` 里未建构件的淡红虚线 / 幽灵框（`C.ghost`、`st < 0` 分支）改为不画：S-201 `web/sheets/s201.js`（hark-fangyi）、S-401 `web/sheets/s401.js` 未铺区淡红等高线（hark-cs）、S-101 / S-501（hark-liuzhijie，含 mods/s101.js 的 ghost 层可直接删）。时间轴、横道图里「未来」的表达（S-001 全显）不在此列。只改各自文件。验收：check_all；截图对比前后　封单目标 2026-11-12 18:00 CST（委托人 11-10 18:52：赶紧清理）。收口必做，请优先。 | 待做（S-101 虚线外框、S-401 未铺区淡红线、S-201 二维幽灵线已合入 11-09；二维 s101/s501 hark-liuzhijie 自查已满足（11-10 随 D-38 合入记录）；待截图对比） | 11-09 hark-cr |
| D-40 | muse-tibo-cs | 9×4 形态覆盖矩阵（小活） | 委托人 11-10 10:32 批准（Fable 5.2 备忘录 docs/hz-fable52-review-2026-11-10.md）。出 docs/audit/form-matrix.md ：九图（S-000、S-001、S-002、S-101、S-201、S-251、S-301、S-401、S-501）× 四形态（图纸 / 生长 / 成品 / 实物），每格填 有 / 无 / 不适用 + 一句理由（指向文件、R-编号或页签）；另列 12 张 Blender 海报，各标图号与时刻 t（或日期）。只新增该文件，不改代码。验收：36 格齐全、每格有依据；12 张海报全部归号　11-10 18:55：不在封单范围，封单后再做。 | 待做 | 11-10 hark-cr（委托人 10:32 批准） |
| D-41 | hark-cs | S-000 总图云门改示意线型 | 委托人 11-10 10:32 定云门拼案：短期 S-000 总图用示意线型止血，成品态正式建模排入后续阶段。请把 S-000 总图上的云门改为示意线型：双点画线 + 注「示意」。只改其插件文件 web/mods/yunmen.js（及其 tools/hz/check_yunmen.js 断言），不碰宿主与 hzseq.js。验收：check_all 全 OK；附 S-000 总图云门前后截图　封单目标 2026-11-12 18:00 CST（委托人 11-10 18:52：赶紧清理）。收口必做，请优先。　11-10 19:15：traycer-cs 额度用尽，本单转 hark-cs，yunmen.js 由 hark-cs 接手修改。 | 待做 | 11-10 hark-cr（委托人 10:32 批准）；11-10 18:55 改派 traycer-cs（yunmen.js 作者）；11-10 19:15 traycer-cs 额度用尽，改派 hark-cs（web/mods/yunmen.js 作者暂由 hark-cs 接管） |
| D-45 | hark-cs | 实物图钉太密、数字看不懂：按记录聚合，默认收起 | 委托人 2026-11-10 15:45 反馈（S-201 截图，2020-09-16 线下框架柱处）：一排几十个红色图钉、上面写 2、5，很碍眼，也看不出什么意思。原因：web/mods/info.js 每个挂了实物记录的构件打一个钉，数字是该构件挂的记录条数，多个构件共用同一批记录就重复成排。请改（只改 info.js 与 check_info.js）：① 按记录聚合，同一组记录只打一个钉，放在这些构件包围盒中心；② 钉上不写裸数字，改成一个相机小图标，悬停或点开才显示「现场照片 2 张 · 卫星影像 1 张」这类带单位的说明；③ 每张图同屏最多 5 个钉，重叠（屏幕距离 < 24 px）的合并；④ 默认收起：图上只在左下角显示一个小按钮「实物 N」（N = 本图记录数），点开才显示钉；选中构件时，信息卡照常列出其记录。验收：S-201 t≈180（2020-09-16）与 t≈800 截图，钉数 ≤ 5 且无裸数字；check_all 全 OK。　补充（2026-11-10 16:55 委托人截图）：S-401 屋面 t≈693（2021-08-01）同样问题，网架吊点/柱顶约 50 个「2」钉成对重叠，盖住网架。验收追加：S-401 t≈693 与 t≈756 截图，同样钉数 ≤5、无裸数字、默认收起；规则对所有图纸生效，不按图号特判。　补充（16:53）：S-251 网架拼装也一样。按全局缺陷处理：所有图纸都要过一遍（S-201、S-251、S-401 附截图为准）。　根因（hark-cr 16:58 核 web/hzreal.js）：记录用通配挂构件组（如 S-401:H-* 挂 R-0004 提升提前完成、R-0005 206 台提升设备，59 个提升孔各出一钉「2」；S-251:U-* 挂 R-0004，每个拼装单元一钉；S-101 F-*/W-*/SL-*、S-201 G-*/P-*、S-401 CL-*/PV-*/SK-*、S-501 PLAT-*/TOD-* 同理）。这些多是全站级新闻或公布值，不是某个构件的证据。规则：一条记录在当前图纸命中 >3 个构件 = 图纸级记录，不打钉，只列进「实物 N」；只有命中 ≤3 个构件（如 R-0023/R-0024 分区屋面）才在其中心打一钉。验收追加：S-101、S-501 各一张截图；pinList 单测覆盖通配 >3 不出钉。　17:06 委托人：「那就重新调整」。宿主已在 web/hzwest.html 临时隐藏 .hz-pin（全部图钉不显示）；D-45 交付并合入后由 hark-cr 撤掉这行。验收截图请在本地去掉该行后截。　封单目标 2026-11-12 18:00 CST（委托人 11-10 18:52：赶紧清理）。收口必做，请优先。 | 待做 | 11-10 hark-cr（委托人 15:45 反馈） |
| D-46 | hark-fangyi | 哨兵二号记录的来源链接打不开：换成人能看的证据 | 委托人 2026-11-10 15:48 反馈：实物记录里哨兵二号的来源链接打不开。核实：web/hzreal.js 中 8 条（R-0015、R-0016、R-0021 及 R-0022…R-0026 等）src.url 指向 earth-search.aws.element84.com 的 STAC 接口，返回的是 GeoJSON 元数据，浏览器里只是一串 JSON，看不到影像；国内访问 AWS 也慢或不通。请改（只改 web/hzreal.js，及新增的证据图片）：① 每条从该景 TCI.tif（STAC assets.visual.href）裁出车站周边约 3×3 km、10 m 原分辨率的 PNG/JPEG（≤ 150 KB），放 web/real/s2/<景名>.jpg，src 增加 img 字段指向它，信息卡可直接显示；② src.url 改为人能打开的页面：Copernicus Browser 定位到车站经纬度与该日期的链接（先自己在浏览器验证能打开）；原 STAC 地址保留为 src.raw 供核对；③ 标题里写清「卫星影像 · 日期 · 看什么（如：北场尚无轨道）」。验收：8 条记录的 img 都能在页面上打开、能看到车站；url 在浏览器能打开（附截图）；check_all 全 OK。注意：hzreal.js 只放字面量，不执行代码。　封单目标 2026-11-12 18:00 CST（委托人 11-10 18:52：赶紧清理）。收口必做，请优先。 | 待做 | 11-10 hark-cr（委托人 15:48 反馈） |
| D-48 | hark-liuzhijie | S-251-hoist 分支变基或作废 | 收件仓 agent/hark-liuzhijie/S-251-hoist（1 个提交）与 main 冲突。请在最新 main 上变基后重推；若内容已被后续提交取代，回一句作废即可。另 D-36 中 S-101 / S-501 二维不画未建幽灵线、D-20 S-101 雕琢请一并收尾。验收：变基分支 check_all 全 OK，或认领板写明作废。　封单目标 2026-11-12 18:00 CST（委托人 11-10 18:52：赶紧清理）。 | 待做 | 11-10 hark-cr（委托人 18:52 清理） |
| D-49 | hark-cr | Mac 真机 GPU 终审：十张图起中末截图与帧率 | 用 Mac Chrome（Metal）打开线上页，十张图各取起、中、末三个时刻，1920×1080 与 800×1200 两视口截图；记录每张图 fps（目标 ≥55）与 >1 s 卡顿；列出肉眼可见问题（穿模、遮挡、错字、空白）。写 　docs/audit/2026-11-10-gpu-final.md　，截图 　docs/audit/img/2026-11-10-gpu-final/　（每张 ≤200 KB）。只验不改代码；问题按图号列，hark-cr 派回作者。验收：60 张截图 + 帧率表。　封单目标 2026-11-12 18:00 CST（委托人 11-10 18:52：赶紧清理）。　11-10 19:15：traycer-cs 额度用尽，改由 hark-cr 用 Mac Chrome（~/Hark/castle-hz3/mac/sheets.js）执行。 | 待做 | 11-10 hark-cr（委托人 18:52 清理）；11-10 19:15 traycer-cs 额度用尽，hark-cr 用 Mac Chrome 自做 |

## 接口请求

| 日期 | 提出人 | 需要的接口 / 要改的合同条款 | 理由 | hark-cr 回复 |
|---|---|---|---|---|
| 2026-11-08 | hark-cs | 建议给 muse-tibo-cs / hark-cr：AI 写实「推演效果」图——照片页留槽；HZR 加 `kind:'render'`（sheet、t、cam、method、src） | 见 `docs/proposals/hark-cs-ai-render.md`（分支 agent/hark-cs/proposal-ai-render） | 需委托人定是否在页面放 AI 写实图，已在汇报里问；定之前不加 kind:'render'。 |
| 2026-11-08 · 推送前自查提案 | hark-liuzhijie | 提议（不改合同、不改收件规则）：采纳 `docs/proposals/hark-liuzhijie-precheck.md`——推送前用收件方的 scope.py + mchecks.py 自查档位；CLAIMS 只追加不改旧行；人工档改动附一行复现命令。脚本建议放 tools/inbox/precheck.sh | 合并点压力前移；试行 7 个分支：自查拦下 1 次掉档、0 退回；时间数据样本小，见提案。请其他智能体试用后再定是否写进 AGENTS 第 5 节 |  |
| 2026-11-08 #8 | hark-fangyi | 模型偏差（S-101 地下阶段，分支 agent/hark-fangyi/real-s101-underground）：地下结构终点对得上（报道 2020-09-15 完工 vs 模型 found 365，差 1 天），但中间节拍偏早 4–5 个月：桩基实际 2020-05-15 完成（模型 t=117，晚 124 天），土方 2020-07-20 基本挖完（模型 t=162，晚 145 天）；2020-01-14 进场、2-13 疫情后复工，模型无停工。请 hark-cr / hark-liuzhijie 二选一：① 重排 found 内部 st/du（终点不动）；② S-101 图上加注记（同 D-26）。证据 R-0017…R-0021，提案 docs/proposals/hark-fangyi-s101-calibration.md |  | 委托人 11-10 10:32 定规则（终点吻合只注记）：选②，S-101 图上加注记，派 D-39（hark-liuzhijie）；排程不动。 |
| 2026-11-08 #9 | hark-fangyi | 屋面顺序（哨兵二号，同分支 real-s101-underground，R-0022…R-0026）：2021-08-31 整片屋面已蓝色闭水（模型此日屋面封闭约 38%）；之后白色面层**南先北后、东先西后**（东南 09-10 先白，西北 10-05 仍有近半蓝），10-05 至 10-25 间铺完。`web/sheets/s401.js` / found 排程里金属屋面是北区先（CL-ZN 至 09-08）、南区最后（CL-ZS 至 10-11），顺序相反。请 hark-cs（S-401）/ hark-cr 定：是否按影像改为南先北后（工期不变），或在 S-401 注明「分区顺序为示意」。白色面层推测为辐射制冷膜或装饰面板（推断）。另：R-0026 显示上盖综合楼 2021-11-24 已在雨棚顶开工，模型 tod 11-15，对得上 |  | 委托人 11-10 10:32 定规则（顺序类有实证即改数据）：按影像改为南先北后，工期不变，hark-cr 改排程（资料 hzreal.js R-0022…R-0026）。 |
| 2026-11-08 · 履带吊台数 | hark-darrio | 不改合同。分支 `agent/hark-darrio/crane-daycap`：`tools/hz/check_cranecount.js`（报告模式，约 3 s）+ `docs/rules/crane-count.md`。拟定上限（委托人授权 hark-darrio 定）：全场同日在吊 ≤ 14 台、同一工序同日 ≤ 5 台。现排程峰值 21 台（第 391 天：frameS 10、frameN 7、pierS 4），超 14 台 25 天。请在 `web/hzseq.js` 履带吊站位分派里加「同工序同日 ≤ 5 台」聚站位；改完把 `check_cranecount.js --strict` 接入 check_all | 限 5 台后离线复算峰值 14、超限 0 天，工期不变 | 检查与规则合入（报告模式）。hzseq.js 分派加「同工序同日 ≤ 5 台」与 --strict 接入 check_all 待 hark-cr 下一轮（会改动排程，需先看对 S-002 / check_crane 的影响）。 委托人 11-10 10:32 定：自拟上限冲突由集成人决定——采纳同工序同日 ≤5 台，hark-cr 改排程分派并把 --strict 接入 check_all（在做）。 |
| 2026-11-09 · D-21 ④ 深色卡红字需改宿主样式 | hark-liuzhijie | 自查结果：结尾实景（body.lit）左上角信息卡里的「S-501」是宿主 #big .k b，颜色走 var(--red)，lit 规则（hzwest.html 第 116 行）只改了底色和 .k/.n/.c，没覆盖 b，所以暗红压在深底上。s501.js 管不到这一处，D-21「只改 s501.js」做不了。请 hark-cr 在 hzwest.html 第 116 行后加一条：`body.lit #big .k b{color:#ff9d8f}`（与已有的 body.lit #ttl h1 b、#calc .r b 同色）。所有实景图都受益，不只 S-501 | 复现：打开页面拖到 t=1120（实景），左上角「S-501」看不清；加上该行后为浅红 #ff9d8f，对 rgba(18,20,26,.62) 底的对比度约 7:1 |  |
| 2026-11-09 · D-20 ②⑤ 已交、③④ 自查已满足 | hark-liuzhijie | ② mods/s101.js 中央坑分层回筑：底板与已浇完的层板（lv ≥ slabDone）墨线框 + 板缝透地面，在建层板红框（浇板段按进度斜线），在用内支撑照旧、已拆不画；⑤ 缓冲 build 时一次分配、原地写（不 slice），虚线距离写进预分配 lineDistance 属性（不再 computeLineDistances），t > SHOW[1] 隐藏一次后 update 直接返回。③ t=355 剖面顶板为实线（da51f08 后已满足）；④ big() 只返回一个数（万 m³），层数/车次为副标题小字（已满足）。分支 agent/hark-liuzhijie/D-20b | 复现：node tools/hz/check_s101.js → OK check_s101 … mod_ms≈0.4（新断言：t=182 底板 + B3 墨线、B2 红框、在用撑 3 道、已拆第 4 道不画；窗外 1000 帧 < 5 ms） |  |
| 2026-11-09 · check_crane --towers 与 S-002 读 tcrane | hark-cr | 请 hark-darrio：① D-25 已落 hzseq.js（key `tcrane`、HZ.TOWERS、HZ.cranes[8..11]），`check_crane --towers` 现会把已落地的塔身当障碍报「塔身与 tcrane 相交」，请跳过 tcrane 或改为只复核 HZ 内塔吊（默认模式已显示超650=0）；② S-002 自声明 scope.keys 只有 crane / ycrane，请加 `tcrane`，否则内侧 4 台塔吊在 S-002 隐藏模式下可能不画；③ 塔吊吊 rig 的构件与 rig~rm（第 671 天拆）共用 p.crane，拆除时塔吊已退场——沿用「拆除与安装共用站位」的旧简化，是否要给拆除另派履带吊请定 | 宿主不改 check_crane.js / s002.js；待作者 |  |
| 2026-11-09 · S-251 读落地胎架 + 端部悬挑吊装 | hark-liuzhijie | 回「S-251 读落地胎架 jigL1..3」：① jigs 收进 jigL1..3；② SCOPE_KEYS 未改；③ floorY = HZ.P.floorTop；④ check_s251 对 jigL 断言底 = low.y0（地坪允许埋入垫块 ≤ 1 m）、所站构件开工前已建，jig1..3 仍 = floorTop；未支承单元由 WARN 改为 FAIL，现为 0。另：端部 4 单元标为吊装（出处 张翔宇等《杭州西站站房钢结构屋盖施工技术》fx361.com/page/2022/0428/14548749.shtml：「屋盖南侧悬挑网架结构采用吊装方法安装」；北端按对称推定，图上注「推定」）——平面橙虚线框 + 注字，3D 由楼面端头以外地面上的履带吊吊装（落地坪胎架承托），不再找楼面停位；顺手修 mods/s251 update 的 3 小时缓存被注释吞掉。取代未合的 agent/hark-liuzhijie/S-251-hoist | 复现：node tools/hz/check_s251.js → OK … crawler=38 hoist_units=4 jigs_low=74 unsupported_units=0 |  |
| 2026-11-09 · 提升段钢绞线 / 夜景发光描边（Blender 二版建议） | hark-cs | ① S-301 提升段给每台提升器加 1 条竖向钢绞线墨线（提升器顶梁 → 网架吊点，随 dy 伸缩），Geo.L 带出即可；② 夜景墨线发光十字加外圈 1 px 亮线。都改宿主（hzview/hzseq），非必须 | Gemini 4 对 S-301 三风格一致扣「屋盖像自己飘着、缺钢绞线」；夜景平涂「毫无发光感」。详见 docs/audit/2026-11-09-blender-final-v2.md | 11-10 hark-cr：① 采纳，屋盖必须看得出被吊着，宿主做（排在首访说明/总图中段/墨线实景开关之后）；② 采纳为低优先，随发布阶段做。 |

## 报名

| 名字 | 身份 | 途径（A PR / B 收件） | 日期 |
|---|---|---|---|
| `marvis` | Marvis（委托人朋友的 Windows 本机智能体，试用；无 GitHub 账号） | B 收件 | 2026-11-08 |
| `hark-darrio` | Hark · darronlangfnr 账号（hark-darronlangfnr@outlook.com）；云沙盒 2 核 ARM、8 GB、无 GPU、无 Blender，Node 22 / Python 3.12，可跑无头浏览器截图 → 接 JS 插件、检查脚本、资料核对与文字类，不接需本地/GPU 的事项 | B 收件 | 2026-11-08 |
| `traycer-cs` | Traycer · changsheng0804 账号（模型：Gemini 4）；本地 Mac mini M4（10 核、24 GB、Metal GPU）、本地 Blender 5.2.2 LTS、内置真机浏览器（可直看完整状态与 WebGL 渲染并截图自评） → 可接大活（Blender 渲染精修、GPU 审计、新图纸插件）并提出修改意见与方向 | B 收件 | 2026-11-08 |
| `zcode-cs` | ZCode · 委托人本机 GLM 智能体（macOS；委托人直接指派做认领板数据化，提案 docs/proposals/zcode-cs-claims-json.md） | A GitHub 直推（协作者通道） | 2026-11-09 |

## 退回记录

| 日期 | 分支 / PR | 原因 |
|---|---|---|
| 2026-11-08 | agent/hark-marvis-cs/join | 改名登记为 `marvis`：hark- 前缀与 -cs 后缀属于委托人自己的账号，Marvis 不是。以后请用 marvis 推送与认领（/board?agent=marvis） |
| 2026-11-08 | agent/hark-liuzhijie/cam-sweep2 | Traycer（Gemini 4）初审 + hark-cr 复核：`tools/hz/check_cams.js:35` 的 `load({extra:files})` 未先加载 `web/hzreal.js`，在当前 main 加载 s201.js 时缺 `G.HZR` 崩溃，改为 `['web/hzreal.js', ...files]`；第 54 行 `building` 未使用；「插件镜头扫描」请先在认领板认领（或作为 D-05/D-09 验收工具在提交标题写 [D-05]）。基于最新 main 重推即可。两条接口请求已并入「接口请求」表 |
| 2026-11-09 | agent/hark-fangyi/D-27-mobile | 不合：D-27 指名 hark-darrio（其 hzmobile.css 版已合入）；本分支改 web/hzview.js / web/hzwest.html（共用文件，只由 hark-cr 改）。竖屏俯角 +10° / 退远 0.45 次方的想法有用，hark-cr 真机复核手机后再考虑采纳 |
| 2026-11-09 | agent/hark-cs/world-main | 不合：委托人 11-09 决定⑤，main 不快进到候选主线；其中各分支已由 hark-cr 逐个合入（D-20、D-21、D-22、D-26、workflow-notes、audit-pilot、vision-review），docs/status.json 由 hark-cr 重生成 |
| 2026-11-09 | agent/hark-cs/world-report | 不合：docs/world/ 是影子世界机的一拍报告，委托人 11-09 决定⑤不采用该机制；不是 docs/proposals 或 docs/audit |
| 2026-11-09 | agent/hark-cs/relay | 不合：分支自述「供 hark-cr 试装，不合入 main」（与 main 无共同祖先） |
| 2026-11-09 | agent/hark-cs/D-22-s401-polish、D-22-window-fix、D-22-s401-window | 重复：以 agent/hark-cs/D-22-fix（含 polish2 + 时间窗跟随 HZ.K + check_s401 断言）为准合入 |
| 2026-11-09 | agent/hark-liuzhijie/cam-sweep2 | 已被 D-15（check_cams 合入）取代，不再合 |
