"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { usePersonalizationStore } from "@/stores/personalization-store";

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

export function MessageList({ messages, isLoading, isInitialLoading, showTokenCount = false }: MessageListProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const chatDensity = usePersonalizationStore((state) => state.chatDensity);
    const welcomeMessage = usePersonalizationStore((state) => state.welcomeMessage);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

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
            <div className="h-full overflow-auto">
                <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                    <div className="glass-panel max-w-4xl rounded-[2rem] border border-border/70 px-8 py-12 shadow-[0_28px_120px_rgba(0,0,0,0.24)]">
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
        <ScrollArea
            className="h-full rounded-[2rem] border border-border/60 bg-background/20"
        >
            <div 
                ref={scrollRef}
                role="log"
                aria-live="polite"
                aria-label="Chat messages"
                className={chatDensity === "compact" ? "flex flex-col py-3" : "flex flex-col py-4"}
            >
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
        </ScrollArea>
    );
}
