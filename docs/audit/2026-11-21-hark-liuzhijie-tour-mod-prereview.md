# 预审：agent/g-wangmushan/tour-mod（25899cc）

预审人：hark-liuzhijie（非集成人，只出结论，合并由 hark-cs 决定）
日期：2026-11-21（PST 01:45）
基线：main f2bde40
结论：**可合**（建议黄档）。宿主接线和说明卡去留另走 req:2026-11-21:0a60756e。

## 范围
分支相对 main 只改了 4 个文件，没碰共用文件：
- web/mods/tour.js（新增 369 行）
- tools/hz/check_tour.js（新增 146 行）
- data/claims/requests.jsonl（只追加 1 行 seq 103，其余行不动）
- CLAIMS.md（由 gen.js 生成；本地重跑后无差异）

因为改了 JSONL，这个分支属于 MANUAL 档，需要集成人人工合。

## 三轮审查要点
| 轮次 | 提交 | 发现 | 状态 |
|---|---|---|---|
| 1 | 266c7e8/3aad41a | 运镜写 pv.camera 但宿主不吃；宿主没改之前就自启抢时间轴；requests.jsonl 被整文件重排 | ea20df9 已修 |
| 1 | 同上 | 6 拍时间不单调；pv.TL.sheet 不存在；云谷边界和图号是硬编码 | ea20df9 已修（读 HZ.P.gap / HZ.P.stX / HZ.K.jigL2.start / HZA.PAGES） |
| 2 | ea20df9 | tourHook 没开时，传送门栏和「重看」按钮照样显示；兜底的打断监听已删，点下去会跑一段镜头不动、也打断不了的导览 | 25899cc 已修 |
| 2 | ea20df9 | 新行 reply 写成 ""，其他未关的单是 null | 25899cc 已修 |

## 复现（在分支检出目录）
```
node tools/hz/check_tour.js
# OK check_tour beats=6 cam_samples=93 collisions=0 cam_dx=308.4m portals=2
node tools/hz/check_claims.js
# OK check_claims ... requests=46 ...
node tools/claims/gen.js && git status --short   # 应无输出
```
作者自报 check_all 24/24（check_tour 还没接入 check_all）。

## 合入后集成人要做的（来自 0a60756e）
1. hzview 暴露 S.flyTo、S.setCam。
2. 在 SEQ0 段设 S.tourHook=true，要早于 HZ_MODS build（现在 L938 在 L1175 之前，顺序没问题）；在 4 事件拦截里调用 S.onTourAbort。这一项等委托人确认：11-11 决定②是否取代 11-10 的 8 秒说明卡。
3. hzwest.html 挂上 mods/tour.js?v=1。
4. check_all 接入 check_tour。

接线前模块全程静默：不建 DOM、不自启，start() 也直接返回 false。所以先合模块、后接线是安全的。

## 合入前没覆盖到的
- 没有真宿主对照截图。mock 和宿主同形，但建议接线后补录 t≈5 s、16 s、50 s 三张截图存档。
- 云谷穿行 y28→18 有没有穿过楼面（22.8–24 m），check_tour 只断言了不碰撞，接线后请再目测一次。
