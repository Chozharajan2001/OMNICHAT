import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationList } from "./ConversationList";
import type { Conversation } from "@/stores/chat-store";

vi.mock("lucide-react", () => ({
    Archive: () => <span data-testid="i-archive" />,
    Download: () => <span data-testid="i-download" />,
    FolderOpen: () => <span data-testid="i-folder" />,
    MessageSquare: () => <span data-testid="i-message" />,
    Pencil: () => <span data-testid="i-pencil" />,
    Trash2: () => <span data-testid="i-trash" />,
}));

afterEach(cleanup);

const conversation: Conversation = {
    id: "c-1",
    title: "Refund policy draft",
    providerId: "openai",
    modelId: "gpt-4o",
    updatedAt: "2026-10-05T00:00:00.000Z",
    lastMessage: { content: "Where should the caveat go?", role: "assistant" },
};

function renderList() {
    return render(
        <ConversationList
            conversations={[conversation]}
            activeConversationId={null}
            isLoading={false}
            projects={[{ id: "p-1", name: "Support" }]}
            onAssignProject={vi.fn()}
            onArchive={vi.fn()}
            onDelete={vi.fn()}
            onExport={vi.fn()}
            onRename={vi.fn()}
            emptyMessage={NO_CONVERSATIONS_MESSAGE}
        />
    );
}

function renderEmpty(emptyMessage: string) {
    return render(
        <ConversationList
            conversations={[]}
            activeConversationId={null}
            isLoading={false}
            projects={[]}
            onAssignProject={vi.fn()}
            onArchive={vi.fn()}
            onDelete={vi.fn()}
            onExport={vi.fn()}
            onRename={vi.fn()}
            emptyMessage={emptyMessage}
        />
    );
}

const NO_CONVERSATIONS_MESSAGE = "No conversations yet. Start one and it will appear here.";

describe("ConversationList empty state", () => {
    // The sidebar used to render two messages for one empty list: this
    // component's "No conversations yet" plus its own "No chat in this list
    // matches …". The account had three chats and the filter hid them, so the
    // panel claimed there was nothing to find at all.
    it("shows the caller's message and never adds a contradiction", () => {
        const { container } = renderEmpty("No chat in this list matches “zzz”.");

        expect(container.textContent).toContain("No chat in this list matches “zzz”.");
        expect(container.textContent).not.toMatch(/No conversations yet/);
    });

    it("keeps the first-run wording when nothing is filtered", () => {
        const { container } = renderEmpty(NO_CONVERSATIONS_MESSAGE);

        expect(container.textContent).toContain(NO_CONVERSATIONS_MESSAGE);
    });
});

describe("ConversationList row controls", () => {
    it("names each icon-only action with the conversation title", () => {
        renderList();
        // axe reported these as critical button-name violations: an icon with no
        // text and no label announces nothing at all to a screen reader.
        expect(screen.getByLabelText("Move “Refund policy draft” to a project")).toBeTruthy();
        expect(screen.getByLabelText("Archive “Refund policy draft”")).toBeTruthy();
        expect(screen.getByLabelText("Delete “Refund policy draft”")).toBeTruthy();
    });

    it("keeps the actions out of the navigation link", () => {
        const { container } = renderList();
        const link = container.querySelector("a[href='/chat/c-1']");
        expect(link).toBeTruthy();
        // Interactive content nested inside an <a> is invalid HTML and makes the
        // link's own accessible name swallow the control labels.
        expect(link?.querySelector("button,[role=combobox]")).toBeNull();
    });

    it("reveals the actions on keyboard focus, not only on hover", () => {
        renderList();
        const archive = screen.getByLabelText("Archive “Refund policy draft”");
        expect(archive.className).toContain("opacity-0");
        expect(archive.className).toContain("group-focus-within:opacity-100");
    });

    it("offers rename from the row menu with the conversation identity", async () => {
        const onRename = vi.fn();
        render(
            <ConversationList
                conversations={[{ ...conversation }]}
                activeConversationId={null}
                isLoading={false}
                projects={[{ id: "p-1", name: "Support" }]}
                onAssignProject={vi.fn()}
                onArchive={vi.fn()}
                onDelete={vi.fn()}
                onExport={vi.fn()}
                onRename={onRename}
                emptyMessage={NO_CONVERSATIONS_MESSAGE}
            />
        );

        // Radix opens on keydown, not on a bare click: a click-only test would
        // pass against a menu that no keyboard user can ever open.
        const trigger = screen.getByLabelText("Move “Refund policy draft” to a project");
        trigger.focus();
        fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
        fireEvent.click(await screen.findByText("Rename"));
        expect(onRename).toHaveBeenCalledWith("c-1", "Refund policy draft");
    });
});
