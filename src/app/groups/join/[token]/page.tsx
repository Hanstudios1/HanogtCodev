"use client";

import { useParams } from "next/navigation";
import JoinGroupView from "@/components/Groups/JoinGroupView";

export default function JoinGroupPage() {
    const params = useParams<{ token: string }>();
    const token = typeof params?.token === "string" ? params.token : "";
    return <JoinGroupView token={token} />;
}
