#!/bin/zsh
# 用法：ctrl.sh <off|on|site|half|half_wide> [W H] [style ...]（site = detail on + 工地设备 site on，出到 site/）：S-401 屋面合拢镜头（t=756）控制图 → ~/blender-v2/ctrl/s401/<off|on>/
#   half = 半铺时刻 t=725（金属屋面铺完 46% + 在铺 14%，南侧网架外露）+ detail/site/env on，同机位；half_wide = 同机位点、抬头 + 26 mm，露出天际线与远山
#   timeline <t> <名> [W H] [style…]：任意时刻 t、half_wide 同一机位 + detail/site/env on → ~/blender-v2/ctrl/s401/timeline/<名>/（几何 ~/blender-v2/geo/t<t>，缺则按 holes,sky,clad,pv 导出）；
#     style 默认 clay depth；t ≥ 683（提升架 rig 671–683 已拆）时 site_lift=[] 不画提升架，塔吊 / 履带吊 / 堆料 / 板房保留
#   shot <lift|train> <t> <名> W H [style…]：S-301 / S-501 时间轴（同一镜头机位固定，见 LIFT_CAM / TRAIN_CAM）+ detail/site/env on → ~/blender-v2/ctrl/<s301|s501>/timeline/<名>/；
#     几何 ~/blender-v2/geo/t<t>（CTRL_GEO 覆盖，如 t1131f64）缺则按该镜头的 scope 导出；site 按工序取舍：t ≥ 683 不画提升架，t ≥ 1060（塔吊拆完、主体完工）site 整体关
#   CTRL_SET='k=v;…' 追加 V2_SET 覆盖
#   style 默认 depth normal seg line clay；另出 1024 宽版（*_1024.png；seg 最近邻缩放保纯色）与线稿反色版（黑底白线）
cd ~/blender-v2/m
B=/Applications/Blender.app/Contents/MacOS/Blender; FF=~/.local/bin/ffmpeg
D=$1; TT=; NM=; SH=roof; PF=s401
LIFT_CAM="((235, 40, 265), (70, 30, 75), 30)"; TRAIN_CAM="((-330, 75, -60), (-135, 14, 42), 30)"   # S-301：定稿 lift 机位后退抬高、26 mm，屋盖东南角 + 角部提升架整根入框；S-501：TRAIN3
if [ "$D" = shot ]; then SH=$2; TT=$3; NM=$4; shift 4; set -- shot "$@"; G=${CTRL_GEO:-~/blender-v2/geo/t$TT}
  SC=lift,merge,wlift,head,asm1,asm2,asm3,rig; PF=s301; [ $SH = train ] && SC=ymf,ym,ymc,tod,open && PF=s501
  [ -f $G/scene.obj ] || ~/.local/bin/node blender/v2/export_v2.js $TT $G --scope $SC | cut -c1-80; fi
if [ "$D" = timeline ]; then TT=$2; NM=$3; shift 3; set -- timeline "$@"; G=~/blender-v2/geo/t$TT
  [ -f $G/scene.obj ] || ~/.local/bin/node blender/v2/export_v2.js $TT $G --scope holes,sky,clad,pv | cut -c1-80; fi
W=${2:-1920}; H=${3:-1080}; shift 3 2>/dev/null; L=("$@"); [ ${#L} -eq 0 ] && L=(depth normal seg line clay) && [ $D = timeline -o $D = shot ] && L=(clay depth)
O=~/blender-v2/ctrl/s401/$D; [ $D = half_wide ] && O=~/blender-v2/ctrl/s401/half/wide; [ $D = timeline ] && O=~/blender-v2/ctrl/s401/timeline/$NM; [ $D = shot ] && O=~/blender-v2/ctrl/$PF/timeline/$NM; mkdir -p $O; s0=$(date +%s)
for st in $L; do
  VS="detail='$D'"; G=~/blender-v2/geo/t756; [ $D = site ] && VS="detail='on';site='on'"
  [ $D = half ] && VS="detail='on';site='on';env='on'" && G=~/blender-v2/geo/t725
  [ $D = half_wide ] && VS="detail='on';site='on';env='on';cam=((318, 236, 352), (0, 92, 8), 26)" && G=~/blender-v2/geo/t725
  [ $D = timeline ] && VS="detail='on';site='on';env='on';cam=((318, 236, 352), (0, 92, 8), 26)" && G=~/blender-v2/geo/t$TT && [ $TT -ge 683 ] && VS="$VS;site_lift=[]"
  if [ $D = shot ]; then SH_=$SH; G=${CTRL_GEO:-~/blender-v2/geo/t$TT}; CM=$LIFT_CAM; [ $SH = train ] && CM=$TRAIN_CAM
    VS="detail='on';site='on';env='on';cam=$CM"; [ $TT -ge 683 ] && VS="$VS;site_lift=[]"; [ $TT -ge 1060 ] && VS="detail='on';site='off';env='on';cam=$CM"; fi
  [ -n "$CTRL_SET" ] && VS="$VS;$CTRL_SET"
  V2_SET="$VS" $B -b --factory-startup -P blender/v2/render_v2.py -- $G $O/${PF}_$st.png ${SH_:-roof} $st $W $H > $O/${PF}_$st.log 2>&1
  grep -h "DETAIL\|SITE\|STRANDS\|FRAMECHECK\|CTRL_OUT\|V2_RENDER\|Error\|Traceback" $O/${PF}_$st.log | cut -c1-400 | head -4
done
cd $O
for f in ${PF}_depth.png ${PF}_depth_16.png ${PF}_normal_cn.png ${PF}_normal_gl.png ${PF}_line.png ${PF}_clay.png; do [ -f $f ] && $FF -loglevel error -y -i $f -vf scale=1024:-2:flags=area ${f%.png}_1024.png; done
[ -f ${PF}_depth_16.png ] && $FF -loglevel error -y -i ${PF}_depth_16.png -vf scale=1024:-2:flags=area -pix_fmt gray16be ${PF}_depth_16_1024.png
[ -f ${PF}_seg.png ] && $FF -loglevel error -y -i ${PF}_seg.png -vf scale=1024:-2:flags=neighbor ${PF}_seg_1024.png
[ -f ${PF}_line.png ] && $FF -loglevel error -y -i ${PF}_line.png -vf negate ${PF}_line_inv.png && $FF -loglevel error -y -i ${PF}_line_1024.png -vf negate ${PF}_line_inv_1024.png
echo TOTAL_SEC $(( $(date +%s) - s0 ))
