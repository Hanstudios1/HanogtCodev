import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Gruba katıl",
    // Invite links are private; keep them out of search results and referrers.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

export default function JoinLayout({ children }: { children: ReactNode }) {
    return children;
}
