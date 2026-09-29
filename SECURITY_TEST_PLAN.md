# Security Dynamic Test Plan

基準：`b0de6fde39b1816569533568166f01dddcd58f18`，配合 [SECURITY_AUDIT.md](SECURITY_AUDIT.md)。這是測試設計，**建立此 Phase 1 計畫時，以下 49 項均未執行**；目前沒有已確認的 staging target。2026-09-30 修正時已執行部分對應的隔離自動化測試；完整範圍與結果見 [SECURITY_REMEDIATION.md](SECURITY_REMEDIATION.md)，不代表 49 項端到端測試均已完成。

## 執行邊界

- 只在明確授權的 local／staging 執行；本文件不授權啟動 local demo、修改正式 DNS／帳號／資料庫、部署或測試第三方。先核對實際 target、資源及帳號，不能把 production URL 當預設。
- 建立可丟棄的隔離 DB、`.test` DNS fixture 與 PowerDNS HTTP stub。所有 delete、role change、review、filesystem、deploy 測試使用 fixture 或 mock sink；不得刪正式資料。涉及 deploy 的 executor 必須 stub，避免 git、Docker 與 migration 真正執行。
- 身份至少包含 Anonymous、UserA/UnitA、UserB/UnitB、unit EDITOR/ADMIN、zone VIEWER/EDITOR/ADMIN、scoped direct/group ADMIN、global ADMIN、owner/SUPER_ADMIN、disabled/removed user。預期結果以報告 Authorization Matrix 為準；owner學號不可在真實tenant仿冒。
- concurrency 最多 2 個受控請求；用 barrier/virtual clock/preseed 小型 fixture，不送大批資料、不長時間輪詢，不做 stress/DoS。密碼 limiter 用低測試門檻，不猜真實密碼。
- 禁止 cloud metadata、真實內網掃描、真實第三方 exploit、RCE／破壞性 injection payload。OIDC 驗證使用本地 fake issuer 或另行授權的 test tenant。
- 保存 sanitized request/response、角色、時間、DB/mock DNS before/after 與 correlation ID；不保存真實 password/token/API key。每項記錄 PASS/FAIL/INCONCLUSIVE/SKIPPED 與環境／commit；未執行不能記 PASS。
- Risk 是此測試本身風險，並非漏洞 severity。Medium 項必須先確認 mock／fixture 隔離；如發現 target 是 production，立即停止。

## Test cases

### ST-01 — 登入 CSRF 與 fixation

- **Test ID:** ST-01
- **Target endpoint:** /api/auth/callback/credentials
- **Purpose:** 驗證正常登入及 login CSRF／session fixation
- **Prerequisites:** 啟用 password provider 的測試帳號、獨立 cookie jars
- **Request / action:** 先取得 CSRF token；分別省略、改寫、交換 cookie/token；成功登入前後比較 session ID
- **Expected secure behavior:** 不匹配的 CSRF 被拒；成功登入建立新的 idle session
- **Potential vulnerable behavior:** 跨站或錯配 token 可登入／沿用攻擊者指定 session
- **Risk:** Low；少量登入，僅測試帳號

### ST-02 — 密碼猜測限制

- **Test ID:** ST-02
- **Target endpoint:** /api/auth/callback/credentials
- **Purpose:** SEC-02：驗證 shared account/IP limiter
- **Prerequisites:** 隔離 limiter、可設定低 threshold、兩個 app instance
- **Request / action:** 把測試 threshold 設為 3；兩 instance 合計送 4 次錯誤密碼，再送正確密碼
- **Expected secure behavior:** 共享限制生效、有 retry window；不得靠單一程序記憶體
- **Potential vulnerable behavior:** 無限制或換 instance/IP 即繞過
- **Risk:** Low；不對真實帳號猜測或鎖定

### ST-03 — 帳號存在性差異

- **Test ID:** ST-03
- **Target endpoint:** /api/auth/callback/credentials
- **Purpose:** 確認不存在帳號與已存在帳號 timing/error 差異
- **Prerequisites:** 測試 email、固定錯誤密碼、可觀測本地 server timing
- **Request / action:** 各 5 次順序請求；比較回應格式與 scrypt 是否執行；不據小樣本宣稱統計結論
- **Expected secure behavior:** 回應一致；不存在帳號走等成本 hash 或其他抗 enumeration 設計
- **Potential vulnerable behavior:** 明顯不同錯誤或穩定短路；只作量測證據
- **Risk:** Low；10 個請求、非 stress test

### ST-04 — 停用 password provider

- **Test ID:** ST-04
- **Target endpoint:** /api/auth/providers；/api/auth/callback/credentials；受保護 API
- **Purpose:** 驗證 provider 停用後登入及已發 credential session 政策
- **Prerequisites:** 兩個隔離設定，先在 enabled 取得自己 cookie
- **Request / action:** 停用 provider，查看 providers；重登及重用舊 cookie
- **Expected secure behavior:** 新登入不可用；舊 credential session 按既定撤權政策拒絕
- **Potential vulnerable behavior:** provider 停用但 callback 或舊 session 仍保留不符政策存取
- **Risk:** Low；設定變更限隔離 app

### ST-05 — Session cookie 屬性

- **Test ID:** ST-05
- **Target endpoint:** /api/auth/*
- **Purpose:** HTTPS cookie 與分段 cookie 一致性
- **Prerequisites:** staging HTTPS；可測過期與正常登入
- **Request / action:** 檢查每個 Set-Cookie、session chunk、CSRF cookie、刪 cookie header
- **Expected secure behavior:** HttpOnly/Secure/SameSite=Lax；HTTPS session __Secure、CSRF __Host；path 與刪除一致
- **Potential vulnerable behavior:** 可讀／不安全 cookie 或 logout 遺留 chunk
- **Risk:** Low；僅自己 cookies，不存入報告

### ST-06 — JWE 完整性與有效期

- **Test ID:** ST-06
- **Target endpoint:** 受保護 API；/api/auth/session
- **Purpose:** 驗證篡改／到期／演算法限制
- **Prerequisites:** 隔離 AUTH_SECRET；測試簽發 helper；無正式金鑰
- **Request / action:** 更改自己 JWE 一個字元；helper 簽發已到期、錯 key、非允許 alg/enc token
- **Expected secure behavior:** 全部拒絕，無敏感資料或新有效 idle session
- **Potential vulnerable behavior:** 任一無效 token 被採信
- **Risk:** Low；不可暴露完整 token

### ST-07 — Idle expiry 與 heartbeat

- **Test ID:** ST-07
- **Target endpoint:** /api/session/activity GET/POST
- **Purpose:** 檢查 15 分鐘 idle server row 與過期不可復活
- **Prerequisites:** 隔離 DB、可控 clock、自己 session
- **Request / action:** 推進 clock 過 expiry；GET/POST；送偽 idle ID；並測 expiry 邊界兩個請求
- **Expected secure behavior:** 過期拒絕；不採信 body session ID；touch 必須 expiresAt>now
- **Potential vulnerable behavior:** heartbeat 復活過期 session 或延長別人 session
- **Risk:** Low；只更新測試 session

### ST-08 — 登出撤銷

- **Test ID:** ST-08
- **Target endpoint:** logoutAction；/api/auth/signout；受保護 API
- **Purpose:** 被複製 session 在 logout 後無效
- **Prerequisites:** 同帳號 session A/B 與 A cookie 副本
- **Request / action:** 登出 A；重用副本及 B；確認 server row
- **Expected secure behavior:** A 副本拒絕；B 按 current-session logout 政策保留
- **Potential vulnerable behavior:** 只清瀏覽器 cookie，副本仍有效
- **Risk:** Low；使用 fixture session

### ST-09 — Rolling／absolute expiry

- **Test ID:** ST-09
- **Target endpoint:** /api/auth/session；/api/session/activity
- **Purpose:** 界定八小時 rolling 與絕對期限／並行登入政策
- **Prerequisites:** 可控 clock、自己 fixture、多 session
- **Request / action:** 推進 clock 並維持合法 heartbeat/session 請求；跨原始八小時觀察；確認政策
- **Expected secure behavior:** 行為符合已核准政策；若要求 absolute expiry，超原始期限必須拒絕
- **Potential vulnerable behavior:** 不符產品要求的無限 rolling；沒有政策時僅資訊性
- **Risk:** Low；虛擬時間，不長期輪詢

### ST-10 — 帳號撤權與再啟用

- **Test ID:** ST-10
- **Target endpoint:** /api/users/[id]；受保護 API
- **Purpose:** disable/remove/role change 是否立即影響舊 cookie
- **Prerequisites:** owner/admin 與可刪除 fixture user
- **Request / action:** 停用、降權、再啟用／封存不同 fixture；舊 cookie 請求
- **Expected secure behavior:** 停用／removed 拒絕、降權即生效；再啟用是否需重登依政策
- **Potential vulnerable behavior:** JWT stale role 或封存 session 繼續使用
- **Risk:** Medium；只隔離 fixture，封存不用真實帳號

### ST-11 — Bearer 與 cookie 邊界

- **Test ID:** ST-11
- **Target endpoint:** /api/users；/api/zones/[zone]/records；/dns
- **Purpose:** 排除 proxy getToken 接受 Bearer 即取得 actor 的假設
- **Prerequisites:** 自己有效 session token、無 cookie 的 client
- **Request / action:** 僅 Authorization Bearer 請求；cookie 對照；role 降權後重測
- **Expected secure behavior:** 僅 Bearer 不通過 requireActor；權限使用 DB 現況
- **Potential vulnerable behavior:** proxy 認證即取代 route actor 驗證
- **Risk:** Low；僅自己 token

### ST-12 — OIDC protocol checks

- **Test ID:** ST-12
- **Target endpoint:** /api/auth/signin/logto；/api/auth/callback/logto
- **Purpose:** state/nonce/PKCE/issuer/aud/sub/alg 與 TLS backchannel
- **Prerequisites:** 本地 fake issuer 或明確授權的 test tenant；可控制 token responses
- **Request / action:** 分別缺 check cookie、錯 state/nonce/verifier；fake response 錯 iss/aud/sub/alg/exp；核對 discovery HTTPS
- **Expected secure behavior:** 每個不匹配被拒絕；不因 idToken:false 停止 claim checks
- **Potential vulnerable behavior:** 無效 response 被接受；不把未額外 JWKS 驗簽本身當 exploit
- **Risk:** Medium；只能本地 fake IdP，禁止測真實第三方漏洞

### ST-13 — Connector provenance／MFA

- **Test ID:** ST-13
- **Target endpoint:** Logto callback → identityClaims → owner/enrollment
- **Purpose:** H-01：確認弱 connector/delegation 能否偽造學號與 owner identity
- **Prerequisites:** 明確 test tenant／fake UserInfo；測試 owner 映射；不改 production identity
- **Request / action:** 對可信／不可信 connector、不同 key、delegated identity 給相同學號；觀察 MFA/acr/auth_time
- **Expected secure behavior:** 只採信核准 connector 與符合 delegation/MFA 政策的 identity
- **Potential vulnerable behavior:** 弱 connector 可產生 owner 或 unit 管理人 identifier
- **Risk:** Medium；可能提升權限，僅隔離身份資料

### ST-14 — Account linking

- **Test ID:** ST-14
- **Target endpoint:** Logto callback → signIn/account linking
- **Purpose:** 確認 issuer+sub 決定身份，不被 client email 接管
- **Prerequisites:** 兩個 test issuer/sub fixture
- **Request / action:** 相同 email 不同 sub；相同 sub 重登；改 email/UserInfo；觀察 Account 與 user
- **Expected secure behavior:** 非任意 email 自動接管；相同穩定 issuer/sub 正確連結
- **Potential vulnerable behavior:** 攻擊者 email 可連結到別人帳號
- **Risk:** Medium；獨立 DB，無真實 email

### ST-15 — Redirects／logout

- **Test ID:** ST-15
- **Target endpoint:** /api/auth/signin；callback；logoutAction
- **Purpose:** open redirect、logout URL與 token query logging
- **Prerequisites:** 自己的 cookie、固定 test issuer、staging logs
- **Request / action:** callbackUrl 給外站、scheme-relative、編碼 URL；logout 檢查 post_logout_redirect_uri 與日誌
- **Expected secure behavior:** redirect 限核准同源；token 不出現在未授權 log
- **Potential vulnerable behavior:** 導向任意域名或 ID token 被第三方 log 保存
- **Risk:** Low；不向外站送 token，使用 localhost 接收器

### ST-16 — Direct scoped zone grant

- **Test ID:** ST-16
- **Target endpoint:** /api/zones/[zone]/records；/api/inventory；zone/request routes
- **Purpose:** SEC-01：record scope 是否在每個 sink 被執行
- **Prerequisites:** 非 global user、ADMIN grant scope=*.lab.example.test.；mock DNS
- **Request / action:** 取得 scope 內外資料並各嘗試新增／修改／刪除 fixture；刪除給合法 fixture password
- **Expected secure behavior:** scope 外讀写／review/export/metadata 均拒絕，DNS 不變
- **Potential vulnerable behavior:** scope 被丟棄導致 whole-zone ADMIN
- **Risk:** Medium；只 mock DNS，禁止正式 record mutation

### ST-17 — Group scoped／expired grants

- **Test ID:** ST-17
- **Target endpoint:** 同 ST-16；requireActor
- **Purpose:** group grant、allowedRecordTypes、expiry 與直接權限合併
- **Prerequisites:** 隔離 DB 建 scope/type/expired/group membership fixture
- **Request / action:** 切換 group member、兩個 scoped grants、expired grant；重測內外／type
- **Expected secure behavior:** 逐 record 合併合法 scope，expired 不生效；不得先取最高 zone role
- **Potential vulnerable behavior:** 合併 role 導致越界；allowedRecordTypes 被忽略
- **Risk:** Medium；DB fixture，不觸正式授權

### ST-18 — 所有入口的 auth coverage

- **Test ID:** ST-18
- **Target endpoint:** Attack Surface 中全部 API 方法／HTML／Server Action
- **Purpose:** route/proxy/workspace 防護與路徑差異
- **Prerequisites:** 匿名、UserA、Admin cookie；完整 endpoint inventory
- **Request / action:** 逐一低量請求；特別 /dns、/api、encoded path、trailing slash、RSC request 與 server action
- **Expected secure behavior:** 敏感 route/action 都驗證；未匹配 proxy 的 page 仍受 layout/handler 保護
- **Potential vulnerable behavior:** 僅依 matcher 導致未保護入口
- **Risk:** Low；所有 mutation 以無效 fixture／mock sink，非 production

### ST-19 — Unit BOLA

- **Test ID:** ST-19
- **Target endpoint:** /api/units/[id]；changes；inspections
- **Purpose:** 水平 tenant 隔離
- **Prerequisites:** UnitA member、UnitB member；record/request/id fixture
- **Request / action:** A 換 B unitId/recordId/id/hash；正確 A 作對照
- **Expected secure behavior:** B 資料與 mutation 拒絕；不得先外洩 detail
- **Potential vulnerable behavior:** 只驗登入或 record 存在即允許
- **Risk:** Medium；只隔離 metadata/mock DNS

### ST-20 — 申請可見性與審查

- **Test ID:** ST-20
- **Target endpoint:** /api/dns-requests GET；/[id] PATCH
- **Purpose:** self/unit/zone/global reviewer 規則
- **Prerequisites:** 兩 unit／legacy request、普通成員、unit admin、zone admin、global admin
- **Request / action:** 讀列表、核准／拒絕自己與他人 request；偽造 unitId/contact
- **Expected secure behavior:** 依 Authorization Matrix；普通 unit 成員不能自己發布 DNS
- **Potential vulnerable behavior:** 任意 id 可看 PII／核准／繞過 review
- **Risk:** Medium；只 mock DNS

### ST-21 — 角色 mass assignment／owner

- **Test ID:** ST-21
- **Target endpoint:** /api/users/[id] PATCH/DELETE
- **Purpose:** globalRole/disabled 與 owner 專屬邊界
- **Prerequisites:** owner、global admin、普通 user、fixture target
- **Request / action:** 各角色送 role/note/disabled/removedAt/ownerId 等額外欄位；嘗試改 owner
- **Expected secure behavior:** schema 白名單；只有預期角色可變更；owner 不可被非 owner 撤權
- **Potential vulnerable behavior:** 未知欄位直入 ORM 或 admin 取得 owner 控制
- **Risk:** Medium；隔離帳號，無正式角色變更

### ST-22 — Unit 管理流程

- **Test ID:** ST-22
- **Target endpoint:** /api/units POST；/[id] PATCH
- **Purpose:** 建立、manager 指派、allowlist、最後管理員保護
- **Prerequisites:** G、Ua、Ue；隔離 units／allowlist
- **Request / action:** 逐 action 測 role；移除最後管理員；用兩個請求測撤權與 member change
- **Expected secure behavior:** action 專屬授權；必要 unit manager invariant 原子維持
- **Potential vulnerable behavior:** Ua 能 global create/rename 或最後管理員消失
- **Risk:** Medium；只 fixture

### ST-23 — Inventory assignment

- **Test ID:** ST-23
- **Target endpoint:** /api/inventory PUT；/assignment PUT
- **Purpose:** ownership 跨 unit 與 stale record hash
- **Prerequisites:** G、zone admin、普通 member；mock live DNS
- **Request / action:** 更換 record tuple/unitId/hash/version；跨無權 zone assignment
- **Expected secure behavior:** 全域限定 assignment；metadata 需 zone scope；stale/live 不匹配拒絕
- **Potential vulnerable behavior:** 任意 unitId 接管 DNS metadata 或 PII
- **Risk:** Medium；mock DNS

### ST-24 — Inspection deletion

- **Test ID:** ST-24
- **Target endpoint:** /api/inventory/inspections/[id] DELETE
- **Purpose:** 歷史刪除 BOLA／owner-only
- **Prerequisites:** owner、G、普通 user；兩個 inspection fixture
- **Request / action:** 替換 id/recordId/version；跨 record 對照
- **Expected secure behavior:** 只有 owner；id 與 record/version 正確綁定
- **Potential vulnerable behavior:** 猜 id 可刪別人的清查歷史
- **Risk:** Medium；僅可丟棄 fixture，實作 mock delete

### ST-25 — Zone permission BOLA

- **Test ID:** ST-25
- **Target endpoint:** /api/zones/[zone]/permissions；/[id]
- **Purpose:** owner-only grant 与 zone/id 綁定
- **Prerequisites:** owner、G、zone admin；兩 zone grant fixture
- **Request / action:** 非 owner POST/DELETE；owner 用 zoneA 路徑與 zoneB permissionId
- **Expected secure behavior:** 非 owner 拒絕；錯 zone/id 拒絕
- **Potential vulnerable behavior:** zone ADMIN 自授 scope 或跨 zone 撤權
- **Risk:** Medium；隔離 grants

### ST-26 — DNS name/type 邊界

- **Test ID:** ST-26
- **Target endpoint:** records mutation；unit applications/changes
- **Purpose:** canonicalization、zone boundary、apex/NS/SOA保護
- **Prerequisites:** mock DNS，測試 name/type 集合
- **Request / action:** 用 suffix lookalike、尾點／大小寫、encoded separator、apex、禁止 type；正常子域對照
- **Expected secure behavior:** canonical zone containment；受保護 type/apex 依政策拒絕
- **Potential vulnerable behavior:** 字串 suffix/encoding 使寫入無權域或關鍵 RRset
- **Risk:** Medium；只 mock DNS

### ST-27 — RRset 版本競態

- **Test ID:** ST-27
- **Target endpoint:** /api/zones/[zone]/records PATCH/DELETE
- **Purpose:** stale hash／compare-before-write 的失效保護
- **Prerequisites:** mock DNS + barrier；兩 authorized fixture clients
- **Request / action:** 讀同 hash；只發兩個不同 update；重播舊 hash；比對 DNS/DB
- **Expected secure behavior:** 第二個 stale 操作拒絕或序列化，無 lost update
- **Potential vulnerable behavior:** 兩操作都通過、覆蓋新資料
- **Risk:** Medium；最多 2 個操作，非 stress

### ST-28 — 刪除保護密碼

- **Test ID:** ST-28
- **Target endpoint:** records DELETE；zone DELETE；admin/deletion-protection
- **Purpose:** secondary password、attempt limiter與state版本
- **Prerequisites:** mock DNS、測試密碼、低 threshold、owner與zone admin
- **Request / action:** 少量錯密碼跨instance；缺confirm；正確密碼；PUT設定 version stale
- **Expected secure behavior:** 錯誤不寫 DNS；限制共享；只有 owner 設密碼；state version 原子
- **Potential vulnerable behavior:** 換 instance 繞 limiter／缺密碼可刪／覆蓋設定
- **Risk:** Medium；delete sink mock，不刪真實資料

### ST-29 — 申請 quota

- **Test ID:** ST-29
- **Target endpoint:** /api/dns-requests POST；unit changes
- **Purpose:** SEC-03：record 數量／pending／累積 storage 限額
- **Prerequisites:** preseed quota-1 fixture；可設定小限制；mock PDNS
- **Request / action:** 超小 per-request limit 一筆；quota-1 時僅並發兩個小請求
- **Expected secure behavior:** 明確 max 與原子累積 quota；無越界寫入
- **Potential vulnerable behavior:** 250 chunk／body cap 被誤當累積 quota；兩請求超額
- **Risk:** Medium；小 fixture，無大量資料或 DoS

### ST-30 — Pagination 與 query bounds

- **Test ID:** ST-30
- **Target endpoint:** /api/dns-requests；/api/audit；inventory/units lists
- **Purpose:** SEC-03：分頁與無界限 query
- **Prerequisites:** 少量 preseed list、User/G
- **Request / action:** page=0/-1/極大值、size 額外欄位、q 長度；檢查 query take/skip 與返回上限
- **Expected secure behavior:** server 固定 cap／cursor；無無界限返回；錯輸入4xx
- **Potential vulnerable behavior:** 全量 PII/read或極大 skip；不測巨大 DB 成本
- **Risk:** Low；小資料庫，不 load test

### ST-31 — Legacy approve/reject race

- **Test ID:** ST-31
- **Target endpoint:** /api/dns-requests/[id] PATCH
- **Purpose:** SEC-05：legacy null-unit PENDING race
- **Prerequisites:** 隔離 legacy fixture、兩個 authorized reviewer、mock DNS barrier
- **Request / action:** 兩操作 APPROVE/REJECT 卡在 check 後；控制兩種完成順序
- **Expected secure behavior:** state check 與 transition 序列化；final status 與 DNS 一致
- **Potential vulnerable behavior:** final REJECTED 但 DNS 已發布
- **Risk:** Medium；僅 2 操作、mock DNS

### ST-32 — Unit review race／撤權

- **Test ID:** ST-32
- **Target endpoint:** /api/dns-requests/[id] PATCH
- **Purpose:** 新版 unit lock 對照與 permission TOCTOU
- **Prerequisites:** unit request fixture、mock DNS barrier
- **Request / action:** 兩次 review；另在等待鎖期間撤 reviewer role／membership
- **Expected secure behavior:** 只有一次有效 transition；鎖內重新檢查必要 state/權限
- **Potential vulnerable behavior:** 雙重 publish 或等待者沿用 stale permission
- **Risk:** Medium；隔離權限，2 操作

### ST-33 — DNS／DB failure reconciliation

- **Test ID:** ST-33
- **Target endpoint:** review；records；inventory assignment
- **Purpose:** H-03：跨 HTTP/DB 非原子 transaction
- **Prerequisites:** local PDNS stub；可注入一個 DB failure／timeout
- **Request / action:** 模擬 DNS 成功DB失敗、response丟失、外部writer；retry一次並核對APPLIED/expected snapshot
- **Expected secure behavior:** 可辨識／修復不一致；retry不重複破壞；不錯報成功
- **Potential vulnerable behavior:** 錯誤狀態導致 retry覆蓋或拒絕已發布 DNS
- **Risk:** Medium；fault injection 限 local，不停真實服務

### ST-34 — XSS／CSV output

- **Test ID:** ST-34
- **Target endpoint:** TXT/content/contact/note → pages/API/CSV
- **Purpose:** stored/reflected/DOM XSS 與 spreadsheet formula
- **Prerequisites:** fixture marker、瀏覽器、CSV文字查看器
- **Request / action:** 保存 inert HTML marker（無網路/script）；反射 query；CSV用 =1+1／前置空白對照
- **Expected secure behavior:** React escape，無 unsafe HTML；CSV公式被處理；不暴露其他unitPII
- **Potential vulnerable behavior:** HTML被解析、DOM sink執行或CSV公式未轉義
- **Risk:** Low；inert marker，不植入 active exploit

### ST-35 — SSRF／unsafe upstream

- **Test ID:** ST-35
- **Target endpoint:** PowerDNS client；retired /api/admin/powerdns
- **Purpose:** 排除 user URL sink，驗證 redirect、timeout、response validation
- **Prerequisites:** local HTTP stub、固定 env URL；禁止 metadata targets
- **Request / action:** 使用 localhost stub 302、malformed JSON/rrsets、慢回應（virtual timer）；user body URL 測無效
- **Expected secure behavior:** URL只由部署設定；redirect拒絕、8s timeout、錯誤封裝
- **Potential vulnerable behavior:** 普通user能改目標／跟redirect／無限制消費upstream
- **Risk:** Low；只本地 stub、不連 private network/metadata

### ST-36 — CSRF mutation matrix

- **Test ID:** ST-36
- **Target endpoint:** Attack Surface 全 POST/PUT/PATCH/DELETE；Server Action
- **Purpose:** Origin/SameSite/content type/protocol token 組合
- **Prerequisites:** local二個不同origin；fixturecookies；mutation sinks mock
- **Request / action:** 每種方法測缺Origin、外站Origin、null、同站子域、form/simple/JSON；Auth.js token另測
- **Expected secure behavior:** 外站變更拒絕；trusted same-origin正常；fail-closed與產品客户端政策一致
- **Potential vulnerable behavior:** 外站 cookie request 可改 state；缺Origin不直接假定exploit
- **Risk:** Medium；mock所有mutation，不對 production browser做測試

### ST-37 — Ingress headers／HSTS

- **Test ID:** ST-37
- **Target endpoint:** Caddy /；/healthz；error route；Auth.js cookies
- **Purpose:** SEC-07及forwarded host/proto信任
- **Prerequisites:** 授權 staging HTTPS、可看 edge設定
- **Request / action:** 正常/error response查HSTS等；HTTP跳轉；偽X-Forwarded-Host/Proto用無token請求
- **Expected secure behavior:** edge覆盖HTTPS含error；host固定或allowlist；forwarded header只信trusted edge
- **Potential vulnerable behavior:** HSTS缺少或攻擊header改callback/cookieorigin
- **Risk:** Low；少量正常HTTP，不直接訪問VM私網

### ST-38 — CSP／nonce regression

- **Test ID:** ST-38
- **Target endpoint:** 全部 HTML；/dns；登入/logout頁
- **Purpose:** SEC-06：nonce落實与theme/hydration
- **Prerequisites:** 隔離修正版本、Report-Only、瀏覽器
- **Request / action:** 比對每response nonce；inert inline canary；正常導覽/theme/Auth flow
- **Expected secure behavior:** nonce唯一且傳遞完整；非授權inline阻擋；frame-ancestors生效
- **Potential vulnerable behavior:** 仍需unsafe-inline或某document無CSP；合法UI失效
- **Risk:** Low；不執行資料外傳腳本

### ST-39 — 敏感 cache

- **Test ID:** ST-39
- **Target endpoint:** users/audit/inventory/requests/zones API；RSC
- **Purpose:** H-04：browser/CDN/proxy跨身份cache
- **Prerequisites:** 授權staging、UserA/B及不同PII fixture
- **Request / action:** A讀取、logout、B讀同URL；查Cache-Control/Age/Vary及瀏覽器back
- **Expected secure behavior:** 敏感response no-store或安全隔離；B不見A私有資料
- **Potential vulnerable behavior:** shared cache返A資料；僅header缺少不等於已泄漏
- **Risk:** Low；只fixturePII

### ST-40 — Logs／redaction

- **Test ID:** ST-40
- **Target endpoint:** API error；Auth.js；audit；deployer logs
- **Purpose:** H-05：token/password/PII canary
- **Prerequisites:** 隔離logger、合成FAKE_SECRET_* marker、log ACL
- **Request / action:** 誘發可控validation/upstream/auth錯誤；檢查stdout/journal/audit/response
- **Expected secure behavior:** secret redacted；public response無stack；必要PII受ACL/retention
- **Potential vulnerable behavior:** canary明文或internal error回傳；server stack本身不是public漏洞
- **Risk:** Low；禁止使用真實secret或上傳logs

### ST-41 — Webhook validation

- **Test ID:** ST-41
- **Target endpoint:** POST /hooks/github
- **Purpose:** 簽章、ref、event、method與size驗證
- **Prerequisites:** local webhook stub、測試HMACkey、部署executor完全stub
- **Request / action:** 正確/錯sig、短sig、非push、錯repo/ref、非法UUID、GET；limit以mockstream驗證
- **Expected secure behavior:** 只有效signed指定事件入queue；無部署副作用
- **Potential vulnerable behavior:** 未驗簽、錯ref入queue、oversize無限制
- **Risk:** Medium；stub deploy，無docker/git/第三方請求

### ST-42 — Webhook replay

- **Test ID:** ST-42
- **Target endpoint:** POST /hooks/github
- **Purpose:** SEC-04：signed bytes 与 unsigned delivery dedupe
- **Prerequisites:** 同ST-41；一份合成signedpayload
- **Request / action:** 原delivery重送；換UUID同bytes/signature；不同真正signedcommit對照
- **Expected secure behavior:** 同signed event/desired commit只執行一次或no-op；不能靠UUID唯一
- **Potential vulnerable behavior:** 換UUID造成重複deploy restart
- **Risk:** Medium；固定executor counter，不實際部署

### ST-43 — Webhook retry／ordering

- **Test ID:** ST-43
- **Target endpoint:** webhook queue drain/recovery
- **Purpose:** bounded retry與restart recovery
- **Prerequisites:** tempqueue；stub executor可失敗；virtualtimer
- **Request / action:** 同commit retry；新舊事件倒序；模擬一次worker restart
- **Expected secure behavior:** failed可有限retry；desiredcommit/no-op正確；無無限restart loop
- **Potential vulnerable behavior:** 永久失敗无限retry或舊event重啟／降版誤報
- **Risk:** Medium；tempqueue/stub，非真實docker restart

### ST-44 — Retired／unsupported入口

- **Test ID:** ST-44
- **Target endpoint:** 410 routes；未註冊provider；upload/graphql/debug
- **Purpose:** 確認不存在可用hidden功能
- **Prerequisites:** 匿名與loggedclient，route inventory
- **Request / action:** 每retired方法與OPTIONS/HEAD；multipart inert fixture；未註冊provider path
- **Expected secure behavior:** 401/410/404/405符合保護；不寫DB/FS、不把library功能當暴露
- **Potential vulnerable behavior:** 舊handler仍能修改設定/restore/檔案
- **Risk:** Low；短body、無可執行上傳內容

### ST-45 — Injection／schema whitelist

- **Test ID:** ST-45
- **Target endpoint:** 所有 route params/query/body→Prisma/PDNS
- **Purpose:** SQL/command/template/path injection與massassignment
- **Prerequisites:** localmock所有sinks、inert字符串fixture
- **Request / action:** 單引號、模板字樣、shell metacharacter、../、未知欄位；inspect bind params/argv/URL encoding
- **Expected secure behavior:** DB綁定、schema字段選取、無user→shell/template/path sink
- **Potential vulnerable behavior:** 字串拼SQL/shell或任意字段寫ORM；未觀察sink不報漏洞
- **Risk:** Low；不含執行命令／破壞SQL

### ST-46 — Filesystem／local demo isolation

- **Test ID:** ST-46
- **Target endpoint:** local-store；webhook queue；deploy config files
- **Purpose:** filename/path與private storage
- **Prerequisites:** temp根目錄；nonproduction testflag；不啟動demo服務
- **Request / action:** mock path manipulation；查mode0700/0600；production條件下localdemo拒絕；queueUUIDpath
- **Expected secure behavior:** 無user-controlled arbitrarypath；敏感檔不public；symlink/ACL依部署評估
- **Potential vulnerable behavior:** 可寫任意path／production用demo auth；僅operator可控不是remoteexploit
- **Risk:** Low；只temp fixtures、不讀寫真實檔案

### ST-47 — CI／deployment boundary

- **Test ID:** ST-47
- **Target endpoint:** CI YAML；Docker/Compose；deploy scripts
- **Purpose:** supply-chain、startup secret驗證、deployer權限
- **Prerequisites:** artifact/配置唯讀；所有部署命令stub
- **Request / action:** 核對actions SHA/permissions/PR workflow；測missing env fail-fast；branch/ref與shellargv固定
- **Expected secure behavior:** 非trustedPR無secretdeploy；missingsecret拒啟動；固定命令／least privilege
- **Potential vulnerable behavior:** 不可信input執行shell或CI洩漏secret
- **Risk:** Low；不執行部署／安裝script

### ST-48 — DB runtime least privilege

- **Test ID:** ST-48
- **Target endpoint:** runtime DATABASE_URL → Postgres
- **Purpose:** SEC-09：實際role flags與grants
- **Prerequisites:** 隔離DB或明確授權的唯讀stagingDB連線
- **Request / action:** SELECT current_user；查pg_roles rolsuper/rolcreaterole/rolcreatedb/rolbypassrls與可讀grants
- **Expected secure behavior:** runtime非superuser；migration/bootstrap分離；僅必要schema權限
- **Potential vulnerable behavior:** fresh POSTGRES_USER bootstrap role直接給web
- **Risk:** Low；只SELECT，不執行DDL或正式資料查詢

### ST-49 — Dependency artifact核對

- **Test ID:** ST-49
- **Target endpoint:** lockfile；Next standalone／image artifact
- **Purpose:** SEC-08及實際bundled版本／OG reachability
- **Prerequisites:** 可信已建artifact、registry官方advisory唯讀
- **Request / action:** 核對Next/compiledReact/Auth版本與OG routes；掃artifactSBOM；recheck npm audit
- **Expected secure behavior:** 受影響版本升到已修補release；無未盤點ImageResponse入口
- **Potential vulnerable behavior:** audit0但bundled已知issue漏報；不將不可達RCE評Critical
- **Risk:** Low；無RCE/SVG payload、不build/install app

## 結果判讀

FAIL 必須附可重現的角色、授權前提與 source→sink 證據；不能把功能不存在、policy 未定或 setup failure 當已確認漏洞。需第三方設定／正式配置才能判斷時標 INCONCLUSIVE，不擅自擴大測試。修正後只在相同隔離目標重跑受影響測試及必要 regression，報告中分開「source 已修正」與「動態已驗證」。
