# 杭州西站图册 · 一键检查与旁路接口说明

## 一、怎么跑

一条命令跑完全部检查：

```
node tools/hz/check_all.js
```

逐项单独跑：

```
node tools/hz/check_make.js
node tools/hz/check_sheets.js
node tools/hz/check_atlas.js
node tools/hz/check_real.js
```

读法：

- 每个脚本成功时退出码 0，并打印以 `OK ` 开头的汇总行；失败时退出码 1，并打印以 `FAIL ` 开头的原因。
- `check_all.js` 按上面的顺序依次运行，任一退出码非零即停，打印 `FAIL check_all at <脚本名>` 并以 1 退出；四个全过打印 `OK check_all 4/4`。
- 看到 `FAIL check_all at …`，往上翻同一屏里该脚本自己打印的 `FAIL` 行，那才是具体原因。
- 现在 `check_all.js` 默认按 CPU 核数**并行**跑（`HZ_JOBS=1` 顺序跑），每项输出按清单顺序整段打印；`--list` 列清单，`--shard=i/n` 只跑第 i 片（给单条命令有时长上限的环境分几次跑，n 片全 OK 等同全量 OK），`HZ_TIMING=1` 打印每项耗时。插件镜头扫描 `check_cams.js` 按图号逐张一项，违反即失败（11-08 起，D-14 后各图 0 违反）。
- 环境要求：Node ≥ 18，只用内置模块，无第三方依赖，无需 `npm install`；脚本路径不依赖当前工作目录。

## 二、四个检查各自断言什么

### check_make（HZ-01：无头基座与构件计数）

- `HZ.acts.length === 55`、`Object.keys(HZ.K).length === 55`：防活动表被悄悄增删或键名漏改。
- `HZ.cells.length === 1432`：防构件总数变了而没人发现。
- `HZ.lifters.length === 32`：防提升器数量被改动。
- `Math.abs(HZ.D - 5.8) < 1e-9`：防整体提升高度被改动。
- `HZ.audit().zero === true`：防构件审计出现非零差错（漏装、重复、对不上）。
- 若上游改变了这些计数，不得改断言，先报告新旧值，由委托人裁定新基线。

### check_sheets（HZ-02：四张图纸的无头绘制）

- 四个绘制函数 `section / plan / lift / jack` × 7 个代表时刻 × 2 档画布尺寸（560×420 与 300×160），共 56 次调用：防某个时刻或矮窗口下绘制函数抛异常。
- 每张图自报图号必须符合约定（取 `ctx.seenNo`）：防图号字面量被误改。
- 每次调用至少 `fillRect` 一次且至少写一条文字：防图框和标题栏没画出来。
- 通过时打印 `OK check_sheets fns=4 times=7 sizes=2 runs=56`。

### check_atlas（HZ-03 / HZ-04：登记表与一致性）

- `PAGES` 的页序与每页 `on`，与 `web/hzview.js` 源码里 `SHEETS_ALL` 一致：防登记表与页面实际页序脱节。
- `SHEETS` 每项 `fn` 在 `HZS.make(HZ)` 返回对象里存在且为函数：防登记了不存在的绘制函数。
- `no === HZA.PROJECT + '-' + 键`、`canvas` 互不重复、`owner` 存在于 `PAGES`：防编号写错、画布 id 撞车、归属页悬空。
- 别名全局唯一，且每个别名经 `resolve` 必须解析到登记表中挂着它的那张子图：防 `A-101 → S-101` 这种字面替换的误映射。（原卡面的「别名数字 ≠ 所属页数字」写法与 A-301 数据自相矛盾，已经指挥官仲裁改为本式，理由见 check_atlas.js 头部注释。）
- `PAGES[*].sheets` 里的每个 id 都在 `SHEETS` 中：防页面引用不存在的图。
- `resolve` 的别名解析、短号、全号、未知输入（返回 `null`）各一例；`sheetsOf('S-301')` 顺序为 1、2、3、4：防解析函数回归。
- `wrapFn` 改号：对 `section / plan / lift` 调用后，`ctx.seenNo` 分别为 `HZW-S-301-3 / -4 / -2`：防改号包装漏改或多改。
- `web/hzwest.html` 中存在 `id="sh-jack"`，且 `S-301-1` 的 canvas 为 `sh-jack`：防原页面改掉千斤顶画布 id。
- `web/hzatlas.js` 含 `HZA.mount`、`HZA.setSub`、`hz-subtabs`、`S.SHEETS.push`，且不含 `S.SHEETS[0] =`、`S.SHEETS.splice`、`S.SHEETS.length = `：防旁路代码动到原页面的图纸数组下标 0。
- `web/hzatlas.html` 含 `fetch('hzwest.html'` 与 `hzatlas.js?v=`：防入口壳被改坏。
- 通过时打印 `OK check_atlas pages=6 sheets=4 aliases=3`。

### check_real（HZ-05 及附则：实物记录与两把时间尺）

- 每条记录的字段格式：`id` 为 `R-` + 4 位数字且唯一；`sheet` 能被登记表解析；`kind` 只取 `photo / measure / doc`；`date` 为 `YYYY-MM-DD`：防记录字段写歪。
- `t` 为 null 或数字，且 `0 ≤ t ≤ HZ.P.OPEN + 30`：防模型时刻越界。
- 两把时间尺：`date`（实际日历）与 `t`（模型时刻）相互独立，脚本不断言两者有换算关系，只在两者都非空时打印偏差天数：防把两把尺混成一把。
- `src` 必须有非空 `title`、非空 `license`；`url` 三选一：`http(s)://` 外链、仓库相对路径、空串（空串时 `license` 必须为 `own`）：防来源不明的素材混入。
- `cam` 为 null 或 `az / el / d / tx / ty / tz` 六个数字：防机位缺键。
- `anchor` 可选，非空时必须能解析为焦点值或活动键：防锚点指向不存在的东西。
- 字段表之外的未知键只警告不报错，不断言字段顺序：防过严而妨碍扩展。
- 通过时打印 `OK check_real records=<n> examples=<m>`，目前为 `records=1 examples=1`。

### check_callouts（三维引线标注按图号取材）

- 在 vm 里求值 `web/hzview.js` 的 `// <leadPick>` 段；每张插件图在时间窗起 / 中 / 末及逐日采样，选中的标注工序必须属于本图（`LEAD_KEYS` 或插件可选字段 `leadKeys`），宁缺毋串；审计串台时刻 S-201@632、S-401@685、S-501@710 必须落回本图工序。
- 接线：转轴标注按图号过滤、`rect.lb` 衬底（墨线 / 实景两套样式）、避让障碍含 `#big`、`hzview.js?v` ≥ 15。

## 三、旁路依赖接口清单

给上游协作者 hark-cr 看：外挂的 hzatlas 依赖原页面以下接口，改版时请勿破坏；如需变更，请先在仓库里打招呼。

1. **`window.__pv`**：在初始化末尾经 `Object.assign` 暴露 `ready / sheet / SHEETS / SH / layout`。hzatlas 轮询 `ready`，就绪后才挂载。
2. **`SHEETS` 数组**：下标 0 恒为千斤顶图（交互代码按下标取它）。hzatlas 只向其尾部 `push` 新图纸，不改下标 0、不 `splice`、不改 `length`。
3. **图纸绘制调度**：一帧最多画一张，按 `drawn` 最旧优先；`drawSheet` 对 `clientWidth < 20` 的画布直接跳过且不更新 `drawn`。因此隐藏画布绝不能用 `display:none`（会饿死可见图）；hzatlas 用 `visibility:hidden + position:absolute` 保住尺寸。代价是隐藏的图也在画（S-301 页绘制量约 ×4）。
4. **绘图函数签名** `fn(g, w, h, t, ctx)`：图号经 `ctx.tb(w, h, no, name, t)` 上报。hzatlas 用 `wrapFn` 只替换图号，不动其余。
5. **页面元素**：`#col` 容器与 `#sh-jack` 画布 id 不变；hzatlas 新增画布的 id 即登记表的 canvas 字段（`sh-s301-2 / sh-s301-3 / sh-s301-4`）。
6. **hash 约定**：参数 `sheet`、`sub`。原页面 `hashSync` 保留未知 hash 参数（hzatlas 靠此共存）；hzatlas 改 `sub` 时用 `history.replaceState` 并保留其它参数。
7. **`hzview.js` 中 `SHEETS_ALL` 的源码字面格式**：check_atlas 用正则从源码提取页序与 `on` 列，改动该字面格式会让检查失效或变红。
8. **壳页 `hzatlas.html`**：用 `fetch` 载入 `hzwest.html`，并注入 `hzatlas.js?v=<版本>`。**`hzatlas.js` 每次改动必须升版本号**，否则浏览器缓存旧版（已实测踩过）。
9. **hash 的 `focus` 参数与 `hashchange` 监听**：宿主在 hashchange 时调 `applyFocusHash()` 识别 `J<n> / ZN / ZM / ZS / CUT / GAP` 并飞行镜头。hzatlas 的「点图飞镜头」靠给 `location.hash` 赋值（保留其它参数）触发它；若宿主改掉这套参数或监听，外挂点击将静默失效（检查查不出来，须浏览器实测）。
10. **平面图布局常数与镜头状态（小地图依赖）**：hzatlas 的平面图标记按 plan 的布局公式（frame 内框、z ±172 / x ±130、边距 8/16/4/14）复算坐标映射，并读宿主镜头状态：自动模式用 `S.camKey(t)`，飞镜头后用 `S.focusShot / S.cutShot`（或 `S.shotFor` 现算），以 `S.focusHash` 与 `S.st.auto` 判断当前处于哪种状态。若宿主改平面图布局常数、相机模型或这些状态字段，标记会偏位或消失，检查只能保证我方公式自洽，位置正确性须浏览器实测。
11. **插件图纸注册表 `window.HZ_SHEET_PLUGINS` 与宿主 `sh-plug` 槽位**：图册登记表引用插件图号（宿主页 `hzwest.html` 已按 `s001 / s002 / s101 / s201 / s401 / s501 / s251` 顺序加载 `web/sheets/*.js` 并推入 `window.HZ_SHEET_PLUGINS`）；插件图纸由宿主 `sh-plug` 槽位原生显示，图册不自建插件画布（避免同页双绘）；插件缺失时 `console.warn`、宿主槽位为空、图册不崩页。
12. **3D 模块钩子 `window.HZ_MODS`（接口，11-08 起）**：页面在 `hzview.js` 之前加载的模块往 `window.HZ_MODS` 推一个对象 `{ id, build?, update?, pick?, unpick? }`，四个方法都可选：
    - `build(scene, HZ, THREE, { clip: [CUTP] })`：场景建好后调一次；抛错只 warn，该模块不进列表。
    - `update(t, cam)`：每次渲染前调；抛错 warn 一次并停用该模块。
    - `pick(part, {x, y}, ctx)`：用户选中插件图纸的 part（3D 点击、图纸点击、`#focus=` 深链、挂起后时间走到）时调。`part` 即插件 `parts(t)` 返回的那一项（含 `id / label / box / hit / info` 等）；`{x, y}` 是相对 `#v3`（= `#mod-ui`）左上角的 CSS 像素：3D 点击取点击处，其余取 `part.box` 中心投影（在相机背后或无 box 时为 `NaN`）；`ctx = { sheet, t, src: '3d'|'sheet'|'url', root: #mod-ui 元素, pv: window.__pv, set(t), select(id), clear() }`。换选另一个 part 直接再调 `pick`，不先调 `unpick`。
    - `unpick()`：选中被取消（⌂、Esc、点空白、切图）时调一次。
    - `pick / unpick` 抛错只 warn 一次（每模块每钩子），**不停用**、不影响其它模块。只对插件图纸（S-001…S-501 等走 `HZ_SHEET_PLUGINS` 的图）生效；S-301 的提升器 / 分区选择不走此钩子。
    - 宿主状态：`__pv.mods`（已启用模块 id）、`__pv.modsList`、`__pv.modPicks / modUnpicks`（调用计数，供检查与真机复测）。
13. **模块 DOM 容器 `#mod-ui`**：`hzwest.html` 在 `#v3` 末尾放一个空的 `<div id="mod-ui"></div>`（`position:absolute; inset:0; z-index:3; pointer-events:none`，其直接子元素 `pointer-events:auto`）。宿主永远不往里放东西；模块的卡片、图钉等 DOM 只挂这里，自行绝对定位，不要铺满整个容器（会挡住 3D 拖拽）。id 不改。
    检查：`check_linkage` 在 vm 里测 `PL.modsCall`（跳过无方法的模块、抛错只 warn 一次、顺序与参数），并对源码断言 pick / unpick 接线、`#mod-ui` 容器与 `hzview.js?v` ≥ 17。
14. **插件引线锚点 `pl.leadAt(t)`（可选，11-09 起，hzview.js?v=23）**：插件图上、未选中构件时，宿主先调 `leadAt(t)`，返回 `{ p: [x, y, z], t1, t2, key? }` 即以 `p` 为红点、`t1 / t2` 为两行字；返回 null 或抛错则回落到默认（本图工序里最新开工构件）。S-401 已实现；S-201（D-19 ③ 请求的 `leadAnchor`）请改用同名 `leadAt`。
15. **图纸范围 `pl.scope`（可选，11-09 起，hzview.js?v=24–25）**：插件图纸激活时，3D 只把本图内容照常画，其余构件淡显成幽灵（纸色上 16% 淡墨半透明填充、不写深度；墨线只留已建构件的 11% 淡墨，未建 / 在建不画红幽灵；不进引线）。镜头不变。总图 S-000、S-301、S-001 总进度横道图全显；任何图在开通前 12 天起（与实景渐显同一时刻，即 S-501 收官）全显。
    - 声明：`pl.scope = { keys?: [工序 key], ids?: [part id], levels?: [[y0, y1], …], zones?: ['ZS'|'ZM'|'ZN'], boxes?: [[x0,y0,z0,x1,y1,z1], …] }`，也可以是 `scope(t0)` 函数；`false` 或 `{ all: true }` = 全显。`keys` 整道工序进范围；`levels` 按构件外包标高带（±0.5 m），与 `zones`（按构件中心 z：|z| ≤ midZ+3.5 为 ZM）同给时取交；`ids` 限定只用哪些 part 的 box 认件（`[]` = 不按 box 认）。
    - 不声明时的默认：`pl.leadKeys`（没有则宿主 `LEAD_KEYS[图号]`）的工序 ∪ 时间窗内 7 个采样时刻 `parts(t)` 各 `box` 紧包的构件（容差 0.6 m；一个 box 至多认 16 件，每件至少占盒体积 2%，免得「全场」「分区」大盒把整站认进来）。只认本图时间窗内出现过的构件；认不出任何构件、或已占在场构件 ≥ 90% 时全显。宿主代填：S-002 未声明时只认 `crane / ycrane`（履带吊 C-* 站位盒会顺带认进脚下楼板）。
    - 3D 模块：声明 `m.sheet`（或 id 形如 `s251-face` → S-251）的分图模块，范围启用且当前不是它那张图时，宿主在 `update` 后把它的 3D 节点隐藏；云门模块墨线在本图范围不含 `ym` 时降到 15% 透明度；S-301 提升钢绞线不画。
    - 宿主状态：`__pv.scope = { sheet, on, n, live, src, keys }`。检查：`check_linkage` 断言 S-201 中点在场构件里承轨层 12 道工序全部照常、其余（≥ 100 件）全部淡显，S-501 开通前启用、`scope:false` / `levels+zones` / `keys` 三种声明，以及着色器接线与收官全显。

## 四、图号规则与映射表

规则（来自方向备忘录 §1.4 与第一阶段附则）：

- S 为准，A 退为别名。A 与 S 不是同号同义（`A-101` 是屋盖网架平面，`S-101` 是地下；`A-301` 是横剖面，`S-301` 是整体提升），禁止字面替换，只按下表映射。
- 规范形：`<项目码>-S-<页号>-<子图序号>`，子图序号自 1 起。项目码由常量 `HZA.PROJECT` 定义，西站为 `HZW`；除登记表自身外，代码中不得再写死 `'HZW-'`。
- 登记表内部用短号（如 `S-301-2`），标题栏用全号（如 `HZW-S-301-2`）。页号不改。
- 旧号全部进别名表，只读不写，新代码不得再产生 A 号。
- 一张子图可被多个页引用（「详见某图」），标题栏永远显示子图自己的图号。
- 深链：`#sheet=S-301&focus=J23` 原样保留；子图切换用 `sub=<序号>`，缺省为 1。

映射表（以 `web/hzatlas.js` 登记表为准）：

| 短号 | 全号 | 图名 | 别名 | 绘制函数 | 画布 id |
|---|---|---|---|---|---|
| S-301-1 | HZW-S-301-1 | 千斤顶平面布置 · 剖面净空 | 无 | `jack` | `sh-jack` |
| S-301-2 | HZW-S-301-2 | 屋盖提升图 | HZW-A-501 | `lift` | `sh-s301-2` |
| S-301-3 | HZW-S-301-3 | 横剖面 B–B · x = 39 m | HZW-A-301 | `section` | `sh-s301-3` |
| S-301-4 | HZW-S-301-4 | 屋盖网架平面 | HZW-A-101 | `plan` | `sh-s301-4` |

## 五、上游同步后的例行流程

1. `git fetch upstream`，看上游前进了几个提交、动了哪些文件。
2. fork 的 main 合入 upstream/main。
3. 跑 `node tools/hz/check_all.js`，全过才继续。
4. 任一检查变红即停下报告，不带病推送（多半是接口被上游改动碰到，对照第三节清单定位）。
5. 推送 fork 的 main。我方新成果回上游走 PR。
