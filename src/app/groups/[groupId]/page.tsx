import { redirect } from "next/navigation";
import { isGroupId } from "@/lib/groups";
import { groupHref } from "@/lib/social/model";

// Group workspaces open inside Hanogt Social.
export default async function GroupRedirectPage({ params }: { params: Promise<{ groupId: string }> }) {
    const { groupId } = await params;
    redirect(isGroupId(groupId) ? groupHref(groupId) : "/social");
}
