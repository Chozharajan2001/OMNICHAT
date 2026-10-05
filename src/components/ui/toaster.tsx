"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useToastStore } from "@/stores/toast-store";
import { cn } from "@/lib/utils";

export function Toaster() {
    const toasts = useToastStore((state) => state.toasts);
    const dismissToast = useToastStore((state) => state.dismissToast);

    return (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-3 px-4 sm:bottom-6 sm:right-6">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={cn(
                        "pointer-events-auto glass-panel rounded-[1.5rem] border p-4 shadow-[0_24px_80px_rgba(0,0,0,0.2)]",
                        toast.variant === "success" && "border-success/30 bg-success/10",
                        toast.variant === "error" && "border-destructive/40 bg-destructive/10",
                        toast.variant === "default" && "border-border/70 bg-background/70"
                    )}
                >
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                            {toast.variant === "success" ? (
                                <CheckCircle2 className="h-4 w-4 text-success" />
                            ) : toast.variant === "error" ? (
                                <XCircle className="h-4 w-4 text-destructive" />
                            ) : (
                                <Info className="h-4 w-4 text-primary" />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{toast.title}</div>
                            {toast.description ? (
                                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                                    {toast.description}
                                </div>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={() => dismissToast(toast.id)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Dismiss notification"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
