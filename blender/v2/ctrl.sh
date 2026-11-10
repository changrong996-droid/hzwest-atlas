#!/bin/zsh
# 用法：ctrl.sh <off|on|site|half|half_wide> [W H] [style ...]（site = detail on + 工地设备 site on，出到 site/）：S-401 屋面合拢镜头（t=756）控制图 → ~/blender-v2/ctrl/s401/<off|on>/
#   half = 半铺时刻 t=725（金属屋面铺完 46% + 在铺 14%，南侧网架外露）+ detail/site/env on，同机位；half_wide = 同机位点、抬头 + 26 mm，露出天际线与远山
#   timeline <t> <名> [W H] [style…]：任意时刻 t、half_wide 同一机位 + detail/site/env on → ~/blender-v2/ctrl/s401/timeline/<名>/（几何 ~/blender-v2/geo/t<t>，缺则按 holes,sky,clad,pv 导出）；
#     style 默认 clay depth；t ≥ 683（提升架 rig 671–683 已拆）时 site_lift=[] 不画提升架，塔吊 / 履带吊 / 堆料 / 板房保留
#   CTRL_SET='k=v;…' 追加 V2_SET 覆盖
#   style 默认 depth normal seg line clay；另出 1024 宽版（*_1024.png；seg 最近邻缩放保纯色）与线稿反色版（黑底白线）
cd ~/blender-v2/m
B=/Applications/Blender.app/Contents/MacOS/Blender; FF=~/.local/bin/ffmpeg
D=$1; TT=; NM=
if [ "$D" = timeline ]; then TT=$2; NM=$3; shift 3; set -- timeline "$@"; G=~/blender-v2/geo/t$TT
  [ -f $G/scene.obj ] || ~/.local/bin/node blender/v2/export_v2.js $TT $G --scope holes,sky,clad,pv | cut -c1-80; fi
W=${2:-1920}; H=${3:-1080}; shift 3 2>/dev/null; L=("$@"); [ ${#L} -eq 0 ] && L=(depth normal seg line clay) && [ $D = timeline ] && L=(clay depth)
O=~/blender-v2/ctrl/s401/$D; [ $D = half_wide ] && O=~/blender-v2/ctrl/s401/half/wide; [ $D = timeline ] && O=~/blender-v2/ctrl/s401/timeline/$NM; mkdir -p $O; s0=$(date +%s)
for st in $L; do
  VS="detail='$D'"; G=~/blender-v2/geo/t756; [ $D = site ] && VS="detail='on';site='on'"
  [ $D = half ] && VS="detail='on';site='on';env='on'" && G=~/blender-v2/geo/t725
  [ $D = half_wide ] && VS="detail='on';site='on';env='on';cam=((318, 236, 352), (0, 92, 8), 26)" && G=~/blender-v2/geo/t725
  [ $D = timeline ] && VS="detail='on';site='on';env='on';cam=((318, 236, 352), (0, 92, 8), 26)" && G=~/blender-v2/geo/t$TT && [ $TT -ge 683 ] && VS="$VS;site_lift=[]"
  [ -n "$CTRL_SET" ] && VS="$VS;$CTRL_SET"
  V2_SET="$VS" $B -b --factory-startup -P blender/v2/render_v2.py -- $G $O/s401_$st.png roof $st $W $H > $O/s401_$st.log 2>&1
  grep -h "DETAIL\|CTRL_OUT\|V2_RENDER\|Error\|Traceback" $O/s401_$st.log | cut -c1-400 | head -4
done
cd $O
for f in s401_depth.png s401_depth_16.png s401_normal_cn.png s401_normal_gl.png s401_line.png s401_clay.png; do [ -f $f ] && $FF -loglevel error -y -i $f -vf scale=1024:-2:flags=area ${f%.png}_1024.png; done
[ -f s401_depth_16.png ] && $FF -loglevel error -y -i s401_depth_16.png -vf scale=1024:-2:flags=area -pix_fmt gray16be s401_depth_16_1024.png
[ -f s401_seg.png ] && $FF -loglevel error -y -i s401_seg.png -vf scale=1024:-2:flags=neighbor s401_seg_1024.png
[ -f s401_line.png ] && $FF -loglevel error -y -i s401_line.png -vf negate s401_line_inv.png && $FF -loglevel error -y -i s401_line_1024.png -vf negate s401_line_inv_1024.png
echo TOTAL_SEC $(( $(date +%s) - s0 ))
