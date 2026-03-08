import { NextResponse } from "next/server";
import { getServerSession, requireAuth } from "@/lib/auth/session";
import { saveKeySchema } from "@/lib/validators/schemas";
import { saveApiKey, getUserKeys } from "@/lib/db/queries/api-keys";
import { validateApiKey } from "@/lib/mastra";

export async function GET() {
    const session = await getServerSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await getUserKeys(session.user.id);
    return NextResponse.json({ keys });
}

export async function POST(request: Request) {
    try {
        await requireAuth(); // Ensures a logged-in user

        const body = await request.json();
        const { providerId, apiKey, validate = true } = saveKeySchema.parse(body);

        if (validate) {
            const isValid = await validateApiKey(providerId, apiKey);
            if (!isValid) {
                return NextResponse.json(
                    { error: "Invalid API key or provider error" },
                    { status: 400 }
                );
            }
        }

        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await saveApiKey(session.user.id, providerId, apiKey, true);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error("Failed to save API key:", error);
        const errorMessage = error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
