import { Suspense } from "react";
import DmView from "@/components/Social/dm/DmView";

function decodeParam(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export default async function SocialDmPage({ params }: { params: Promise<{ friendId: string }> }) {
    const { friendId } = await params;
    return (
        <Suspense fallback={<div className="flex-1" />}>
            <DmView email={decodeParam(friendId)} />
        </Suspense>
    );
}
