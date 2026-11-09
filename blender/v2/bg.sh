#!/bin/zsh
# 后台跑 run.sh：bg.sh <轮次> <W> <H> [shot:style ...]；日志 ~/blender-v2/out/<轮次>.run.log，完成写 <轮次>.done
cd ~/blender-v2/m; R=$1; rm -f ~/blender-v2/out/$R.done
nohup zsh -c "zsh blender/v2/run.sh $* > ~/blender-v2/out/$R.run.log 2>&1; touch ~/blender-v2/out/$R.done" < /dev/null > /dev/null 2>&1 &
echo started
