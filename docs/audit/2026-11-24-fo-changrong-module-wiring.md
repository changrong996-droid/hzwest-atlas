# 审计：统一模块接入账 + 墨线/实景双模式口径 + 减法清查（任务 #49）

审计：fo-changrong · 2026-11-24 06:30 · 基线 37ef322 · 方法：git 账面核对（每条都可复核），真机视觉部分未跑，见文末清单。

## 一、挂载账（hzwest.html 全量 33 个 script 标签）

core/ 3（seq v6、pluglink v1、webgl-fallback v1）＋ fx.js v21、look.js v21 ＋ 宿主四件 hzseq v15 / hzsheet v8 / hzreal v3 / hzrel v2 ＋ sheets 7 张（s001–s501/s251）＋ mods 16 个 ＋ hzview v40。mods 盘上 18 文件、挂 16，差的两个都有下文：

- `osmctx-data.js`：**不是孤儿**。osmctx.js 空闲帧按需异步拉取（582 KB 数据，`osmctx.js:150`），设计如此。
- `infobar.js`：**悬而未决的样机**。由 osmctx.js:244 顺带加载（"宿主采纳前的预览挂法"），文件头自注"宿主采纳后应移进 hzwest.html，本文件删除"。这是 #49 该拍板的第一件事：要么转正挂载、要么撤预览加载器，两头都行，不能一直悬着。

## 二、缓存号滞后（?v= 与文件实际改动对不上，建议集成人核对后统一 bump）

逐文件比对"hzwest.html 最后一次改该行 ?v="与"该文件最后一次被改"（git log -S 法）：

| 状态 | 文件 |
|---|---|
| 文件在末次 bump 后又改过（10 个） | hzsheet.js、hzreal.js、sheets/s201.js、sheets/s401.js、sheets/s251.js、mods/s251.js、mods/yunmen.js、mods/info.js、mods/tour.js、mods/yungu.js |
| bump 提交未能用 -S 定位（4 个） | sheets/s101.js、mods/s101.js、sheets/s501.js、mods/actors.js |
| 账实相符（其余 19 个） | core/×3、fx、look、hzseq、hzrel、sheets/s001/s002、mods 其余 |

例证：mods/yungu.js 的末次改动正是 #51 合入（c5aeb14，接线行 `root.appendChild(it.el)`），而挂载行还停在集中接线点 3488197 的 v=1——合入在挂载之后是常态，v 号没人补。建议把"bump ?v="并进集成人接线清单（与 #48 提案的 manifest 同一步落账）。

## 三、墨线/实景双模式口径

hzview.js `setMode`（ink/lit，键盘 C 与 #b-mode 分段开关）为唯一口径。mods 18 个里 11 个显式处理模式（actors、cranes-anim、interior、osmctx、s101、s251、strands、tod-detail、tour、trains-ops、yunmen），5 个挂载模块不引用任何模式变量：info、loadpath、whatif、platform、yungu——按现有结构属"模式无关"（几何/数据层），**不是缺陷**，但要真机确认它们在实景档下没有样式残留（例如 platform 的站牌文字在实景下应为深色底，hzwest.html:72 已有约定）。

## 四、减法清查候选（只列有账面证据的，不动手）

1. **infobar.js 决断**（见上）：转正或删除，二选一。
2. **重复交付面**：`web/sheets/s101.js`（图纸）与 `web/mods/s101.js`（3D 模块）同名不同物，s251 同理——建议 manifest 里注明"图号 ≠ 模块"，避免后来者误判重复。
3. 未发现可直接删的宿主文件：fx/look v21 与 hzview 均在用，hzrel.js（上下游关系显示）有引用。真正的减法要靠真机过一遍后按"哪些镜头下永远不可见"来定，账面看不出来。

## 五、真机视觉验收清单（未跑，留给有浏览器的一轮）

线上 https://changsheng0804-blip.github.io/hzwest-atlas/ （main 推送后约 1 分钟更新），桌面 + 手机两视口：
① 按 C 或点分段开关往切实景再切回，逐镜头看：云门（yunmen 的 aF=3 隐旧体块）、云谷光（yungu）、站台竖向交通（platform）、 actors 服装色在实景下是否刺眼；
② tour 自动导览收起后自动切实景 2.5 s 回墨线（hzview.js:923 路径）手机端是否也走通；
③ 33 个挂载资源全部 200（控制台无 404，重点核对第二节 10 个滞后文件的旧缓存表现）。

## 下一步建议

- 集成人拍板 infobar.js 转正/删除，并把 ?v= bump 纳入接线清单（可与 #48 manifest 同稿落账）。
- 真机视觉验收建议由有浏览器与眼睛的人做（委托人或集成人），清单见第五节；我可在下一轮把 ①③ 的资源加载检查用无头方式先跑掉。
