"use client";

import { ArrowRight, KeyRound, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n, type Copy } from "@/lib/i18n";
import ConnectionsManager from "./ConnectionsManager";
import type { AiConnectionsHandle } from "./connections-store";
import { ICON_BUTTON } from "./ui";

const C = {
    title: { TR: "Yapay zekâ bağlantıları", EN: "AI connections" },
    intro: { TR: "OpenAI, Claude, Gemini ve diğer sağlayıcılardaki hesabını kendi API anahtarınla Hanogt AI'a bağla. Bu bağlantılarla gönderdiğin mesajlar Hanogt AI'ın mesaj hakkından düşmez; planının kendi anahtar sınırı geçerlidir.", EN: "Connect your OpenAI, Claude, Gemini or other provider account to Hanogt AI with your own API key. Messages sent through these connections don't use your Hanogt AI messages; your plan's own-key limit applies instead." },
    close: { TR: "Kapat", EN: "Close" },
    page: { TR: "API ve bağlantılar sayfası", EN: "The API and connections page" },
} satisfies Record<string, Copy>;

/**
 * The chat's dialog for the person's own AI provider connections
 * (ConnectionsManager in a portal, so it covers the page even from the
 * floating panel). /ai/api shows the same manager on a page.
 */
export default function ConnectionsDialog({ connections, onClose, onNavigate }: {
    connections: AiConnectionsHandle;
    onClose: () => void;
    /** Leaving the page through a link (e.g. to /plans). */
    onNavigate?: () => void;
}) {
    const { tx } = useI18n();
    const titleId = useId();
    const closeRef = useRef<HTMLButtonElement>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        closeRef.current?.focus();
    }, []);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !busy) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [busy, onClose]);

    if (typeof document === "undefined") return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[160] grid place-items-center bg-black/50 p-3 backdrop-blur-sm sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !busy) onClose();
            }}
        >
            <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100">
                <header className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-white/[0.06]">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300" aria-hidden>
                        <KeyRound className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="text-[17px] font-black tracking-tight">{tx(C.title)}</h2>
                        <p className="mt-0.5 text-[12.5px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(C.intro)}</p>
                    </div>
                    <button ref={closeRef} type="button" onClick={onClose} disabled={busy} className={ICON_BUTTON} aria-label={tx(C.close)} title={tx(C.close)}>
                        <X className="h-5 w-5" />
                    </button>
                </header>
                <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <ConnectionsManager
                        connections={connections}
                        onUse={onClose}
                        onNavigate={() => {
                            onClose();
                            onNavigate?.();
                        }}
                        onBusyChange={setBusy}
                    />
                    <Link
                        href="/ai/api#connections"
                        onClick={() => {
                            onClose();
                            onNavigate?.();
                        }}
                        className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-violet-600 hover:underline dark:text-violet-300"
                        data-connections-page-link
                    >
                        {tx(C.page)}<ArrowRight className="h-3 w-3 rtl:rotate-180" aria-hidden />
                    </Link>
                </div>
            </div>
        </div>,
        document.body,
    );
}
