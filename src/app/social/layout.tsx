import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Hanogt Social",
    description: "Hanogt Social: arkadaşların, direkt mesajların, grupların ve çevrimiçi durumların tek yerde.",
    // Signed-in space; nothing here is useful to search engines.
    robots: { index: false, follow: false },
};

export default function SocialLayout({ children }: { children: ReactNode }) {
    return children;
}
