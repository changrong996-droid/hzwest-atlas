#!/bin/bash
# 在一台 InstaBox 机器上装好收件镜像（幂等）。在集成人沙盒里跑：bash tools/inbox/mirror_setup.sh <vm> [对端镜像 URL]
# 装：/data/workspace/inbox/{hzwest-atlas.git, inbox_server.py, board.py, claims_gate.py, mchecks.py, agents.txt}，systemd 服务 hzinbox（端口 8090）。
# 有对端 URL 时，从对端补齐 agent/* 分支（fetch 不走钩子）。不放任何密钥。
set -eu
VM=$1; PEER=${2:-}
R=$(cd "$(dirname "$0")/../.." && pwd); IBX="python3 /workspace/work/ibx/ibx.py"
D=/data/workspace/inbox
st=$($IBX ls | awk -v v="$VM" '$1==v{print $3}'); [ "$st" = running ] || { $IBX resume "$VM" >/dev/null; sleep 25; }
for f in inbox_server.py board.py claims_gate.py mchecks.py pre-receive; do $IBX put "$VM" "$R/tools/inbox/$f" "$D/$f" >/dev/null; done
sed -n '/^## 1. 名册/,/^### 1.1/p' "$R/AGENTS.md" | grep -o '`[a-z0-9-]\{3,24\}`' | tr -d '`' | sort -u > /tmp/agents.txt
$IBX put "$VM" /tmp/agents.txt "$D/agents.txt.new" >/dev/null
$IBX exec "$VM" "set -e; cd $D
  [ -d hzwest-atlas.git ] || git init -q --bare -b main hzwest-atlas.git
  git -C hzwest-atlas.git fetch -q https://github.com/changrong996-droid/hzwest-atlas.git +main:main
  ${PEER:+git -C hzwest-atlas.git fetch -q $PEER '+refs/heads/agent/*:refs/heads/agent/*' || echo PEER-FETCH-FAIL}
  cat agents.txt agents.txt.new 2>/dev/null | sort -u > a && mv a agents.txt && rm -f agents.txt.new
  install -m 755 pre-receive hzwest-atlas.git/hooks/pre-receive
  git -C hzwest-atlas.git config http.receivepack true
  printf '[Unit]\nDescription=hzwest-atlas inbox\nAfter=network.target\n[Service]\nUser=\$(whoami)\nExecStart=/usr/bin/python3 $D/inbox_server.py $D 8090\nRestart=always\n[Install]\nWantedBy=multi-user.target\n' > /tmp/hzinbox.service
  sed -i \"s/\\\$(whoami)/\$(whoami)/\" /tmp/hzinbox.service
  sudo mv /tmp/hzinbox.service /etc/systemd/system/hzinbox.service
  sudo systemctl daemon-reload; sudo systemctl enable -q hzinbox; sudo systemctl restart hzinbox; sleep 2
  systemctl is-active hzinbox; curl -s localhost:8090/health | head -1; wc -l < agents.txt
  git -C hzwest-atlas.git for-each-ref --count=3 --format='%(refname:short) %(objectname:short)' refs/heads" 180
