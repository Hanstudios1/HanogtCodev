import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerDocument } from "./firebase-rest";

export async function getActiveSession() {
    try {
        const session = await getServerSession(authOptions);
        const email = session?.user?.email?.toLowerCase();
        if (!email) return null;
        const user = await getServerDocument<{
            banned?: boolean;
            suspended?: boolean;
            securityResearchConsent?: boolean;
            friends?: string[];
        }>(`users/${email}`);
        if (!user || user.banned || user.suspended) return null;
        return { session, email, user };
    } catch {
        // Missing/invalid auth or database configuration must fail closed and
        // must not turn an anonymous request into an internal-error response.
        return null;
    }
}
