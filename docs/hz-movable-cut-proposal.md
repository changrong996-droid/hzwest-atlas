# 可动剖面刀：上游改造提案（HZ2-03 调查结论）

> 提出方：图册外挂侧（hzatlas）。第二阶段原计划第三卡「剖切面联动——剖面位置是一把可移动的刀」：
> 在平面图上拖动 B–B 剖切线，横剖面图与 3D 剖切面跟着变。
> 2026-11-08 逐行调查后的结论：**真刀做不了旁路，必须改宿主三处加载时预计算**。本文给出证据与改造规格，
> 请上游评估排期；宿主支持后，外挂侧的拖动手势与状态同步（规格见文末）可在一张小卡内补齐。

## 一、能跟着 `HZ.SEC_X` 走的部分（已查实，无需改动）

`HZ.SEC_X` 是普通可写属性（`web/hzseq.js:429`，`HZ.SEC_X = 39`），以下读取点都是调用时现读，改值即生效：

- 3D 裁切面：`web/hzview.js` `setCut(m)` 用 `HZ.SEC_X` 设 `U.uCut` 与 `CUTP.constant`；
- 剖面镜头：同文件 `cutShot(m, t)` 以 `XS = HZ.SEC_X` 构图；
- 剖面曲线与净空：`web/hzseq.js` `HZ.secY(ps, t, z, XS)`、`HZ.secGap(ps, t, XS)` 的 XS 缺省现读 `HZ.SEC_X`；
- 平面图上的 B–B 线：`web/hzsheet.js` plan 函数以 `Y(HZ.SEC_X)` 现画，重绘即跟随；
- 拾取与碰撞：`pick3D`、`roofAt` 等多处现读 `HZ.SEC_X`。

## 二、钉死在 x = 39 的三处预计算（改造对象）

1. **横剖面图的静态几何（web/hzsheet.js:17-20，模块加载时执行一次）**
   `secBoxes`（穿过 X0 的构件盒）、`secCells`（跨 X0 的网架格）、`skinZ`（在 X0 处采样的屋面点列）
   都以加载时的 `X0 = HZ.SEC_X` 过滤/采样生成，section 函数绘制时直接消费。
   只改 SEC_X 而不重算这三组，剖面图画的仍是 39 处的构件截面——与 3D 裁切面互相矛盾。
2. **3D 剖切盖面（web/hzview.js:163 的 CAP IIFE，加载时执行一次）**
   以 `SX = HZ.SEC_X`、`XC = SX + 0.04` 为所有穿切构件预生成盖面 BufferGeometry（属性 aK/aR/aY/aF/aE）。
   裁切面移动后，盖面仍停在 39.04 处，3D 里会出现「切口在新位置、截面盖子浮在旧位置」的脱节画面。
3. **剖面图标题文字（web/hzsheet.js section 函数首行）**
   图名硬编码 `'横剖面 B–B · x = 39 m · 向东看'`，与 SEC_X 无关。

## 三、建议的宿主改造（最小面）

1. hzsheet：把 secBoxes / secCells / skinZ 的生成提成函数 `buildSec(X0)`，保存当前 X0；
   section 绘制前若 `HZ.SEC_X` 与保存值不同，先重算再画（或提供 `SH.rebuildSec()` 由外部调用）。
2. hzview：CAP 的几何生成提成函数 `buildCap(SX)` 返回 BufferGeometry；`setCut` 或一个新入口
   `S.setCutX(x)` 在 SEC_X 变化时 dispose 旧几何、换上新几何（uniform 对象 CU 不变，只换 geometry）。
   建议顺势提供正式入口 `S.setCutX(x)`：内部写 `HZ.SEC_X = x`、重建 CAP、按当前 cut 模式刷新
   `U.uCut / CUTP.constant`、sheetInv + dirty——外挂与宿主将来都走这一条路，不再散点直写 SEC_X。
3. section 图名改为模板：`'横剖面 B–B · x = ' + HZ.SEC_X + ' m · 向东看'`。
4. 检查侧建议：`tools/hz/check_sheets.js` 增加一组「临时把 SEC_X 改为 0 后 section 可正常绘制、
   secY 曲线与 39 处不同」的断言（在 Node 里验证重算路径不炸）；`check_make` 的 zero 基线不受影响（与 SEC_X 无关）。

改造后外挂侧的验收口径（三处一致）：拖线到 x = a 后——平面图 B–B 线在 Y(a)、横剖面图标题写 a 且
静态截面为 a 处构件、3D 裁切面与盖面同在 a 处；三者任一不符即不算完成。

## 四、宿主支持后，外挂侧补齐的部分（本侧规格，先存档）

- 平面图（子图 4）上拖动 B–B 线改刀口：pointerdown 落在 B–B 线 ±10 px（图纸坐标）内起拖，
  移动阈值 6 px 内仍算点击（不影响 HZ2-01 的点图飞镜头）；拖动中节流调用 `S.setCutX(x)`，
  x 取整并钳制在 [-120, 120]；若当前未开剖切，起拖即按模式 1 开切。
- 刀口位置写入 hash 参数 `cutx`（宿主 hashSync 保留未知参数，已查实），刷新/分享链接可复现；
  mount 时读 `cutx` 初始化。
- 子标签条在横剖面页签旁显示当前刀口读数 `x = <a> m`（小字，与现有提示同层级）。
- 检查：check_atlas 增加 cutx 解析与钳制的纯函数断言；位置正确性照例以浏览器实测为准。
