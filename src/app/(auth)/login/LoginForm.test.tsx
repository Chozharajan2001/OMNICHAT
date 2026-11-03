import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import LoginForm from "./LoginForm";

const none = { google: false, github: false };
const both = { google: true, github: true };

describe("LoginForm OAuth section (Phase 4.1)", () => {
    afterEach(cleanup);

    it("hides the whole alternative-login block when nothing is configured", () => {
        render(<LoginForm oauth={none} />);

        expect(screen.queryByText("Google")).toBeNull();
        expect(screen.queryByText("GitHub")).toBeNull();
        expect(screen.queryByText(/Or continue with/i)).toBeNull();
    });

    it("shows only the provider the server actually registered", () => {
        render(<LoginForm oauth={{ google: true, github: false }} />);

        expect(screen.getByText("Google")).toBeDefined();
        expect(screen.queryByText("GitHub")).toBeNull();
    });

    it("keeps both buttons when both are configured", () => {
        render(<LoginForm oauth={both} />);

        expect(screen.getByText("Google")).toBeDefined();
        expect(screen.getByText("GitHub")).toBeDefined();
    });

    it("always offers the password path", () => {
        render(<LoginForm oauth={none} />);

        expect(screen.getByLabelText(/email/i)).toBeDefined();
        expect(screen.getByLabelText(/password/i)).toBeDefined();
        expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
    });

    it("lands the page in a main landmark", () => {
        const { container } = render(<LoginForm oauth={none} />);

        expect(container.querySelector("main")).not.toBeNull();
    });
});
