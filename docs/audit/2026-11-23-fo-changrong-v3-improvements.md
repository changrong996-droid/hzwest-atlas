# V3 试点改进建议：502 保活、并行冲突提示与 allowed_paths 预检

观察窗：2026-11-23 19:20–19:35 CST，三地址轮换实测 + /brief 事件流。

## 1. 502 隧道保活/热备
现象：19:20 门1 当班可用；19:26 起门1、门3 同报 502「Nothing is listening on this port in the sandbox」，仅门2 可用；换班空档最短数分钟，期间 /health 同样 502，外部无从发现当班地址。
证据：报名走门1 成功，约 6 分钟后状态查询在门2 读到，说明三地址共享同一状态后端。
建议：(a) 门进程内置定时自唤醒（每 5–10 分钟自打 /pulse），防 instabox 空闲回收；(b) 三地址既然同后端，可做真热备，任一地址都能答业务口，把「找活门」变「任一门」；(c) /health 聚合返回三地址健康与当班标记，方便外部巡检。

## 2. 同文件并行单冲突提示
现象：事件 #41/#43 显示 #13（S#5）与 #12（S#6）先后提交且都动了 web/mods/osmctx.js，#64/#67 双双验货 green。两稿各持基线，后合入者面对已被前者推进的主干，撞车风险后置到 merge/评审（#38 评审标 stale 即此类）。
建议：(a) lease 认领时返回与在途单 allowed_paths 的交集提示；(b) verify 判档输出补丁与当前 head 的重叠文件清单，stale 时直接给「先对齐再交」结论；(c) pending_reviews 里对同文件多稿标 overlap，提示评审人。

## 3. 建单 allowed_paths 核对
现象：open_asks #2：#9 净空读数实际在 web/hzsheet.js L96/298/302 与 web/hzview.js L435/928/1206，而该单只开 web/sheets/**、web/mods/**、docs/audit/**，任何 worker 认领后都无法合规提交。
建议：plan 建单时做轻量预检——从 description 抽标识符/路径线索，仓内 grep 候选命中文件，与 allowed_paths 求差，缺口在建单回执即时提示；建单后可跑一次「合规预演」。

## 4. 顺手小项
(a) batch_map 面板 total/merged/open 全 0，与事件流明显不符，疑统计口径未接批次维度；(b) pending_reviews 的 stale 稿建议附一行「verified_head 与现 head 相差 N」。

## 下一步建议
1) 集成人裁定 #9：放宽 allowed_paths 至 web/hzsheet.js、web/hzview.js，或集成人侧直改；2) 接手 #38 交叉评审前先核对 stale 基线；3) 门侧接通 batch_map 统计口径；4) 巡检侧持续记录换班空档时长样本，供保活参数定型。

Agent: fo-changrong
