# API 文件

登入後由「使用說明 → API 文件」開啟 `/guide/api`，可查看所有操作、參數、存取條件、請求及回應結構。`GET /api/openapi` 提供同一份 OpenAPI 3.1.1 JSON，須有效登入，禁止快取。離線規格位於 [openapi.json](openapi.json)，可匯入支援 OpenAPI 3.1 的文件或 API 工具。

規格以 [OpenAPI 官方定義](https://spec.openapis.org/oas/v3.1.1.html) 為準。來源為 [document.ts](../lib/openapi/document.ts)，共用驗證規則直接由既有 Zod schema 轉換。其餘路由參數、回應及權限描述對照 handler／service 維護；跨欄位、並行版本與權限判斷以伺服器執行結果為準，不能只依 JSON Schema 判斷可執行操作。

## 驗證

業務 API 使用 Auth.js 的 HttpOnly session Cookie。HTTPS 為 `__Secure-authjs.session-token`，本機 HTTP 為 `authjs.session-token`；大型 Cookie 可能分段。沒有 Bearer token 或獨立 API key 登入流程。登入供應者與 CSRF 流程由 `/api/auth/*` 管理，實際可用供應者由部署設定決定。閒置登入到期後須重新登入。

所有業務 API 均須有效登入；`/healthz` 為公開健康探測，Auth.js 協定也可在登入前使用。角色、單位成員、網域與紀錄範圍限制詳列於每個操作的 `x-access`。無權限資源可能回傳 404，不能據此判定資料不存在。

寫入請求若帶有 `Origin`，必須符合應用來源（以 `AUTH_URL`／`NEXTAUTH_URL` 或請求 URL 判定）。目前規則允許沒有 `Origin` 的請求；Auth.js 寫入另外遵循其 CSRF／OAuth state／PKCE 協定。文件頁僅顯示與下載規格，不會直接執行 DNS、寄信、帳號或資料刪除。

## 維護及驗證

1. 變更 API 時同步更新 `lib/openapi/document.ts`。已停用端點保留 `deprecated: true` 與實際的 410；禁止建立網域的 POST 維持 405。
2. 執行 `npm run docs:openapi` 重新產生 `docs/openapi.json`。
3. 執行 `npx vitest run tests/openapi.test.tsx`。測試比對所有路由匯出的 HTTP 方法與文件，檢查路徑參數、唯一 operationId、schema 參照、產出檔同步與文件／下載的登入邊界。

測試不會建立連線到正式資料庫、寄信或寫入 DNS，也不會啟動 local demo。Auth.js catch-all 以具體協定路徑記錄，並透過 `x-source-route` 對應原路由。Next.js 自動提供的 HEAD／OPTIONS 不另列為業務操作。
