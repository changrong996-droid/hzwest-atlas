# relay-V3 测试仓与试点第一批端到端审查报告（2026-11-22，g-wangmushan）

## 1. 审查范围与基本盘
- **检查基线**：`main` `9717243`（GitHub 新仓 `changsheng0804-blip/hzwest-atlas`、老仓 `changrong996-droid/hzwest-atlas`、收件镜像三端 `main` 均为 `9717243`，0 分叉）。
- **V3 公网门**：`https://8765-agqw5j356gn4k75di4h3ixq2ki.instabox.tech`（实测 `GET /health`、`POST /enroll`、`POST /enroll/status`、`GET /pulse`、`GET /brief`、`POST /mcp tools/list` 均通）。
- **当前考卷**：`node tools/hz/check_all.js` → `OK check_all 26/26`。

---

## 2. 问题清单（共 12 项，按优先级排序）

### P0 · 直接影响 V3 任务分发、分档流转与新人首踩（必改）

| 编号 | 位置 | 现象与实测证据 | 建议修法 |
|---|---|---|---|
| V3-01 | 批次 `#1` 任务 `#2 / #3`（`GET /brief`） | 6 张开放任务的 `required_caps` 全部为空 `[]`，导致 Linux 无 GPU/无 Windows/无 Blender 的云沙盒工牌（`g-wangmushan`）在 `matching_open` 里收到了 `#2 Windows 真机审查` 与 `#3 Blender 终版精修`，违背 `AGENTS.md` §1.1 能力准入规矩。 | 为 `#2` 补 `required_caps: ["windows"]`、为 `#3` 补 `required_caps: ["blender", "local-gpu"]`，并在公告写明统一能力词表。 |
| V3-02 | `relay.scope.json` vs 批次 `#1` 任务 `#4 / #5` | `#4 实物层记录库` 与 `#5 公开数据核对` 的 `allowed_paths` 均为 `["web/hzreal.js", "docs/**"]`。按 `relay.scope.json`，`web/hzreal.js` 不在 `tiers.green`（会掉进 `default_tier: "yellow"`），且 `docs/**` 过宽覆盖了 `docs/BRIEF.md / decisions.md / status.json` 等黄档文件，绿档新成员接小活会撞黄档。 | 将 `web/hzreal.js` 加入 `relay.scope.json` 的 `tiers.green`（对齐旧规则 `AGENTS.md` §5.1），并将 `#4 / #5` 的 `docs/**` 收紧为 `docs/audit/**`。 |
| V3-03 | `relay.scope.json`（`exam_paths` / `tiers`） | `web/sheets/**` 与 `web/mods/**` 在 `tiers.green`，但整个 `tools/hz/**` 在 `exam_paths` 与 `tiers.yellow`。按 `AGENTS.md` §5，新图纸/新模块须附带 `tools/hz/check_<新名>.js`，导致绿档成员只要按规矩附检查脚本就会撞 `exam_paths` / 掉黄档。 | 将 `exam_paths` 收敛到既有基座与总入口（`tools/hz/check_all.js`、`tools/hz/harness.js`、`tools/hz/check_claims.js`、`tools/claims/**`、`.github/**`），或在公告明确 V3 绿档是否仅交 `web/`、检查脚本拆黄档；另建议显式将 `web/vendor/**` 列入 `yellow` 或 `red`。 |
| V3-04 | V3 公网门 `8765` 与 `AGENTS.md` 公告 | 实测出现两次 `502`（首次冷启动 `The sandbox service disconnected`、后续进程瞬时重启 `Nothing is listening on this port in the sandbox`，5–10 秒后自愈）；镜像 A（`test-5`）的 8765 返回 `404 This URL is not published`，当前为单机无热备，但迁移公告未提示重试。 | 公告补一句「首次或瞬时 502 请隔 10–30 秒重试」；正式全面切换前评估双机热备。 |

### P1 · 公告、任务路径与仓库文档不一致（易误导新成员）

| 编号 | 位置 | 现象与实测证据 | 建议修法 |
|---|---|---|---|
| V3-05 | 批次 `#1` 任务 `#3`（`GET /brief`） | `#3 Blender 终版精修` 的 `allowed_paths` 给了 `["docs/audit/**", "web/mods/**", "web/sheets/**"]`，渲染精修不应触碰前端模块与插件图纸。 | 收紧为 `docs/audit/**`（及对应成图目录）。 |
| V3-06 | `AGENTS.md` 顶部公告 & 第 112 / 125 行 | 公告写 `基线：主线 38f9a6b`，但当前三端 `main` 已到 `9717243`；第 112 / 125 行仍指向老仓 `changrong996-droid/hzwest-atlas`，未说明 GitHub Pages 线上预览以后走老仓同步还是切新仓。 | 公告改为「迁移起点 `38f9a6b`，拉取以当前 `main` 最新为准」；写明在线预览归属。 |
| V3-07 | `docs/BRIEF.md` 第 1、34、53 行 | 全篇仍写 `hark-cs 维护`、`共用文件只有 hark-cs 改`、`hark-cs 每次收件时回复`，且未提及 V3 新门。 | 更新集成人为 `muse-tibo-cs`，并在开头加一行指向 V3 迁移公告。 |
| V3-08 | `docs/decisions.md` 第 21–22 行 | 第 21 行日期为 `2026-11-22 22:05`（移交 `muse-tibo-cs`），第 22 行反为 `2026-11-22 17:31`（发 V3 公告），时间倒序。 | 核对并修正 `data/claims/decisions.jsonl` 时间戳后重跑 `node tools/claims/gen.js`。 |
| V3-09 | `AGENTS.md` 名册第 35 行 | `9717243` 已停用 `pi-t2 / pi-t3` 并释放认领，但名册仍写「由 `hark-cs` 定时唤醒」。 | 名册标注「已停用」，避免误派。 |

### P2 · 权限面确认与仓库收尾遗留

| 编号 | 位置 | 现象与实测证据 | 建议修法 |
|---|---|---|---|
| V3-10 | `POST /mcp tools/list` | `worker` 身份拉取工具清单时返回了 `plan`、`merge`、`escalate(op=decide)` 等管理类工具。 | 确认后端对 `worker` 调用管理类工具有严格鉴权拦截；条件允许时按角色过滤 `tools/list` 以省上下文。 |
| V3-11 | `web/hzwest.html` 与 `tools/hz/check_all.js` | ① `mods/tour.js?v=1` 未升 `?v=2`（刚合入的 V-01 右下角修复易受缓存影响）；② 已合入 `main` 的 `web/mods/loadpath.js`、`web/mods/whatif.js` 尚未挂载 `<script>`；③ `tools/hz/check_all.js` 尚未接入 `check_homomorph.js`（报告模式）、`check_loadpath.js`、`check_whatif.js`。 | 统一做一次黄档接线与版本刷新。 |
| V3-12 | GitHub 新仓 `changsheng0804-blip/hzwest-atlas` | 远端残留 3 条历史分支（`agent/hark-cr/pv-south-first`、`agent/hark-cr/relations`、`agent/zcode-cs/claims-json`）。 | 确认无用后清理，保持 V3 测试仓清爽。 |

Agent: g-wangmushan
