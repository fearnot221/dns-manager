# NCUEECESNMG DNS Manager

以單位為核心的 PowerDNS Authoritative 管理系統，整合 DNS 申請、審核、歸屬清查與變更復原。成員透過申請維護單位 DNS，管理員集中管理網域與權限，操作保留稽核紀錄。

**技術組成：** Next.js 16 · React 19 · TypeScript · Auth.js · Prisma 6 · PostgreSQL · PowerDNS

[功能與權限](#功能與權限) · [遠端部署](#遠端部署) · [開發與驗證](#開發與驗證) · [文件](#文件) · [MIT License](LICENSE)

## 功能與權限

| 功能 | 說明 |
| --- | --- |
| 單位管理 | 系統管理員建立、改名、刪除單位，透過學號指定管理人；建立後立即生效 |
| 使用者管理 | 單位管理員以學號加入使用者，調整角色或移出單位；尚未註冊者於登入後加入 |
| DNS 申請 | 多筆、跨開放網域申請；每筆用途必填、備註選填，由系統管理員逐筆審核 |
| DNS 管理 | 整合網域、紀錄維護與清查；domain 頁籤涵蓋正解／反解，支援以 `@` 搜尋根網域 |
| DNS 清查 | 聯絡資料、用途、歸屬與清查歷史在同一表單；關閉後於同頁重開可繼續填寫 |
| 變更復原 | 查看本系統新增、修改、刪除 DNS 的紀錄；條件符合時可一鍵復原 |
| 稽核與匯出 | 操作前後差異、申請歷程，以及含歸屬與清查資料的全部 DNS CSV 匯出 |

### 單位角色

| 角色 | 清查與送出申請 | 管理單位使用者 |
| --- | --- | --- |
| 成員 | ✓ | — |
| 管理員 | ✓ | ✓ |

未加入有效單位不能申請 DNS。單位角色不授予直接修改 PowerDNS 或審核申請的權限；單位申請由**系統管理員**核准。系統、網域與單位權限各自獨立，完整規則見 [權限表](docs/access-matrix.md)。

申請必填姓名、有效電子郵件、分機及每筆 DNS 用途，所屬單位由目前工作區決定。送出與核准時都會重新驗證資格及 DNS 狀態。移除成員會撤銷加入資格，並保護最後一位可登入管理員。

### 主要入口

| 路徑 | 頁面 |
| --- | --- |
| `/dns` | 單位 DNS |
| `/requests/new` | 申請 DNS |
| `/requests` | 申請紀錄／申請審核 |
| `/units` | 單位管理 |
| `/zones` | DNS 管理與清查 |
| `/admin/application-policy` | 申請規則與網域開放設定 |
| `/admin/deletion-protection` | DNS 刪除保護（最高管理員設定密碼） |
| `/admin/users` | 帳號管理 |
| `/activity` | 操作紀錄 |

側欄依權限顯示功能；只有多個實際單位成員資格才顯示工作區切換。系統管理員可在單位管理查看各單位使用者及 DNS。舊 `/inventory` 與 `/zones/[zone]` 入口轉至整合的 DNS 管理頁。

## 遠端部署

正式環境採用 **Ubuntu VM + Docker Compose + 獨立 Caddy**。PowerDNS 為外部服務，Compose 提供網站、migration 與 PostgreSQL，不建立 PowerDNS 伺服器。

```text
瀏覽器 ── HTTPS ── 外部 Caddy ── 私有網路 ── VM gateway :8080
                                            ├─ Next.js :3000
                                            │    ├─ PostgreSQL
                                            │    ├─ PowerDNS REST API
                                            │    └─ Logto OIDC
                                            └─ /hooks/github → webhook :9000
```

網站與 webhook 僅綁定 VM loopback；PostgreSQL 不發布 host port。Gateway 限制外部 Caddy 的來源 IP，PowerDNS API 經受限制的私有路徑存取。

### 安裝與搬遷

- **新 server：** 使用 [Ubuntu VM 快速安裝指南](deploy/QUICKSTART.md)。
- **既有 server：** 先閱讀 [搬遷至 /home/snmg](deploy/MIGRATION-HOME.md)，安排備份及停機，再切換資料路徑。
- **日常維運：** 見 [部署、webhook 與備份指南](deploy/README.md)。

新版部署將專案檔案集中於遠端 `/home/snmg`，不要求搬動本機開發目錄：

```text
/home/snmg/
├── dns-manager/       # Git checkout
├── config/            # 環境變數、密鑰與 gateway 設定
├── deploy/            # 部署工具及 systemd service 本體
├── node/              # Webhook 使用的 Node runtime
├── data/postgres/     # PostgreSQL 資料
├── state/             # 部署佇列、鎖、日誌與暫存
└── service-home/      # 部署帳號的 home
```

Docker／Ubuntu 系統資料維持原位；systemd 在系統目錄保留服務註冊連結。舊安裝未設定 `POSTGRES_DATA_DIR` 時繼續使用原 named volume，**Git push 不會自動搬遷資料**，不可直接改指向空白資料夾。

### 設定與更新

環境設定範本為 [deploy/app.env.example](deploy/app.env.example)，正式密鑰放在 `/home/snmg/config/app.env`，不放進 Git。

| 設定 | 用途 |
| --- | --- |
| `POSTGRES_PASSWORD`、`POSTGRES_DATA_DIR` | Compose 資料庫密碼及儲存位置 |
| `AUTH_URL`、`AUTH_SECRET` | 對外 HTTPS 網址與固定 session 密鑰 |
| `AUTH_LOGTO_ID`、`AUTH_LOGTO_SECRET` | Logto 登入設定 |
| `PDNS_API_URL`、`PDNS_API_KEY`、`PDNS_SERVER_ID` | 僅伺服器使用的 PowerDNS 連線；URL 以 `/api/v1` 結尾 |
| `PDNS_MOCK` | 正式環境設為 `false` |
| `AUTH_PASSWORD_LOGIN_ENABLED` | 測試帳密登入開關 |
| `SETTINGS_ENCRYPTION_KEY` | 保留既有持久密鑰，升級時不任意更換 |
| `OWNER_INITIAL_PASSWORD` | 僅首次初始化帳號使用 |

完成 webhook 設定後，main push 會觸發建置，再以 Compose down/up 更新，保留資料並先執行 migration。部署會短暫中斷服務，不會自動回退資料庫。Webhook 回應 `202` 只代表排隊成功；需確認 `/home/snmg/state/webhook/service.log` 中的 `Healthy deployment`、成功 commit 與 `/healthz`。

## 登入與資料保護

前端顯示「NCU Portal」，實際使用 Logto OIDC。帳號依驗證後的身份關聯，不依電子郵件自動合併或升權。一般帳號預設 USER，最高權限取決於經驗證的 NCU identifier；設定與身份規則見 [Logto 指南](deploy/LOGTO.md)。Session 採伺服器端 15 分鐘閒置期限。

- **後端授權：** API 檢查目前帳號、角色及單位資格；隱藏按鈕不取代權限檢查。
- **衝突保護：** DNS 快照與資料版本不一致時拒絕覆蓋；PostgreSQL 與 PowerDNS 不屬於同一原子交易。
- **清查草稿：** 只保存在目前頁面，儲存成功後清除；重整、離開頁面或紀錄版本改變後不還原舊草稿。
- **復原範圍：** 僅處理 DNS RRset，不回復單位歸屬、清查或申請狀態；缺少完整快照或已有後續變更時不可復原。
- **備份：** 分別備份 PostgreSQL、PowerDNS backend 與持久密鑰。CSV 匯出與變更復原不能取代完整備份。

## 開發與驗證

需要 **Node.js 22.13+、npm、獨立開發用 PostgreSQL**。正式 Compose 使用 PostgreSQL 17；開發可設 `PDNS_MOCK=true` 使用模擬 DNS。

### 本機設定

```bash
npm ci
cp .env.example .env
```

編輯 `.env`，填入本機資料庫連線及開發密鑰，再執行：

```bash
npm run db:generate
npm run db:migrate
```

首次初始化帳號時，設定獨立的 `OWNER_INITIAL_PASSWORD`（至少 16 字元）後執行 `npm run db:seed`。Seed 拒絕覆寫既有初始帳號；完成後移除該環境變數。此帳密帳號不等於已驗證的 Logto 最高權限身份。

需要啟動本機網站時執行 `npm run dev`。Compose 的 PostgreSQL 未發布 host port，host 上的開發程式須連接另行準備的資料庫，不能直接使用 Compose 容器內的位址。

### 檢查指令

```bash
npm run build   # 產生 Prisma Client，並包含 TypeScript 檢查
npm run lint
npm test
```

`npm run typecheck` 可用於快速型別除錯。Build 與測試應依序執行，避免同時操作 Prisma Client。

資料庫整合測試預設跳過。完整測試須使用 **localhost、名稱為 `dns_units_test` 的隔離資料庫**：

```bash
DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/dns_units_test' npm run db:migrate
UNIT_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/dns_units_test' npm test
```

整合測試使用假的 PowerDNS，不修改正式 DNS。[GitHub Actions](.github/workflows/ci.yml) 另驗證部署腳本、Docker、Compose 與 gateway；CI 通過不代表正式 VM 或 SSO 已驗收。

### 可選 local demo

`npm run demo` 在 `http://localhost:3000` 啟動純本機展示，停用資料庫及外部 SSO。它無法驗證需要 PostgreSQL 的單位制申請、單位管理與 DNS 復原；一般作業維持關閉。

| Demo 帳號 | 開發密碼 |
| --- | --- |
| `owner@aegis.local` | `DemoOwner!2026` |
| `admin@aegis.local` | `AegisAdmin!2026` |
| `user@aegis.local` | `AegisUser!2026` |

以上僅供本機開發，不用於正式帳號。Demo DNS 於重啟重設，其他本機資料存於 git-ignored `.local-demo/`。

## 專案結構

| 目錄 | 職責 |
| --- | --- |
| `app/` | App Router 頁面、登入殼層與 API |
| `components/` | DNS、申請、單位與管理介面，共用控制項 |
| `lib/` | 身份授權、申請與清查流程、PowerDNS client、復原及前端工具 |
| `prisma/` | 資料模型、migration 與初始帳號 seed |
| `styles/` | 共用 tokens、主題與響應式樣式 |
| `tests/` | 規則、API、元件及隔離資料庫測試 |
| `deploy/` | 遠端安裝、部署、webhook 與搬遷指南 |

## 文件

- [介面與權限](docs/access-matrix.md)：角色、申請、清查、復原及已停用功能。
- [介面流程](docs/unit-ui-review.md)：導覽、表單、草稿與操作行為。
- [整合狀態](docs/pending-integrations.md)：外部服務能力與驗收範圍。
- [部署指南](deploy/README.md) · [快速安裝](deploy/QUICKSTART.md) · [目錄搬遷](deploy/MIGRATION-HOME.md) · [Logto 設定](deploy/LOGTO.md)。
- [歷史實作紀錄](docs/history/access-changes.md)：保留當時的變更與測試，不作現行部署指令。

## 授權

本專案原始碼採用 [MIT License](LICENSE)。第三方套件及國立中央大學校徽依其原有授權與使用條件；MIT 授權不包含校徽或商標使用權，詳見 [素材來源](public/ASSET-SOURCES.md)。

### DNS 刪除保護

最高管理員在「刪除保護」設定 12–256 字元的專用密碼（與登入密碼分開）。尚未設定時禁止 DNS 刪除。所有管理員每次刪除解析值、Zone、核准刪除申請，以及移除或替換原解析值時，必須重新輸入密碼；純新增與 TTL 變更不需要。密碼只儲存 scrypt 雜湊，不提供查詢。每個帳號 15 分鐘內連續錯誤 5 次會暫時鎖定驗證，更換密碼不會清除鎖定。

舊 DNS 變更紀錄與復原 API 維持回傳 410。DNS 管理現提供每筆「歷程」及「DNS 歷程（含已刪除）」入口，以網域＋type＋紀錄名稱串起建立、修改、刪除與重建，顯示前後解析值、TTL、停用狀態、時間與操作者。歷程沿用既有 AuditLog，無需新增資料庫 migration；包含直接操作、申請核准及整個網域刪除的既有快照，權限依 DNS 管理範圍過濾。新快照記錄 PowerDNS 連線來源，舊快照標示來源未記錄。無操作快照的早期變更、直接從其他工具修改 PowerDNS 的操作無法回溯。
