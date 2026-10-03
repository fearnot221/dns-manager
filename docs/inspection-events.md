# 清查活動

全域 ADMIN／SUPER_ADMIN 在 `/admin/inspection-events` 管理名稱、開始日、結束日，包含新增、編輯、刪除及檢視歷史／未來活動。網域或單位 ADMIN 不因此取得全域活動管理權限。

使用者於 `/dns` 只看到目前活動名稱與起訖日期；沒有進行中的活動時顯示空狀態。公告在進頁面、視窗重新取得焦點及每分鐘重新取得。唯讀 `/api/inspection-events/current` 需要登入，只回傳目前活動的名稱與日期，不提供管理清單或 revision。

日期以 `Asia/Taipei` 的曆日判斷，包含起訖日；同一天開始、結束有效。重疊活動會拒絕，結束隔日可以開始下一個活動。排程變更使用交易鎖、revision 及交易內角色重驗，衝突回傳 409。

## 清查紀錄

- 隨時可清查，無活動或活動已結束都不限制既有清查權限。
- 管理端與單位成員入口均以伺服器時間判斷並保存 `eventId`、`eventName`、`eventClassified`。
- 活動中的紀錄顯示「活動期間清查：活動名稱」，其他時間顯示「非活動期間清查」。
- 活動名稱為當時快照，刻意不設刪除連動；活動改名、改期或刪除都保留歷史標記。重建同名活動會有新的 ID。
- 舊紀錄 `eventClassified=false`，顯示「舊紀錄（未標記活動）」；不把缺少快照解讀為非活動期間。
- API 不接受客戶端指定活動、清查時間或清查人；清查不改動 PowerDNS。

## 部署與驗證

部署需先套用 [migration](../prisma/migrations/20261004000000_inspection_events/migration.sql)，再啟動新版 web。未自動建立任何正式活動。

驗證日期：2026-10-04。驗證對象為本次清查活動實作的未提交工作樹；結果如下。

- `DATABASE_URL=postgresql://dns_test@127.0.0.1:55447/dns_units_test npm run db:migrate`：在新建隔離 PostgreSQL 15 資料庫套用全部 22 份 migration 成功。
- `UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55447/dns_units_test npm test`：66 個檔案、453 項測試通過，包含權限、來源檢查、日期邊界、併發、過期版本、活動快照與既有安全整合測試。
- `npm run lint`、`npm run build`：通過；build 包含 TypeScript 檢查。
- `git diff --check`：通過。
- local demo 未啟動，未進行瀏覽器視覺驗證；未推送、未部署、未連線正式 DNS 或資料庫。

同日發布前於 `codex/inspection-events`（基於 main `7e506f5`）重驗：lint、production build 與上述完整 453 項測試均通過；隔離資料庫 migration 檢查為 22 份、無待套用項目。第一次測試因隔離 PostgreSQL 啟動連接埠錯誤而連線失敗，改為 55447 後全部通過。上述未推送／未部署描述為初次驗證時狀態；本次發布的遠端 CI、合併與部署結果另於 PR／交付回報記錄。
