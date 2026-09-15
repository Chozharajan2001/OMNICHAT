import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        setupFiles: ["./src/test/setup.ts"],
        include: ["src/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
            exclude: ["**/*.test.ts", "**/node_modules/**", "**/dist/**"],
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
