import type { ReactNode } from "react";
import SocialShell from "@/components/Social/SocialShell";

// A layout, so the rail, the sidebars and their live data survive moving between screens.
export default function SocialAppLayout({ children }: { children: ReactNode }) {
    return <SocialShell>{children}</SocialShell>;
}
