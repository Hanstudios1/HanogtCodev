"use client";

import { useParams } from "next/navigation";
import GroupWorkspace from "@/components/Groups/workspace/GroupWorkspace";

export default function GroupWorkspacePage() {
    const params = useParams<{ groupId: string }>();
    const groupId = typeof params?.groupId === "string" ? params.groupId : "";
    // Keyed by id so switching groups starts with a clean workspace state.
    return <GroupWorkspace key={groupId} groupId={groupId} />;
}
