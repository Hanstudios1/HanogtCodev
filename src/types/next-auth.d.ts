import type { SessionStepUp, StepUpClaim } from "@/lib/step-up";

/** Hanogt's fields on the NextAuth session and its token (src/lib/auth.ts, src/lib/step-up.ts). */
declare module "next-auth" {
    interface Session {
        /** The second check after a Google sign-in, while it is pending. */
        stepUp?: SessionStepUp;
        /** When the person last proved who they are (ms); 0 when unknown (a session from before it was recorded). */
        authTime?: number | null;
        /** users/{email}.authVersion when the session was issued. */
        authVersion?: number;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id?: string | null;
        sv?: number;
        authTime?: number;
        provider?: string;
        authVersion?: number;
        stepUp?: StepUpClaim;
        /** Found signed out everywhere: the session reads as signed out from then on. */
        revoked?: boolean;
    }
}
