# DNS 歸屬申請

- 管理員也可使用「單位 DNS」、「申請 DNS」與「DNS 歸屬申請」，透過側欄切換實際加入的單位。
- 加入單位沿用學號名單：請單位管理員新增學號，或由系統管理員在單位管理新增自己的學號。全域管理權限不會自動成為任何單位的成員。
- 在「DNS 歸屬申請」填入既有 DNS 的網域、名稱、類型、解析內容、用途與聯絡資料，可一次送出多筆。網域及類型沿用申請規則。
- 歸屬以單一解析值為單位；同名稱／類型下的其他解析值不受影響。既有單位歸屬不會透過申請覆蓋，須先請系統管理員確認及處理。
- 申請會出現在既有「申請審核／申請紀錄」清單，並標示為歸屬申請。只有系統管理員可核准或退回。
- 核准時重新檢查申請人的帳號、單位資格、DNS 連線來源、解析值與歸屬資料版本；不符合時保留待審核狀態，請退回並重新申請。
- 核准會在同一資料庫交易中完成單位歸屬、聯絡資料、清查歷史、審核結果及操作紀錄。清查歷史包含申請編號、申請人、用途、備註及審核回覆，清查人為確認歸屬的管理員，活動分類依核准時間決定；舊清查保留。
- 核准與退回均不變更 PowerDNS 解析。核准後可從單位 DNS 的「清查」查看歷史，管理端亦可在該解析值下查看。
- 歸屬申請未新增專用送件郵件情境；審核結果沿用既有郵件設定，僅於已啟用相關情境時排入寄送佇列。

## 資料庫更新

新增 `DnsRequestOperation.CLAIM`，部署新版前須依既有部署流程執行 `prisma migrate deploy`。Migration 僅擴充 enum，不重寫既有申請或 DNS 資料。

## 本機驗證（2026-10-18）

驗證對象為 `codex/admin-workflows-ownership-claims` 本次變更：

- `npm run lint`、`git diff --check`：通過。
- `npm run build`：通過，包含 TypeScript 及新路由 `/requests/claim`。
- `UNIT_TEST_DATABASE_URL=<隔離資料庫> npm test -- --maxWorkers=2`：73 個檔案、558 項測試通過。
- 補上歷史保留與競爭核准測試後，`UNIT_TEST_DATABASE_URL=<隔離資料庫> npm test -- tests/units.integration.test.ts --maxWorkers=1`：114 項通過；應用程式來源無後續變更。
- `DATABASE_URL=<隔離資料庫> npx prisma migrate deploy`：在獨立 PostgreSQL 17.11 容器成功套用全部 migration，包含新增的 `CLAIM` enum。
- 未啟動 local demo，未做瀏覽器視覺驗證；未推送、部署或變更正式 DNS／資料庫。
