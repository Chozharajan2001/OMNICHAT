"use client";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export default function SignOutButton() {
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                signOut({ callbackUrl: "/login" });
            }}
        >
            <Button type="submit" variant="outline" className="rounded-full">
                <LogOut className="h-4 w-4" />
                Sign out
            </Button>
        </form>
    );
}
