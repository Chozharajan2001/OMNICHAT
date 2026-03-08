// src/components/chat/MessageBubble.tsx
// ────────────────────────────────────────────────────────────────
// Renders a single chat message with markdown support.
// ────────────────────────────────────────────────────────────────

"use client";

import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { User, Bot } from "lucide-react";

interface MessageBubbleProps {
    role: "system" | "user" | "assistant";
    content: string;
    isStreaming?: boolean;
}

export function MessageBubble({ role, content, isStreaming }: MessageBubbleProps) {
    const isUser = role === "user";

    return (
        <div
            className={cn(
                "flex gap-4 px-4 py-6",
                isUser ? "bg-background" : "bg-muted/50"
            )}
        >
            {/* Avatar */}
            <div
                className={cn(
                    "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md",
                    isUser ? "bg-primary text-primary-foreground" : "bg-primary/10"
                )}
            >
                {isUser ? (
                    <User className="h-4 w-4" />
                ) : (
                    <Bot className="h-4 w-4 text-primary" />
                )}
            </div>

            {/* Content */}
            <div className="flex-1 space-y-2 overflow-hidden">
                <div className="text-sm font-medium">
                    {isUser ? "You" : "Assistant"}
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none overflow-hidden">
                    {content ? (
                        <ReactMarkdown
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

                                    return (
                                        <SyntaxHighlighter
                                            language={match![1]}
                                            PreTag="div"
                                            style={oneDark as Record<string, React.CSSProperties>}
                                            customStyle={{
                                                margin: 0,
                                                borderRadius: "0.5rem",
                                            }}
                                        >
                                            {String(children).replace(/\n$/, "")}
                                        </SyntaxHighlighter>
                                    );
                                },
                                pre({ children }) {
                                    return (
                                        <div className="overflow-x-auto rounded-lg">
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
            </div>
        </div>
    );
}
