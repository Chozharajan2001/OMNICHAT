// Design-token guard.
//
// The two error boundaries were the last files styling themselves off the raw
// Tailwind palette (text-red-600, text-gray-600 dark:text-gray-400,
// border-gray-300, bg-primary + text-white), which meant a crash screen looked
// like a different product and, in dark mode, put gray-600 text on a near-black
// background. src is now token-only; this keeps it that way.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RAW_PALETTE = /(text|bg|border|ring|from|to|via)-(red|gray|slate|zinc|neutral|stone|blue|green|yellow|amber|orange|pink|purple|violet|indigo|cyan|teal|emerald|lime|fuchsia)-[0-9]{2,3}/;

function tsxFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) tsxFiles(path, found);
        else if (/\.tsx$/.test(entry.name)) found.push(path);
    }
    return found;
}

describe("design tokens only", () => {
    it("src has no raw Tailwind palette utilities", () => {
        const offenders = tsxFiles(join(process.cwd(), "src"))
            .filter((file) => !file.includes(`${join("src", "test")}`))
            .filter((file) => RAW_PALETTE.test(readFileSync(file, "utf8")))
            .map((file) => relative(process.cwd(), file));
        expect(offenders).toEqual([]);
    });

    it("error boundaries keep the shared radius and label tokens", () => {
        for (const file of ["src/app/error.tsx", "src/app/global-error.tsx"]) {
            const source = readFileSync(join(process.cwd(), file), "utf8");
            expect(source, `${file} should not hardcode white on a brand fill`).not.toMatch(/text-white/);
            expect(source, `${file} should reuse the panel radius language`).toContain("rounded-[2rem]");
        }
    });

    it("global-error loads the stylesheet the root layout cannot provide", () => {
        // It replaces <html>/<body>, so without this import every class in it is
        // inert and the crash screen is unstyled browser defaults.
        expect(readFileSync(join(process.cwd(), "src", "app", "global-error.tsx"), "utf8"))
            .toContain('import "./globals.css"');
    });
});
