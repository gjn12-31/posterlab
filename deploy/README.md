# 公网 AI 工作台

[进入受邀工作台](https://43.137.35.100/enter/) · [查看公开案例](https://gjn12-31.github.io/posterlab/#collection)

公网 IP 根地址和 GitHub Pages 都提供公开展示、下载及本地排版。云服务器上的 Nginx 在 HTTPS 下验证邀请凭据，再把同源 API 请求交给 FastAPI。默认 443 入口属于项目方工作室。其邀请持有者可以查看该工作室的服务器生成记录。给不同实验室开通访问时，管理员可在同一台服务器创建独立工作区。

## 线上进程和数据

| 位置 | 用途 |
| --- | --- |
| `/opt/posterlab/public` | 对外只读的展示版构建目录，独立于工作台版本发布 |
| `/opt/posterlab/current` | 活动版本的源代码、`site/` 完整版构建和字体 |
| `/etc/posterlab/studio.env` | 仅管理员可读的模型配置。由 systemd 注入，包含 `PARATERA_API_KEY` |
| `/etc/nginx/posterlab-users` | 邀请用户的 bcrypt 验证哈希。Nginx 会从上游请求中移除身份验证头 |
| `/var/lib/posterlab` | 应用服务用户持有的费用账本与生成记录。发布新版本时保留 |
| `/etc/letsencrypt/live/<公网 IP>/` | 公网 IP 的 TLS 证书，由 `posterlab-certificate.timer` 每天检查两次并在续期后重载 Nginx |

根路径、公开静态资源、`/enter/` 和 `/healthz` 可匿名访问。`/app/`、`/api/` 与 `/legacy/` 需要邀请凭据。带有其他网页来源的 API 请求在 Nginx 被拒绝。公开首页 HTML 和无指纹资源按请求重新验证，带内容指纹的静态资源可缓存一年；CSS、JavaScript、SVG、JSON 与 WASM 启用 gzip。受邀工作台和 API 使用 `private, no-store`。API 按客户端 IP 限制请求频率，全部请求每分钟 120 次，POST 请求另限每分钟 30 次并允许 10 次瞬时突发，使查询进度和发起模型任务各有余量。应用账本另设两个并行付费任务及 `STUDIO_BUDGET_CNY` 配额。模型价格缺失时账本使用预留额，实际费用以供应商账单为准。

## 在另一台服务器安装

使用支持 systemd 的 Linux 主机，配置 Python 3.11 或 3.12、Nginx、Apache 的 `htpasswd` 和 Certbot 5.4 或更新版本。为 Nginx 开放 TCP 80 和 443，应用进程在回环地址运行。

1. 将本仓库的 `src/`、`pyproject.toml`、`requirements.lock.txt`、`resources/`、`configs/`、`data/`、`prompts/`、`legacy/`、`deploy/` 放入版本目录，用 `/opt/posterlab/current` 指向该目录。用 Node.js 22.12 或更新版本在 `web/` 执行 `npm ci` 与 `VITE_STATIC_DEMO=false npm run build`，将生成的 `site/` 放入同一版本目录。为公开首页另建一份构建，设置 `VITE_STATIC_DEMO=true` 及 `VITE_LIVE_STUDIO_URL=https://<公网 IP>/enter/`，再执行 `npm run build`。将这份静态构建单独保存，用 `/opt/posterlab/public` 指向它。服务端渲染和导出还会从 `web/public/fonts/` 读取字体，可让版本目录中的 `web/public` 指向 `../site`。
2. 在 `/opt/posterlab/venv` 安装项目依赖。在版本目录内运行 `/opt/posterlab/venv/bin/pip install -c requirements.lock.txt '.[server]'`，再以管理员身份运行 `PLAYWRIGHT_BROWSERS_PATH=/opt/posterlab/browsers /opt/posterlab/venv/bin/playwright install --with-deps chromium`。创建名为 `posterlab`、无交互登录权限的系统用户。
3. 管理员在权限为 0600 的 `/etc/posterlab/studio.env` 设置 `POSTERLAB_PROVIDER=paratera`、`PARATERA_API_KEY` 与预算。首次创建邀请时用 `htpasswd -cB -C 10 /etc/nginx/posterlab-users <用户名>` 交互设置口令，设置文件为 `root:www-data`、权限 0640。向已有文件添加用户时用 `htpasswd -B -C 10`。
4. 将两个 Nginx 配置中的 `PUBLIC_HOST` 替换为实际公网 IP。先启用 HTTP 配置，为 Certbot 创建 `/srv/posterlab-acme`。以受控账户运行 `certbot certonly --preferred-profile shortlived --webroot --webroot-path /srv/posterlab-acme --ip-address <公网 IP> --cert-name <公网 IP>`，证书签发后启用 HTTPS 配置并执行 `nginx -t`、`systemctl reload nginx`。证书定时任务使用 `/opt/posterlab/certbot/bin/certbot`，请安装到此位置或按实际路径修改服务文件。[Let’s Encrypt 的 IP 证书说明](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)
5. 将 `posterlab.service`、`posterlab-certificate.service` 和 `posterlab-certificate.timer` 安装到 `/etc/systemd/system/`。执行 `systemctl daemon-reload` 和 `systemctl enable --now posterlab.service posterlab-certificate.timer`。
6. 从外网验证 `/` 与首页链接的 JS、CSS 正常加载，`/healthz` 返回 200 和 `{"status":"ok"}`，匿名访问 `/api/generations` 返回 401，登录后进入 `/app/#workbench`。用真实活动通知验证模型生成和下载。GitHub 仓库 Actions 变量 `POSTERLAB_STUDIO_URL` 填写邀请页 HTTPS 地址后，重新部署 Pages 即可更新公开站点入口。

当前实例使用南京三区一台按量 CPU 云服务器，系统盘 40 GB，按流量公网 IP 峰值 5 Mbps。订购时平台显示约 ¥0.40/小时及 ¥1/GB 出口流量。停用或释放前请备份需要保留的生成记录。平台关机后存储及网络仍可继续计费，具体以控制台为准。[并行智算云创建与计费说明](https://ai.paratera.com/document/computer/compute/create)

## 给独立团队分配试点工作区

同一个工作区内共享服务器记录。不同工作区分别使用 Linux 服务身份、SQLite 账本、作品目录、模型预算和登录凭据。路径模式可直接使用当前公网 443。独立主机名或 HTTPS 端口可为团队提供独立浏览器来源。各团队共用管理员配置的模型供应商账户，费用以供应商总账单为准。

首次安装，在本仓库根目录执行以下命令。工作区沿用主站 HTTPS 配置里的证书、日志格式和流量限制。

```bash
sudo install -d -m 0755 /usr/local/lib/posterlab-workspaces
sudo install -m 0755 deploy/manage-workspace.py /usr/local/lib/posterlab-workspaces/
sudo install -m 0644 deploy/nginx-workspace.conf deploy/nginx-workspace-path.conf deploy/invitation.html /usr/local/lib/posterlab-workspaces/
sudo install -m 0644 deploy/posterlab-workspace@.service /etc/systemd/system/
sudo systemctl daemon-reload
```

**在主站开通团队入口**可使用 `--path`。此模式适合已有公网 IP 和证书的实例。Nginx 在服务器端按完整路径设置独立认证、固定后端和访问规则，未知工作区路径返回 404。前端按该工作区路径保存浏览器草稿。在同一浏览器中，这些路径属于同一个网页来源；原生浏览器来源隔离需使用下文的独立主机名或端口模式。示例为 `vision-lab` 分配 5 元累计模型上限。

```bash
admin=/usr/local/lib/posterlab-workspaces/manage-workspace.py
sudo "$admin" create vision-lab --path --host 43.137.35.100 --budget 5
curl -sS -o /dev/null -w '%{http_code}\n' https://43.137.35.100/t/vision-lab/enter/
curl -sS -o /dev/null -w '%{http_code}\n' https://43.137.35.100/t/vision-lab/api/generations
```

邀请页和匿名记录接口应分别返回 200、401。团队成员从 `/t/vision-lab/enter/` 登录，或直接进入 `/t/vision-lab/app/`。用户名和口令仅管理员可从 `/etc/posterlab/workspaces/vision-lab/invitation.txt` 读取。停用时执行 `sudo "$admin" revoke vision-lab`。

**已有自有域名的团队**可直接共用公网 443，并让不同工作区各自使用独立域名。例如，先为受邀团队建立一个指向本机公网 IP 的 DNS A 记录，配置云商要求的域名接入并验证 HTTP 80 可访问相应的挑战文件，然后用该域名单独签发证书。以下示例中的 `labs.example.org` 需换成管理员实际拥有的域名。也可用域名服务商的 DNS-01 验证签发、续期，确保签发文件位于 `/etc/letsencrypt/live/<实际主机名>/`。已有的 Certbot 定时器会处理采用自动验证方式的证书。

```bash
admin=/usr/local/lib/posterlab-workspaces/manage-workspace.py
host=optics.labs.example.org
sudo /opt/posterlab/certbot/bin/certbot certonly --webroot \
  --webroot-path /srv/posterlab-acme --cert-name "$host" -d "$host"
sudo "$admin" create optics-lab --host "$host" --budget 5
curl -sS -o /dev/null -w '%{http_code}\n' "https://$host/enter/"
curl -sS -o /dev/null -w '%{http_code}\n' "https://$host/api/generations"
```

此模式使用精确 DNS 名称选择 Nginx 站点和专属证书，工作区服务只接收该来源的网页请求。邀请文件由 root 持有，只读给管理员。在外部网络确认上述请求分别得到 200 和 401，再经团队约定的私密方式交付邀请。

**仅有公网 IP 的团队**可为第二个团队 `maps-lab` 选择独立 HTTPS 端口并分配 5 元累计模型预算。IP 需要与已安装的 TLS 证书一致。`--port` 可选，省略后系统自动分配。命令输出入口地址和邀请文件路径。

```bash
admin=/usr/local/lib/posterlab-workspaces/manage-workspace.py
sudo "$admin" create maps-lab --host 43.137.35.100 --port 10444 --budget 5
sudo "$admin" list
```

将云网络的入站规则精确指向该实例的工作区 TCP 端口，来源优先选择团队固定出口 IP。如果网络设备由云商管理，需要先取得该端口的外部通达性。应用的内部端口仅监听本机。从团队实际使用的外部网络执行以下检查，邀请页应返回 200，匿名记录列表应返回 401。成功后再交付邀请。

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://43.137.35.100:10444/enter/
curl -sS -o /dev/null -w '%{http_code}\n' https://43.137.35.100:10444/api/generations
```

试点结束时先撤销工作区，再收回专属端口的云入站规则或处理已下线的 DNS 记录及证书。共用 443 时保留主站的云入站规则。管理工具先切断新访问，等待已登记的付费任务结束，再停止该实例并禁用开机启动。关闭中的任务若超过十分钟，工具会保留运行进程；待任务结束后再次执行撤销。已撤销工作区的浏览器来源永久预留，避免未来团队接管。服务器中的历史数据保留，并可由管理员备份。此前下载到个人设备的文件由使用者保管。

```bash
sudo "$admin" revoke optics-lab
sudo "$admin" list
```

当前南京实例的外网 443 负责人入口与团队路径入口均已实测。2026-11-19 的公网测试覆盖两组凭据分离、跨团队记录与源文件访问拒绝、零元预算拒绝付费请求。外网 Chromium 从路径邀请页登录后，在活动工作室保存并重载草稿，确认原负责人存储项保留。继续进入原创设计室，作品与状态查询均返回 200，且请求使用该团队的 API 前缀。独立端口模式另外验证了同一浏览器的原生来源隔离及撤销。测试端口 10443 从外网连接超时，TLS 与业务验证使用 SSH 转发。当前账号显示的云服务器与公网 IP 管理页面均未提供入站端口设置。临时公共 DNS 名称正确指向实例 IP，但 Let’s Encrypt 的 HTTP-01 域名验证被云商的安全策略页面拦截，返回 HTTP 566。默认路径方式可直接沿用主站公网 IP 和证书。需要原生浏览器来源隔离的团队，可选择已接入的自有域名或经外部验证可达的专属端口。
