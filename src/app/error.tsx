"use client";

import { useEffect } from "react";

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
        <div className="flex min-h-screen flex-col items-center justify-center p-8">
            <div className="max-w-md text-center">
                <h1 className="mb-4 text-4xl font-bold text-red-600">
                    Something went wrong
                </h1>
                <p className="mb-6 text-gray-600 dark:text-gray-400">
                    {error.message || "An unexpected error occurred while rendering this page."}
                </p>
                <div className="flex gap-4 justify-center">
                    <button
                        onClick={reset}
                        className="rounded-lg bg-primary px-6 py-2 text-white hover:bg-primary/90 transition-colors"
                    >
                        Try again
                    </button>
                    <a
                        href="/"
                        className="rounded-lg border border-gray-300 dark:border-gray-700 px-6 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        Go home
                    </a>
                </div>
            </div>
        </div>
    );
}
