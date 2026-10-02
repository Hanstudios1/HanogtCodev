import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Hanogt Social",
    description: "Arkadaşların, direkt mesajların ve grupların tek yerde.",
    // Signed-in space; nothing here is useful to search engines.
    robots: { index: false, follow: false },
};

export default function SocialLayout({ children }: { children: ReactNode }) {
    return children;
}
