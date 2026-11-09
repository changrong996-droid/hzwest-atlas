#!/bin/zsh
# 重新导出 4 个镜头用到的几何；--scope 同页面 SCOPE_OUT='hide'：不服务本图的临时塔吊不画
cd ~/blender-v2/m
node blender/v2/export_v2.js 661 ~/blender-v2/geo/t661 --scope lift,merge,wlift,head,asm1,asm2,asm3,rig | cut -c1-80
node blender/v2/export_v2.js 756 ~/blender-v2/geo/t756 --scope holes,sky,clad,pv | cut -c1-80
node blender/v2/export_v2.js 1131 ~/blender-v2/geo/t1131 --scope ymf,ym,ymc,tod,open | cut -c1-80
node blender/v2/export_v2.js 1131 ~/blender-v2/geo/t1131f58 --train-f 0.58 --scope ymf,ym,ymc,tod,open | cut -c1-80
