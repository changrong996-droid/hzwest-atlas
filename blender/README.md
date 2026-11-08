# HZ3-B1：Blender 空间外观验证件（独立实验件）

## 1. 数据来源

- 数据源：`/tmp/hzatlas-work`（`hzwest-atlas` 仓库 HZ 数据模型）
- 加载方式：通过仓库自带基座 `/tmp/hzatlas-work/tools/hz/harness` 加载 `HZ` 并调用 `HZ.make()`，导出静态盒（`acts -> parts -> geo.boxes`）、屋盖网格（`HZ.cells` 及 `HZ.Ht(xc, zc)` 计算的顶面标高 `yTop`）、提升器（`HZ.lifters`）及提升阶段中点姿态（`HZ.pose(642.5)`）。

## 2. 导出几何计数基线

- `boxes`: `7334`
- `cells`: `1432`
- `lifters`: `32`
- `dyMid` (`t = 642.5`): `{"1": -5.2, "2": -5.2, "3": -5.2, "4": -5.2}`

## 3. Lifting 状态近似说明

- **final 状态**（用于 `view_a_final.png`、`view_c_east.png`）：屋盖四分区（`grp = 1..4`）位于各自设计完成高度 `[yTop - 1.4, yTop]`。
- **lifting 状态**（用于 `view_b_lifting.png`）：取 `lift3`（整体提升，640..645）中点时刻 `t = 642.5`，**仅屋盖格（cells）按所属分区 `grp` 施加 `meta.dyMid[grp]`（−5.2 m）的高度偏移**；其余几何体（静态盒 `boxes`、提升器 `lifters`、地面）均保持静态位置不变，不随分区姿态变化。此为空间外观验证件的几何近似。

## 4. 完整复现命令

在 `~/hz-blender-lab` 目录下依次执行：

```bash
# 1. 从 /tmp/hzatlas-work 导出几何数据生成 geometry.json
node export_geometry.js

# 2. 使用 Blender 5.2.2 LTS 后台构建场景并输出 3 张 1920x1080 渲染图到 renders/
"/Applications/Blender.app/Contents/MacOS/Blender" --background --python build_scene.py -- geometry.json renders
```

---

# HZ3-B2：Blender 外观 v2（镜头/光影修订＋拼装↔成品对比组）

## 1. 拼装态（t=620）口径说明

- **拼装态几何变换**：取 `t = 620`（拼装期姿态 `HZ.pose(620)`），对所有随分区运动的构件施加 `HZ.xf(HZ.pose(620), grp, pt)` 真实刚体变换：
  - 全区均含提升行程分量 `dy = -5.8 m`；
  - 南北两翼（`grp = 1`、`grp = 3`）绕外缘旋转垂下，原高约 `55 m` 的屋盖点变换后 `y ≈ 27.3 m`（垂下约 `28 m`）；东西两区（`grp = 2`、`grp = 4`）变换后 `y ≈ 49.2 m ~ 49.8 m`；
  - `t = 660` 成品态下 `HZ.xf` 为恒等变换。
- **构建方式**：
  - `asm.boxes`（`3872` 个，来自 `part.grp ∈ {1,2,3,4}` 的盒）按盒的 8 个角点逐角经 `HZ.xf` 变换后导出 `corners`，在 Blender 中还原 6 面真盒网格，并与 `grp == 0` 的静态盒按材质（`found` 与其余钢构件）合并；
  - `asm.cells`（`1432` 格）在 `y = yTop` 处取顶面 4 角经 `HZ.xf` 变换导出 `quad`，在 Blender 中以 `quad` 为顶面、顶面 4 点在数据坐标 `y` 方向各减 `1.4 m` 为底面连接侧面构成封闭薄板（薄板厚度方向为近似），按 `grp` 分四组着色合并。

## 2. v2 五张新图清单与机位参数

所有坐标均为数据坐标 `(x, y, z)`（映射到 Blender 为 `(x, -z, y)`），分辨率均为 `1920×1080`：

| 文件名 | 场景状态 | 相机位置 `(x, y, z)` | 目标点 `(x, y, z)` | 焦距 |
| --- | --- | --- | --- | --- |
| `renders/pair_asm.png` | 拼装态（`t = 620`） | `(305, 150, 305)` | `(0, 26, 0)` | `42 mm` |
| `renders/pair_final.png` | 成品态（`t = 660`） | `(305, 150, 305)` | `(0, 26, 0)` | `42 mm` |
| `renders/view_a2_overview.png` | 成品态 | `(430, 330, 430)` | `(0, 18, 0)` | `40 mm` |
| `renders/view_b2_close.png` | 成品态 | `(195, 110, 215)` | `(0, 40, 0)` | `50 mm` |
| `renders/view_c2_east.png` | 成品态 | `(445, 80, 0)` | `(0, 32, 0)` | `55 mm` |

## 3. 复现命令（不变）

```bash
node export_geometry.js
"/Applications/Blender.app/Contents/MacOS/Blender" --background --python build_scene.py -- geometry.json renders
```
