#!/bin/bash
# hark-cr integrator: sync inbox main from GitHub, fetch agent branches, test each. Needs credentials instabox + github.
set -u
R=/workspace/projects/3dffd53e-9285-4461-aa69-4f5634f0e079/hzwest-atlas
# 多镜像轮值（AGENTS.md 6B）：先按轮值表切换主镜像，再只碰主镜像（下班的机器不碰，让它挂起休息）
python3 $R/tools/inbox/mirror.py rotate
VM=$(python3 $R/tools/inbox/mirror.py vm); INBOX=$(python3 $R/tools/inbox/mirror.py url)/hzwest-atlas.git
G="git -c http.sslCAInfo=$SSL_CERT_FILE"
cd /workspace/work/ibx
st=$(python3 ibx.py ls | awk -v v=$VM '$1==v{print $3}')
[ "$st" != "running" ] && python3 ibx.py resume $VM >/dev/null && sleep 20
python3 ibx.py exec $VM 'cd /data/workspace/inbox && git -C hzwest-atlas.git fetch -q https://github.com/changrong996-droid/hzwest-atlas.git +main:main && sudo systemctl is-active hzinbox && git -C hzwest-atlas.git for-each-ref --format="%(refname:short) %(objectname:short) %(committerdate:iso)" refs/heads/agent' 90
cd $R && $G fetch -q origin main && git checkout -q main && git merge -q --ff-only origin/main
$G fetch -q --prune $INBOX '+refs/heads/agent/*:refs/remotes/inbox/agent/*'
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/inbox/agent); do
  if git merge-base --is-ancestor $b main; then echo "MERGED $b"; continue; fi
  w=/tmp/inbox-wt; rm -rf $w; git worktree prune; git worktree add -q --detach $w main
  ( cd $w && if git -c user.name=hark-cr -c user.email=hark@local merge -q --no-ff --no-edit $b >/dev/null 2>&1; then
      r=$(node tools/hz/check_all.js 2>&1 | tail -1); sc=$(python3 /workspace/work/inbox/scope.py $R $b); case "$r" in OK*) [ "${sc%% *}" = AUTO ] && tag=AUTO || tag=PENDING;; *) tag=PENDING;; esac; echo "$tag $b | $sc | merge ok | $r | $(git log --format='%h %s' main..$b | wc -l) commits"; git log --format='    %h %s [%an]' main..$b
    else echo "PENDING $b | MERGE CONFLICT"; fi )
  git worktree remove --force $w
done
# pi 小活协作者：每轮唤醒 test-2/test-3 各跑一轮（脚本自带 flock 防重入，后台运行最长 15 分钟）
cd /workspace/work/ibx
for m in test-2:pi-t2 test-3:pi-t3; do vm=${m%%:*}; n=${m##*:}
  python3 ibx.py resume $vm >/dev/null 2>&1
  python3 ibx.py exec $vm "chmod +x ~/pirun.sh; nohup setsid ~/pirun.sh $n >/dev/null 2>&1 < /dev/null & echo PI-START $n" 30 2>&1 | grep PI-START
done
