"use client";

import { useEffect } from "react";
import { usePersonalizationStore } from "@/stores/personalization-store";

type ThemeMode = "light" | "dark" | "system";

function resolveTheme(mode: ThemeMode): "light" | "dark" {
    if (mode === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return mode;
}

function applyTheme(mode: ThemeMode) {
    const resolved = resolveTheme(mode);
    document.documentElement.dataset.theme = resolved;
}

export function ThemeController() {
    const language = usePersonalizationStore((state) => state.language);

    useEffect(() => {
        let activeMode: ThemeMode = "dark";
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

        const onSystemThemeChange = () => {
            if (activeMode === "system") {
                applyTheme("system");
            }
        };

        const bootstrapTheme = async () => {
            const storedTheme = window.localStorage.getItem("omnichat-theme");
            if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
                activeMode = storedTheme;
                applyTheme(activeMode);
            } else {
                applyTheme("dark");
            }

            try {
                const response = await fetch("/api/preferences", { credentials: "include" });
                if (!response.ok) return;

                const data = await response.json();
                const remoteTheme = data.preferences?.theme;
                if (remoteTheme === "light" || remoteTheme === "dark" || remoteTheme === "system") {
                    activeMode = remoteTheme;
                    window.localStorage.setItem("omnichat-theme", remoteTheme);
                    applyTheme(remoteTheme);
                }
            } catch {
                // Ignore preference bootstrap failures and keep the local theme.
            }
        };

        void bootstrapTheme();
        mediaQuery.addEventListener("change", onSystemThemeChange);

        return () => {
            mediaQuery.removeEventListener("change", onSystemThemeChange);
        };
    }, []);

    useEffect(() => {
        document.documentElement.lang = language;
        document.documentElement.dataset.language = language;
    }, [language]);

    return null;
}
