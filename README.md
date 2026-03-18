# OmniChat

OmniChat is a multi-provider AI chat workspace built with Next.js App Router. It supports bring-your-own API keys, encrypted credential storage, streaming chat, conversation persistence, and UI personalization.

## Current Status

Status as of 2026-03-10:
- Phase 1 core application is complete
- Web UX and onboarding polish are substantially advanced
- Phase 2 desktop/Tauri distribution is still pending
- Phase 3 cloud/docker distribution is still pending
- Manual release hardening and deployment packaging are still pending

For live implementation status, see:
- `documents/MVP_Checklist.md`
- `documents/DEVELOPER_GUIDE.md`

## What Works Now

- Credentials and OAuth sign-in
- API key management with encrypted storage
- 8 AI providers
- Streaming chat responses
- Conversation history and sidebar navigation
- Model selection by provider
- Markdown and code highlighting
- Copy message action
- Responsive chat shell and mobile sidebar drawer
- Personalization controls:
  - theme
  - default provider/model
  - default system prompt
  - send-with-enter behavior
  - token count visibility for persisted messages
  - chat density
  - welcome message
  - sidebar default state

## What Is Not Done Yet

- Desktop packaging with Tauri
- SQLite/local desktop runtime as a finished shipped path
- Docker packaging
- Railway/Render deployment config
- Full release packaging and installer distribution
- Final manual QA pass and launch hardening

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui
- Zustand
- Prisma 7
- NextAuth v5
- Vercel AI SDK
- PostgreSQL
- Vitest

## Project Structure

```text
omnichat/
+-- src/app/                # App Router pages and API routes
+-- src/components/         # UI components
+-- src/hooks/              # useChat, useApiKeys, usePreferences
+-- src/lib/                # auth, db, crypto, AI integration
+-- src/stores/             # Zustand stores
+-- src/types/
+-- src/validators/
+-- prisma/schema.prisma
+-- package.json
```

## Setup

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL

### Install

```bash
cd omnichat
pnpm install
```

### Environment

Create `omnichat/.env` with at least:

```env
DATABASE_URL=postgresql://...
AUTH_SECRET=...
NEXTAUTH_SECRET=...
ENCRYPTION_SECRET_KEY=...
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
```

Notes:
- Use either `AUTH_SECRET` or `NEXTAUTH_SECRET`; both are accepted by the current auth config.
- `ENCRYPTION_SECRET_KEY` must be long enough for AES-256-GCM key derivation.

### Database

```bash
pnpm prisma migrate dev
```

### Run Development Server

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Verification

Run the current verification commands:

```bash
npm run lint
npm run test
npm run build
```

Expected current result:
- `npm run lint` passes
- `npm run test` passes
- `npm run build` passes

## Main Flows

### Sign In
- Login page: `/login`
- Supports credentials and OAuth providers

### Connect Provider
- Settings > Providers
- Add at least one valid API key before chatting

### Chat
- Start from `/chat`
- Continue existing threads via `/chat/[id]`
- Existing conversations load persisted history

### Personalization
- Settings > Preferences
- Changes affect live UI behavior in the web app

## Notes For Contributors

- This is an App Router codebase, not a Pages Router app.
- `documents/MVP_Checklist.md` is the source of truth for delivery status.
- `documents/Project_Proposal.md` is planning/history, not live status.
- Do not assume desktop/Tauri support is complete.

## Immediate Next Steps

- Phase 2: desktop/Tauri implementation
- Phase 3: cloud/docker distribution
- Phase 4 remaining hardening: manual QA, notifications, release packaging
