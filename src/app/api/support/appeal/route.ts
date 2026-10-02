import type { NextRequest } from "next/server";
import { readAppealToken } from "@/lib/server/appeal-token";
import { APPEAL_TICKET_META, APPEAL_TICKET_TITLE } from "@/lib/server/support";
import { defaultTicketPriority } from "@/lib/support";
import { handleSignInRequest } from "../_sign-in-request";

/**
 * Appeal against a suspension (POST { token, message }).
 *
 * A suspended account can't sign in, so it can't use /api/support. After it
 * has proven ownership at sign-in, /login receives a short-lived appeal token
 * and posts the appeal here (checks and answers: ../_sign-in-request.ts). The
 * appeal becomes an ordinary "ban_appeal" ticket ("Ban Kaldırma İsteği") of that
 * address with `meta.appeal`, so staff answer it in the Tickets section and
 * the person finds the reply under "Taleplerim" once the account is reinstated.
 */

export const runtime = "nodejs";

export function POST(request: NextRequest) {
    return handleSignInRequest(request, {
        name: "appeal",
        readToken: readAppealToken,
        perAccountPerDay: 2,
        // Only a suspended account files an appeal (one reinstated since the token was issued doesn't).
        applies: (_email, user) => Boolean(user.suspended || user.banned),
        ticket: { category: "ban_appeal", title: APPEAL_TICKET_TITLE, priority: defaultTicketPriority("ban_appeal"), meta: { ...APPEAL_TICKET_META } },
    });
}
