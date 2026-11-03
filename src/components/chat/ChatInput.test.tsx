import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatInput } from "./ChatInput";

// Mock lucide-react icons (SVG components that may not render in jsdom)
vi.mock("lucide-react", () => ({
    Send: () => <span data-testid="send-icon" />,
    Square: () => <span data-testid="stop-icon" />,
}));

describe("ChatInput", () => {
    afterEach(cleanup);

    const defaultProps = {
        value: "",
        isLoading: false,
        sendWithEnter: true,
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn(),
    };

    it("renders textarea with aria-label", () => {
        render(<ChatInput {...defaultProps} />);
        expect(screen.getByLabelText("Type your message")).toBeDefined();
    });

    it("renders send button when not loading", () => {
        render(<ChatInput {...defaultProps} />);
        expect(screen.getByLabelText("Send message")).toBeDefined();
    });

    it("renders stop button when loading", () => {
        render(<ChatInput {...defaultProps} isLoading={true} />);
        expect(screen.getByLabelText("Stop generating response")).toBeDefined();
    });

    it("disables send button when value is empty", () => {
        render(<ChatInput {...defaultProps} value="" />);
        const btn = screen.getByLabelText("Send message");
        expect(btn.hasAttribute("disabled")).toBe(true);
    });

    it("disables send button when value is whitespace only", () => {
        render(<ChatInput {...defaultProps} value="   " />);
        const btn = screen.getByLabelText("Send message");
        expect(btn.hasAttribute("disabled")).toBe(true);
    });

    it("enables send button when value has content", () => {
        render(<ChatInput {...defaultProps} value="Hello" />);
        const btn = screen.getByLabelText("Send message");
        expect(btn.hasAttribute("disabled")).toBe(false);
    });

    it("calls onSubmit when form is submitted", () => {
        const onSubmit = vi.fn();
        render(<ChatInput {...defaultProps} value="Test" onSubmit={onSubmit} />);
        const form = screen.getByLabelText("Chat input form");
        fireEvent.submit(form);
        expect(onSubmit).toHaveBeenCalled();
    });

    it("calls onStop when stop button is clicked", () => {
        const onStop = vi.fn();
        render(<ChatInput {...defaultProps} isLoading={true} onStop={onStop} />);
        fireEvent.click(screen.getByLabelText("Stop generating response"));
        expect(onStop).toHaveBeenCalled();
    });

    it("calls onChange when textarea value changes", () => {
        const onChange = vi.fn();
        render(<ChatInput {...defaultProps} onChange={onChange} />);
        const textarea = screen.getByLabelText("Type your message");
        fireEvent.change(textarea, { target: { value: "new text" } });
        expect(onChange).toHaveBeenCalled();
    });

    it("submits on Enter when sendWithEnter is true", () => {
        const onSubmit = vi.fn();
        render(<ChatInput {...defaultProps} value="Enter test" sendWithEnter={true} onSubmit={onSubmit} />);
        const textarea = screen.getByLabelText("Type your message");
        fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
        expect(onSubmit).toHaveBeenCalled();
    });

    it("does not submit on Enter when sendWithEnter is false", () => {
        const onSubmit = vi.fn();
        render(<ChatInput {...defaultProps} value="No enter" sendWithEnter={false} onSubmit={onSubmit} />);
        const textarea = screen.getByLabelText("Type your message");
        fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("submits on Ctrl+Enter when sendWithEnter is false", () => {
        const onSubmit = vi.fn();
        render(<ChatInput {...defaultProps} value="Ctrl test" sendWithEnter={false} onSubmit={onSubmit} />);
        const textarea = screen.getByLabelText("Type your message");
        fireEvent.keyDown(textarea, { key: "Enter", code: "Enter", ctrlKey: true });
        expect(onSubmit).toHaveBeenCalled();
    });

    it("does not submit on Shift+Enter when sendWithEnter is true", () => {
        const onSubmit = vi.fn();
        render(<ChatInput {...defaultProps} value="Shift test" sendWithEnter={true} onSubmit={onSubmit} />);
        const textarea = screen.getByLabelText("Type your message");
        fireEvent.keyDown(textarea, { key: "Enter", code: "Enter", shiftKey: true });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("disables textarea when disabled prop is true", () => {
        render(<ChatInput {...defaultProps} disabled={true} />);
        const textarea = screen.getByLabelText("Type your message");
        expect(textarea.hasAttribute("disabled")).toBe(true);
    });

    // Plan 3.2: the composer used to lock for the whole reply, so drafting the
    // next message meant waiting (and losing selection/IME state). Sending stays
    // withheld by the hook's isLoading guard, which is the single source of
    // truth; the component's job is to keep typing possible and say plainly that
    // Enter will not go through yet.
    it("keeps the composer editable while a reply streams", () => {
        render(<ChatInput {...defaultProps} isLoading={true} />);
        const textarea = screen.getByLabelText("Type your message");
        expect(textarea.hasAttribute("disabled")).toBe(false);

        fireEvent.change(textarea, { target: { value: "next question" } });
        expect(defaultProps.onChange).toHaveBeenCalled();
    });

    it("still honours an external disable while loading", () => {
        render(<ChatInput {...defaultProps} isLoading={true} disabled={true} />);
        expect(screen.getByLabelText("Type your message").hasAttribute("disabled")).toBe(true);
    });

    it("shows 'Enter to send' hint when sendWithEnter is true", () => {
        render(<ChatInput {...defaultProps} sendWithEnter={true} />);
        expect(screen.getByText("Enter to send")).toBeDefined();
    });

    it("shows 'Ctrl/Cmd+Enter to send' hint when sendWithEnter is false", () => {
        render(<ChatInput {...defaultProps} sendWithEnter={false} />);
        expect(screen.getByText("Ctrl/Cmd+Enter to send")).toBeDefined();
    });

    it("replaces the send hint while a reply streams", () => {
        render(<ChatInput {...defaultProps} isLoading={true} sendWithEnter={true} />);
        expect(screen.getByText("Finish or stop this reply to send the next one")).toBeDefined();
        expect(screen.queryByText("Enter to send")).toBeNull();
    });
});
