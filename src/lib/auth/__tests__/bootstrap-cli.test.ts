import { describe, expect, it } from "vitest";
// The bootstrap CLI is plain JS (it runs outside Next), so its rules are pinned
// here against the TypeScript policy they must never drift from.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- untyped .mjs module, exercised through its exports
import { normalizeEmail, parseArgs, passwordRuleFailure } from "../../../../scripts/users/add-user.mjs";
import { validatePasswordComplexity } from "../email-policy";

const PASSWORD_CASES: [string, boolean][] = [
    ["Abcdef1!", true],
    ["Str0ngPassw0rd", true],
    ["short1A", false],
    ["alllower1", false],
    ["ALLUPPER1", false],
    ["NoDigitsHere", false],
    ["", false],
    [`${"a".repeat(80)}A1`, false],
];

describe("bootstrap CLI password rules match the auth policy", () => {
    it.each(PASSWORD_CASES)("agrees that %j is %s", (password, expected) => {
        expect(passwordRuleFailure(password) === null).toBe(expected);
        expect(validatePasswordComplexity(password)).toBe(expected);
    });

    it("names the missing requirement instead of a bare false", () => {
        expect(passwordRuleFailure("alllower1")).toMatch(/uppercase/);
        expect(passwordRuleFailure("NoDigits1".replace("1", ""))).toMatch(/digit/);
        expect(passwordRuleFailure("Ab1")).toMatch(/8 characters/);
    });
});

describe("bootstrap CLI argument parsing", () => {
    it("accepts the documented flags", () => {
        expect(parseArgs(["--email", "Ops@Example.com", "--force", "--verified"])).toEqual({
            options: { email: "Ops@Example.com", passwordFile: null, force: true, verified: true, help: false },
        });
    });

    it("rejects unknown flags and a missing email", () => {
        expect(parseArgs(["--password", "hunter2"]).error).toMatch(/Unknown argument/);
        expect(parseArgs([]).error).toMatch(/Missing --email/);
        expect(parseArgs(["--email"]).error).toMatch(/Missing --email/);
    });

    it("never accepts a password on the command line", () => {
        expect(parseArgs(["--email", "a@b.co", "--password", "x"]).error).toMatch(/Unknown argument/);
    });

    it("supports --help without touching the database", () => {
        expect(parseArgs(["--help"]).options?.help).toBe(true);
    });
});

describe("bootstrap CLI email normalization", () => {
    it("trims and lowercases like normalizedEmailSchema", () => {
        expect(normalizeEmail("  Ops@Example.COM ")).toBe("ops@example.com");
    });

    it.each(["", "no-at-sign", "a@b", "a b@c.com", "x".repeat(250) + "@y.com"])("rejects %j", (value) => {
        expect(normalizeEmail(value)).toBeNull();
    });
});
