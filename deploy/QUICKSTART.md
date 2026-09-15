# Ubuntu VM 快速安裝：dnsmgr.ce.ncu.edu.tw + 獨立 Caddy

適用於專用、全新 Ubuntu Server **22.04 或 24.04 LTS** VM（amd64 或 arm64，建議 4 vCPU / 8 GB RAM / 60 GB 磁碟）。腳本自動選擇 22.04 的 jammy 或 24.04 的 noble Docker 套件來源，既有 22.04 不必為此升級。需有 sudo、固定 RFC1918 內網 IPv4、可出站連線至 Ubuntu/Docker/Node/GitHub/NCU Portal。不是在 Proxmox host 或 CT 執行。

`ubuntu-22.04.x-live-server-amd64.iso` 是安裝媒體名稱；用它安裝到 VM 硬碟並重開機後即可部署。若仍在 Live ISO／安裝程式的暫存環境，請先完成系統安裝；腳本會拒絕 overlay／squashfs 根檔案系統，避免把正式服務放在暫存系統上。

## 1. VM 上安裝

### 已安裝的 VM：從舊網域遷移

如果已使用 `dns.ce.ncu.edu.tw` 安裝，不能只重跑 installer：它刻意保留既有 app.env。請先建立新網域 `dnsmgr.ce.ncu.edu.tw` 的 DNS，指向外部 proxy 的入口，並在外部 Caddy 加入本頁的新站台設定、確認 TLS；Portal 回呼也需同步改為本頁的新網址。

在既有 VM 上備份環境檔，再只修改 AUTH_URL（其他密鑰與資料庫設定不動）：

```bash
sudo cp -p --no-clobber /etc/dns-manager/app.env /etc/dns-manager/app.env.before-dnsmgr
sudo sed -i 's|^AUTH_URL=.*$|AUTH_URL=https://dnsmgr.ce.ncu.edu.tw|' /etc/dns-manager/app.env
curl -fL https://raw.githubusercontent.com/fearnot221/dns-manager/main/deploy/install-vm.sh -o install-dns-manager.sh
sudo env VM_IP=10.213.40.62 CADDY_IP=10.213.40.7 bash install-dns-manager.sh
```

此處 IP 是目前部署的 VM / proxy 位址。新版 installer 會同步內網 gateway 的 Host headers、webhook 註冊工具與外部 Caddy 範例，重建／啟動網站；不重設最高帳號或密鑰，不刪 volume。切換期間可能中斷登入，新網域需重新登入。

新網址可用後，若已有 GitHub webhook，在 GitHub Settings 將既有 Payload URL 改為 `https://dnsmgr.ce.ncu.edu.tw/hooks/github`，不要再加一個重複的 hook。也可執行第 3 節的註冊工具：新版會先驗證新入口，再把舊 `dns.ce.ncu.edu.tw` hook 更新到新網址。若新舊兩個 hook 都存在，工具會停止並要求先處理重複設定。

### 全新 VM

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates
curl -fL --proto '=https' --tlsv1.2 \
  https://raw.githubusercontent.com/fearnot221/dns-manager/main/deploy/install-vm.sh \
  -o install-dns-manager.sh
less install-dns-manager.sh
sudo bash install-dns-manager.sh
```

依提示輸入 **VM 內網 IP**、**Caddy 連到 VM 時的來源內網 IP**（若有 NAT，填轉換後的來源 IP）。腳本只支援 IPv4 RFC1918，其他網路配置需手動調整，不能填 `0.0.0.0`。

腳本會安裝 Docker Engine/Compose/Buildx、獨立 Node.js 22 runtime、專用 dnsdeploy 帳號、網站與 PostgreSQL、migration、最高帳號、獨立內網 Caddy gateway 與 systemd webhook 接收服務。Node tarball 會核對官方 HTTPS SHA256 manifest。原有 Docker 安裝會保留，若缺 plugin／套件衝突則停止，不會自動移除其他軟體。

固定目錄：

- `/opt/dns-manager`：main checkout，dnsdeploy 擁有；不要直接改正式 checkout。
- `/opt/dns-manager-deploy`：root 管理的 webhook／更新程式；不由 push 自行覆寫。
- `/opt/dns-manager-node`：host webhook 的獨立 Node runtime；不修改系統 Node。
- `/etc/dns-manager/app.env`、`webhook.env`：root:dnsdeploy 0640，密鑰不進 Git。
- `/var/lib/dns-manager-webhook`：持久化 queue、部署鎖與完成紀錄。

可以重跑本腳本恢復中斷的安裝，既有 env 密鑰與最高帳號不會重設。若有不是本腳本管理的同名目錄會停止，避免覆寫手動部署。重跑會更新 main、重裝受管理的 host scripts/gateway 設定並重啟服務；日常更新請用 `update-now.sh`，不要重跑 installer。已安裝的獨立 Node runtime 需另行維護安全更新。

若舊版停在 `compose-spec.json: stat .: permission denied`，這是切換 dnsdeploy 後繼承了私人家目錄，不是 Docker 安裝失敗。重新下載修正版 installer 再執行即可接續，無需刪目錄、重裝 Docker，或把自己的家目錄改成公開可讀。

若 PostgreSQL healthy，但 migrate 退出 243，且其 log 有 `EACCES`／無法讀取 `/app/package.json`，舊 Dockerfile 沒有處理 `umask 077` checkout 的檔案所有權。新版 builder 會以 node 擁有並建置程式及 Prisma 依賴。重跑 installer 會拉取修正版並重建、重試 migration；不要改成 root 跑 migration，也不要刪除 postgres_data volume。CI 會用 0600 檔案／0700 目錄的隔離 checkout 建置，再實測 migration、seed、down/up 與資料保留。

## 2. 在另一台 Caddy proxy 加入站台

腳本會在 VM 產生 `/etc/dns-manager/Caddyfile.external`。將其中的站台 block **合併**到既有 proxy Caddyfile，不要覆蓋其他站台。內容如下，替換 `VM_PRIVATE_IP`：

```caddyfile
dnsmgr.ce.ncu.edu.tw {
    reverse_proxy http://VM_PRIVATE_IP:8080
}
```

在 **proxy 主機** 上驗證再 reload（下例為 systemd 部署的 Caddy；容器部署請用其原有方式）：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

公開 DNS `dnsmgr.ce.ncu.edu.tw` 指向 **proxy 的對外服務位址**。TLS 憑證由既有 Caddy 管理；依其 ACME 設定開放 proxy 的 80/443 或使用 DNS challenge。VM 不需對外 IP 或憑證。

內網 ACL／防火牆僅允許 **Caddy → VM TCP 8080**；SSH 只給維運來源。腳本不會改防火牆或 SSH，避免斷線。VM gateway 另外用來源 IP allowlist 拒絕其他主機，網站 3000 與 webhook 9000 維持 loopback，PostgreSQL 不發布 port。Caddy→VM 的 HTTP 連線應置於受信任／隔離內網；若會跨不可信網段，先建立 VPN 或加 upstream TLS。

外部 Caddy → VM:8080 的 gateway → 本機 web:3000 或 `/hooks/github` → 本機 webhook:9000。VM gateway 用獨立 Compose project `dns-manager-ingress` 執行，網站 down 時它和 host webhook service 都不會被停掉。它不是第二個對外 proxy，只提供內網來源限制與路徑分流。

驗證 `https://dnsmgr.ce.ncu.edu.tw/login` 可正常開啟。若 403，核對 Caddy 實際來源 IP；若 502，檢查 VM 網路／容器狀態；若連線逾時，檢查 ACL、DNS 和路由。

## 3. 一次性註冊 GitHub webhook

建立短效 **fine-grained PAT**：resource owner `fearnot221`，只選 `dns-manager`，Repository permissions → **Webhooks: Read and write**。不要使用長期全權 token，也不要把 token 貼進指令或對話。

在 VM 執行：

```bash
sudo /opt/dns-manager-deploy/register-webhook.sh
```

Token 以隱藏輸入讀取，只透過 stdin 傳入註冊程式，不存檔、不傳給網站、不傳給部署子程序。它會先對 `https://dnsmgr.ce.ncu.edu.tw/hooks/github` 送有簽章的 ping，確認 Caddy/DNS/TLS/receiver 真正連通，再建立或更新同網址的 push webhook（TLS 驗證開啟）。完成後可立即撤銷 PAT，不影響以後的 public repo fetch 或 webhook 驗章。

不想用 PAT，可手動在 GitHub → Repository Settings → Webhooks 新增：

- Payload URL：`https://dnsmgr.ce.ncu.edu.tw/hooks/github`
- Content type：`application/json`
- Secret：VM `/etc/dns-manager/webhook.env` 的 `WEBHOOK_SECRET`（不要公開）
- Just the push event；Active；Enable SSL verification

**只有 main 的 push 會部署**，其他分支與刪除事件忽略。流程：HMAC 驗證 → repo/branch 比對 → 持久化排隊 → fetch/fast-forward 最新 main → lint/test/build → `docker compose down --timeout 30` → `docker compose up -d --wait --wait-timeout 180` → DB migration / web 健康檢查。

build 失敗不會執行 down；down/up 會短暫中斷網站和資料庫，但不使用 `-v`、不刪 volume、不自動 seed。連續 push 會串行處理，部署的是 fetch 時 main 的最新版本，不承諾每個中間 commit 都上線。正式 checkout dirty 或歷史被 force-push 成非 fast-forward 時會安全停止。

首次設定後，push 一個真正要部署的 main 更新，確認 GitHub Recent deliveries 收到 202，並在 VM 查看：

```bash
sudo journalctl -u dns-manager-webhook -f
sudo cat /var/lib/dns-manager-webhook/last-successful-commit
curl -f https://dnsmgr.ce.ncu.edu.tw/healthz
```

**202 只代表接受排隊，不代表部署完成**；要看到 journal 的 `Healthy deployment` 及 healthz 成功。註冊腳本只驗證連通並建立 webhook，尚未代替這次真實 push 驗收。GitHub delivery 若因網路故障未送到 VM，或 `.failed` 部署失敗，修正問題後需在 Recent deliveries 按 Redeliver；不宣稱任何網路／磁碟故障下都能無人介入。已成功的 delivery 不會重複部署。

## 4. 最高帳號、Portal 與 PowerDNS

全新安裝的 bootstrap 登入地址為 `owner-bootstrap@accounts.invalid`，只用於初始帳密登入，地址本身沒有授權效果。既有帳號不改 email；最高權限直接以經驗證的 NCU identity `details.identifier=115502532` 判斷，不要求舊帳號綁定或原有角色（見 [Logto 設定](LOGTO.md)）。初始密碼是獨立隨機值，不是 demo 密碼：

```bash
sudo cat /etc/dns-manager/initial-owner-password
sudoedit /etc/dns-manager/app.env
```

將密碼保存至安全的密碼管理器後，刪除這一個交付檔即可（勿刪 app.env）。seed 成功後 env 裡的 `OWNER_INITIAL_PASSWORD` 會清空，不再傳給後續容器。

安裝程式**無法代填 Logto Secret**。請依 [Logto 切換指南](LOGTO.md) 填入 `AUTH_LOGTO_ID`、`AUTH_LOGTO_SECRET` 並綁定既有帳號。`identities` 必須由 Logto UserInfo 回傳，不是 env 設定：

- 重定向 URI：`https://dnsmgr.ce.ncu.edu.tw/api/auth/callback/logto`
- 登出後重定向 URI：`https://dnsmgr.ce.ncu.edu.tw/login`
- Scopes：`openid identities`；唯一額外 UserScope 為 `identities`，User ID 不可直接猜測為學號。

PowerDNS 僅從 `/etc/dns-manager/app.env` 的 `PDNS_API_URL`、`PDNS_API_KEY`、`PDNS_SERVER_ID` 讀取，網址須以 `/api/v1` 結尾。後台連線表單已移除，資料庫中的舊設定不再使用。升級前請將連線設定填入 env；修改後重新建立 web 容器（單純 restart 不會載入新 env）。API 不要對外暴露。

Portal 已移除白名單限制：任何通過 Portal 驗證並授權已驗證 Email 的使用者，首次登入會自動建立一般帳號。管理員須由最高使用者於「使用者管理」手動指派，不根據 Email 網域或 Portal 欄位自動升權。建議先讓本人登入，再指派該帳號；同 Email 的既有帳密帳號不會自動合併，以免冒用既有權限。停用帳號仍不能使用。舊白名單資料保留但不再作用。帳密測試登入仍可使用；測試後可設 `AUTH_PASSWORD_LOGIN_ENABLED=false` 並重新建立 web 容器關閉。

建立一般測試帳號（只在需要時執行，不會隨 push 自動建立）：

```bash
cd /opt/dns-manager
sudo env DEPLOY_TAG="$(git rev-parse HEAD)" docker compose --project-name dns-manager --env-file /etc/dns-manager/app.env -f /opt/dns-manager/docker-compose.yml run --rm --no-deps migrate npx tsx scripts/create-test-user.ts
```

帳號為 `dns-test@example.invalid`，密碼現場隨機產生並只輸出一次，角色固定為 USER。如果帳號已存在則拒絕覆寫。請保存密碼，測試後在使用者管理停用；密碼不會寫入 GitHub。此命令須在新版部署成功後執行。

登入延遲診斷：`docker logs --since 10m dns-manager-web-1 2>&1 | grep portal-timing`。同一 requestId 的 `token`、`userinfo` 為 Portal 請求（含回應內容）的耗時，`callback` 為網站回呼整體耗時（毫秒），不含使用者在 Portal 頁面停留的時間。紀錄不含授權碼、token 或使用者資料。最後登入時間於回應送出後更新；身分、停用及權限檢查仍同步完成。

修改 app.env 後立即套用：

```bash
sudo /opt/dns-manager-deploy/update-now.sh
```

這也使用同一把部署鎖和 down/up 流程，不用為環境變數變更假造 Git commit。它會拉 main 的最新版本，故執行前確認該分支已準備好上線。

## 備份與故障處理

正式資料必須另設 PostgreSQL 邏輯備份、VM 備份及備份還原驗證；本腳本不代建遠端備份。密鑰（尤其 `SETTINGS_ENCRYPTION_KEY`）、資料庫及 PowerDNS backend 都需安全備份。migration 不會自動逆轉，up 失敗可能讓網站停機，請修正後重送／手動部署相容版本，不要 `down -v` 或任意更換資料庫／加密密鑰。

dnsdeploy 的 Docker 權限等同高權限；限制 repo 寫入者、SSH，啟用 GitHub 2FA／main 保護。Server 會在 build 時跑 lint/test，但不等待 GitHub Actions；需要審核請保護 main，讓 merge 前 CI 必須通過。舊 image/build cache 不會自動 prune；定期檢查磁碟用量，避免無空間使更新失敗。

參考：[Docker Ubuntu 安裝](https://docs.docker.com/engine/install/ubuntu/)、[Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)、[GitHub Webhooks API](https://docs.github.com/en/rest/repos/webhooks)。
