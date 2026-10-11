import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "./MessageBubble";

// Mock dependencies that require browser APIs or complex setup
vi.mock("react-markdown", () => ({
    default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock("react-syntax-highlighter", () => ({
    PrismLight: Object.assign(
        ({ children }: { children: string }) => <pre data-testid="syntax">{children}</pre>,
        { registerLanguage: vi.fn() }
    ),
}));

vi.mock("react-syntax-highlighter/dist/esm/styles/prism", () => ({
    oneDark: {},
}));

vi.mock("@/stores/toast-store", () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }),
}));

describe("MessageBubble", () => {
    afterEach(cleanup);

    it("renders user message content", () => {
        render(<MessageBubble role="user" content="Hello world" />);
        expect(screen.getByText("Hello world")).toBeDefined();
    });

    it("renders assistant message content", () => {
        render(<MessageBubble role="assistant" content="Hi there" />);
        expect(screen.getByText("Hi there")).toBeDefined();
    });

    it("shows 'You' label for user messages", () => {
        render(<MessageBubble role="user" content="test" />);
        expect(screen.getByText("You")).toBeDefined();
    });

    it("shows 'Assistant' label for assistant messages", () => {
        render(<MessageBubble role="assistant" content="test" />);
        expect(screen.getByText("Assistant")).toBeDefined();
    });

    it("renders copy button", () => {
        render(<MessageBubble role="user" content="copy me" />);
        expect(screen.getByLabelText("Copy message to clipboard")).toBeDefined();
    });

    it("disables copy button for empty content", () => {
        render(<MessageBubble role="user" content="" />);
        const btn = screen.getByLabelText("Copy message to clipboard");
        expect(btn.hasAttribute("disabled")).toBe(true);
    });

    it("applies compact density without crashing", () => {
        const { container } = render(
            <MessageBubble role="user" content="Compact" density="compact" />
        );
        expect(container.firstChild).toBeDefined();
    });

    it("shows streaming dots when content is empty and isStreaming", () => {
        const { container } = render(
            <MessageBubble role="assistant" content="" isStreaming={true} />
        );
        // Streaming indicator uses animate-bounce dots
        expect(container.querySelector(".animate-bounce")).toBeDefined();
    });

    it("displays token count when showTokenCount is true", () => {
        render(
            <MessageBubble
                role="assistant"
                content="Response"
                showTokenCount={true}
                tokenCount={42}
            />
        );
        expect(screen.getByText("42 tokens")).toBeDefined();
    });

    it("does not display token count when showTokenCount is false", () => {
        render(
            <MessageBubble
                role="assistant"
                content="Response"
                showTokenCount={false}
                tokenCount={42}
            />
        );
        expect(screen.queryByText("42 tokens")).toBeNull();
    });

    it("does not display token count when tokenCount is undefined", () => {
        render(
            <MessageBubble role="assistant" content="Response" showTokenCount={true} />
        );
        expect(screen.queryByText(/tokens/)).toBeNull();
    });

    it("renders long content without crashing", () => {
        const longContent = "x".repeat(5000);
        render(<MessageBubble role="assistant" content={longContent} />);
        expect(screen.getByText(longContent)).toBeDefined();
    });

    it("copies through the async clipboard API when granted", async () => {
        const writeText = vi.fn(async () => undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        });

        render(<MessageBubble role="user" content="copy me" />);
        fireEvent.click(screen.getByLabelText("Copy message to clipboard"));

        expect(writeText).toHaveBeenCalledWith("copy me");
        expect(await screen.findByLabelText("Message copied")).toBeDefined();

        // jsdom has no clipboard API of its own; leave the double as found.
        Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    });

    it("falls back to execCommand when the grant is denied", async () => {
        Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
        const execCommand = vi.fn(() => true);
        Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });

        render(<MessageBubble role="user" content="copy me" />);
        fireEvent.click(screen.getByLabelText("Copy message to clipboard"));

        expect(execCommand).toHaveBeenCalledWith("copy");
        expect(await screen.findByLabelText("Message copied")).toBeDefined();
    });

    it("falls through to execCommand when writeText denies despite existing", async () => {
        const writeText = vi.fn(async () => {
            throw new DOMException("Write permission denied", "NotAllowedError");
        });
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        });
        const execCommand = vi.fn(() => true);
        Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });

        render(<MessageBubble role="user" content="copy me" />);
        fireEvent.click(screen.getByLabelText("Copy message to clipboard"));

        expect(writeText).toHaveBeenCalledWith("copy me");
        // The denial surfaces on a microtask (awaited rejection), after the
        // synchronous assertions above already ran.
        await vi.waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
        expect(await screen.findByLabelText("Message copied")).toBeDefined();

        Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    });
});
