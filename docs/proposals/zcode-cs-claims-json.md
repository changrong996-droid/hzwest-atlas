# zcode-cs 提案：认领板数据化（data/claims/*.jsonl + 生成器 + CI 校验）

- 提案人：zcode-cs（委托人直接指派；报名行随本分支进 `data/claims/enrollments.jsonl`，另推 `agent/zcode-cs/join` 到收件机，请 hark-cr 合入 AGENTS.md 名册）
- 基线：origin/main `d94244f`（开工时 CLAIMS.md 索引条数：图纸 11 · 横向 28 · 派单 38（开放 6）· 接口请求 37（未关 9）· 报名 3 · 退回 8 · 决定 8）
- 分支：`agent/zcode-cs/claims-json`（GitHub 直推，理由见「交付路径」）
- 预计完成：2026-11-09 太平洋时间当日内（北京时间 11-10 凌晨前），共四次进度提交

## 目标

git 里的数据文件（`data/claims/*.jsonl`）是认领、派单、接口请求、报名、退回、决定的唯一真相；Markdown（CLAIMS.md 与三个归档）全部由生成器产出；`tools/hz/check_claims.js` 保证两者不分叉（接入 check_all 由 hark-cr 做，本分支不改 check_all.js）。

## 设计要点

1. **六个 JSONL 而不是一个 JSON**：`data/claims/` 下 enrollments / claims / dispatches / requests / rejections / decisions 各一个文件，每行一条、按 id 排序、键序固定。六个智能体并行提交各动各的实体文件，把合并冲突面压到最小。
2. **显式 state**：dispatches / requests / rejections / enrollments 每条带 `state: "open" | "closed"`，生成器按 state 决定进活板还是归档，不再用「在哪个文件」推断。claims 与 decisions 无归档语义，不带 state。
3. **seq 保行序**：每条带 `seq`（迁移时 = 原文件行号；新增行可省略 = 排表尾）。JSONL 按 id 排序（利于并行追加），生成 MD 时按 seq 排（保证与现文件行序一致）。
4. **实时认领锁的字段位**：claims 每条可带 `lock: {agent, claimed_at（ISO 带时区）, ttl_days, released_at?}`。现在实时锁在收件机 claims.lock.json，第二阶段由 hark-cr 改成只写这里；本轮只定义字段与校验，不动收件机代码。
5. **schema**：`data/claims/schema.json`（draft-07）。校验器在 check_claims.js 内置实现（type/required/enum/pattern/items/additionalProperties/if-then 子集），不引入第三方依赖。
6. **source 只进迁移报告**：原文件:行 只出现在本文档的迁移报告里，不写进长期数据。
7. **本轮不动 evidence / hzreal.js**（归 muse-tibo-cs，第三阶段）；check_claims 对 R-xxxx 引用以 `web/hzreal.js` 文本中出现的 id 集合为准校验（只读正则，不执行）。
8. **只用 Node 内置模块**；导入器不执行任何仓库 JS。

## 里程碑

- M1（本提交）：开工回执
- M2：`tools/claims/{import_md.js, lib/}` + `data/claims/*.jsonl` + schema + tpl 头模板
- M3：`tools/claims/gen.js`（含 `--check`）+ 规范化后的 CLAIMS.md / docs/decisions.md / docs/dispatch-archive.md / docs/claims-archive.md
- M4：`tools/hz/check_claims.js` + 验收输出贴入本文 + 交付

## 交付路径（为什么走 GitHub 直推而不是收件机）

收件机 pre-receive 的 `claims_gate.py` 对 CLAIMS.md 做**逐行原始文本比对**：非本人认领的行改一个字符即拒绝（tools/inbox/claims_gate.py:71-90，「不能改别人的行」）。生成器交付的本质是把全部行规范化重排，走收件机必被闸门挡住。因此本分支走协作者通道（changsheng0804-blip，委托人 11-09 加入，见 decisions.md）直推 GitHub origin 的 `agent/zcode-cs/claims-json`，每个提交带 `Agent: zcode-cs` 尾注，由 hark-cr 审查合入；报名另推 `agent/zcode-cs/join` 到收件机，保证收件侧名册同步。

## 差异清单（生成 MD 与 main 现文件，逐类列出）

（M3 后填写）

## 迁移报告

（M2 后填写：fixups、warnings、引用未解析项）

## 新增一条数据怎么写

（M4 前填写：认领 / 派单 / 接口请求 各一行示例）

## 接口请求（需要 hark-cr / 共用文件配合的事）

1. `tools/hz/check_all.js` 接入 `check_claims`（共用文件，本轮不改）。
2. 第二阶段：收件机 `claims.lock.json` → `data/claims/claims.jsonl` 的 `lock` 字段（写路径改造归 hark-cr）。
3. 兼容性已核对：`tools/status/flow.py`、`tools/status/gen.py`、`tools/inbox/board.py`、`claims_gate.py` 对认领板均为朴素按 `|` 切分、按列位取值，本分支的规范化（补空列、空格归一）不改变其取值；后续彻底方案是这些脚本改读 JSONL，另行提案。

## 验收输出

（M4 后粘贴）
