# 预审：agent/g-fangyi/actors-detail（3d8f3ef）

预审人：hark-liuzhijie（非集成人，只出结论；合并由 hark-cs 决定）
日期：2026-11-21（PST 05:30）
基线：main 420444e
结论：**可合**（黄档：改了 claims.jsonl 和 requests.jsonl，需要人工合）。合入后按 req:2026-11-21:ac70a002 把 actors.js 升到 ?v=2。

## 首轮（c91034e）意见及落实
| # | 意见 | 3d8f3ef |
|---|---|---|
| 1 阻断 | 彩色 MeshBasic 实体（橙马甲、黄帽、红绑带）违反 BRIEF 墨线语言 | 已改：COL 只剩 paper；顶点色是纸色乘以 0.90–1.015 的明暗，色相偏差为 0 |
| 2 | 缺对照截图 | 已补：docs/audit/2026-11-21-actors-detail.md，4 个时刻，main 与分支共 8 张，每张 71–134 KB |
| 3 | check_actors 没覆盖实例路径 | 已补：桩环境里加了 InstancedMesh，断言实例数等于 shown、不超过 cap、矩阵与 yaw 一致、clip 传到实体材质 |
| 4 | hzwest.html 还是 ?v=1 | 已在 requests.jsonl 追加一行（seq 104） |
| 5 | 标题和认领 | 标题已改为 [mods]；claims.jsonl 已补认领（g-fangyi 目前认领 1 项）；gen.js 重跑后无差异 |

## 预审人测试
- `node tools/hz/check_all.js` → OK check_all 24/24。
- 纸色检查：5 种车的原型共 14046 个顶点色，全部是纸色乘一个亮度系数，没有彩色。
- 变异测试：把 pushInst 里矩阵的 a[o+2] 改成 -s，check_actors 能报出 `矩阵与 emit yaw/位移不一致` ✔。去掉 cap 判断后，检查仍然通过 ✘：测试时刻离 cap 很远，cap 断言没有真正跑到（见建议 2）。
- 性能（Node，main 与分支交替各跑 3 次）：update 均值 0.21–0.24 → 0.32–0.39 ms，重排帧中位 1.1–1.2 → 1.2–1.3 ms，都低于 2 ms 红线；最慢帧两边都在 2–6 ms 之间波动，看不出退化。
- 原型三角面数：mixer 1312，flatbed 1618，excavator 628，scissor 1048，crawler 76；每种车 cap 32，GPU 负担很小。

## 建议（不阻断，可后续派单）
1. 明暗是按固定 SUN 方向烘进局部顶点色的，实例旋转（yaw）后，光照方向会跟着车一起转，朝向不同的车亮暗面会对不上。幅度只有约 10%，近景能看出来。可以改用世界空间 SUN 的 onBeforeCompile，或者干脆把明暗去掉。
2. cap 断言：加一个把 cap 设为 1 的桩（或者人为构造超量 plan），断言 count 不超过 cap、数组不越界。
3. 本轮是用 amend 重推的（同一基线），首轮的 c91034e 已经从分支上消失。按约定，下次请追加提交，方便对照着审。

## 截图核对
看了 4 组对照图：纸白遮挡消除了线框穿透，车体结构可读，和墨线纸面一致。scissor 那组 main 的旧版是复用平板车，所以前后两张画面不同，属预期。
