# 整合狀態與正式驗收範圍

本文件描述目前程式能力，不把尚未操作的正式服務稱為已驗收。產品功能及權限請見 [README](../README.md) 與 [權限表](access-matrix.md)。

| 項目 | 目前狀態 | 部署／驗收要求 |
| --- | --- | --- |
| Logto／NCU Portal | 已實作 OIDC `openid identities`、身份同步及登出 | VM 設定應用 Secret，實際帳號驗證登入、身份來源與停用狀態；見 [Logto 指南](../deploy/LOGTO.md) |
| PowerDNS | 已實作環境設定、查詢、直接維護、申請核准與衝突保護 | 私有連線、API 憑證及 server ID；不使用網頁儲存設定 |
| PostgreSQL | 已實作單位、申請、清查、稽核與 DNS 復原資料 | 升級套用全部 migration，先在隔離環境驗證並備份 |
| GitHub webhook 部署 | 已實作簽章驗證、排隊、建置及 Compose 更新 | GitHub delivery 202 只代表排隊；另看 VM journal、commit 與 healthz |
| SMTP／寄信 | 未實作 | 本版本沒有電子郵件通知；申請電子郵件是聯絡資料，不代表寄信功能 |
| Google Sheets | 未實作 | 沒有工作表同步；未設定目標、方向、欄位或服務帳號，不假設可覆寫外部資料 |
| DNS CSV | 已實作系統管理員匯出 | 為人工檢視資料，不能取代 PowerDNS／資料庫備份 |

使用者訊息、清查通知與回覆管理已移除，不列為待補設定的現有功能。沒有背景清查排程或自動通知；若未來重新提出需求，須另行確認範圍。

既有 Logto 帳號不按 email 自動合併，owner 依驗證後的 identifier 決定，不需猜測 owner subject 才能登入。需要修復既有資料帳號綁定時才使用明確核對身份的維護工具。

自動測試使用隔離 PostgreSQL 與 mock PowerDNS；文件更新、CI 通過和 GitHub 推送都不代表 SMTP、Sheets、正式 SSO、Caddy 或 PowerDNS 驗收成功。密鑰只能在部署環境設定，不能放入 repository。
