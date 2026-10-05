"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    ArrowLeft,
    BadgeInfo,
    CircleUserRound,
    FolderKanban,
    KeyRound,
    MessageSquareMore,
    Palette,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const settingsSections = [
    {
        href: "/settings/preferences",
        label: "General",
        description: "Theme, defaults, typing behavior",
        icon: Palette,
    },
    {
        href: "/settings/providers",
        label: "Models & Keys",
        description: "Connected providers and credentials",
        icon: KeyRound,
    },
    {
        href: "/settings/chats",
        label: "Chats",
        description: "History management and behavior",
        icon: MessageSquareMore,
    },
    {
        href: "/settings/projects",
        label: "Projects",
        description: "Grouping and workspace organization",
        icon: FolderKanban,
    },
    {
        href: "/settings/account",
        label: "Account",
        description: "Profile and sign-in session",
        icon: CircleUserRound,
    },
    {
        href: "/settings/about",
        label: "About",
        description: "Version, scope, and current status",
        icon: BadgeInfo,
    },
];

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();

    return (
        <div className="h-dvh overflow-y-auto px-4 py-6 md:px-6 md:py-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                        variant="ghost"
                        onClick={() => router.back()}
                        className="w-full rounded-full border border-border/70 bg-background/30 px-4 sm:w-auto"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to workspace
                    </Button>
                    <div className="section-kicker flex items-center gap-2 sm:self-auto">
                        <Sparkles className="h-3.5 w-3.5" />
                        Settings and personalization
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="glass-panel rounded-[2rem] border border-border/70 p-4">
                        <div className="mb-6 px-2">
                            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                Tune the workspace, define model defaults, and personalize how
                                OmniChat responds to you.
                            </p>
                        </div>

                        <nav className="flex gap-3 overflow-x-auto pb-2 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
                            {settingsSections.map((section) => {
                                const Icon = section.icon;
                                const isActive = pathname === section.href;

                                return (
                                    <Link
                                        key={section.href}
                                        href={section.href}
                                        className={cn(
                                            "flex min-w-[220px] items-start gap-3 rounded-[1.5rem] border px-4 py-4 transition-colors lg:min-w-0",
                                            isActive
                                                ? "border-primary/30 bg-primary/12 text-foreground"
                                                : "border-transparent bg-background/20 text-muted-foreground hover:border-border/70 hover:bg-background/40 hover:text-foreground"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                                                isActive
                                                    ? "bg-primary text-primary-foreground"
                                                    : "bg-muted text-foreground"
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-medium">{section.label}</div>
                                            <div className="mt-1 text-xs leading-5 text-muted-foreground">
                                                {section.description}
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </nav>
                    </aside>

                    <main className="glass-panel rounded-[2rem] border border-border/70 p-5 md:p-8">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
