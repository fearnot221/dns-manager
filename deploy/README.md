# Docker 自架與 GitHub push 自動部署

**目前正式架構：Ubuntu 22.04／24.04 內網 VM + 另一台 Caddy，網域 `dnsmgr.ce.ncu.edu.tw`。請優先使用 [VM 一鍵安裝指南](QUICKSTART.md) 與 [install-vm.sh](install-vm.sh)。** 它會自動建立環境檔、安裝依賴、初始化帳號、配置私有 gateway/webhook，並提供一次性 GitHub webhook 註冊工具。下列是手動安裝／同機 Nginx 的替代方案。

本方案使用 Linux 主機上的 Docker Compose、PostgreSQL、Nginx（HTTPS）及一個獨立的 webhook service。網站容器不掛載 Docker socket。Webhook 的部署帳號具有 Docker 權限，等同主機高權限，務必限制 SSH、repository 寫入者與正式分支。

## 1. 先準備

- Linux server：Docker Engine、Compose v2.24+、Git、Node.js 22.13+、Nginx、`flock`（util-linux）。
- 正式 DNS 與有效 TLS 憑證。外部僅開放 HTTPS；3000、9000 綁定 loopback，PostgreSQL 不開 host port。
- Repository：`https://github.com/fearnot221/dns-manager.git`。建議 main 分支保護、PR review、CI 必須通過。能 push 正式分支的人等同能部署程式到 server。
- Portal：OAuth2 的 Client ID、Secret，以及維運人員核對的最高使用者 Portal `identifier`。這不是猜測 Email 前綴。停用「可代理登入」。

## 2. 環境檔與第一次啟動

以下目錄是預設範例。建立專用 `dnsdeploy` 系統帳號及同名 group，設定其 home；加入 docker group。由它擁有 checkout 與 webhook state 目錄。`/opt/dns-manager-deploy` 的程式應由 root 擁有，部署帳號唯讀；不要讓 webhook 自動改寫自己的程式。

```bash
git clone https://github.com/fearnot221/dns-manager.git /opt/dns-manager
sudo install -d -m 0750 -o root -g dnsdeploy /etc/dns-manager
sudo install -m 0640 -o root -g dnsdeploy /opt/dns-manager/deploy/app.env.example /etc/dns-manager/app.env
sudo install -d -m 0700 -o dnsdeploy -g dnsdeploy /var/lib/dns-manager-webhook
```

用安全的編輯器填入 `/etc/dns-manager/app.env`，不要把內容貼進 chat 或 commit：

- `POSTGRES_PASSWORD`：獨立執行 `openssl rand -hex 32`，使用 hex 避免 URI 特殊字元。
- `AUTH_SECRET`：另一個 `openssl rand -hex 32`；部署間必須固定，否則所有 session 失效。
- `SETTINGS_ENCRYPTION_KEY`：再產生一個 `openssl rand -hex 32`；備份此值，不能隨意更換。
- `AUTH_URL=https://你的正式網域`，無其他路徑。
- `AUTH_LOGTO_ID`、`AUTH_LOGTO_SECRET`。最高權限識別來自已驗證的 UserInfo `identities[*].details.identifier`，不是 env。
- `PDNS_MOCK=false`；只在 env 設定 `PDNS_API_URL`、`PDNS_API_KEY`、`PDNS_SERVER_ID`，網址以 `/api/v1` 結尾。網頁設定入口已移除，舊資料庫連線設定不再生效。沒有連線時 DNS 頁會顯示錯誤，不會切換到假資料。
- Portal 不需白名單；驗證成功會自動建立一般使用者。管理員僅由最高使用者手動指派，停用帳號仍禁止使用。帳密登入保留以供測試，可設 `AUTH_PASSWORD_LOGIN_ENABLED=false` 關閉。測試帳號建立命令見 QUICKSTART。
- `OWNER_INITIAL_PASSWORD`：初次建立最高帳號用，16 字元以上，與 demo 密碼不同。

首次啟動（以能讀取 env 且有 Docker 權限的專用帳號執行）：

```bash
cd /opt/dns-manager
docker compose --env-file /etc/dns-manager/app.env config --quiet
docker compose --env-file /etc/dns-manager/app.env up -d --build --wait
docker compose --env-file /etc/dns-manager/app.env --profile maintenance run --rm --no-deps seed
docker compose --env-file /etc/dns-manager/app.env ps
```

`up` 先等待 PostgreSQL 健康，再完成所有 migration，最後啟動 web。Seed 僅執行一次，已有最高帳號時會拒絕覆寫。成功後刪除 env 中的 `OWNER_INITIAL_PASSWORD` 值。不使用 `docker compose down -v`，那會刪除資料庫 volume。

PowerDNS 如果在 host 上，容器中的 `127.0.0.1` 不會連到 host；使用受防火牆保護的私有位址，或自行配置 Docker network／host-gateway。絕不可把 PowerDNS API 直接開到 Internet。

## 3. HTTPS 與 Portal

參考 `nginx.conf.example`，替換所有範例網域與憑證路徑，先 `nginx -t` 再 reload。Nginx 應覆寫 Host／forwarded headers，保留 origin 檢查，不要讓使用者直接連到容器。

登入改接 Logto，使用 [Logto 切換指南](LOGTO.md) 設定：

- 重定向 URI：`https://dnsmgr.ce.ncu.edu.tw/api/auth/callback/logto`
- 登出後重定向 URI：`https://dnsmgr.ce.ncu.edu.tw/login`
- Scopes：`openid identities`（唯一額外 UserScope 為 `identities`）

既有帳號由維運人工核對 Logto User ID 後綁定，不自動依 Email 合併；最高帳號登入時須在一致的 NCU identity 回傳 `details.identifier=115502532`。正式 SSO 流程需另行驗收。

## 4. 安裝 webhook 接收程式

```bash
sudo install -d -m 0755 /opt/dns-manager-deploy
sudo install -m 0644 /opt/dns-manager/deploy/webhook.mjs /opt/dns-manager-deploy/webhook.mjs
sudo install -m 0755 /opt/dns-manager/deploy/deploy.sh /opt/dns-manager-deploy/deploy.sh
sudo install -m 0640 -o root -g dnsdeploy /opt/dns-manager/deploy/webhook.env.example /etc/dns-manager/webhook.env
sudo install -m 0644 /opt/dns-manager/deploy/dns-manager-webhook.service /etc/systemd/system/dns-manager-webhook.service
```

編輯 webhook.env：`DEPLOY_REPOSITORY=fearnot221/dns-manager`、`DEPLOY_BRANCH=main`、確認絕對路徑，`WEBHOOK_SECRET` 用新的 `openssl rand -hex 32`。不要與 OAuth／session secret 共用。確認 service 中 Node 路徑（`command -v node`）及帳號符合主機設定。

先用相同帳號、相同 DEPLOY_* 環境變數手動執行 `/bin/bash /opt/dns-manager-deploy/deploy.sh` 驗證，再啟用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dns-manager-webhook
sudo journalctl -u dns-manager-webhook -f
```

公開 repo 的 HTTPS fetch 不需 token。若改成私人 repo，需另外配置唯讀 deploy key、驗證 GitHub SSH host key；程式不會接受新的 SSH host key 或互動式密碼。

## 5. GitHub webhook 設定

Repository → Settings → Webhooks → Add webhook：

- Payload URL：`https://你的正式網域/hooks/github`
- Content type：`application/json`
- Secret：與 server 的 `WEBHOOK_SECRET` 完全相同
- Events：Just the push event
- SSL verification：Enable
- Active：勾選

必須等 server HTTPS endpoint 已就緒再建立，不能以 localhost 作 GitHub webhook 目的地。檢查 ping 成功，push main 後確認 delivery 202、server journal 顯示 `Healthy deployment`，以及健康檢查正常。202 僅代表持久化排隊成功，不代表部署已成功。

流程：驗證 HMAC-SHA256 → 比對 repo／branch → 持久化排隊 → Git fetch + fast-forward → Docker lint/test/build → compose down（不刪 volume）→ compose up → 等待 DB / migration / web healthcheck。payload 不會提供 shell command，強制推送或 dirty checkout 的非 fast-forward 更新會失敗而不是覆蓋本機檔案。連續 push 串行執行；拉的是當時正式分支最新版本。

失敗請看 journal／Compose logs；修正後從 GitHub Recent deliveries 重送同一個失敗事件。已成功的 delivery ID 不重複執行；服務重啟會處理未完成的 queue。State directory 裡的 `.done`／`.failed` 是去重與結果紀錄，勿任意刪除。

## 6. 備份、更新與限制

部署不會 seed、刪除 volume、prune 或自動回退資料庫。升版前備份 PostgreSQL、PowerDNS backend 與 SETTINGS_ENCRYPTION_KEY，先在 staging 驗證 migration。新 web healthcheck 失敗時不宣稱成功，須由維運部署相容修正版／依備份還原；資料庫 migration 不會自動逆轉。down/up 會暫停網站與資料庫，不是零停機部署。

網站與 webhook receiver 分開管理：更新 receiver／host deploy script 需由維運檢查後重新 install 和 restart service。任何可改 Compose／Dockerfile 的正式分支寫入者都有能力影響主機，請啟用 GitHub 2FA、分支保護與審核。

Local demo 繼續使用 `npm run demo`；它不使用真實 Portal、資料庫或 PowerDNS。Docker 使用獨立 PostgreSQL，不會匯入 `.local-demo`、demo 帳密或本機申請紀錄。

參考：[GitHub webhook 簽章驗證](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)、[Compose 啟動順序](https://docs.docker.com/compose/how-tos/startup-order/)、[NCU Portal 介接](https://portal.ncu.edu.tw/about/howto)。
