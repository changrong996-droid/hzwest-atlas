#!/bin/zsh
# 候选机位：cand.sh <轮次> <geo> <shot> <style> <名> <cam> [<名> <cam> ...]（480×270，无 Freestyle 的风格约 1 s/张）
cd ~/blender-v2/m; B=/Applications/Blender.app/Contents/MacOS/Blender; R=$1; GEO=$2; SH=$3; ST=$4; shift 4
OUT=~/blender-v2/out/$R; mkdir -p $OUT
while [ $# -ge 2 ]; do V2_SPP=8 V2_CAM=$2 $B -b --factory-startup -P blender/v2/render_v2.py -- ~/blender-v2/geo/$GEO $OUT/$1.png $SH $ST 480 270 > $OUT/$1.log 2>&1; ~/.local/bin/ffmpeg -loglevel error -y -i $OUT/$1.png -q:v 4 $OUT/$1.jpg; shift 2; done; echo done
