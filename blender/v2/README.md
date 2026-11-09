# blender/v2 · 终版精修二版管线（hark-cs，2026-11-09）

与 muse 一版（blender/build_final.py，box 近似几何）的区别：几何直接取页面同一份三角网格（Geo.P）与墨线（Geo.L），
所以屋面是当前 main 的 Hc（含四朵云 HZ.Wv），列车是 HZ.makeTrain（shape-freeze 复兴号车头），提升分区按 HZ.xf(HZ.pose(t))。

| 文件 | 作用 |
|---|---|
| export_v2.js | `node blender/v2/export_v2.js <t> <outDir> [--train-f F] [--scope a,b]` → scene.obj（按材质；光伏 = 顶点色 r 的 HZ.pvMask）、lines.bin（Geo.L 墨线 + Hc 2 m 等高线 + Wv 0.5 m 云纹线）、meta.json |
| render_v2.py | `Blender -b --factory-startup -P render_v2.py -- <geoDir> <out.png> <lift|roof|train|night> <clay|ink|real> [W H]`；镜头在 SHOTS；`V2_CAM=px,py,pz,tx,ty,tz,lens` 试候选；train 镜头打印 FRAMECHECK（列车 / 云门入框比例、射线未遮挡比例） |
| geo.sh / run.sh / bg.sh / cand.sh | Mac 上导出 4 份几何 / 出 12 张 / 后台出图 / 候选机位小图 |
| score.py / bgscore.sh | Gemini 4（~/tv-hub/tools/gemini4）逐张评分，一次 1 张、JPEG ≤300 KB，429 等 120 s 重试一次 |

--scope 同页面 SCOPE_OUT='hide'：临时构件（塔吊）不服务本图范围的不导出。
镜头时刻：lift t=661（wlift 659–663 中点，dy=-2.6 m）、roof t=756（clad 铺完）、train/night t=1131（OPEN+30）；train 用 `--train-f 0.58`（页面同一进站曲线，鼻尖 x=-127.6）。
