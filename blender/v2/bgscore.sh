#!/bin/zsh
# 后台评分：bgscore.sh <轮次> [shot_style ...]；完成写 ~/blender-v2/out/<轮次>.scored
R=$1; shift; rm -f ~/blender-v2/out/$R.scored
nohup zsh -c "python3 ~/blender-v2/m/blender/v2/score.py ~/blender-v2/out/$R $* > ~/blender-v2/out/$R.score.log 2>&1; touch ~/blender-v2/out/$R.scored" < /dev/null > /dev/null 2>&1 &
echo started
