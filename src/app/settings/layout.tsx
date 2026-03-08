"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();

    const handleBack = () => {
        router.back();
    };

    return (
        <div className="container mx-auto py-8">
            <div className="mb-6">
                <Button variant="ghost" onClick={handleBack} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Button>
                <h1 className="text-3xl font-bold mt-4">Settings</h1>
            </div>
            {children}
        </div>
    );
}
