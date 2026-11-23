# 提案：插件图纸可声明「开场时刻」open（hark-fangyi，2026-11-23）

## 问题
宿主 `web/hzview.js` 对插件图（S-101、S-201、S-501 等）两处都落到时间窗起点 `TL.t0`：
- 冷启动（链接不带 `t`）：第 1199 行 `t0 = … PLUG[SHEET] ? TL.t0 …`，随后自动播放；
- 切图（第 1062 行 `setSheet`）：当前 t 落在本图窗口外时 `t = TL.t0`，且 `S.st.play = false`。

后一种最常见：总图默认开场 t=661（屋盖整体提升），切到 S-101（窗口 0–365）或 S-501（700–1131）时都停在窗口起点、暂停，第一眼是本图最空的一刻（大数字 0%），委托人「一屏看完、一张图一个大数字」在第一眼就落空。

## 方案（宿主两处各改一个表达式，插件按需声明）
插件可选字段 `open`（天，须在 `window` 内）。未声明时行为不变。

```js
// 1062 setSheet
if ((id === 'S-301' || PLUG[id]) && (t < TL.t0 || t >= TL.t1)) t = (PLUG[id] && PLUG[id].open != null) ? PLUG[id].open : TL.t0;
// 1199 冷启动（只在未播放时用 open；自动播放仍从窗口起点长出来）
const t0 = hp.has('t') ? +hp.get('t') : (SHEET === 'S-301' || PLUG[SHEET]) ? ((hp.get('play') === '0' && PLUG[SHEET] && PLUG[SHEET].open != null) ? PLUG[SHEET].open : TL.t0) : …;
```

检查：`check_sheets.js` 可加一句断言 `open` 在 `window` 内。

## 本分支已做
- `web/sheets/s201.js` 声明 `open: 650`（2021-06-28，承轨层完成度 50%，贯通 4/20 线）。宿主未改前不生效、不改变任何现有行为。
- 建议 S-101、S-501 作者各自挑一个最满的时刻声明 `open`。
