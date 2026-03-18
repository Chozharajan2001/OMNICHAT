"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useChatStore, type Conversation } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ConversationList } from "./ConversationList";
import {
    Command,
    FolderPlus,
    PanelLeft,
    PanelLeftClose,
    Plus,
    Search,
    Settings,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersonalizationStore } from "@/stores/personalization-store";
import { useToast } from "@/stores/toast-store";

interface ProjectItem {
    id: string;
    name: string;
    color?: string | null;
    _count?: {
        conversations: number;
    };
}

export function ConversationSidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const {
        activeProjectId,
        conversationId,
        clearMessages,
        isSidebarOpen,
        setActiveProjectId,
        toggleSidebar,
        setSidebarOpen,
    } = useChatStore();
    const { success, error: toastError } = useToast();

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [projects, setProjects] = useState<ProjectItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [isDesktop, setIsDesktop] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const sidebarDefaultState = usePersonalizationStore((state) => state.sidebarDefaultState);

    const fetchConversations = useCallback(async () => {
        try {
            const response = await fetch("/api/conversations");
            if (response.ok) {
                const data = await response.json();
                setConversations(data.conversations || []);
            }
        } catch (error) {
            console.error("Failed to fetch conversations:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchProjects = useCallback(async () => {
        try {
            const response = await fetch("/api/projects");
            if (response.ok) {
                const data = await response.json();
                setProjects(data.projects || []);
            }
        } catch (error) {
            console.error("Failed to fetch projects:", error);
        } finally {
            setIsLoadingProjects(false);
        }
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(min-width: 1024px)");

        const applyViewportMode = () => {
            const desktop = mediaQuery.matches;
            setIsDesktop(desktop);

            if (desktop) {
                setSidebarOpen(sidebarDefaultState === "expanded");
            } else {
                setSidebarOpen(false);
            }
        };

        applyViewportMode();
        mediaQuery.addEventListener("change", applyViewportMode);

        return () => {
            mediaQuery.removeEventListener("change", applyViewportMode);
        };
    }, [setSidebarOpen, sidebarDefaultState]);

    useEffect(() => {
        void fetchConversations();
        void fetchProjects();
    }, [fetchConversations, fetchProjects, pathname]);

    useEffect(() => {
        if (!isDesktop) {
            setSidebarOpen(false);
        }
    }, [pathname, isDesktop, setSidebarOpen]);

    const handleNewChat = () => {
        clearMessages();
        if (!isDesktop) {
            setSidebarOpen(false);
        }
        router.push("/chat");
    };

    const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!confirm("Delete this conversation?")) return;

        try {
            const response = await fetch(`/api/conversations/${id}`, {
                method: "DELETE",
            });

            if (response.ok) {
                setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
                if (conversationId === id) {
                    clearMessages();
                    router.push("/chat");
                }
                success("Conversation deleted");
            }
        } catch (error) {
            console.error("Failed to delete conversation:", error);
            toastError("Delete failed");
        }
    };

    const handleArchiveConversation = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            const response = await fetch(`/api/conversations/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ archived: true }),
            });

            if (response.ok) {
                setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
                if (conversationId === id) {
                    clearMessages();
                    router.push("/chat");
                }
                success("Conversation archived");
            }
        } catch (error) {
            console.error("Failed to archive conversation:", error);
            toastError("Archive failed");
        }
    };

    const handleAssignProject = async (id: string, projectId: string | null) => {
        try {
            const response = await fetch(`/api/conversations/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId }),
            });

            if (!response.ok) {
                throw new Error("Failed to update project");
            }

            await fetchConversations();
            success(projectId ? "Conversation moved" : "Project removed");
        } catch (error) {
            console.error("Failed to assign project:", error);
            toastError("Project update failed");
        }
    };

    const handleCreateProject = async () => {
        const name = window.prompt("New project name");
        if (!name?.trim()) {
            return;
        }

        try {
            const response = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to create project");
            }

            await fetchProjects();
            success("Project created");
        } catch (error) {
            console.error("Failed to create project:", error);
            toastError("Project creation failed");
        }
    };

    const handleDeleteProject = async (projectId: string) => {
        if (!confirm("Delete this project? Conversations will remain and be unassigned.")) {
            return;
        }

        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: "DELETE",
            });
            if (!response.ok) {
                throw new Error("Failed to delete project");
            }

            if (activeProjectId === projectId) {
                setActiveProjectId(null);
            }

            await fetchProjects();
            await fetchConversations();
            success("Project deleted");
        } catch (error) {
            console.error("Failed to delete project:", error);
            toastError("Project delete failed");
        }
    };

    const closeMobileSidebar = () => {
        if (!isDesktop) {
            setSidebarOpen(false);
        }
    };

    const filteredConversations = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const scoped = activeProjectId
            ? conversations.filter((conversation) => conversation.projectId === activeProjectId)
            : conversations;

        if (!query) {
            return scoped;
        }

        return scoped.filter((conversation) => {
            const title = conversation.title.toLowerCase();
            const lastMessage = conversation.lastMessage?.content?.toLowerCase() || "";
            return title.includes(query) || lastMessage.includes(query);
        });
    }, [activeProjectId, conversations, searchQuery]);

    return (
        <>
            {!isDesktop && isSidebarOpen ? (
                <button
                    type="button"
                    aria-label="Close sidebar"
                    className="fixed inset-0 z-30 bg-black/45 backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)}
                />
            ) : null}

            <aside
                className={cn(
                    "glass-panel fixed inset-y-0 left-0 z-40 flex h-screen flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-all duration-300",
                    "w-[min(88vw,22rem)]",
                    isSidebarOpen ? "translate-x-0" : "-translate-x-full",
                    "lg:relative lg:z-0 lg:translate-x-0",
                    isSidebarOpen ? "lg:w-72" : "lg:w-0 lg:overflow-hidden"
                )}
            >
                <div className="flex h-20 items-center justify-between border-b border-[var(--sidebar-border)] px-4">
                    <Link href="/chat" className="flex items-center gap-3" onClick={closeMobileSidebar}>
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/18 text-primary shadow-[0_0_40px_rgba(124,109,255,0.25)]">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div className="space-y-0.5">
                            <div className="text-sm font-semibold tracking-[0.22em] text-muted-foreground">
                                OMNICHAT
                            </div>
                            <div className="text-sm font-medium text-foreground/90">
                                Personal AI desk
                            </div>
                        </div>
                    </Link>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleSidebar}
                        className="h-9 w-9 rounded-full border border-border/60 bg-background/40"
                    >
                        {isSidebarOpen ? (
                            <PanelLeftClose className="h-4 w-4" />
                        ) : (
                            <PanelLeft className="h-4 w-4" />
                        )}
                    </Button>
                </div>

                <div className="space-y-3 p-3">
                    <Button
                        onClick={handleNewChat}
                        className="w-full justify-start gap-2 rounded-2xl border-0 bg-primary py-6 text-primary-foreground shadow-[0_16px_40px_rgba(124,109,255,0.22)]"
                    >
                        <Plus className="h-4 w-4" />
                        New Conversation
                    </Button>

                    <div className="rounded-2xl border border-border/70 bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                        <div className="mb-1 flex items-center gap-2 font-medium text-foreground/80">
                            <Command className="h-3.5 w-3.5 text-primary" />
                            Personalization
                        </div>
                        Shape the workspace with preferred models, prompts, and theme settings.
                    </div>

                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search chats"
                            className="h-11 rounded-2xl border-border/70 bg-background/40 pl-9"
                        />
                    </div>
                </div>

                <Separator />

                <ScrollArea className="flex-1">
                    <div className="space-y-3 p-3">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                                <div className="section-kicker">Projects</div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full"
                                    onClick={handleCreateProject}
                                >
                                    <FolderPlus className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                            <Button
                                variant={activeProjectId ? "ghost" : "secondary"}
                                className="w-full justify-start rounded-2xl"
                                onClick={() => setActiveProjectId(null)}
                            >
                                All chats
                            </Button>
                            {isLoadingProjects ? (
                                <div className="px-2 py-2 text-xs text-muted-foreground">Loading projects...</div>
                            ) : projects.length === 0 ? (
                                <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-background/20 p-3 text-xs text-muted-foreground">
                                    No projects yet.
                                </div>
                            ) : (
                                projects.map((project) => (
                                    <div key={project.id} className="flex items-center gap-2">
                                        <Button
                                            variant={activeProjectId === project.id ? "secondary" : "ghost"}
                                            className="min-w-0 flex-1 justify-start rounded-2xl"
                                            onClick={() => setActiveProjectId(project.id)}
                                        >
                                            <span
                                                className="mr-2 h-2.5 w-2.5 rounded-full"
                                                style={{ backgroundColor: project.color || "#7c6dff" }}
                                            />
                                            <span className="truncate">{project.name}</span>
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                {project._count?.conversations ?? 0}
                                            </span>
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 rounded-full"
                                            onClick={() => handleDeleteProject(project.id)}
                                        >
                                            <span className="text-xs">x</span>
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>

                        <Separator />
                        <div className="section-kicker px-1">Recent chats</div>
                        <ConversationList
                            conversations={filteredConversations}
                            activeConversationId={conversationId}
                            isLoading={isLoading}
                            projects={projects.map((project) => ({ id: project.id, name: project.name }))}
                            onAssignProject={handleAssignProject}
                            onArchive={handleArchiveConversation}
                            onDelete={handleDeleteConversation}
                            onSelect={closeMobileSidebar}
                        />
                        {!isLoading && searchQuery.trim() && filteredConversations.length === 0 ? (
                            <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-background/20 p-4 text-sm text-muted-foreground">
                                No chats match &quot;{searchQuery}&quot;.
                            </div>
                        ) : null}
                    </div>
                </ScrollArea>

                <Separator />

                <div className="p-3">
                    <Link href="/settings/preferences" onClick={closeMobileSidebar}>
                        <Button
                            variant="ghost"
                            className="w-full justify-start gap-2 rounded-2xl border border-border/70 bg-background/30 py-6"
                        >
                            <Settings className="h-4 w-4" />
                            Settings & Personalization
                        </Button>
                    </Link>
                </div>
            </aside>
        </>
    );
}
