#!/bin/bash
# hark-cr integrator: sync inbox main from GitHub, fetch agent branches, test each. Needs credentials instabox + github.
set -u
R=/workspace/projects/3dffd53e-9285-4461-aa69-4f5634f0e079/hzwest-atlas
INBOX=https://8090-agqw7hn5d3p3sl4cbll4o2rf5e.instabox.tech/hzwest-atlas.git
G="git -c http.sslCAInfo=$SSL_CERT_FILE"
cd /workspace/work/ibx
st=$(python3 ibx.py ls | awk '$1=="test-5"{print $3}')
[ "$st" != "running" ] && python3 ibx.py resume test-5 >/dev/null && sleep 20
python3 ibx.py exec test-5 'cd /data/workspace/inbox && git -C hzwest-atlas.git fetch -q https://github.com/changrong996-droid/hzwest-atlas.git +main:main && sudo systemctl is-active hzinbox && git -C hzwest-atlas.git for-each-ref --format="%(refname:short) %(objectname:short) %(committerdate:iso)" refs/heads/agent' 90
cd $R && $G fetch -q origin main && git checkout -q main && git merge -q --ff-only origin/main
$G fetch -q --prune $INBOX '+refs/heads/agent/*:refs/remotes/inbox/agent/*'
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/inbox/agent); do
  if git merge-base --is-ancestor $b main; then echo "MERGED $b"; continue; fi
  w=/tmp/inbox-wt; rm -rf $w; git worktree add -q --detach $w main
  ( cd $w && if git -c user.name=hark-cr -c user.email=hark@local merge -q --no-ff --no-edit $b >/dev/null 2>&1; then
      r=$(node tools/hz/check_all.js 2>&1 | tail -1); echo "PENDING $b | merge ok | $r | $(git log --format='%h %s' main..$b | wc -l) commits"; git log --format='    %h %s [%an]' main..$b
    else echo "PENDING $b | MERGE CONFLICT"; fi )
  git worktree remove --force $w
done
