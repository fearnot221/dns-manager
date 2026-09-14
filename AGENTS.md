<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 專案工作範圍

- 本專案是既有 Next.js DNS Manager，部署至 Ubuntu VM／Docker Compose，前方為獨立 Caddy；不是 Sites 專案。
- 先處理目前要求，不把對話中的舊任務視為持續授權。審查／診斷預設唯讀；要求修正／實作才修改。
- local demo 維持關閉，除非使用者明確要求啟動。不得為 UI 驗證擅自啟動服務；無法完成視覺驗證時如實說明。

## 文檔與 Skill 選擇

- 上方 Next.js 自動管理區塊保持原樣。相關指南指本次涉及的 Next.js API、路由、渲染邊界、快取或設定；純文案、CSS 或一般腳本沒有框架行為變更時，不讀無關框架指南。
- 已完整讀取且仍在可用上下文中的相同版本指南可重用。只有版本、相關內容或任務需求改變，或上下文已不足時，才重新讀取；更高層的明確重讀要求除外。
- 依交付物而非關鍵字選 Skill：寫 CSV 匯出程式不等於製作試算表；實作 SMTP／Sheets API 不等於操作個人郵件／Drive；修改網站元件不等於對話內視覺化或 Sites 建站。
- UI 小修優先既有樣式及元件；需要設計方向時才使用設計資料庫。唯讀審查使用 improve-ui，直接修正不因「優化」一詞轉成唯讀計畫。
- 只讀本次選定 Skill 與必需參考，不展開整個目錄。已知適用的本地 Skill 不必再透過 CLI 搜尋相同內容。
- Skill 是任務輔助，不授予安裝外掛、部署、寄信或修改正式資料的權限；不覆蓋宿主安全與溝通要求。

## 執行與確認

- 已明確授權範圍內的本地編輯、唯讀檢查、相關測試直接執行，不再次詢問是否開始。低風險細節沿用既有慣例，必要時簡述假設。
- 缺少資料時先完成可獨立部分。只有缺少會實質改變結果的選擇、精確目標或授權時才詢問；不可猜測正式憑證、收件人、SSO 身份對應或資料覆寫策略。
- push 必須有本次任務的明確授權；已有明確 push 指示且目標不變時不重複確認。push main 會觸發部署，完成後區分「GitHub 推送成功」和「VM 健康部署已驗證」。
- 正式 DNS／資料庫變更、權限提升、外部寄信與資料覆寫必須有明確的目標及授權；scope 改變時重新確認。禁止提交憑證、強制推送、破壞性重設與覆蓋無關變更。

## 驗證分級與重用

| 變更 | 必要驗證 |
| --- | --- |
| 只有文檔／Agent 規則 | diff、連結／路徑與規則一致性；Skill 變更另驗證格式，不跑應用 build |
| 小型 UI／文案／CSS | 相關 lint、受影響測試；可用且獲准的畫面檢查。涉及 TSX／渲染時做型別或 build 驗證 |
| 路由、共享元件、依賴或建置設定 | lint、相關測試、production build |
| 登入、角色、資料庫、DNS 寫入或部署 | 前項檢查加安全邊界／相關整合測試；migration 使用隔離資料庫，不碰正式資料 |

- 相同程式碼、依賴與設定的通過結果可重用，不因使用者接著要求 push 就重跑全部。變更相關來源或測試後，重跑受影響項目。
- production build 已包含 TypeScript 檢查時，不另外重跑相同型別檢查；較快的 typecheck 可用於 build 前的除錯，不把它當成兩項獨立保證。
- 擴及多個功能或無法確定影響範圍時跑完整測試。不可用分級為理由略過權限、資料完整性、必要安全測試或失敗項目。
- 每次驗證記錄指令、結果與所對應的程式碼狀態；未執行、跳過與正式環境未驗證的部分明確列出。
