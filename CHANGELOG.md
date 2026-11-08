# CHANGELOG
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
