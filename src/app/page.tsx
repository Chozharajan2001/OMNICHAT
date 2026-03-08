// src/app/page.tsx
// ────────────────────────────────────────────────────────────────
// Home page - redirects to chat.
// ────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";

export default function Home() {
    redirect("/chat");
}
