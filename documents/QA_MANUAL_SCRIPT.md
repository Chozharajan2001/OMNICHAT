# OmniChat Manual QA Script

Hand-driven pass for everything no test or key can cover alone. Run against a
dev server (`pnpm dev`) with a scratch account. Each step states the action,
the expected result, and what was last measured live (Oct 2026).

## 0. Setup

```bash
pnpm dev --port 3000   # :3000 matches the default NEXTAUTH_URL; any other
                       # port makes auth redirects point at :3000 (correct
                       # behavior, wrong env for your browser)
```

Register or sign in. Dev auto-creates the account on first credentials sign-in.

## 1. Auth screens (unauthenticated)

- [ ] `/login` renders centered card, no horizontal overflow at 500/768/1440.
- [ ] No OAuth buttons when no OAuth env is set (server decides, not the client).
- [ ] Wrong password → generic error with `role=alert`, no enumeration.
- [ ] `/register`, `/verify-email` render and wrap cleanly at the same widths.
- [ ] Lighthouse `/login`: a11y 100, best practices 100, SEO 100.

## 2. Chat shell (fresh account)

- [ ] `/chat` shows empty state, composer with hint, `Connect a provider` (no key yet).
- [ ] Sidebar opens over a blurred backdrop on narrow widths; closes via backdrop, X, and `Close sidebar` label.
- [ ] Closed sidebar is absent from the tab order (Tab never lands in it).

## 3. Provider keys (`/settings/providers`)

- [ ] 9 provider cards, first-run 3-step CTA at 0 connected.
- [ ] Fake key → inline per-card error, stays unconnected, siblings unaffected.
- [ ] Saved-but-unverified key shows "Stored, not verified" + Verify button.

## 4. Projects (`/settings/projects` + sidebar)

- [ ] Create → row appears, toast.
- [ ] Rename → prefilled, Save disabled while unchanged, duplicate name keeps the
      dialog open with the server reason.
- [ ] Delete → names the subject, restores the empty state.

## 5. Long thread (needs 20+ messages; seed or chat)

- [ ] Opening shows the latest 20 + `Load older messages`.
- [ ] One click prepends the older window; the button vanishes at the start.
- [ ] Network tab shows one transcript read per open (a storm of identical
      `?limit=20` reads means the load-effect regression is back).

## 6. Preferences (`/settings/preferences`)

- [ ] Save disabled until dirty; save shows confirmation and applies the theme.

## 7. Export

- [ ] Sidebar thread menu → Export downloads `<slug>.json` with turns in order.
- [ ] Archived row Export does the same; wrong-user id → 404 shape, no leak.

## 8. Metrics (needs `METRICS_TOKEN`)

- [ ] No token → 404; wrong bearer → 404; correct → 200 Prometheus text.
- [ ] After traffic: `http_requests_total`, `auth_attempts_total`,
      `rate_limit_rejections_total`, `chat_messages_total` all present.

## Out of scope for this script

Real-provider streaming quality, true sub-500px devices, touch handling,
multi-user load. Those need a key, a phone, and a staging host respectively.
