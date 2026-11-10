# blender/v2 · 终版精修二版管线（hark-cs，2026-11-09）

与 muse 一版（blender/build_final.py，box 近似几何）的区别：几何直接取页面同一份三角网格（Geo.P）与墨线（Geo.L），
所以屋面是当前 main 的 Hc（含四朵云 HZ.Wv），列车是 HZ.makeTrain（shape-freeze 复兴号车头），提升分区按 HZ.xf(HZ.pose(t))。

| 文件 | 作用 |
|---|---|
| export_v2.js | `node blender/v2/export_v2.js <t> <outDir> [--train-f F] [--scope a,b]` → scene.obj（按材质；光伏 = 顶点色 r 的 HZ.pvMask）、lines.bin（Geo.L 墨线 + Hc 2 m 等高线 + Wv 0.5 m 云纹线）、meta.json |
| render_v2.py | `Blender -b --factory-startup -P render_v2.py -- <geoDir> <out.png> <lift|roof|train|night> <clay|ink|real> [W H]`；镜头在 SHOTS；**三版起每张定稿的参数在 TABLE（镜头 × 风格，`src` 注明取自哪一轮），脚本直接复现 12 张定稿，不再回退 git**；`V2_SET='k=v;k=v'` 临时覆盖开关（strands / real3 / glow3 / cam / exp …），`V2_CAM=px,py,pz,tx,ty,tz,lens` 试候选；日志首行 V2_PARAMS 打印本张与默认不同的参数；train 镜头打印 FRAMECHECK（列车 / 云门入框比例、射线未遮挡比例），lift 打印 STRANDS（钢绞线组数 / 根数） |
| geo.sh / run.sh / bg.sh / cand.sh | Mac 上导出 4 份几何 / 出 12 张 / 后台出图 / 候选机位小图 |
| score.py / bgscore.sh | Gemini 4（~/tv-hub/tools/gemini4）逐张评分，一次 1 张、JPEG ≤300 KB，429 等 120 s 重试一次 |

--scope 同页面 SCOPE_OUT='hide'：临时构件（塔吊）不服务本图范围的不导出。
镜头时刻：lift t=661（wlift 659–663 中点，dy=-2.6 m）、roof t=756（clad 铺完）、train/night t=1131（OPEN+30）；train 用 `--train-f 0.64`（页面同一进站曲线，鼻尖 x=-59.4 已进屋盖）。

三版（2026-11-09，r6–r8）新增：提升段钢绞线束（红色提升器按位置聚 32 组，每组顶部向下对网架做 13×13 射线采样取上弦吊点，画 4 根竖向钢绞线）；
实景材质（屋面立缝 Wave 凹凸 + 噪声粗糙度 + 各向异性、采光顶/幕墙低粗糙金属反射、股道金属、混凝土/地面噪声混色、物理天空 + 曝光）；
夜景发光十字描边（采光顶格栅线高亮自发光 + 合成器 Glare 阈值 1.25）；S-501 拉近机位 TRAIN3（墨线版保持二版机位）。

## 细节加强与控制图（hark-cs，2026-11-09，给「AI 补成照片」用）

| 文件 / 开关 | 作用 |
|---|---|
| `V2_SET="detail='on'"` | 几何细节加强（默认 off，定稿 12 张不受影响）：① 棱边倒角 bevel_w 0.15 m（混凝土 / 楼板 / 站台 / 基础 / 云门体块，> 30° 的棱）；② 屋面直立锁边：南北向每 0.5 m 一条锁边肋（60 × 80 mm），竖直射线贴屋面，遇采光顶 / 光伏 / 边缘断开（S-401：907 段、48.8 万顶点）；③ 采光顶竖梃 = 页面同源格栅线（Geo.L glass）→ Ø180 mm 圆管；幕墙 todG / ymG 按立面平面每 1.5 m 竖梃、4.5 m 横梁（S-401 时刻还没有幕墙，未触发）；④ 网架 = 页面同源中心线（Geo.L steel）→ 弦杆 Ø240 / 腹杆 Ø140 圆管 + 节点螺栓球 Ø440（度 ≥ 3 的节点），替换原三棱柱。`d_parts='bevel,seam,mull,steel'` 可选子集。构建约 1 秒 |
| `V2_SET="site='on'"` | 工地设备（默认 off，定稿不受影响；11-09 为 S-401 AI 补照片加，AI 成图曾被扣「屋面合拢却没有塔吊、脚手架」）：① 提升架 `liftf`：原黄色提升柱中靠屋盖四角的 4 根（±170, ±150/160，71 m）原位改成 2.6 m 方格构柱 + 缀条 / 每 12 m 缀板 + 柱顶 8 × 8 m 提升平台与栏杆 + 伸向屋面边的悬挑桁架梁（±60° 内找最近屋面边，65–72 m）+ 液压提升器 + 4 根竖向钢绞线落到屋面网格吊点（约 39 m）；② 塔吊 `crane`：原远处 4 根黄柱（x ±260 / z 262）原位补成完整塔吊，另加 3 台（东北平台 155,−70 / 西南平台 −155,70 / 北侧场地 −40,−190），塔身格构 + 塔帽 + 三角格构起重臂 50 m + 平衡臂 15 m + 配重 + 拉杆 + 小车吊钩，臂高 84 m、塔帽顶 94 m（屋面最高 55.6 m）；履带吊 2 台（205,50 / 195,−100，25 m 平台上，主臂 42 m）；③ 堆料 `stock`（H 型钢束 / 钢板垛 / 钢管垛）、板房 `cabin`（集装箱两层 + 楼梯走廊）放在股道两侧 25 m 混凝土平台（不压 12.5 m 股道层）。落地高度用竖直射线贴现有几何；`site_lift` / `site_cranes` / `site_crawler` 可覆盖布置。原 `yellow` 物体在 site=on 时整体替换 |
| style `depth / normal / seg / line` | 控制图：全自发光无光照，渲 float32 EXR 后在 Blender 内用 numpy 后处理成 PNG（自带 PNG 编码）。depth = 逆深度归一化（近白远黑）8 位 + `_16.png`；normal = 相机空间 `_cn`（红 = 左、绿 = 上、蓝 = 朝相机）/ `_gl`（红 = 右）；seg = 纯色分割（1 采样无混色，色表在脚本 SEG）；line = 白底黑线（Freestyle）。每张附 `_cam.json`（相机矩阵、近远平面、分割像素统计） |
| `ctrl.sh <off\|on\|site> [W H] [style…]` | S-401（t=756）出控制图到 Mac `~/blender-v2/ctrl/s401/<off\|on\|site>/`（site = detail on + site on），并出 1024 宽版（seg 最近邻缩放保纯色）与线稿反色版 |
| `V2_SET="env='on'"` | 环境（默认 off，定稿与 site 版不受影响：t756 site 版 seg / depth 重渲 md5 与旧图一致；11-09 为 S-401 AI 补照片加，AI 成图曾被扣「背景空白」）：① 城市楼群 `city`：距站房 0.8–3 km 的 150 m 街区格，每 4 格留 30 m 主街，每格 1–3 栋体块，高 20–120 m（东 / 东北偏高、往外渐低），股道走廊 \|z\| < 220 m 不放（约 750 栋）；② 低山 `mount`：3–8 km 环带高度场，西侧 100–300 m、东侧 ≤ 90 m（示意轮廓，非实测地形）；③ 道路 `road`：站外环路（z −300 / +330、x ±760，宽 24 m）+ 城市主街。地面扩到 20 km；depth 远平面上限 3 km → 9 km。`env_seed` 改布局 |
| `ctrl.sh half` / `half_wide` | S-401 **半铺时刻 t=725**（2021-09-11；金属屋面 clad 693–755 由北往南按条铺，t=725 时按面积铺完 46% + 正在铺 14%，南侧约 40% 网架外露）+ detail / site / env on → `~/blender-v2/ctrl/s401/half/`（白模 / 深度 / 分割，1920 与 1024 宽）。`half` 与旧控制图同机位（俯角 23°，画面上沿只到约 1 km 外的地面，远山不可能入画，城市只在上沿一条）；`half_wide` 同一相机位置抬头到俯角约 18° + 26 mm（`cam=((318,236,352),(0,92,8),26)`），露出天际线、城市与远山，出到 `half/wide/`。几何：`node blender/v2/export_v2.js 725 ~/blender-v2/geo/t725 --scope holes,sky,clad,pv` |
| `ctrl.sh timeline <t> <名> W H [style…]` | S-401 **时间轴**：任意时刻 t、`half_wide` 同一机位（俯角约 18°、26 mm）+ detail / site / env on → `~/blender-v2/ctrl/s401/timeline/<名>/`（默认 clay depth，另出 1024 宽）；几何 `~/blender-v2/geo/t<t>` 缺则按 `--scope holes,sky,clad,pv` 导出；t ≥ 683（提升架 rig 671–683 已拆）时 `site_lift=[]` 不画提升架。已出：**A t=693**（2021-08-10，提升孔嵌补刚完成，网架完整、无覆面）、**B t=703**（2021-08-20，十字采光顶完成 53% + 在装 8%，金属屋面完成 3% + 在铺 14%）、**D t=786**（2021-11-11，金属屋面与屋面光伏全部完成）；C = 已有 `half/wide`（t=725） |
| `ctrl.sh shot <lift\|train> <t> <名> W H [style…]` | **S-301 / S-501 时间轴**（组内机位固定）+ detail / site / env on → `~/blender-v2/ctrl/<s301\|s501>/timeline/<名>/`（`s301_*` / `s501_*`，默认 clay depth + 1024 宽）；几何 `~/blender-v2/geo/t<t>`（`CTRL_GEO` 覆盖）缺则按该镜头 scope 导出（lift：`lift,merge,wlift,head,asm1,asm2,asm3,rig`；train：`ymf,ym,ymc,tod,open`）。site 按工序取舍：t ≥ 683 `site_lift=[]`，t ≥ 1060（塔吊拆完、主体完工）site 整体 off。机位：S-301 `LIFT_CAM=((235,40,265),(70,30,75),30)`（定稿 lift 机位后退，屋盖东南角 + 角部提升架整根入框）；S-501 = TRAIN3（depth 也显式传，否则 depth 会回落到 SHOTS 默认机位）。已出：**P1 t=636**（2021-06-14，网架在楼面低位拼装完、胎架 / 落地胎架仍在、提升前）、**P2 t=661**（2021-07-09，整体提升一半 dy −2.6 m，胎架已拆，提升器 + 钢绞线）、**P3 t=664**（2021-07-12，提升到位 dy 0、提升器仍在、补孔前；与 P2 只差 2.6 m，画面差别小）、**P3b t=683**（2021-07-31，提升架已拆完、提升孔嵌补开始前，备选）、**R1 t=1100**（2022-09-21，主体完工、无车）、**R2 t=1131**（2022-10-22，`CTRL_GEO=geo/t1131f64`，运营、列车在进站曲线）；S-401 **C t=725** 已按 `site_lift=[]` 重出到 `s401/timeline/C/`（旧 `half/wide` 带了已拆的 4 座提升架） |
| `ctrl_edges.py <on 目录> <off 目录>` | detail=on 的线稿：Freestyle 在约 100 万面细节几何下 > 20 分钟出不来，改为由 on 的 seg / normal / depth EXR 做边缘检测（类别变化 ∪ 法线夹角 > 30°（屋面板内部除外）∪ 相对深度跳变 > 1.5%），再与 off 的 Freestyle 线稿（含四朵云等值线）取并集 |

性能（Mac mini M4，EEVEE）：控制图每张 1–4 秒；实景 detail=on 5.6 秒；白模 detail=on 不画 Freestyle 淡线（6 秒）；墨线 / 线稿 Freestyle 只能带竖梃（`d_parts='mull'`，约 3 分钟），全部细节 > 20 分钟未完。
