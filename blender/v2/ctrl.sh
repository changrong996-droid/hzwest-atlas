#!/bin/zsh
# 用法：ctrl.sh <off|on> [W H] [style ...]：S-401 屋面合拢镜头（t=756）控制图 → ~/blender-v2/ctrl/s401/<off|on>/
#   style 默认 depth normal seg line clay；另出 1024 宽版（*_1024.png；seg 最近邻缩放保纯色）与线稿反色版（黑底白线）
cd ~/blender-v2/m
B=/Applications/Blender.app/Contents/MacOS/Blender; FF=~/.local/bin/ffmpeg
D=$1; W=${2:-1920}; H=${3:-1080}; shift 3 2>/dev/null; L=("$@"); [ ${#L} -eq 0 ] && L=(depth normal seg line clay)
O=~/blender-v2/ctrl/s401/$D; mkdir -p $O; s0=$(date +%s)
for st in $L; do
  V2_SET="detail='$D'" $B -b --factory-startup -P blender/v2/render_v2.py -- ~/blender-v2/geo/t756 $O/s401_$st.png roof $st $W $H > $O/s401_$st.log 2>&1
  grep -h "DETAIL\|CTRL_OUT\|V2_RENDER\|Error\|Traceback" $O/s401_$st.log | cut -c1-400 | head -4
done
cd $O
for f in s401_depth.png s401_depth_16.png s401_normal_cn.png s401_normal_gl.png s401_line.png s401_clay.png; do [ -f $f ] && $FF -loglevel error -y -i $f -vf scale=1024:-2:flags=area ${f%.png}_1024.png; done
[ -f s401_depth_16.png ] && $FF -loglevel error -y -i s401_depth_16.png -vf scale=1024:-2:flags=area -pix_fmt gray16be s401_depth_16_1024.png
[ -f s401_seg.png ] && $FF -loglevel error -y -i s401_seg.png -vf scale=1024:-2:flags=neighbor s401_seg_1024.png
[ -f s401_line.png ] && $FF -loglevel error -y -i s401_line.png -vf negate s401_line_inv.png && $FF -loglevel error -y -i s401_line_1024.png -vf negate s401_line_inv_1024.png
echo TOTAL_SEC $(( $(date +%s) - s0 ))
