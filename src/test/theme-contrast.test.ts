// Contrast contract for the theme token layer.
//
// The design audit that prompted this work claimed `--muted-foreground` was the
// AA failure; measured with the WCAG relative-luminance formula it is 5.06:1 and
// always passed. What actually failed were the filled-button label pairs (white on
// orange 3.08:1, white on violet 3.55:1, white on red 2.95:1) and `--primary` used
// as text (2.91:1). Chrome's own contrast audit in Lighthouse flagged the same
// login submit button independently. So the numbers below are pinned here rather
// than re-derived by eyeball each time a hue is touched.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const CSS_PATH = join(process.cwd(), "src", "app", "globals.css");
const css = readFileSync(CSS_PATH, "utf8");

function blockOf(selector: string): string {
    const start = css.indexOf(selector);
    if (start < 0) throw new Error(`missing block: ${selector}`);
    const open = css.indexOf("{", start);
    const close = css.indexOf("}", open);
    return css.slice(open + 1, close);
}

function tokens(selector: string): Record<string, string> {
    const found: Record<string, string> = {};
    for (const line of blockOf(selector).split("\n")) {
        const match = /^\s*(--[a-z0-9-]+):\s*([^;]+);/.exec(line);
        if (match) found[match[1]] = match[2].trim();
    }
    return found;
}

function channel(value: number): number {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
    const digits = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, background: string): number {
    const one = luminance(foreground);
    const two = luminance(background);
    return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

// Text and icon glyphs must clear AA (4.5:1); the WCAG non-text floor of 3:1 is
// not enough here because these hues carry running labels, not just decoration.
const AA = 4.5;

function pairs(map: Record<string, string>): Array<[string, string, string]> {
    return [
        ["label on filled primary", map["--primary-foreground"], map["--primary"]],
        ["label on filled destructive", map["--destructive-foreground"], map["--destructive"]],
        ["label on primary hover", map["--primary-foreground"], map["--primary-hover"]],
        ["label on destructive hover", map["--destructive-foreground"], map["--destructive-hover"]],
        ["primary used as text", map["--primary"], map["--background"]],
        ["secondary body text", map["--muted-foreground"], map["--background"]],
        ["primary text", map["--foreground"], map["--background"]],
    ];
}

function tsxFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...tsxFiles(path));
        else if (/\.(tsx|ts)$/.test(entry.name)) found.push(path);
    }
    return found;
}

describe("theme contrast contract", () => {
    const themes = [
        ["light", ":root {"],
        ["dark", '[data-theme="dark"] {'],
    ] as const;

    for (const [name, selector] of themes) {
        describe(name, () => {
            const found = tokens(selector);

            it.each(pairs(found))("%s reaches AA", (_label, foreground, background) => {
                expect(contrast(foreground, background)).toBeGreaterThanOrEqual(AA);
            });

            it("declares a hover token for every filled variant", () => {
                expect(found["--primary-hover"]).toMatch(/^#[0-9a-f]{6}$/i);
                expect(found["--destructive-hover"]).toMatch(/^#[0-9a-f]{6}$/i);
            });
        });
    }

    it("maps the hover tokens into Tailwind theme utilities", () => {
        expect(css).toContain("--color-primary-hover: var(--primary-hover);");
        expect(css).toContain("--color-destructive-hover: var(--destructive-hover);");
    });

    it("never fades a label that sits on a filled primary or destructive", () => {
        // `text-primary-foreground/80` measured 3.81:1 on the light fill and
        // 3.87:1 on the dark one; an opacity modifier on the label recomputes
        // the pair, so it is not allowed on these two tokens.
        const offenders = tsxFiles(join(process.cwd(), "src"))
            .filter((file) => !/\.test\.[cm]?[jt]sx?$/.test(file))
            .filter((file) => /text-(primary|destructive)-foreground\/\d+/.test(readFileSync(file, "utf8")))
            .map((file) => relative(process.cwd(), file));
        expect(offenders).toEqual([]);
    });
});
