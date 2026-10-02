import { redirect } from "next/navigation";
import { dmHref } from "@/lib/social/model";

function decodeParam(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

// Conversations moved to /social/dm/<email>.
export default async function MessagesRedirectPage({ params }: { params: Promise<{ friendId: string }> }) {
    const { friendId } = await params;
    const email = decodeParam(friendId).trim().toLowerCase();
    redirect(email ? dmHref(email) : "/social");
}
