# 郵件服務

系統管理員由「系統設定 → 郵件服務」（`/admin/mail`）設定。預設停用；尚未設定時不寄信，也不回補設定前的申請。

## Google SMTP

1. 在 Workspace 管理控制台允許 VM 的固定公網出口 IP、限制寄件網域、要求 TLS，且不要求 SMTP 帳密驗證。系統統一由 server 透過 `smtp-relay.gmail.com` 寄送，預設 Port 587（強制 STARTTLS），不支援個別 Google 帳號登入。
2. 在「通知設定」填寫寄件名稱、寄件地址與網管小組收件地址。寄件地址須符合 Workspace relay 的允許寄件者政策。收件地址以標籤方式輸入（Enter、逗號、空白或一次貼上多個），最多 20 個。
3. 在「郵件模板」調整各場景並預覽，啟用郵件服務並儲存。不需要設定 Google 帳號、應用程式密碼或 OAuth。
4. 在模板下方填入明確的測試收件地址，按「寄送測試信」。測試以範例資料寄出目前選取且已儲存的模板，會實際寄信；請更新紀錄並確認收件匣／垃圾郵件匣。測試須由已列入白名單的 VM 出站，其他來源可能被 Google 拒絕。

收件信箱由既有郵件服務接收，本系統不讀取或儲存信箱內的郵件。

Google 官方說明：[SMTP relay 設定](https://support.google.com/a/answer/2956491)。

## 模板與通知

模板為純文字，不執行 HTML、JavaScript 或任意模板運算；每個場景只接受自己的變數，主旨與內文可點選變數插入，並以範例資料即時預覽。

| 場景 | 收件人 | 預設 | 觸發時機 |
| --- | --- | --- | --- |
| 新增／修改／刪除申請 | 網管小組收件地址（CC 網管小組） | 啟用 | 單位送出對應申請 |
| 申請核准／申請退回 | 申請表的申請人信箱；未填時使用申請帳號的 Portal 信箱 | 停用 | 系統管理員審核單位申請 |
| 清查活動排定 | 各已啟用單位中、帳號未停用且有信箱的單位管理員 | 停用 | 系統管理員新增清查活動 |
| 自訂模板 | 「寄信給單位」選取單位的管理員 | — | 系統管理員手動寄出 |

審核結果與清查活動會寄到系統外的信箱，預設停用；需在「郵件模板」個別啟用。這些場景可選擇是否「副本給網管小組」，預設不 CC；所有郵件的 Reply-To 均為網管小組收件地址。舊版只有一組主旨／內文的設定，讀取時會套用到三種申請通知，其餘場景維持預設停用。

變數：

- 申請通知：`{{applicationId}}`（批次申請編號；修改／刪除為該筆 request ID）、`{{applicantName}}`、`{{unitName}}`、`{{recordCount}}`、`{{operation}}`、`{{submittedAt}}`、`{{reviewUrl}}`（由 `AUTH_URL` 產生的 `/requests`）。
- 審核結果：`{{requestId}}`、`{{applicantName}}`、`{{unitName}}`、`{{operation}}`、`{{recordName}}`、`{{recordType}}`、`{{content}}`、`{{result}}`、`{{reviewNote}}`、`{{reviewedAt}}`、`{{requestsUrl}}`。
- 清查活動：`{{recipientName}}`、`{{unitName}}`、`{{eventName}}`、`{{startsOn}}`、`{{endsOn}}`、`{{dnsUrl}}`。
- 自訂模板／寄信給單位：`{{recipientName}}`、`{{unitName}}`、`{{dnsUrl}}`。

「寄信給單位」可搜尋並複選單位，寄給每個單位的管理員（每位管理員每個單位一封），可套用自訂模板並選擇是否副本給網管小組；送出前會確認收件數。沒有可寄送信箱的單位無法選取。手動寄信受既有每分鐘操作上限限制，並寫入操作紀錄（`SEND_UNIT_MAIL`，不含內文）。

一份申請對每個收件地址產生一筆通知，每封通知及測試信均 CC 到寄送當下已儲存的網管小組收件地址，批次新增不逐筆寄送。申請及通知在同一資料庫交易提交；SMTP 故障不會讓已儲存的申請消失。

通知保存排入當時的寄件名稱／地址、收件地址、主旨、內文及是否 CC 網管小組；修改設定不會改寫既有待辦。worker 使用最新 CC／Reply-To 收件清單與 SMTP 連線設定；寄件地址須符合 Google Workspace relay 政策。

停用通知會停止新增待辦、暫停既有待辦；重新啟用後繼續處理。停用瞬間已進行中的寄送可能完成。重新啟用不回補停用期間的新申請。

## 部署與維運

- 套用 `20261014000000_mail_outbox` 與 `20261015000000_mail_scenarios`（新增 `ccTeam`，既有資料預設為 CC）migration，並使用更新的 Docker Compose。既有部署會先建置 `web` 與 `migrate`；`mail-worker` 使用同一個 tools image，`compose up` 一起啟動，無須更改 webhook 或 GitHub Actions 發布模式。
- worker 透過 runtime DB 憑證檔存取資料庫；不保存或傳送 Google SMTP 帳密，郵件功能不使用 `SETTINGS_ENCRYPTION_KEY`。既有部署的其他金鑰要求維持原樣。
- VM 需能對 Google SMTP 的 465／587 Port 建立出站連線。TLS 憑證檢查不可停用。worker 不提供對外 HTTP Port。
- `mail-worker` 每 5 秒查看待辦，使用資料庫鎖與 5 分鐘租約防止同時領取；中斷後可恢復。失敗延遲約 1、2、4、8 分鐘再試，最多 5 次。達上限後顯示失敗，管理員修正設定後可按「重新寄送」。
- 「SMTP 已接受」僅代表 Google SMTP 接受，不能證明郵件已到收件匣。SMTP 接受後程序中斷而未記錄成功時，重試可能重複寄送；固定 Message-ID 不等於保證收件端去重。
- 管理頁顯示最近 30 筆；資料庫保留全部寄送紀錄及內容，目前不自動清除。可查閱 Compose `mail-worker` 狀態與日誌；健康檢查確認 worker 能讀取設定並完成輪詢，不代表 Google 驗證或投遞成功。
- 本機獨立執行命令：`npm run mail:worker`，需明確指定測試資料庫；此命令會處理該資料庫中已啟用的寄信待辦，不能指向未授權環境。

未來新增通知種類時，新增事件產生位置、場景模板及收件規則即可沿用寄送待辦與 worker。

## 初版本地驗證（2026-10-14，以下為後續移除帳密模式前的紀錄）

程式碼狀態：`codex/admin-mail-settings`，基於 `a5f0e94` 加上本次未提交郵件功能變更；未 push／部署。

| 指令／檢查 | 結果 |
| --- | --- |
| `npm run db:generate` | 通過，Prisma Client 包含 MailDelivery |
| `DATABASE_URL=postgresql://postgres@127.0.0.1:55439/dns_units_test npm run db:migrate` | 全部 migration 在本次建立的隔離 PostgreSQL 15 測試實例通過；未使用正式資料庫 |
| `npm run lint -- --ignore-pattern '.claude/**'` | 通過；後續新增的 mail 測試檔亦單獨通過 ESLint |
| `UNIT_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/dns_units_test npm test -- --exclude '.claude/**'` | 最終 69 個測試檔、471 個測試全部通過，包含權限、加密、交易、三種申請入口、租約、重試、既有安全與部署測試 |
| `npm run build` | 最終通過，包含 TypeScript；中途新增測試的 Zone 型別錯誤已修正並重跑 |
| 使用非正式測試變數的 `docker compose --env-file /dev/null config --quiet` | 通過 |
| `node --conditions=react-server --import tsx scripts/mail-worker.ts`（隔離 DB、未配置郵件） | 子程序 smoke check 通過：讀取 runtime DSN 檔、更新 heartbeat、SIGTERM 正常退出；未連線 SMTP |
| `git diff --check` | 通過 |

初次未排除 `.claude/**` 的 `npm test` 誤掃其他 worktree 副本而失敗；初次全域 lint 同樣掃到副本而停止，改為上述排除方式，沒有改動那些 worktree。初次 PATH 的 libpq `initdb` 缺少 postgres 可執行檔，改用本機 PostgreSQL 15 完整工具組成功建立隔離實例。驗證後已停止本次測試資料庫。

未執行：Docker 容器建置／整合 smoke（本機 daemon 未啟動）、瀏覽器視覺驗證（依專案規則未啟動 demo）、真實 Google SMTP 投遞、GitHub CI、VM 版本及健康部署驗證。Google SMTP 在測試中使用 mock；正式設定、測試收件地址與寄信由管理員在介面上操作。

## 最終 relay-only 驗證（2026-10-14）

同一分支與 base，套用使用者要求後的最終未提交版本：移除帳密模式、帳密欄位、憑證加解密與 worker 的 SMTP auth；統一 server 端 IP 授權 relay。郵件設定 API 會拒絕帳密欄位。

- `npm run lint -- --ignore-pattern '.claude/**'`：通過。
- `UNIT_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/dns_units_test npm test -- --exclude '.claude/**'`：69 個測試檔、472 個測試通過。包含無憑證設定／測試寄信、transport 無 auth、TLS、禁止帳密欄位、權限及重試。
- `npm run build`：通過，含 TypeScript。
- 使用非正式測試變數的 `docker compose --env-file /dev/null config --quiet`、`git diff --check`：通過。
- 使用本次隔離 PostgreSQL，驗證後已停止。未啟動 demo、未實際寄信、未 push／部署；容器與正式 SMTP 投遞仍待部署環境驗證。

## 發布前依賴修正

PR #11 的初次 Verify 在 production npm audit 失敗：Nodemailer 8 的安全公告涵蓋原本選用版本。更新至 10.1.1，並以 npm override 統一 Auth.js 的 optional peer，避免留下舊版。專案登入不使用郵件 provider。

以修正後依賴重跑：production audit 0 vulnerabilities、472 項測試（隔離 PostgreSQL）、lint 與 production build 全數通過；使用真實 Nodemailer stream transport 產生 MIME 亦通過，沒有網路寄送。未降低 CI 安全門檻。

## CC 與測試輸入修正

每封通知與測試信的 CC 使用 admin 已儲存的「網管小組收件地址」清單，與寄件地址無關。CC 在寄送時讀取，因此更新設定也會套用到尚未寄出或重試的郵件。To 與 CC 相同時，SMTP envelope 去重；部分地址未被接受時保留重試，不標為成功，已接受的地址可能在重試時重複收到。

測試收件欄位可在通知停用時先填寫；寄送按鈕仍須等待設定儲存並啟用。測試信會寄給指定地址及 CC 網管小組收件地址。若設定多個網管地址，現行每個 To 各一封的通知都會帶上完整 CC 清單，因此網管成員可能收到多封同一事件通知。

本次驗證狀態：`codex/mail-cc-test-input`，基於 `ab15bb0` 加本次未提交修正。`npm run lint -- --ignore-pattern '.claude/**'` 通過；`UNIT_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/dns_units_test npm test -- --exclude '.claude/**'` 共 476 項通過；`npm run build` 在補上 SMTP accepted 地址型別後通過，worker 的 ESLint 亦再次通過；`git diff --check` 通過。新增涵蓋停用狀態下輸入欄位、通知及測試信 CC、部分收件拒收、To/CC 相同的實際 MIME/envelope 去重。未啟動 demo、未做瀏覽器視覺驗證或真實寄信，尚未 push／部署。

## CC 地址來源更正（2026-10-14）

使用者確認 CC 應使用現有「網管小組收件地址」，已更正 worker 與管理頁說明。分支 `codex/mail-cc-configured-recipients`，基於 `07d0ad8` 加本次未提交修正。

- `npm run lint -- --ignore-pattern '.claude/**'`：通過。
- `UNIT_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/dns_units_test npm test -- tests/mail.test.ts tests/mail.integration.test.ts`：18 項通過，使用本次新建隔離 PostgreSQL；涵蓋多個 CC、設定變更後的通知與測試信、部分拒收、權限與重試。
- `npm run build`（含 TypeScript）、`git diff --check`：通過。
- 無資料庫結構變更；未啟動 demo、未做瀏覽器視覺驗證、未實際寄信、未 push／部署。隔離資料庫於驗證後停止。

## 回覆地址（Reply-To）

所有通知及測試信以寄送當下已儲存的「網管小組收件地址」清單作為 Reply-To；多個地址均會列入。收件人按回覆時，郵件軟體會使用此清單。寄件地址仍維持原設定，不必因此建立寄件信箱；網管小組地址須可實際收信。此變更只影響更新後寄出的郵件，已寄出郵件的標頭不會改變。回信由既有郵件服務接收，DNS Manager 不讀取回信或更新申請狀態。

2026-10-15 本地驗證：`codex/mail-reply-to`，基於 `f0318b7` 加本次修正。`npm run lint -- --ignore-pattern '.claude/**'`、`UNIT_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/dns_units_test npm test -- tests/mail.test.ts tests/mail.integration.test.ts`（18 項）、`npm run build`（含型別檢查）、`git diff --check` 均通過。隔離 PostgreSQL 已停止；未啟動 demo、未實際寄信，無 migration。

## 場景模板與寄信給單位（2026-10-15）

分支 `claude/mail-templates`，基於 `0903e58` 加本次未提交變更：多場景模板、自訂模板、審核結果與清查活動通知、寄信給單位、收件地址標籤輸入、`MailDelivery.ccTeam` migration。

- 本機隔離 PostgreSQL 15（127.0.0.1:55439/dns_units_test，scratchpad 目錄）先 `prisma migrate deploy`，再 `UNIT_TEST_DATABASE_URL=… npx vitest run --exclude '.claude/**'`：69 個測試檔、485 項通過，包含舊設定升級、各場景變數限制、審核退回寄給申請人且不 CC、清查活動只寄給有效且有信箱的單位管理員、手動寄信與錯誤情況、指定模板的測試信。
- lint、production build 結果見 PR。未實際寄信；正式環境的審核／清查通知預設停用，需管理員啟用。
