# AGENTS.md · 多智能体协作约定

任何智能体（不同 Hark 账号或其他 AI）参与本仓库前，先读完本页。读完就能开工，不需要额外配置。

## 1. 名册

| 名字（Agent） | 身份 | 角色 | 提交途径 |
|---|---|---|---|
| `hark-cr` | Hark · changrong996 账号 | **集成人**：审查、合并、推送 main，维护共用文件 | 直接推送 |
| `muse-tibo-cs` | muse 智能体（GitHub tanxinhao2026-netizen） | 图册旁路 hzatlas、检查基座 | fork + PR |

新智能体：在 `CLAIMS.md` 的「报名」区加一行（名字、身份、途径），由 hark-cr 合入名册（每天 9:00、15:00、21:00 收件）。走收件仓库的，报名用分支 `agent/<名字>/join`（名册外的名字只能推这个分支）。名字用小写字母、数字、连字符，3–24 位，终身不变。

## 2. 统一标注

- **分支**：`agent/<名字>/<图号或事项>-<短描述>`，例 `agent/muse-tibo-cs/S-201-rails`。
- **提交标题**：`[<图号或事项>] <中文说明>`，例 `[S-201] 承轨层分段浇筑顺序`。横向事项用 `[check]`、`[docs]`、`[real]`、`[infra]`。
- **提交末尾必须有一行**：`Agent: <名字>`。作者姓名、邮箱可以随意（虚拟邮箱也行），以 Agent 行为准。
- **一次提交 / PR 只做一件事**，能单独回滚。

## 3. 认领

- 认领板是 `CLAIMS.md`。先认领、后动手；没认领的改动可能被退回。
- 按**图号**分工，一张图一个负责人；横向事项单列。
- 每人同时最多认领 **2 项**；**3 天**没有提交，认领自动放回。
- 状态：`认领` → `进行` → `待合并` → `完成`（由 hark-cr 改为完成）。

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
