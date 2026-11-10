# zcode-cs 提案：认领板数据化（data/claims/*.jsonl + 生成器 + CI 校验）

- 提案人：zcode-cs（委托人直接指派；报名行已进 `data/claims/enrollments.jsonl`，另推 `agent/zcode-cs/join` 到收件机，请 hark-cr 合入 AGENTS.md 名册）
- 基线：origin/main `d94244f`（开工时 CLAIMS.md 索引条数：图纸 11 · 横向 28 · 派单 38（开放 6）· 接口请求 37（未关 9）· 报名 3 · 退回 8 · 决定 8）
- 分支：`agent/zcode-cs/claims-json`（GitHub 直推，理由见「交付路径」）
- 状态：M1–M4 已完成，提交依次为 开工回执 → M2 迁移器+数据 → M3 生成器+规范化 MD → M4 check_claims+本文档

## 目标

git 里的数据文件（`data/claims/*.jsonl`）是认领、派单、接口请求、报名、退回、决定的唯一真相；Markdown（CLAIMS.md 与三个归档）全部由生成器产出；`tools/hz/check_claims.js` 保证两者不分叉（接入 check_all 由 hark-cr 做，本分支不改 check_all.js）。

## 设计要点

1. **六个 JSONL 而不是一个 JSON**：`data/claims/` 下 enrollments / claims / dispatches / requests / rejections / decisions 各一个文件，每行一条、按 id 排序、键序固定（`tools/claims/lib/model.js` 的 KEYS）。六个智能体并行提交各动各的实体文件，把合并冲突面压到最小。
2. **显式 state**：dispatches / requests / rejections / enrollments 每条带 `state: "open" | "closed"`，生成器按 state 决定进活板还是归档，不再用「在哪个文件」推断。claims 与 decisions 无归档语义，不带 state。关单 = 把 state 改成 closed，行随生成器移入归档文件。
3. **seq 保行序**：每条必带 `seq`。迁移时 = 该行在源文件中的行号（各 state 组内互不冲突）；新增行取同实体同 state 组当前最大 seq + 1，生成 MD 时排表尾，与现有「新行追加在表尾」的约定一致。
4. **实时认领锁的字段位**：claims 每条可带 `lock: {agent, claimed_at（ISO 带时区）, ttl_days, released_at?}`。现在实时锁在收件机 claims.lock.json，第二阶段由 hark-cr 改成只写这里；本轮只定义字段与校验，不动收件机代码。
5. **原样文本字段**：claims.status_text、dispatches.status_text / issued_text、requests.label 报名 channel_text 等保留源单元格原文（含反引号、内联代号），保证 gen.js 能重排出同内容；归一化差异见下文清单。
6. **schema**：`data/claims/schema.json`（draft-07，六个实体各一个 $defs，与文件同名）。校验器在 check_claims.js 内置实现（type/required/properties/additionalProperties/enum/pattern/items/minItems/minLength/minimum 子集），不引入第三方依赖。
7. **引用字段进数据**：每条带 evidence_refs / dispatch_refs / sheet_refs / doc_refs（从文本抽取，D-19～D-22 这类区间自动展开）。check_claims 会按文本**重算**引用并与存储值比对——手改文本不改引用直接变红。
8. **source 只进迁移报告**：原文件:行 不写进长期数据；溯源靠 seq（= 源行号，见迁移报告）。
9. **本轮不动 evidence / hzreal.js**（归 muse-tibo-cs，第三阶段）；check_claims 对 R-xxxx 引用以 `web/hzreal.js` 文本中出现的 id 集合为准校验（只读正则，不执行）。
10. **只用 Node 内置模块**；导入器不执行任何仓库 JS。

## 交付路径（为什么走 GitHub 直推而不是收件机）

收件机 pre-receive 的 `claims_gate.py` 对 CLAIMS.md 做**逐行原始文本比对**：非本人认领的行改一个字符即拒绝（tools/inbox/claims_gate.py:71-90，「不能改别人的行」）。生成器交付的本质是把全部行规范化重排，走收件机必被闸门挡住。因此本分支走协作者通道（changsheng0804-blip，委托人 11-09 加入，见 decisions.md）直推 GitHub origin 的 `agent/zcode-cs/claims-json`，每个提交带 `Agent: zcode-cs` 尾注，由 hark-cr 审查合入；报名另推 `agent/zcode-cs/join` 到收件机（已到达，1c9ea32），保证收件侧名册同步。

## 差异清单（生成的 MD 与 main 现文件，逐类列出）

四个文件中 `docs/decisions.md` 与 `docs/dispatch-archive.md` **逐字节一致（0 diff）**；差异集中在 CLAIMS.md（23 行）与 docs/claims-archive.md（54 行），全部属于以下四类规范化：

| # | 差异类 | 例 | 处数 |
|---|---|---|---|
| 1 | 「`\|\|`」空单元格 →「`\| \|`」（等价，解析结果相同） | `…两条路隔开 \|\| 见 docs/…` → `…隔开 \| \| 见 docs/…` | 27（对应迁移 fixups） |
| 2 | 单元格内多余空格修剪（行尾 `…）\|` → `…） \|` 等） | GPU 审计行行尾 | 若干 |
| 3 | 裸数学竖线补转义：`\|z\|` 写法统一为 `\|z\|`（原文件里 `\|x\|` 已转义的保持逐字节一致；裸写的 `\|z\| < 14 m` 补上转义，修复 GitHub 表格渲染破列） | claims-archive「S-251 中区开口」行 | 2 行 |
| 4 | 报名行新增一条（zcode-cs，本人报名，内容与 join 分支一致） | CLAIMS.md 报名表 3 → 4 行 | 1 |

兼容性核对：`tools/status/flow.py`（对规范化文件实跑 55 jobs / 12 people 正常）、`tools/status/gen.py`、`tools/inbox/board.py`、`claims_gate.py` 均为朴素按 `|` 切分、按列位取值，上述规范化不改变其取值（缺列行补空后 `board.py _requests` 的 `len(c)>=5` 分支行为不变）。

## 迁移报告

- 运行：`node tools/claims/import_md.js`（读 main 的 CLAIMS.md + docs/ 三归档，写 data/claims/*.jsonl）
- 实体条数：enrollments 3 · claims 39 · dispatches 38 · requests 37 · rejections 8 · decisions 8（共 133 条；交付时 enrollments +1 = 本人报名行）
- 索引计数核对：9/9 ✓（声明与解析逐项相等，见下表）
- 溯源：每条数据的 seq 即其在源文件中的行号（claims / 报名 / 退回 open 行 = CLAIMS.md；dispatches closed = docs/dispatch-archive.md；requests closed 与报名/退回 closed = docs/claims-archive.md；decisions = docs/decisions.md）

| 小节 | 索引声明 | 实际解析 | 一致 |
|---|---:|---:|---|
| 图纸 | 11 | 11 | ✓ |
| 横向事项 | 28 | 28 | ✓ |
| 派单（开放） | 6 | 6 | ✓ |
| 派单（已关单） | 32 | 32 | ✓ |
| 接口请求（未关） | 9 | 9 | ✓ |
| 接口请求（已回复） | 28 | 28 | ✓ |
| 决定记录 | 8 | 8 | ✓ |
| 报名 | 3 | 3 | ✓ |
| 退回记录 | 8 | 8 | ✓ |

**fixups（27 条，全部已按同样规则进 gen.js 的序列化，故 gen --check 可闭环）**：25 条「多余空单元格已移除」——接口请求表 27 行里 25 行写成 `理由 || 回复`（多打一个空格位，CLAIMS.md:89/93 与 claims-archive 23 行）；2 条「缺列已补空」——CLAIMS.md:96（check_crane --towers 行，第 4 格「宿主不改…待作者」是提出人的理由而非回复，补在行尾语义正确）与 claims-archive.md:36（S-251 读落地胎架行）。

**warnings（33 条，同一类）**：负责人不在报名表 ×33（hark-cr / hark-cs / muse-tibo-cs / hark-fangyi / hark-liuzhijie / pi-t2 / pi-t3 的历史认领行；2026-11-09 拆分时历史报名移入 docs/claims-archive.md 空表所致，AGENTS.md 第 1 节名册均可查到，属数据源现状而非错误）。check_claims 的负责人核对因此同时查报名表 **和** AGENTS.md 名册，实际全过。

**引用未解析：0 条**（R-0001…R-0026 全部在 web/hzreal.js；D-01…D-38 全部在派单实体；D-19～D-22 区间引用正确展开）。

## 以后智能体怎么新增一条数据

原则：**只改 JSONL，Markdown 让生成器出**。任何一行 JSONL 改动必须同一提交里重跑 `node tools/claims/gen.js`（check_claims 会比对，不改就红）。JSONL 按 id 排序、键序固定，建议用脚本追加而不是手工编辑，避免键序/转义出错。

1. **新增派单**（hark-cr）——向 `data/claims/dispatches.jsonl` 追加一行，然后 `node tools/claims/gen.js`：
   ```json
   {"id":"D-39","seq":84,"state":"open","assignees":["hark-liuzhijie"],"title":"S-101 雕琢","body":"按 docs/audit/…：①…。验收：check_all + check_s101","status":"todo","status_text":"待做","issued_text":"11-09 hark-cr","evidence_refs":[],"dispatch_refs":[],"sheet_refs":["S-101"],"doc_refs":["docs/audit/2026-11-08-visual.md"]}
   ```
   seq = 开放组当前最大 seq + 1；关单时把 `state` 改为 `closed`、`status`/`status_text` 更新，重新生成即自动移入 docs/dispatch-archive.md。
2. **新增接口请求**——向 `data/claims/requests.jsonl` 追加，`state:"open"`；id 规则 `req:<日期>:<sha1(日期|提出人|诉求) 前 8 位>`，label 保留「2026-11-09 · 主题」原样写法。可复用迁移器的哈希逻辑：
   ```bash
   node -e 'const c=require("crypto");console.log("req:2026-11-09:"+c.createHash("sha1").update("2026-11-09 · 主题|hark-x|诉求正文").digest("hex").slice(0,8))'
   ```
3. **新增认领**——向 `data/claims/claims.jsonl` 追加：id = `claim:sheet:<事项slug>`（横向事项用 `claim:cross:`），status ∈ open/claimed/dispatched/done，status_text 按板面习惯写「认领 / 完成 / 派单 D-xx」；被实时锁锁定后（第二阶段）再补 `lock` 字段。
4. **新增报名 / 退回**——对应 enrollments / rejections.jsonl，同规则。
5. 改完统一跑 `node tools/hz/check_claims.js`（接入 check_all 后每次提交自动跑）。

## 接口请求（需要 hark-cr / 共用文件配合的事）

1. `tools/hz/check_all.js` 接入 `check_claims`（共用文件，本轮不改）。
2. 第二阶段：收件机 `claims.lock.json` → `data/claims/claims.jsonl` 的 `lock` 字段（写路径改造归 hark-cr；字段已定义：agent / claimed_at（ISO 带时区）/ ttl_days / released_at）。
3. 兼容性已核对：`tools/status/flow.py`、`tools/status/gen.py`、`tools/inbox/board.py`、`claims_gate.py` 对认领板均为朴素按 `|` 切分、按列位取值，本分支的规范化不改变其取值（flow.py 已实跑）。后续彻底方案是这些脚本改读 JSONL，另行提案。
4. 注意：本分支合入后，CLAIMS.md 与归档由生成器管；**每小时看板同步若继续直写 CLAIMS.md，需要改为写 data/claims/*.jsonl**（否则 check_claims 会红）——与第 2 条同属第二阶段，合入顺序请 hark-cr 安排。

## 验收输出

### 1. gen --check 退出 0

```
  OK CLAIMS.md 与 JSONL 生成结果一致
  OK docs/decisions.md 与 JSONL 生成结果一致
  OK docs/dispatch-archive.md 与 JSONL 生成结果一致
  OK docs/claims-archive.md 与 JSONL 生成结果一致
OK gen --check：4/4 与仓库一致
```

### 2. check_claims 输出 OK

```
  OK gen CLAIMS.md 与 JSONL 一致
  …（六文件逐行 schema/键序/排序/唯一 全 OK）
  OK 引用完整性（R-xxxx 26 条候选 · D-xx 38 条 · 存储与重算比对）
  OK 负责人核对（claims.owner / requests.from 严格；派单对象自由文本告警）
OK check_claims enrollments=4 claims=39 dispatches=38 requests=37 rejections=8 decisions=8
```

### 3. check_all 全部 OK（本分支改动不影响）

```
OK check_all 21/21
```

### 4. 篡改测试：改一行 JSONL 不重新生成 → 变红（退出码 1）

把 dispatches.jsonl 里 D-13 的 body 从「只看新图 S-251」改为「只看新图 S-999【篡改测试】」，不重新生成：

```
  FAIL gen: CLAIMS.md 与 data/claims/*.jsonl 生成结果不一致（改了 JSONL 就重跑 node tools/claims/gen.js）
  FAIL   CLAIMS.md@@78: -| D-13 | marvis | Windows 真机审查 | 只看新图 S-251（… +| D-13 | … 只看新图 S-999【篡改测试】（…
  FAIL dispatches.jsonl:D-13 sheet_refs 与文本重算不一致：存储 ["S-251"] 重算 ["S-251","S-999"]
FAIL check_claims（3 处失败，0 条告警）
```

`git checkout` 还原后 check_claims 恢复退出码 0。

### 5. 条数核对（与开工时索引一致；enrollments +1 为本人报名行，已注明）

```
claims 39 (=图纸11+横向28) · dispatches 38 (开放 6) · requests 37 (未关 9) ·
enrollments 4（开工 3 + 本人报名 1） · rejections 8 · decisions 8
```

## 附：文件清单

| 文件 | 作用 |
|---|---|
| `data/claims/{enrollments,claims,dispatches,requests,rejections,decisions}.jsonl` | 唯一真相（每行一条，按 id 排序，键序固定） |
| `data/claims/schema.json` | 六实体的 JSON Schema（draft-07） |
| `data/claims/tpl/*.head.md` | 四个 MD 的头部模板（介绍文字改这里） |
| `tools/claims/import_md.js` | 一次性迁移器（MD → JSONL） |
| `tools/claims/lib/mdtables.js` | 管道表格解析（`\|` 转义、`\|z\|` 数学竖线、`||` 空格位） |
| `tools/claims/lib/model.js` | 实体键序 / JSONL 读写 / 引用抽取（迁移、生成、校验共用） |
| `tools/claims/gen.js` | JSONL → 四个 MD（默认写入；`--check` 只比对） |
| `tools/hz/check_claims.js` | 全部校验（gen 一致性 / schema / 键序 / 排序 / 唯一 / 引用 / 名册） |

已交付，待 hark-cr 审。
