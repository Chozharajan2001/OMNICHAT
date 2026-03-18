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

export const metadata: Metadata = {
  title: "OmniChat",
  description: "A personal multi-provider AI workspace with bring-your-own-key model access.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeController />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
