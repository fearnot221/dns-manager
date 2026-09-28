# 介面與權限分工

角色是疊加的：單位角色只作用於該單位，不會授予全站或 Zone 管理權。導覽與篩選不是授權機制，API／服務層仍須驗證目前登入帳號。

| 功能 | 一般使用者 | 網域管理員（Zone ADMIN） | 系統管理員 |
| --- | --- | --- | --- |
| 申請 DNS | 須加入已核准單位並具該單位編輯／管理角色，依開放網域與類型送出 | 同左 | 同左 |
| 建立單位／指定管理人 | 不可 | 不可（除非兼具系統管理員） | 建立時以學號指定管理人；可為既有單位新增管理人 |
| 審核既有待審核單位 | 不可 | 不可（除非兼具系統管理員） | 可核准／退回 |
| 查看申請 | 本人及所屬單位共享申請 | 另含授權網域的申請 | 全站申請 |
| 審核既有歷史個人申請 | 不可 | 僅授權網域 | 全站 |
| 審核單位新增／變更／刪除申請 | 不可，單位管理員也不可 | 不可（除非兼具系統管理員） | 可，並驗證提交者仍具有效權限 |
| Zone、直接維護 DNS、開放申請設定 | 不可 | 僅授權網域 | 全站 |
| 單位 DNS 清查 | 所屬已核准單位，可記錄清查與查看歷史 | 同左 | 管理員清查入口 |
| DNS 全站清查、補登歸屬 | 不可 | 僅授權網域 | 全站 |
| 匯出全部 DNS CSV | 不可 | 不可 | 可 |
| 使用者、申請規則、操作紀錄 | 不可 | 不可 | 依系統管理權限開放 |

## 單位內部角色

- 查看：讀取該單位 DNS 與成員，可記錄清查；不可送出 DNS 新增、變更或刪除申請。
- 編輯：另可送出 DNS 新增、變更及刪除申請，必須經系統管理員審核。
- 單位管理：另可管理成員與學號白名單；不得移除或降級最後一位管理員。
- 一般使用者及單位管理人不可建立單位。系統管理員建立時必須輸入管理人學號，新單位直接核准生效；建立者不會自動加入單位。
- 管理人學號須精確對應唯一的已註冊、未移除且啟用的帳號。找不到或出現重複學號時不指派、不自動建立使用者。
- 系統管理員可為既有單位透過學號新增管理人，會加入或提升該成員的單位角色；其他管理人的權限保留。單位管理人可調整所屬單位成員的查看／編輯／單位管理角色及移除成員，不會取得全站或其他單位的管理權限。
- 既有待審核單位仍須系統管理員核准；退回的單位不可使用，審核說明保留於單位頁面。
- 系統管理員申請 DNS 亦須具該單位的編輯／管理成員身分；管理全站單位不等於可代非所屬單位申請。
- 加入改由單位管理員或系統管理員新增學號白名單。已註冊且啟用的唯一對應帳號立即加入；未註冊者於登入後自動加入已核准單位，預設 VIEWER。重複新增不更改既有角色；重複學號不授權。移除成員或帳號也撤銷白名單，移除白名單也撤銷對應成員權限。舊 join／rotate API 已拒絕受理。
- 白名單只供該單位管理員與系統管理員查看及維護；既有成員與角色保留。遷移只回填能唯一對應學號的成員，不猜測缺少或重複的學號。

## 特殊權限與已停用功能

- 系統管理員可指派或撤銷非 owner 帳號的 USER／ADMIN 身分；移除使用者與委派 Zone 權限沿用 owner 身分限制。
- owner 在介面仍使用一般「管理」操作，可備註；角色與帳號狀態不可更動。
- 網站不提供新增 Zone；PowerDNS 憑證只在伺服器環境設定，舊設定 API 回傳 410。
- 舊的全站登入白名單頁面已停用，不以舊白名單資料限制登入；新的單位學號白名單只控制單位成員資格。
- 使用者傳訊息、清查通知、清查回覆管理與通知指派已移除。舊頁面回傳 404，舊 API 回傳 410；歷史資料保留於資料庫，不提供讀取或寫入入口。
- 全部申請篩選表示「此帳號有權查看的全部」，不是未授權的全站資料。

## 本輪驗證範圍

導覽角色測試、Zone API 隔離測試、申請審核能力測試、本人／共享篩選測試、既有單位與工作流程 API 邊界測試；另執行 lint、完整測試套件及 production build。正式 Portal、PowerDNS、VM 與瀏覽器畫面需部署後驗證；local demo 保持關閉。

## 單位審核遷移

部署前須執行 `prisma migrate deploy`，套用 `20260928000000_unit_approval`。既有單位也會列為待審核，需由系統管理員至「單位管理」逐一核准；遷移不刪除或改寫既有 DNS、成員、歷史申請。未核准期間暫停單位操作與 DNS 申請。既有個人申請保留歷史處理能力，但不再接受任何新的個人申請。

申請規則固定為 `UNIT_ONLY`；讀取舊 `ANY`／`MEMBERS_ONLY` 設定時轉為單位制，不允許透過設定 API 恢復個人申請。

### 2026-09-28 單位審核驗證紀錄（指定管理人變更前）

對應本次工作樹的單位強制歸屬、審核 API、表單及 migration 變更：

- `npm run lint`：通過。
- `npm run build`：通過，包含 TypeScript 檢查。
- `UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm test`：41 個測試檔、247 項測試全部通過；包含隔離 PostgreSQL 整合測試，PowerDNS 使用測試替身。
- `DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm run db:migrate`：全數 migration 通過。
- 在另一個隔離資料庫先套用舊 schema、加入單位及 DNS 樣本，再套用新 migration：確認既有單位為 `PENDING`，DNS 值與 `unitId` 保留。
- `git diff --check`：通過。未啟動 local demo，未執行瀏覽器畫面驗證，未推送或部署，未操作正式資料庫或正式 DNS。

### 2026-09-29 管理員建立與學號指定管理人驗證紀錄

對應本次工作樹的建立單位授權、學號查找與指派、管理人表單及成員權限：

- `UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm test`：41 個測試檔、253 項測試全部通過；包含隔離 PostgreSQL 的建立／指派、停用／移除／重複學號、跨單位限制與最後一位管理人保護測試。
- `npm run lint`、`npm run build`：通過；build 包含 TypeScript 檢查。build 前曾執行 `npm run typecheck` 作為除錯，亦通過。
- `git diff --check`：通過。新增表單沿用原生 modal 的焦點與 Escape 行為，學號欄位具有標籤、必填宣告、說明與錯誤關聯；未啟動 local demo 或執行瀏覽器畫面驗證。
- 本次未新增 migration；仍需套用前一輪 `20260928000000_unit_approval`。管理員建立的新單位直接核准，遷移產生的既有待審核單位仍可由管理員審核。
- 未推送或部署，未操作正式使用者、資料庫或 DNS。

## 清查入口

- 每筆一般網域 DNS 統一使用「清查」按鈕，清查列表、表格、清單、IP 棋盤、類型、名稱及解析內容分組皆開啟同一畫面；網域明細的六種檢視也支援此入口。反解網域維持歸屬編輯，不提供定期清查。
- 清查畫面保留「記錄清查」、「歸屬資料」與歷次清查。系統管理員或授權網域管理員可直接記錄清查，日期與實際經手人由系統填入。
- 通知指派、通知列表與回覆管理已停用；一般使用者與管理員的導覽均不再顯示「通知與協作」。資料庫中的歷史訊息、通知及已完成的清查紀錄保留，不自動刪除或改派。

### 2026-09-29 清查整合驗證紀錄（通知功能移除前）

對應本次工作樹的統一清查入口、單位指派 API、共用通知與 migration：

- `UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm test`：42 個測試檔、269 項測試通過，包含 PostgreSQL 整合測試及七種檢視模式的靜態渲染測試。
- 新增並行指派／撤回後重派測試後，執行 `UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npx vitest run tests/units.integration.test.ts tests/inspection-ui.test.tsx`：受影響的 2 個測試檔、41 項測試通過。應用程式碼與依賴未再變更，重用通過的 lint／build 結果。
- `npm run lint`、`npm run build`：通過；build 包含 TypeScript 檢查。build 前的 `npm run typecheck` 亦通過。
- `DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm run db:migrate`：新 migration 通過。在另一個隔離資料庫加入舊個人待回覆／已回覆通知後套用 migration，確認收件人、狀態及回覆保留；收件對象互斥檢查及待回覆唯一約束由整合測試驗證。
- `git diff --check`：通過。未啟動 local demo，未進行瀏覽器畫面驗證，未推送或部署，未操作正式資料庫或 DNS。

### 2026-09-29 移除訊息與清查通知驗證紀錄

對應本次工作樹的訊息／清查通知頁面停用、API 退役、導覽與指派入口移除：

- `UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm test`：43 個測試檔、262 項測試全部通過。涵蓋舊頁面 404、舊 API 所有既有方法回傳 410 且不存取資料庫、各角色導覽移除，以及七種檢視模式保留直接清查入口。
- `npm run lint`、`npm run build`：通過；production build 包含 TypeScript 檢查。
- `git diff --check`：通過；檢查確認已無訊息／通知元件或服務層的引用。
- 本次沒有新增資料遷移或刪除歷史資料；訊息與通知資料表保留供歷史保存，已完成的 DNS 清查歷史仍可由清查畫面查看。
- 未啟動 local demo，未進行瀏覽器畫面驗證，未推送或部署，未操作正式資料庫或 DNS。

### 2026-09-29 單位學號白名單驗證紀錄

- 最終白名單實作：`UNIT_TEST_DATABASE_URL=…/dns_units_test npm test`，44 個檔案、270 項測試通過；包含越權、重複學號、預先登錄、停用帳號、未核准單位、並行加入／撤銷、最後管理員保護與畫面入口。
- `npm run lint` 通過；新增測試與最後修正後，受影響檔案再次執行 `npx eslint` 通過。`git diff --check` 通過。
- `npm run build` 通過，包含 TypeScript 檢查。補測期間曾因測試 session 缺少必要 globalRole 型別失敗，修正後重新 build 通過。
- `DATABASE_URL=…/dns_units_test npx prisma migrate deploy` 在隔離資料庫成功套用 `20260929010000_unit_allowlist`。另一個保留舊資料的隔離 schema 沒有 Prisma migration history，deploy 回報 P3005；改以 `psql -v ON_ERROR_STOP=1 -f prisma/migrations/20260929010000_unit_allowlist/migration.sql` 驗證 SQL，確認既有成員、角色及 DNS 資料完全保留，唯一對應學號成功回填。
- local demo 保持關閉；僅執行靜態渲染測試，未進行瀏覽器視覺驗證。未 push、未部署、未修改正式資料；部署前須先套用所有 pending migrations。


## 單位導向 UI

導覽、角色入口與介面檢查詳見 [單位 UI 檢查紀錄](unit-ui-review.md)。一般成員改由 `/dns` 查看單位 DNS，`/units` 僅供單位管理員與系統管理員管理。只有多個實際成員單位時才顯示工作區切換；申請表與一般成員申請紀錄均使用目前單位。

## 清查中的 DNS 單位指派（2026-09-29 修正）

- 系統管理員在「清查 → 指派單位」可將單一解析值歸屬至已核准單位。清查列表及網域明細的共用清查對話框均提供入口；委派網域管理員不具指派權，API／服務層同樣阻擋。
- 指派更新 `DnsRecordMetadata.unitId` 與顯示單位名稱，保留聯絡資料、用途及歷史清查，不寫入 PowerDNS，也不建立清查通知。新單位成員可查看 DNS，編輯者可申請變更。
- 改派後原單位不再取得這筆 DNS；其尚待審核的變更申請會因歸屬已變更而拒絕核准。已存在的歷史申請仍保留。
- 儲存時檢查版本、連線、解析值存在性與單位狀態；與單位變更審核共用單位鎖，並行指派衝突回傳 409。
- 最終程式碼驗證：`UNIT_TEST_DATABASE_URL=…/dns_units_test npm test`，48 個檔案、290 項全數通過；`npm run lint`、`npm run build`（包含 TypeScript）與 `git diff --check` 通過。並行測試發現 raw SQL 的 PostgreSQL 40001 需另轉成 409，修正後完整套件通過。
- 沒有新增 migration；只在隔離資料庫測試，未修改正式 DNS／資料，未啟動 demo、未進行瀏覽器視覺驗證、未推送。

## 清查紀錄刪除（2026-09-29）

- 只有既有 `isOwner` 身分可刪除單筆清查紀錄；一般 ADMIN、未符合 owner 身分的歷史 SUPER_ADMIN、單位／網域管理員均無權限。伺服器頁面傳遞按鈕可見性，API 與服務層另行驗證；畫面不新增角色限制提示。
- 刪除綁定紀錄 ID、DNS 歸屬 ID、目前連線及歸屬更新時間；失效版本回傳 409。交易中鎖定帳號與歸屬資料，拒絕停用帳號，保留 DNS、單位及其他清查歷史，並將被刪紀錄快照寫入稽核。
- 對應本次工作樹的刪除 API／服務、兩處頁面權限傳遞與共用清查對話框：`npm run build`、`npm run lint` 通過；`UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm test` 共 49 個測試檔、297 項測試通過。涵蓋 owner／非 owner UI、API 越權／CSRF／輸入、隔離 PostgreSQL 資料保留及並行刪除；`git diff --check` 通過。
- 無 migration，沒有操作正式資料庫或 PowerDNS；隔離測試資料庫已停止。local demo 未啟動，未做瀏覽器視覺驗證，未推送或驗證 VM 部署。

## 清查與歸屬同頁（2026-09-29）

- 共用清查對話框直接顯示歸屬欄位、清查備註及歷史，移除兩者之間的頁籤切換，保留管理員「指派單位」入口與 owner 刪除歷史權限。
- 「儲存歸屬資料」只更新歸屬；「儲存並記錄清查」使用 `inspect-and-metadata` 模式，在同一交易更新歸屬並新增伺服器時間／登入者的清查紀錄。沿用網域權限、一般網域限制、連線及版本比對，保留單位 ID、DNS 與既有歷史。原 `inspect` API 行為相容。
- 對應本次同頁 UI、API 模式與服務變更：`npm run build`、`npm run lint` 通過；`UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm test` 全部 49 個測試檔、301 項測試通過；`git diff --check` 通過。測試涵蓋同頁欄位、兩種儲存動作、反解與越權拒絕、偽造清查人員／日期拒絕、隔離 PostgreSQL 合併儲存及衝突時保留資料。
- 無 migration 或正式資料操作；local demo 維持關閉，未進行瀏覽器視覺驗證。尚未推送。

## 系統管理員單位總覽（2026-09-29）

- ADMIN／SUPER_ADMIN 導覽移除「單位 DNS」、「申請 DNS」與成員工作區切換；直接開啟 `/dns` 導回 `/units`，`/requests/new` 導回 `/requests`。一般使用者及委派網域管理員原有單位流程保留。
- 系統管理員在單位管理可選取各單位，查看使用者、管理權限與目前連線中有效的 DNS 紀錄；可搜尋 DNS，但此畫面沒有新增／變更申請入口。API 沿用單位存取權限與連線範圍，DNS 讀取失敗時仍回傳使用者資料並提示清單不完整。
- 對應本次導覽、頁面導向、單位管理 UI／服務變更：`npm run build`、`npm run lint` 通過；`UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm test` 共 49 個測試檔、305 項測試通過；`git diff --check` 通過。涵蓋 admin 導覽／直接頁面導向、使用者與 DNS 同頁、管理權限隔離、DNS 故障仍可管理使用者。
- 無 migration、正式 DNS 或資料庫操作。隔離測試資料庫已停止；local demo 維持關閉，未進行瀏覽器視覺驗證，尚未推送。

## Domain 清查頁籤與 admin 角色管理（2026-09-29）

- DNS 清查移除多種檢視模式、瀏覽器檢視偏好與分組切換，固定原本清查列表並依 domain 分頁籤。搜尋與清查狀態篩選套用目前 domain；頁籤支援方向鍵、Home／End，domain 消失後回到第一個可用頁籤。
- 系統 ADMIN 可將非 owner 帳號設為 USER／ADMIN，也可管理其他 admin 的狀態與備註；一般使用者及委派網域管理員不能修改全域角色。最高帳號的角色／狀態保持不可修改，不能從此 API 授予 SUPER_ADMIN。備註仍沿用既有可編輯行為。
- 帳號移除按鈕改用獨立 `canRemoveUsers` 權限，不因 `canAssignAdmin` 放寬而開放移除帳號；移除及 Zone 權限委派保持 owner 限制。
- 對應本次清查 UI、角色 API／共用授權與帳號管理 UI：修正測試型別後 `npm run build` 通過；`npm run lint` 通過；`UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm test` 共 49 個測試檔、308 項測試通過；`git diff --check` 通過。包括隔離 PostgreSQL 的升降權、已驗證 owner 保護、拒絕授予最高身分，以及清查 domain 範圍的靜態呈現測試。
- 無 migration 或正式資料操作。隔離 PostgreSQL 已停止；local demo 未啟動，未做瀏覽器視覺驗證；尚未推送。

## 反解網域清查（2026-09-29）

- DNS 清查總覽納入具管理權限的一般、IPv4 in-addr.arpa 與 IPv6 ip6.arpa 網域，沿用各 domain 頁籤與列表；可儲存歸屬並記錄反解清查。原本排除反解的清查限制已取消。
- 沿用網域權限、連線身分及更新版本比對，不寫入 PowerDNS。單位指派仍限一般網域，反解清查對話框不顯示無法使用的指派入口。
- 對應本次清查服務、總覽說明、反解對話框與測試的工作樹：`npm run build`、`npm run lint` 通過；`UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm test` 共 49 個測試檔、312 項測試通過；`git diff --check` 通過。包含 IPv4／IPv6 清查頁籤、限定管理網域、兩種清查儲存模式及隔離 PostgreSQL 持久化。
- 未啟動 local demo，未做瀏覽器視覺驗證；隔離測試資料庫已停止。無 migration／正式資料操作，尚未推送。

## 單位 DNS 清查與刪除申請（2026-09-29）

- 已核准單位的成員（含 VIEWER）可在單位 DNS 記錄清查、查看歷史；伺服器驗證啟用帳號、目前成員資格、單位歸屬、連線識別與 DNS 快照。只新增清查歷史，不修改歸屬或 DNS；請求不得指定清查者、時間或其他單位。
- EDITOR／單位 ADMIN 可提出刪除申請，沿用修改申請的申請政策、類型與重複待審核限制。管理員審核畫面明確顯示刪除目標與原因；送出時不寫 DNS，只有系統管理員核准後才刪除指定解析值，保留同組其他值、TTL、註解與歷史。
- 審核重新驗證申請人資格與歸屬，DNS 衝突時拒絕覆寫。最後一筆使用 RRset DELETE；外部 DNS 已成功但交易未完成時可辨識套用後狀態並重試，避免重複寫入。
- migration `20260929120000_unit_dns_deletion_requests` 新增 CREATE／UPDATE／DELETE 申請操作類型，既有帶原紀錄識別的申請回填 UPDATE。只在隔離 PostgreSQL 執行 `DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npx prisma migrate deploy`，成功；部署時須套用此 migration。
- 對應本次功能、介面與測試工作樹（基底 2ab8f2c）：`npm run build`（含 TypeScript）、`npm run lint`、`git diff --check` 通過；`UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm test` 共 50 個測試檔、329 項通過。涵蓋清查／刪除權限與 UI、CSRF、偽造欄位、跨單位與已停用帳號、失去資格、DNS 衝突、並行審核、退回／取消不寫 DNS、單值／最後一值刪除及交易失敗重試。
- 隔離 PostgreSQL 已停止。未啟動 local demo，未做瀏覽器視覺驗證；未操作正式 DNS／資料庫、未推送或驗證 VM 部署。

## 申請表單與清查資料一致（2026-09-29）

- 新增申請補上申請人電子郵件（選填），每筆用途以多行欄位填寫；姓名、所屬單位、分機與用途一起保存，核准後帶入 DNS 清查歸屬資料。單位仍由伺服器依實際單位 ID 決定，不接受任意指派。
- 變更申請預填該單位 DNS 的姓名、電子郵件、單位、分機及用途，將 DNS 用途與必填變更原因分開。核准前不更改現有資料；核准後寫入新解析值的歸屬資料，舊歷史保留。刪除與清查表單顯示目前聯絡資料及用途供確認；刪除不提供修改這些欄位的入口。
- 單位 DNS 回傳所屬紀錄的聯絡資料，仍不回傳使用者帳號電子郵件或其他單位紀錄。新增申請未提供聯絡郵件時僅使用 Portal 聯絡郵件，不以內部帳號識別郵件作為新紀錄聯絡方式。
- 變更表單與審核驗證歸屬資料版本，審核時鎖定原資料列，避免覆蓋等待審核期間的清查資料更新。既有未帶清查欄位的歷史申請保留原行為。
- migration `20260929130000_request_ownership_fields` 新增聯絡郵件、DNS 用途及原歸屬版本，僅於隔離 PostgreSQL 透過 `DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npx prisma migrate deploy` 套用成功；正式部署仍須執行 migration。
- 對應本次欄位、資料傳遞、版本檢查與測試工作樹：`npm run build`（含 TypeScript）、`npm run lint`、`git diff --check` 通過；`UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm test` 全部 50 個測試檔、334 項通過。最後調整聯絡資料排版與說明後，重跑 `npx vitest run tests/unit-workspace-ui.test.tsx tests/unit-allowlist-ui.test.tsx tests/unit-request-deletion-ui.test.tsx` 通過；重新 build／lint 亦通過。
- 未啟動 local demo 或做瀏覽器視覺驗證，未更動正式 DNS／資料庫，未推送。隔離 PostgreSQL 驗證後停止。

## 清查網域頁籤優先順序（2026-09-29）

- 清查頁籤優先列出 `ee.ncu.edu.tw`、`ce.ncu.edu.tw`，其餘網域維持原字母排序；大小寫與 DNS 結尾句點不影響優先判斷。預設顯示排序後第一個可用網域，權限與資料不變。
- 本次排序工作樹：`npx vitest run tests/inspection-ui.test.tsx tests/inventory-view.test.ts` 18 項通過；相關三個檔案的 `npx eslint`、`npm run typecheck` 與 `git diff --check` 通過。測試起初預期省略頁籤結尾句點，已修正為既有顯示格式後通過。
- 小型 UI 排序不重跑 production build／資料庫整合測試；未啟動 local demo、未做瀏覽器視覺驗證、未推送。

## 管理員 DNS 管理整合頁（2026-09-29）

- 側邊欄合併「網域管理」與「DNS 清查」為 `/zones`「DNS 管理」。依 domain 頁籤顯示原清查列表，優先 ee.ncu.edu.tw／ce.ncu.edu.tw，包含一般、IPv4／IPv6 反解與空網域。頁籤清單讀取授權網域，紀錄只讀取目前選取網域。
- 同頁保留 DNS 新增、編輯整組、刪除單一解析值、類型／清查狀態篩選、搜尋、TTL 與網域資訊；管理員可從原清查對話框維護歸屬、指派單位與查看歷史。系統管理員的全站匯出與 owner 清查歷史刪除權限保留，不增加檢視模式。
- 紀錄修改沿用既有 RecordDialog 與 API、完整 RRset hash 及權限檢查；刪除僅將所選解析值交給對話框。非 SUPER_ADMIN 不顯示 apex SOA／NS 刪除按鈕，後端仍為最終權限邊界。反解指派限制維持原樣。
- `/inventory` 授權後導向整合頁；舊 `/zones/[zone]` 先驗證該網域授權，再導向 `/zones?domain=...` 保留目標。一般使用者不能藉由舊路徑取得管理介面。
- 對應本次整合頁、導覽、路由及測試工作樹：`npm run build`（含 TypeScript）、`npm run lint`、`git diff --check` 通過；`UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55439/dns_units_test npm test` 共 51 個測試檔、340 項通過。含整合頁靜態呈現、頁籤排序、空／反解網域、紀錄錯誤恢復、操作權限、apex 保護、舊網址與委派管理員授權邊界。
- 本次整合不新增 migration 或更動正式 DNS／資料庫。local demo 維持關閉，未做瀏覽器視覺驗證；隔離 PostgreSQL 測試後停止。尚未推送，先前新增的申請資料 migration 仍待正式部署套用。
