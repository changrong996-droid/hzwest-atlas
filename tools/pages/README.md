# 分支网页预览（hz-pages）

把仓库里**任意分支**直接当网页打开，不用检出、不用构建。谁推了分支，刷新就能看到最新提交。
只读：只调用 `git for-each-ref / cat-file / ls-tree`，不写仓库。依赖：Python 3.8+ 与 git，无第三方包。

## 打开方式
- `http://<服务器>:8083/pages/` —— 全部分支，按最近提交排序，带「打开预览」链接
- `http://<服务器>:8083/pages/<分支名>/web/hzwest.html` —— 该分支的预览页（分支名可带斜杠）
- `http://<服务器>:8083/pages/<分支名>/` —— 该分支的目录
- 浏览器会弹登录框：用户名、登录码与 git 推拉相同（由下面的环境变量设定）。

## 安装（在仓库所在服务器上，约 2 分钟）
1. 找到服务器上裸仓库的目录（推拉的 `hzwest-atlas-cs.git` 对应的文件夹），下称 `REPO`。
2. 把本文件夹的 `serve.py` 放到服务器任意位置，例如 `/opt/hz-pages/serve.py`。
3. 试运行：

       PAGES_USER=xinhao PAGES_CODE='<登录码>' python3 /opt/hz-pages/serve.py --repo REPO --port 8083

   看到 `hz-pages 在 http://0.0.0.0:8083/pages/` 即成功。
4. 云服务器安全组 / 防火墙放行 TCP 8083（腾讯云：实例 → 安全组 → 入站规则加 8083）。
5. 常驻（systemd，可选）：新建 `/etc/systemd/system/hz-pages.service`

       [Unit]
       Description=hz-pages branch preview
       After=network.target
       [Service]
       Environment=PAGES_USER=xinhao
       Environment=PAGES_CODE=<登录码>
       ExecStart=/usr/bin/python3 /opt/hz-pages/serve.py --repo REPO --port 8083 --quiet
       Restart=always
       [Install]
       WantedBy=multi-user.target

   然后 `systemctl daemon-reload && systemctl enable --now hz-pages`。

## 说明
- 共用：任何拿到登录码的人都能看任何分支；不设 `PAGES_CODE` 时不要求登录，只适合内网。
- 端口、监听地址可改：`--port`、`--host`。
- 文件按提交号缓存（上限 200 MB），分支列表 5 秒刷新一次；推送后刷新页面即见新内容。
- 不改现有 git 服务，两者并排跑；停掉 hz-pages 不影响推拉。
