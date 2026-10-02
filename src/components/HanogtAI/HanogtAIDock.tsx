"use client";

import { AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { OpenAiOptions } from "@/lib/ai/context-store";
import type { ChatLaunch } from "./useHanogtChat";

// The chat (offline engine, knowledge base, agent tools) is a separate chunk:
// it loads when the panel first opens, or while the browser is idle.
const loadChat = () => import("./HanogtAIChat");
const HanogtAIChat = dynamic(loadChat, { ssr: false });

/**
 * Global Hanogt AI panel. Any page opens it with openHanogtAI() (the
 * "hanogt:open-ai" event); the old "hanogt:open-security-bot" event opens it in
 * security mode. It reports its state with "hanogt:ai-state" for the header.
 * The panel is the compact version of the /ai page and shares its conversations.
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

    // Warm the chat chunk once the page is idle so the first open is instant.
    useEffect(() => {
        const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 2_500));
        const cancel = window.cancelIdleCallback ?? window.clearTimeout;
        const handle = idle(() => void loadChat().catch(() => undefined));
        return () => cancel(handle);
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
