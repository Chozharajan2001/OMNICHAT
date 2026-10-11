// src/components/chat/MessageBubble.tsx
// ────────────────────────────────────────────────────────────────
// Renders a single chat message with markdown support.
// ────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import clike from "react-syntax-highlighter/dist/esm/languages/prism/clike";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import docker from "react-syntax-highlighter/dist/esm/languages/prism/docker";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import shellSession from "react-syntax-highlighter/dist/esm/languages/prism/shell-session";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { User, Bot, Copy, Check } from "lucide-react";
import { useToast } from "@/stores/toast-store";

// The `Prism` build pulls every refractor grammar into the client bundle:
// 297 files, 913 KB of language definitions measured on disk, for a chat that
// mostly shows a handful. PrismLight ships none of them until registered.
// Anything unregistered still renders -- as plain, correct text.
const GRAMMARS: Record<string, unknown> = {
    bash, c, clike, cpp, css, docker, go, java, javascript, json, jsx,
    markdown, markup, python, rust, "shell-session": shellSession, sql, tsx,
    typescript, yaml,
};

const LANGUAGE_ALIASES: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    sh: "bash",
    zsh: "bash",
    console: "shell-session",
    rs: "rust",
    golang: "go",
    yml: "yaml",
    html: "markup",
    xml: "markup",
    svg: "markup",
    md: "markdown",
    "c++": "cpp",
    dockerfile: "docker",
    proto: "clike",
};

for (const [name, grammar] of Object.entries(GRAMMARS)) {
    SyntaxHighlighter.registerLanguage(name, grammar);
}

function highlightLanguage(fence: string | undefined): string {
    if (!fence) return "text";
    const normalized = fence.toLowerCase();
    return LANGUAGE_ALIASES[normalized] ?? normalized;
}

function isHighlighted(language: string): boolean {
    return language in GRAMMARS;
}

interface MessageBubbleProps {
    role: "system" | "user" | "assistant";
    content: string;
    isStreaming?: boolean;
    density?: "comfortable" | "compact";
    showTokenCount?: boolean;
    tokenCount?: number;
}

// The async Clipboard API needs a secure context and a grant that LAN/`http`
// origins and some embedded webviews never give (NotAllowedError). The legacy
// execCommand path works there, so a denied grant falls through to it instead
// of failing the copy outright.
function copyViaExecCommand(text: string): void {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
        if (!document.execCommand("copy")) {
            throw new Error("execCommand refused the copy");
        }
    } finally {
        area.remove();
    }
}

async function writeToClipboard(text: string): Promise<void> {
    // Existence is not permission: the API object is present in contexts that
    // still deny the write (non-secure origins, withheld grants), and that
    // denial must fall through to the legacy path, not to the error toast.
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
            await Promise.race([navigator.clipboard.writeText(text), clipboardTimeout()]);
            return;
        } catch {
            // Denied, timed out, or otherwise failed: fall through below.
        }
    }
    copyViaExecCommand(text);
}

// A withheld grant does not always reject: in a backgrounded tab the write
// can hang indefinitely, which would leave the button dead with no feedback.
// Losing the race falls through to execCommand like a denial does.
function clipboardTimeout(): Promise<never> {
    return new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("clipboard write timed out")), 1500);
    });
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

    const handleCopy = () => {
        if (!content) {
            return;
        }

        void writeToClipboard(content).then(
            () => {
                setCopied(true);
                success("Message copied");
                setTimeout(() => setCopied(false), 1200);
            },
            (error: unknown) => {
                console.error("Failed to copy message:", error);
                toastError("Copy failed", "Select the text manually to copy it.");
            }
        );
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
                    "surface-panel mx-auto flex max-w-4xl border border-border/70 shadow-[0_16px_60px_rgba(0,0,0,0.12)]",
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

                    <div className={cn("flex-1 min-w-0", isCompact ? "space-y-1.5" : "space-y-2")}>
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

                    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
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

                                        const language = highlightLanguage(match?.[1]);
                                        const source = String(children).replace(/\n$/, "");

                                        if (!isHighlighted(language)) {
                                            return (
                                                <pre className="overflow-x-auto rounded-xl bg-muted/40 px-4 py-3 text-sm">
                                                    <code>{source}</code>
                                                </pre>
                                            );
                                        }

                                        return (
                                            <SyntaxHighlighter
                                                language={language}
                                                PreTag="div"
                                                style={oneDark as Record<string, React.CSSProperties>}
                                                customStyle={{
                                                    margin: 0,
                                                    borderRadius: "0.75rem",
                                                }}
                                            >
                                                {source}
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
