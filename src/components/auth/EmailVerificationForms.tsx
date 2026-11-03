"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function postEmailAction(path: string, body: object) {
    const response = await fetch(path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", cache: "no-store", body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to complete the request.");
    return result.message as string;
}

function ConfirmationButton() {
    const proof = useRef<{ email: string; token: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [message, setMessage] = useState("");

    async function confirm() {
        setBusy(true);
        try {
            if (!proof.current) {
                const fragment = new URLSearchParams(window.location.hash.slice(1));
                proof.current = { token: fragment.get("token") || "", email: fragment.get("email") || "" };
                window.history.replaceState(null, "", window.location.pathname);
            }
            if (!proof.current.token) throw new Error("Open the link from your verification email first.");
            setMessage(await postEmailAction("/api/auth/verify-email", proof.current));
            proof.current = null;
            setDone(true);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to confirm. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="space-y-3 border-b border-border pb-6">
            <p className="text-sm text-muted-foreground">Opened a verification link? Confirm only if you created this account and requested this email.</p>
            <Button className="w-full" onClick={confirm} disabled={busy || done}>
                {busy ? "Confirming..." : "Confirm email"}
            </Button>
            <p role="status" className="text-sm">{message}</p>
            {done && <Link href="/login" className="text-sm text-primary underline">Continue to sign in</Link>}
        </section>
    );
}

function RequestForm({ register }: { register: boolean }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        try {
            const path = register ? "/api/auth/register" : "/api/auth/resend-verification";
            const body = register ? { email, password } : { email };
            setMessage(await postEmailAction(path, body));
            setPassword("");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to send. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-2 text-sm">
                <span>Email</span>
                <Input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
            </label>
            {register && <label className="block space-y-2 text-sm">
                <span>Password</span>
                <Input type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
                <span className="block text-xs text-muted-foreground">At least 8 characters with uppercase, lowercase, and a number; at most 72 UTF-8 bytes.</span>
            </label>}
            <Button className="w-full" type="submit" disabled={busy}>
                {busy ? "Sending..." : register ? "Create account" : "Send verification email"}
            </Button>
            <p role="status" className="text-sm">{message}</p>
        </form>
    );
}

export function EmailVerificationForms({ mode, enabled }: { mode: "register" | "verify"; enabled: boolean }) {
    const register = mode === "register";
    return (
        <main className="app-shell flex min-h-dvh items-center justify-center px-4 py-10">
            <section className="glass-panel w-full max-w-md space-y-6 rounded-3xl border border-border p-8">
                <h1 className="text-2xl font-semibold">{register ? "Create your account" : "Verify your email"}</h1>
                {enabled ? <>
                    <p className="text-sm text-muted-foreground">Hosted accounts must verify their email before signing in, including accounts using Google or GitHub.</p>
                    {!register && <ConfirmationButton />}
                    <RequestForm register={register} />
                </> : <p className="text-sm text-muted-foreground">Hosted email verification is not enabled on this installation. Development and offline desktop users can sign in directly.</p>}
                <div className="flex justify-between gap-4 text-sm text-primary">
                    <Link href="/login" className="underline">Back to sign in</Link>
                    {enabled && <Link href={register ? "/verify-email" : "/register"} className="underline">{register ? "Resend verification" : "Create account"}</Link>}
                </div>
            </section>
        </main>
    );
}
