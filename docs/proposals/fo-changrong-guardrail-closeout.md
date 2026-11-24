# 提案：底盘护栏收口——hzview 第 2 刀 labels3d.js、check_cachebust 接入、短片静态自检

提出：fo-changrong · 2026-11-24 · 批次#3 #57

## 现状（本轮实测，基线 37ef322）

- `web/hzview.js` 现 1206 行，主体仍是单个 `run(THREE, OrbitControls)` 闭包（自第 59 行起，状态对象 S、图纸表、插件挂载、标注与联动全在内）。第 1 刀已切出 `web/core/` 五件（seq/pluglink/ui/uiaudit/webgl-fallback），hzwest.html 均带 `?v=` 挂载。
- `tools/hz/check_cachebust.js` 已存在且成熟：校验 hzwest.html 与 hzatlas.html 的本地 JS/CSS 引用必须带合法 `?v=<正整数>`、目标文件存在、无重复引用，并支持 `--base=<ref>`（配 `--strict` 时改动文件未升版本号即退出 1）。但 `check_all.js` 考卷未收录它（grep 无命中），护栏造好了没接上电闸。
- 短片页 `web/film/index.html`：`film.css`（第 7 行）与 `film.js`（第 258 行）**完全没带 `?v=`**；check_cachebust 的 `htmlFiles` 只写死 `['web/hzwest.html','web/hzatlas.html']`，短片不在覆盖内。而短片资产正在活跃变更（#58 的 S#57 刚改了 film.css/film.js/index.html），改了却无缓存号，浏览器端极易吃到旧版本。
- 前稿审计（S#53，已合入 88b3037b）实测 `?v=` 滞后 10 文件：hzsheet、hzreal、sheets s201/s401/s251、mods s251/yunmen/info/tour/yungu。

## 三刀收口

### 第 2 刀：hzview.js → labels3d.js
把 hzview.js 里 3D 标注/联动标注一整块切到 `web/labels3d.js`：以 `window.HZ_LABELS3D = { init(ctx) }` 暴露（与第 1 刀的 core 模块同一零构建模式），hzview.js 在 `run()` 里调用 `HZ_LABELS3D.init({ THREE, scene, camera, S, PL })` 消费。切的是「标注状态 + 标注渲染 + 联动 v2 选中优先标注」这一 cohesive 块（hzview.js 内 PV.label/anchor/lk 一线贯穿，见第 718/750/1153 行一带），不动渲染主循环。验收口径：check_all 全绿 + 桌面/移动双视口目视与切前一致；hzwest.html 挂载行带 `?v=1`。**挂载行仍留给集成人**（批次惯例）。

### check_cachebust 接入 check_all 考卷
按 check_fpv 接考卷的同一手法（S#50，已合入 1a1770c0）：进 `tools/hz/check_all.js` 跑题列表，先报告档（`report:` 前缀，不阻塞），理由是现账上确有 10 文件 `?v=` 滞后，直接严格档会全量红。等 10 文件版本号补齐后按 #52 的「转严格」路径升档（cachebust 自带 `--base --strict`，升档只改一行）。预期收益：改文件忘升 `?v=` 这类事故从人肉记忆变成考卷硬项。

### 短片静态自检
两步走：① 先把 `web/film/index.html` 加进 check_cachebust 的 `htmlFiles`（一行），同批给 film.css/film.js 补上首个 `?v=1`——否则接入当天短片即红；② 再补一个薄 `tools/hz/check_film.js`：校验 film/index.html 引用的本地资产存在（含 audio/、img/ 目录）、`film-events.json` 可解析、`fpv-routes.js`/`fpv-selfcheck.js` 引用完整。fpv-selfcheck.js 已在仓内，静态检查只做存在性/引用完整性，不跑运行时。同样先进报告档。

## 顺序与工作量
① cachebust 接考卷（报告档）→ ② film 进覆盖 + 补 `?v=` → ③ 第 2 刀 labels3d.js（改动最大，放最后，等 ①② 落地当护栏）→ ④ 三件稳了再议报告档转严格。①② 各一小时级，③ 需整段目视回归。

## 下一步建议
- 若认口，可拆三张后续执行单（cachebust 接线 / film 覆盖补版 / labels3d 切割），互不阻塞；
- labels3d 切割前建议先给 hzview.js 补一行模块边界注释清单，方便下刀验收对账；
- 转严格节奏建议挂在 #52 同一批次评审，两把 check 一次过堂。
