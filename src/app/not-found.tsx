import Link from "next/link";

/**
 * Shown for authenticated visits to an unknown path. Anonymous requests never
 * reach it: src/proxy.ts redirects anything unmatched to /login first, so this
 * is the "typed the URL wrong while signed in" and "link went stale" screen.
 */
export default function NotFound() {
    return (
        <main className="app-shell flex min-h-screen items-center justify-center px-4">
            <div className="glass-panel w-full max-w-md rounded-[2rem] border border-border/70 p-8 text-center">
                <p className="section-kicker mb-3">404 — Not found</p>
                <h1 className="text-3xl font-semibold tracking-tight">This desk drawer is empty</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    The page moved, or the link is wrong. Nothing was deleted from your workspace.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                    <Link
                        href="/chat"
                        className="rounded-full bg-primary px-6 py-2.5 text-sm text-primary-foreground"
                    >
                        Back to chat
                    </Link>
                    <Link
                        href="/settings/preferences"
                        className="rounded-full border border-border px-6 py-2.5 text-sm"
                    >
                        Settings
                    </Link>
                </div>
            </div>
        </main>
    );
}
