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

## 歸屬歷程、獨立指派與單位備註（2026-10-14）

對應程式碼：基底 `4c8a702`，分支 `codex/dns-ownership-history` 的本次未提交變更。

- DNS 歷程納入成功的歸屬儲存、指派與管理員清查事件，顯示允許欄位的前後值；延用紀錄權限、連線來源隔離、搜尋與分頁。歸屬事件不作為 PowerDNS 初始快照，也不會因單純儲存歸屬而新增清查紀錄。
- 指派單位移至每筆 DNS 的獨立按鈕，沿用系統管理員及正向網域限制；新增「尚未指派單位」狀態與篩選，以 `unitId` 判斷，與手填申請單位分開。
- 建立單位新增選填備註（最多 2000 字），保存至 `DnsUnit.note`、建立稽核及單位詳情。新增 migration `20261014000000_unit_note`，既有單位預設為空字串。

| 指令 | 結果與程式碼狀態 |
| --- | --- |
| `npm run db:generate` | Prisma Client 產生成功 |
| `DATABASE_URL=postgresql://dns_test@127.0.0.1:55438/dns_units_test npm run db:migrate` | 所有 migration（含新備註欄位）在新建隔離 PostgreSQL 15 通過 |
| `UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55438/dns_units_test npm test -- --exclude '.claude/**'` | 66 個測試檔、461 項通過，無跳過；包括備註持久化、儲存後查詢歷程、指派不修改 DNS／清查、權限與來源隔離 |
| `npm run lint -- --ignore-pattern '.claude/**'` | 通過 |
| `npm test -- tests/dns-management.test.tsx --exclude '.claude/**'`、`npx eslint tests/dns-management.test.tsx` | 修正新增測試缺少必要 prop 後，8 項通過且 lint 通過；其餘程式碼未變，重用完整測試結果 |
| `npm run build` | 最終版本通過，包含 TypeScript 檢查 |
| `git diff --check` | 通過 |

原始 `npm test`／`npm run lint` 掃入 `.claude/worktrees` 內其他 checkout 及其產物而失敗，因此以命令列排除該目錄重跑，未修改其他工作樹或驗證設定。中途 build 曾發現新增測試缺少必要的 `canDeleteInspections` prop；補齊後上述驗證皆通過。

隔離資料庫位於 `/tmp/dns-ownership-pg.Z9ADPO`，已停止。整合測試使用假的 PowerDNS；未操作正式 DNS／資料庫。未啟動 demo、未執行瀏覽器視覺驗證、未 push 或部署。上線時須套用上述 migration。

### 發布前同步 main（2026-10-14）

將 `origin/main` 的 `afb3e47` 合併至本次功能分支，逐一整合 DNS 列表、單位詳情與清查 UI 測試衝突，保留 main 新版搜尋、compact 按鈕及背景重新載入顯示。本次功能相對 main 仍限於上述 23 個檔案。

整合後重新執行 `UNIT_TEST_DATABASE_URL=postgresql://dns_test@127.0.0.1:55438/dns_units_test npm test -- --exclude '.claude/**'`：67 個檔案、458 項測試全數通過（main 已移除舊版檢視測試）。`npm run lint -- --ignore-pattern '.claude/**'`、`npm run build`（含 TypeScript）及 `git diff --check` 均通過。維持隔離資料庫與假 PowerDNS；本段僅記錄發布前本地驗證。

### CI 安全稽核修補（2026-10-14）

PR #9 第一輪 CI 的功能測試及 build 通過，但 production audit 發現既有 Next.js、sharp 與 source-map-js 高風險問題。將 Next.js／eslint-config-next 同步由 16.3.7 升至修補版 16.3.8，並更新 lockfile 中 sharp 至 0.35.5、source-map-js 至 1.2.2；未降低 CI 門檻或使用 force fix。參考 [Next.js 公告](https://github.com/advisories/GHSA-4jqv-mc3x-m676)、[sharp 公告](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)、[source-map-js 公告](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)。

以上述更新後工作樹重跑：`npm audit --omit=dev --audit-level=high` 顯示 0 vulnerabilities；完整隔離資料庫測試（同上命令）67 個檔案、458 項通過；lint、production build（含 TypeScript）及 diff check 通過。等待更新後 PR 的 GitHub Verify，不能沿用失敗的舊 CI。
