# 发布前无头验收（D-47，2026-11-10）

验收人 hark-darrio。只验不改代码。结论：**4 项 × 2 视口全部通过（28/28 条）**，无控制台报错。另记 4 条小问题（不阻塞发布），见文末。

## 环境与方法

- 被测版本：`origin/main` b15e5c1（2026-11-10 19:13 CST）。已逐个比对线上 https://changrong996-droid.github.io/hzwest-atlas/ 的 `web/hzwest.html` 与它引用的 21 个本地 js/css，md5 与 main 完全一致。
- 沙箱里的无头 Chromium 经代理访问 github.io 报 `ERR_TUNNEL_CONNECTION_FAILED`（curl 可达，浏览器隧道不通），因此用同一提交的文件在本地 `http.server` 起站、URL 带 `#three=local`。页面代码与线上一致，区别只在 three.js 取本地副本而非 unpkg；unpkg 加载本身未验。
- 浏览器：Playwright + chromium-headless-shell，SwiftShader 软件渲染（无 GPU），帧率不作数；载入时长偏慢属正常。
- 视口：1920×1080（桌面）、390×844（手机竖屏，is_mobile + has_touch，DPR 1）。
- 宿主对 `navigator.webdriver` 为真时不弹说明卡（`hzview.js` 951 行），测试里用 init script 把它置为 false，模拟真人首访。
- 每个深链都在新的浏览器上下文里打开；「首屏不空」= `__pv.ready`、`frames≥2` 且截图上部 80% 灰度标准差 >8；控制台 error 与 pageerror 全程收集。
- S-201 关系高亮：在图纸 `#sh-plug` 上按插件 `parts(t).hit` 的中心真实鼠标点击一个构件，读 `__pv.rel`；再点图纸右上角空白，`__pv.rel` 应为 null。

## 结果

| 视口 | 步骤 | 结果 | 实测 | 截图 |
|---|---|---|---|---|
| 1920x1080 | 拖时间轴立即收 | 通过 | 拖后 300 ms intro=False | `img/2026-11-10-release-check/intro_drag_1920x1080.jpg` |
| 1920x1080 | 点 × 立即收 | 通过 | 点后 300 ms intro=False | `img/2026-11-10-release-check/intro_x_1920x1080.jpg` |
| 1920x1080 | 说明卡出现并自收 | 通过 | 出现后约 10.9 s 收起（display=none） | `img/2026-11-10-release-check/intro_open_1920x1080.jpg` |
| 390x844 | 拖时间轴立即收 | 通过 | 拖后 300 ms intro=False | `img/2026-11-10-release-check/intro_drag_390x844.jpg` |
| 390x844 | 点 × 立即收 | 通过 | 点后 300 ms intro=False | `img/2026-11-10-release-check/intro_x_390x844.jpg` |
| 390x844 | 说明卡出现并自收 | 通过 | 出现后约 8.8 s 收起（display=none） | `img/2026-11-10-release-check/intro_open_390x844.jpg` |
| 1920x1080 | 墨线｜实景 两字可见可点 | 通过 | 点实景→pref=lit，点墨线→pref=ink；两段按钮 宽×高 48×26 px，字号 12.5 px，文字未截断 | `img/2026-11-10-release-check/mode_lit_1920x1080.jpg` |
| 390x844 | 墨线｜实景 两字可见可点 | 通过 | 点实景→pref=lit，点墨线→pref=ink；两段按钮 宽×高 40×26 px，字号 12 px，文字未截断 | `img/2026-11-10-release-check/mode_lit_390x844.jpg` |
| 1920x1080 | 深链 S-000 | 通过 | 载入 47 s；hash=S-000；当前页签「S-000总图」；首屏灰度标准差 48.9 | `img/2026-11-10-release-check/link_S-000_1920x1080.jpg` |
| 1920x1080 | 深链 S-001 | 通过 | 载入 33 s；hash=S-001；当前页签「S-001总进度」；首屏灰度标准差 21.5 | `img/2026-11-10-release-check/link_S-001_1920x1080.jpg` |
| 1920x1080 | 深链 S-002 | 通过 | 载入 40 s；hash=S-002；当前页签「S-002吊装资源」；首屏灰度标准差 15.6 | `img/2026-11-10-release-check/link_S-002_1920x1080.jpg` |
| 1920x1080 | 深链 S-101 | 通过 | 载入 30 s；hash=S-101；当前页签「S-101地下」；首屏灰度标准差 17.2 | `img/2026-11-10-release-check/link_S-101_1920x1080.jpg` |
| 1920x1080 | 深链 S-201 | 通过 | 载入 40 s；hash=S-201；当前页签「S-201承轨层」；首屏灰度标准差 21.5 | `img/2026-11-10-release-check/link_S-201_1920x1080.jpg` |
| 1920x1080 | 深链 S-251 | 通过 | 载入 31 s；hash=S-251；当前页签「S-251网架拼装」；首屏灰度标准差 29.2 | `img/2026-11-10-release-check/link_S-251_1920x1080.jpg` |
| 1920x1080 | 深链 S-301 | 通过 | 载入 46 s；hash=S-301；当前页签「S-301整体提升」；首屏灰度标准差 49.4 | `img/2026-11-10-release-check/link_S-301_1920x1080.jpg` |
| 1920x1080 | 深链 S-401 | 通过 | 载入 41 s；hash=S-401；当前页签「S-401屋面」；首屏灰度标准差 33.9 | `img/2026-11-10-release-check/link_S-401_1920x1080.jpg` |
| 1920x1080 | 深链 S-501 | 通过 | 载入 34 s；hash=S-501；当前页签「S-501开通」；首屏灰度标准差 38.6 | `img/2026-11-10-release-check/link_S-501_1920x1080.jpg` |
| 390x844 | 深链 S-000 | 通过 | 载入 28 s；hash=S-000；当前页签「S-000总图」；首屏灰度标准差 52.5 | `img/2026-11-10-release-check/link_S-000_390x844.jpg` |
| 390x844 | 深链 S-001 | 通过 | 载入 17 s；hash=S-001；当前页签「S-001总进度」；首屏灰度标准差 38.1 | `img/2026-11-10-release-check/link_S-001_390x844.jpg` |
| 390x844 | 深链 S-002 | 通过 | 载入 25 s；hash=S-002；当前页签「S-002吊装资源」；首屏灰度标准差 21.0 | `img/2026-11-10-release-check/link_S-002_390x844.jpg` |
| 390x844 | 深链 S-101 | 通过 | 载入 16 s；hash=S-101；当前页签「S-101地下」；首屏灰度标准差 31.4 | `img/2026-11-10-release-check/link_S-101_390x844.jpg` |
| 390x844 | 深链 S-201 | 通过 | 载入 25 s；hash=S-201；当前页签「S-201承轨层」；首屏灰度标准差 27.7 | `img/2026-11-10-release-check/link_S-201_390x844.jpg` |
| 390x844 | 深链 S-251 | 通过 | 载入 16 s；hash=S-251；当前页签「S-251网架拼装」；首屏灰度标准差 43.8 | `img/2026-11-10-release-check/link_S-251_390x844.jpg` |
| 390x844 | 深链 S-301 | 通过 | 载入 27 s；hash=S-301；当前页签「S-301整体提升」；首屏灰度标准差 59.2 | `img/2026-11-10-release-check/link_S-301_390x844.jpg` |
| 390x844 | 深链 S-401 | 通过 | 载入 25 s；hash=S-401；当前页签「S-401屋面」；首屏灰度标准差 59.1 | `img/2026-11-10-release-check/link_S-401_390x844.jpg` |
| 390x844 | 深链 S-501 | 通过 | 载入 18 s；hash=S-501；当前页签「S-501开通」；首屏灰度标准差 52.5 | `img/2026-11-10-release-check/link_S-501_390x844.jpg` |
| 1920x1080 | S-201 点构件出关系高亮、点空白取消 | 通过 | 点 B-S11（引桥梁 B-S11）→ rel={'id': 'B-S11', 'up': 2, 'dn': 12}；点空白 → rel=null | `img/2026-11-10-release-check/rel_on_1920x1080.jpg` `img/2026-11-10-release-check/rel_off_1920x1080.jpg` |
| 390x844 | S-201 点构件出关系高亮、点空白取消 | 通过 | 点 D-N01（承轨层 D-N01）→ rel={'id': 'D-N01', 'up': 2, 'dn': 15}；点空白 → rel=null | `img/2026-11-10-release-check/rel_on_390x844.jpg` `img/2026-11-10-release-check/rel_off_390x844.jpg` |

说明卡自收用时：桌面 10.9 s、手机 8.8 s。计时以 JS 为准（INTRO_MS = 8000），桌面超出部分来自 SwiftShader 下主线程被渲染占满，真机应接近 8 s，请 D-49 Mac 真机顺带看一眼。

## 小问题（不阻塞，建议封单后或顺手修）

1. **手机竖屏页签只露 3 个**（S-000～S-002），其余 6 个需横滑，但没有任何可滑提示（`hzmobile.css` 隐藏了滚动条）。建议右缘加渐隐或「›」。截图 `link_S-000_390x844.jpg`。
2. **手机竖屏图纸底部提示条右端被裁**：「点空白 / Esc 清除」贴边，「清除」只剩半个字；手机上 Esc 也没有意义，可改为只写「点空白清除」。截图 `rel_on_390x844.jpg`。
3. **手机竖屏顶部引言被截断**：「工序由规则推导，每一帧都在自检」后半句被卡片宽度裁掉，无省略号。截图 `mode_lit_390x844.jpg`。
4. 桌面说明卡在 SwiftShader 下 10.9 s 才收（见上），仅记录。

## 复现

脚本在沙箱 `scratch/rc.py`（不进仓库）：`python3 rc.py <宽> <高> ui|links|rel [图号…]`，每条结果输出一行 JSON。

> 截图为缩小存档：桌面图缩到 960 宽、JPEG 质量 62（原 1920×1080 截取），文件名保留原视口。
