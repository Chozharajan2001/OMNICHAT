// src/app/page.tsx
// ────────────────────────────────────────────────────────────────
// Home page - redirects to chat (middleware will handle auth).
// ────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";

export default async function Home() {
    const session = await auth();
    
    if (session?.user) {
        redirect("/chat");
    }
    
    // If not logged in, redirect to login
    redirect("/login");
}
