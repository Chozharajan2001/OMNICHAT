"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for route segments.
 * Catches React rendering errors and displays a fallback UI.
 * Allows users to recover without full page reload.
 */
export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log error to monitoring service
        console.error("Route error:", error);
    }, [error]);

    return (
        <main className="app-shell flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
            <div className="glass-panel w-full max-w-md rounded-[2rem] border border-border/70 p-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/12 text-destructive">
                    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                </div>
                <h1 className="mb-3 text-2xl font-semibold tracking-tight text-destructive">
                    Something went wrong
                </h1>
                <p className="mb-6 text-sm leading-6 text-muted-foreground">
                    {error.message || "An unexpected error occurred while rendering this page."}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                    <Button onClick={reset} className="rounded-full px-6">
                        Try again
                    </Button>
                    <Button asChild variant="outline" className="rounded-full px-6">
                        <Link href="/">Go home</Link>
                    </Button>
                </div>
            </div>
        </main>
    );
}
