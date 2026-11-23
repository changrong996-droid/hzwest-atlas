# 远景图层（ctx layers）· 怎么往城市远景里补东西

城市远景层 `web/mods/osmctx.js`（hark-fangyi）是底座：OSM 现状城市 + 哥白尼地形。之后任何人补内容——一片水面、一组规划楼、地名、施工期临时道路、某条线路的走向——都走**图层**，不改底座、不改宿主文件。

## 三步加一个图层
1. 准备 GeoJSON（WGS84 经纬度，可从 OSM、geojson.io 手绘、公开规划图描摹）。properties 可带：`name`、`height`（面 → 体块）、`width`（线 → 道路带）、`color`、`y`（抬高）、`kind: "pin"`（点 → 竖针）、`from` / `to`（工期 t 天，只在 [from, to) 显示）。
2. 生成：`python3 tools/hz/ctxlayer.py 源.geojson --id 主题.名 --name 开关上的名字 --by <智能体> --src "署名" --license "ODbL 1.0" [--from T --to T] [--off] [--simplify 2]`
   → 写出 `web/mods/ctx/<id>.js`，并在 `web/mods/ctx/layers.json` 登记（重跑自动加版本号）。源 GeoJSON 放 `tools/hz/ctx_src/`。
3. `node tools/hz/check_ctxlayers.js` 通过即可提交；页面右上「远景图层」开关里会多出一行。

## 图层格式（手写也行）
```js
(window.HZ_CTX_LAYERS = window.HZ_CTX_LAYERS || []).push({
  id: 'water.xixi', name: '西溪湿地水面', by: 'hark-xx',
  src: { text: '© OpenStreetMap 贡献者', license: 'ODbL 1.0', url: '' },
  from: 0, to: 2000, on: true,                      // 可选：整层的工期窗、默认开关
  items: [ { k: 'area', p: [[x, z], …], c: '#bcd6e6' }, { k: 'pin', p: [x, z], n: '西溪湿地', h: 160 } ],
  build(api) { /* 可选：自己画，api.mesh / line / flat / label / ribbonTris / segs / ll(lon, lat) / ground(x, z) / THREE / group */ }
});
```
- `k`：`area` 面、`line` 线、`road` 带（`w` 宽）、`bldg` 体块（`h` 高）、`label` 标注、`pin` 竖针。单条也可带 `from` / `to`。
- 坐标为模型系 `[x 东, z 南]`（米，原点站房中心）；经纬度用 `api.ll(lon, lat)` 或工具换算，与底座同一套（转 4.3°、东移 10 m）。范围 ±16 × ±12 km（地形范围）。
- 竖针与标注自动落在地形上（`api.ground`）。

## 规矩（check_ctxlayers 会查）
- `id` 小写、唯一，与清单一致；`by`、`src.text` 必填；`src.license` 只收 ODbL / CC-BY / CC0 / 公有领域 / 自绘 —— **不收商业或卫星影像**。
- 单个图层文件 < 300 KB，全部图层 < 1 MB；太大用 `--simplify` 抽稀或拆层。`web/mods/ctx/` 下的 .js 都要登记。
- 不动宿主几何：站房、股道、云门归宿主模型；图层只画站外环境。
- 加载：osmctx 读 `ctx/layers.json` 动态加载，所以**加图层不用改 hzwest.html**；地形解压后才建图层，竖针高度才对。

## 接入要宿主做的两件小事（hark-fangyi 2026-11-22，红档共用文件，等集成人）
1. `web/hzwest.html`：`mods/osmctx.js?v=1` 改 `?v=2`（osmctx.js 已加图层机制，避免浏览器用旧缓存）。
2. `tools/hz/check_all.js`：清单加 `check_ctxlayers.js`。
