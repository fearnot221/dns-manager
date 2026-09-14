# Agent 規則調整紀錄

本次只修改 Agent 指導文件，沒有修改產品程式、正式資料、登入權限或部署設定。

## 專案內變更

AGENTS.md 的 Next.js 自動管理區塊保持原樣；在區塊外加入：

- 文檔按框架行為與版本選讀，不為純文案／CSS 讀無關指南。
- 依交付物區分 API 程式開發、試算表產物、外部帳號操作與對話視覺化。
- 低風險且已授權的本地工作直接執行；缺少重要選擇或敏感操作授權才詢問。
- push 需本次任務授權，不把舊對話當成持續部署授權。
- 文檔、UI、共享功能及安全／資料庫修改分級驗證；同版本結果可重用，不重複計算 build 內的型別檢查。
- 保留安全與資料完整性測試、隔離資料庫、禁止憑證入庫、保護使用者修改，以及 local demo 關閉狀態。

## 此電腦上的個人 Skill 變更

這些修改位於 `/Users/fearnot/.codex/skills`，不會隨 DNS Manager 的 Git push 安裝到其他電腦。

| Skill | 具體修改 |
| --- | --- |
| ui-skills-root | 只有需要選擇 UI 專家時才路由；優先本地描述，CLI 為缺少適用能力時的選用方式；已知小修不再多一層搜尋。 |
| baseline-ui | 限縮到既有 UI 小修；移除跨整段對話套用規則；沿用既有 CSS、元件與動畫依賴，不強制 Tailwind／motion／cn／特定 primitive；保留確認與無障礙需求。 |
| improve-ui | 限唯讀審查與明確要求的計畫，不再匹配直接修正；有計畫授權就繼續，審查完成不強制詢問；只在來源改變或證據不足時重讀，消除「可寫計畫但不能修改工作樹」的矛盾。 |
| ui-ux-pro-max | 限實質設計決策／研究；既有系統新頁面不強制產生 design system；參考文件、第二次搜尋與 native checklist 改為依需求；CLI 路徑不再依賴 Claude 專屬環境變數。 |
| .system/openai-docs | 本地設定審查先讀本地證據，官方知識查詢保留官方來源；移除離線編輯／build／mock 測試的 API key 前置要求；不因一般程式工作觸發產品文件流程。 |

沒有改變 Skills 的 implicit invocation 設定。自動匹配的實際效果需在新回合／重新載入後觀察，不以格式驗證代表已證明模型行為。

## 未改寫的上游規則

- 外掛快取中的 visualize 靜默規則、Plugin Management 的外部服務推斷、Spreadsheets 的資源讀取流程保持原樣。
- 專案已補上用途邊界，以降低誤選；這不等於改寫上游 Skill，也不能覆蓋更高層的宿主要求。
- 不建立同名副本、不停用整個外掛、不修改全域 config 或 node_modules。若日後要改上游流程，需維護明確的外掛來源版本並經受支援的安裝方式載入。
- `.system/openai-docs` 為本機修改，Codex 更新可能覆寫；其他個人 Skill 的重裝也可能覆寫修改。套用前原檔備份位於 `/Users/fearnot/.codex/skills-audit-backup-zkoddN`，應逐檔比較後恢復，不盲目覆蓋之後的新修改。

## 情境檢查基準

以下是人工核對的預期路由，並非已執行的端到端模型測試：

| 請求 | 預期行為 |
| --- | --- |
| 修改按鈕文案 | 直接小修，不查 UI 資料庫、不產生設計系統。 |
| 修正既有表單間距 | baseline-ui；沿用既有樣式，不新增套件。 |
| 唯讀審查頁面並給計畫 | improve-ui；直接交付已要求的計畫，不再次詢問是否寫計畫。 |
| 重新設計整個後台 | ui-ux-pro-max；必要時才用 router，保留產品身份與既有安全邊界。 |
| 修正對話框鍵盤操作 | fixing-accessibility；不因一般 UI 字眼載入全部設計 Skills。 |
| 新增 CSV 匯出 API | 一般 repository 開發，不因 CSV 字眼進入試算表排版流程。 |
| 串接 SMTP 或 Google Sheets API | 開發整合程式，不自動連接個人郵件／Drive，不實際寄信。 |
| 更改 AGENTS.md | 本地規則檢查；不因文件裡提到 UI 而啟動 UI Skills。 |
| 推送剛測完的版本 | 確認差異與遠端後推送；來源與環境未變時重用測試結果。 |

本輪驗證範圍：Skill frontmatter 格式、現有本地參考路徑、Next.js 管理區塊未變、diff 檢查，以及 Pro Max 本地搜尋 smoke test。不啟動 local demo，不操作正式服務。
