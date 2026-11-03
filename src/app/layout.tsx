import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeController } from "@/components/theme/ThemeController";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The app is self-hostable, so the origin is whatever the operator configured.
// APP_ORIGIN is the canonical one; NEXTAUTH_URL is the fallback the auth config
// already relies on.
const appOrigin = process.env.APP_ORIGIN ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const description = "A personal multi-provider AI workspace with bring-your-own-key model access.";

export const metadata: Metadata = {
    metadataBase: new URL(appOrigin),
    title: {
        default: "OmniChat — Personal AI workspace",
        template: "%s | OmniChat",
    },
    description,
    applicationName: "OmniChat",
    // Every route is session-gated, so this is a noindex app by design; the
    // per-page exports in (auth) keep their own explicit directives. What still
    // matters is that a shared link unfurls as the product rather than blank.
    robots: { index: false, follow: false },
    openGraph: {
        type: "website",
        siteName: "OmniChat",
        title: "OmniChat — Personal AI workspace",
        description,
        images: [{ url: "/og.png", width: 1200, height: 630, alt: "OmniChat workspace screenshot" }],
    },
    twitter: {
        card: "summary_large_image",
        title: "OmniChat — Personal AI workspace",
        description,
        images: ["/og.png"],
    },
    // /icon.svg and /apple-icon.png are picked up from the app/ file
    // conventions; declaring them here too would emit duplicate <link> tags.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeController />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
