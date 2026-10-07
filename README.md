# OmniChat

Multi-provider AI chat workspace built with Next.js App Router. Bring-your-own API keys, encrypted credential storage, streaming chat, conversation persistence, and UI personalization.

## Status

Production-ready. All audit remediation phases complete (Sep 2026).

- Full test suite passing (run `pnpm test` for the live count)
- Lint: 0 errors, 0 warnings
- Build: clean, no TypeScript errors
- Security: OWASP Top 10 addressed, PBKDF2 encryption, CSRF, distributed rate limiting

See [AUDIT_REMEDIATION_SUMMARY.md](./AUDIT_REMEDIATION_SUMMARY.md) for the full remediation report.

## Tech Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Zustand · Prisma 7 · NextAuth v5 · Vercel AI SDK · PostgreSQL / SQLite · Vitest · nodemailer

## Project Structure

```text
omnichat/
├── src/app/              # App Router pages and API routes
├── src/components/       # UI components (chat, sidebar, auth, ui)
├── src/hooks/            # useChat, useApiKeys, usePreferences, useJsonResource
├── src/lib/              # auth, db, crypto, AI, metrics, tracing, alerting, cache
├── src/stores/           # Zustand stores
├── src/types/
├── src/validators/
├── prisma/               # schema.prisma (PostgreSQL) + schema.sqlite.prisma
├── scripts/quality/      # lint, complexity, drift-check, hooks
├── documents/adr/        # Architecture Decision Records
├── public/openapi.json   # OpenAPI 3.0 API specification
└── .github/workflows/    # CI pipeline
```

## Setup

### Prerequisites

- Node.js 22+
- pnpm 11+
- PostgreSQL (production) or SQLite (local development)

### Install

```bash
cd omnichat
pnpm install
```

This automatically wires the pre-commit quality hook via the `prepare` script.

### Environment

Copy `.env.example` to `.env` and fill in required values:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` — PostgreSQL connection string or `file:./data/omnichat.db` for SQLite
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `ENCRYPTION_SECRET_KEY` — minimum 32 characters, used for AES-256-GCM + PBKDF2

Optional (security hardening for hosted deployments):
- `APP_ORIGIN` — canonical HTTPS origin for CSRF validation
- `EMAIL_VERIFICATION_REQUIRED=true` — enable strict email verification
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` — email delivery
- `RATE_LIMIT_BACKEND=redis-rest` — enable distributed rate limiting. Note that
  production resolves to `redis-rest` when unset and fails closed without valid
  Upstash credentials, refusing every sign-in; a single instance should set
  `RATE_LIMIT_BACKEND=memory` (the compose stacks and `render.yaml` do this)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_PREFIX`
- `METRICS_TOKEN` — bearer token that gates `/api/metrics`; unset means the
  endpoint answers 404 in production (see the Docker section below)
- `NEXTAUTH_SECRET` — accepted as a legacy fallback when `AUTH_SECRET` is absent

See `.env.example` for the full annotated reference.

### Database

```bash
pnpm db:generate    # Generate Prisma client
pnpm db:init        # Initialize SQLite (local dev)
pnpm db:migrate     # Run migrations (PostgreSQL)
```

### Run

```bash
pnpm dev            # Development server at http://localhost:3000
```

## Verification

```bash
pnpm lint           # ESLint (0 errors, 0 warnings)
pnpm typecheck      # TypeScript strict check
pnpm test           # Full suite (node + ui projects)
pnpm test:ui        # UI component tests only (jsdom)
pnpm build          # Production build
pnpm quality:check  # Lint + complexity regression gate
pnpm db:drift-check # Prisma schema consistency (PostgreSQL vs SQLite)
```

## CI/CD

GitHub Actions pipeline at `.github/workflows/ci.yml`:
1. **Quality** — lint + complexity regression (ubuntu + windows matrix)
2. **Test + Typecheck** — full suite, strict TypeScript
3. **Build** — production bundle verification

Pre-commit hook runs staged quality checks automatically after `pnpm install`.

## Key Features

- Credentials and OAuth sign-in (Google, GitHub)
- Email verification (opt-in for hosted deployments)
- API key management with AES-256-GCM + PBKDF2 encryption
- 9 AI providers (OpenAI, Anthropic, Google AI, Mistral, Groq, xAI, DeepSeek, Perplexity, NVIDIA NIM)
- Streaming chat responses with token usage tracking
- Conversation history, projects, and sidebar navigation
- Model selection by provider with temperature/token controls
- Markdown rendering and code syntax highlighting
- Personalization: theme, density, welcome message, send-with-enter
- CSRF protection on all mutation endpoints
- Distributed rate limiting (Upstash REST Redis, fail-closed)
- Observability: Prometheus metrics, distributed tracing, alerting
- Health check endpoint at `/api/health`

## Documentation

- [OpenAPI Specification](./public/openapi.json) — full API reference
- [ADR-001: Encryption Choice](./documents/adr/001-encryption-choice.md)
- [ADR-002: Rate Limiting Strategy](./documents/adr/002-rate-limiting-strategy.md)
- [Audit Remediation Summary](./AUDIT_REMEDIATION_SUMMARY.md)

## Agent Instructions

This repository uses pnpm (not npm). The Git root is `omnichat/` (not the parent folder).

- Always use `pnpm` commands: `pnpm test`, `pnpm lint`, `pnpm build`
- Quality gate: `pnpm quality:check` must pass before committing
- Schema changes: update BOTH `prisma/schema.prisma` and `prisma/schema.sqlite.prisma`, then run `pnpm db:drift-check`
- Complexity: new functions must stay at complexity ≤ 10; update baseline with `pnpm quality:baseline` only when justified
- Tests: node tests in `src/**/*.test.ts`, UI tests in `src/**/*.test.tsx`
- Route guard (session check, page redirects, public-path exemptions) lives at
  `src/proxy.ts`. Next 16 loads it only from `src/` and renamed middleware to
  proxy; a root-level `middleware.ts` compiles but registers nothing, so the
  guard silently does nothing. Do not move it back, and do not add
  `config.runtime` — a proxy always runs on Node.js
- Security env vars are opt-in; never hardcode secrets or commit `.env`
- The `omnichat.db` file is gitignored; never track database files
- Agent sessions/memories bind to the opened workspace folder. Open the IDE at the repo root (`omnichat/`) — not the non-git parent — so Better Harness session evidence resolves; opening the parent leaves the session lane empty (`eligibleSessions=0`).

## Desktop (Tauri)

```bash
pnpm tauri:dev                    # Development with hot reload
pnpm tauri:build:windows          # Windows installer
pnpm tauri:build:macos            # macOS (Apple Silicon)
```

Desktop mode uses SQLite automatically. See `src-tauri/tauri.conf.json` for CSP and API restrictions.

## Docker

```bash
docker compose up -d                        # PostgreSQL + migrate + app
docker compose -f docker-compose.sqlite.yml up -d   # single-container SQLite mode
```

Compose files live in this repository root. The Dockerfile uses multi-stage
builds, a non-root runtime user, and health probes against the auth-free
`/api/health`.

Schema provisioning is a one-shot `migrate` compose service (the Dockerfile's
`migrate` target runs `prisma db push`); the app container only starts after
it completes successfully. There is no runtime entrypoint.

**First account on a fresh deployment:** automatic account creation on sign-in is
deliberately limited to development and desktop mode (`canAutoCreateAccount()` in
`src/lib/auth/email-policy.ts`), and with `EMAIL_VERIFICATION_REQUIRED` unset the
register endpoint answers 404. So create the operator account explicitly:

```bash
pnpm users:add --email you@example.com          # password read from stdin
# inside a container: docker compose run --rm migrate node scripts/users/add-user.mjs --email you@example.com
```

`--force` resets an existing password, `--verified` stamps `emailVerified` for
hosts without SMTP (required to sign in when `EMAIL_VERIFICATION_REQUIRED=true`).
The password is never accepted as a flag — argv leaks into shell history and the
process table. Alternatively enable email verification (SMTP vars) and register
through the UI.

`/api/metrics` is token-protected, and the gate depends on whether a token is
configured at all:

| `METRICS_TOKEN` | `Authorization: Bearer` | result |
|---|---|---|
| set | matches | 200, Prometheus text |
| set | missing or wrong | 404 (no 401 - the endpoint does not announce itself) |
| unset | any | 200 in development, **404 in production** |

The path is exempt from the session guard (`src/proxy.ts`) precisely so that a
scraper can reach it without a session; the bearer token is its only gate. Note
the third row: an unset token leaves the endpoint open in development, so do not
expose a dev server.

Scraped live on an idle instance with a correct token: `200`,
`content-type: text/plain; version=0.0.4`, **empty body**. That is not a broken
endpoint - the registry creates series lazily, so a process that has served
nothing publishes nothing.

**Which metrics actually get recorded.** Only `recordChatMessage` has a production
caller (`src/app/api/chat/route.ts`, on a successful turn).
`recordHttpRequest`, `recordRateLimitRejection` and `recordAuthAttempt` are
exported and unit-tested, but **no request path calls them** - so even a busy
instance publishes chat counters only, and never any traffic, rate-limit or
sign-in series. Wiring them means calling them from the route guard and the auth
callbacks; until then, do not build a dashboard panel on those names.

Publish the real origin. Both compose stacks default `NEXTAUTH_URL` to
`http://localhost:3000`, so on any other host set `NEXTAUTH_URL` (and
`APP_ORIGIN`, which the CSRF guard requires) to the public URL — verified on a
container reached on port 3100, where sign-in still redirected to
`http://localhost:3000` because of that default.

The Postgres and SQLite stacks pass a build-time `DATABASE_URL` argument because
`prisma.config.ts` selects the schema from that value at `prisma generate` time;
a generated client must match the adapter the container uses at runtime.

## Platform hosting (Railway and Render)

`railway.json` and `render.yaml` build this Dockerfile. Both are **untested from
this repository's environment** — there is no Docker daemon and no account here —
so treat a first deploy as a verification run against `/api/health` rather than
as a done deal.

Three things the compose stacks do that these platforms do not do for you:

**1. Nothing provisions the schema.** Compose runs a one-shot `migrate` service
and only starts the app after it succeeds. A blueprint has no such step, so the
app boots against an empty database and `/api/health` answers `503 unhealthy`
(`database: down`). Run the push yourself, once, before or right after the first
deploy:

```bash
docker build --target migrate -t omnichat-migrate .
docker run --rm -e DATABASE_URL="$DATABASE_URL" omnichat-migrate
```

Do not try this inside the app image. The `runner` stage copies
`.next/standalone`, the Prisma schema and the generated client only — there is no
`prisma` CLI, no `pnpm`, and the process runs as the non-root `nextjs` user. A
`preDeployCommand` or one-off shell on the deployed service cannot work; use the
`migrate` target image, which inherits the builder toolchain.

**2. `railway.json` sets no environment variables.** As written it declares only
build and deploy settings, so every value below has to come from the Railway
dashboard (or `railway vars`). Required:

| Variable | Why it is not optional |
|---|---|
| `DATABASE_URL` | Postgres connection; also selects the schema at build time |
| `AUTH_SECRET` | Auth.js session signing; unset fails at boot with "Auth Configuration" |
| `ENCRYPTION_SECRET_KEY` | vault key, 32+ characters, or health reports `degraded`/503 |
| `NEXTAUTH_URL` **and** `APP_ORIGIN` | both to the same public origin — see below |
| `RATE_LIMIT_BACKEND=memory` | see below |

`render.yaml` does declare these, but `NEXTAUTH_URL` and `APP_ORIGIN` are
`sync: false`: a blueprint cannot interpolate a service's own URL, and the
hardcoded host it replaces redirected every real deployment to a domain nobody
owns. Fill both in Render's dashboard.

**3. Two defaults refuse to work off localhost.** `NEXTAUTH_URL` defaults to
`http://localhost:3000`, so sign-in redirects back to the visitor's own machine;
`APP_ORIGIN` is what the CSRF guard compares the browser's `Origin` against, and
a mismatch answers every mutation 403. Set both to the public URL. Separately,
production resolves the rate limiter to `redis-rest`, which **fails closed**
without Upstash credentials — that shows up as `CredentialsSignin` on every
login attempt. One container is safe on `memory`.

**First account.** Automatic account creation is limited to development and
desktop mode, and `EMAIL_VERIFICATION_REQUIRED` unset makes `/api/auth/register`
answer 404. From the migrate image:

```bash
docker run --rm -e DATABASE_URL="$DATABASE_URL" omnichat-migrate \
  node scripts/users/add-user.mjs --email you@example.com --verified
```

**No one-click deploy badge is offered.** A badge would start a service that
fails both checks above — no schema and a localhost origin — and would look
broken before an operator had a chance to set the variables. Use the blueprint
files directly, after setting the environment.
