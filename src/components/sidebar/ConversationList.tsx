"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Archive, Download, FolderOpen, MessageSquare, Trash2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/stores/chat-store";

interface ProjectOption {
    id: string;
    name: string;
}

interface ConversationListProps {
    conversations: Conversation[];
    activeConversationId: string | null;
    isLoading: boolean;
    projects: ProjectOption[];
    onAssignProject: (conversationId: string, projectId: string | null) => void;
    onArchive: (id: string, e: React.MouseEvent) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    onExport: (id: string, title: string) => void;
    onSelect?: () => void;
    /**
     * What to say when the list is empty. The caller owns the wording, because
     * only it knows whether the list is empty or merely filtered.
     */
    emptyMessage: string;
}

export function ConversationList({
    conversations,
    activeConversationId,
    isLoading,
    projects,
    onAssignProject,
    onArchive,
    onDelete,
    onExport,
    onSelect,
    emptyMessage,
}: ConversationListProps) {
    if (isLoading) {
        return <div className="px-2 py-4 text-sm text-muted-foreground">Loading conversations...</div>;
    }

    if (conversations.length === 0) {
        return (
            <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-background/20 p-4 text-sm text-muted-foreground">
                {emptyMessage}
            </div>
        );
    }

    return (
        <>
            {conversations.map((conversation) => (
                <div
                    key={conversation.id}
                    className={cn(
                        "group flex items-center gap-1 rounded-[1.25rem] border px-3 py-1.5 text-sm transition-colors",
                        activeConversationId === conversation.id
                            ? "border-primary/25 bg-primary/12"
                            : "border-transparent bg-transparent hover:border-border/70 hover:bg-background/30"
                    )}
                >
                    <Link
                        href={`/chat/${conversation.id}`}
                        onClick={onSelect}
                        className="flex min-w-0 flex-1 items-center gap-3 py-1.5"
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-background/40 text-muted-foreground">
                            <MessageSquare className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{conversation.title}</div>
                            <div className="truncate text-xs text-muted-foreground">
                                {conversation.lastMessage?.content || "Ready to continue"}
                            </div>
                        </div>
                    </Link>
                    {/* Icon-only controls: each needs a name (axe reported these as
                        critical button-name violations) and they must reveal on
                        keyboard focus, not only on hover. They also sit beside the
                        link now, not inside it -- interactive content nested in an
                        <a> is invalid HTML. */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Move “${conversation.title}” to a project`}
                                className="h-11 w-11 shrink-0 rounded-full opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                            >
                                <FolderOpen className="h-3 w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>Move to project</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onAssignProject(conversation.id, null)}>
                                No project
                            </DropdownMenuItem>
                            {projects.length === 0 ? (
                                <DropdownMenuItem disabled>No projects available</DropdownMenuItem>
                            ) : (
                                projects.map((project) => (
                                    <DropdownMenuItem
                                        key={project.id}
                                        onClick={() => onAssignProject(conversation.id, project.id)}
                                    >
                                        {project.name}
                                    </DropdownMenuItem>
                                ))
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => onExport(conversation.id, conversation.title)}
                            >
                                <Download className="h-3 w-3" />
                                Export as JSON
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Archive “${conversation.title}”`}
                        className="h-11 w-11 shrink-0 rounded-full opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                        onClick={(e) => onArchive(conversation.id, e)}
                    >
                        <Archive className="h-3 w-3" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete “${conversation.title}”`}
                        className="h-11 w-11 shrink-0 rounded-full opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                        onClick={(e) => onDelete(conversation.id, e)}
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            ))}
        </>
    );
}
