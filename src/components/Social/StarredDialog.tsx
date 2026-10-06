"use client";

import { AtSign, Hash, Star, StarOff } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Modal, ModalHeader, Spinner, fullDateTime } from "@/components/Groups/ui";
import { useI18n, type Copy } from "@/lib/i18n";
import { PLAN_STAR_LIMITS } from "@/lib/plans";
import type { StarredMessage } from "@/lib/social/stars";
import { useSocial } from "./context";

const C = {
    title: { TR: "Yıldızlı mesajlar", EN: "Starred messages" },
    description: { TR: "Yıldızladığın mesajlar yalnızca sana görünür ({count}/{max}; Ücretsiz {free}, Plus {plus}, Pro {pro}).", EN: "Only you can see the messages you star ({count}/{max}; Free {free}, Plus {plus}, Pro {pro})." },
    empty: { TR: "Henüz yıldızlı mesajın yok. Bir mesajın üzerine gelip ☆ simgesine bas.", EN: "No starred messages yet. Hover a message and press ☆." },
    open: { TR: "Mesaja git", EN: "Go to message" },
    remove: { TR: "Yıldızı kaldır", EN: "Unstar" },
    dm: { TR: "Direkt mesaj", EN: "Direct message" },
    group: { TR: "Grup", EN: "Group" },
    starredAt: { TR: "Yıldızlandı: {time}", EN: "Starred: {time}" },
} satisfies Record<string, Copy>;

/** Where a star leads: the conversation, asked to show that message. */
export function starHref(star: Pick<StarredMessage, "href" | "messageId">) {
    return `${star.href}${star.href.includes("?") ? "&" : "?"}message=${encodeURIComponent(star.messageId)}`;
}

export default function StarredDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { tx, locale } = useI18n();
    const { stars, groups } = useSocial();
    const refresh = stars.refresh;

    useEffect(() => {
        if (open) void refresh();
    }, [open, refresh]);

    const groupName = (id: string) => groups.list.find((group) => group.id === id)?.name ?? tx(C.group);

    return (
        <Modal open={open} onClose={onClose} labelledBy="starred-title" size="md">
            <ModalHeader id="starred-title" title={tx(C.title)} description={tx(C.description, { count: stars.list.length, max: stars.limit, free: PLAN_STAR_LIMITS.free, plus: PLAN_STAR_LIMITS.plus, pro: PLAN_STAR_LIMITS.pro })} icon={<Star className="mt-1 h-5 w-5 fill-amber-400 text-amber-500" aria-hidden />} onClose={onClose} />
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:max-h-[65dvh]">
                {!stars.loaded ? (
                    <div className="flex justify-center py-10"><Spinner className="h-6 w-6 text-indigo-500" /></div>
                ) : !stars.list.length ? (
                    <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">{tx(C.empty)}</p>
                ) : (
                    <ul className="space-y-2">
                        {stars.list.map((star) => {
                            const time = star.starredAt ? fullDateTime(Date.parse(star.starredAt), locale) : "";
                            return (
                                <li key={star.id} className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
                                    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                                        {star.scope === "dm" ? <AtSign className="h-3.5 w-3.5" aria-hidden /> : <Hash className="h-3.5 w-3.5" aria-hidden />}
                                        <span className="truncate font-semibold">{star.scope === "dm" ? tx(C.dm) : groupName(star.target)}</span>
                                        <span aria-hidden>·</span>
                                        <span className="truncate font-bold text-zinc-700 dark:text-zinc-200">{star.author}</span>
                                    </div>
                                    <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-100">{star.excerpt}</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        {time && <span className="me-auto text-[11px] text-zinc-400">{tx(C.starredAt, { time })}</span>}
                                        <Link href={starHref(star)} onClick={onClose} className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300">{tx(C.open)}</Link>
                                        <button type="button" onClick={() => void stars.toggle(star.scope, star.target, star.messageId)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><StarOff className="h-3.5 w-3.5" aria-hidden />{tx(C.remove)}</button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </Modal>
    );
}
