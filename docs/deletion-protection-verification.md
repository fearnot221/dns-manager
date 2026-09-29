# DNS 刪除保護驗證（2026-09-29）

對應程式碼：基底 `02b57a8` 上本次未提交工作樹，包含移除 DNS 變更紀錄／復原、新增刪除保護、表單、權限、測試及文件更新。未 push 或部署。

## 行為

- 移除 DNS 變更紀錄頁面、導覽、復原服務與專用樣式。舊查詢／復原 API 回傳 410，無法繞過刪除保護。
- 保留一般操作稽核與舊資料庫歷史資料，不執行刪表或清除資料。本次使用既有 SystemSetting，無新增 migration。
- 管理員可查看刪除保護狀態；只有現有 `isOwner` 認定的最高管理員可以設定／更換 12–256 字元的專用密碼。
- 每次刪除 DNS 解析值、Zone、核准刪除申請，以及透過編輯／核准變更移除或替換舊解析值，都須重新輸入密碼。純新增與 TTL 調整不需密碼。
- 尚未設定密碼時禁止上述刪除；不提供停用保護的開關。沿用原有角色及受保護紀錄權限。
- 儲存 scrypt 雜湊；API、瀏覽器與稽核事件不回傳密碼或雜湊。每帳號 15 分鐘內連續失敗 5 次會暫時限制驗證，計數不隨 DNS 交易回滾而消失。

## 驗證

| 指令 | 結果與範圍 |
| --- | --- |
| `DATABASE_URL='postgresql://postgres@127.0.0.1:55439/dns_units_test' npx prisma migrate deploy` | 通過；全新、隔離、本機 PostgreSQL 15 測試資料庫，僅套用既有 migrations。 |
| `UNIT_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55439/dns_units_test' npm test` | 最終 57 個測試檔、388 個測試全部通過，無跳過。涵蓋權限、密碼雜湊／輪替、API 驗證、PATCH 繞過防護、同源限制、並行設定衝突、持久化錯誤次數、單位刪除與資料一致性。PowerDNS 為隔離 mock。 |
| `npm run lint` | 通過；最後僅更新導覽測試預期值，另以 `npx eslint tests/navigation.test.ts` 通過。 |
| `npm run build` | 通過，包含 TypeScript；對應最終應用來源與設定。後續僅更新測試預期值及此文件。 |
| `git diff --check` | 通過。 |

整合測試曾發現 PostgreSQL advisory lock 的 void 回傳型別無法由 Prisma 反序列化，已加入明確文字轉型並通過重跑。新導覽項目對應的舊測試預期值亦已更新。

未啟動 local demo；表單已做伺服器渲染標記測試，但未做瀏覽器畫面／互動驗證。未連接正式 DNS、未修改正式資料庫、未設定正式保護密碼，也未驗證 VM 部署。部署後需由最高管理員先在「刪除保護」設定密碼，才能執行刪除。
