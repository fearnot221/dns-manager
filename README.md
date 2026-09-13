# NCUEECESNMG DNS Manager

A production-oriented PowerDNS Authoritative management platform built with Next.js, TypeScript, PostgreSQL, Prisma, Auth.js, Zod, and Tailwind CSS. It keeps the PowerDNS API key entirely server-side.

## Architecture

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

- NCU Portal-only sign-in for database-backed environments; password sign-in only in local demo
- Protected owner `fearnot@ce.ncu.edu.tw`, global `ADMIN` / `USER`, plus zone `VIEWER`, `EDITOR`, and `ADMIN` roles
- Per-value applicant, unit, extension and purpose; grouped inventory with server-stamped inspection history
- User creation, name editing and suspension; only the owner can assign administrator privileges
- Environment-only PowerDNS API configuration; no web credential input or database override
- Direct and group-ready permission schema, expiry, resource patterns, and record-type policy fields
- Backend-filtered zones and protected mutation endpoints
- Zone listing/creation/deletion API and responsive management UI
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
| Protected owner | `fearnot@ce.ncu.edu.tw` | `DemoOwner!2026` |
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

`/admin/users` lets global administrators create and suspend ordinary users and edit their names. Only `fearnot@ce.ncu.edu.tw` can create/promote other administrators or delegate zone permissions. No backend account-management action, including the owner's own actions, can edit, disable, delete or demote this protected account. Automatic sign-in timestamps are still updated. Disabled accounts and role changes are checked against server-side data on every protected request, including existing sessions. Existing non-owner `SUPER_ADMIN` accounts are treated as ordinary `ADMIN` accounts.

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
| `NCU_PORTAL_CLIENT_ID`, `NCU_PORTAL_CLIENT_SECRET`, `NCU_OWNER_IDENTIFIER` | Live login | Portal application credentials and verified owner Portal username |
| `OWNER_INITIAL_PASSWORD` | One-time seed | Unique 16+ character password for the protected owner |
| `PDNS_API_URL`, `PDNS_API_KEY` | Live mode | Server-side PowerDNS credentials |
| `PDNS_SERVER_ID` | No | Defaults to `localhost` |
| `PDNS_MOCK` | Development | Enables the in-memory DNS server |
| `SETTINGS_ENCRYPTION_KEY` | Legacy deployment compatibility | Retain the existing value when upgrading; web-saved API credentials are no longer read |
| `DEV_OWNER_PASSWORD` | Local demo | Protected owner's initial demo password |
| `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD` | Local demo | Administrator demo login |
| `DEV_USER_EMAIL`, `DEV_USER_PASSWORD` | Local demo | User demo login |

Generate secrets with `openssl rand -base64 32`. Never give a PowerDNS setting a `NEXT_PUBLIC_` prefix.

## Production authentication

Only NCU Portal is supported outside the database-free local demo. Register the callback:

```text
https://dnsmgr.ce.ncu.edu.tw/api/auth/callback/ncu-portal
```

Configure all three NCU variables and `AUTH_URL`, then recreate the web container. Existing legacy, Google and password sessions must log in again through Portal. Missing Portal configuration never enables password fallback. New users default to `USER`; the owner is bound by the operator-verified Portal identifier, not a supplied email. Existing accounts are not silently merged by email.

PowerDNS reads only `PDNS_API_URL` (ending in `/api/v1`), `PDNS_API_KEY` and `PDNS_SERVER_ID`. Move previously web-entered settings to the server environment before upgrading. Existing encrypted database settings are retained but ignored. Inventory metadata remains scoped to the API URL/server ID; keep those unchanged to retain its associations. Unscoped legacy applications are not used to infer ownership on live servers.

## Database and first administrator

```bash
npm run db:migrate
npm run db:seed
```

The seed creates only `fearnot@ce.ncu.edu.tw` with a scrypt password hash using `OWNER_INITIAL_PASSWORD` (16+ characters). It refuses to overwrite an existing owner account, including its password. Initialize the owner through this trusted operator command; do not expose a public bootstrap route. Remove the initial password from the runtime environment after seeding. Then sign in as owner to create other admins through `/admin/users`; new account passwords require 12+ characters. Legacy seed variables are no longer used. For schema changes use `npm run db:migrate:dev -- --name descriptive_name` and commit the migration.

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

NCU Portal is enabled only when DATABASE_URL, NCU_PORTAL_CLIENT_ID, NCU_PORTAL_CLIENT_SECRET and an operator-verified NCU_OWNER_IDENTIFIER are configured. It uses OAuth authorization code, Basic client authentication and state checks; delegated login is rejected. Existing accounts are not silently merged by email. Client secrets and Portal access tokens are never delivered to application pages. Local demo keeps Portal disabled.

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

Back up PostgreSQL, the settings encryption key, and the PowerDNS backend. PostgreSQL preserves authorization, ownership, inspection and audit data, not authoritative zones. Test restores. Audit and inspection rows are append-only at the application layer; database operators can still modify storage, so add database retention or write-once exports to meet compliance needs.

## Verification

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
