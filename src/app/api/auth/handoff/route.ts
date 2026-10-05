import type { NextRequest } from "next/server";
import { AUTH_HANDOFF_NONCE, safeCallbackPath } from "@/lib/auth-client";
import { allowedHandoffOrigins, requestOrigin, signHandoff } from "@/lib/server/auth-handoff";
import { readSessionToken } from "@/lib/server/session-cookie";
import { SESSION_TOKEN_VERSION, readStepUpClaim } from "@/lib/step-up";

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

    // The session NextAuth has just stored here, with what the sign-in proved (a pending step-up included).
    const session = await readSessionToken(request);
    const email = typeof session?.email === "string" ? session.email.toLowerCase() : "";
    // The Google step did not finish here: start over on the site the visitor came from.
    if (!session || !email || session.sv !== SESSION_TOKEN_VERSION || session.revoked) return redirect(`${target}/login?error=OAuthCallback&callbackUrl=${encodeURIComponent(next)}`);

    const token = signHandoff({
        aud: target,
        nonce,
        next,
        user: { email, name: typeof session.name === "string" ? session.name : null, picture: typeof session.picture === "string" ? session.picture : null, id: typeof session.id === "string" && session.id ? session.id : email },
        claims: {
            authTime: typeof session.authTime === "number" ? session.authTime : Date.now(),
            provider: typeof session.provider === "string" ? session.provider : "google",
            authVersion: typeof session.authVersion === "number" ? session.authVersion : 0,
            stepUp: readStepUpClaim(session.stepUp),
        },
    });
    const complete = new URL("/api/auth/handoff/complete", target);
    complete.searchParams.set("token", token);
    return redirect(complete.toString());
}
