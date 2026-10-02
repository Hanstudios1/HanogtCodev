import { redirect } from "next/navigation";

// Invite links shared before Hanogt Social (/groups/join/<token>) keep working; the join page validates the token.
export default async function LegacyJoinPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    redirect(`/social/join/${encodeURIComponent(token)}`);
}
