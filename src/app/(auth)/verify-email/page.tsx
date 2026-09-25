import { EmailVerificationForms } from "@/components/auth/EmailVerificationForms";
import { isEmailVerificationRequired } from "@/lib/auth/email-policy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify email | OmniChat", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default function VerifyEmailPage() {
    return <EmailVerificationForms mode="verify" enabled={isEmailVerificationRequired()} />;
}
