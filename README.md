# NCUEECESNMG DNS Manager

以單位為核心的 PowerDNS Authoritative 管理系統。使用 Next.js 16 App Router、React 19、TypeScript、Auth.js、Prisma 6 與 PostgreSQL；介面使用共用 CSS tokens 與 Tailwind CSS 4。PowerDNS 憑證只由伺服器環境讀取，不傳送至瀏覽器。

本文件描述目前 repository 的程式與設定，包括隨本版本交付的 migration；不代表 GitHub main 已推送或正式 VM 已完成部署。

## 文件導覽

| 文件 | 用途 |
| --- | --- |
| [介面與權限](docs/access-matrix.md) | 系統／網域／單位角色、申請、清查與復原邊界 |
| [目前介面流程](docs/unit-ui-review.md) | 導覽、表單、草稿與操作行為 |
| [整合狀態](docs/pending-integrations.md) | 已實作、未串接及正式驗收範圍 |
| [Ubuntu VM 快速安裝](deploy/QUICKSTART.md) | 正式拓撲：獨立 Caddy + Ubuntu VM |
| [部署與維運](deploy/README.md) | 手動部署、webhook、備份及替代 Nginx 拓撲 |
| [Logto 登入](deploy/LOGTO.md) | SSO 設定、身份來源與維護工具 |
| [歷史實作紀錄](docs/history/access-changes.md) | 過去變更與當時的驗證結果，不作現行操作指南 |

## 架構

```text
Browser ──HTTPS──> 外部 Caddy ──私有網路──> VM gateway :8080
                                           ├──> Next.js :3000（loopback）
                                           │      ├──> PostgreSQL（內部 Docker network）
                                           │      ├──> PowerDNS REST API（受限私有路徑）
                                           │      └──> Logto OIDC
                                           └──> /hooks/github → webhook :9000（loopback）
```

- `app/(workspace)/`：共用登入殼層與各功能頁面；頁面及 API 各自檢查授權。
- `app/api/`：驗證輸入、身份與來源的 route handlers。
- `components/{admin,records,requests,units}/`：DNS 管理、申請審核、單位管理與清查表單。
- `lib/{auth,units,requests,inventory,dns-changes,powerdns}/`：身份、單位權限、申請、歸屬清查、復原及 DNS 寫入。
- `lib/client/`：API、資源載入、導覽及頁面內表單草稿。
- `prisma/`：使用者、單位、申請、歸屬、清查、稽核及 migration。
- `styles/`：字體、間距、色彩、控制項及響應式樣式；`app/globals.css` 匯入各層。
- `deploy/`：VM 安裝、gateway、簽章 webhook 與部署工具。Compose 不建立 PowerDNS 伺服器。

## 功能與入口

| 路徑 | 功能 |
| --- | --- |
| `/dns` | 單位 DNS；成員清查及提出變更／刪除申請 |
| `/requests/new` | 多筆 DNS 新增申請，固定目前單位 |
| `/requests` | 申請紀錄／管理員申請審核 |
| `/units` | 單位管理；系統管理員建立、改名、刪除及指定管理人 |
| `/zones` | DNS 管理，整合網域資訊、紀錄維護、歸屬與清查 |
| `/admin/application-policy` | 申請規則：類型及各網域是否開放申請 |
| `/admin/dns-changes` | 最近 DNS 新增／修改／刪除紀錄與一鍵復原 |
| `/admin/users` | 帳號、角色、停用狀態及備註 |
| `/activity` | 唯讀操作紀錄，含篩選、分頁、前後差異 |

`/inventory` 轉至 `/zones`，`/zones/[zone]` 轉至對應 domain 頁籤；保留的舊路徑不代表仍提供獨立頁面。PowerDNS 網頁設定、使用者訊息、清查通知／回覆管理與全站登入白名單已停用。

導覽為平鋪功能清單，僅多個實際單位成員資格才出現工作區切換。系統管理員側欄不顯示「單位 DNS／申請 DNS」，可於單位管理查看各單位使用者及 DNS；管理全站不等於自動加入所有單位。

### 單位與權限

- 只有全域 ADMIN／SUPER_ADMIN 可建立單位，須以學號指定已註冊且啟用的唯一管理人。建立後立即生效，不需單位審核；舊制未啟用單位不自動啟用。
- 單位只有「管理員（ADMIN）」及「成員（EDITOR）」兩種角色。兩者都能清查及送出新增、修改、刪除申請；管理員另可新增使用者、調整角色及移出單位。保留最後一位可登入管理員。
- 「使用者管理」以學號新增成員；尚未註冊者於登入後自動加入，預設成員。移除成員也撤銷其加入資格。沒有自行建立或加入單位的入口。
- 系統管理員可改名；目前 DNS 歸屬名稱同步更新，歷史申請保留原名稱。刪除會移除成員資格與加入名單，但有 DNS、申請或清查任務關聯時拒絕刪除。
- 單位角色不授予全域／網域管理或直接發布 DNS 的權限。網域 VIEWER／EDITOR／ADMIN 是另一套權限，未隨單位角色合併而改變。

### 申請與審核

未加入有效單位不能申請。全站申請規則固定 `UNIT_ONLY`；新網域預設暫停申請，由授權管理員在「申請規則」開放。送出時重新驗證單位、成員、網域與類型。

新增申請必填姓名、有效電子郵件、分機（1–10 位數字），單位由目前工作區決定。每筆 DNS 用途必填、備註選填（各最多 1000 字）；文字欄位預設兩行並可垂直縮放。一份申請可跨多個開放網域，沒有應用層筆數上限；整批驗證與入庫，管理員逐筆審核。用途核准後帶入 DNS 清查資料；備註保留於申請及審核畫面。

`POST /api/dns-requests` 接受：

```json
{
  "unitId": "selected-unit-id",
  "applicantName": "申請人",
  "applicantEmail": "contact@example.com",
  "applicantUnit": "目前單位名稱",
  "applicantExtension": "1234",
  "records": [{ "zoneName": "example.com.", "name": "www", "type": "A", "content": "192.0.2.10", "ttl": 300, "purpose": "實驗室網站", "notes": "選填補充說明" }]
}
```

伺服器依 `unitId` 取得真實單位名稱，不信任自由輸入的名稱作授權。單位新增／修改／刪除申請只由系統管理員核准；歷史個人申請仍依原網域權限處理，但不接受新的個人申請。核准時再次檢查成員資格、DNS 連線、快照及相關資料版本。修改／刪除只處理指定解析值，保留其他值；新名稱／類型須另外申請。

### DNS 管理、清查與復原

`/zones` 保留清查列表，以 domain 頁籤區分正解與反解；`ee.ncu.edu.tw`、`ce.ncu.edu.tw` 優先。搜尋 `@` 對應根網域紀錄。清查與歸屬資料在同一個對話框，系統管理員可指派所屬單位；只有最高權限帳號能看到刪除清查紀錄按鈕。

單位成員的清查同樣有完整聯絡資料、用途及備註。管理員與單位清查表單在同頁關閉後重開會保留輸入；成功儲存才清除。重整／離開頁面不保留，伺服器紀錄版本改變時不套用舊草稿。清查不修改 DNS 解析，歷史時間與經手人由伺服器記錄。

`/admin/dns-changes` 僅系統管理員可用，列出本系統成功紀錄的 DNS 新增／修改／刪除操作。復原需具完整前後快照、相同連線來源且目前 DNS 未被後續修改；遵守受保護紀錄權限。復原只處理 DNS RRset，不回復單位歸屬、清查或申請狀態。直接在 PowerDNS 進行的外部變更不會自動匯入此紀錄。

## 登入與帳號

前端顯示「NCU Portal」，實際使用 Logto OIDC，issuer 與身份解析見 [Logto 指南](deploy/LOGTO.md)。只要求 `openid identities`，不以 email、姓名或 sub 授予管理權。未回傳有效聯絡信箱不會因此阻擋一般登入；申請表的必填電子郵件是獨立要求。

最高權限來自本次 Logto 登入驗證的一致 NCU identity `details.identifier=115502532`。一般帳號首次建立為 USER；系統管理員可調整其他非 owner 帳號的 USER／ADMIN 身份。owner 角色與帳號狀態不可更動；移除帳號、委派網域權限及刪除清查紀錄限 owner。密碼登入不繼承 Logto owner 權限；歷史 SUPER_ADMIN 以一般 ADMIN 存取。

帳號使用 Logto subject 關聯，不自動依 email 合併。姓名、identifier 與聯絡信箱取自同一份 identity details；`User.portalEmail` 僅作顯示。停用／移除帳號不得使用。Session 由伺服器執行 15 分鐘閒置期限，背景讀取不延長，逾時不自動提交草稿。帳密登入可用 `AUTH_PASSWORD_LOGIN_ENABLED=false` 關閉。

## 開發與驗證

需要 Node.js 22.13+、npm 與可連線的 PostgreSQL；正式 Compose 使用 PostgreSQL 17。不要把正式資料庫作為開發或測試目標。

```bash
npm ci
cp .env.example .env
# 編輯 .env：填入你另行建立的本機資料庫及密鑰；可設 PDNS_MOCK=true。
npm run db:generate
npm run db:migrate
# 只有首次初始化且已設定 OWNER_INITIAL_PASSWORD 時執行：
npm run db:seed
# 明確需要啟動本機服務時才執行：
npm run dev
```

Compose 的 PostgreSQL 不發布 host port，因此 host 上執行的 `npm run dev` 不可直接用預設 localhost URL 連入該容器；請另備本機資料庫，或使用完整 Compose 拓撲。

Seed 只建立 `owner-bootstrap@accounts.invalid`，使用 16 字以上獨立密碼且拒絕覆寫已有初始帳號。此地址與資料庫 SUPER_ADMIN 值本身不提供已驗證的 Logto owner 權限；初始化密碼完成後從執行環境移除。

```bash
npm run build  # 包含 prisma generate 與 TypeScript 檢查
npm run lint
npm test
```

`npm run typecheck` 可作較快的型別除錯，不需在相同來源 build 通過後重複執行。Build 及測試不要同時操作 Prisma client。單位資料庫整合測試預設跳過；要執行完整測試，先對**隔離 localhost、名稱為 dns_units_test 的資料庫**套用 migration，再執行：

```bash
DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/dns_units_test' npm run db:migrate
UNIT_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/dns_units_test' npm test
```

整合測試使用假的 PowerDNS，不寫入正式 DNS。GitHub Actions 另檢查部署腳本、Docker／Compose／gateway 與依賴；詳見 [CI workflow](.github/workflows/ci.yml)。CI 成功不等於正式 SSO、DNS 或 VM 已驗收。

### 可選 local demo

僅在明確需要時執行 `npm run demo`，以 loopback `http://localhost:3000` 啟動。它強制停用資料庫及外部 SSO，使用 mock DNS 和開發帳密；因此**無法驗證需要 PostgreSQL 的單位制申請、單位管理與 DNS 復原流程**。一般操作保持 local demo 關閉。

Demo 帳號為 `owner@aegis.local`／`DemoOwner!2026`、`admin@aegis.local`／`AegisAdmin!2026`、`user@aegis.local`／`AegisUser!2026`，僅供本機開發。DNS 與記憶體申請於重啟重設，其他本機資料存於 git-ignored `.local-demo/`；不得當作正式備份或匯入正式帳號。

## 正式設定與部署

正式環境以 [deploy/app.env.example](deploy/app.env.example) 為範本，密鑰放在 checkout 外的 `/etc/dns-manager/app.env`。

| 變數 | 用途 |
| --- | --- |
| `POSTGRES_PASSWORD` | Compose 資料庫密碼；Compose 組成 `DATABASE_URL` |
| `DATABASE_URL` | 非 Compose 的 Prisma／應用資料庫連線 |
| `AUTH_URL` | 對外 HTTPS origin；Compose 使用此名稱 |
| `AUTH_SECRET` | 固定且足夠隨機的 session 簽章密鑰 |
| `AUTH_LOGTO_ID`、`AUTH_LOGTO_SECRET` | Logto Traditional web 應用設定 |
| `AUTH_PASSWORD_LOGIN_ENABLED` | 測試帳密登入開關，預設 true |
| `PDNS_API_URL`、`PDNS_API_KEY`、`PDNS_SERVER_ID` | 伺服器 PowerDNS 設定；URL 以 `/api/v1` 結尾，server ID 預設 localhost |
| `PDNS_MOCK` | 正式環境 false；true 使用記憶體 DNS |
| `SETTINGS_ENCRYPTION_KEY` | Compose 保留的固定密鑰；保留升級相容性，舊網頁憑證不再使用 |
| `OWNER_INITIAL_PASSWORD` | 僅首次 seed 使用 |

不要使用 `NEXT_PUBLIC_` 儲存 PowerDNS 或登入憑證。`PDNS_API_URL` 不可含內嵌帳密、query 或 fragment。容器中的 localhost 是容器本身；PowerDNS 必須可由受限制的私有路徑連線。設定變更後重新建立容器，單純 restart 不載入新 env。

依 [快速安裝](deploy/QUICKSTART.md) 設定外部 Caddy、VM gateway 及簽章 GitHub webhook。main push 會排隊部署最新 main：先 build，再 Compose down/up（不刪 volume），完成 migration 後啟動 web。這不是零停機或自動回退部署；webhook 202 只代表已接受排隊，需另確認 journal 的 `Healthy deployment`、commit 與 `/healthz`。

升級需套用**全部** migration；包含 DNS 復原、單位建立立即生效、申請備註及兩種單位角色。單位角色 migration 將舊 VIEWER 轉成成員 EDITOR，網域角色不變。不得為了重跑 migration 刪除正式資料庫或 volume。

## 安全、稽核與備份

- API 授權及目前帳號狀態是安全邊界，側欄隱藏不是授權。
- 同來源檢查、Zod 驗證、RRset hash／資料版本檢查保護寫入；衝突回傳 409。
- 本系統 DNS 寫入使用協調鎖；外部 PowerDNS 寫入不受此鎖控制。PostgreSQL 與 PowerDNS 不是單一原子交易，失敗重試仍需核對狀態。
- 稽核包含操作開始、領域事件與完成狀態；初始稽核寫入失敗會阻擋操作。完成紀錄失敗會發出伺服器記錄及 `X-Audit-Warning`。
- 系統管理員可匯出全部 DNS CSV（含正反解、停用值、歸屬與清查）；匯出不受畫面篩選限制，不是原子快照或可直接還原的備份。
- 備份 PostgreSQL、PowerDNS backend 與持久密鑰，並測試還原。應用稽核沒有修改／刪除入口；owner 刪除清查紀錄會留下稽核。
- 不將 GitHub 推送、CI 通過或 mock 測試稱為正式 VM 健康驗證。
