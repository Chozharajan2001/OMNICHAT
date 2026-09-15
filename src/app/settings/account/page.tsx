import { auth } from "@/lib/auth/config";
import { Button } from "@/components/ui/button";
import { KeyRound, LogOut, Mail, UserRound } from "lucide-react";
import SignOutButton from "./SignOutButton";

export default async function AccountSettingsPage() {
    const session = await auth();

    return (
        <div className="space-y-8">
            <div>
                <div className="section-kicker mb-3">Account</div>
                <h2 className="text-4xl font-semibold tracking-tight">Session and identity</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Review the current signed-in account and the authentication model available in
                    the web app today.
                </p>
            </div>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                            <UserRound className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold">Current user</h3>
                            <p className="text-sm text-muted-foreground">
                                Account details from the active session.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between rounded-2xl bg-background/30 px-4 py-3">
                            <span className="text-muted-foreground">Name</span>
                            <span className="font-medium">{session?.user?.name || "Not set"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-background/30 px-4 py-3">
                            <span className="text-muted-foreground">Email</span>
                            <span className="font-medium">{session?.user?.email || "Not available"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-background/30 px-4 py-3">
                            <span className="text-muted-foreground">User ID</span>
                            <span className="max-w-[60%] truncate font-mono text-xs">{session?.user?.id || "Unknown"}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                        <div className="mb-4 flex items-center gap-2 text-sm font-medium">
                            <Mail className="h-4 w-4 text-primary" />
                            Authentication
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">
                            The web app currently supports credentials sign-in and optional Google/GitHub OAuth.
                        </p>
                    </div>

                    <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                        <div className="mb-4 flex items-center gap-2 text-sm font-medium">
                            <KeyRound className="h-4 w-4 text-primary" />
                            Account controls
                        </div>
                        <p className="mb-4 text-sm leading-6 text-muted-foreground">
                            Profile editing and account deletion are not implemented yet. The next practical
                            account work is export/delete data and session management polish.
                        </p>
                        <SignOutButton />
                    </div>
                </div>
            </section>
        </div>
    );
}
