"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import "./globals.css";

/**
 * Global error boundary for the entire application.
 * Catches React rendering errors that occur outside of route segments.
 * This is the last line of defense against white screen crashes.
 *
 * It replaces the root <html>/<body>, so the root layout's stylesheet never
 * loads -- globals.css is imported here for exactly that reason, otherwise the
 * token classes below would resolve to nothing on a crash.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log error to monitoring service
        console.error("Global error:", error);
    }, [error]);

    return (
        <html lang="en" data-theme="dark">
            <body>
                <main className="app-shell flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
                    <div className="glass-panel w-full max-w-md rounded-[2rem] border border-border/70 p-8 text-center">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/12 text-destructive">
                            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <h1 className="mb-3 text-2xl font-semibold tracking-tight text-destructive">
                            Application Error
                        </h1>
                        <p className="mb-6 text-sm leading-6 text-muted-foreground">
                            {error.message || "A critical error occurred. Please reload the application."}
                        </p>
                        {/* Deliberately a plain element with token classes rather
                            than the shared Button: this boundary has to render
                            even when the component tree is what failed. */}
                        <button
                            type="button"
                            onClick={reset}
                            className="rounded-full bg-primary px-6 py-2.5 text-sm text-primary-foreground"
                        >
                            Reload application
                        </button>
                        {process.env.NODE_ENV === "development" ? (
                            <details className="mt-8 text-left">
                                <summary className="cursor-pointer text-sm text-muted-foreground">
                                    Error details (development only)
                                </summary>
                                <pre className="mt-2 overflow-auto rounded-xl bg-muted/40 p-4 text-xs">
                                    {error.stack}
                                </pre>
                            </details>
                        ) : null}
                    </div>
                </main>
            </body>
        </html>
    );
}
