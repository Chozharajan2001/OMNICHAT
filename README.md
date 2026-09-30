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
- `RATE_LIMIT_BACKEND=redis-rest` — enable distributed rate limiting
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
- 8 AI providers (OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, Perplexity, xAI)
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

`/api/metrics` is token-protected: set `METRICS_TOKEN` to allow Prometheus
scrapes via `Authorization: Bearer <token>`; in production an unset token
makes the endpoint respond 404. The path is exempt from the session
middleware precisely so that a scraper can reach it - the bearer token is
its only gate.
