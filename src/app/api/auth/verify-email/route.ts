import { createEmailRoute } from "@/lib/auth/email-route";

export const runtime = "nodejs";
export const POST = createEmailRoute("verify");
