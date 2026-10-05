"use client";

import {
    useEffect,
    useId,
    useRef,
    type KeyboardEvent,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(root: HTMLElement | null): HTMLElement[] {
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function moveFocus(
    event: KeyboardEvent<HTMLDivElement>,
    order: HTMLElement[]
): void {
    if (order.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const index = active ? order.indexOf(active) : -1;
    const step = event.shiftKey ? -1 : 1;
    // A negative index means focus is not on a listed control yet: land on the
    // first one rather than wrapping out of the dialog.
    const next = index < 0 ? order[0] : order[(index + step + order.length) % order.length];
    next?.focus();
}

interface ModalProps {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
    className?: string;
    showCloseButton?: boolean;
}

/**
 * Accessible modal: real dialog semantics, focus trap, Escape to dismiss and
 * focus restored to the trigger on close. The two sidebar dialogs used to be
 * plain fixed-position divs, which left screen-reader and keyboard users
 * stranded behind an overlay they could tab straight out of.
 */
export function Modal({
    open,
    title,
    onClose,
    children,
    className,
    showCloseButton = false,
}: ModalProps) {
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement>(null);
    const lastOutsideFocus = useRef<HTMLElement | null>(null);

    // While closed, remember the control the user was on. The dialog's own
    // autoFocus field has already taken focus by the time the open effect runs,
    // so reading document.activeElement there would restore focus to a node
    // that is about to unmount (verified live: Escape dropped focus to <body>).
    useEffect(() => {
        if (open) return;
        function track(event: FocusEvent) {
            const target = event.target as HTMLElement | null;
            if (target && !target.closest?.("[role=dialog]")) lastOutsideFocus.current = target;
        }
        document.addEventListener("focusin", track);
        return () => document.removeEventListener("focusin", track);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const panel = panelRef.current;
        const active = document.activeElement as HTMLElement | null;
        const inside = !!(panel && active && panel.contains(active));
        const previous = inside ? lastOutsideFocus.current : active;
        if (!inside) focusableWithin(panel)[0]?.focus();
        return () => {
            if (previous && typeof previous.focus === "function") previous.focus();
        };
    }, [open]);

    if (!open) return null;

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
        }
        if (event.key !== "Tab") return;
        event.preventDefault();
        moveFocus(event, focusableWithin(panelRef.current));
    }

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div
                aria-hidden="true"
                className="absolute inset-0 bg-black/45 backdrop-blur-sm"
                onMouseDown={onClose}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onKeyDown={handleKeyDown}
                tabIndex={-1}
                className={cn(
                    "glass-panel relative z-10 w-full max-w-sm rounded-2xl border border-border/70 p-6 shadow-[0_28px_120px_rgba(0,0,0,0.32)] outline-none",
                    className
                )}
            >
            <div className="mb-4 flex items-start justify-between gap-4">
                <h3 id={titleId} className="text-lg font-semibold">
                    {title}
                </h3>
                {showCloseButton ? (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close dialog"
                        className="-mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                ) : null}
            </div>
            <div>{children}</div>
            </div>
        </div>,
        document.body
    );
}
