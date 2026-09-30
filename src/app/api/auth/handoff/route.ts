import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { AUTH_HANDOFF_NONCE, safeCallbackPath } from "@/lib/auth-client";
import { allowedHandoffOrigins, requestOrigin, signHandoff } from "@/lib/server/auth-handoff";

function redirect(location: string) {
    return new Response(null, {
        status: 302,
        headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
}

/**
 * Runs on the auth host right after a Google sign-in that started on another
 * of our sites and sends the new session back there (see auth-handoff.ts).
 */
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const next = safeCallbackPath(params.get("callbackUrl"));
    const nonce = params.get("nonce") || "";
    let target: string;
    try {
        target = new URL(params.get("target") || "").origin;
    } catch {
        return redirect("/login?error=Default");
    }
    if (!allowedHandoffOrigins().has(target) || target === requestOrigin(request) || !AUTH_HANDOFF_NONCE.test(nonce)) {
        return redirect("/login?error=Default");
    }

    const session = await getServerSession(authOptions).catch(() => null);
    const user = session?.user as { email?: string | null; name?: string | null; image?: string | null; id?: string } | undefined;
    const email = user?.email?.toLowerCase();
    // The Google step did not finish here: start over on the site the visitor came from.
    if (!email) return redirect(`${target}/login?error=OAuthCallback&callbackUrl=${encodeURIComponent(next)}`);

    const token = signHandoff({
        aud: target,
        nonce,
        next,
        user: { email, name: user?.name ?? null, picture: user?.image ?? null, id: user?.id || email },
    });
    const complete = new URL("/api/auth/handoff/complete", target);
    complete.searchParams.set("token", token);
    return redirect(complete.toString());
}
