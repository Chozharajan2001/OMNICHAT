// src/components/chat/MessageBubble.tsx
// ────────────────────────────────────────────────────────────────
// Renders a single chat message with markdown support.
// ────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { User, Bot, Copy, Check } from "lucide-react";
import { useToast } from "@/stores/toast-store";

interface MessageBubbleProps {
    role: "system" | "user" | "assistant";
    content: string;
    isStreaming?: boolean;
    density?: "comfortable" | "compact";
    showTokenCount?: boolean;
    tokenCount?: number;
}

export function MessageBubble({
    role,
    content,
    isStreaming,
    density = "comfortable",
    showTokenCount = false,
    tokenCount,
}: MessageBubbleProps) {
    const isUser = role === "user";
    const [copied, setCopied] = useState(false);
    const { success, error: toastError } = useToast();
    const isCompact = density === "compact";

    const handleCopy = async () => {
        if (!content || typeof navigator === "undefined" || !navigator.clipboard) {
            return;
        }

        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            success("Message copied");
            setTimeout(() => setCopied(false), 1200);
        } catch (error) {
            console.error("Failed to copy message:", error);
            toastError("Copy failed");
        }
    };

    return (
        <div
            className={cn(
                isCompact ? "px-3 py-2 md:px-5" : "px-4 py-3 md:px-6",
                isUser ? "pl-8 md:pl-16" : "pr-8 md:pr-16"
            )}
        >
            <div
                className={cn(
                    "glass-panel mx-auto flex max-w-4xl overflow-hidden border border-border/70 shadow-[0_16px_60px_rgba(0,0,0,0.12)]",
                    isCompact ? "gap-3 rounded-[1.5rem] px-4 py-4" : "gap-4 rounded-[1.75rem] px-5 py-5",
                    isUser
                        ? "bg-primary/10"
                        : "bg-background/25"
                )}
            >
                <div
                    className={cn(
                        "flex shrink-0 select-none items-center justify-center rounded-2xl",
                        isCompact ? "h-9 w-9" : "h-10 w-10",
                        isUser ? "bg-primary text-primary-foreground" : "bg-primary/12"
                    )}
                    aria-hidden="true"
                >
                    {isUser ? (
                        <User className="h-4 w-4" />
                    ) : (
                        <Bot className="h-4 w-4 text-primary" />
                    )}
                </div>

                    <div className={cn("flex-1 overflow-hidden", isCompact ? "space-y-1.5" : "space-y-2")}>
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium">
                                {isUser ? "You" : "Assistant"}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-full border border-border/70 bg-background/30 px-3 text-xs"
                            onClick={handleCopy}
                            disabled={!content}
                            aria-label={copied ? "Message copied" : "Copy message to clipboard"}
                        >
                            {copied ? (
                                <>
                                    <Check className="mr-1 h-3.5 w-3.5" />
                                    Copied
                                </>
                            ) : (
                                <>
                                    <Copy className="mr-1 h-3.5 w-3.5" />
                                    Copy
                                </>
                            )}
                        </Button>
                    </div>

                    <div className="prose prose-sm dark:prose-invert max-w-none overflow-hidden">
                        {content ? (
                            <ReactMarkdown
                                disallowedElements={["script", "iframe", "object", "embed", "form", "input", "button"]}
                                components={{
                                    code({ className, children, ...props }) {
                                        const match = /language-(\w+)/.exec(className || "");
                                        const isInline = !match;

                                        if (isInline) {
                                            return (
                                                <code
                                                    className="rounded bg-muted px-1.5 py-0.5 text-sm"
                                                    {...props}
                                                >
                                                    {children}
                                                </code>
                                            );
                                        }

                                        const lang = match?.[1] ?? "text";
                                        return (
                                            <SyntaxHighlighter
                                                language={lang}
                                                PreTag="div"
                                                style={oneDark as Record<string, React.CSSProperties>}
                                                customStyle={{
                                                    margin: 0,
                                                    borderRadius: "0.75rem",
                                                }}
                                            >
                                                {String(children).replace(/\n$/, "")}
                                            </SyntaxHighlighter>
                                        );
                                    },
                                    pre({ children }) {
                                        return (
                                            <div className="overflow-x-auto rounded-xl">
                                                {children}
                                            </div>
                                        );
                                    },
                                }}
                            >
                                {content}
                            </ReactMarkdown>
                        ) : isStreaming ? (
                            <div className="flex items-center gap-1">
                                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50 [animation-delay:-0.3s]"></span>
                                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50 [animation-delay:-0.15s]"></span>
                                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50"></span>
                            </div>
                        ) : null}
                    </div>

                    {showTokenCount && typeof tokenCount === "number" ? (
                        <div className="text-xs text-muted-foreground">
                            {tokenCount.toLocaleString()} tokens
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
