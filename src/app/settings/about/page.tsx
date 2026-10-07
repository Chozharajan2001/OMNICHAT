import { Metadata } from "next";
import { BadgeInfo, Boxes, Rocket, ShieldCheck } from "lucide-react";
import { APP_VERSION } from "@/lib/version";

export const metadata: Metadata = {
    title: "About | OmniChat",
};

export default function AboutSettingsPage() {
    return (
        <div className="space-y-8">
            <div>
                <div className="section-kicker mb-3">About</div>
                <h2 className="text-4xl font-semibold tracking-tight">About OmniChat</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                    A personal multi-provider AI workspace focused on bring-your-own-key access,
                    privacy-aware credential storage, and a stronger workspace UX.
                </p>
            </div>

            <section className="grid gap-6 xl:grid-cols-3">
                <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <div className="mt-4 text-lg font-semibold">Security posture</div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        API keys are encrypted at rest. This app is designed for self-hosted trust
                        models, not public multi-tenant SaaS.
                    </p>
                </div>
                <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                    <Boxes className="h-5 w-5 text-primary" />
                    <div className="mt-4 text-lg font-semibold">Current build scope</div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Phase 1 is complete. Web UX polish is advanced. Desktop, Docker, and cloud
                        packaging are still pending.
                    </p>
                </div>
                <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                    <Rocket className="h-5 w-5 text-primary" />
                    <div className="mt-4 text-lg font-semibold">Next major step</div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Phase 2 will focus on desktop/Tauri packaging, local database runtime, and
                        installer-grade behavior.
                    </p>
                </div>
            </section>

            <section className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                <div className="mb-4 flex items-center gap-2 text-sm font-medium">
                    <BadgeInfo className="h-4 w-4 text-primary" />
                    Current implementation notes
                </div>
                <div className="space-y-3 text-sm text-muted-foreground">
                    <p>App version: {APP_VERSION} - the single source is package.json. The API contract version lives in /openapi.json and moves on its own.</p>
                    <p>Routing: Next.js App Router</p>
                    <p>Language selector: implemented as persisted UI preference, full localization pending</p>
                    <p>Verified commands: `npm run lint`, `npm run test`, `npm run build`</p>
                    <p>Source-of-truth docs: `documents/MVP_Checklist.md`, `documents/DEVELOPER_GUIDE.md`</p>
                </div>
            </section>
        </div>
    );
}
