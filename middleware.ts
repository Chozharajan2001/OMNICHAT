import { auth } from "@/lib/auth/config";

export default auth((req) => {
    const isLoggedIn = !!req.auth?.user;
    const isAuthPage = req.nextUrl.pathname.startsWith("/login");
    const isApiAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");

    // Allow the auth API routes and the login page to proceed unauthenticated
    if (isApiAuthRoute || isAuthPage) {
        return;
    }

    // If the user is authenticated, allow the request
    if (isLoggedIn) {
        return;
    }

    // Otherwise, redirect to the login page
    return Response.redirect(new URL("/login", req.nextUrl));
});

export const config = {
    matcher: [
        // Skip Next.js internals and static assets
        "/((?!_next/static|_next/image|favicon.ico|api/auth|icons).*)",
    ],
};
