# AGENTS.md · 多智能体协作约定

任何智能体（不同 Hark 账号或其他 AI）参与本仓库前，先读完本页和 `docs/BRIEF.md`（项目简报：目标、委托人口味、插件接法）。每个空置任务都有任务书 `docs/tasks/<事项>.md`。

## 0. 开工三步（不需要委托人转述，一切以仓库为准）

1. `curl -s "https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/board?agent=<你的名字>"`：你手上的事项、你的分支合了没、你的接口请求有没有回复、你上次来之后规矩改了什么。
2. `git pull`，读本文件和你事项的任务书（`docs/tasks/`）、最新审查意见（`docs/review/`）。
3. 有问题写进 `CLAIMS.md`「接口请求」，不经过委托人；hark-cr 每小时回复一次。

委托人只管三件事：做什么、先做哪个、好不好。他的意见由 hark-cr 写进 `docs/review/`，不靠转述。

## 1. 名册

| 名字（Agent） | 身份 | 角色 | 提交途径 |
|---|---|---|---|
| `hark-cr` | Hark · changrong996 账号 | **集成人**：审查、合并、推送 main，维护共用文件 | 直接推送 |
| `muse-tibo-cs` | muse 智能体（GitHub tanxinhao2026-netizen） | 图册旁路 hzatlas、检查基座 | fork + PR |
| `hark-cs` | Hark · changsheng0804 账号（hark-changsheng）；额度最多，可用本地 Mac、虚拟机、多种 API/CLI、本地 Blender → 优先接重活（渲染、GPU 审计） | S-401、协作工具（relay） | B 收件 |
| `hark-fangyi` | Hark · 方熠账号 | S-201 | B 收件 |
| `hark-liuzhijie` | Hark · 刘志杰账号 | S-101、S-501 | B 收件 |
| `marvis` | Marvis · 委托人朋友的 Windows 本机智能体，试用本协作方式（无 GitHub 账号）。**只接备注标「小活」的事项，同时最多 1 项；交付一律人工审，不进自动合并档** | 待认领；建议 Windows 真机审查 | B 收件 |

新智能体：在 `CLAIMS.md` 的「报名」区加一行（名字、身份、途径），由 hark-cr 合入名册（每小时整点收件，8:00–23:00 北京时间）。走收件仓库的，报名用分支 `agent/<名字>/join`（名册外的名字只能推这个分支）。名字用小写字母、数字、连字符，3–24 位，终身不变。

## 2. 统一标注

- **分支**：`agent/<名字>/<图号或事项>-<短描述>`，例 `agent/muse-tibo-cs/S-201-rails`。
- **提交标题**：`[<图号或事项>] <中文说明>`，例 `[S-201] 承轨层分段浇筑顺序`。横向事项用 `[check]`、`[docs]`、`[real]`、`[infra]`。
- **提交末尾必须有一行**：`Agent: <名字>`。作者姓名、邮箱可以随意（虚拟邮箱也行），以 Agent 行为准。
- **一次提交 / PR 只做一件事**，能单独回滚。

## 3. 认领（一条命令，实时生效）

**实时认领板：https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/board** ——它是唯一的真相；`CLAIMS.md` 是它的每小时镜像，可能落后。聊天里口头分工不算数。

```bash
curl -s https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/board                                              # 看谁在做什么、还剩什么、推荐下一项
curl -s -X POST "https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/claim?agent=<名字>&item=S-401"     # 认领（事项名前缀即可）
curl -s -X POST "https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/release?agent=<名字>&item=S-401"   # 放回
```

- 先认领、后动手。认领成功那一刻就锁住，先到先得；被拒时返回里会列出还空着的事项和推荐的下一项，直接换一项认领即可。
- 每人同时最多 **2 项**；**3 天**没有任何推送，锁自动放回（每次推送自动续期）。
- 任务书在 `docs/tasks/`，开工前读 `docs/BRIEF.md`。
- 标「保留」的事项要改共用文件，只由 hark-cr 做。
- 不需要再为认领改 CLAIMS.md；hark-cr 每小时把认领板同步进去。若推送里改了 CLAIMS.md，也会按同一把锁检查。
- 状态：`认领` → `进行` → `待合并` → `完成`（由 hark-cr 改为完成）。

### 3.1 活的大小
CLAIMS 备注标「大活 / 中活 / 小活」。大活：新图、新模块、渲染，需较强模型与算力；小活：只读审查、资料核对、文字改写，不改代码或只加记录。委托人可按智能体能力限定可接范围（见名册）。

## 4. 边界（最重要）

- **共用文件只由集成人修改**：`web/hzview.js`、`web/hzwest.html`、`web/core/seq.js`、`web/hzseq.js`、`web/hzsheet.js`、`.github/`、`tools/hz/check_all.js`。需要新接口时，在 `CLAIMS.md` 的「接口请求」区提出，hark-cr 来加。
- **各自的东西写在自己的新文件里**：新图纸放 `web/sheets/<图号小写>.js`（例 `web/sheets/s201.js`），通过登记表挂进页面（参照 `web/hzatlas.js` 的旁路做法）；新检查放 `tools/hz/check_<名>.js`；文档放 `docs/`。
- 不改别人认领范围内的文件；要改先在 CLAIMS 里说。
- **接口合同**：`docs/hz-atlas-check.md` 第三节的 8 条接口，所有人共同遵守。要改其中任何一条，先在 CLAIMS「接口请求」区写明，等 hark-cr 回复。
- 不提交密钥、令牌、账号信息、大于 1 MB 的文件、生成的截图（截图放 PR 说明或外链）。

## 5. 验收

- 每次提交必须通过 `node tools/hz/check_all.js`（应打印 `OK check_all N/N`）。
- 新图纸附带自己的检查脚本，PR 里说明加进 check_all 的方式，由 hark-cr 接入。
- 改了画面的，PR / 提交说明里写清楚：看哪个链接、哪个 `#sheet=` / `#focus=`、预期看到什么。
- 页面要求：一屏看完、核心信息同时可见、不穿模；镜头相关改动需附扫描结果（违反 0、卡住 0）。
- 线上：https://changrong996-droid.github.io/hzwest-atlas/ （main 推送后约 1 分钟更新）。

### 5.1 合并分档
- **自动合**：`check_all` 通过，且改动只落在你认领事项的文件里（`web/sheets/<图号>.js`、`tools/hz/check_<图号>.js`、`docs/tasks/<图号>.md`、`docs/audit/`、`web/hzreal.js` 的新增记录、`CLAIMS.md` 的新增行）。收件时直接合入 main，记 CHANGELOG。
- **人工合**：动了第 4 节共用文件、接口合同或别人的范围，由 hark-cr 审。

## 6. 两条提交途径

### A. 有 GitHub 账号
fork `changrong996-droid/hzwest-atlas` → 按第 2 节建分支、提交 → 向 `main` 提 PR。CI 自动跑 check_all，hark-cr 审查后合并。

### B. 没有 GitHub 账号（收件仓库）
```bash
git clone https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/hzwest-atlas.git hzwest-atlas && cd hzwest-atlas
git checkout -b agent/<名字>/<事项>
# 修改、提交（末尾加 Agent: <名字>）
git push origin agent/<名字>/<事项>
```
- 只能推送 `agent/<名字>/...` 分支，名字须已在名册里（报名用的 `agent/<名字>/join` 除外）；`main` 只读，由 hark-cr 从 GitHub 同步。
- hark-cr 定时收件：拉取新分支 → 跑 check_all → 通过则合入 GitHub main，并在 `CHANGELOG.md` 记一行；不通过则把原因写回 `CLAIMS.md`。
- 收件仓库地址：`https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/hzwest-atlas.git`（公开，无需账号；健康检查 `/health`）。
- 收件仓库在一台会自动休眠的虚拟机上，第一次请求可能要等 10–30 秒唤醒；推送失败隔一分钟重试即可。
- 更简单的备选：把 `git format-patch origin/main` 生成的补丁交给用户转给 hark-cr。

## 7. 集成人（hark-cr）的承诺
- 收到的 PR / 收件分支，48 小时内给出合并或退回意见。
- 合并保留原作者和 Agent 行；每次合并记 CHANGELOG。
- 修改共用文件前，先对照第 4 节接口合同；要破坏某条会先在 CLAIMS 里公告。
