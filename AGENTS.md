# AGENTS.md · 多智能体协作约定

> **【迁移公告 · 2026-11-22 委托人定】图册协作迁到 relay-V3。本页旧流程（收件门 / 认领板）自本公告起只用于收尾在做的事，不再接新认领；新活一律走 V3。**
> - **新门（三地址轮换，哪个通哪个是当班门）**：① https://8765-agqw5j356gn4k75di4h3ixq2ki.instabox.tech ② https://8765-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech ③ https://8765-agqw476xysfznjvxms7h7jpmse.instabox.tech （公网，免账号、免 Tailscale；工牌与门票三个地址通用，都通向同一位管家与同一台内核）
> - **报名（自助，三步）**：① POST /enroll，JSON：{"name":"<你的名字>","family":"<模型族>","caps":["<能力>"],"password":"<自设口令，至少 8 位>"}；② POST /enroll/status（同名＋口令）查到 approved；③ 之后所有请求带请求头 X-Badge: <名字> 与 X-Badge-Secret: <口令>。口令自己设、自己记，忘了用同名重新报名申请重置（集成人批准后生效）；真门票由门上管家保管，不经任何人递送。
> - **进门后**：先 GET /pulse、GET /brief，办事走 POST /mcp（先 tools/list）。当前批次与实时开放任务清单以 GET /brief 返回为准。
> - **看全任务与补丁（只读查看接口）**：GET /view/task/<编号> 看任务全貌（说明、能力要求、改动范围、验收口径与名下提交）；GET /view/submission/<编号> 看补丁正文、验货记录与全部评审。带工牌头或门票即可，与进门同一套验身。
> - **门为什么有三个地址**：平台收紧了免费机上限（单轮最长 120 分钟、到顶强停、冷却约 3 小时），单台撑不住全天，2026-11-22 起门改三台机轮换值班（决定 seq 27）。某个地址 502 或超时，就换下一个地址；换班瞬间可能有一两分钟空档，隔几分钟再试，不要当作试点关门。
> - **门偶发 502**：公网门经隧道接入，偶发 502（冷启动/瞬时重启，5–30 秒自愈），遇 502 隔 10–30 秒重试即可。
> - **不变的规矩**：交付仍以本仓为准（patch 提交、考卷 check_all、绿 / 黄 / 红分档）；新成员默认绿档起步，升档由集成人 muse-tibo-cs 定；红档仍由委托人确认。
> - **基线**：以 GitHub main 为准（不要记提交号）。拉取三选一：GitHub 新仓 https://github.com/changsheng0804-blip/hzwest-atlas.git 、镜像 A https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/hzwest-atlas.git 、镜像 B https://8090-agqw5j356gn4k75di4h3ixq2ki.instabox.tech/hzwest-atlas.git 。
> - **例外**：S-252 屋盖提升按委托人暂缓令留在旧认领板，不迁。g-fangyi、g-liuzhijie、g-wangmushan、g-tanghui、m-hxt 已入驻 V3，委托人特批黄档（决定 seq 23）。muse-cr 随后加入并特批黄档（决定 seq 25）。

任何智能体（不同 Hark 账号或其他 AI）参与本仓库前，先读完本页和 `docs/BRIEF.md`（项目简报：目标、委托人口味、插件接法）。每个空置任务都有任务书 `docs/tasks/<事项>.md`。

## 0. 开工三步（不需要委托人转述，一切以仓库为准）

1. 带工牌头调新门 `GET /pulse`、`GET /brief`（新门地址与工牌用法见顶部迁移公告）：批次状态、派给你的任务、待你评审的提交、上次来之后的新事件。
2. `git pull`（拉取地址见顶部公告），读本文件和你事项的任务书（`docs/tasks/`）、最新审查意见（`docs/review/`、`docs/audit/`）。
3. 有问题走新门 ask 向集成人提问（POST /mcp 的 ask），不经过委托人。旧 `CLAIMS.md`「接口请求」只用于收尾旧事项，不再接新问题。 （2026-11-09 起 `CLAIMS.md` 只放进行中的事，顶部「索引」表列出各小节所在文件：决定记录 → `docs/decisions.md`，已关单派单 → `docs/dispatch-archive.md`，已回复接口请求与 7 天前的报名/退回 → `docs/claims-archive.md`。）

**派单**：muse-tibo-cs 每次合并、审查后，把发现的后续问题拆成小单建进 V3 当前批次（旧 `CLAIMS.md`「派单」只收尾）。`GET /brief` 里派给你的任务就是派单，**先做派单，再做自领任务**；派单不占认领名额。做不了就用 ask 说明原因，muse-tibo-cs 改派。同一人同时待做的派单一般不超过 2 张；本地能力强的 `traycer-cs`、`muse-tibo-cs` 可同时持有 3 张（11-08 起，委托人要求少留多派）。 （2026-11-09 起 `CLAIMS.md` 只放进行中的事，顶部「索引」表列出各小节所在文件：决定记录 → `docs/decisions.md`，已关单派单 → `docs/dispatch-archive.md`，已回复接口请求与 7 天前的报名/退回 → `docs/claims-archive.md`。）

**建议**：在你自己那边设一个定时任务（每 1–2 小时），每次跑第 1 步（`GET /pulse`）；有派单或审查意见就接着做，没有就安静结束。这样委托人不用传话。

委托人只管三件事：做什么、先做哪个、好不好。他的意见由 muse-tibo-cs 写进 `docs/review/`，不靠转述。

## 1. 名册

| 名字（Agent） | 身份 | 角色 | 提交途径 |
|---|---|---|---|
| `hark-cs` | Hark · changsheng0804 账号（hark-changsheng）；可用本地 Mac（Metal GPU、Blender）、虚拟机、多种 API/CLI | 原集成人（2026-11-22 移交 muse-tibo-cs，额度耗尽） | B 收件 |
| `muse-tibo-cs` | muse 智能体（GitHub tanxinhao2026-netizen） | **集成人 + 规划人**（2026-11-22 起，委托人定）：审查、合并、推送 main，维护共用文件，规划与派单；图册旁路 hzatlas、检查基座；**本地 GPU + Blender + Gemini 4 CLI：渲染、精修、视觉审查优先派它** | 直接推送 |
| `hark-cr` | Hark · changrong996 账号 | 原集成人（2026-11-12 移交 hark-cs，额度有限） | B 收件 |
| `hark-fangyi` | Hark · 方熠账号 | S-201 | B 收件 |
| `hark-liuzhijie` | Hark · 刘志杰账号 | S-101、S-501 | B 收件 |
| `hark-darrio` | Hark · darronlangfnr 账号；云沙盒无 GPU，可跑无头浏览器截图 | 待认领；建议接 JS 插件、检查脚本、资料核对 | B 收件 |
| `pi-t2`、`pi-t3` | pi 编码智能体（Gemini 3.8），原跑在委托人 InstaBox test-2、test-3 上。**2026-11-22 已停用**，其旧认领（公开数据核对、小屏可读性检查）已释放回开放 | 已停用 | — |
| `marvis` | Marvis · 委托人朋友的 Windows 本机智能体，试用本协作方式（无 GitHub 账号）。**只接备注标「小活」的事项，同时最多 1 项；交付一律人工审，不进自动合并档** | 待认领；建议 Windows 真机审查 | B 收件 |
| `zcode-cs` | ZCode · 委托人本机智能体 | 认领板数据化提案；先接中小活 | B 收件 |
| `g-fangyi` | Gemini · macOS 本机智能体（自报可调本地 Blender、浏览器、Python） | V3 成员（黄档，决定 seq 23）；建议先接图纸插件、检查脚本、资料核对（本地渲染待能力表核实后再派） | V3 工牌 |
| `g-liuzhijie` | Gemini · G-刘志杰（云端沙盒 Linux，无 GPU、无 Blender） | V3 成员（黄档，决定 seq 23）；建议接 JS 插件、Node/Python 检查、资料核对与文档 | V3 工牌 |
| `g-wangmushan` | Gemini 智能体（云沙盒，无 GPU、无 Blender） | V3 成员（黄档，决定 seq 23）；建议接公开资料检索与数据核对 | V3 工牌 |
| `g-tanghui` | Gemini 智能体（云端沙盒 Linux，2 核 8 GB，无 GPU、无 Blender；Node 18 / Python 3.11） | V3 成员（黄档，决定 seq 23）；建议接 JS 插件、检查脚本、资料核对与文档 | V3 工牌 |
| `m-hxt` | Muse 智能体 | V3 成员（黄档，决定 seq 23）；审查、集成协助、文档 | V3 工牌 |
| `muse-cr` | Muse 智能体（另一账号） | V3 成员（黄档，决定 seq 25）；代码、审查、文档、Python | V3 工牌 |
| `fo-cs` | GLM · Fo 系智能体 | V3 成员（绿档，2026-11-22 委托人令批准）；代码、审查、文档、Python | V3 工牌 |
| `fo-fangyi` | GLM · Fo 系智能体 | V3 成员（绿档，2026-11-23 委托人批）；代码、审查、文档、Python | V3 工牌 |
| `hark-liuzhijie` | Claude · Hark 多模型路由（Opus 5.5） | V3 成员（黄档，2026-11-23 委托人批）；审查、底座、文档 | V3 工牌 |
| `fo-changrong` | GLM · Fo 系智能体 | V3 成员（绿档，2026-11-23 委托人批）；代码、审查、文档、Python | V3 工牌 |
| `fo-wangmushan` | GLM · Fo 系智能体 | V3 成员（绿档，2026-11-23 委托人批）；代码、审查、文档、Python | V3 工牌 |

### 1.1 本地能力（自报，决定重活给谁）

渲染、精修这类重活只给有本地权限的智能体。请在下表自报你那边**实际能跑**的东西（改这张表算合法改动，提交写 `[caps]`）。备注里标「需本地」的事项，只有本表 Blender 一栏为「有」的才能认领。

| 名字 | 本地机器 | Blender | 本地视觉模型 CLI（如 Gemini 4） | 其它 |
|---|---|---|---|---|
| `hark-cr` | 无（云沙盒，无 GPU） | 无 | 可经委托人 Mac 调用，限审查 | 集成、Node 检查 |
| `hark-cs` | 委托人 Mac mini M4（10 核，24 GB，Metal GPU；Chrome 无头 + 真 GPU）+ 5 台云端 4 核虚机 | 有，5.2.2 LTS（EEVEE，后台 -b -P） | Gemini 4（Vertex，`gemini4` / `agy`）；本地 SD；图像编辑模型 | ffmpeg、puppeteer、Node、Python/uv |
| `hark-fangyi` | 无（Hark 云沙盒，Linux，无 GPU） | 无 | 无独立 CLI；本身多模态，能读自己渲染的 PNG 自评 | Node 无头渲染插件图纸（@napi-rs/canvas）；curl 核验公开来源 |
| `hark-liuzhijie` | 无（云沙盒 Linux，2 核 7 GB，无 GPU） | 无 | 无独立 CLI；模型能看图，自审无头渲染 PNG | Node 检查、无头 canvas 出图、公开资料核对、镜头扫描；不接「需本地」 |
| `muse-tibo-cs` | 本地 GPU 机 | 有，Blender 5.2.2 LTS | Gemini 4 CLI，额度充足 | 重活首选 |
| `hark-darrio` | 云沙盒 2 核 ARM、8 GB，无 GPU | 无 | 无本地 CLI；自身可读图，用无头 Chromium（Playwright + SwiftShader 软渲染）截图自评 | Node 22、Python 3.12；单条命令 ≤ 20 分钟，不接渲染 / GPU 事项 |
| `pi-t2`、`pi-t3` | InstaBox 4 核 8 GB，无 GPU | 无 | 无 | Node、Chromium 无头 |
| `marvis` | Windows | 未报 | 未报 | 只接小活 |
| `traycer-cs` | 委托人 Mac mini M4（10 核，24 GB，Metal GPU；Traycer 内置真机浏览器直看 WebGL 渲染） | 有，5.2.2 LTS（EEVEE / Cycles，后台 -b -P） | Gemini 4（自身多模态直读渲染截图自评） | Node、Python、Puppeteer、本地浏览器实时交互审查与方向建议 |
| `zcode-cs` | 未报 | 未报 | 未报 | 未报 |
| `g-fangyi` | 未报 | 未报 | 未报 | 未报 |
| `g-liuzhijie` | 未报 | 未报 | 未报 | 未报 |
| `g-wangmushan` | 未报 | 未报 | 未报 | 未报 |

分工原则：建模规则、图纸、数据在仓库里由大家做；**Blender 精细渲染与最后精修交给本地有 Blender + 视觉模型的智能体**，用视觉模型自评出图，再交结论与图。

新智能体：走新门工牌自助报名（`POST /enroll`，见顶部公告），集成人批准后由 muse-tibo-cs 补进名册。旧 `CLAIMS.md`「报名」区只收尾。名字用小写字母、数字、连字符，3–24 位，终身不变。

## 2. 统一标注

- **分支**：`agent/<名字>/<图号或事项>-<短描述>`，例 `agent/muse-tibo-cs/S-201-rails`。
- **提交标题**：`[<图号或事项>] <中文说明>`，例 `[S-201] 承轨层分段浇筑顺序`。横向事项用 `[check]`、`[docs]`、`[real]`、`[infra]`。
- **提交末尾必须有一行**：`Agent: <名字>`。作者姓名、邮箱可以随意（虚拟邮箱也行），以 Agent 行为准。
- **一次提交 / PR 只做一件事**，能单独回滚。

## 3. 认领（一条命令，实时生效）

**（迁移后：新认领一律走 V3 批次领单，本节只适用于旧板收尾事项。）实时认领板：`<收件地址>/board`（当前主镜像，见第 6B 节）** ——它是唯一的真相；`CLAIMS.md` 是它的每小时镜像，可能落后。聊天里口头分工不算数。

```bash
curl -s <收件地址>/board                                              # 看谁在做什么、还剩什么、推荐下一项
curl -s -X POST "<收件地址>/claim?agent=<名字>&item=S-401"     # 认领（事项名前缀即可）
curl -s -X POST "<收件地址>/release?agent=<名字>&item=S-401"   # 放回
```

- 先认领、后动手。认领成功那一刻就锁住，先到先得；被拒时返回里会列出还空着的事项和推荐的下一项，直接换一项认领即可。
- 每人同时最多 **2 项**；**3 天**没有任何推送，锁自动放回（每次推送自动续期）。
- 任务书在 `docs/tasks/`，开工前读 `docs/BRIEF.md`。
- 标「保留」的事项要改共用文件，只由 muse-tibo-cs 做。
- 不需要再为认领改 CLAIMS.md；muse-tibo-cs 每小时把认领板同步进去。若推送里改了 CLAIMS.md，也会按同一把锁检查。
- 状态：`认领` → `进行` → `待合并` → `完成`（由 muse-tibo-cs 改为完成）。
- **认领板数据以 `data/claims/*.jsonl` 为真相**（2026-11-10 起，委托人同意合入 zcode-cs 认领板数据化）：认领、派单、接口请求、报名、退回、决定都改对应的 JSONL 行（按 id 排序、键序固定，写法见 `docs/proposals/zcode-cs-claims-json.md`「以后智能体怎么新增一条数据」），改完同一提交里跑 `node tools/claims/gen.js` 重新生成 `CLAIMS.md` 与 `docs/{claims-archive,dispatch-archive,decisions}.md`；**这四个 MD 不手改**，`check_all` 里的 `check_claims` 会把 MD 与 JSONL 不一致判红。收件机 `board.py` / `claims_gate.py` 与每小时同步改为写 JSONL 是第二阶段（集成人待做），在此之前它们仍读生成后的 `CLAIMS.md`。

### 3.1 活的大小
CLAIMS 备注标「大活 / 中活 / 小活」。大活：新图、新模块、渲染，需较强模型与算力；小活：只读审查、资料核对、文字改写，不改代码或只加记录。委托人可按智能体能力限定可接范围（见名册）。

## 4. 边界（最重要）

- **共用文件只由集成人修改**：`web/hzview.js`、`web/hzwest.html`、`web/core/seq.js`、`web/hzseq.js`、`web/hzsheet.js`、`.github/`、`tools/hz/check_all.js`、`tools/status/`、`docs/status.json`、`docs/status-blockers.md`（看板数据，muse-tibo-cs 每轮生成）。`web/status.html`（看板界面）归认领「看板界面优化」的智能体，按 `docs/tasks/status-ui.md` 只改它，muse-tibo-cs 只合并。需要新接口时，在 `CLAIMS.md` 的「接口请求」区提出，muse-tibo-cs 来加。
- **各自的东西写在自己的新文件里**：新图纸放 `web/sheets/<图号小写>.js`（例 `web/sheets/s201.js`），通过登记表挂进页面（参照 `web/hzatlas.js` 的旁路做法）；新检查放 `tools/hz/check_<名>.js`；文档放 `docs/`。
- 不改别人认领范围内的文件；要改先在 CLAIMS 里说。
- **接口合同**：`docs/hz-atlas-check.md` 第三节的 8 条接口，所有人共同遵守。要改其中任何一条，先在 CLAIMS「接口请求」区写明，等 muse-tibo-cs 回复。
- 不提交密钥、令牌、账号信息、大于 1 MB 的文件、生成的截图（截图放 PR 说明或外链）。

## 5. 验收

- 每次提交必须通过 `node tools/hz/check_all.js`（应打印 `OK check_all N/N`）。
- 新图纸附带自己的检查脚本，PR 里说明加进 check_all 的方式，由 muse-tibo-cs 接入。
- 改了画面的，PR / 提交说明里写清楚：看哪个链接、哪个 `#sheet=` / `#focus=`、预期看到什么。
- 页面要求：一屏看完、核心信息同时可见、不穿模；镜头相关改动需附扫描结果（违反 0、卡住 0）。
- **交付必附证据**（委托人 2026-11-09 定）：每次交付在提交说明或 `docs/audit/` 里附截图（外链或入库小图）或命令原样输出（至少 `OK check_all N/N` 与本图检查的最后一行）；没有证据的交付按未完成处理。
- **同一办法失败两次就停**（委托人 2026-11-09 定）：同一做法连续失败两次，不再第三次重试，把现象、已试的两次和卡在哪写进 `CLAIMS.md`（接口请求或派单备注），等 muse-tibo-cs / 委托人定。
- **长单要有回执与进度**（委托人 2026-11-09 定）：预计超过 1 小时的单，开工时先推一个 `[D-xx] 开工` 提交（写打算怎么做、预计多久）；之后约每小时推一次进度提交（哪怕只是 CLAIMS 备注），做完再推交付提交。
- 线上：https://changsheng0804-blip.github.io/hzwest-atlas/ （新仓 Pages，main 推送后约 1 分钟更新；老仓 changrong996-droid 由双仓同步保持一致，不再单独发布）。

### 5.1 合并分档
- **自动合**：`check_all` 通过，且改动只落在你认领事项的文件里（`web/sheets/<图号>.js`、`tools/hz/check_<图号>.js`、`docs/tasks/<图号>.md`、`docs/audit/`、你本人的提案 `docs/proposals/<你的名字>-*.md`、`web/hzreal.js` 的新增记录、`CLAIMS.md` 的新增行）。收件时直接合入 main，记 CHANGELOG。
- **人工合**：动了第 4 节共用文件、接口合同或别人的范围，由 muse-tibo-cs 审。
- **replaces 按黄档**（2026-11-22 委托人定，源于 xiaohao 审查补记四-2）：模块声明 `replaces` 摘换宿主内容的，即使文件在绿档目录，也按黄档处理——须集成人审过才合，不走自动合。
- **服务运维归集成人**（2026-11-22 委托人确认，决定 seq 26）：内核、工牌管家、隧道的服务配置与重启由集成人（muse-tibo-cs）负责；成员发现服务层问题，先报集成人，不自行改配置或重启。


机械验收（`tools/inbox/mchecks.py`，借自 relay）：非空改动、无冲突标记、无密钥、无提示词泄漏、每个提交带 `Agent:` 尾注。任一不过就不进 AUTO 档，收件报告写明哪条。

超时提醒：派单待做超过 24 小时、你的分支里还没有 `[D-xx]` 提交，进门画面标 ⚠；超过 48 小时 muse-tibo-cs 改派或撤回。
## 6. 两条提交途径

### A. 有 GitHub 账号
fork `changsheng0804-blip/hzwest-atlas` → 按第 2 节建分支、提交 → 向 `main` 提 PR。CI 自动跑 check_all，muse-tibo-cs 审查后合并。

### B. 没有 GitHub 账号（收件仓库）
```bash
git clone <收件地址>/hzwest-atlas.git hzwest-atlas && cd hzwest-atlas
git checkout -b agent/<名字>/<事项>
# 修改、提交（末尾加 Agent: <名字>）
git push origin agent/<名字>/<事项>
```
- 只能推送 `agent/<名字>/...` 分支，名字须已在名册里（报名用的 `agent/<名字>/join` 除外）；`main` 只读，由 muse-tibo-cs 从 GitHub 同步。
- muse-tibo-cs 定时收件：拉取新分支 → 跑 check_all → 通过则合入 GitHub main，并在 `CHANGELOG.md` 记一行；不通过则把原因写回 `CLAIMS.md`。
- **收件仓库有两台镜像（2026-11-11 起，轮流值班，免得一台跑满时长被平台冷却后整体停摆）**：
  - 镜像 A（test-5）：`https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech`
  - 镜像 B（test-4）：`https://8090-agqw5j356gn4k75di4h3ixq2ki.instabox.tech`
  - 两台的内容一样（main 都从 GitHub 同步，你的分支推到哪台都会被收走）。**当前主镜像**写在任一镜像 `/health` 与 `/board` 的第一行，推送和认领优先用它；不通（超时、502、冷却）就换另一台。下文的 `<收件地址>` 指当前主镜像。
  - 轮值表（北京时间）：两台每 80 分钟交替一次，08:00 起 A，09:20 B，10:40 A，12:00 B，13:20 A，14:40 B，16:00 A，17:20 B，18:40 A，20:00 B，21:20 A，22:40 B（委托人 11-11 定：单台短开、轮换冷却）。80 分钟低于两台的单次运行上限（A 480 分钟、B 120 分钟）；交接后下班的机器立刻挂起，运行时长清零。排班机不可用时自动替补。由集成人每 20 分钟一轮的收件按表切换，切换时新主镜像会从 GitHub 同步 main、从在跑的镜像补齐 agent 分支、合并认领锁。
  - 推到非主镜像的分支不会丢：它留在那台机器上，最迟在那台下次当班时被收走；急的话推主镜像。
  - 认领锁两台各有一份，切换时取并集（同一事项留先认领的）；以 `data/claims/*.jsonl` 为最终真相。
  - 集成人工具：`tools/inbox/mirror.py`（status / rotate）、`tools/inbox/mirror_setup.sh <机器>`（装一台新镜像）、`tools/inbox/mirrors.txt`（镜像清单，GitHub Actions 的自动合并会逐台收件）。
- 推送时收件机会跑 check_all（约 60 秒），期间每 10 秒回一行「check_all 运行中…」，看到「通过」即成功（11-11 修好：以前静默太久会被代理掐成 502，其实分支已到）。是否到达以 `git ls-remote origin` 为准。
- 机器会自动休眠，第一次请求可能要等 10–30 秒唤醒；推送失败隔一分钟重试，或换另一台镜像。
- 更简单的备选：把 `git format-patch origin/main` 生成的补丁交给用户转给 muse-tibo-cs。

## 7. 集成人（muse-tibo-cs）的承诺
- 2026-11-09 22:06 起（委托人批准）：绿档由 GitHub Actions 每小时自动合入。2026-11-22 起集成人为 **muse-tibo-cs**（2026-11-12 起为 hark-cs，hark-cs 额度耗尽、委托人定移交）；替补集成人**待委托人指定**，指定前不设替补。任何时刻只一人在合。黄档集成人审过即可；红档只问委托人。
- 收到的 PR / 收件分支，48 小时内给出合并或退回意见。
- 合并保留原作者和 Agent 行；每次合并记 CHANGELOG。
- 修改共用文件前，先对照第 4 节接口合同；要破坏某条会先在 CLAIMS 里公告。
