# NCUEECESNMG DNS Manager

A production-oriented PowerDNS Authoritative management platform built with Next.js, TypeScript, PostgreSQL, Prisma, Auth.js, Zod, and Tailwind CSS. It keeps the PowerDNS API key entirely server-side.

## Architecture

### Portal 帳號呈現與最高權限

測試期間保留帳密與 Portal 登入；`AUTH_PASSWORD_LOGIN_ENABLED=true`（預設）允許已有密碼的測試帳號登入，測試完成可設為 `false` 關閉。local demo 仍保留測試登入。請於 Portal 應用設定授權 `identifier student-id email`。使用者管理以電子郵件為主，顯示名稱採 Portal identifier（帳密使用者採登入帳號），不使用暱稱或學號取代帳號。Portal 信箱另存 User.portalEmail，僅供顯示、不參與帳號連結或權限判斷；未授權時標示未提供，既有使用者重新登入後更新。管理頁可編輯最多 1000 字備註，備註不影響權限。

登入已改接 Logto，前端仍顯示 NCU Portal。應用只要求 Logto 的 `UserScope.Identities`；OIDC 必要的 `openid` 仍保留。最高權限以 NCU connector identity 的 `details.identifier=115502532` 驗證，姓名由同一 identity 的 `details.rawData.username` 等顯示欄位同步，姓名下方顯示其 identifier；sub、name、備註和 email 不授權。詳見 [Logto 切換指南](deploy/LOGTO.md)。

部署須先執行 Prisma migration（Docker 部署的 migrate 服務會執行），新增 User.studentId、User.note 與 User.portalEmail。既有 Portal 帳號下次登入會更新學號，無需刪除或重建帳號；歷史稽核原始資料不會被改寫。

### 網域申請開放設定

管理員在 Zone 清單的「使用者申請」欄位逐一開放或暫停申請。**尚未設定的網域預設暫停申請**，升級後請先開放需要提供申請的網域。申請表只顯示開放中的 PowerDNS 網域；送出時後端再次檢查，不接受未開放網域。暫停不會修改 DNS，也不影響既有紀錄或待審核申請。

設定保存在既有 SystemSetting（本機 demo 使用本機檔案），依 PowerDNS 連線與 server ID 區分，不需資料庫 migration。管理員只能調整自己可管理的網域；變更包含操作者、時間、前後狀態的稽核紀錄，並防止舊頁面覆蓋較新的設定。網站沒有新增網域入口，新增網域 API 也已停用。

The frontend is organized around a persistent authenticated workspace:

- `app/(workspace)/layout.tsx`: shared session-aware shell; individual pages still check permissions.
- `components/providers.tsx`: one theme provider and notification surface for login and workspace.
- `components/records/`: workbench controls, table/list/group views, IP board, record dialog, and shared view types.
- `components/requests/`: multi-record application form, request filters/cards, review dialog, and shared types.
- `components/admin/`: inventory, user management, and PowerDNS connection settings.
- `lib/inventory/`: per-record ownership and append-only inspection history, scoped to the active PowerDNS connection.
- `components/ui/dialog.tsx`: native modal with focus trapping, Escape, focus restoration, and pending-state protection.
- `lib/client/`: typed API requests and cancellable resource loading with visible retry states.
- `styles/`: design tokens, base rules, workspace, shared components, records, requests, and authentication. `app/globals.css` only imports these layers.

URLs include `/login`, `/requests`, `/requests/new`, `/zones`, `/zones/[zone]`, `/inventory`, `/admin/users`, and `/admin/powerdns`. `/dashboard` remains a compatibility redirect. There are no new runtime dependencies.

```text
Browser ──HTTPS──> Next.js UI + protected route handlers ──private network──> PowerDNS REST API
                         │
                         └──> PostgreSQL (users, permissions, audit log)
```

Every API operation authenticates the caller, resolves effective direct/group permissions, validates and normalizes input, checks record policy, performs the PowerDNS change, and appends an audit event. Unauthorized zone lookups use the same not-found response as absent zones.

## Included

- Read-only administrator operation log at `/activity`, with filters, pagination, before/after details and request correlation
- Collapsible sidebar groups and desktop navigation toggle

- Open NCU Portal sign-in with automatic USER provisioning; administrator roles assigned manually by the protected owner
- Owner authorization requires a consistent Logto identity with `details.identifier=115502532`; email, sub and display claims grant no privileges. Global `ADMIN` / `USER` and zone `VIEWER`, `EDITOR`, `ADMIN` roles remain separate.
- Per-value applicant, unit, extension and purpose; grouped inventory with server-stamped inspection history
- User creation, name editing and suspension; only the owner can assign administrator privileges
- Environment-only PowerDNS API configuration; no web credential input or database override
- Direct and group-ready permission schema, expiry, resource patterns, and record-type policy fields
- Backend-filtered zones and protected mutation endpoints
- Zone listing/deletion API and responsive management UI; creating zones is disabled in the website and API
- Correct multi-value RRsets using PowerDNS `REPLACE` and `DELETE`
- SHA-256 optimistic concurrency hashes that reject stale edits
- Validation for FQDN, A, AAAA, CNAME, MX, TXT, SRV, CAA, and TTL
- SOA, apex NS, DS, and DNSKEY protection
- Immutable success/failure audit events with before/after JSON and request context
- Admin zone management, user-owned DNS requests, approval workflow, responsive layout, and light/dark theme
- Mock PowerDNS mode, unit tests, migration, seed, and hardened Docker deployment

## Local demo (no database or PowerDNS required)

```bash
npm ci
npm run db:generate
npm run demo
```

Open `http://localhost:3000`. The first screen is the login page.

| Role | Email | Password |
| --- | --- | --- |
| Demo owner | `owner@aegis.local` | `DemoOwner!2026` |
| Admin | `admin@aegis.local` | `AegisAdmin!2026` |
| User | `user@aegis.local` | `AegisUser!2026` |

Admin can browse zones, use all six record views, and review requests. User has two separate navigation entries: 申請 DNS (`/requests/new`) opens the application form, and 我的 DNS (`/requests`) shows only their own records and review status. Successful submissions return to 我的 DNS. Sign out in the sidebar to switch accounts.

The application starts with required applicant name, unit and extension (1–10 digits). Add or remove DNS rows with no application-level record-count limit; each row can select a different zone. Applicant details and a shared application ID are saved with every record. Each record is reviewed individually. Validation errors preserve all form inputs, and batch writes are all-or-nothing (including audit entries in PostgreSQL).

`GET /api/dns-requests/zones` authenticates the user and returns only zone names from the backend PowerDNS client. It does not expose records or grant Zone management access. The form supports loading, retry and empty-list states, and the server checks zone availability again on submission. The demo uses the same flow with mock PowerDNS zones. Live mode uses server-only `PDNS_API_URL`, `PDNS_API_KEY`, `PDNS_SERVER_ID`, and `PDNS_MOCK=false`; no credentials are sent to the browser. POST `/api/dns-requests` now accepts `{ applicantName, applicantUnit, applicantExtension, records: [{ zoneName, name, type, content, ttl, purpose? }] }`.

For an existing database, run `npm run db:migrate` before starting this version. The additive `20260912020000_dns_applications` and `20260912030000_dns_inventory` migrations preserve older records without inventing applicant information. Local demo needs no migration.

`npm run demo` binds to loopback on port 3000, enables in-memory DNS and requests, and disables database/external OAuth connections for that process. It reads optional `.env.local` settings. `DEV_OWNER_PASSWORD`, `DEV_ADMIN_*` and `DEV_USER_*` customize credentials when the demo user store is first initialized. Existing accounts are not overwritten on restart. Login remains required.

DNS and application changes reset on server restart. User accounts, ownership, inspection history and connection settings persist under the git-ignored `.local-demo/` directory with restricted filesystem permissions. Its encryption key must be backed up with the data. Theme and preferred record view are the only browser-stored preferences; account and inventory data stay server-side. Demo passwords are development-only and are never used to create production accounts.

## Backend ownership and DNS inventory

Record views show applicant, unit and purpose beside each individual DNS value; open the ownership button to edit name, email, unit, extension and purpose without changing DNS. Approval snapshots application details automatically. Legacy approved requests are used as a fallback only when the connection can be safely associated; missing information is shown as missing.

`/inventory` groups current DNS records by applicant, unit, purpose or zone, with search and filters for uninspected records or incomplete ownership. Each inspection appends the server time, authenticated account ID/name/email and an optional note. Clients cannot supply dates or impersonate inspectors. Editing ownership does not erase inspection history. Stale edits return HTTP 409. Historical rows remain stored if a DNS value disappears, but this screen only lists values currently in PowerDNS. This is an on-demand inventory workflow, not an automatically scheduled inspection.

`/admin/users` manages account roles, status and notes. Only the account with a verified NCU identity `details.identifier=115502532` may assign administrators or delegate zone permissions. The owner's role and status cannot be changed through the UI; notes remain editable. Names are synchronized from display fields inside the same identity details. Email, sub and display names do not authorize access. Other administrators are assigned manually through user management. Disabled accounts and current database roles are checked on protected requests. Unlinked historical `SUPER_ADMIN` accounts receive ordinary `ADMIN` access, not owner privileges.

## Database-backed local setup

Node.js 22.13+, PostgreSQL 15+, and PowerDNS Authoritative are expected. PowerDNS is optional in mock mode.

```bash
cp .env.example .env
npm ci
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. Configure the database, seed the protected owner and configure NCU Portal before signing in. For the self-contained password-login demo above, do not start PostgreSQL.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Production | PostgreSQL connection string |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | Yes | The same random 32+ byte signing secret |
| `NEXTAUTH_URL` | Yes | Public app origin |
| `AUTH_LOGTO_ID`, `AUTH_LOGTO_SECRET` | Live login | Logto application credentials; owner identity uses verified `identities` details |
| `OWNER_INITIAL_PASSWORD` | One-time seed | Unique 16+ character password for the protected owner |
| `PDNS_API_URL`, `PDNS_API_KEY` | Live mode | Server-side PowerDNS credentials |
| `PDNS_SERVER_ID` | No | Defaults to `localhost` |
| `PDNS_MOCK` | Development | Enables the in-memory DNS server |
| `SETTINGS_ENCRYPTION_KEY` | Legacy deployment compatibility | Retain the existing value when upgrading; web-saved API credentials are no longer read |
| `DEV_OWNER_PASSWORD` | Local demo | Protected owner's initial demo password |
| `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD` | Local demo | Administrator demo login |
| `DEV_USER_EMAIL`, `DEV_USER_PASSWORD` | Local demo | User demo login |

Generate secrets with `openssl rand -base64 32`. Never give a PowerDNS setting a `NEXT_PUBLIC_` prefix.

## Operation log scope

Application mutation APIs record a durable `MUTATION_STARTED` before execution, domain-specific details, and `MUTATION_COMPLETED` with HTTP status/duration. If the initial write fails, the mutation is blocked. An interrupted operation may have only a start event; check the target state before retrying, especially when PowerDNS succeeded but a later database write failed. Completion-write failures emit `AUDIT_COMPLETION_FAILED` to server stderr and an `X-Audit-Warning` response header. These are not distributed transactions with PowerDNS.

Logs include DNS/Zone changes, requests/reviews, permissions, users, allowlist membership, ownership/inspection details, sign-in/sign-out and explicit test-user creation. Secret fields and known environment secrets are redacted; DNS record content and personal applicant data remain visible only to global administrators. Local demo writes real new events to `.local-demo/audit.json`; old mock examples are no longer shown. There is no web edit/delete log endpoint. VM env edits, direct SQL/PowerDNS changes, deployments and pre-existing changes are outside this application log and need infrastructure logs; no historical details are invented.

## Login configuration

Sessions have a server-enforced 15-minute inactivity deadline, stored per login in the existing `Session` table (local demo uses `.local-demo/idle-sessions.json`). Background reads do not extend it. The browser sends throttled activity notifications for keyboard/pointer/scroll interactions and warns during the final minute; inactive, sleeping or closed browsers cannot revive an expired session. Same-origin checks protect the activity endpoint. Sign-out removes the server session. Existing sessions must sign in again after upgrading; no database migration is needed. Unsaved forms are not automatically submitted on timeout.

Anyone with a valid NCU Portal identity and verified contact email can sign in; no allowlist or advance user creation is needed. Register the callback:

```text
https://dnsmgr.ce.ncu.edu.tw/api/auth/callback/logto
```

Configure AUTH_LOGTO_ID and AUTH_LOGTO_SECRET and `AUTH_URL`, then recreate the web container. Password login remains available for testing; set `AUTH_PASSWORD_LOGIN_ENABLED=false` to disable it. Google is not supported. New Portal accounts always default to `USER`, never to administrator based on email/domain or Portal role claims. Only the protected owner can manually grant ADMIN through user management; existing roles and suspended-account checks remain enforced. The owner is verified by NCU identity `details.identifier`. Access to existing account data requires explicit operator linking; otherwise a new subject creates an independent USER account; they are never silently merged by email. New accounts store USER by default; the verified owner identifier receives effective SUPER_ADMIN access. The former allowlist page/API are retired. Old membership data and historical audit events are preserved, but have no effect on login.

PowerDNS reads only `PDNS_API_URL` (ending in `/api/v1`), `PDNS_API_KEY` and `PDNS_SERVER_ID`. Move previously web-entered settings to the server environment before upgrading. Existing encrypted database settings are retained but ignored. Inventory metadata remains scoped to the API URL/server ID; keep those unchanged to retain its associations. Unscoped legacy applications are not used to infer ownership on live servers.

## Database and first administrator

```bash
npm run db:migrate
npm run db:seed
```

The seed creates only `owner-bootstrap@accounts.invalid` with a scrypt password hash using `OWNER_INITIAL_PASSWORD` (16+ characters). It refuses to overwrite an existing owner account, including its password. Initialize the owner through this trusted operator command; do not expose a public bootstrap route. Remove the initial password from the runtime environment after seeding. No old-account linking or pre-existing SUPER_ADMIN role is required for verified identity `details.identifier=115502532` to access `/admin/users`; new account passwords require 12+ characters. Legacy seed variables are no longer used. For schema changes use `npm run db:migrate:dev -- --name descriptive_name` and commit the migration.

## PowerDNS configuration

Set `/etc/powerdns/pdns.conf`:

```ini
api=yes
api-key=A-LONG-RANDOM-SECRET
webserver=yes
webserver-address=127.0.0.1
webserver-port=8081
```

Restart PowerDNS and configure the matching app values. Do **not** expose port 8081 to the Internet. For a host process use `PDNS_API_URL=http://127.0.0.1:8081/api/v1`. Inside Docker, localhost is the web container; put PowerDNS on the private `dns_private` network and use `http://powerdns:8081/api/v1`, or use a firewall-restricted private address. Use TLS when traffic crosses hosts.

Admins can use `/admin/powerdns` to enter the API URL, server ID and key. The read-only test lists zones without saving settings or modifying DNS. API URLs must end with `/api/v1`, contain no embedded credentials/query/fragment, and match a trusted origin. Redirects are rejected to prevent forwarding keys to another host. Maintain the allowlist and private-network egress controls as an operator; the browser cannot edit the allowlist.

Saved keys use authenticated AES-256-GCM encryption and are never returned to the browser or included in audit events. A blank key preserves the current key only for the same URL and server ID; a different destination requires a new key. Back up `SETTINGS_ENCRYPTION_KEY` independently; replacing it without re-encrypting stored settings makes the saved key unreadable. Saved settings override environment credentials for subsequent live API calls. `PDNS_MOCK=true` always keeps DNS operations on demo data, even after saving settings; only an explicit connection test queries the entered server. Set `PDNS_MOCK=false` to use a real connection. See the [PowerDNS Authoritative API documentation](https://doc.powerdns.com/authoritative/http-api/index.html).

## Docker deployment

For the production **dnsmgr.ce.ncu.edu.tw** topology (Ubuntu 22.04/24.04 private VM, separate Caddy proxy), use the [one-command VM installer and setup guide](deploy/QUICKSTART.md). It generates secrets, initializes the owner, installs a private IP-restricted gateway and signed webhook receiver, and includes a one-time GitHub webhook registration helper. Main pushes build first, then run Compose **down / up without deleting data volumes**.

For the current production Compose, NCU Portal and signed GitHub webhook setup, follow [the complete deployment guide](deploy/README.md). Keep production secrets outside the checkout using [deploy/app.env.example](deploy/app.env.example). The web image excludes local `.env` files and `.local-demo` data; a separate tools image runs migration and seed.

```bash
# First securely configure /etc/dns-manager/app.env using deploy/app.env.example.
docker compose --env-file /etc/dns-manager/app.env up -d --build --wait
docker compose --env-file /etc/dns-manager/app.env --profile maintenance run --rm --no-deps seed
```

The standalone image runs non-root with a read-only filesystem and writable temporary/cache paths. PostgreSQL stays on an internal Docker network. Web binds only to host loopback; terminate TLS at a trusted reverse proxy. PowerDNS is external and must be routed over a firewall-restricted private path. Compose does not provision a PowerDNS server. Startup requires HTTPS AUTH_URL, persistent session/encryption secrets and a database. Production never uses demo account credentials.

The NCU Portal button uses Logto OIDC (ES384, PKCE, state and nonce). Configure AUTH_LOGTO_SECRET; AUTH_LOGTO_ID defaults to the registered application ID. The only requested Logto user scope is `identities`; owner authorization uses a consistent NCU identity `details.identifier`, not its name or Logto sub. Existing accounts require operator-verified binding, never automatic email merging. See [Logto deployment and migration](deploy/LOGTO.md). Local demo remains disabled; credentials remain available for testing.

## Security notes

- Backend authorization is authoritative; hidden UI controls are only a convenience.
- Mutations use signed SameSite cookies plus same-origin enforcement in the app proxy.
- Zod validates payloads; canonical names are encoded before entering PowerDNS paths.
- User-facing PowerDNS errors are sanitized; secrets/tokens are omitted from logs.
- RRset updates fetch current state and return HTTP 409 for stale hashes.
- Editors cannot mutate SOA, NS, DS, or DNSKEY. Apex NS deletion requires Super Admin.
- CSP, frame denial, MIME-sniffing prevention, referrer policy, and browser restrictions are set globally.
- Use a secrets manager and rotate OAuth, DB, session, and PowerDNS secrets regularly.

## Backup and recovery

System administrators can use **匯出全部 DNS CSV** in the Zone management header. The download includes every record value from the configured PowerDNS server (forward and reverse zones, enabled and disabled records), plus ownership, inspection history and RRset comments. It ignores UI filters. Any fetch/audit failure aborts the download rather than producing a partial file. Exports are logged and never cached. UTF-8 BOM and CSV quoting support spreadsheet import; formula-like cell values receive a leading apostrophe for safety. This is a human-readable record export, not a restorable database/PowerDNS backup or an atomic cross-zone snapshot. Treat downloaded contact/ownership data as sensitive.

Back up PostgreSQL, the settings encryption key, and the PowerDNS backend. PostgreSQL preserves authorization, ownership, inspection and audit data, not authoritative zones. Test restores. Audit and inspection rows are append-only at the application layer; database operators can still modify storage, so add database retention or write-once exports to meet compliance needs.

## Verification

### Units and shared DNS

- `/units` lets authenticated users create a unit or join using its private passcode. The creator becomes a unit administrator; joining always defaults to VIEWER. Global system administrators can oversee all units.
- VIEWER can read shared DNS and application history. EDITOR can submit additions and content-change requests. Unit ADMIN also manages member roles and rotates invitations. **Unit roles never grant zone permissions or DNS publication/review authority.** Only global system administrators can approve unit requests.
- Passcodes are cryptographically random (192 bits), stored only as SHA-256 digests, displayed once at creation/rotation, and never included in unit lists or audit snapshots. Removing a member invalidates the previous passcode; a unit administrator must generate and distribute a new one. At least one active unit administrator is retained during membership changes.
- Select an explicit shared unit in the DNS application form. A free-text applicant-unit name does not grant access. Historical personal DNS is not automatically shared. Unit changes target one existing record value; name, type, TTL, neighboring values and disabled flags are preserved. New names/types require a new application.
- Shared DNS lists contain only explicitly linked, currently present records from the configured PowerDNS connection. Review rechecks membership, connection scope and the original RRset; conflicts must be rejected and resubmitted. Pending changes do not modify DNS.
- Deploy migration `20260914050000_dns_units` before starting the new web image (`npm run db:migrate`, or the existing Compose migrate service). This migration adds tables/nullable columns; existing records are preserved and remain unshared. Unit features require PostgreSQL and do not enable or start local demo.
- PostgreSQL and PowerDNS cannot commit atomically. Content-change retries recognize an exact already-applied result; ambiguous conflicts fail closed for operator review. Writes made directly in PowerDNS or other tools are not locked by this application—avoid simultaneous external writes to the same RRset.

Opt-in integration tests use a **disposable localhost database named `dns_units_test`**, with fake in-process PowerDNS (no live DNS writes). Apply migrations to that database, then run:

```bash
UNIT_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/dns_units_test' npx vitest run tests/units.integration.test.ts
```

The normal test command skips these database integration tests when the variable is absent.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Troubleshooting

- **Unable to connect:** verify the private route, API URL/key, server ID, bind address, and firewall.
- **No zones:** confirm a live zone/group permission or Super Admin role. Empty access is intentional.
- **OAuth redirect mismatch:** copy the callback exactly; `NEXTAUTH_URL` must match the external origin.
- **409 while editing:** reload and review the RRset because another operator changed it.
- **Docker cannot reach `127.0.0.1:8081`:** use the PowerDNS service/private host address.

## Extension points

The schema includes groups, resource patterns, type allowlists, and protected-record rules. Next steps can add OIDC/SAML, full group/policy editors, DNSSEC key lifecycle, audit rollback UI, and richer HA telemetry.
