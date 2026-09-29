# Web Application Security Audit

日期：2026-09-29（原稽核，Asia/Taipei）；2026-09-30 完成文件及後續修正
Repository：`dns-manager`
基準 commit：`b0de6fde39b1816569533568166f01dddcd58f18`；開始時 working tree 乾淨。
範圍：source code、configuration、lockfile、已安裝框架實作及公開安全公告。本次交付為本報告及 SECURITY_TEST_PLAN.md；沒有修改 application/configuration source。

未啟動 local demo／web server，未連線 production、PowerDNS、Logto 或任何資料庫；未執行 DNS 寫入、部署、migration、壓力測試或攻擊 payload。所有攻擊情境均為原始碼推演，**不是 production exploit 成功證明**。本文程式碼均為修補建議，沒有套用或測試。標示「設計片段」者不能當作完整可直接部署的 patch。

行號對應上述 commit，檔案路徑相對 repository 根目錄。OWASP 分類固定使用 **Web Top 10:2021**，必要時補充 **API Top 10:2023**，避免混用年份。

## Executive Summary

> **修正狀態（2026-09-30）**：本報告以下 finding/snippet/line 為基準 commit 的修正前證據。九項 source/config/dependency 修正與功能回歸結果已記於 [SECURITY_REMEDIATION.md](SECURITY_REMEDIATION.md)。正式環境尚未部署／驗證，不將 source 修正冒充 production 已安全；原未確認的 hypotheses 保留。

應用已有多層授權：proxy 初步驗證、`requireActor()` 重新查詢有效帳號與角色、服務層驗證單位／DNS ownership，以及 DNS 寫入鎖、版本 hash、刪除密碼與稽核。未找到可直接由匿名使用者修改 DNS、任意 SQL／shell injection、任意檔案上傳或明確 XSS 的完整攻擊鏈。

但存在下列可定位的缺陷／配置弱點。嚴重程度按成立前提評估；**不代表正式資料庫具有該前提**。

| ID | Severity | 發現 | 成立條件／確認程度 |
| --- | --- | --- | --- |
| SEC-01 | High | API 接受紀錄範圍授權，但實際授權遺失範圍 | 必須存在非全域使用者的受限網域 ADMIN grant；程式缺陷 High confidence，production grant 未查 |
| SEC-02 | Medium | 密碼登入缺少伺服器端嘗試限制 | 密碼 provider 啟用且有 password account；預設啟用，正式狀態未查 |
| SEC-03 | Medium | DNS 申請無筆數／累積配額，列表無分頁，形成資源放大 | 有效單位成員可以持續提交不同紀錄；容量影響待測 |
| SEC-04 | Medium | 已簽署 webhook 可換 delivery ID 重播部署 | 攻擊者須取得一份合法 body 與簽章；沒有 HMAC 偽造 |
| SEC-05 | Medium | 歷史個人申請核准／拒絕缺少原子狀態轉移 | 必須仍有 `unitId=null, status=PENDING` 的歷史申請及合法 reviewer |
| SEC-06 | Low | production CSP 允許 inline script | 防禦縱深弱點；未找到 XSS 注入點 |
| SEC-07 | Low | repository 的 HTTPS ingress 範例未設定 HSTS | 外部正式 Caddy 可能另有設定；待驗證 |
| SEC-08 | Low | Next.js 落在已公告 RCE 的受影響版本範圍 | 目前沒有可達的 `next/og ImageResponse` sink；不可評為本應用 Critical RCE |
| SEC-09 | Medium | Web runtime 與 PostgreSQL bootstrap superuser 共用帳號 | 新建資料庫依本 Compose 即成立；既有 DB 角色可能已人工降權 |

計數：Critical 0、High 1、Medium 5、Low 3。這包含條件式漏洞與防禦縱深／配置缺陷，不能解讀成九個已在正式環境重現的 exploit。

`npm audit --json --ignore-scripts` 回報 **0 vulnerabilities**，但人工核對官方公告發現 SEC-08；registry audit 不等於完整安全保證。優先確認 SEC-01 的實際授權資料、關閉不需要的密碼登入、補上資源限制及升級 Next.js。Logto connector claim 的可信來源亦應優先驗證，詳 H-01。

本次依補充要求重新確認 route→proxy/layout→handler→service→sink，增加逐入口表、authorization matrix、攻擊假設、攻擊鏈與獨立 dynamic test plan。前次分析適用於相同 commit，依賴掃描結果沿用；沒有宣稱本次重新跑了掃描或執行攻擊。

## Architecture

| 面向 | 實際實作與安全含義 |
| --- | --- |
| Framework/runtime | Next.js 16.3.4 App Router、React 19.2.0、TypeScript；production 為 Node 22 Debian slim、standalone server，不是 Edge deployment |
| Frontend | React client workbenches、server components/layout、next-auth/react、next-themes；DNS/contact/note 為 UGC，React JSX 輸出 |
| Backend/API | 31 app/api route modules + /healthz；Web Request/Response；Zod validation、lib service layer；非獨立 REST backend |
| Database/ORM | PostgreSQL 17 + Prisma 6.19.3；User/Account/Session/ZonePermission/GroupZonePermission、DnsUnit/UnitMember/UnitAllowlist、DnsRecordRequest/Metadata/Inspection、AuditLog/SystemSetting |
| Cache | PowerDNS fetch no-store；API/HTML cache 依 Next runtime 與 response headers；沒有 Redis/CDN 設定證據；DB/React client refresh 不等於共享 cache |
| Queue/worker | GitHub deployment 的本機 filesystem queue；Node drain worker + deploy.sh；無應用任務 broker／payment worker |
| Authentication | Auth.js v5 beta.32：credentials（可關閉）及單一 Logto OIDC；首次 OIDC 自動 provision User；無獨立 signup API |
| Session | encrypted JWE cookie + Session table 的 idleSessionId/expires；15 分鐘 server idle、8 小時可續期 JWE；不是純 stateless JWT |
| Authorization | owner SUPER_ADMIN、global ADMIN/USER、zone VIEWER/EDITOR/ADMIN、unit EDITOR/ADMIN；角色互相獨立，特定權限可疊加 |
| DNS integration | env-only PowerDNS REST API/key/serverId；上游 HTTP timeout 8 秒、redirect:error；zone name 編碼為 path component |
| Identity integration | 固定 HTTPS Logto issuer、discovery/token/UserInfo；identity connector attributes 決定 studentId/owner；CLI-only linking，不靠任意 supplied email |
| Deployment/admin | 外部獨立 Caddy → VM Caddy ingress → loopback web；Docker Compose migrations；owner-only delegation/deletion-password/inspection delete；global admin 管理帳號及單位 |
| Scheduling | webhook queue recovery interval 10 秒；沒有 cron HTTP endpoint／business scheduler |
| Local demo | non-production 且無 DATABASE_URL 才用 .local-demo JSON、demo passwords；本次未啟動 |
| Files/storage | 固定靜態 public PNG/SVG、local demo JSON、webhook queue；無 upload/object storage/bucket/cloud SDK |
| Payment/email/cloud | 未見支付、credits、優惠券、email provider/SMTP 寄信實作、雲端 metadata client；不捏造此類測試 target |

Production migration 使用共享 DB 身分，見 SEC-09。Prisma callback transaction 能原子化 DB 操作，但不能 rollback 外部 PowerDNS HTTP。deployer 的 docker group 具有高度 host 權限；app runner 的 non-root/no-new-privileges 不保護該 deployment 帳號。


## Trust Boundaries

```text
Browser/HTTP input → [TB1 TLS edge / proxy headers]
 → [TB2 VM source-IP allowlist / body size] → Next proxy
 → [TB3 cookie JWE / server idle / active DB user]
 → [TB4 global/zone/unit/object authorization] → service
 → [TB5 PostgreSQL parameterized queries / locks]
 → [TB6 PowerDNS REST / connectionScope / RRset snapshot]

Logto → [TB7 TLS token response + OIDC claim checks + UserInfo subject]
 → [TB8 connector attribute provenance] → local identity / owner / enrollment

GitHub → [TB9 signed body / event classification / dedupe]
 → filesystem queue → [TB10 fixed script / git branch / docker authority]
```

| Boundary | 外部輸入 | 已有保護 | 需要補查／弱點 |
| --- | --- | --- | --- |
| TB1/TB2 | Host、Origin、forwarded IP、bytes | AUTH_URL、ingress 固定 Host/Proto、來源 IP、2 MB | 外部 Caddy 正式配置、HSTS、TLS/private-hop、XFF 清洗未取得 |
| TB3 | cookie/JWT、credentials、OAuth code | JWE、idle DB、provider allowlist、disabled/removed 檢查 | password limiter、absolute lifetime、stolen session/re-enable 行為 |
| TB4 | zone/unit/user/request/record ids | per-route roles、membership/ownership、scope/hash | SEC-01；authorization snapshot 與 concurrent revocation 待測 |
| TB5 | Zod input、stored UGC | Prisma filters/tagged raw、strict schemas、row/advisory locks | runtime superuser、quota、歷史狀態轉移 |
| TB6 | normalized names/content、上游 JSON | env-only URL、encodeURIComponent、8 秒 timeout、no-store/redirect:error | 上游 rrsets 為 z.any，response size 未限制；DB/HTTP 一致性 |
| TB7/TB8 | discovery、ID token/UserInfo、identities | fixed issuer、ES384 algorithm constraint、state/nonce/PKCE、sub match | connector key 未限定、upstream configurable claim/delegation 未核對 |
| TB9/TB10 | signed webhook bytes、unsigned headers | HMAC constant-time、repo/ref、固定 script、exclusive queue file、flock | SEC-04 unsigned dedupe key；branch protection/host permissions未知 |
| Renderer/browser | DNS TXT/note/name/email | escaped JSX、fixed URLs、CSV formula escaping、DENY/nosniff | unsafe-inline CSP、cache、log/PII retention |

信任的第三方 API response 仍須驗證。`zoneSchema.rrsets = z.array(z.any())` 目前可能使 malformed PowerDNS response 造成例外或大量 renderer input，但需要上游控制權／失陷才能成立，沒有一般使用者→惡意 URL 的可達鏈，因此列入動態計畫而非新增 SSRF finding。


## Attack Surface

角色縮寫：**A**=任意有效帳號；**G**=global ADMIN/SUPER_ADMIN；**O**=經 Logto connector identifier 驗證的 owner；**Z**=目標 zone 的 ADMIN 或 G；**Ue/Ua**=目標 unit 的 EDITOR/ADMIN。G 不自動具備 unit edit membership。所有 protected API 須 active requireActor；mutation 須通過 proxy Origin（部分 handler 再檢查），標示 retired 者仍先經 proxy，所以 anonymous 通常 401 而非直接 410。Handler 路徑均為 repository-relative。

| Endpoint | Method | Auth Required | Role | Input | Sensitive Action | Handler |
| --- | --- | --- | --- | --- | --- | --- |
| /api/auth/[...nextauth] | GET/POST | protocol-specific | Auth.js | action/path/query/form、check/session cookies | 登入、登出、session 續期 | app/api/auth/[...nextauth]/route.ts → handlers → lib/auth/config.ts |
| /api/session/activity | GET/POST | Yes | A/self session | session cookie；POST Origin | 讀取/延長目前 idle session | app/api/session/activity/route.ts → touchIdleSession |
| /api/users | GET/POST | Yes | G | cookie；POST 目前不受理 | 全帳號 PII/角色列表；POST 405 | app/api/users/route.ts → accountPresentation |
| /api/users/[id] | PATCH/DELETE | Yes | PATCH G；DELETE O | id、note/disabled/globalRole；DELETE confirmId | 角色/狀態變更、帳號封存/撤權 | app/api/users/[id]/route.ts → db.$transaction/removeUser |
| /api/zones | GET/POST | Yes | GET Z；POST disabled | cookie | 授權 zone 清單；POST 405 | app/api/zones/route.ts → listZones/canManageZone |
| /api/zones/[zone] | GET/DELETE | Yes | GET Z；DELETE SUPER_ADMIN | zone；deletionPassword、confirm query | zone 資料/刪除 | app/api/zones/[zone]/route.ts → PowerDNS/zone lock |
| /api/zones/[zone]/records | GET/POST/PATCH/DELETE | Yes | Z；delete type/apex 再檢查 | zone/name/type/ttl/content(s)/hash/password | zone RRset 與 ownership PII、DNS 寫入 | app/api/zones/[zone]/records/route.ts → context/mutate |
| /api/zones/[zone]/permissions | GET/POST | Yes | O | zone；userId/userEmail/role/expiry/resourcePattern | 讀取/委派 zone grant | app/api/zones/[zone]/permissions/route.ts → permission upsert |
| /api/zones/[zone]/permissions/[id] | DELETE | Yes | O | zone、permission id | 撤銷已綁 zone permission | app/api/zones/[zone]/permissions/[id]/route.ts → delete |
| /api/zones/[zone]/applications | PATCH | Yes | Z | zone；enabled/expectedUpdatedAt | 網域申請開關 | app/api/zones/[zone]/applications/route.ts → setZoneApplicationAccess |
| /api/dns-requests | GET/POST | Yes | GET self/unit/Z/G；POST Ue/Ua | unitId/contact/records；cookie | PII/申請列表、建立待審項 | app/api/dns-requests/route.ts → prepareApplication/saveApplication |
| /api/dns-requests/zones | GET | Yes | A | cookie | 可申請 zone 名稱清單 | app/api/dns-requests/zones/route.ts → applicationZoneNames |
| /api/dns-requests/[id] | PATCH | Yes | unit G；legacy Z | id/decision/reviewNote/deletionPassword | 核准/拒絕、發布 DNS/metadata | app/api/dns-requests/[id]/route.ts → reviewUnitRequest/legacy branch |
| /api/units | GET/POST | Yes | GET member/G；POST G | create/name/managerStudentId | unit 列表/建立/管理人指派 | app/api/units/route.ts → listUnits/createUnit |
| /api/units/[id] | GET/PATCH | Yes | GET member/G；manage Ua/G；rename/delete/assign G | id/view；rename/delete/assign-manager/allowlist/member discriminated body | 成員學號/角色、單位/名單變更 | app/api/units/[id]/route.ts → unitDetail/manageUnit/manageAllowlist/editUnit |
| /api/units/[id]/changes | POST | Yes | Ue/Ua | unitId/recordId/purpose/hash/content/operation/ownership | 建立更新/刪除待審項 | app/api/units/[id]/changes/route.ts → requestUnitChange |
| /api/units/[id]/inspections | POST | Yes | 實際 unit member | unitId/recordId/hash/note/ownership/version | 聯絡 metadata/清查歷史 | app/api/units/[id]/inspections/route.ts → inspectUnitRecord |
| /api/inventory | GET/PUT | Yes | Z | record tuple/id/mode/contact/note/version | zone 範圍 PII/清查 metadata | app/api/inventory/route.ts → listInventory/saveInventory |
| /api/inventory/assignment | PUT | Yes | G | tuple/id/unitId/version | 轉移一筆 live DNS 的 unit ownership | app/api/inventory/assignment/route.ts → assignRecordUnit |
| /api/inventory/inspections/[id] | DELETE | Yes | O | inspection id/recordId/version | 刪除清查歷史 | app/api/inventory/inspections/[id]/route.ts → deleteInspection |
| /api/application-policy | GET/PUT | Yes | GET A；PUT G | allowedTypes/UNIT_ONLY/version | 全站申請規則 | app/api/application-policy/route.ts → saveApplicationPolicy |
| /api/admin/deletion-protection | GET/PUT | Yes | GET zone manager/G；PUT O | password/confirmation/version | 保護密碼設定/hash | app/api/admin/deletion-protection/route.ts → saveDeletionPassword |
| /api/admin/dns-export | POST | Yes | G | cookie/Origin/signal | 匯出全 DNS/contact/inspection CSV | app/api/admin/dns-export/route.ts → describeRecords/csvRow |
| /api/audit | GET | Yes | G | q/action/status/page | system audit/PII | app/api/audit/route.ts → Prisma where/redactAudit |
| /api/system/health | GET | Yes | SUPER_ADMIN | cookie | PowerDNS 連線狀態/資料量 | app/api/system/health/route.ts → listZones |
| /api/contact | GET/POST/PATCH | proxy Yes | retired | body 不消費 | 410，無讀寫 | app/api/contact/route.ts → retired |
| /api/inspection-tasks | GET/POST/PATCH/DELETE | proxy Yes | retired | body 不消費 | 410，無讀寫 | app/api/inspection-tasks/route.ts → retired |
| /api/admin/allowlist | GET/POST/DELETE | proxy Yes | retired | body 不消費 | 410，無讀寫 | app/api/admin/allowlist/route.ts → retired |
| /api/admin/powerdns | GET/POST/PUT | proxy Yes | retired | body 不消費；不保存 key | 410，無讀寫 | app/api/admin/powerdns/route.ts → retired |
| /api/dns-changes | GET | proxy Yes | retired | cookie | 410，無讀寫 | app/api/dns-changes/route.ts → GET |
| /api/dns-changes/[id]/restore | POST | proxy Yes | retired | id/body 不消費 | 410，無復原 | app/api/dns-changes/[id]/restore/route.ts → POST |
| /healthz | GET | No | public | 無業務輸入 | 固定狀態，DB SELECT 1 | app/healthz/route.ts → GET |
| /hooks/github | POST | HMAC signature | configured repo/ref | raw body/signature/event/delivery headers | queue→deploy→Docker | deploy/webhook.mjs → validateDelivery/drain |

### Auth.js action 子入口、Server Action 與框架入口

catch-all 不代表所有 path 都有效；action/provider 由 Auth.js dispatch。以下是有意義的外部子入口，未註冊 provider（google/ncu-portal/email/webauthn）不能因 library 含 code 就視為本應用可用。

| Endpoint | Method | Auth Required | Role | Input | Sensitive Action | Handler |
| --- | --- | --- | --- | --- | --- | --- |
| /api/auth/providers | GET | No | public | query/cookie | 揭露可用 provider 公開 metadata | handlers → AuthInternal/providers |
| /api/auth/csrf | GET | No | public | cookie | mint CSRF cookie/token | handlers → createCSRFToken |
| /api/auth/signin /signin/logto | GET/POST（依 action） | No；POST CSRF | public | callbackUrl、CSRF cookie/form | 開始登入/轉 issuer | handlers → signin/authorization-url |
| /api/auth/callback/credentials | POST | CSRF；password provider enabled | public | email/password/csrfToken | password authentication | handlers → credentials authorize |
| /api/auth/callback/logto | GET | state/PKCE/nonce | public callback | code/state/error/check cookies | token exchange、provision/link/session | timed → Auth.js OAuth callback → signIn/jwt |
| /api/auth/session | GET/POST | cookie；POST protocol CSRF | self session | JWE cookie；POST supplied session | 讀取/续期；custom jwt 不接受 client role | handlers → session → jwt/session callbacks |
| /api/auth/signout | GET/POST | POST CSRF；cookie | self | csrfToken/callbackUrl/cookie | cookie 清除 + idle revoke | handlers → signout → events.signOut |
| workspace document URL + Next-Action | POST | framework Origin + own session | self logout | action id/cookie/headers | local logout + fixed Logto end-session redirect | lib/auth/logout-action.ts:8–15 |
| /_next/image | GET | No（framework） | public | url/w/q | framework image fetch/optimize；目前 brand unoptimized | Next image optimizer；非 app route，配置/default local patterns 待驗證 |
| /_next/static/* /favicon.svg /ncu-emblem.png /其他 public | GET/HEAD | No | public | asset path | 固定靜態檔案 | Next static/public serving |
| page URL + RSC/router headers/search | GET | same server auth as page | 按頁面 | _rsc、Next-Router-State-Tree、Accept、prefetch | server component payload/render | Next App Router → layout/page |

### HTML / redirect 頁面入口

| Endpoint | Method | Auth Required | Role | Input | Sensitive Action | Handler |
| --- | --- | --- | --- | --- | --- | --- |
| / | GET | optional cookie | public | cookie | /dashboard 或 /login redirect | app/page.tsx |
| /login | GET | No | public | error/reason、cookie | 固定訊息、登入 UI；有效 session redirect | app/login/page.tsx |
| /dashboard | GET | Yes | A | cookie | 依管理能力導向固定路徑 | app/dashboard/page.tsx |
| /dns | GET | layout/page Yes | A；G redirect units | cookie | unit DNS UI | app/(workspace)/dns/page.tsx |
| /requests | GET | Yes | A | cookie | 自己的/授權申請 UI | app/(workspace)/requests/page.tsx |
| /requests/new | GET | Yes | non-G UI；API仍需 unit member | cookie | 申請 form | app/(workspace)/requests/new/page.tsx |
| /units | GET | Yes | Ua/G | cookie | unit management UI | app/(workspace)/units/page.tsx |
| /zones | GET | Yes | zone manager/G | domain query | DNS management UI，API重驗 zone | app/(workspace)/zones/page.tsx |
| /zones/[zone] | GET | Yes | Z | zone | encoded same-origin redirect | app/(workspace)/zones/[zone]/page.tsx |
| /inventory | GET | Yes | zone manager/G | cookie | redirect /zones | app/(workspace)/inventory/page.tsx |
| /activity | GET | Yes | G | cookie | audit UI | app/(workspace)/activity/page.tsx |
| /admin/users | GET | Yes | G | cookie | account UI | app/(workspace)/admin/users/page.tsx |
| /admin/application-policy | GET | Yes | zone manager/G；policy write G | cookie | settings UI | app/(workspace)/admin/application-policy/page.tsx |
| /admin/deletion-protection | GET | Yes | zone manager/G；configure O | cookie | settings UI | app/(workspace)/admin/deletion-protection/page.tsx |
| /admin/allowlist /admin/powerdns /contact /inspections | GET | proxy/layout | retired | cookie | 404，不讀歷史資料 | 各對應 app/(workspace) page.tsx → notFound |

不存在的 surfaces：獨立 signup/reset/verify-email/upload/import-URL/GraphQL/WebSocket/JSON-RPC/cron/debug/metrics/swagger/actuator business endpoint。Node CLI seed/reset/link/unlink/create-test-user 不是 HTTP endpoint；需要 operator shell/env，無 app code path 可用 browser 指定執行。未啟動 dev server，不能由 repo 推斷正在暴露 dev HMR/inspector。

`proxy.ts:15` covers `/api/:path*` 但 `/api/auth/` 提前交給 Auth.js；`/dns` 頁面在 `app/(workspace)/layout.tsx` 與 page 重新 requireActor。Route Handler 不繼承 layout，已分別檢查。未支援方法由 Next 回 405，HEAD/OPTIONS 的框架合成行為列入測試，不作另一个敏感 mutation。

### User-Controlled Input → Sink

| 使用者輸入 | Validation / business logic | Sink 與判斷 |
| --- | --- | --- |
| email/password | credentialsSchema → normalized email → User.findUnique → disabled/removed check → scrypt verify | 建立 idle session/JWE；密碼不回傳；SEC-02 |
| OAuth code/state | Auth.js callback → OIDC validation → logtoIdentity → subject comparison → account lookup | issuer+sub hash email 綁定，不信任 email 自動授權；connector source 仍需 H-01 驗證 |
| route zone、record name/type/content | requireActor → normalized zone → canManageZone → strict schema → normalizeDnsName/content → RRset hash | 編碼 path component、JSON HTTP body → 固定 env PowerDNS；無 user URL、shell 或 SQL 拼接；SEC-01 |
| application.records、unitId、contact | schema → zone 開放清單 → canonical DNS → uniqueness → active user/unit locks → policy/unitAccess | Prisma createMany + audit 同一 serializable transaction；unit name 由 DB 覆寫；SEC-03 |
| request id/decision | route schema → reviewUnitRequest → global admin → unit lock → PENDING → membership/scope/metadata/current DNS | PowerDNS mutation + metadata/audit/status；不是跨 HTTP/DB 原子交易；legacy 分支 SEC-05 |
| unitId/recordId/expectedHash | active user/unit → source.unitId 比對 → recordId(connectionScope, tuple) → live RRset | 建立 UPDATE/DELETE request；一般成員不能直接發布 DNS |
| user id/role/disabled/note | global admin → strict schema → owner guard → serializable | 僅白名單欄位 User.update；不能 mass-assign passwordHash、email、studentId 或 SUPER_ADMIN |
| contact/purpose/note/DNS TXT | schema 長度限制 → Prisma → DTO → React JSX text | 未見 dangerouslySetInnerHTML、innerHTML、template eval；CSV 另以 csvCell 處理公式與引號 |
| webhook bytes/headers | 2 MB → HMAC raw bytes → JSON.parse → repo/ref/delivery 格式 | queue filename → 固定 `/bin/bash [script]`，request 不進 shell；delivery 不是 signed identity，SEC-04 |
額外來源：headers 的 Origin/Host/XFF/User-Agent/requestId、cookie chunks/check cookies、page searchParams、DB 已存 contact/note/rrset snapshots、第三方 discovery/token/UserInfo/PowerDNS JSON。User-Agent 長度截斷；auditMutation 自產 requestId；不能信任 raw XFF 除非 trusted edge 已覆寫。renderer/source 沒有把 `domain` query 拼為 HTML、JS 或 outbound URL。


## Authentication Model

### Login / provisioning

credentials path：CSRF protocol → schema（password ≤256）→ normalized email → DB active-user lookup → scrypt → new UUID idle session → encrypted cookie。沒有 remember-me checkbox／額外長效 token。UI submitting/ref 只防重複點擊，不能作 rate limiting。不存在 account/無 passwordHash/disabled 會短路跳過 scrypt，generic error 不能消除 timing 差異；此為 LIKELY enumeration hypothesis，需少量 staging 樣本確認，並非已證實 account takeover。

Logto 初次登入可自動建立 account（沒有獨立 signup endpoint）；缺 identifier 的 identity 可為一般 USER，不能直接以 email/name 宣告 owner。角色在 API 讀取時重新解析 DB，避免只依 stale JWT role。Hash email issuer+sub 是 identity key，不代表聯絡 email 已驗證；聯絡 email 不作授權憑據。

### Password / reset

`lib/auth/password.ts:7–23`：128-bit random salt、64-byte scrypt output、timingSafeEqual；Node 未傳 options 使用預設 N=16384/r=8/p=1。沒有保存 hash cost metadata，因此無法原位從 encoded value 區分日後成本變更；建議明訂、benchmark/逐次 rehash。一般 hashPassword 至少12字，bootstrap 至少16字；create-test-user 以24 random bytes 產生192-bit entropy password。沒有 reset token 或 email-verify endpoint，不能分析不存在 token 的 expiry/reuse。CLI reset-all-users 為高權限 maintenance，非 password reset API。

### Session / cookie lifecycle

- Auth.js session cookie HTTPS 時 `__Secure-authjs.session-token`，HttpOnly/Secure/SameSite=Lax/path=/；CSRF cookie使用 `__Host-`。部署固定 HTTPS AUTH_URL，正式 header 仍待測。
- 登入新建 crypto.randomUUID idleSessionId（約122 random bits）、server Session row；不是沿用 supplied session id。cookie JWE refresh 不一定旋轉 idle ID；舊 cookie只要 idle row 有效仍可能可用，這不是一次性 token。
- jwt callback 每次驗證 idle row/expires，讀 idle 不延長；`POST /api/session/activity` 原子延長仍有效的 row，不能復活 expired session。
- `maxAge=8h` 為 JWT/cookie expiry；已安裝 core/session 會更新 cookie/JWE expiration。沒有額外 original-login-at absolute 期限，所以持續 heartbeat/session refresh 可延長登入；不是已證實8小時硬性logout。
- signOut event revokeIdleSession，使同一 idle ID 的舊 JWE在 requireActor 路徑失效；其他 concurrent sessions 仍保留。removeUser/unlink CLI 刪所有 user sessions。單純 disabled PATCH 不刪 sessions，reenable behavior 須政策確認。
- idleSessionId 在 `/api/auth/session` DTO 可見，但沒有 route 可直接提交他人 idle ID 更新；heartbeat 從自己的 auth() session 取值，不構成 IDOR。client supplied session update沒有被 jwt callback當角色/identity寫入。

### 本站 JWT/JWE

已安裝 `@auth/core/jwt.js` 使用 `dir` + A256CBC-HS512、HKDF(AUTH_SECRET,cookie-name salt)，decode 限定 key-management/content-encryption algorithms並驗證時間。A256GCM decode 相容不代表 alg=none 可用。沒有跨應用 JWT API、JWT refresh-token endpoint；不把本站 JWE未設 iss/aud 自動判為漏洞，信任邊界是本app secret+cookie salt+server session。proxy getToken可讀 Bearer，但 requireActor/auth()依 session cookie，不能只帶 bearer bypass；需動態驗證回應一致。

### OAuth / OIDC

`checks:[pkce,state,nonce]`、fixed issuer、client_secret_basic、ES384 algorithm約束；callback code交換用固定 provider.callbackUrl，default redirect callback只接受同源；userinfo sub必須等於ID token sub。`idToken:false` 代表使用 UserInfo映射，**不代表停止OIDC claim checks**。account()返回空物件，不持久保存 access/refresh tokens；本次 ID token放加密session以供end-session，沒有放 public session DTO。

精確驗證界限：安裝的 Auth.js callback 呼叫 oauth4webapi `processAuthorizationCodeResponse`，检查 issuer/audience/exp/nonce/alg/authorized party；沒有另呼叫 `validateApplicationLevelSignature` 以JWKS做backchannel ID token JWS驗簽。oauth4webapi 的[官方介面文件](https://github.com/panva/oauth4webapi/blob/main/docs/functions/validateApplicationLevelSignature.md)與本地index.d.ts 說明，直接TLS backchannel可依TLS驗證issuer，該额外驗簽用於更强訊息保障。因此不是「browser提供任意JWT即登录」；token response源自configured IdP HTTPS。discovery endpoints是否全部HTTPS需staging核對，library allowInsecureRequests本身不等於目前用HTTP。

`allowDangerousEmailAccountLinking:true` 只用本地derive的issuer+sub hash email，不採信任意profile email；不能僅依旗標判成email takeover。operator手工link會綁指定sub，因此以身份核對/CLI ACL為額外邊界。舊ncu-portal provider只有code、未註冊，不測第三方舊Portal。

### Logout / MFA

logoutAction讀取本session encrypted cookie，先撤銷本地登入再轉固定Logto end-session；post_logout_redirect_uri由validated AUTH_URL生成，不接受user target。id_token_hint會出現在前往IdP URL，應避免edge access log完整記錄該query，但本次沒有log證據。MFA/auth_time/acr policy由Logto決定；本站沒有MFA設定/step-up，不宣稱IdP不存在MFA。高權限刪除密碼是應用額外密碼，不是MFA。


## Authorization Model

requireActor先auth()、provider allowlist、server idle，再DB User active狀態、有效zone permission/group permission；每次不單靠token.globalRole。unit學生加入只讀stored studentId且唯一active身份；member→record需unitId equality + connectionScope-derived recordId。Global ADMIN管理其他ADMIN是文件明訂授權，不算vertical escalation；owner專屬權限仍獨立。

### Authorization Matrix

下表為**由程式推導的回應／權限，尚非HTTP實測**。User欄表示無global權限的普通帳號，可擁有表中指定unit/zone角色；Other User表示不在同unit／不持有目標zone grant的另一普通帳號。mutation的cross-origin可先403；因此表內401/404/403是同源有效格式請求的預期。retired routes的method集合見Attack Surface。

| Route | Anonymous | User | Other User | Admin | Expected |
| --- | --- | --- | --- | --- | --- |
| /api/session/activity GET/POST | 401 | self only | 不可touch別人 | self only | 目前session |
| /api/users GET | 401 | 403 | 403 | G全列表 | 管理員PII |
| /api/users POST | 401 | 403 | 403 | 405 | 不可web建立password user |
| /api/users/[id] PATCH | 401 | 403（含self） | 403 | G可改非owner；owner僅note | USER/ADMIN whitelist，無SUPER_ADMIN self授權 |
| /api/users/[id] DELETE | 401 | 403 | 403 | O only | 封存/revoke，不任意hard delete |
| /api/zones GET | 401 | 403或依zone ADMIN grant | 僅自己授權zone | G全部 | 列表server filter |
| /api/zones POST | 401 | 405 | 405 | 405 | disabled；auditMutation無敏感write |
| /api/zones/[zone] GET | 401 | 404除非Z | 其他zone 404 | G允許 | zone-bound |
| /api/zones/[zone] DELETE | 401 | 404 | 404 | SUPER_ADMIN + password/confirm | global ADMIN不能刪zone |
| /api/zones/[zone]/records GET/POST/PATCH/DELETE | 401 | 404除非zone ADMIN | scope外應拒絕；SEC-01 | G允許；delete guard | VIEWER/EDITOR也不能過context；apex SOA/NS限SUPER_ADMIN |
| /api/zones/[zone]/permissions GET/POST | 401 | 404 | 404 | O only | 不能G自行delegation |
| /api/zones/[zone]/permissions/[id] DELETE | 401 | 404 | 404 | O且id+zone匹配 | permission BOLA防護 |
| /api/zones/[zone]/applications PATCH | 401 | 404除非Z | 其他zone404 | G允許 | zone setting版本控制 |
| /api/dns-requests GET | 401 | 本人及unit | 不同unit資料不可見；Z另有zone scope | G全部 | membership+zone policy，不是單純self |
| /api/dns-requests POST | 401 | 有效Ue/Ua | 其他unit403 | G也需實際membership | 申請不直接DNS寫入 |
| /api/dns-requests/zones GET | 401 | 開放zone名 | 同公開給有效使用者 | 同左 | 不回rrsets/keys |
| /api/dns-requests/[id] PATCH unit | 401 | 403（含申請人） | 403 | G；檢查submitter仍member | unit ADMIN不能核准 |
| /api/dns-requests/[id] PATCH legacy | 401 | 404除非Z | 非授權zone404 | G/Z；SEC-05 | 申請人不能自核准 |
| /api/units GET | 401 | 自己的units | 不回其他unit | G全部 | unit filter |
| /api/units POST | 401 | 403 | 403 | G | 不能以unit ADMIN當global ADMIN |
| /api/units/[id] GET dns | 401 | member | nonmember403 | G | 只回目標unit的DNS/contact |
| /api/units/[id] GET view=manage | 401 | Ua；EDITOR403 | 403 | G | 同unit管理範圍 |
| /api/units/[id] PATCH member/allowlist | 401 | Ua only | 別unit403 | G | unit role only；last admin guard |
| /api/units/[id] PATCH rename/delete/assign-manager | 401 | 403（含Ua） | 403 | G | global維運功能 |
| /api/units/[id]/changes POST | 401 | Ue/Ua + source belongs unit | 403或404 | G非member也拒絕 | ownership再驗證 |
| /api/units/[id]/inspections POST | 401 | 實際member | 403或404 | G非member也拒絕此入口 | G可用inventory管理入口 |
| /api/inventory GET | 401 | zone ADMIN所屬zone | 非授權zone不回 | G全部 | 避免所有zone PII泄露 |
| /api/inventory PUT | 401 | Z | 其他zone404 | G | tuple/hash/live/version |
| /api/inventory/assignment PUT | 401 | 403 | 403 | G | source/target unit與version |
| /api/inventory/inspections/[id] DELETE | 401 | 403 | 403 | O only | inspection.recordId匹配 |
| /api/application-policy GET/PUT | 401 | GET允許/PUT403 | 同左 | G PUT | schema不允許個人ownership |
| /api/admin/deletion-protection GET/PUT | 401 | GET zone管理者/PUT403 | 同左 | G GET/O PUT | 不回passwordHash |
| /api/admin/dns-export POST | 401 | 403 | 403 | G | 全站匯出限定G |
| /api/audit GET | 401 | 403 | 403 | G | global稽核 |
| /api/system/health GET | 401 | 403 | 403 | SUPER_ADMIN only | 詳情不可public |
| retired contact/inspection-tasks/admin allowlist/pdns/dns-changes routes | 401 | 410 | 410 | 410 | 無歷史資料sink |
| /healthz GET | 200/503固定狀態 | 同左 | 同左 | 同左 | 不回internal DSN/stack |
| /hooks/github POST | HMAC有效才queue | 網站session無助 | 同左 | 同左 | 獨立簽章信任，非app角色 |
| logoutAction POST | 只清自身或no-op | 只自己的cookie | 不可指定另一人session | self only | Next Origin+自己cookie |

### Object identifiers / role manipulation

- userId：僅global admin PATCH指定非owner、owner DELETE；email/studentId/passwordHash/accounts不是可更新欄位。
- zone / permissionId：正規化zone、owner gate、DB permission findFirst(id,zoneName)；recordMutation沒有別的tenant id能重指定。
- unitId / member userId / studentId：unitAccess role、active unit、locking、唯一學號解析；member操作只能改unit role、不能指定globalRole。
- requestId：unit request只能G reviewer；approval再查active submitter、membership、source.unitId/scope/version；legacy race是不同分支。
- recordId：sha256(scope,zone,name,type,content)只是identity，並非permission；service另外unit/zone授權及live value比對。
- inspectionId：owner gate且inspection.recordId必須等於body recordId；不能以合法record版本刪另一record history。
- 不存在tenant/project/order/invoice/file_id業務物件，不從不存在模型假設IDOR。

### CSRF / CORS / hidden endpoints

proxy覆蓋一般API的POST/PUT/PATCH/DELETE Origin；records/delete、users、unit、inventory、policy、heartbeat等handler亦檢查；permissions與application submit仍依proxy。缺Origin回true是已知設計，尚不能單獨等同CSRF：browser跨站POST、cookie SameSite=Lax、JSON/form parsing及Auth.js token需一起測。Referer未作fallback、沒有一般API CSRF token；同源XSS可繞過Origin故不作其防護承諾。auth子routes由Auth.js CSRF管理，logout Server Action由Next Origin及自己的cookie管理。

未見Access-Control-Allow-Origin/Credentials配置或動態reflect Origin。Next的OPTIONS不等於授權credentialed跨源讀取；staging應分別檢查正常/錯誤/preflight response，含same-site不同subdomain。

### Security coverage / rejected false positives

1. **Authentication**：login/logout、JWT、OIDC、idle session 已追蹤。JWE 使用 Auth.js `jwtDecrypt`、限制 alg/enc 並驗證有效期；不能因名稱 JWT 推論未驗簽。Session callback 不暴露 Logto ID token；logout 從 encrypted cookie 取得 token、撤銷本站 session 後轉固定 issuer。無本地 password reset/email verification/MFA 流程；VerificationToken table 本身不代表有可呼叫功能。MFA 是否在 Logto 強制要求未知。密碼 hash 為 random 16-byte salt + scrypt + timingSafeEqual，未見 plaintext password storage。scrypt 成本使用 Node 預設值，日後應明訂且 benchmark，但不將其當作已破解漏洞。
2. **Authorization**：object id 不作唯一授權依據；unit、inspection、assignment 有關聯檢查。帳號角色變更重新讀 DB，USER/ADMIN 的分工符合 access matrix；ADMIN 可指派其他 ADMIN 是既定政策，不誤判 vertical escalation。SEC-01 是例外。
3. **Injection**：Prisma filters 與 `$queryRaw` tagged templates 的輸入為參數；未見 Unsafe raw SQL。無 Mongo/NoSQL、LDAP、user template execution、eval 或物件反序列化 gadget。JSON.parse 僅解析資料，不能單獨認定 unsafe deserialization。部署 spawn 使用固定腳本及 shell:false；git target 來自受信任 env，不是 webhook body。
4. **Web vulnerabilities**：未見完整 stored/reflected/DOM XSS 鏈。mutation Origin 檢查接受無 Origin，但 SameSite=Lax cookie、標準跨站 POST Origin、Auth.js CSRF 使「省略 Origin 即 CSRF」不足成立；須 staging browser 驗證。PowerDNS URL 僅環境設定、redirect:error、path encode，無一般使用者 SSRF。Auth.js callback URL 預設只接受同源／相對路徑，固定 logout origin；未見 open redirect。檔案路徑不來自 browser。
5. **File handling**：無 upload/multipart/object storage route；MIME/type upload bypass、file inclusion 不適用。local-store 限非 production、固定 name pattern、0700/0600 與 atomic rename。public 僅靜態素材，未見敏感檔案。
6. **API security**：多數 mutation strict schemas、DTO、server-side role/object check；SEC-03 涵蓋無配額與無分頁。audit pagination 有上限但大 offset 仍需容量測試。無 GraphQL endpoint。
7. **Secrets/configuration**：目前 tracked tree 未找到真實 key/credential 的明確證據；`.env.example` 為明示 demo/placeholder。正式 startup 拒絕弱 placeholder AUTH_SECRET、非 HTTPS AUTH_URL；demo guarded。Logto client ID、owner identifier 是識別資料，不是 secret。本次只以不輸出值的方式檢查本地未追蹤 env 的存在／key；未取得歷史 Git secrets 或 VM secrets，不能保證歷史從未外洩。
8. **HTTP/browser**：沒有寬鬆 CORS response 配置；DENY/frame-ancestors、nosniff、referrer policy 已設定。Auth.js 預設 cookie 為 HttpOnly、SameSite=Lax，HTTPS URL 下 Secure；需正式 header 驗證。部分 API 未明示 no-store，見 H-04；Next route 不預設 cache 不等於瀏覽器／反向代理完全不儲存。SEC-06/07。
9. **Cryptography**：密碼 scrypt；session/random IDs 使用 crypto.randomUUID/randomBytes；SHA-256 用於 identity/hash，不用作 password hash。Webhook HMAC-SHA256 timingSafeEqual。PowerDNS key 為 env-only，SETTINGS_ENCRYPTION_KEY 目前保留給 legacy，不代表現有 env secrets 已靜態加密。
10. **Dependencies**：全 lockfile audit、registry outdated、官方公告 cross-check、來源/integrity/install scripts 檢查見 E。
11. **Logging/privacy**：audit redact 會遮蔽 sensitive keys 和已知 env secret 值；API generic 500 不回 stack，PowerDNS detail 不回 browser。`apiError` console.error 仍寫原始 error.message，Prisma/Auth.js 底層 logger 是否帶輸入需 H-05；未證實真實 secrets leak。DNS 聯絡資料／清查姓名／學號為受限功能需要的 PII，沒有 retention policy 的證據，應確認保留期限及 log ACL。
12. **Business logic**：無 payment/credit。單位 member lock、pending duplicate、ownership/hash/connection scope、防最後一位 admin 移除已分析。SEC-03/04/05 涵蓋 quota、replay、state transition；HTTP 成功但 DB commit 失敗屬未完全可原子化的風險，見 H-03。

## Critical Findings

沒有已確認可利用的Critical。上游ImageResponse Critical公告目前无application sink，列SEC-08 Low，不誇大分級。

## High Findings

### SEC-01 — 受限網域權限被展開成整個 zone 的 ADMIN

- **Severity:** High（條件式）；**Confidence:** High（source data flow），正式是否已設定受限 grant 未確認。
- **CWE:** CWE-863 Incorrect Authorization；**OWASP:** A01 Broken Access Control / API1 Broken Object Level Authorization。
- **Affected files / functions / lines:** `lib/validation/api.ts:8` permissionSchema；`app/api/zones/[zone]/permissions/route.ts:14` POSTHandler；`lib/auth/session.ts:19–25` requireActor；`lib/auth/permissions.ts:7–25` effectiveZoneRole/canManageZone/canEditRecordType；`app/api/zones/[zone]/records/route.ts:17–23` context/mutate；schema `prisma/schema.prisma:99–105,134–139`。

Vulnerable snippets（摘錄）：

```ts
resourcePattern: z.string().max(253).nullable().optional()
// POST persists resourcePattern, but requireActor only retains zone and role:
if (!current || rank[permission.role] > rank[current])
  zoneRoles[permission.zoneName] = permission.role;
// Downstream:
return actor.zoneRoles[canonical(zone)] ?? null;
if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
```

**Attack scenario / prerequisite:** owner 透過 permission API 給非全域帳號 `ADMIN`、zone=`example.test.`、resourcePattern=`*.lab.example.test.`，期望只管理 lab。帳號登入後 scope 被丟棄，可 GET 全 zone，並 POST 新增 `outside.example.test.` 的 A/TXT 等紀錄。新增紀錄不需要刪除密碼。不是任意 USER 可自授 ADMIN，也不是從 VIEWER/EDITOR 就能直達 records route；此 route 額外要求 canManageZone。

**Impact:** 受限委派者取得預期範圍以外 DNS 讀寫權限，可改變服務指向或驗證資料。`allowedRecordTypes` 也未被執行，但目前 API 不接受此欄位，因此僅作既有 DB 資料風險，不作第二個獨立漏洞。

**Recommended fix:** 若沒有要提供 record-scoped permissions，停止接受非 null scope，且既有受限 grants 必須 fail closed，不能只改 UI／schema。若要支援，Actor 必須保留各 grant 的 scope/type，read/write/review/inventory 全部以 record object 授權，不可先合併成最高 zone role。

**Suggested patched code — 暫時拒絕不支援的 grant（兩處都需改）：**

```ts
// permissionSchema: reject clients that attempt to create a scoped grant.
resourcePattern: z.null().optional()

// requireActor: before collapsing each direct/group permission to zoneRoles.
const hasTypeRestriction = "allowedRecordTypes" in permission &&
  Array.isArray(permission.allowedRecordTypes) &&
  permission.allowedRecordTypes.length > 0;
if (permission.resourcePattern != null || hasTypeRestriction) continue;
// Keep valid unrestricted grants; reconcile rejected grants explicitly.
```

應先盤點受影響 grants；拒絕它們可能中斷原有存取，需 owner 明確重新授權，不自動清除 scope。

**Affected endpoint / function:** /api/zones/[zone]/permissions POST → /api/zones/[zone]/records GET/POST/PATCH/DELETE。

**Source → Sink data flow:** permissionSchema → POSTHandler(upsert scope) → requireActor(drop scope) → context/canManageZone → mutate → PowerDNS.request。

**Hypothesis disposition:** CONFIRMED BY CODE（条件式grant），正式exploit NEEDS DYNAMIC TEST。Expected attack result 與impact見上方情境。

**Why the current protection fails:** 角色合併先丟棄scope/type，後續只有zone ADMIN boolean，沒有物件範圍可比對。

**How to verify the fix:** ST-16、ST-17：scoped direct/group ADMIN各請求scope內外；scope外read/write均拒絕且mock DNS無變化。

**Potential false-positive considerations:** 如果正式沒有受限grant，現階段沒有受限使用者可利用；若產品明訂只有whole-zone permission，應拒絕/移除scope API以避免誤導而非稱已越權。

## Medium Findings

### SEC-02 — 密碼登入缺少嘗試限制

- **Severity:** Medium；**Confidence:** High（repository），外部限流未知。
- **CWE:** CWE-307；**OWASP:** A07 Identification and Authentication Failures / API2 Broken Authentication。
- **Affected files / route / lines:** `lib/auth/config.ts:24–41` credentials authorize；`lib/auth/policy.ts:11–13` passwordLoginEnabled；`app/api/auth/[...nextauth]/route.ts:5–11`；`docker-compose.yml:9`；`proxy.ts:7` auth bypass。

```ts
const user = await db.user.findUnique({ where: { email } });
if (!user?.passwordHash || user.disabled || user.removedAt ||
    !await verifyPassword(password, user.passwordHash)) return null;
// passwordLoginEnabled:
return demoLoginEnabled(env) || env.AUTH_PASSWORD_LOGIN_ENABLED !== "false";
```

**Scenario / prerequisites:** password provider 可用且存在 passwordHash 的 active account。匿名攻擊者先正常取得 Auth.js CSRF token，再反覆登入；CSRF 防護不防 password guessing。已知 bootstrap email 可作目標，但其至少 16 字密碼不表示容易猜中。失敗路徑無 account/IP 限流、backoff、lockout，valid user 與 unknown user 的 scrypt 差異另可能形成 timing enumeration，尚未量測。

**Impact:** credential stuffing、線上猜密碼，以及對已知帳號重複 scrypt 的 CPU/worker 負載。不宣稱可無密碼登入。

**Recommended fix:** 不需要 password fallback 時關閉；需要時在昂貴 hash 前，以受信任 client IP 及 normalized account 的 HMAC key 做共享、原子限流，記錄去識別化 failure event。避免永久鎖帳造成 DoS。

**Suggested patched code — 最小停用方案（先確認 Logto 可用）：**

```ts
export function passwordLoginEnabled(env: NodeJS.ProcessEnv = process.env) {
  return demoLoginEnabled(env) || env.AUTH_PASSWORD_LOGIN_ENABLED === "true";
}
```

```yaml
# Production Compose and deployment template must both default to disabled.
AUTH_PASSWORD_LOGIN_ENABLED: ${AUTH_PASSWORD_LOGIN_ENABLED:-false}
```

此方案不限制仍明確開啟 password 的安裝；若保留登入，需新增持久 limiter，不能只靠 client 按鈕 disabled 或單 process Map。

**Affected endpoint / function:** /api/auth/callback/credentials POST；authorize；passwordLoginEnabled。

**Source → Sink data flow:** email/password form → Auth.js CSRF → credentialsSchema → db.user.findUnique → verifyPassword(scrypt) → jwt/Session。

**Hypothesis disposition:** CONFIRMED BY CODE（app limiter缺漏），正式入口NEEDS DYNAMIC TEST。Expected attack result 與impact見上方情境。

**Why the current protection fails:** CSRF只防跨站偽造；UI pending不能限制自動client；deletion-password limiter不覆蓋login。

**How to verify the fix:** ST-02～ST-04：小量上限驗證/合成時間樣本；provider停用後舊credential session亦應拒絕。

**Potential false-positive considerations:** 外部edge/IdP可有限流但未取得；無password accounts或provider關閉時不成立；強random密碼不等於已被破解。

### SEC-03 — 申請累積與列表輸出缺少資源預算

- **Severity:** Medium；**Confidence:** High（無上限），availability impact Medium（未負載測試）。
- **CWE:** CWE-400 / CWE-770；**OWASP:** A04 Insecure Design / API4 Unrestricted Resource Consumption。
- **Affected files / route / lines:** `lib/validation/api.ts:19–26` dnsApplicationSchema；`lib/requests/application.ts:14–40` prepareApplication；`lib/requests/save-application.ts:28–58`；`app/api/dns-requests/route.ts:17–49,62–68` GET/POST；`lib/requests/policy-model.ts:3–11` policyViolation。

```ts
records: z.array(dnsRequestSchema).min(1, "請至少填寫一筆 DNS 紀錄")
for (let offset = 0; offset < records.length; offset += 250) {
  await tx.dnsRecordRequest.createMany(/* chunk */);
  await tx.auditLog.createMany(/* one audit per record */);
}
const requests = await db.dnsRecordRequest.findMany({ where, include, orderBy });
```

**Scenario / prerequisites:** 有效單位成員反覆提交不同名稱／內容，避開僅限完全重複的檢查。每批建立申請與 audit，且每次 GET 拉取全部可見歷史。攻擊者甚至不必取得核准便可增長 storage 和管理員列表記憶體成本。

**Impact:** DB/disk 增長、30 秒長交易、管理員 API/UI 大 response。VM ingress 已限制 2 MB，故不是「單次網路請求可無限大」；問題是單位時間、累積儲存與未分頁讀取。一般已登入但非成員也會在授權完成前觸發部分 PowerDNS 讀取，應提前 unitAccess。

**Recommended fix / suggested patched code（政策數字為建議值）：**

```ts
// schema
records: z.array(dnsRequestSchema).min(1).max(100)

// In saveApplication's transaction, after active-user/unit locks and unitAccess:
const pendingCount = await tx.dnsRecordRequest.count({
  where: { unitId: input.unitId, status: "PENDING" },
});
if (pendingCount + input.records.length > 1000)
  throw new ApplicationInputError("單位待審核申請已達上限。", 429);
```

```ts
// GET: preserve the original authorization where; validate cursor separately.
const rows = await db.dnsRecordRequest.findMany({
  where, include: { user: { select: { id: true, name: true, studentId: true } } },
  orderBy: { id: "asc" }, take: 51,
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
});
// Return 50 DTOs + nextCursor; update client to request further pages.
```

还需共享寫入速率限制、歷史 retention／archive 和大資料匯出 streaming；pending quota 本身不限制已結案資料總量。無限 batch 是目前明示行為，調整前需確認可接受的使用量。

**Affected endpoint / function:** /api/dns-requests POST/GET；prepareApplication/saveApplication/GET。

**Source → Sink data flow:** records JSON → Zod無max array → normalize/duplicate check → unitAccess/transaction → request+audit createMany → unpaged GET serialization。

**Hypothesis disposition:** CONFIRMED BY CODE（budget缺漏），DoS效果NEEDS DYNAMIC TEST。Expected attack result 與impact見上方情境。

**Why the current protection fails:** 2 MB只限制單次bytes；250 chunk只限制SQL size；相異payload繞過duplicate，沒有累積額度。

**How to verify the fix:** ST-29、ST-30：以測試fixture預置quota附近資料，只發2個bounded請求；分頁page size固定。

**Potential false-positive considerations:** 批次無上限是現有產品設計；報告不是單請求無限量或已DoS；若edge/shared limiter與storage budget存在需調整風險。

### SEC-04 — 更換未簽署的 delivery ID 可重播有效 webhook

- **Severity:** Medium；**Confidence:** High。
- **CWE:** CWE-294 / CWE-345；**OWASP:** A08 Software and Data Integrity Failures。
- **Affected files / functions / lines:** `deploy/webhook.mjs:8–20,63–68` validateDelivery/queue；`deploy/deploy.sh:23–34` deployment。

```js
const expected = createHmac('sha256', config.secret).update(raw).digest();
const delivery = headers['x-github-delivery'];
return { kind: 'deploy', delivery };
// Deduplication is based only on this unsigned header:
const base = join(queue, delivery.delivery);
if (await exists(base + '.done')) return respond(200, 'Already deployed');
```

**Scenario / prerequisites:** 攻擊者取得一份正確 repo/ref 的原始 push body 及 signature，例如 delivery log 存取或未加密 private hop 旁路觀察；重播相同 signed bytes 但更換 UUID header。HMAC 仍正確，queue 將它當新工作。

**Impact:** 反覆 build 與 stack down/up、資源浪費及停機；不能選任意 shell command，也不會按舊 payload 回滾到攻擊者 commit，部署仍 fetch configured branch head。

**Recommended fix:** dedupe 使用已驗證 body digest，delivery ID 僅作 metadata；排程對相同 desired commit 合併。失敗重试應有 backoff／上限，部署腳本檢查 last-successful-commit 和健康狀態後才決定是否重啟。

**Suggested patched code — 核心片段：**

```js
// after successful HMAC/repository/ref verification
return { kind: 'deploy', delivery, jobKey: expected.toString('hex') };
// queue path, after validateDelivery
const base = join(queue, delivery.jobKey);
// drain's queue filename filter must change together:
const next = (await readdir(queue))
  .filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).sort()[0];
```

digest filename 與原 UUID queue 需有相容遷移；只改一处會留下無法消費的 queue。成功 digest 不可因 delivery header 改變而重做。無合法簽章時現有驗證拒絕請求，未發現 signature bypass。

**Affected endpoint / function:** /hooks/github POST；validateDelivery/drain；deploy.sh。

**Source → Sink data flow:** signed raw JSON + unsigned delivery header → HMAC only raw → queue(filename header) → spawn fixed script → git head + compose restart。

**Hypothesis disposition:** CONFIRMED BY CODE（取得合法payload前提）。Expected attack result 與impact見上方情境。

**Why the current protection fails:** done marker以未签header作key，不绑定验证后的bytes/commit；flock只防同時、不防串行重复。

**How to verify the fix:** ST-41～ST-43：固定signed測試payload重投/改UUID；部署stub不得多執行，正確失敗可bounded retry。

**Potential false-positive considerations:** 攻擊者須先取得body及簽章；不能改signed commit/ref/body或注入shell；正常GitHub redelivery本來就是合法功能。

### SEC-05 — legacy 個人申請的審核存在 TOCTOU

- **Severity:** Medium；**Confidence:** High（source interleaving），是否仍有適用資料未知。
- **CWE:** CWE-367 / CWE-362；**OWASP:** A04 Insecure Design。
- **Affected file / route / lines:** `app/api/dns-requests/[id]/route.ts:25–31,33–67` PATCHHandler 的 `unitId` 為 null 分支。

```ts
if (recordRequest!.status !== "PENDING") throw new ApiError(/* ... */, 409);
if (decision.decision === "APPROVE") {
  await withDnsZoneLock(recordRequest!.zoneName, async () => {
    // PowerDNS write
  });
}
await db.dnsRecordRequest.update({
  where: { id: recordRequest!.id },
  data: { status: decision.decision === "APPROVE" ? "APPROVED" : "REJECTED" },
});
```

**Scenario / prerequisite:** 對同一筆 legacy PENDING request，合法 reviewer 發出 APPROVE 與 REJECT。兩者先讀到 PENDING；核准寫 DNS 並更新 APPROVED；已通過先前檢查的拒絕請求再寫 REJECTED。REJECT 不取得 DNS lock，狀態更新也沒有 `status:PENDING` compare-and-set。

**Impact:** UI/稽核最終表示拒絕但 DNS 已發布、reviewer/reviewNote 被覆蓋；不是一般成員繞過 global approval。新版 `reviewUnitRequest` 先 lockUnit 再讀 PENDING，不能套用此結論。

**Recommended fix:** 若不再處理 legacy 申請，明確停止該 mutation；若要保留，對所有 decision 取得同一 request row lock、重新檢查狀態，再維持一致鎖順序與 publishing/reconciliation 狀態。只在 HTTP 寫入後加 updateMany(PENDING) 仍不能撤銷已發布 DNS。

**Suggested patched code — 最小封閉方案，保留前面的 unit 分支：**

```ts
// After the unit request branch and canReviewDnsRequest authorization:
throw new ApiError("歷史個人申請已停止審核，請重新提交單位申請。", 410);
// Remove the remaining legacy mutation branch after product confirmation.
```

此方案改變歷史功能，需確認；不應自動 bulk-cancel 正式資料。

**Affected endpoint / function:** /api/dns-requests/[id] PATCH legacy；PATCHHandler。

**Source → Sink data flow:** id/decision → requireActor + canReviewDnsRequest → outside-lock PENDING read → approve HTTP write或reject → unconditional db.update(id)。

**Hypothesis disposition:** CONFIRMED BY CODE（legacy branch），live data NEEDS DYNAMIC TEST。Expected attack result 與impact見上方情境。

**Why the current protection fails:** REJECT不取同一row/zone lock，status update缺CAS且在DNS lock外；zone lock不等於request狀態lock。

**How to verify the fix:** ST-31：只2個操作、barrier控制APPROVE/REJECT，用mock DNS確認final state一致；unit分支作對照ST-32。

**Potential false-positive considerations:** 本版不能提交新的personal request；若已無legacy pending，不存在目前可review目標；正常unit request不能套用此漏洞。

### SEC-09 — application runtime 使用 PostgreSQL superuser

- **Severity:** Medium（least-privilege 缺陷）；**Confidence:** High（新安裝），既有 DB 實際角色未確認。
- **CWE:** CWE-250；**OWASP:** A05 Security Misconfiguration。
- **Affected file / lines / component:** `docker-compose.yml:3–5,19–25` app environment + postgres initialization；所有 Prisma runtime queries。

```yaml
DATABASE_URL: postgresql://aegis:${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD to a random hex secret}@postgres:5432/aegis_dns?schema=public
# postgres container
POSTGRES_USER: aegis
```

[官方 PostgreSQL image 文件](https://hub.docker.com/_/postgres) 明確說明 POSTGRES_USER 建立的是 superuser；只有空 data directory 的初始化才套用此行為。Web 與 migration 共用此 DATABASE_URL。

**Scenario / prerequisite:** 攻擊者還需要另一個 app compromise、SQL injection 或 runtime credential leak，才可使用這個 DB 身分。**本次沒有找到該入口**。Impact 是原本只應 CRUD 的 web credential 可修改 schema、角色、稽核與其他 database，擴大失陷範圍；不宣稱已從 HTTP 取得 DB superuser。

**Recommended fix:** 分開 bootstrap admin、migration owner 與 web runtime，web 僅必要 table/sequence 權限。修改 Compose user 字串不會自動修正已有 DB grants。

**Suggested patched configuration / provisioning design（獨立 DB 演練後才套用）：**

```sql
CREATE ROLE dns_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
-- Provision an independent password through a secret channel.
GRANT CONNECT ON DATABASE aegis_dns TO dns_app;
GRANT USAGE ON SCHEMA public TO dns_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dns_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dns_app;
-- Set ALTER DEFAULT PRIVILEGES FOR ROLE <actual migration owner> as well.
```

```yaml
# Distinct secrets, replacing the shared DATABASE_URL for each service.
web:
  environment:
    <<: *app-environment
    DATABASE_URL: ${APP_DATABASE_URL:?Set least-privilege runtime URL}
migrate:
  environment:
    <<: *app-environment
    DATABASE_URL: ${MIGRATION_DATABASE_URL:?Set migration URL}
```

進一步將全表 grants 縮至實際 runtime tables；runtime 不需維護 `_prisma_migrations`。此段是初始分權基線，不是完整資料庫 migration。

**Affected endpoint / function:** 所有Prisma runtime API；db PrismaClient / Compose postgres bootstrap。

**Source → Sink data flow:** future app compromise or leaked env → shared DATABASE_URL → PostgreSQL role initialized via POSTGRES_USER → superuser DB operations。

**Hypothesis disposition:** CONFIRMED BY CODE（fresh initialized DB），現役role NEEDS DYNAMIC TEST。Expected attack result 與impact見上方情境。

**Why the current protection fails:** web與migration使用同一bootstrap superuser，OS nonroot/internal network不削弱DB角色權限。

**How to verify the fix:** ST-48：isolated DB以runtime角色SELECT current_user與pg_roles flags；只permission introspection，不執行破壞DDL。

**Potential false-positive considerations:** 已有DB不因POSTGRES_USER env重建角色；可能人工降權；本次無SQLi/RCE入口，需另一初始失陷。

## Low Findings

### SEC-06 — production CSP 的 script-src 允許 unsafe-inline

- **Severity:** Low；**Confidence:** High；**CWE:** CWE-693；**OWASP:** A05 Security Misconfiguration。
- **Affected file / lines:** `next.config.ts:3,8–15` headers()；所有 document routes。

```ts
script-src 'self' 'unsafe-inline'${developmentScriptPolicy}
```

**Scenario/prerequisite:** 未來或第三方出現 HTML/script 注入點時，inline script 不會被 CSP 阻擋。**本次未找到該注入點，不能宣稱 stored XSS。** Impact 為降低 XSS 防禦能力。production 沒有 unsafe-eval；style unsafe-inline 本身不等同 script execution。

**Fix / suggested policy（設計片段）:**

```ts
const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
const scriptPolicy = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
// Build complete CSP preserving existing directives; forward CSP and nonce
// in the document request to Next.js and set the same CSP on the response.
```

nonce 必須每 response 隨機、框架 inline scripts/next-themes 同步取得、避免靜態共用 nonce；需擴充目前 proxy matcher 至所有 document paths。不能只刪 unsafe-inline 就宣稱修復，否則可能破壞 hydration。先 Report-Only 驗證再 enforce。

**Affected endpoint / function:** 所有HTML document response；nextConfig.headers。

**Source → Sink data flow:** potential future HTML injection → React/other renderer → browser inline script under current script-src。

**Hypothesis disposition:** CONFIRMED BY CODE（弱CSP），XSS exploit POSSIBLE且未找到sink。Expected attack result 與impact見上方情境。

**Why the current protection fails:** unsafe-inline允許inline JS；React escaping仍是目前主要保護，不能用CSP抵消新injection bug。

**How to verify the fix:** ST-38：staging以自己fixture/nonsensitive marker檢查nonce CSP；正常hydration/theme/OIDC/logout無違規。

**Potential false-positive considerations:** 缺乏HTML注入source→sink，所以只Low hardening；不是已證實XSS，style-inline不是script execution證據。

### SEC-07 — HTTPS edge 範例缺少 HSTS

- **Severity:** Low；**Confidence:** High（範例缺漏），Medium（正式 exposure 未知）；**CWE:** CWE-319；**OWASP:** A02 Cryptographic Failures / A05 Security Misconfiguration。
- **Affected files / lines:** `deploy/Caddyfile.example:2–4` HTTPS site；`next.config.ts:9–15` headers；`deploy/nginx.conf.example:8–27` alternative TLS server。

```caddyfile
dnsmgr.ce.ncu.edu.tw {
    reverse_proxy http://VM_PRIVATE_IP:8080
}
```

**Scenario/prerequisite:** 未預載 HSTS 的瀏覽器經 HTTP 進站且網路攻擊者可攔截，HTTP→HTTPS redirect 本身可被替換。Impact 為 TLS downgrade/phishing exposure；Secure cookie 不會因此自動以 HTTP 洩漏。production edge 可能已有額外 header，本次未測。

**Fix / suggested patched config — 設於外部 HTTPS Caddy：**

```caddyfile
dnsmgr.ce.ncu.edu.tw {
    header Strict-Transport-Security "max-age=31536000"
    reverse_proxy http://VM_PRIVATE_IP:8080
}
```

確認全站 HTTPS 後啟用；includeSubDomains/preload 需另外核對網域範圍，不直接加入。首次從未造訪的 HTTP 仍不是單靠一般 HSTS 完全防護。

**Affected endpoint / function:** HTTPS edge / 所有document；Caddy site / alternative nginx TLS server。

**Source → Sink data flow:** browser initial HTTP visit → network-controlled redirect → absent remembered HSTS → potential downgrade。

**Hypothesis disposition:** CONFIRMED BY CODE（sample缺漏），production NEEDS DYNAMIC TEST。Expected attack result 與impact見上方情境。

**Why the current protection fails:** HTTPS redirect未提供browser未來強制HTTPS記憶；樣板未加header，但edge可能global配置已補。

**How to verify the fix:** ST-37：staging HTTPS正常與error response檢查HSTS、HTTP→HTTPS及cookieSecure。

**Potential false-positive considerations:** 正式proxy設定未取得，不能保證真實header缺失；Secure cookie仍不應HTTP傳送；只Low。

### SEC-08 — Next.js 安全更新落後，但目前未見相關 RCE sink

- **Severity:** Low（本 repository 可達性）；上游公告 **Critical**，兩者不可混為一談。
- **Confidence:** High（版本與 sink 搜尋／路由盤點）。
- **CWE:** 公告未指定，不推測具體 root cause；**OWASP:** A06 Vulnerable and Outdated Components。
- **Affected files / lines / function:** `package.json:25,41`、`package-lock.json` 的 `node_modules/next`；潛在功能為 Node `next/og ImageResponse`，應用目前無呼叫 route。

```json
"next": "16.3.4",
"eslint-config-next": "16.3.4"
```

官方 [GHSA-vcvr-r3jv-pc5j / CVE-2026-94545](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j) 指出 `>=16.2.0 <16.3.6` 的 Node ImageResponse 可在 attacker-controlled SVG values 下 RCE，修正於 16.3.6。這份 source 沒有 `next/og`／`ImageResponse` 或動態 OG image route，因此 prerequisite 不成立；若未來新增該資料流，impact 可升至 server code execution。不可僅因版本命中就認定現在能攻擊。

**Recommended fix / suggested patched package excerpt:** 本次 registry 的 latest 為 16.3.7，建議同時更新 Next 與 eslint-config-next 至該版本、重產 lockfile 並執行 build/security tests；此处未執行 install。

```json
"next": "16.3.7",
"eslint-config-next": "16.3.7"
```

**Affected endpoint / function:** 目前無affected application endpoint；潜在next/og ImageResponse；dependency manifest。

**Source → Sink data flow:** future attacker-controlled SVG attributes/content → Node ImageResponse(vulnerable bundled dependency) → native image generation → potential RCE。

**Hypothesis disposition:** POSSIBLE（版本命中、目前sink不可達）。Expected attack result 與impact見上方情境。

**Why the current protection fails:** registry audit未報，不能證明compiled/vendor code安全；目前沒有該API使用，因此沒有現在失效的route guard。

**How to verify the fix:** ST-49：升級後核對lock/runtime artifact/advisory；不用RCE payload；確認没有未盤點OG route。

**Potential false-positive considerations:** 上游Critical不等於本repoCritical；沒有ImageResponse usage。React主套件19.2.0也不等於RSC vuln實際可達。

## Informational Findings

這裡是**未達漏洞成立條件的觀察**，不加入9項finding計數。不存在的功能不硬報漏洞。

| Observation | Evidence / classification | 建議與驗證 |
| --- | --- | --- |
| MFA/step-up與absolute session期限未能確認 | 無本地MFA；Logto policy未取得；8h可rolling、15m idle有server row | 維運端確認MFA/acr/auth_time與長時登入政策；ST-09、ST-13 |
| 部分敏感API缺explicit no-store | User/audit/inventory/requests/zone response；Next runtime不是static cache | 可能browser/proxy retention，尚無cross-user leak證據；ST-39 |
| API error/第三方logger邊界 | apiError記raw error.message；Auth.js default error logger可記cause stack/data | 只用canary測試、限制journal ACL；ST-40，不能把stack只在server log當作public leak |
| PowerDNS rrsets schema寬鬆 | lib/powerdns/client.ts zoneSchema rrsets z.any，上游json沒有response bytes ceiling | 上游malformed body與timeouts用local stub；ST-35，無user-controlled URL SSRF證據 |
| 測試帳號CLI一次性stdout輸出password | scripts/create-test-user.ts:11,17；operator-only、非HTTP、非deploy自動呼叫 | 不在shared CI/journal執行，使用安全operator secret交付；不將故意CLI交付當已曝光給外部 |

### Exploit Hypothesis Ledger

CONFIRMED BY CODE表示源碼行為可推導且在明列前提下成立，**不代表production重現**；LIKELY/POSSIBLE/NEEDS DYNAMIC TEST表示缺少可達性或配置證據；FALSE POSITIVE表示可辨識既有保護阻断鏈。

| Hypothesis | Trace / protection | Expected result | Disposition | Confidence |
| --- | --- | --- | --- | --- |
| scope grant可改scope外DNS | grant scope→requireActor discards→ADMIN mutate | 若存在scoped ADMIN grant則可越範圍寫 | CONFIRMED BY CODE；SEC-01 | High |
| credentials大量guess能無限試 | Auth.js CSRF→authorize無limiter | password provider可用時app沒有429 | CONFIRMED BY CODE；SEC-02 | High |
| 回應時間辨識password account | 不存在user短路vs已存在scrypt | 可能統計分辨；網路jitter未量測 | LIKELY / NEEDS DYNAMIC TEST | Medium |
| 換delivery ID重播deploy | HMAC raw→unsigned filename→done check | 取得合法signed payload可新queue | CONFIRMED BY CODE；SEC-04 | High |
| 單位EDITOR以recordId讀/寫別unit | unitAccess→source.unitId→scope/live hash | 403/404，不到sink | FALSE POSITIVE（source） | High |
| 任意email link owner | derive issuer+sub hash→sub match→owner identifier | profile email/name不授owner | FALSE POSITIVE（source） | High |
| 較弱Logto connector冒用owner學號 | Object.values(all connectors)→identifier→owner/enroll | 僅在upstream允許可控identifier時升權 | POSSIBLE / NEEDS DYNAMIC TEST；H-01 | Medium |
| Bearer JWT可單独越過actor auth | proxy.getToken accepts bearer→auth cookie→requireActor | 无cookie不能敏感route授权 | FALSE POSITIVE（source）；ST-11實測 | High |
| 沒有Origin即可CSRF刪DNS | SameSite Lax+browser POST Origin+JSON+deletion password | 尚无cross-site authenticated mutation链 | NEEDS DYNAMIC TEST，不确认漏洞 | Medium |
| next/og RCE可直接打當前app | 版本命中→無ImageResponse route | 目前sink不達；更新防未来引入 | POSSIBLE latent risk；SEC-08 | High |
| userId/role mass assignment | strict whitelist + global admin + owner guard | USER不能改任意role，SUPER_ADMIN输入拒絕 | FALSE POSITIVE（source） | High |
| stored TXT/note执行HTML | Zod/DB→React JSX；无raw HTML | 文字escaped；CSV另公式防護 | FALSE POSITIVE（已查sink）；ST-34 | High |
| SSRf操控PowerDNS API URL | retired setting route410、env only、encoded zone | 无普通user→URL sink | FALSE POSITIVE（source）；ST-35 | High |
| legacy reject覆盖approve | PENDING outside lock→HTTP→update id only | 並行review可DNS/status不同 | CONFIRMED BY CODE；SEC-05 | High |
| Postgres app role是superuser | POSTGRES_USER初建→shared DSN | fresh DB为superuser；现役未知 | CONFIRMED BY CODE配置；ST-48 | High |


## Attack Chains

没有確認由匿名起點一路到owner/RCE的完整链；以下列出成立前提，避免將不同身份权限任意拼接。

| Chain | Initial access → Pivot → Privilege escalation → Impact | 前提／阻斷點 | Assessment |
| --- | --- | --- | --- |
| CH-01 受限DNS委派升範圍 | scoped zone ADMIN登入 → whole-zone有效角色 → scope外A/CNAME/TXT新增 → DNS服務轉向／驗證資料控制 | 必須已有scoped ADMIN；read/hash可由同role取得；新增不需刪除密碼；可改DNS不等於自動控制所有外部服務 | CONFIRMED BY CODE（SEC-01），High條件式；ST-16/17 |
| CH-02 credential stuffing後權限使用 | password endpoint無app limiter → 攻擊者已知重用密碼登入 → 取得該帳號unit/global權限 → metadata修改/待審申請或管理操作 | 缺少limiter不是密碼突破；取決於被害帳號credential/role；普通unit成員仍不能自行發布DNS；deletion另有password | POSSIBLE鏈；SEC-02，ST-02～04 |
| CH-03 connector identity混淆 | 合法較弱IdP connector登入 → 學號identifier被採信 → owner或unit enrollment → 高權限DNS/PII管理 | 必須證明較弱connector可以產生指定identifier；目前無tenant設定，不假設browser能自行送UserInfo | NEEDS DYNAMIC TEST；H-01，ST-12/13 |
| CH-04 signed event重播 | 取得一份signed push bytes/header → 改unsigned delivery UUID → 新queue → 反覆合法deploy restart | 不需要知道webhook secret但要已取得可重播簽章；不能改signed body/ref，也不能任意shell/RCE | CONFIRMED BY CODE（SEC-04），Medium；ST-41～43 |
| CH-05 DB失陷blast radius | 另一個未證實app compromise → runtime DATABASE_URL → bootstrap superuser → 所有DB角色/稽核/schema控制 | 本次無SQLi/RCE/real key leak，不能聲稱initial access存在；Docker runner protections可能限制進一步host動作 | POSSIBLE defense-depth链；SEC-09，ST-48 |

不能成立的鏈：TXT stored content → inline XSS → owner session action，目前React escaping阻斷；PowerDNS env URL → SSRF → cloud metadata，目前無user URL入口；退役restore endpoint → DNS rollback目前410阻断。


## Dependency Risks

### Locked versions and advisory applicability

| Package | Lock / installed version | 判斷 |
| --- | --- | --- |
| next | 16.3.4 | SEC-08；registry latest 16.3.7 |
| next-auth / @auth/core | 5.0.0-beta.32 / 0.41.3 | 已達下述兩筆公告修正版本；beta 不單獨等於漏洞 |
| react / react-dom | 19.2.0 / 19.2.0 | 落後 registry 19.3.0，但不能把 react 主套件版本直接當作 react-server-dom exploit 證據 |
| Next compiled React | 19.3.0-canary-cbb046ab-20260731 | Next 有 vendored RSC 實作，更新需透過 Next；lock audit 未完整代表 bundled code |
| jose / oauth4webapi | 6.2.12 / 3.8.8 | 本次 audit 無公告命中；不代表全面實作驗證 |
| @prisma/client / prisma | 6.19.3 / 6.19.3 | 新 major 可用不是 CVE；本次無已確認安全公告命中 |
| pino / zod | 9.14.0 / 4.5.4 | registry 有新版本；本次無已確認可利用漏洞 |

[Auth.js auth error fail-open 公告](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-8fpg-xm3f-6cx3) 修於 beta.32；且本專案檢查 session.user.id/email 並重讀 User，不只判斷 truthy auth。[OAuth check cookie provider confusion](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-x445-f3h2-j279) 修於 core 0.41.3/beta.32；目前亦只有一個已註冊 OIDC provider，舊 ncu-portal module 未註冊。

[Next AVIF RCE 公告](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) 及 [Windows-host RCE 公告](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) 的 16.x 修補點為 16.3.3，本專案 16.3.4 已超過；正式 target 為 Linux。品牌 next/image 使用固定 local PNG、unoptimized，不是使用者上傳圖片。

[React 2025 RSC 公告](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components) 針對特定 react-server-dom packages；不把本專案 `react@19.2.0` 自動計成另一個 Critical。Next 的 vendored runtime 和完整 build artifact 仍應在升級後核對。

### E.2 Supply-chain 分析

- lockfile 所有有 resolved 的 entry 皆來自 `https://registry.npmjs.org/`，皆有 integrity。使用 npm ci；未見 git/tarball 外部來源依賴。
- CI checkout/setup-node pin 到完整 commit SHA，permissions contents:read；沒有 pull_request_target 執行外部 PR 程式碼的配置。
- install scripts 包含 Prisma engines/client、esbuild、fsevents、unrs-resolver，會執行供應鏈程式；沒有證據顯示惡意。建議在無正式 secrets 的隔離 build 執行並維護依賴審查。
- Docker `node:22-bookworm-slim`、`postgres:17-alpine`、`caddy:2-alpine` 是浮動 tag，未 pin digest；CI audit 只 `--omit=dev`，本次另查全部依賴。建議 image digest/SBOM/vulnerability scan 和定期更新，未取得現役 image digest，故不捏造 OS CVE。
- installer 從 HTTPS Node distribution 取 SHA256 manifest 驗證 archive，沒有 curl|bash；manifest 和 archive 同源，非獨立簽章驗證。
- `npm outdated` 的 latest dist-tag 不代表適合直接升級，例如 next-auth latest 為 4.x、prisma CLI latest 指到 RC；不得以「latest」機械降級或混搭 Prisma client/CLI。

## Secret Exposure

**目前沒有確認的 POTENTIAL SECRET EXPOSURE。** tracked source/config/test/fixture/docs/CI/Docker/env examples與git local配置檢查没有發現高置信真實secret；這不是全Git歷史或VM secret證明。

| Source | 檢查結果 | 邊界 |
| --- | --- | --- |
| .env.example / deploy/*.env.example | demo passwords/placeholder/public client ID；production startup會拒placeholder AUTH_SECRET | demo資料不是正式credential；不完整輸出真實secret |
| .env.local（ignored/untracked） | 有AUTH_SECRET/NEXTAUTH_SECRET及DEV_* password；只在記憶體判presence，tool/report未輸出值 | local secret檔本來應存在；git check-ignore確認排除；未證實已publish/洩漏 |
| .git/config | 不見credential-bearing HTTP URL或private-key block | 未對remote發请求，未掃全部历史/branches |
| tests/fixtures/docs | 合成test/demo values；未確認live key | pattern掃描可能漏掉custom格式，不能保證無secret |
| Docker/CI | .dockerignore排除.env/key/private runtime，npm build未帶production env；CI source-only | 實際歷史image layers/CI logs/secrets未取得 |
| PowerDNS/OAuth/webhook | env/server-only；upstream error detail不回browser；audit redaction | logger原始error.message、IdP logout query需canary/log ACL驗證 |
| 手工create-test-user CLI | random generated password刻意stdout顯示一次 | 不應進sharedCI/journal；沒有本次生成帳號／密碼 |

若後續證實livecredential曾進git/image/log，處置是rotation+access review+清理歷史，而非僅刪文字；此階段没有證據觸發正式rotation，亦未執行。


## Configuration Risks

SEC-09已在Medium Findings完整描述；SEC-06/07在Low Findings。以下不重複計數。

- web port loopback-only，DB 無 published port、internal network；runner USER node、read_only、cap_drop ALL、no-new-privileges 已有。
- AUTH_TRUST_HOST=true 依赖 AUTH_URL 與 private ingress 覆寫 Host/X-Forwarded-Host/Proto。外部 Caddy 到 VM 使用 HTTP/IP allowlist，防來源不等於加密；是否有可信隔離網路/IPsec 需確認。PowerDNS 允許 HTTP，需確認 API key 在何種網路傳送。
- webhook service 加入 docker group，等價高度 host 權限；既有文件已說明。必須限制 branch push、deploy account、checkout/script 寫權；未讀 GitHub branch protection 或 host ACL，不能判定它們缺失。
- 正式 env 保存在 checkout 外、0640 root:dnsdeploy；.dockerignore 排除 env/key/private runtime。沒有為稽核輸出真實 secrets。
- 目前 CSP/HSTS 缺陷分別見 SEC-06/07；不重複計數。浮動 image tag 作 supply-chain improvement，不另誇大為可利用漏洞。

## Dynamic Testing Required

以下未解事項對應 [SECURITY_TEST_PLAN.md](SECURITY_TEST_PLAN.md)；本次全部未執行。

### H-01 — Logto connector 信任來源（潛在 High，未計為已確認漏洞）

`lib/auth/logto.ts:28–54` 以 `Object.values(identities.data)` 採信所有 connector 的一致 identifier，未限定已核對的 NCU connector key；`lib/auth/owner.ts:3–15` 依 identifier 授予 owner，`lib/units/enroll.ts` 依 studentId 自動加入。若有較弱 connector 可產出攻擊者指定的相同 identifier，會構成權限提升（CWE-807/A01）；但不能假設 browser 能直接偽造 Logto UserInfo。本次沒有 Logto tenant connector 設定，沒有證明此前提。

須唯讀取得 connector 名單、identities key、claim mapping、使用者可修改欄位及帳號 linking/delegation 規則；在獨立測試 tenant 用不同身份測試。加固方向是在身份解析前只選定明確設定、經核對的 NCU connector；不能猜測正式 key 或 subject。舊 provider 拒絕頂層 `profile.delegator`，Logto 分支沒有同樣檢查；是否保留委派身份語義也需 IdP 證據。

### H-02 — Authentication、session、CSRF 與撤權實際行為

staging 驗證 PKCE/state/nonce mismatch、issuer/audience/subject mismatch、callback replay、JWT 過期／竄改、logout 後旧 cookie、15 分鐘 idle、disabled/removed user、role downgrade。確認 cookie Secure/HttpOnly/SameSite、Origin:null/missing、cross-site form、不同 content-type、proxy bypass header/path normalization。

session `maxAge=8h` 可能為滑動續期，不能當 absolute session lifetime 保證；idle heartbeat 可由持有 cookie 的腳本持續呼叫，是合理 bearer-token 邊界但需符合政策。停用 user 不刪 session，若短時間再啟用，舊 session 可能恢復；是否要求永久撤销需產品政策。MFA、password reset、email verification 在 Logto 端的狀態未知。

### H-03 — DNS HTTP 與 DB commit 的一致性

`lib/units/review.ts` 在 DB transaction 內呼叫 PowerDNS；DB rollback 不會撤回外部寫入。已有 expectedRRSet、APPLIED/READY、metadata version、scope 與重試設計，不能單純將「外部 HTTP」判為 replay 漏洞。需 staging fault injection：HTTP 成功後 DB timeout/commit failure、APPROVE 重試、其他管理員 REJECT、外部 PowerDNS writer 並行變更。既有 advisory lock 只協調此應用，不鎖外部管理工具。必要時導入持久 publishing/outbox/reconciliation 狀態，而非假設跨系統原子性。

### H-04 — 敏感回應 caching 與 edge protections

`/api/users`、`/api/audit`、`/api/inventory`、`/api/dns-requests`、zone records 部分回應沒有明示 Cache-Control。依本地 Next guide，Route Handler 預設不做 Next cache；cookie runtime 也影響 rendering。但未實測 reverse proxy/browser cache，不能宣稱存在跨帳號資料洩漏。建議敏感 API 一致 `Cache-Control: private, no-store`，staging 檢查 logout/back/history/共享 cache。正式 HSTS、TLS、CORS、error response/security headers、body limit、XFF 信任鏈皆未發送請求確認。

### H-05 — 日誌、secret history、容器與供應鏈

未掃整個 Git history、私有 env、GitHub Actions secrets、VM image layers/backups/journal；未驗證 TLS 憑證與 image OS packages。`lib/api/respond.ts:11` console.error 原樣記錄 error.message，須用合成 canary secret 測 Prisma validation/OAuth failure 日誌是否洩漏（不要用真實 secrets），並檢查 Auth.js logger、forwarded IP 偽造、PII 保留與存取權。只看 redaction helper 無法保證所有 logger 都使用它。

### H-06 — 條件式 finding 的必要確認

僅在另行授權的 staging/唯讀 production 查詢下確認：受限 ZonePermission/GroupZonePermission 是否存在、legacy null-unit pending requests 數量、password provider/帳號是否仍啟用、DB current_user/rolsuper、external rate limiter。做低量、多角色 BOLA matrix 測試與 limiter 驗證；容量/競態/故障注入只在隔離 DNS/DB 環境，不對 production 執行。

## Recommended Remediation Order

| 優先順序 | 工作 | 完成驗收 |
| --- | --- | --- |
| P1 | 確認 SEC-01 grants；受限 grant 先 fail closed 或實作完整 record-level authorization | 非全域受限 ADMIN 無法 GET/POST scope 外紀錄；直接/群組權限交集與聯集案例測試 |
| P1 | 密碼入口不用即停用；保留則共享 account+IP limiter | 可登入正常帳號；大量失敗有 429/backoff，不能用 forged XFF 繞過，不能永久鎖帳 |
| P1 | 升級 Next/eslint-config-next、重新核對依賴 | lockfile 正確、lint/完整 tests/production build；確認框架 advisory reachable surfaces |
| P1 驗證 | 核對可信 Logto connector（H-01） | 只有經核對的 NCU identity 可授予 owner/學號資格 |
| P2 | SEC-03 submission quota/rate budget、server pagination、retention | staging 容量測試，合法批次不遺失、並行提交不繞過 quota |
| P2 | SEC-04 signed-body dedup、commit no-op、bounded retries | 合法 webhook 重投可恢复，改 delivery ID 不重啟已成功 commit |
| P2 | SEC-05 停用或重寫 legacy 審核 | APPROVE/REJECT 並行不產生拒絕但發布的錯置 |
| P2 | SEC-09 DB 分權 | runtime 無 superuser/DDL/role creation，正常操作與 migration 仍可完成 |
| P3 | nonce CSP、edge HSTS、敏感 API no-store、log retention | browser hydration/SSO/logout 正常；正式 response header 與 log sampling 通過 |

以上是修補建議，不是部署／正式資料修改授權。本階段沒有修改這些行為。

## Security Hardening Checklist

- [ ] 確認scope授權語意與既有grants；read/write/review/inventory/export一致object authorization（SEC-01）。
- [ ] 非必要production password provider關閉；保留則shared原子account/IP limiter、failure audit與均衡timing（SEC-02）。
- [ ] 申請筆數、pending/累積storage、unit time budget與server pagination有明確界限（SEC-03）。
- [ ] webhook signed-body/desired-commit dedupe、bounded retry與部署no-op（SEC-04）。
- [ ] legacy reviewer狀態轉移原子化或停止legacy mutation（SEC-05）。
- [ ] nonce CSP與完整document matcher/nonce propagation，先Report-Only驗證（SEC-06）。
- [ ] HTTPS edge HSTS/forwarded headers/body size及敏感API no-store實際驗證（SEC-07/H-04）。
- [ ] Next/framework、OS image digest/SBOM及dev supply-chain持續公告核對（SEC-08）。
- [ ] runtime/migration/bootstrap DB roles分權、host/deployer ACL與branch protection（SEC-09）。
- [ ] 可信NCU connectorkey、delegation、MFA/step-up、claims變動與account linking核對（H-01）。
- [ ] DB/PowerDNS failure reconciliation、outside writer競態與stale version拒絕（H-03）。
- [ ] 所有logger/PII retention、canary secret redaction、operator-onlystdout/log ACL（H-05）。
- [ ] 依SECURITY_TEST_PLAN.md執行授權範圍內local/staging低量測試，保存request/response與sanitized狀態證據。

### Audit validation record

所有 source/lockfile 分析對應開頭 commit，未改來源後重用同一狀態。已完成：

| 指令／方式 | 結果 |
| --- | --- |
| `git status --short`、`git rev-parse HEAD` | 初始乾淨；基準 SHA 如上 |
| `rg --files`、逐一讀取 routes/auth/services/validation/Prisma/deploy/CI、安全 sink cross-reference | 盤點 31 API route files，追蹤上述 caller→sink；不是只依關鍵字判定 |
| 已安裝 Next route-handler、Server Actions guide 與 Auth.js jwt/cookie/callback 實作 | 確認 cache/CSRF/JWE/default cookie 语义；本次無 framework source edit |
| `npm audit --json --ignore-scripts` | exit 0；全部依賴 0 advisory findings；metadata total 583/prod 82/dev 462（registry 分類不可簡單相加） |
| `npm outdated --json --ignore-scripts` | exit 1 表示有 outdated entries，不是命令失敗；關鍵版本記於 Dependency Risks |
| Python 唯讀 lockfile來源/integrity檢查 | 無非 npm registry resolved URL；無 resolved entry 缺 integrity |
| Python 對 git tracked files 的 private-key/GitHub-token/AWS-key pattern 掃描，僅輸出檔名/行號 | 0 命中；另人工檢查 env examples、auth/deploy/seeding/config；非完整 secret detection 保證 |
| 官方 Next/React/Auth.js/Postgres 文件與公告 | 核對 SEC-08/09 及不適用 advisory；公告與 registry 查詢於 2026-09-29；2026-09-30 完成文件，不代表後續公告永久有效 |

未執行 lint、app unit/integration tests、production build、Docker/VM verification scripts、migration 或瀏覽器驗證：本次是 source/config/dependency 審查，僅更新審查文檔與新建測試計畫；既有測試僅閱讀，不能宣稱本次 tests passed。未啟動任何服務，沒有正式健康部署驗證。未全面審閱每個第三方依賴的原始碼；原生 image binary/OS vulnerability scan 需要實際 artifact。

原 Phase 1 完成時已確認工作樹只有 SECURITY_AUDIT.md 和 SECURITY_TEST_PLAN.md 未追蹤文檔；以 `git diff --no-index --check /dev/null SECURITY_AUDIT.md` 檢查未追蹤報告的 whitespace，並檢查 SECURITY_TEST_PLAN.md 的 whitespace，核對指定的18個章節順序、九項 finding、49個測試、code fences 與檔案路徑。未執行 commit/push。
