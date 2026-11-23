# #39 独立验收器 tools/hz/check_fpv.js · 交付说明

- 作者：fo-wangmushan（glm）· 2026-11-23 · 单据 #39（簇一独立验收单，docs/tasks/overlap-merge-2026-11-23.md）
- 独立性（决定 seq 28 规矩 2）：作者不是 #26 航线作者，也不是 #38 自检脚本作者。
- 只新增两个文件：`tools/hz/check_fpv.js`、本说明。不碰 check_all.js（接线归集成人，规矩 4），不碰任何宿主/影片文件。

## 背景
- #38 自检脚本（web/film/fpv-selfcheck.js，S#24）提交时不在主线，无法直接采用/扩展；本验收器按 S#24 评审记录中公开的 8 判据口径独立实现，底座合入后可直接对照复跑。
- 几何净空不抄数字：全部经 tools/hz/harness.js 加载 web/hzseq.js（HZ.Hc / HZ.Hs / HZ.rho / P）与 web/mods/yunmen.js 的实时公式与常量。

## 判据（对齐 #38 八条口径）
1. 格式与关键帧：name/landmarks/keyframes 齐备，t 严格升序，pos/look 为三元有限数。
2. 零碰撞（逐样本，按 t 段内 Catmull-Rom 采样）：入地（云谷中庭 |z|<14 且 |x|<95 例外，下探至地铁层 -9.2 为止）；穿屋面结构夹层（吊顶 Hs 与覆面 Hc 之间，屋盖平面按 HZ.rho 超椭圆判定；越过覆面上方的空域合法）；穿站房楼面 y∈[22.8,24]、承轨层顶板 y∈[10.5,12.5]；云门带 z∈[178,238] 内 y<50 需 |x|<38（洞内），y≥50 至 80 不可飞（全宽层体/桁架），±178/238 立面不可穿；5F 空中连廊 |z|≈143 且 y∈[30.4,31.4]。
3. 变速极值 ≥ 3（慢-快-慢-快）。
4. 视线角速度 ≤ 150°/s；航向角速度 ≤ 180°/s（低速段跳过航向判定）。
5. 地标：带坐标者按 60 m 容差逐个核过；纯名字地标记 INFO 不拦（留真机复核）。
6. 近景参照 ≥ 60%：样本点到任一几何体（站房包络/云门/地面）距离 ≤ 80 m 的时间占比。
7. 空镜 ≤ 60%：视线射线 400 m 内与几何盒及地面无交点的时间占比。
判据 6/7 是 Node 侧几何代理口径（无渲染），最终视觉复核仍归 #26/#38 的真机截图验收，已在代码头注释与输出中声明。

## 用法
- `node tools/hz/check_fpv.js [web/film/fpv-routes.js] [--route <name>] [--selftest]`
- 退出码：0 全过；1 有判据不过；2 航线文件缺失/未登记 HZ_FPV（#38 底座未合入时属正常，不算失败）。
- `--selftest` 内置 1 条基准线（云门→云厅→云谷→拉升回望，12 帧 45 s）与 4 条违规线（入地/夹层/连廊/视线角速度），逐条断言。

## 自检实证（本机 Node v20.18.1，2026-11-23）
```
$ node tools/hz/check_fpv.js --selftest; echo exit=$?
  [selftest-good] OK（12 帧 / 45s，变速极值 5，视线 73°/s，航向 67°/s，近景 93%，空镜 20%）
  [selftest] selftest-good 过全关 ✓
  [selftest-ground] 碰撞 @t=38.25s pos=[244.5,0.3,-135.1]：入地 y=0.3
  [selftest] selftest-ground 被判据「入地」拦截 ✓
  [selftest-roof] 碰撞 @t=17.45s pos=[-0.2,43.3,104.8]：穿屋面结构夹层（吊顶 Hs=42.8 与覆面 Hc=49.8 之间）
  [selftest] selftest-roof 被判据「夹层」拦截 ✓
  [selftest-slab] 碰撞 @t=14.95s pos=[0.0,31.0,143.9]：穿 5F 空中连廊楼板 y≈30.4–31.4
  [selftest] selftest-slab 被判据「连廊」拦截 ✓
  [selftest-lookrate] 视线角速度 1127 °/s > 150
  [selftest] selftest-lookrate 被判据「视线角速度」拦截 ✓
OK check_fpv selftest（good 过全关，4 条违规线各被对应判据拦截）
exit=0
```
- 航线文件未合入时：`SKIP check_fpv: 航线文件不存在：web/film/fpv-routes.js（…）`，退出码 2。
- 已确认不破坏现有考卷：本次改动仅新增文件，`check_all.js` 未动。

## 已知边界
- 站房南北立面的开口（除云门洞外）未做静态建模，穿墙判定依赖夹层/楼板带；边条 ~4 m 内的掠顶细节留给真机复核。
- landmark 若为纯字符串无法静态定位，只记 INFO。
