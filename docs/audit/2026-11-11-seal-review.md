# 封单前深审（2026-11-11）

审查：Traycer gemini-4-carbon 审 hzview.js；Respan gemini-4-carbon 审 hzseq.js、core/seq.js、hzrel.js、hzsheet.js、hzwest.html、hzatlas.js、hzreal.js；dim（DeepSeek 4.1 Flash / Gemini 3.8 Flash）初筛插件。每条均经 hark-cr 复核后再处理。

## 已修（宿主，本次提交）
- hzview.js：插件 draw 与 drawSheet 的 s.fn 加 catch，每张图只 warn 一次；之前一张图抛错就会让每帧 3D 渲染中断（#5）。
- hzview.js：隐藏模式下 plugPick3D 跳过范围外已隐藏的构件和屋盖，S-201 能点到承轨层（#1）。镜头碰撞不变。
- hzview.js：#camcfg 不合法时忽略，不再崩页。
- hzsheet.js：小画幅下 GW/GH 钳到 ≥1，铰转角 arc 半径钳到 ≥0。
- hzrel.js：graph() 先滤掉空项，再算签名。
- 版本号：hzview.js?v=36、hzsheet.js?v=8、hzrel.js?v=2。

## 复核为误报或按设计（不改）
- core/seq.js:448 负滞后合并：取最大值是正确的约束合并；jigL ≥ jig 开工是设计如此。
- hzseq.js:501 supRule：touch 判定本身就有方向（下件顶 = 上件底）。
- hzrel.js:46 按 - 切 K- id：工序 key 不含 -，K-merge-N 正是靠这一切。
- hzrel.js:139 forPart 为空：forPart 始终返回数组。
- s001 横道图未来工序条：是进度图内容，不是分图幽灵。

## 派回作者
- D-50 muse-tibo-cs：hzatlas 在高分屏下小地图相机标记偏位；切页后千斤顶图在后台全尺寸重绘；tab 下标错位。
- D-51 hark-liuzhijie：s251.js:159 变量 k 遮蔽，楼面外框没画出来；s501 小画幅 arc 负半径、缺 geo 构件未过滤。
- D-52 hark-darrio：s002 小画幅 arc 负半径。

## 待复核（宿主，封单后或真机定）
- hzview.js:1180 scopeMods 的还原顺序（S-101 土方体块可能常驻）。
- hzview.js:1094 S-000 收官时云门示意线压在实景上。
- hzview.js:780 关系叠层 evenodd 遇重叠时会压暗选中件。
- 实景下光伏不响应关系高亮；范围切换后阴影不刷新；播放时插件 parts 每帧重算；HUD 每帧强制回流。
- hzreal.js：R-0006 的 clad 完成日 751，R-0022/R-0025 是 755，前后矛盾。
