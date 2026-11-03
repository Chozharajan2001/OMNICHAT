// src/app/(auth)/login/page.tsx
// ────────────────────────────────────────────────────────────────
// Login page: decides on the server which OAuth providers exist.
// ────────────────────────────────────────────────────────────────

import LoginForm from "./LoginForm";

export default function LoginPage() {
    // Same predicate the auth config uses to decide whether to register the
    // provider at all (src/lib/auth/config.ts), so the button and the provider
    // can never disagree. Reading it here rather than in the client keeps the
    // client ids out of the browser bundle.
    return (
        <LoginForm
            oauth={{
                google: Boolean(process.env.GOOGLE_CLIENT_ID),
                github: Boolean(process.env.GITHUB_CLIENT_ID),
            }}
        />
    );
}
