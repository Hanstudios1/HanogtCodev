"use client";

import { ArrowLeft, Code2, KeyRound, LoaderCircle, PlugZap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useRawSession } from "@/components/Provider";
import { useI18n, type Copy } from "@/lib/i18n";
import ApiDocs from "./ApiDocs";
import ApiKeysPanel from "./ApiKeysPanel";
import ConnectionsManager from "./ConnectionsManager";
import { useAiConnections } from "./connections-store";
import { cx } from "./ui";

const C = {
    back: { TR: "Hanogt AI'a dön", EN: "Back to Hanogt AI" },
    title: { TR: "API ve bağlantılar", EN: "API and connections" },
    subtitle: { TR: "Kendi sağlayıcı anahtarlarınla Hanogt AI'da başka modelleri kullan ya da Hanogt AI'ı kendi uygulamandan API ile çağır.", EN: "Use other models in Hanogt AI with your own provider keys, or call Hanogt AI from your own app through the API." },
    tabs: { TR: "Bölümler", EN: "Sections" },
    api: { TR: "Hanogt AI API", EN: "Hanogt AI API" },
    connections: { TR: "Kendi anahtarların", EN: "Your own keys" },
    connectionsHint: { TR: "OpenAI, Claude, Gemini ve diğer sağlayıcılardaki hesabını kendi API anahtarınla Hanogt AI'a bağla. Bu bağlantılarla gönderdiğin mesajlar Hanogt AI'ın mesaj hakkından düşmez; planının kendi anahtar sınırı geçerlidir.", EN: "Connect your OpenAI, Claude, Gemini or other provider account to Hanogt AI with your own API key. Messages sent through these connections don't use your Hanogt AI messages; your plan's own-key limit applies instead." },
    signIn: { TR: "API anahtarların ve bağlantıların için giriş yap.", EN: "Sign in to manage your API keys and connections." },
    signInButton: { TR: "Giriş yap", EN: "Sign in" },
    loading: { TR: "Yükleniyor…", EN: "Loading…" },
} satisfies Record<string, Copy>;

type Tab = "api" | "connections";
const TABS: ReadonlyArray<{ id: Tab; label: Copy; icon: typeof Code2 }> = [
    { id: "api", label: C.api, icon: Code2 },
    { id: "connections", label: C.connections, icon: PlugZap },
];

const subscribeHash = (onChange: () => void) => {
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
};
const tabFromHash = (): Tab => (window.location.hash === "#connections" ? "connections" : "api");

/** /ai/api: the developer API (keys, usage, docs) and the person's own provider connections, in two tabs (#api, #connections). */
export default function AiApiPage() {
    const { tx } = useI18n();
    const router = useRouter();
    const { data: session, status } = useRawSession();
    const email = status === "authenticated" ? session?.user?.email ?? null : null;
    const connections = useAiConnections(email);
    const tab = useSyncExternalStore(subscribeHash, tabFromHash, () => "api" as Tab);

    const choose = (next: Tab) => {
        // Replaces the address (no history entry per tab); hashchange isn't fired for that, so it is sent here.
        window.history.replaceState(null, "", `#${next}`);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
    };

    return (
        <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
            <Link href="/ai" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ai-muted hover:text-ai-ink"><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{tx(C.back)}</Link>
            <h1 className="mt-3 flex items-center gap-2 text-3xl font-black tracking-tight text-ai-ink"><KeyRound className="h-7 w-7 text-brand-green" aria-hidden />{tx(C.title)}</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-ai-muted">{tx(C.subtitle)}</p>

            {status === "unauthenticated" ? (
                <div className="mt-8 rounded-3xl border border-ai-line bg-ai-surface p-6 text-center">
                    <p className="text-[14px] text-ai-ink/75">{tx(C.signIn)}</p>
                    <Link href="/login?callbackUrl=%2Fai%2Fapi" className="mt-4 inline-flex items-center justify-center rounded-xl bg-ai-ink px-4 py-2 text-[13px] font-bold text-ai-paper hover:opacity-90">{tx(C.signInButton)}</Link>
                </div>
            ) : status === "loading" ? (
                <p className="mt-8 flex items-center gap-2 text-[14px] text-ai-muted" role="status"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(C.loading)}</p>
            ) : (
                <>
                    <div role="tablist" aria-label={tx(C.tabs)} className="mt-7 inline-flex rounded-2xl border border-ai-line bg-ai-paper p-1">
                        {TABS.map((entry) => {
                            const Icon = entry.icon;
                            const selected = entry.id === tab;
                            return (
                                <button
                                    key={entry.id}
                                    type="button"
                                    role="tab"
                                    id={`ai-api-tab-${entry.id}`}
                                    aria-selected={selected}
                                    aria-controls={`ai-api-panel-${entry.id}`}
                                    onClick={() => choose(entry.id)}
                                    data-ai-api-tab={entry.id}
                                    className={cx("inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13.5px] font-bold transition", selected ? "bg-white text-ai-ink shadow dark:bg-zinc-800" : "text-ai-muted hover:text-ai-ink")}
                                >
                                    <Icon className="h-4 w-4" aria-hidden />{tx(entry.label)}
                                </button>
                            );
                        })}
                    </div>
                    <div id={`ai-api-panel-${tab}`} role="tabpanel" aria-labelledby={`ai-api-tab-${tab}`} className="mt-5 space-y-6">
                        {tab === "api" ? (
                            <>
                                <ApiKeysPanel />
                                <ApiDocs />
                            </>
                        ) : (
                            <section className="rounded-3xl border border-ai-line bg-ai-surface p-5 shadow-sm sm:p-6">
                                <h2 className="flex items-center gap-2 text-[16px] font-black tracking-tight text-ai-ink"><PlugZap className="h-5 w-5 text-sky-500" aria-hidden />{tx(C.connections)}</h2>
                                <p className="mb-4 mt-1 text-[13px] leading-relaxed text-ai-muted">{tx(C.connectionsHint)}</p>
                                <ConnectionsManager connections={connections} onUse={() => router.push("/ai")} />
                            </section>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
