import { redirect } from "next/navigation";
import { extractInviteToken, inviteLinkPath } from "@/lib/groups";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
    return (Array.isArray(value) ? value[0] : value) ?? "";
}

// Groups live in Hanogt Social now; the old deep links (?join=, ?create=1, ?notice=) keep working.
export default async function GroupsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const token = extractInviteToken(first(params.join));
    if (token) redirect(inviteLinkPath(token));
    if (first(params.create) === "1") redirect("/social?create=1");
    const notice = first(params.notice);
    if (notice === "left" || notice === "deleted") redirect(`/social?notice=${notice}`);
    redirect("/social");
}
