"use client";

import { LoaderCircle, UsersRound } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import { COLLAB_COPY } from "@/lib/collab/copy";
import { collabColor, type CollabMeta } from "@/lib/collab/protocol";
import type { CollabPeer, CollabPhase } from "@/lib/collab/session-client";
import { useCollabValue, type EditorCollab } from "@/lib/collab/use-editor-collab";
import { useI18n, type Copy } from "@/lib/i18n";

const C = {
    people: { TR: "{count} kişi", EN: "{count} people" },
    reconnecting: { TR: "Yeniden bağlanıyor", EN: "Reconnecting" },
} satisfies Record<string, Copy>;

const NO_PEERS: CollabPeer[] = [];

/**
 * The toolbar button "Ekiple düzenle". During a session it shows the people
 * in it (avatars ringed with their cursor colour) and opens the team panel.
 */
export default function CollabButton({ collab, onStart, onOpenPanel, hidden = false }: {
    collab: EditorCollab;
    onStart: () => void;
    onOpenPanel: () => void;
    hidden?: boolean;
}) {
    const { tx } = useI18n();
    const session = collab.session;
    const meta: CollabMeta | null = useCollabValue(session, (state) => state.meta, null);
    const peers = useCollabValue(session, (state) => state.peers, NO_PEERS);
    const phase: CollabPhase = useCollabValue(session, (state) => state.phase, "closed");
    const myKey = useCollabValue(session, (state) => state.me?.key ?? "", "");
    if (hidden) return null;

    const base = "inline-flex h-9 items-center gap-1.5 rounded-xl border px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
    if (!session) {
        return (
            <button
                type="button"
                onClick={onStart}
                disabled={collab.busy !== null}
                title={tx(COLLAB_COPY.buttonHint)}
                aria-label={tx(COLLAB_COPY.button)}
                className={`${base} border-zinc-200 text-zinc-600 hover:border-indigo-500/40 hover:text-zinc-900 disabled:opacity-60 dark:border-white/10 dark:text-zinc-300 dark:hover:text-white`}
            >
                {collab.busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <UsersRound className="h-4 w-4" aria-hidden />}
                <span className="hidden xl:inline">{tx(COLLAB_COPY.button)}</span>
            </button>
        );
    }

    const online = new Set(peers.filter((peer) => !peer.away).map((peer) => peer.key));
    const people = meta?.participants ?? [];
    const connecting = phase === "connecting" || phase === "reconnecting";
    const label = `${tx(COLLAB_COPY.buttonLive)} · ${tx(C.people, { count: people.length || 1 })}${phase === "reconnecting" ? ` · ${tx(C.reconnecting)}` : ""}`;
    return (
        <button
            type="button"
            onClick={onOpenPanel}
            title={`${label} — ${tx(COLLAB_COPY.openPanel)}`}
            aria-label={`${label}. ${tx(COLLAB_COPY.openPanel)}`}
            className={`${base} border-emerald-500/40 bg-emerald-500/[0.07] text-emerald-800 hover:bg-emerald-500/[0.12] dark:text-emerald-200`}
        >
            {connecting ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
                <span className="relative flex h-2 w-2" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
            )}
            <span className="hidden sm:flex -space-x-1.5 rtl:space-x-reverse" aria-hidden>
                {people.slice(0, 3).map((person) => (
                    <span
                        key={person.key}
                        className={`grid h-6 w-6 place-items-center overflow-hidden rounded-full border-2 bg-zinc-200 text-[10px] font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100 ${online.has(person.key) || person.key === myKey ? "" : "opacity-50"}`}
                        style={{ borderColor: collabColor(person.color) }}
                    >
                        {person.avatar
                            ? <OptimizedImage src={person.avatar} alt="" width={24} height={24} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            : (Array.from(person.name)[0] ?? "?").toUpperCase()}
                    </span>
                ))}
            </span>
            <span className="hidden lg:inline">{tx(COLLAB_COPY.live)}</span>
        </button>
    );
}
