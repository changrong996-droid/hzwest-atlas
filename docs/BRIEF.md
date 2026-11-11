# 项目简报 · 新加入的智能体必读（hark-cr 维护）

你没有参与过之前的对话，这份简报给你补齐上下文。读完它、AGENTS.md，到实时认领板 `<收件地址>/board`（当前主镜像，地址见 AGENTS.md 第 6B 节） 认领（一条 curl），再读你认领的 `docs/tasks/<任务>.md`，就可以开工。

## 1. 这是什么、给谁看
- 杭州西站（2022-09-22 开通）**施工推演图册**：浏览器里实时运行的 three.js 3D + 同步变化的工程图纸。不是视频，不是效果图。
- 施工顺序不是手摆的：`web/hzseq.js` 用规则推导出 55 个活动、约 1 900 个构件的先后与工期（`HZ.make()`、`HZ.acts`、`HZ.K[key]`），3D 和图纸都从同一份数据画出来，页面上还有自检计数。
- **委托人的目标**：让看的人惊叹「这到底是怎么造出来的」。视觉冲击 > 精确，但物理规则不能破（不穿模、不悬空、吊装够得着）。
- 线上：https://changrong996-droid.github.io/hzwest-atlas/ ；`#sheet=S-000` 总图，`#sheet=S-301` 整体提升（目前最完整的一张，参照它的水准）。

## 2. 图册结构（借鉴 F-35 / A380 解剖图集）
一张图 = 一屏 = 一个施工阶段。每张图只放：**一个大数字**、**一张相关图纸**、**近距离镜头**、**它自己的时间窗**。共用同一套规则和排程。

| 图号 | 名称 | 时间窗（天，HZ 活动） | 状态 |
|---|---|---|---|
| S-000 | 总图 | 0–1101 全工期 | 完成 |
| S-101 | 地下 | `found` 0–365（4 层含地铁层） | 待出图 |
| S-201 | 承轨层 | `frame*`/`deck*`/`plat*`/`track*` 365–900 | 待出图 |
| S-301 | 整体提升 | `asm*` 600 → `head` 667 | 完成（+子图 2–4） |
| S-401 | 屋面 | `holes`/`sky`/`clad`/`pv` 679–781 | 待出图 |
| S-501 | 开通 | `ym*`、`tod`、`open` 700–1101 | 待出图 |

活动表：`node -e "global.window=global;require('./web/core/seq.js');require('./web/hzseq.js');HZ.make();for(const a of HZ.acts)console.log(a.key,a.name,a.start,a.end)"`

## 3. 委托人的口味（硬标准，违反会被退回）
- **一屏看完**：核心信息同时可见，不滚动、不翻页；次要信息点开才出现。堆满信息的页面「是给机器看的，不是给人看的」。
- **少数字**：一张图一个大数字，其余数字要有物理含义（毫米、吨、天），不要抽象指标。文字要读得清。
- **墨线语言**：画面是纸上墨线（NPR），完工后才亮灯；不要做成 SketchUp 式的灰盒子或游戏画风。
- **工人画成人形，只在近景出现**；远景里的小黑点会被看成脏东西。
- **规则优先**：修问题改规则（物理不变量），不改坐标硬凑。
- **镜头**：不能进地下（除非地铁层已开敞）、不能卡死；改镜头必须附扫描结果（违反 0、卡住 0）。

## 4. 代码怎么接
- 共用文件只有 hark-cr 改（AGENTS.md 第 4 节）。你交付的是**插件模块**，由 hark-cr 接进页面：
  - `web/sheets/<图号小写>.js`，例如 `web/sheets/s201.js`，内容形如：
    ```js
    (window.HZ_SHEET_PLUGINS = window.HZ_SHEET_PLUGINS || []).push({
      id: 'S-201', name: '承轨层',
      window: [365, 900],                 // 时间窗（天）
      big: t => ({ num: 9, unit: '线', label: '已铺轨' }),   // 大数字
      draw: function (g, w, h, t, ctx) {   // 图纸，签名同 hzsheet.js；ctx.tb(w,h,图号,图名,t) 画标题栏
      },
      cam: [{ t: 365, target: [x, y, z], az: 30, el: 25, dist: 180 }],  // 镜头关键帧（米、度）
    });
    ```
  - 图纸绘制用 2D canvas，墨线风格参照 `web/hzsheet.js` 现有函数（`jack`、`section`、`plan`、`lift`）。
  - 需要 `HZ` 里没有的数据（比如每段承轨层的浇筑时间），优先在自己模块里从 `HZ.acts` 推导；确实要改 `hzseq.js` 的，在 CLAIMS.md「接口请求」里写。
- 无头自测：`tools/hz/harness.js` 能在 Node 里加载 HZ 并给你一个桩画布（参照 `tools/hz/check_sheets.js`）。为你的图写 `tools/hz/check_<图号小写>.js`：在时间窗内取 7 个时刻跑 `draw`，不抛错、标题栏图号正确、大数字单调合理。
- 每次推送前跑 `node tools/hz/check_all.js`；收件仓库在推送时也会自动跑，不通过直接拒收。

## 5. 不知道怎么办
- 先在 `docs/hz-direction-memo.md`、`docs/hz-atlas-inventory.md` 里找（数据字段、函数位置都盘点过）。
- 还不清楚：在 CLAIMS.md「接口请求」区写问题，hark-cr 每次收件时回复。
- 不要猜委托人的偏好，不要为了「看起来完成」放占位图。
