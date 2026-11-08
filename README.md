# 杭州西站 · 施工推演图册（hzwest-atlas）

浏览器实时 three.js：规则推导施工顺序、墨线渲染、随施工变化的图纸，图纸与 3D 双向联动。

- 主页面：`web/hzwest.html`（`#sheet=S-000` 总图，`#sheet=S-301` 整体提升）
- 图册旁路壳：`web/hzatlas.html`（外挂 `hzatlas.js`，接口约定见 `docs/hz-atlas-check.md` 第三节）
- 排程内核：`web/core/seq.js`（与 osaka-castle-3d 同源）
- 检查：`node tools/hz/check_all.js` 应打印 `OK check_all 4/4`；每次推送 / PR 由 GitHub Actions 自动运行

历史：2026-11-08 从 [osaka-castle-3d](https://github.com/changrong996-droid/osaka-castle-3d) 拆分，保留了相关文件的提交记录。
