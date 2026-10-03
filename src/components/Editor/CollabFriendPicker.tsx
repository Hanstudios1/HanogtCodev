"use client";

import { Check, LoaderCircle, RefreshCw, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import PresenceAvatar from "@/components/PresenceAvatar";
import { collabApi } from "@/lib/collab/api";
import type { CollabFriend, CollabPlanLimits } from "@/lib/collab/protocol";
import { useI18n, type Copy } from "@/lib/i18n";
import { PRESENCE_STATUS_COPY } from "@/lib/presence";

const C = {
    search: { TR: "Arkadaş ara", EN: "Search friends" },
    empty: { TR: "Henüz arkadaşın yok. Arkadaş ekleyince onları buradan davet edebilirsin.", EN: "You don't have friends yet. Once you add some, you can invite them here." },
    addFriends: { TR: "Arkadaş ekle", EN: "Add friends" },
    noMatch: { TR: "Eşleşen arkadaş yok.", EN: "No matching friends." },
    loading: { TR: "Arkadaşların yükleniyor…", EN: "Loading your friends…" },
    failed: { TR: "Arkadaş listesi yüklenemedi.", EN: "Couldn't load your friends." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    selected: { TR: "{count} kişi seçildi", EN: "{count} selected" },
    limit: { TR: "En fazla {count} kişi davet edebilirsin.", EN: "You can invite up to {count} people." },
    friends: { TR: "Arkadaşların", EN: "Your friends" },
} satisfies Record<string, Copy>;

/** The signed-in user's friends with presence (GET /api/collab?view=friends), loaded while `open`. */
export function useCollabFriends(open: boolean) {
    const [friends, setFriends] = useState<CollabFriend[] | null>(null);
    const [limits, setLimits] = useState<CollabPlanLimits | null>(null);
    const [failed, setFailed] = useState(false);
    const [version, setVersion] = useState(0);
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        collabApi.friends()
            .then((result) => {
                if (cancelled) return;
                setFriends(Array.isArray(result.friends) ? result.friends : []);
                setLimits(result.limits && typeof result.limits.people === "number" ? result.limits : null);
                setFailed(false);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [open, version]);
    const retry = useCallback(() => {
        setFailed(false);
        setVersion((value) => value + 1);
    }, []);
    return { friends, limits, failed: failed && friends === null, retry };
}

/**
 * Friends with their presence (online, idle, do not disturb, offline) and a
 * check box each. People in `unavailable` (already invited, in the session)
 * show a note instead of the box.
 */
export default function CollabFriendPicker({ friends, failed, onRetry, selected, onToggle, unavailable, max }: {
    friends: CollabFriend[] | null;
    failed: boolean;
    onRetry: () => void;
    selected: ReadonlySet<string>;
    onToggle: (email: string) => void;
    unavailable?: ReadonlyMap<string, Copy>;
    max: number;
}) {
    const { tx, locale } = useI18n();
    const [query, setQuery] = useState("");
    const searchId = useId();
    const listId = useId();
    const visible = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase(locale);
        return (friends ?? []).filter((friend) => !needle || friend.name.toLocaleLowerCase(locale).includes(needle));
    }, [friends, locale, query]);

    if (friends === null) {
        return failed ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400" role="alert">
                <p>{tx(C.failed)}</p>
                <button type="button" onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10">
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />{tx(C.retry)}
                </button>
            </div>
        ) : (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-500" role="status">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(C.loading)}
            </p>
        );
    }

    if (!friends.length) {
        return (
            <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                <p>{tx(C.empty)}</p>
                <Link href="/friends" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
                    <UserPlus className="h-3.5 w-3.5" aria-hidden />{tx(C.addFriends)}
                </Link>
            </div>
        );
    }

    const full = selected.size >= max;
    return (
        <div className="space-y-2">
            {friends.length > 5 && (
                <div className="relative">
                    <label htmlFor={searchId} className="sr-only">{tx(C.search)}</label>
                    <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                    <input
                        id={searchId}
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={tx(C.search)}
                        aria-controls={listId}
                        className="w-full rounded-xl border border-zinc-200 bg-white py-2 pe-3 ps-9 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                    />
                </div>
            )}
            <ul id={listId} aria-label={tx(C.friends)} className="max-h-60 space-y-1 overflow-y-auto pe-1 [scrollbar-width:thin]">
                {visible.map((friend) => {
                    const note = unavailable?.get(friend.email);
                    const checked = selected.has(friend.email);
                    const disabled = Boolean(note) || (!checked && full);
                    return (
                        <li key={friend.email}>
                            <label className={`flex items-center gap-3 rounded-xl px-2.5 py-2 transition ${disabled && !note ? "cursor-not-allowed opacity-60" : note ? "" : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.06]"} ${checked ? "bg-indigo-500/[0.08] ring-1 ring-indigo-500/30" : ""}`}>
                                <PresenceAvatar src={friend.avatar} name={friend.name} status={friend.status} size="sm" ring="bg-white dark:bg-zinc-900" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100" dir="auto">{friend.name}</span>
                                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">{note ? tx(note) : tx(PRESENCE_STATUS_COPY[friend.status])}</span>
                                </span>
                                {!note && (
                                    <>
                                        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={() => onToggle(friend.email)} />
                                        <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 ${checked ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-300 bg-white dark:border-white/20 dark:bg-zinc-950"}`}>
                                            {checked && <Check className="h-3.5 w-3.5" />}
                                        </span>
                                    </>
                                )}
                            </label>
                        </li>
                    );
                })}
                {!visible.length && <li className="px-3 py-4 text-center text-sm text-zinc-500">{tx(C.noMatch)}</li>}
            </ul>
            <p className="text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
                {selected.size ? tx(C.selected, { count: selected.size }) : null}
                {full ? <span className="ms-1">{tx(C.limit, { count: max })}</span> : null}
            </p>
        </div>
    );
}
