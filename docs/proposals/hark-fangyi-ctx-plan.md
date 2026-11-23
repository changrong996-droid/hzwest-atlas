# 提案：城市远景层总体规划 + 中景标杆样本（hark-fangyi，2026-11-22）

交给：维护人 muse-tibo-cs。分支 `agent/hark-fangyi/ctx-bench`（基于 `ctx-layers` → `ctx-plan`，check_all 四片全 OK）。

## 一、内容
1. **总体规划页** `web/plan/index.html`（数据 `web/plan/plan.json`，底图 `web/plan/map.jpg` 由 `tools/hz/plan_map.py` 生成）：片区 Z0–Z3+、阶段 P0–P4 与 PR、工作包表、按分工筛选、并行交件接口。以后改计划只改 plan.json。
2. **中景标杆样本 B0**：未来科技城核心约 3.5 × 4 km，图层 `bldg.mid`（708 栋，实高深色、估高浅色）、`road.mid`（315 段主干路）、`place.names` 加「未来科技城」。标准与估高表见 `docs/ctx-mid.md`，后续各块和本地 GPU 精模交件按它对齐。
3. **施工红线**（`web/mods/osmctx.js`，本人模块）：站房两侧落客匝道等随站房建的路和楼，开通日 t=1101 前只画浅灰细线，开通后上色（OSM 是现状，第 365 天不该出现这些路）。后续由子项目 R3 按每条路自己的工期替换。
4. **信息栏收拢样机** `web/mods/infobar.js`：左上信息栏默认一行（图号 · 天数 · 工序），点开展开，拖动视角变淡。只加样式与点击，暂由 osmctx 顺带加载供预览。

## 二、外接道路列为独立子项目（PR：R1–R4）
外接道路与站房不是同一条工期线，有的早于开通、有的晚于开通，且是另外的建设主体（交投、余杭区）：
| 路段 | 节点 | t（0=2019-09-17 开工） | 来源 |
|---|---|---|---|
| 站西 I 标疏解高架 | 2020-09 底开工，2022-01 初贯通 | ≈379 → ≈844 | 浙江在线 2022-01-08 |
| 运溪高架路 | 2021-08-01 开通 | 684 | 杭州日报 2022-09-01 |
| 站西 II 标疏解高架 | 2021-12-14 贯通 | 819 | 杭州网 2021-12-15 |
| 留石高架（蒋墩路—绕城西线）、三墩互通 | 2022-06-28 开通试运行 | 1015 | 杭州网 2022-06-28 |
| 文一西路隧道（荆长大道—东西大道） | 2022-06-30 通车试运行 | 1017 | 杭州日报 2022-07-07 |
| 235 国道先行保通段（至西站西广场） | 2022-07-31 试运行 | 1048 | 市国资委 2022-08-10 |
| 留石高架西延段全面开通 | 2023-08-25 | 1438（开通后） | 杭州网 2023-08-25 |

链接：
- https://zjnews.zjol.com.cn/zjnews/hznews/202201/t20220108_23615791.shtml
- http://zzhz.zjol.com.cn/hz/jtpt/202209/t20220901_24739068.shtml
- https://ori.hangzhou.com.cn/ornews/content/2021-12/15/content_8119689.htm
- https://hznews.hangzhou.com.cn/chengshi/content/2022-06/28/content_8292002.htm
- https://www.hangzhou.gov.cn/art/2022/7/7/art_812262_59060914.html
- http://gzw.hangzhou.gov.cn/art/2022/8/10/art_1689495_58900137.html
- https://hznews.hangzhou.com.cn/chengshi/content/2023-08/25/content_8607115.htm

工作包：R1 清单与工期表（我）→ R2 疏解高架立体化（我，桥面 + 墩柱）→ R3 按路工期显隐，替换红线框（我）；R4 时间轴是否延到开通之后（维护人定）。

## 三、要宿主做的（红档共用文件，我不动）
1. `web/hzwest.html`：`mods/osmctx.js?v=1` 改新版本号（osmctx 已加图层机制、红线、信息栏加载）。
2. `tools/hz/check_all.js`：清单加 `check_ctxlayers.js`。
3. 信息栏：若采纳，把 `web/mods/infobar.js` 的样式与点击并入 `hzwest.html`，再删本文件与 osmctx 里的加载行。
4. 黄昏实景城市偏亮：给 `blend` / `duskK` 读口，我按它压暗（规划 C4）。

## 四、怎么看
分支预览打开 `web/hzwest.html`（右上「远景图层」开关；时间轴拖到 365 与 1101 对比红线）与 `web/plan/index.html`。
