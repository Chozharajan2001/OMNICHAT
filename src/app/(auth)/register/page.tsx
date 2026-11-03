import { EmailVerificationForms } from "@/components/auth/EmailVerificationForms";
import { isEmailVerificationRequired } from "@/lib/auth/email-policy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account | OmniChat", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default function RegisterPage() {
    return <EmailVerificationForms mode="register" enabled={isEmailVerificationRequired()} />;
}
