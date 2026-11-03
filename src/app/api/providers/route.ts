import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { routeTimer } from "@/lib/api/observe";
import { SUPPORTED_PROVIDERS } from "@/lib/mastra/providers";
import { getUserKeys } from "@/lib/db/queries/api-keys";

export async function GET() {
    const done = routeTimer("GET", "/api/providers");
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            done(401);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;
        const userKeys = await getUserKeys(userId);
        const keysByProvider = userKeys.reduce((acc, key) => {
            acc[key.providerId] = key;
            return acc;
        }, {} as Record<string, (typeof userKeys)[0]>);

        const providers = SUPPORTED_PROVIDERS.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            icon: p.icon,
            website: p.website,
            docsUrl: p.docsUrl,
            supportsStreaming: p.supportsStreaming,
            models: p.models,
            hasKey: !!(keysByProvider[p.id]?.isValid),
            keyHint: keysByProvider[p.id]?.keyHint || null,
        }));

        done(200);
        return NextResponse.json({ providers });
    } catch (error) {
        console.error("Providers list error:", error);
        done(500);
        return NextResponse.json(
            { error: "Failed to fetch providers" },
            { status: 500 }
        );
    }
}
