# 任务书：集成看板界面（web/status.html）

**谁可做**：任何智能体认领「看板界面优化」后做（中活，不需本地）。委托人 2026-11-08 14:48：界面由其他智能体优化，hark-cr 只负责数据接口、文档与规则，届时直接合并。

## 你只改这一个文件
- `web/status.html`（单文件：HTML + CSS + JS 内联）。可以新增 `web/status/` 下的静态资源（图标、字体子集，单文件 ≤ 200 KB，合计 ≤ 500 KB）。
- **不要改** `docs/status.json`、`tools/status/gen.py`、`docs/status-blockers.md`（数据由 hark-cr 每 20 分钟生成）。缺字段请在 CLAIMS「接口请求」提，不要自己造。

## 数据接口（合同，hark-cr 保证向后兼容，只增不删）
读取地址规则必须保留：
```js
const SRC = location.protocol === 'file:'
  ? 'https://raw.githubusercontent.com/changrong996-droid/hzwest-atlas/main/docs/status.json'
  : '../docs/status.json';
```
（`file:` 是委托人在 Mac 上直接双击打开的用法，必须能用。）

`docs/status.json` 字段：

| 字段 | 类型 | 含义 |
|---|---|---|
| `generated_at` | ISO 字符串，+08:00 | 数据生成时间 |
| `headline.workflows_running` | 数 | 进行中工作流 = 未完成派单 + 实时认领 |
| `headline.dispatch_open` / `live_claims` | 数 | 两者分开的数 |
| `headline.waiting_on_owner` | 数 | 等委托人决定的卡点数（最重要） |
| `headline.blockers` | 数 | 卡点总数 |
| `headline.pending_review` | 数 | 待审 / 退回未改的分支数 |
| `headline.items_done` / `items_total` | 数 | 认领板事项完成 / 总数 |
| `headline.commits_today` / `commits_total` / `files` | 数 | 提交与文件数 |
| `blockers[]` | `{kind, what, who}` | kind ∈ 待委托人 / 集成 / 协作者 / 风险；who=“委托人” 表示等用户 |
| `stale_locks[]` | 字符串 | 已完成但认领锁未释放的事项 |
| `dispatches_open[]` | `{id, agent, item, state}` | 我下发的未完成派单；agent 可能是「a、b」多人 |
| `live_claims[]` | `{item, agent}` | 智能体自己认领、正在做的 |
| `claimed_items[]`、`free_items[]` | | 认领板表格的在做 / 空闲事项 |
| `pending_review[]` | 字符串 | 分支名 |
| `by_agent[]` | `{agent, total, today}` | 按提交尾注 `Agent:` 统计；`—` = 无署名 |
| `roles` | `{名字: 职责}` | 键可能是「a / b」合写 |
| `recent_commits[]` | `{sha, at, subj, agent}` | 最近 8 条 |
| `links` | `{live, board, repo}` | 三个外链 |

## 界面硬规则（委托人的长期要求）
1. **一屏**：1440×860 与 1280×720 桌面不出现页面级滚动；核心信息同时可见，次要细节才折叠。
2. 优先级：等委托人决定 > 卡点 > 进行中（谁在做什么）> 协作者与提交 > 最近提交。
3. 数据超过 60 分钟要醒目提示「数据过期」。每 60 秒自动重读。
4. 全中文；不用外部 CDN（`file:` 打开也要能用，离线时显示读取失败而不是白屏）。
5. 不引入构建步骤；不放任何密钥。

## 验收
- `node tools/status/check_status.js` 输出 `OK check_status`（校验 json 字段与 status.html 保留 SRC 规则、无外链脚本）。
- 附 1440×860 截图路径或外链（截图不进仓库）。
- 分支 `agent/<你>/status-ui`，提交标题 `[看板界面] ...`，末行 `Agent: <你>`。
