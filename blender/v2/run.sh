#!/bin/zsh
# 用法：run.sh <轮次标签> <W> <H> [shot:style ...]（默认 12 张）；成图 ~/blender-v2/out/<轮次>/<shot>_<style>.png + .jpg
cd ~/blender-v2/m
B=/Applications/Blender.app/Contents/MacOS/Blender
R=$1; W=$2; H=$3; shift 3
OUT=~/blender-v2/out/$R; mkdir -p $OUT
L=("$@"); [ ${#L} -eq 0 ] && L=(lift:clay lift:ink lift:real roof:clay roof:ink roof:real train:clay train:ink train:real night:clay night:ink night:real)
typeset -A G; G=(lift t661 roof t756 train t1131f64 night t1131)
s0=$(date +%s)
for it in $L; do sh=${it%%:*}; st=${it##*:}
  $B -b --factory-startup -P blender/v2/render_v2.py -- ~/blender-v2/geo/${G[$sh]} $OUT/${sh}_${st}.png $sh $st $W $H > $OUT/${sh}_${st}.log 2>&1
  grep -h "V2_RENDER\|Error\|Traceback" $OUT/${sh}_${st}.log | head -3
  ~/.local/bin/ffmpeg -loglevel error -y -i $OUT/${sh}_${st}.png -q:v 4 $OUT/${sh}_${st}.jpg
done
echo TOTAL_SEC $(( $(date +%s) - s0 ))
