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
