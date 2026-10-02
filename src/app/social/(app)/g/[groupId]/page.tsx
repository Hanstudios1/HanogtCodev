import { Suspense } from "react";
import GroupSessionProvider from "@/components/Social/group/GroupSession";
import GroupView from "@/components/Social/group/GroupView";

export default async function SocialGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
    const { groupId } = await params;
    // Keyed by id so switching groups starts from a clean session; topics only change the query.
    return (
        <GroupSessionProvider key={groupId} groupId={groupId}>
            <Suspense fallback={<div className="flex-1" />}>
                <GroupView />
            </Suspense>
        </GroupSessionProvider>
    );
}
