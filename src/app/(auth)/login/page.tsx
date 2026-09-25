// src/app/(auth)/login/page.tsx
// ────────────────────────────────────────────────────────────────
// Login page with password and OAuth support.
// ────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Chrome, Github, KeyRound, ShieldCheck, Sparkles } from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError("Unable to sign in. Check your credentials and verify your email if required.");
            } else {
                router.push("/chat");
                router.refresh();
            }
        } catch {
            setError("An error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleOAuthSignIn = async (provider: "google" | "github") => {
        await signIn(provider, { callbackUrl: "/chat" });
    };

    return (
        <div className="app-shell flex min-h-screen items-center justify-center px-4 py-10">
            <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.1fr)_420px]">
                <section className="glass-panel hidden rounded-[2rem] border border-border/70 p-10 lg:flex lg:flex-col lg:justify-between">
                    <div>
                        <div className="section-kicker mb-4 flex items-center gap-2">
                            <Sparkles className="h-3.5 w-3.5" />
                            Personal AI workspace
                        </div>
                        <h1 className="max-w-xl text-5xl font-semibold tracking-tight">
                            One desk for every model you use.
                        </h1>
                        <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground">
                            Bring your own keys, keep credentials encrypted, and switch between
                            providers without losing your preferred workflow.
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-[1.5rem] border border-border/70 bg-background/30 p-5">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            <div className="mt-3 font-medium">Encrypted vault</div>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                API keys are stored encrypted before persistence.
                            </p>
                        </div>
                        <div className="rounded-[1.5rem] border border-border/70 bg-background/30 p-5">
                            <KeyRound className="h-5 w-5 text-primary" />
                            <div className="mt-3 font-medium">Bring your own models</div>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                Connect OpenAI, Anthropic, Google, Groq, and more.
                            </p>
                        </div>
                        <div className="rounded-[1.5rem] border border-border/70 bg-background/30 p-5">
                            <Sparkles className="h-5 w-5 text-primary" />
                            <div className="mt-3 font-medium">Personal defaults</div>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                Save prompts, density, theme, and workspace behavior.
                            </p>
                        </div>
                    </div>
                </section>

                <Card className="glass-panel w-full rounded-[2rem] border border-border/70 bg-background/50 shadow-[0_24px_100px_rgba(0,0,0,0.2)]">
                    <CardHeader className="space-y-2">
                        <div className="section-kicker flex items-center gap-2">
                            <Sparkles className="h-3.5 w-3.5" />
                            Access workspace
                        </div>
                        <CardTitle className="text-3xl font-semibold tracking-tight">Sign in to OmniChat</CardTitle>
                        <CardDescription className="text-sm leading-6">
                            Continue with password or OAuth to access your personal AI workspace.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                    {error && (
                        <div className="rounded-2xl bg-destructive/15 p-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    {/* Password Login Form */}
                    <form onSubmit={handlePasswordLogin} className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="email" className="text-sm font-medium">
                                Email
                            </label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="password" className="text-sm font-medium">
                                Password
                            </label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isLoading}
                                required
                            />
                        </div>
                        <Button type="submit" className="h-11 w-full rounded-full" disabled={isLoading}>
                            {isLoading ? "Signing in..." : "Sign In"}
                        </Button>
                    </form>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                                Or continue with
                            </span>
                        </div>
                    </div>

                    {/* OAuth Buttons */}
                    <div className="grid grid-cols-2 gap-4">
                        <Button
                            variant="outline"
                            onClick={() => handleOAuthSignIn("google")}
                            disabled={isLoading}
                            className="rounded-full"
                        >
                            <Chrome className="mr-2 h-4 w-4" />
                            Google
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleOAuthSignIn("github")}
                            disabled={isLoading}
                            className="rounded-full"
                        >
                            <Github className="mr-2 h-4 w-4" />
                            GitHub
                        </Button>
                    </div>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-3">
                        <p className="text-center text-sm text-muted-foreground">
                            Hosted accounts may require email verification, including Google and GitHub accounts.
                            Verify your email, then sign in again. Development and offline desktop setups can sign in directly when verification is disabled.
                        </p>
                        <div className="flex flex-wrap justify-center gap-4">
                            <Button variant="link" onClick={() => router.push("/register")}>Create account</Button>
                            <Button variant="link" onClick={() => router.push("/verify-email")}>Verify email or resend link</Button>
                        </div>
                        <p className="text-center text-xs text-muted-foreground">
                            By signing in, you agree to our Terms of Service and Privacy Policy.
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
