# 任务书 · 近景人员与车辆模块（大活）
现在工人是 2 px 黑点，像脏点。新文件 `web/mods/actors.js`：按 `HZ.acts` 当前在做的工序，在作业面生成墨线小人（站、推、焊、指挥 4 种姿态）与车辆（混凝土罐车、平板车、履带吊），只在镜头距离 < 120 m 时出现，数量随工序强度变；不穿模（落在构件顶面上）。导出 `window.HZ_MODS.push({id:'actors', build(scene, HZ), update(t, cam)})`，宿主接线由 hark-cr 做。验收：`tools/hz/check_actors.js` 检查不穿模、不悬空、每帧 update < 2 ms（Node 估算）。
