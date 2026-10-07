"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { Skeleton } from "@/components/ui/skeleton";
import { usePersonalizationStore } from "@/stores/personalization-store";
import { DEFAULT_WELCOME_MESSAGE } from "@/lib/constants";

interface Message {
    id: string;
    role: "system" | "user" | "assistant";
    content: string;
    tokenCount?: number;
    createdAt?: string;
}

interface MessageListProps {
    messages: Message[];
    isLoading?: boolean;
    isInitialLoading?: boolean;
    showTokenCount?: boolean;
}

// Within this many pixels of the bottom the reader is still "at the end", so
// new content keeps pulling them along.
const STICK_THRESHOLD_PX = 80;

function JumpToLatest({ visible, onClick }: { visible: boolean; onClick: () => void }) {
    if (!visible) return null;
    return (
        <button
            type="button"
            onClick={onClick}
            className="glass-panel absolute bottom-4 left-1/2 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-border/70 px-4 text-sm shadow-[0_16px_40px_rgba(0,0,0,0.18)]"
        >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
            Jump to latest
        </button>
    );
}

function MessageSkeleton() {
    return (
        <div className="flex gap-3 px-4 py-3">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
            </div>
        </div>
    );
}

// Module scope: MessageList's own branches are all spent, and a read-time
// fallback belongs to the value, not to the component.
function greetingFor(saved: string): string {
    return saved || DEFAULT_WELCOME_MESSAGE;
}

export function MessageList({ messages, isLoading, isInitialLoading, showTokenCount = false }: MessageListProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const stickToBottom = useRef(true);
    const [awayFromBottom, setAwayFromBottom] = useState(false);
    const chatDensity = usePersonalizationStore((state) => state.chatDensity);
    // An empty greeting is the user's own saved value; the default sentence is
    // applied here at read time instead of being written back into storage.
    const welcomeMessage = usePersonalizationStore((state) => greetingFor(state.welcomeMessage));

    const scrollToLatest = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        stickToBottom.current = true;
        setAwayFromBottom(false);
    }, []);

    // Only while the reader is at the end. This used to jump to the bottom on
    // every message change, which yanked anyone who scrolled up back down on
    // each streamed token, so history could not be read while an answer ran.
    useEffect(() => {
        if (stickToBottom.current) scrollToLatest();
    }, [messages, scrollToLatest]);

    function handleScroll() {
        const el = scrollRef.current;
        if (!el) return;
        const away = el.scrollHeight - el.scrollTop - el.clientHeight > STICK_THRESHOLD_PX;
        stickToBottom.current = !away;
        setAwayFromBottom(away);
    }

    // Show skeleton during initial load
    if (isInitialLoading) {
        return (
            <div className="h-full rounded-[2rem] border border-border/60 bg-background/20">
                <div className="space-y-1 p-4">
                    <MessageSkeleton />
                    <MessageSkeleton />
                    <MessageSkeleton />
                    <MessageSkeleton />
                </div>
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div
                className="h-full overflow-auto"
                tabIndex={0}
                aria-label="Welcome panel"
            >
                <div className="flex min-h-full flex-col items-center justify-center px-4 py-6 text-center sm:px-6 sm:py-12">
                    <div className="glass-panel max-w-4xl rounded-[2rem] border border-border/70 px-5 py-8 sm:px-8 sm:py-12 shadow-[0_28px_120px_rgba(0,0,0,0.24)]">
                        <div className="section-kicker mb-4">Personal workspace</div>
                        <h2 className="section-title mb-4">
                            Shape one assistant desk for every model you use.
                        </h2>
                        <p className="mx-auto max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                            {welcomeMessage}
                        </p>
                        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
                            <span className="rounded-full border border-border/70 bg-background/40 px-4 py-2">
                                BYOK encrypted
                            </span>
                            <span className="rounded-full border border-border/70 bg-background/40 px-4 py-2">
                                Conversation memory
                            </span>
                            <span className="rounded-full border border-border/70 bg-background/40 px-4 py-2">
                                Personal defaults
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full">
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                role="log"
                aria-live="polite"
                aria-label="Chat messages"
                tabIndex={0}
                className="chat-scroll h-full overflow-y-auto rounded-[2rem] border border-border/60 bg-background/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <div className={chatDensity === "compact" ? "flex flex-col py-3" : "flex flex-col py-4"}>
                    {messages.map((message, index) => (
                        <MessageBubble
                            key={message.id || `msg-${index}`}
                            role={message.role}
                            content={message.content}
                            tokenCount={message.tokenCount}
                            showTokenCount={showTokenCount}
                            density={chatDensity}
                            isStreaming={
                                isLoading &&
                                index === messages.length - 1 &&
                                message.role === "assistant"
                            }
                        />
                    ))}
                </div>
            </div>

            <JumpToLatest visible={awayFromBottom} onClick={scrollToLatest} />
        </div>
    );
}
