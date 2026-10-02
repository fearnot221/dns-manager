# DNS 歷程驗證（2026-10-03）

對應程式碼：基底 `98c066d` 上本次未提交工作樹；新增 `/api/dns-history`、DNS 管理歷程入口、快照轉換與 PowerDNS 連線來源欄位寫入。使用既有 AuditLog schema，沒有新增 migration。

| 指令 | 結果與程式碼狀態 |
| --- | --- |
| `npm run lint` | 通過；最終應用程式碼、歷程單元測試及兩項資料庫整合測試已加入 |
| `npm run build` | 通過；同上，包含 TypeScript 檢查 |
| `DATABASE_URL='postgresql://dns_history_test@127.0.0.1:55439/dns_units_test' npm run db:migrate` | 21 個既有 migrations 在新建的隔離資料庫全部通過 |
| `UNIT_TEST_DATABASE_URL='postgresql://dns_history_test@127.0.0.1:55439/dns_units_test' npm test` | 61 個測試檔、425 項測試全數通過，無跳過；包含新增→修改→刪除→重建的實際資料庫持久化、單位核准快照、權限與既有整合測試 |
| `npm test -- tests/dns-management.test.tsx tests/dns-history.test.ts` | 之後新增畫面入口測試，兩個測試檔共 13 項全部通過；應用程式碼未變 |
| `git diff --check` | 通過 |

隔離 PostgreSQL 位於一次性 `/tmp/dns-history-pg.G7H6kX`，驗證後已停止。所有整合測試均使用假的 PowerDNS，未碰正式 DNS 或資料庫。

未執行實際瀏覽器視覺檢查：依專案規則，local demo 保持關閉。未 push、未部署、未驗證正式 VM。

歷程從既有成功操作快照呈現，不可回溯沒有快照的早期變更，也不會自動捕捉其他工具直接操作 PowerDNS 的變更。已刪除紀錄可從網域歷程入口搜尋；同名同 type 重建沿用同一查詢身份。舊快照未記錄 PowerDNS 來源，畫面會明確標示；新來源有範圍隔離。
