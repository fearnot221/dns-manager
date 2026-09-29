# Security remediation record

日期：2026-09-30。修正基準 commit：`b0de6fde39b1816569533568166f01dddcd58f18`，目前為未提交的 working tree。
驗證來源指紋（所有變更／新增的非 Markdown 檔案，依 path 排序後以 `path + NUL + bytes + NUL` 計算 SHA-256）：`4d43f2b50074af0337bef628b82be3def4e64ef0231eb886740477f4abd8ef5c`。

本次依使用者授權修正原稽核的九項漏洞／防禦不足，保留帳密與 Logto 登入、DNS 管理、單位功能、批次申請、歷史個人申請審查與人工部署。安全限制會拒絕越權、過量操作或重播，不保留這些不安全行為。**沒有 push、部署、更新正式 Caddy/webhook service、改動正式 DB/DNS 或啟動 local demo。**

## 修正對照

| Finding | 已實作 | 功能與驗證 |
| --- | --- | --- |
| SEC-01 | Actor 保留 direct/group scope 與 type；record API、zone detail/count、inventory、request list/review 按物件授權；exact FQDN 或 leading `*.` DNS-label wildcard；新增 grant 正規化並拒絕其他 wildcard | unrestricted/global ADMIN 行為保留。混合 scoped ADMIN + scope 外 EDITOR 不能藉最高 zone role 讀寫／刪除 scope 外資料；group grants 保留且 expiry 在 DB lookup 過濾。只有完整 zone ADMIN 能改全 zone 申請開關，UI 顯示不可操作。 |
| SEC-02 | DB 原子固定視窗、HMAC account key、global budget、過期鍵清理；不存在／disabled 帳號仍執行同成本 scrypt | 登入方式與 provider default 保留。每帳號 10 次／15 分鐘、全站 300 次／分鐘，成功亦計次；Logto 不受影響。限流在昂貴 hash 前、global 耗盡後不建立任意新 account keys；UTC DB clock 避免時區偏差。 |
| SEC-03 | 可設定 batch/pending/24h 筆數與 byte budget；unit lock 內檢查所有 CREATE/UPDATE/DELETE 申請；儲存包含快照的 byte 估算；先 unit 授權再讀 PDNS；keyset 分頁和 server 搜尋／scope／status／unit filters | 1,001 筆批次測試保留。每頁 100 筆且所有歷史可翻頁；status counts 由 server 統計，非只計本頁。兩並發請求不能突破配額；已拒絕的 request 仍計入 24h budget。沒有刪除既有資料，retention 為後續維運政策。 |
| SEC-04 | signed raw body SHA-256 作 job key；delivery ID 只作 metadata；成功／pending 去重；每 signed event 至多三次失敗嘗試；attempt metadata atomic rename | 換 unsigned UUID 無法重複 deploy。失敗可有界 redelivery，超過後須人工檢查。仍消費 legacy UUID jobs；人工 full-stack restart 流程保留；健康且 commit 未變的 webhook 重播會 no-op。 |
| SEC-05 | APPROVE/REJECT 同 request row lock；鎖內重新讀 PENDING 與 actor；APPROVE 取得同交易 DNS advisory lock；final transition 在鎖內 | 未停止歷史個人申請功能。兩 reviewer 在相同 PENDING snapshot 的 barrier 測試得到一個 200、一個 409，DNS 與最終狀態一致；unit review 舊有整合測試通過。 |
| SEC-06 | request/response 同一隨機 nonce CSP；所有 documents 包括 login/errors/dns 覆蓋；root layout dynamic rendering；nonce 傳給 next-themes；object-src none | production script-src 移除 unsafe-inline，development 保留必要 unsafe-eval；styles 原有 inline 支援保留。代理 nonce 替換、fresh nonce、theme SSR script 測試與 production build 通過。另對敏感 response 加 private,no-store。瀏覽器 hydration／導覽仍需授權 staging 驗證。 |
| SEC-07 | Caddy/Nginx HTTPS 範例與 QUICKSTART 加 HSTS max-age=31536000 | 未擅自加入 includeSubDomains/preload，避免影響其他站台；實際 external Caddy 要由維運者另行套用與驗證。 |
| SEC-08 | Next 與 eslint-config-next 同步升到 16.3.7，更新 lockfile | production build 與全部測試通過，npm audit 0 vulnerabilities。原 RCE 必要入口未新增；安全公告：[Next 官方 advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j)。 |
| SEC-09 | migrate 後執行 runtime-db provision；獨立 dns_app（NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS/NOINHERIT）；固定角色、generated hex 密碼；不授 migration table 修改或 schema CREATE；web 僅掛 readonly DSN file | 原 admin/migration URL、資料表所有權、既有 env 與資料保留；runtime 密碼由 admin 隨機密碼 HMAC 派生，web 不取得 admin 密碼。真實隔離 DB 驗證角色 flags、重複 provisioning、CRUD、session/limiter 及無 schema CREATE／migration UPDATE 權限。 |

## 配額與升級

| 環境變數 | 預設 |
| --- | --- |
| DNS_APPLICATION_MAX_RECORDS | 5,000／份 |
| DNS_UNIT_MAX_PENDING_RECORDS | 50,000／單位 |
| DNS_UNIT_MAX_DAILY_RECORDS | 100,000／單位／最近 24h |
| DNS_UNIT_MAX_PENDING_BYTES | 33,554,432（32 MiB）／單位 |
| DNS_UNIT_MAX_DAILY_BYTES | 67,108,864（64 MiB）／單位／最近 24h |

bytes 估算 request rows 與 snapshots，另保留 metadata overhead；限制申請儲存增長速率，**不是整個 DB 的硬 disk quota**。Audits、approved metadata 與備份仍需容量監控和 retention/archive 設計，不能擅自刪使用者歷史。使用者原有合法批次可分批提交，operator 可按實際使用量調整五個安全預算；既有過量 pending 不會被刪除。

新增 migration `20260930000000_security_budgets`（限流表、request unit/date 索引）已在 disposable DB 演練。正式部署需先依原維運流程備份並執行 migration；本次未執行正式部署。Compose 會依 `postgres → migrate → runtime-db → web` 啟動；seed 仍為 maintenance profile。runtime-db 工具使用 root + CHOWN 來產生僅 UID 1000 可讀的 DSN file，無 host／Docker socket mount；tools image 有獨立可讀的 top-level provision entry 與 Node package metadata，支援 installer 的 0600/0700 checkout。發現既有 dns_app 有其他 role memberships 或 public table ownership 時拒絕自動覆寫，需維運確認。若舊 `aegis` bootstrap 角色已被人工降權到不能建立角色，provision 也會 fail-closed；維運者需在隔離 DB 先演練合法一次性 bootstrap 權限，不能假設 Compose 會自動修正現役 grants。

Webhook 程式原本複製到 checkout 外，需按既有方式更新/restart service；HSTS 也需更新獨立 external Caddy。新 queue 同時處理 old UUID/new digest filenames；old completed UUID marker 沒有 raw body，無法回推歷史 digest，但 webhook 在相同 checkout commit 已健康部署時會 no-op，避免再次重啟。未清除任何舊 queue 或正式資料。所有進行中的失敗需看 journal，再決定人工部署，不以無限重試代替修復。

## 驗證紀錄

隔離 DB 為本次新建、loopback-only、隨機 port 的 PostgreSQL 15 instance 與 `dns_units_test`，PowerDNS/部署/IdP 均為 mock 或 fixture。測試未連 production。CI 已加入 PostgreSQL 17 service 與 migration 步驟，使 DB 整合測試之後不再因缺少測試 URL 而跳過；此次尚未觸發 GitHub CI。

| 指令／方式 | 結果／對應狀態 |
| --- | --- |
| `DATABASE_URL=<isolated> npx prisma migrate deploy` | 21 個 migration 全部成功；與本次 schema 對應 |
| `UNIT_TEST_DATABASE_URL=<isolated> npm test` | 最終修正來源：60 files，416 tests passed，沒有 skipped |
| 隔離 DB 改為 SCRAM 後重跑 `runtime-database.integration.test.mjs` | 1 test passed；驗證派生密碼確實可以登入，非僅 trust authentication |
| `npm run lint` | 最終修正來源：passed |
| `npm run build` | 最終修正來源：passed（包含 TypeScript，Next 16.3.7）；所有 documents dynamic，未啟動 app |
| `npm audit --json --ignore-scripts` | exit 0，0 vulnerabilities；registry metadata total 583 |
| `docker compose --env-file /dev/null config --quiet`（合成 fixture env） | schema/interpolation passed；未啟動 containers |
| `bash -n deploy/install-vm.sh deploy/deploy.sh deploy/register-webhook.sh deploy/update-now.sh` | passed；沒有執行 installer/deploy |
| `git diff --check` 與文件 path/reference 檢查 | passed |

新增／擴充的測試涵蓋 shared limiter race/expiry/timezone、quota record/byte race、跨使用者 scope 外 PII、scope 外 DNS/metadata/delete、全歷史分頁／全列表搜尋、legacy approve/reject race、nonce spoof/rotation/theme SSR、signed webhook replay/retry/legacy queue、runtime DB privileges。原有登入、單位管理、DNS CRUD、安全刪除、owner 保護、申請與部署測試也全部通過。不是宣稱所有 49 個手動動態測試都已執行。

尚未執行：Docker image/Compose down-up 實跑（本機 Docker daemon 未啟動）、Caddy binary validate（本機無 binary）、瀏覽器 hydration/完整登入/logout、真實 Logto tenant 設定、VM deployment/production headers/真實 DNS。沒有為此啟動 local demo、Docker daemon 或既有 PostgreSQL service。上述限制與 [動態測試計畫](SECURITY_TEST_PLAN.md) 保留；不保證 production 在尚未部署／驗證時已修復。

## 尚未能以本次 code fix 消除的假設

Logto connector provenance／delegation／MFA（H-01）、session absolute lifetime 政策、PowerDNS/DB 故障後的跨系統 reconciliation（H-03）、完整 log/history/image secrets 與 cache/browser 實測仍需既有計畫確認。沒有把它們冒充已成立漏洞，也沒有猜測第三方設定或移除登入功能來迴避。先完成本次 source 修正，正式 rollout 與外部設定需明確目標及授權。
