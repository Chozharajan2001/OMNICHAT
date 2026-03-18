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
    sendWithEnter?: boolean;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onSubmit: (e?: React.FormEvent) => void;
    onStop: () => void;
    disabled?: boolean;
}

export function ChatInput({
    value,
    isLoading,
    sendWithEnter = true,
    onChange,
    onSubmit,
    onStop,
    disabled,
}: ChatInputProps) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const shouldSubmit =
            sendWithEnter
                ? e.key === "Enter" && !e.shiftKey
                : e.key === "Enter" && (e.metaKey || e.ctrlKey);

        if (shouldSubmit) {
            e.preventDefault();
            onSubmit();
        }
    };

    return (
        <form onSubmit={onSubmit} className="pt-4" aria-label="Chat input form">
            <div className="glass-panel mx-auto max-w-4xl rounded-[2rem] border border-border/70 p-3 shadow-[0_20px_80px_rgba(0,0,0,0.16)]">
                <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                        <div className="mb-2 flex items-center justify-between px-1">
                            <span className="section-kicker">Prompt composer</span>
                            <span className="text-xs text-muted-foreground">
                                {sendWithEnter ? "Enter to send" : "Ctrl/Cmd+Enter to send"}
                            </span>
                        </div>
                        <Textarea
                            value={value}
                            onChange={onChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask anything, compare models, or shape the reply with your own voice."
                            disabled={disabled || isLoading}
                            aria-label="Type your message"
                            className={cn(
                                "min-h-[108px] max-h-[220px] resize-none rounded-[1.5rem] border-0 bg-transparent px-4 py-4 text-base shadow-none sm:min-h-[120px]",
                                "focus-visible:ring-0 focus-visible:ring-offset-0"
                            )}
                            rows={4}
                        />
                    </div>

                    {isLoading ? (
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={onStop}
                            aria-label="Stop generating response"
                            className="h-12 w-full shrink-0 rounded-2xl sm:mt-auto sm:h-14 sm:w-14 sm:rounded-full"
                        >
                            <Square className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            type="submit"
                            disabled={!value.trim() || disabled}
                            aria-label="Send message"
                            className="h-12 w-full shrink-0 rounded-2xl shadow-[0_16px_30px_rgba(124,109,255,0.24)] sm:mt-auto sm:h-14 sm:w-14 sm:rounded-full"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
        </form>
    );
}
