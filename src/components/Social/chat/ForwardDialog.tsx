"use client";

import { Forward, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { GroupRequestError, groupsApi, useGroupErrorText } from "@/components/Groups/api";
import { GroupTile, Modal, ModalHeader, Spinner, UserAvatar, cx } from "@/components/Groups/ui";
import type { GroupColor } from "@/lib/groups";
import { useI18n, type Copy } from "@/lib/i18n";
import { socialApi } from "@/lib/social/api";
import { foldForMatch } from "@/lib/social/composer";
import type { MessageGif } from "@/lib/social/gif";
import { previewText } from "@/lib/social/model";
import { useSocial } from "../context";

const C = {
    title: { TR: "Mesajı ilet", EN: "Forward message" },
    description: { TR: "Bir arkadaşına ya da grubuna gönder.", EN: "Send it to a friend or one of your groups." },
    search: { TR: "Kişi veya grup ara", EN: "Search people or groups" },
    friends: { TR: "Arkadaşlar", EN: "Friends" },
    groups: { TR: "Gruplar", EN: "Groups" },
    send: { TR: "Gönder", EN: "Send" },
    sent: { TR: "{name} hedefine iletildi.", EN: "Forwarded to {name}." },
    nothing: { TR: "Eşleşen kişi ya da grup yok.", EN: "No matching people or groups." },
    preview: { TR: "İletilecek mesaj", EN: "Message to forward" },
    gif: { TR: "GIF", EN: "GIF" },
} satisfies Record<string, Copy>;

export type ForwardPayload = { text: string; type: "text" | "gif" | "sticker"; gif: MessageGif | null; author: string };

type Destination = { key: string; kind: "dm" | "group"; id: string; name: string; avatar?: string | null; emoji?: string; color?: GroupColor };

/** Sends a copy of a message (marked "forwarded") to a friend or a group. */
export default function ForwardDialog({ payload, onClose }: { payload: ForwardPayload | null; onClose: () => void }) {
    const { tx } = useI18n();
    const social = useSocial();
    const [query, setQuery] = useState("");
    const [busy, setBusy] = useState("");
    const groupErrorText = useGroupErrorText();

    const destinations = useMemo<Destination[]>(() => [
        ...social.friends.list.map((friend) => ({ key: `dm:${friend.email}`, kind: "dm" as const, id: friend.email, name: friend.username, avatar: friend.avatarUrl })),
        ...social.groups.list.map((group) => ({ key: `group:${group.id}`, kind: "group" as const, id: group.id, name: group.name, emoji: group.emoji, color: group.color })),
    ], [social.friends.list, social.groups.list]);

    const wanted = foldForMatch(query.trim());
    const shown = wanted ? destinations.filter((entry) => foldForMatch(entry.name).includes(wanted)) : destinations;

    const send = async (destination: Destination) => {
        if (!payload || busy) return;
        setBusy(destination.key);
        try {
            if (destination.kind === "dm") {
                await socialApi.send(destination.id, { text: payload.text, type: payload.type, gif: payload.gif, forwarded: true });
            } else {
                await groupsApi.send({ groupId: destination.id, text: payload.text, type: payload.type === "gif" ? "gif" : "text", gif: payload.gif, forwarded: true });
            }
            social.notify(tx(C.sent, { name: destination.name }), "success");
            onClose();
        } catch (error) {
            social.notify(error instanceof GroupRequestError ? groupErrorText(error) : social.errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    const row = (destination: Destination) => (
        <li key={destination.key}>
            <div className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-white/5">
                {destination.kind === "dm"
                    ? <UserAvatar name={destination.name} src={destination.avatar} size="sm" />
                    : <GroupTile emoji={destination.emoji ?? "💬"} color={destination.color ?? "indigo"} size="xs" />}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{destination.name}</span>
                <button type="button" onClick={() => void send(destination)} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1 text-xs font-bold transition hover:border-indigo-500 hover:text-indigo-600 disabled:opacity-50 dark:border-white/10 dark:hover:text-indigo-300">
                    {busy === destination.key ? <Spinner className="h-3.5 w-3.5" /> : <Forward className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />}{tx(C.send)}
                </button>
            </div>
        </li>
    );

    const friends = shown.filter((entry) => entry.kind === "dm");
    const groups = shown.filter((entry) => entry.kind === "group");

    return (
        <Modal open={Boolean(payload)} onClose={onClose} labelledBy="forward-title" size="sm">
            <ModalHeader id="forward-title" title={tx(C.title)} description={tx(C.description)} onClose={onClose} />
            {payload && (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="mx-5 mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-950" aria-label={tx(C.preview)}>
                        <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{payload.author}</p>
                        <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-zinc-700 dark:text-zinc-200">{payload.type === "gif" ? `${tx(C.gif)}${payload.gif?.title ? ` · ${payload.gif.title}` : ""}` : previewText(payload.text, 300)}</p>
                    </div>
                    <label className="relative mx-5 mt-3 block">
                        <span className="sr-only">{tx(C.search)}</span>
                        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                        <input data-autofocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx(C.search)} className="w-full rounded-lg border border-zinc-200 bg-white py-2 pe-3 ps-8 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-zinc-950" />
                    </label>
                    <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:max-h-[50vh]">
                        {!shown.length && <p className="px-2 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{tx(C.nothing)}</p>}
                        {friends.length > 0 && <p className={cx("px-2 pb-1 pt-2 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400")}>{tx(C.friends)}</p>}
                        <ul>{friends.map(row)}</ul>
                        {groups.length > 0 && <p className="px-2 pb-1 pt-3 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.groups)}</p>}
                        <ul>{groups.map(row)}</ul>
                    </div>
                </div>
            )}
        </Modal>
    );
}
