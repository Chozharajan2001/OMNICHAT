// src/components/chat/ChatInput.tsx
// ────────────────────────────────────────────────────────────────
// Chat input form with send/stop buttons.
// ────────────────────────────────────────────────────────────────

"use client";

import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatInputProps {
    value: string;
    isLoading: boolean;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onSubmit: (e?: React.FormEvent) => void;
    onStop: () => void;
    disabled?: boolean;
}

export function ChatInput({
    value,
    isLoading,
    onChange,
    onSubmit,
    onStop,
    disabled,
}: ChatInputProps) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
        }
    };

    return (
        <form onSubmit={onSubmit} className="border-t bg-background p-4">
            <div className="mx-auto flex max-w-3xl gap-2">
                <div className="relative flex-1">
                    <Textarea
                        value={value}
                        onChange={onChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        disabled={disabled || isLoading}
                        className={cn(
                            "min-h-[52px] max-h-[200px] resize-none",
                            "focus-visible:ring-1"
                        )}
                        rows={1}
                    />
                </div>

                {isLoading ? (
                    <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={onStop}
                        className="shrink-0"
                    >
                        <Square className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button
                        type="submit"
                        size="icon"
                        disabled={!value.trim() || disabled}
                        className="shrink-0"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <p className="mt-2 text-center text-xs text-muted-foreground">
                Press Enter to send, Shift+Enter for new line
            </p>
        </form>
    );
}
