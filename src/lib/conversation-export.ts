// Download one conversation as a JSON file. The route answers with an
// attachment disposition, but fetch ignores it, so the filename is rebuilt
// here from the title the caller already shows.

function slugify(title: string): string {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    return slug || "conversation";
}

async function readError(response: Response): Promise<string> {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    return typeof payload?.error === "string" ? payload.error : "Export failed";
}

export async function downloadConversationExport(
    conversationId: string,
    title: string
): Promise<void> {
    const response = await fetch(`/api/conversations/${conversationId}/export`);
    if (!response.ok) {
        throw new Error(await readError(response));
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${slugify(title)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    } finally {
        URL.revokeObjectURL(url);
    }
}
