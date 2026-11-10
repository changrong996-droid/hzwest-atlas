#!/bin/zsh
# after.sh <等这一轮 done> <新轮次> <W> <H> [shot:style ...]：前一轮出完再开下一轮（避免两路 Blender 抢 GPU）
P=$1; shift; nohup zsh -c "while [ ! -f ~/blender-v2/out/$P.done ]; do sleep 5; done; zsh ~/blender-v2/m/blender/v2/bg.sh $*" < /dev/null > /dev/null 2>&1 &
echo queued
