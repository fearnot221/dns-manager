# 遠端 VM：將專案集中至 /home/snmg

這是**遠端 Ubuntu server** 的停機搬遷指南，不搬動本機開發工作目錄。本文命令尚未替你在正式主機執行。適用於舊 installer 的 `/opt/dns-manager`、`/etc/dns-manager`、dnsdeploy 與 Compose project `dns-manager`；自訂安裝先核對實際路徑及掛載，不能直接套用。

## 新配置與範圍

| 路徑 | 內容／擁有者 |
| --- | --- |
| `/home/snmg` | root:root，0755；不是可由一般帳號任意寫入的 home |
| `dns-manager/` | Git checkout，dnsdeploy |
| `config/` | app.env、webhook.env、gateway 設定；root:dnsdeploy，0750；密鑰 0640 |
| `deploy/` | root 管理的部署程式、systemd service 本體 |
| `node/` | 專案 webhook 的 Node runtime |
| `data/postgres/` | PostgreSQL 資料；由容器維護其數字 UID，不能遞迴 chown 成 dnsdeploy |
| `state/webhook/` | queue、鎖、成功 commit 及 service.log，dnsdeploy，0700 |
| `state/tmp/`、`service-home/` | 部署暫存與 dnsdeploy home |
| `backups/`、`legacy/` | 搬遷備份與待清理舊檔，root，0700 |

systemd 的註冊／enable symlink 仍由 `/etc/systemd/system` 管理，檔案本體在 `/home/snmg/deploy`。Ubuntu 套件設定、Docker daemon／image cache／容器日誌、system journal、另一台外部 Caddy 及外部 PowerDNS 不搬移。容器內的 `/etc/caddy`、`/var/lib/postgresql/data` 是容器路徑，不是主機專案檔案散落。

Compose 新增 `POSTGRES_DATA_DIR`。新安裝設定 `/home/snmg/data/postgres`；**未設定時沿用原本 named volume**，避免既有 server 收到 main push 就換成空資料庫。只有完成下面資料複製後，才在新版 env 設定此變數。單純 Git push 不會自動搬家。

## 1. 準備與核對（遠端 VM）

安排維護時段，暫停 GitHub push／手動更新。先完成 VM 快照與可還原的 PostgreSQL／設定備份，並封鎖入口或安排使用者停止寫入；外部 PowerDNS 操作也應暫停。確認新版本程式已到舊 checkout、工作樹乾淨；Docker 有足夠空間同時保留舊 volume 與新資料副本。

以下各區塊在**同一個遠端 root Bash** 中執行，變數要保留；任一步失敗先停下排查，不要跳過檢查或刪除舊資料。不要對整個 `/home/snmg` 遞迴 chown。

```bash
sudo bash
set -Eeuo pipefail
umask 077
cd /
old_repo=/opt/dns-manager
old_env=/etc/dns-manager/app.env
old_state=/var/lib/dns-manager-webhook
# 此程序要求尚未有新版專案目錄；已有內容不能覆寫。
[[ ! -e /home/snmg && ! -L /home/snmg ]] || { echo '/home/snmg 已存在，請先核對，勿覆寫'; exit 1; }
[[ -f "$old_repo/deploy/MIGRATION-HOME.md" && -f "$old_env" ]]
[[ -z $(runuser -u dnsdeploy -- git -C "$old_repo" status --porcelain) ]]
exec 9>"$old_state/deploy.lock"
flock -n 9 || { echo '部署正在執行，請等待完成後再重試'; exit 1; }
systemctl stop dns-manager-webhook
old_compose=(docker compose --project-name dns-manager --env-file "$old_env" -f "$old_repo/docker-compose.yml")
old_db=$("${old_compose[@]}" ps -q postgres)
[[ -n "$old_db" ]]
old_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{if eq .Type "volume"}}{{.Name}}{{end}}{{end}}{{end}}' "$old_db")
[[ -n "$old_volume" ]] || { echo '不是預期的 named volume，停止並核對原掛載'; exit 1; }
docker volume inspect "$old_volume" >/dev/null
old_web_image=$(docker inspect --format '{{.Config.Image}}' "$("${old_compose[@]}" ps -q web)")
install -d -m 0755 /home/snmg /home/snmg/state /home/snmg/data
install -d -m 0700 /home/snmg/backups /home/snmg/legacy
printf '%s\n' "$old_volume" > /home/snmg/backups/original-volume
printf '%s\n' "$old_web_image" > /home/snmg/backups/original-web-image
cp -a "$old_env" /home/snmg/backups/original-app.env
cp -a "$old_repo/docker-compose.yml" /home/snmg/backups/original-compose.yml
"${old_compose[@]}" exec -T postgres pg_dump -U aegis -d aegis_dns -Fc > /home/snmg/backups/database.dump
[[ -s /home/snmg/backups/database.dump ]]
"${old_compose[@]}" exec -T postgres psql -U aegis -d aegis_dns -tAc \
  'SELECT (SELECT count(*) FROM "User"), (SELECT count(*) FROM "DnsUnit"), (SELECT count(*) FROM "DnsRecordRequest"), (SELECT count(*) FROM "DnsRecordMetadata");' \
  > /home/snmg/backups/counts-before
```

`database.dump` 是停機前額外備份；正式搬移來源是下一步停止 PostgreSQL 後的完整 volume。沒有更改資料庫密碼、AUTH_SECRET、加密密鑰或登入帳號。

## 2. 複製程式及設定

```bash
cp -a /opt/dns-manager /home/snmg/dns-manager
cp -a /etc/dns-manager /home/snmg/config
cp -a /opt/dns-manager-node /home/snmg/node
cp -a /var/lib/dns-manager-webhook /home/snmg/state/webhook
cp -a /var/lib/dnsdeploy /home/snmg/service-home
install -d -m 0700 -o dnsdeploy -g dnsdeploy /home/snmg/state/tmp
install -d -m 0755 -o root -g root /home/snmg/deploy
for file in deploy.sh webhook.mjs register-webhook.sh register-webhook.mjs update-now.sh; do
  install -m 0755 -o root -g root "/home/snmg/dns-manager/deploy/$file" "/home/snmg/deploy/$file"
done
install -m 0644 /home/snmg/dns-manager/deploy/dns-manager-webhook.service /home/snmg/deploy/dns-manager-webhook.service
# 只替換已知部署路徑；不重新生成 secret。
sed -i \
  -e 's|/opt/dns-manager-deploy|/home/snmg/deploy|g' \
  -e 's|/opt/dns-manager|/home/snmg/dns-manager|g' \
  -e 's|/etc/dns-manager|/home/snmg/config|g' \
  -e 's|/var/lib/dns-manager-webhook|/home/snmg/state/webhook|g' \
  /home/snmg/config/webhook.env
# 這時僅設定新 env；舊 stack 繼續使用舊 env。
if grep -q '^POSTGRES_DATA_DIR=' /home/snmg/config/app.env; then
  echo '已有自訂資料路徑，停止並核對'; exit 1
fi
printf '\nPOSTGRES_DATA_DIR=/home/snmg/data/postgres\n' >> /home/snmg/config/app.env
install -m 0644 /home/snmg/dns-manager/deploy/ingress-compose.yml /home/snmg/config/ingress-compose.yml
cd /home/snmg/dns-manager
export DEPLOY_TAG
DEPLOY_TAG=$(runuser -u dnsdeploy -- git rev-parse HEAD)
new_compose=(docker compose --project-name dns-manager --env-file /home/snmg/config/app.env -f /home/snmg/dns-manager/docker-compose.yml)
"${new_compose[@]}" config --quiet
# build 成功後才停機。不要執行 seed。
"${new_compose[@]}" build --pull web migrate
```

若 `/var/lib/dnsdeploy` 不存在，先以 `getent passwd dnsdeploy` 確認原 home，不要猜測或複製其他人的 home。新 `/home/snmg/config` 沿用舊密鑰與 gateway IP，沒有覆寫外部 Caddy。

## 3. 停機複製資料、切換服務

```bash
"${old_compose[@]}" down --timeout 30
# down 不可加 -v。確定舊 PostgreSQL 已停止，再複製完整資料。
install -d -m 0700 /home/snmg/data/postgres
[[ -z $(ls -A /home/snmg/data/postgres) ]]
docker run --rm --network none --user 0:0 --entrypoint sh \
  -v "$old_volume:/source:ro" -v /home/snmg/data/postgres:/destination \
  postgres:17-alpine -ec 'cp -a /source/. /destination/; chown "$(stat -c %u:%g /source)" /destination; chmod 700 /destination'
[[ -f /home/snmg/data/postgres/PG_VERSION ]]
[[ $(cat /home/snmg/data/postgres/PG_VERSION) == 17 ]]
"${new_compose[@]}" up -d --wait --wait-timeout 180
"${new_compose[@]}" exec -T postgres psql -U aegis -d aegis_dns -tAc \
  'SELECT (SELECT count(*) FROM "User"), (SELECT count(*) FROM "DnsUnit"), (SELECT count(*) FROM "DnsRecordRequest"), (SELECT count(*) FROM "DnsRecordMetadata");' \
  > /home/snmg/backups/counts-after
diff -u /home/snmg/backups/counts-before /home/snmg/backups/counts-after
curl -fsS http://127.0.0.1:3000/healthz
# 原 Node override 會覆蓋新版 ExecStart，必須一併移出。
systemctl disable dns-manager-webhook
mv /etc/systemd/system/dns-manager-webhook.service /home/snmg/backups/old-webhook.service
if [[ -d /etc/systemd/system/dns-manager-webhook.service.d ]]; then
  mv /etc/systemd/system/dns-manager-webhook.service.d /home/snmg/backups/old-webhook.service.d
fi
usermod --home /home/snmg/service-home dnsdeploy
systemctl link /home/snmg/deploy/dns-manager-webhook.service
systemctl daemon-reload
systemctl enable dns-manager-webhook
docker compose --project-name dns-manager-ingress -f /home/snmg/config/ingress-compose.yml \
  run --rm --no-deps ingress caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --project-name dns-manager-ingress -f /home/snmg/config/ingress-compose.yml up -d --force-recreate
```

容器的 `cp -a` 保留 PostgreSQL 數字 UID；不要把資料檔改成 root 或 dnsdeploy。以上使用 PostgreSQL 17，若原本版本不同請停止，不能用目錄複製進行跨大版本升級。完成後核對實際登入、單位、DNS 及申請歷史；列數相同只是基本檢查，不是完整資料驗證。

## 4. 驗收後收納舊路徑

核對 service 檔案使用 `/home/snmg/config/webhook.env`、新 DB 掛載及新 gateway 後，才將舊檔收進專案備份。原 named volume 留作暫時回復來源，驗收及備份保留期結束後再由維運明確刪除，本文不自動刪除 volume。

```bash
mv /opt/dns-manager /home/snmg/legacy/repository
mv /etc/dns-manager /home/snmg/legacy/config
mv /opt/dns-manager-deploy /home/snmg/legacy/deploy
mv /opt/dns-manager-node /home/snmg/legacy/node
mv /var/lib/dns-manager-webhook /home/snmg/legacy/webhook
mv /var/lib/dnsdeploy /home/snmg/legacy/service-home
flock -u 9
exec 9>&-
systemctl start dns-manager-webhook
systemctl is-active --quiet dns-manager-webhook
tail -n 50 /home/snmg/state/webhook/service.log
```

日後更新使用 `/home/snmg/deploy/update-now.sh`。檢查真實 GitHub webhook delivery 與 `state/webhook/last-successful-commit`，202 不代表健康部署。

## 失敗回復

不要刪舊 named volume，也不要在原資料庫上重新 seed。若新 stack 失敗，停止新 stack；使用備份中的原 env、Compose、原 image tag 與原 named volume 恢復原部署，並恢復原 systemd service／override、gateway 與 dnsdeploy home。已在新系統接受寫入後，舊 volume 不含這些新增資料，不能直接切回；先停寫並由維運選擇保留／回填方式。Migration 不自動逆轉，不能用任意舊 image 啟動已升級資料。

本指南不替代遠端演練；在未完成上述驗收前，只能說 repository 已準備好新架構，不能說正式 server 已搬遷。


## 此版本的驗證紀錄

- `npm run build`（含 TypeScript）、`npm run lint` 與 `git diff --check` 通過。
- `UNIT_TEST_DATABASE_URL=… npm test`：隔離 PostgreSQL 與假的 PowerDNS，57 個檔案、396 項測試通過，包含 webhook 簽章、排隊與失敗部署流程。
- `bash -n` 驗證部署腳本及本文件命令區塊；README／部署文件相對連結與 MIT metadata 檢查通過。
- `docker compose --env-file /dev/null -f docker-compose.yml config --format json` 用測試環境值驗證：未設定 POSTGRES_DATA_DIR 使用 named volume，設定後使用 `/home/snmg/data/postgres` bind mount。
- 本機 Docker daemon 未啟動，未執行容器啟動／實際 volume 複製／Linux systemd 測試；未啟動 local demo，也未連線或搬遷正式 server。上述驗證不代表遠端搬遷成功。
