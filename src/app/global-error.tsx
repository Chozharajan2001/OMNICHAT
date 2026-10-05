"use client";

import { useEffect } from "react";

/**
 * Global error boundary for the entire application.
 * Catches React rendering errors that occur outside of route segments.
 * This is the last line of defense against white screen crashes.
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
        <html>
            <body>
                <div className="flex min-h-dvh flex-col items-center justify-center p-8">
                    <div className="max-w-md text-center">
                        <h1 className="mb-4 text-4xl font-bold text-red-600">
                            Application Error
                        </h1>
                        <p className="mb-6 text-gray-600 dark:text-gray-400">
                            {error.message || "A critical error occurred. Please reload the application."}
                        </p>
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={reset}
                                className="rounded-lg bg-primary px-6 py-2 text-white hover:bg-primary/90 transition-colors"
                            >
                                Reload application
                            </button>
                        </div>
                        {process.env.NODE_ENV === "development" && (
                            <details className="mt-8 text-left">
                                <summary className="cursor-pointer text-sm text-gray-500">
                                    Error details (development only)
                                </summary>
                                <pre className="mt-2 rounded bg-gray-100 dark:bg-gray-800 p-4 text-xs overflow-auto">
                                    {error.stack}
                                </pre>
                            </details>
                        )}
                    </div>
                </div>
            </body>
        </html>
    );
}
