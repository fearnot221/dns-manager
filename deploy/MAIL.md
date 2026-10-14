# 郵件服務

系統管理員由「系統設定 → 郵件服務」（`/admin/mail`）設定。預設停用；尚未設定時不寄信，也不回補設定前的申請。

## Google SMTP

1. 在 Workspace 管理控制台允許 VM 的固定公網出口 IP、限制寄件網域、要求 TLS，且不要求 SMTP 帳密驗證。系統統一由 server 透過 `smtp-relay.gmail.com` 寄送，預設 Port 587（強制 STARTTLS），不支援個別 Google 帳號登入。
2. 在 admin 填寫寄件名稱、寄件地址與網管群組信箱。寄件地址須符合 Workspace relay 的允許寄件者政策。多個收件地址以換行或逗號分隔，最多 20 個。
3. 調整模板並預覽，勾選啟用並儲存。不需要設定 Google 帳號、應用程式密碼或 OAuth。
4. 在測試區填入明確的測試收件地址，按「寄送測試信」。測試使用已儲存設定，會實際寄信；請更新紀錄並確認收件匣／垃圾郵件匣。測試須由已列入白名單的 VM 出站，其他來源可能被 Google 拒絕。

目前功能為申請通知寄送；收件信箱由既有郵件服務接收，本系統不讀取或儲存信箱內的郵件。

Google 官方說明：[SMTP relay 設定](https://support.google.com/a/answer/2956491)。

## 模板與通知

模板為純文字，不執行 HTML、JavaScript 或任意模板運算。支援以下變數：

| 變數 | 內容 |
| --- | --- |
| `{{applicationId}}` | 批次申請編號；修改／刪除為該筆 request ID |
| `{{applicantName}}` | 新增申請的聯絡人；修改／刪除優先顯示提出申請的使用者 |
| `{{unitName}}` | 資料庫中的單位名稱 |
| `{{recordCount}}` | 本份申請的 DNS 紀錄筆數 |
| `{{operation}}` | 新增、修改或刪除 |
| `{{submittedAt}}` | 台北時間的送出時間 |
| `{{reviewUrl}}` | 由伺服器 `AUTH_URL` 產生的 `/requests` 頁面，需要登入並通過原有權限檢查 |

一份申請對每個收件地址產生一筆通知，批次新增不逐筆寄送。申請及通知在同一資料庫交易提交；SMTP 故障不會讓已儲存的申請消失。

通知保存排入當時的寄件名稱／地址、收件地址、主旨及內文；修改設定不會改寫既有待辦。worker 使用最新 SMTP 連線設定；寄件地址須符合 Google Workspace relay 政策。

停用通知會停止新增待辦、暫停既有待辦；重新啟用後繼續處理。停用瞬間已進行中的寄送可能完成。重新啟用不回補停用期間的新申請。

## 部署與維運

- 套用 `20261014000000_mail_outbox` migration，並使用更新的 Docker Compose。既有部署會先建置 `web` 與 `migrate`；`mail-worker` 使用同一個 tools image，`compose up` 一起啟動，無須更改 webhook 或 GitHub Actions 發布模式。
- worker 透過 runtime DB 憑證檔存取資料庫；不保存或傳送 Google SMTP 帳密，郵件功能不使用 `SETTINGS_ENCRYPTION_KEY`。既有部署的其他金鑰要求維持原樣。
- VM 需能對 Google SMTP 的 465／587 Port 建立出站連線。TLS 憑證檢查不可停用。worker 不提供對外 HTTP Port。
- `mail-worker` 每 5 秒查看待辦，使用資料庫鎖與 5 分鐘租約防止同時領取；中斷後可恢復。失敗延遲約 1、2、4、8 分鐘再試，最多 5 次。達上限後顯示失敗，管理員修正設定後可按「重新寄送」。
- 「SMTP 已接受」僅代表 Google SMTP 接受，不能證明郵件已到收件匣。SMTP 接受後程序中斷而未記錄成功時，重試可能重複寄送；固定 Message-ID 不等於保證收件端去重。
- 管理頁顯示最近 30 筆；資料庫保留全部寄送紀錄及內容，目前不自動清除。可查閱 Compose `mail-worker` 狀態與日誌；健康檢查確認 worker 能讀取設定並完成輪詢，不代表 Google 驗證或投遞成功。
- 本機獨立執行命令：`npm run mail:worker`，需明確指定測試資料庫；此命令會處理該資料庫中已啟用的寄信待辦，不能指向未授權環境。

未來新增通知種類時，新增事件產生位置、模板及收件規則即可沿用寄送待辦與 worker；本版僅實作新 DNS 申請與管理員手動測試。

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
