"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    onClose: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

/**
 * Replaces the window.confirm() calls that guarded destructive actions: those
 * dialogs are browser-chrome (unstyled, untranslatable, no context about what
 * is being deleted) and they block the tab. The subject of the action is passed
 * in as `description` so the user sees what they are about to remove.
 */
export function ConfirmDialog({
    open,
    title,
    description,
    onConfirm,
    onClose,
    confirmLabel = "Delete",
    cancelLabel = "Cancel",
    destructive = true,
}: ConfirmDialogProps) {
    function handleConfirm() {
        onClose();
        onConfirm();
    }

    return (
        <Modal open={open} title={title} onClose={onClose} showCloseButton>
            <p className="mb-6 text-sm leading-6 text-muted-foreground">{description}</p>
            <div className="flex gap-2">
                <Button variant="ghost" className="flex-1 rounded-xl" onClick={onClose}>
                    {cancelLabel}
                </Button>
                <Button
                    variant={destructive ? "destructive" : "default"}
                    className="flex-1 rounded-xl"
                    onClick={handleConfirm}
                >
                    {confirmLabel}
                </Button>
            </div>
        </Modal>
    );
}
