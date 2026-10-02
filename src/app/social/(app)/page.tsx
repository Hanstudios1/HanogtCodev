import { Suspense } from "react";
import FriendsView from "@/components/Social/FriendsView";

export default function SocialHomePage() {
    return (
        <Suspense fallback={<div className="flex-1" />}>
            <FriendsView />
        </Suspense>
    );
}
