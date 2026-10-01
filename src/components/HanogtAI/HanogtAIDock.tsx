"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { OpenAiOptions } from "@/lib/ai/context-store";
import HanogtAIChat, { type ChatLaunch } from "./HanogtAIChat";

/**
 * Global Hanogt AI panel. Any page opens it with openHanogtAI() (the
 * "hanogt:open-ai" event); the old "hanogt:open-security-bot" event opens it in
 * security mode. It reports its state with "hanogt:ai-state" for the header.
 */
export default function HanogtAIDock() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [launch, setLaunch] = useState<ChatLaunch | undefined>(undefined);

    useEffect(() => {
        const onOpen = (event: Event) => {
            const detail = (event as CustomEvent<OpenAiOptions | undefined>).detail ?? {};
            setLaunch({ ...detail, nonce: Date.now() });
            setOpen(true);
        };
        const onLegacy = () => {
            setLaunch({ mode: "security", nonce: Date.now() });
            setOpen(true);
        };
        const onToggle = () => setOpen((value) => !value);
        window.addEventListener("hanogt:open-ai", onOpen);
        window.addEventListener("hanogt:open-security-bot", onLegacy);
        window.addEventListener("hanogt:toggle-ai", onToggle);
        return () => {
            window.removeEventListener("hanogt:open-ai", onOpen);
            window.removeEventListener("hanogt:open-security-bot", onLegacy);
            window.removeEventListener("hanogt:toggle-ai", onToggle);
        };
    }, []);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent("hanogt:ai-state", { detail: { open } }));
    }, [open]);

    // The /ai page is the full-screen version of the same chat.
    const onAiPage = pathname === "/ai";

    return (
        <AnimatePresence>
            {open && !onAiPage ? <HanogtAIChat key="hanogt-ai-panel" variant="panel" onClose={() => setOpen(false)} launch={launch} /> : null}
        </AnimatePresence>
    );
}
