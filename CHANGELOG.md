# CHANGELOG

2026-11-14 · [check_crane] · hark-darrio · --towers 复核 HZ 已派 tcrane 的 8 吊，均在额定内
2026-11-11 · [inbox] · hark-cr · 收件镜像 /health 第一行改为当前主镜像（与 AGENTS.md 6B 一致）
2026-11-11 · [inbox] · hark-cr · 收件镜像改每 80 分钟交替、交接后立刻挂起下班机器（委托人定）
2026-11-11 · [inbox] · hark-cr · 收件改两台镜像轮值（test-5/test-4，AGENTS.md 6B），推送时 check_all 进度实时回传（修 502）
2026-11-11 · [D-52] · hark-darrio · S-002 小画幅 arc 验收说明与截图
2026-11-11 · [D-50] · muse-tibo-cs · hzatlas 高分屏小地图偏位与切页残留修复
2026-11-11 · [seal] · hark-cr · 分图范围外模块改用图层隐藏，切回时不再强行显示（S-101 土方体块常驻）；hzview v=37

2026-11-11 · [D-52] · hark-darrio · S-002 小画幅不画负半径平面，check_s002 加用例
2026-11-10 · [D-47] · hark-darrio · 验收截图缩小存档（2.8→1.3 MB）
2026-11-10 · [D-48] · hark-liuzhijie · S-101/S-501 收尾验收截图与记录

2026-11-10 · [D-47] · hark-darrio · 发布前无头验收：1920×1080 与 390×844 两视口 28 条全部通过，另记 3 条手机小问题（docs/audit/2026-11-10-release-check.md）
2026-11-10 · [host] · hark-cr · 说明卡每次载入都弹（宽屏也用短卡 #intro，不再记 localStorage、不再自动展开 #info），约 8 s 自收、卡底倒计时细条、悬停暂停，✕ 或任何交互（拖时间轴、点画面、滚轮、按键）立即收起；总图 S-000 无 hash t 时默认开场改为屋盖整体提升 wlift 中点 t=661（hzseq 实排 659–663）；#b-mode 改常显分段开关「墨线｜实景」（手机也显示两字），说明卡收起后自动切实景 2.5 s 再回墨线（复用 setMode，用户先动开关则不切）；说明卡与预览期间暂缓自动播放、结束后照常播；?noIntro / navigator.webdriver 不弹；hzview.js?v=35
2026-11-10 · [REL] · hark-cr · 构件上下游关系（委托人批准「点一个构件，上下游在图纸和三维里同时亮起」，分层）宿主部分，分支 agent/hark-cr/relations：新增 web/hzrel.js（HZ.rel(sheet, id, t) 只读引擎 supP / pred / 吊车分派）；hzseq.js?v=15 supRule 记构件级 p.supP（排程不变）；hzview.js?v=33 选中即 3D（aRl/uRel：上游蓝、下游绿、选中黄、其余淡，范围外上下游照画）+ 图纸叠层同时亮、ctx.rel 交模块、点图纸空白取消；check_rel 接入 check_all；契约与各图数据实况见 docs/tasks/relations.md，卡片第 2/3 层派 D-44（hark-cs）。
2026-11-10 · [copy] · hark-cr · 委托人批准的分层文案上线：#intro 短卡改 L0 粗体一句 + L1 三行（第 2 行用关系高亮上线前版本）；#info 改 L2（一屏不滚动，README 链接），原操作说明 / 计算读数 / 自检 / 事实 / 来源收进折叠「操作、计算读数、规则自检、事实与来源」（id 全保留）；README 顶部 L0 + L1，正文为 L3 全文，原技术段移到「参与与技术说明」
2026-11-10 · [D-42/D-43] · hark-cr · 委托人 13:18 批准光伏铺设改南先北后（与金属屋面一致）：hzview.js 着色器已改在分支 agent/hark-cr/pv-south-first（f4ca2ff，未合 main）；派 D-42 给 hark-cs 同步 S-401 pvFront（175 − 345·u，z ≥ 前沿为已铺），交付后两边一起合入；派 D-43 给 hark-darrio 更新 crane-count.md 现状段（在吊峰值 14 / 超 14 天数 0，在场峰值 16 / 超 14 天数 22）
2026-11-10 · [D-39] · hark-liuzhijie · S-101 信息卡加地下节拍注记（推演 vs 实景）
2026-11-10 · [docs] · muse-tibo-cs · Fable 5.2 第二轮审查文档（fable52-round2）

2026-11-10 · [roof] · hark-cr · 金属屋面 + 吊顶改南先北后（实物 R-0022…R-0025 哨兵二号影像：白色面层南先北后，委托人 10:32 批准）：hzseq.js clad 行 sweep 由 +z 改 −z，总工期与屋面完成日不变（clad 693–755，完成 2021-10-11）；CL-ZS 2021-08-10–09-08、CL-ZM 09-01–09-19（不变）、CL-ZN 09-12–10-11；东先西后需行内按 x 拆块，未做；光伏前沿仍北→南（s401.js pvFront 与 hzview.js 着色器同式）；S-401 图读 HZ 时间自动跟随；hzseq.js?v=14；check_all 23/23（8 片）
2026-11-10 · [crane] · hark-cr · 履带吊同一工序同日在吊 ≤ 5 台（hark-darrio crane-count.md 选项 2，委托人 10:32 批准）：hzseq.js 站位分派按开工先后逐吊派，某天同工序已有 5 个站位时改用同工序当天已在用的站位（过 clashAt 净空、650 t 级吊距够得着，取最近），工期不变；改站位 73 吊、找不到 0（HZ.lift.perMoved / perOver）；在吊峰值 21→14 台、超 14 台 25→0 天（在场口径 21→16，超 14 台 45→22 天，只报告）；check_crane 超650 0 保持；check_cranecount --strict 接入 check_all（22/22→23 项）；hzseq.js?v=13
2026-11-10 · [plan] · hark-cr · 委托人 10:32 批准 Fable 5.2 审查定案：合入 agent/muse-tibo-cs/fable52-memo（a65b063，备忘录与简报原文不改）；decisions.jsonl 新增一条（北极星加底线「凡画出来的要么对得上实物、要么明标推演」；真值冲突按规则处置；收口改封单制 + 陌生人首屏 10 秒测试；S-252 暂缓；云门拼案；不采纳三项）；D-29 挂起（待 N-03 之后）；新派 D-39（hark-liuzhijie，S-101 地下节拍注记）、D-40（muse-tibo-cs，9×4 形态覆盖矩阵）、D-41（hark-cr / Traycer CLI，S-000 云门示意线型）；接口请求 #8 / #9 / 履带吊台数按规则回复；docs/plan.md 北极星加底线、阶段 1 封单制出口、收口之后阶段表；status-blockers 去掉已由规则化解的三项待定与 D-38
2026-11-10 · [claims] · zcode-cs / hark-cr · 合入 agent/zcode-cs/claims-json：认领板数据化，data/claims/*.jsonl（六实体）为真相，tools/claims/gen.js 生成 CLAIMS.md 与三个归档，tools/hz/check_claims.js 校验（接入 check_all）。合并冲突 docs/claims-archive.md 取 main，再用作者迁移器 import_md.js 从 main 现状重生成 JSONL（enrollments 4 · claims 39 · dispatches 38（开放 5）· requests 39（未关 9）· rejections 8 · decisions 8），gen.js 规范化 MD（`||` 空格位、缺列补空、单元格空格；索引报名 3→4 补正）；gen.py / flow.py / board.py / claims_gate.py / scope.py 解析结果与合并前一致；AGENTS 第 3 节加「JSONL 为真相、MD 不手改」；收件机写 JSONL 为第二阶段
2026-11-10 · [D-38] · hark-liuzhijie · S-501 声明整片屋盖 scope.keys（mast、asm1..3、merge、head、sky、clad、pv、ring），check_s501 第 7 节断言开通前 13 天屋盖在场；s501.js?v=5；D-38 完成移入 docs/dispatch-archive.md；check_all 21/21（合入 ae57b2a）
2026-11-10 · [inbox] · hark-cs / hark-cr · 绿档自动合入搬到 GitHub Actions（.github/workflows/inbox-automerge.yml + tools/inbox/automerge.py，提案 docs/proposals/hark-cs-integrator.md）。hark-cr 加固：check job 只读、不留凭据，试合 + check_all 后结果打成 git bundle 上传；push job 才有写权限，只校验 bundle 基于当前 origin/main 且可快进、不执行分支代码后推送；concurrency integrate-main。scope.py AUTO 白名单加作者本人 docs/proposals/<作者>-*.md（AGENTS 5.1）。首跑（手动触发）：合入 0、留下 11（合入 b85317b）

2026-11-09 · [host] · hark-cr · 竖屏 / 窄屏（宽 ≤ 600，或 ≤ 820 且 portrait）首访不再展开整块说明，改为底部三行短版浮卡 #intro（≤ 30vh，贴控制条上沿，不挡 #big）：①这是杭州西站施工顺序的实时预演，工序由规则推导 ②每一帧都在自检：支承、拆除先后、提升净空、吊装覆盖 ③拖动看、点下方图号切换；「完整说明」按钮打开原面板；✕ / Esc 记 hz.introSeen，桌面与跳过条件不变；hzview.js?v=31；check_all 21/21
2026-11-09 · [claims] · hark-cr · CLAIMS.md 拆分：顶部索引表 + docs/decisions.md（决定记录）+ docs/dispatch-archive.md（已关单派单）+ docs/claims-archive.md（已回复接口请求）；gen.py / flow.py 合并读取归档，status.json 加 headline.decisions
2026-11-09 · [host] · hark-cr · 首访引导：#big 顶部加一行副标题「杭州西站施工顺序预演：工序由规则推导，每一帧都在自检（支承 · 拆除先后 · 提升净空 · 吊装覆盖）」（竖屏只留主句、9 px 单行）；说明面板首访自动展开一次（localStorage hz.introSeen，hash 带 sheet= / fv=、?noIntro、navigator.webdriver 时不开）；three 加载去掉 4 s HEAD 探测，直接用 vendor/three.module.min.js（r160）+ modulepreload，import 失败回退 unpkg（importmap scopes 保证同一实例）；hzview.js?v=30、hzmobile.css?v=4；check_all 21/21
2026-11-09 · [S-251] · hark-liuzhijie · 读落地胎架 jigL1..3，floorY=floorTop；端部 4 单元改履带吊吊装；check_s251 未支承单元 0；check_all 21/21
2026-11-09 · [D-25] · hark-cr · 塔吊表落地：hzseq.js 新增 tcrane（HZ.TOWERS，4 台 Liebherr 1000 EC-B 100，臂 31.5 m / Lc 16 / 臂底 64 m，塔位 (±39,−40)(±45,42)，进场 580–590、拆除 614–624，lift1 前退场），进 HZ.cranes 下标 8–11；内侧 mast ×4、rig ×4 改派塔吊，check_crane 超650 0、超1000 0；塔身穿楼板预留洞（p.thru，A2 不计）；check_make 断言与 docs/rules/crane-stations.json 一致；同工序同日 ≤5 台未满足，--strict 不接入（超限清单见 status-blockers）；hzseq.js?v=12
2026-11-09 · [host] · hark-cr · S-251 开口段 / 南北端 7 单元胎架落地（方案①，排程不动）：hzseq.js 新增 jigL1..3（74 组：U-M01..03 落地铁层底板顶 −9.20、U-S01/S02/N01/N02 落地坪 ±0.00 带埋入垫块），开工 / 拆除与本区 jig 同日，下方支承已建、不穿模；构件新字段 p.scopeWith = [工序 key]（hzview.js scopeMask 读，落地胎架与所站地铁层底板随 jig1..3 进 S-251 范围）；hzview.js?v=29；check_make 加断言；check_all 21/21

2026-11-09 · [D-28] · hark-cs · 实物图钉：挂实物记录的构件在 3D 打图钉，点开弹信息卡（info.js?v=2）

2026-11-09 · [D-20] · hark-liuzhijie · S-101 3D 中央坑分层回筑与剖面一致、mod 缓冲复用
2026-11-09 · [D-21] · hark-cr · 宿主 body.lit #big .k b 颜色修正（作者请求）

- 2026-11-10 · [收件] · inbox-bot · 自动合入 agent/hark-cs/relay-selfuse-invite（hark-cs）：[proposal] 给 hark-cr 的 relay 自用试点邀请（与 hzwest 无关，勿合入 main）
- 2026-11-09 · [D-22] · hark-cs · 合入 S-401 图纸标注四朵云「约+3.5 m」与「云的缝（采光顶）」（⑦，所在屋面块铺完才标）；hzwest.html s401.js?v=5；D-22 全部完成，check_all 21/21
- 2026-11-09 · [D-22] · hark-cs · 合入 S-401 窗末西南 el 15° 斜侧机位（⑧，屋面完整入框、四朵云与云缝同框），check_cams 违反 0；hzwest.html s401.js?v= 递增；剩 ⑦ 标注
- 2026-11-09 · [D-22] · hark-cs · 心跳：S-401 下一步排期（先 ⑧ 斜侧机位，再 ⑦ 标注）
- 2026-11-09 · [D-32/D-33/D-36] · hark-fangyi · 合入 S-201：leadAt 铺轨前沿锚点（t=890 红点落在正在铺的股道上）、声明 scope keys（6 m 夹层不算本图）、二维未建幽灵线不再画；hzwest.html s201.js?v=5；check_all 21/21
- 2026-11-09 · [D-34/D-36] · hark-cs · 合入 S-401 声明图纸范围 scope（holes/sky/clad/pv/mast/asm1–3/merge/head），未铺区不再画淡红等高线；check_all 21/21
- 2026-11-09 · [D-36] · hark-liuzhijie · 合入 S-101 体量模块不再画终值虚线外框；hark-cr 同步改 check_linkage 断言（S-501 声明屋盖 scope 则 asm2 须在范围内），为 D-38 让路
- 2026-11-09 · [收件] · hark-cr · 合入 D-37（hark-liuzhijie：S-251 拼装面落到候车层楼面，scope 声明、二维楼板基座、汽车吊只停楼板，check_s251 478 组胎架断言）、D-30+D-35（hark-darrio：S-002 去掉全场 SITE 命中、履带吊稳定 id、声明 scope）、D-31（hark-cs：S-001 深链只高亮不放大）、看图员补评与定型提案车头风挡白缝文档；hzwest.html 插件 ?v= 递增；check_all 21/21
- 2026-11-09 · [host] · hark-cr · 图纸范围改为范围外隐藏（委托人 11:04 淡显太乱、11:05 分图其它淡影一并关）：单一常量 SCOPE_OUT = 'hide'（'ghost' 切回 7e3b03b）；范围外构件与墨线不画、分图不画未建设计位红线；塔吊只留服务本图的（PL.scopeCranes，塔身随之进范围），履带吊随所吊构件，运输车 / 堆场只在现场图 S-002，S-002 连同吊机所吊构件一并画；actors、云门墨线（范围不含 ym）、模块幽灵层隐藏；新 check_scopecam（隐藏模式镜头不空屏）进 check_all；§3 第 15 条；隐藏模式 box 认件去碎片（S-501 屋盖盒不再悬一条合龙段）；hzview.js?v=27–28
- 2026-11-09 · [host] · hark-cr · 图纸范围（委托人：S-201 三维显示全工程、图纸只画承轨层）：插件图纸激活时范围外构件淡显成幽灵（PL.scopeMask + aGh，共用几何的幽灵网格、淡墨线），新可选接口 pl.scope（§3 第 15 条）；分图 3D 模块只在本图出现、S-301 钢绞线不画；S-000/S-301/S-001 与开通前 12 天起全显；镜头不变（hzview.js?v=24–26）。check_linkage 加 S-201 中点断言；派 D-33/34/35
- 2026-11-09 · [收件] · hark-cr · 积压分支合入：S-251 施工面模块（接线 mods/s251.js?v=1）、D-20 S-101 图例、D-27 手机 CSS（hark-darrio）、D-11 Blender 终版、method / progress-heartbeat / promo-page / pilot / vision-review / team-kit（只文档）/ shape-freeze 文档、实物 R-0015…R-0026、D-19+D-26 S-201、D-21 S-501、D-22 S-401（D-22-fix）、D-28 信息卡第一片（接线 mods/info.js?v=1）、D-25 塔吊表、履带吊台数检查、S-002 上限线、S-001 v2、看板界面（flow.py 同步到 tools/status）
- 2026-11-09 · [host] · hark-cr · 采纳定型提案车头：HZ.makeTrain 复兴号 8 编组（hzseq.js?v=11、hzview.js 旧 trainGeo 替换），屋面 skinTop 保持 null（委托人定 57 m）；插件引线锚点钩子 pl.leadAt(t)（hzview.js?v=23）；各插件 ?v= 递增
- 2026-11-09 · [check] · hark-cr · check_all 加 check_info；S-201 镜头扫描回严格模式（D-26 后违反 0）；20/20 OK
- 2026-11-09 · [claims] · hark-cr · 委托人 5 项决定记入；AGENTS 加交付附证据、同一办法失败两次就停、长单回执与每小时进度；派 D-32（S-201 leadAt）；关 D-11/17/19/21/25/26/27
- 2026-11-08 · [屋面云纹实施] · hark-cr · 委托人定 C 版「四朵云」：hzseq.js 新增 HZ.Wv（P.wv：云 3.5 m、外圈波纹 0.5 m、天窗两侧 14 m 云缝），只叠进覆面 Hc，钢结构 / 吊顶 / 提升高度不变；check_make 加断言；hzseq.js?v=10
- 2026-11-08 · [地铁层镜头入口] · hark-cr · 委托人定默认关闭：camCfg.ug 只在 #camcfg={"ug":1} 显式时开（hzview.js?v=20）；check_linkage 断言；镜头扫描 0 违反 0 卡住
- 2026-11-08 · [host] · hark-cr · HZ_MODS 加可选 pick(part,{x,y},ctx) / unpick() 与空容器 #mod-ui（hzview.js?v=17–19，接口见 docs/hz-atlas-check.md 第三节 12–13）；剖切封面补网架杆件（含斜杆）；S-301 吊点标签显示载荷（新 HZ.jackLoad，推算）
- 2026-11-08 · [hzseq] · hark-cr · 屋盖排程校准：楼面→胎架 +4 天，asm/lift 及其后后移 4 天（lift1..3 现第 636–649 天），对公开节点偏差 +1 / 0 天（hzseq.js?v=9）；S-201 镜头扫描暂报告模式（D-26）、S-401 时间窗待 D-22
- 2026-11-08 · [claims] · hark-cr · 派 D-28（hark-cs 信息卡 + 图钉模块）、D-29（muse-tibo-cs S-252，任务书 docs/tasks/S-252.md）；强本地智能体可持 3 张派单
- 2026-11-08 · [D-15] · hark-liuzhijie · tools/hz/check_cams.js 插件镜头扫描（先加载 hzreal.js）；S-201 违反 13 待 D-14，暂不进 check_all
- 2026-11-08 · [履带吊臂长规则] · hark-darrio · docs/rules/crane-reach.md + check_crane（报告模式，接入 check_all 8/8）：650 t 级超限 10 吊，1000 t 级 0
- 2026-11-08 · [D-16] · hark-darrio · actors.build 收 opts.clip，剖切时小人与车一起切；check_actors 加断言
- 2026-11-08 · [D-07] · hark-cs · GPU 复测 #2 手机竖屏、#8 墨线光伏均已修好（docs/audit/2026-11-08-gpu.md）
- 2026-11-08 · [status] · hark-cr · 看板任务书 docs/tasks/status-ui.md + tools/status/check_status.js；「看板界面优化」开放认领
- 2026-11-08 · [屋面云纹] · hark-cs · 提案：四朵云 3.5 m + 外圈波纹 0.5 m，只改覆面（docs/proposals/roof-waves.md），实施待委托人定
- 2026-11-08 · [D-09] · hark-liuzhijie · S-501 结尾镜头改西南低角度，后三帧由首趟列车位置推算（s501.js?v=3）
- 2026-11-08 · [S-251] · hark-liuzhijie · 公开对照：拼装 46.5%（2021-05-31）与整体提升完成（06-28），模型早 3–4 天（s251.js?v=2）
- 2026-11-08 · [近景人员与车辆] · hark-darrio · web/mods/actors.js 墨线小人与车辆 + check_actors（模块合入，宿主接线待 hark-cr）
- 2026-11-08 · [real] · hark-fangyi · 实物记录挂构件（parts、HZR.forPart，10 条记录挂 272 个构件）+ check_realparts；S-201 身份卡按构件取记录（s201.js?v=3）
- 2026-11-08 · [GPU 审计] · hark-cs · D-07 复测 #1：播放时图纸重画约 15 次/秒，帧率仍 60；[blender-ref] 更正云谷为竖向通廊、天窗拱起方向正确
- 2026-11-08 · [proposal] · hark-cs · 方向清单 docs/proposals/hark-cs-directions.md；[caps] · hark-darrio · 本地能力自报
- 2026-11-08 · [integrate] · hark-cr · hzwest.html 正式加载 hzreal.js；check_real 认 parts；check_all 加 check_realparts、check_actors（7/7）；派单 D-13..D-16
- 2026-11-08 · [S-251] 页签与图册登记（SHEETS_ALL、hzatlas PAGES；hzview v14、hzatlas v6）；Mac Chrome 真 GPU 五图起中末截图 0 报错 · hark-cr
- 2026-11-08 · [S-101/S-201/S-401/S-501] 二稿合入（parts 联动、D-05/D-06/D-08、S-501 首趟列车新值 D-01）· hark-liuzhijie/hark-fangyi/hark-cs
- 2026-11-08 · [S-251] 网架拼装初稿合入并接线（s251.js?v=1）· hark-liuzhijie
- 2026-11-08 · [blender-ref] 导出脚本与白模/线稿对照（Traycer Gemini 4 审：可合；临时构件重复导出待修）· hark-cs
- 2026-11-08 · [roster] 登记 hark-darrio · hark-cr
- 2026-11-08 · [GPU 审计 #2] · hark-cr · 手机竖屏（宽<700 且竖向）改为 3D 上、图纸中、控制条下，页签可横滑，hzview.js?v=13；390×844 冒烟 0 报错、页签不出界
- 2026-11-08 · [GPU 审计 #8] · hark-cr · 墨线模式 3D 屋面画光伏条带（与实景同一遮罩），hzview.js?v=12；沙盒冒烟：0 报错，播放 4 s 图纸重画 5 次（修前 0）
- 2026-11-08 · [GPU 审计] · hark-cs · Mac M4 真机 135 截图问题单（8 条）；[修] · hark-cr · 播放时右栏图纸不重画（隐藏画布占名额），hzview.js?v=11；派单 D-05..D-08
- 2026-11-08 · [integrate] · hark-cr · 联动接口 v2 上线（宿主侧）：插件 parts → 图纸缩放平移、点构件飞镜头+黄框、3D 反查图纸、#focus=；S-501 开通（hark-liuzhijie）接入；首趟列车改为湖杭场靠云谷股道、车头停进站台；铺轨改为逐条股道推进（hark-fangyi 请求）；收件 AUTO 自动合并档、/board?agent= 进门画面
- 2026-11-08 S-101 地下（hark-liuzhijie）、S-201 承轨层（hark-fangyi）、S-401 屋面（hark-cs）以插件图纸上线（初稿，待真机审查）
- 2026-11-08 合入 PR #1（muse-tibo-cs）：S-301 子图点图飞镜头、平面小地图、剖面刀提案

每次合入 main 记一行：日期 · 事项 · Agent · 摘要。
- 2026-11-08 · [infra] · hark-cr · 实时认领板 /board、一条命令认领 /claim、放回 /release；CLAIMS.md 改为每小时镜像
- 2026-11-08 · [docs][infra] · hark-cr · 项目简报 docs/BRIEF.md + 5 份任务书 docs/tasks/；收件关口加认领锁（先到先得、每人 2 项、抢不到列出空闲项）与推送即跑 check_all；/claims 实时锁
- 2026-11-08 · [claims] · hark-cr · 登记 hark-cs、hark-fangyi、hark-liuzhijie（B 收件）；AGENTS.md 加认领冲突裁决规则

- 2026-11-08 · [infra] · hark-cr · 从 osaka-castle-3d 拆分为独立仓库，GitHub Pages 上线；加入 AGENTS.md / CLAIMS.md / CHANGELOG.md
- 2026-11-08 · [infra] · hark-cr · GitHub Actions hz-check：每次推送 / PR 跑 check_all
- 2026-11-08 · [S-301] · muse-tibo-cs · hzatlas 旁路三张子图 + tools/hz 检查基座（osaka-castle-3d PR #1）
- 2026-11-07 · [S-301] · hark-cr · set2a–set2e：图纸与 3D 双向联动、剖切、镜头限制与防卡死
- 2026-11-07 · [S-000][S-301] · hark-cr · set1：图册第一版
