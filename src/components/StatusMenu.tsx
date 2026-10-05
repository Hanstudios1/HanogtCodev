"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { PresenceMark } from "@/components/PresenceAvatar";
import { PROFILE_TEXT_LIMITS, sanitizeAccountPatch, type AccountProfilePatch, type AccountProfileResponse } from "@/lib/account-profile";
import { PROFILE_UPDATED_EVENT, applyOwnProfileResponse, useOwnProfile } from "@/lib/account-profile-client";
import { useI18n, type Copy } from "@/lib/i18n";
import { STATUS_PREFERENCES, STATUS_PREFERENCE_COPY, type PresenceStatus, type StatusPreference } from "@/lib/presence";

/** The mark each choice shows: invisible looks offline to others. */
export const PREFERENCE_MARKS: Record<StatusPreference, PresenceStatus> = { auto: "online", idle: "idle", dnd: "dnd", invisible: "offline" };

const C = {
    title: { TR: "Durum", EN: "Status" },
    custom: { TR: "Özel durum", EN: "Custom status" },
    customHint: { TR: "Profilinizde ve arkadaş listelerinde adınızın altında görünür.", EN: "Shown under your name on your profile and in friend lists." },
    placeholder: { TR: "Ne yapıyorsunuz?", EN: "What are you up to?" },
    left: { TR: "{count} karakter kaldı", EN: "{count} characters left" },
    save: { TR: "Kaydet", EN: "Save" },
    clear: { TR: "Temizle", EN: "Clear" },
    saved: { TR: "Durumunuz güncellendi.", EN: "Your status was updated." },
    cleared: { TR: "Özel durum temizlendi.", EN: "Custom status cleared." },
    failed: { TR: "Durum kaydedilemedi. Tekrar deneyin.", EN: "Couldn't save your status. Try again." },
    rateLimited: { TR: "Çok sık değiştirdiniz. Biraz sonra tekrar deneyin.", EN: "You changed it too often. Try again shortly." },
    signedOut: { TR: "Oturumunuz sona ermiş. Yeniden giriş yapın.", EN: "Your session has ended. Sign in again." },
    invalid: { TR: "Bu durum metni kullanılamıyor.", EN: "This status text can't be used." },
    offline: { TR: "Bağlantı kurulamadı.", EN: "Couldn't connect." },
} satisfies Record<string, Copy>;

type SaveResult = { ok: true; data: AccountProfileResponse } | { ok: false; status: number; code: string };

/** PATCH /api/account/profile; the server publishes the new status at once. */
export async function saveOwnProfile(patch: AccountProfilePatch): Promise<SaveResult> {
    try {
        const response = await fetch("/api/account/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(patch),
            credentials: "same-origin",
            cache: "no-store",
        });
        const payload = await response.json().catch(() => null) as (AccountProfileResponse & { code?: unknown }) | null;
        if (response.ok && payload?.fields) return { ok: true, data: payload };
        return { ok: false, status: response.status, code: typeof payload?.code === "string" ? payload.code : "unknown" };
    } catch {
        return { ok: false, status: 0, code: "network" };
    }
}

/** Stores a saved profile for every reader and tells other components (Account Settings, other tabs' listeners). */
export function announceOwnProfile(email: string, data: AccountProfileResponse) {
    applyOwnProfileResponse(email, data);
    const { fields } = data;
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, {
        detail: {
            username: fields.username,
            avatarUrl: fields.avatarUrl,
            nickname: fields.nickname,
            nicknameTag: fields.nicknameTag,
            customStatus: fields.customStatus,
            statusPreference: fields.statusPreference,
            showOnlineStatus: fields.showOnlineStatus,
            showLastSeen: fields.showLastSeen,
            presence: data.presence,
        },
    }));
}

/**
 * Status choices (Çevrimiçi, Boşta, Rahatsız Etmeyin, Görünmez) and the
 * custom status. Every change is saved at once. The header shows it in the
 * account menu; Account Settings shows it in its "Durum" section.
 */
export default function StatusMenu({ email, onSaved, className = "" }: {
    email: string;
    /** Called with the saved profile (Account Settings keeps its form in step). */
    onSaved?: (data: AccountProfileResponse) => void;
    className?: string;
}) {
    const { tx } = useI18n();
    const profile = useOwnProfile(email);
    const titleId = useId();
    const customId = useId();
    const hintId = useId();
    const [pending, setPending] = useState<StatusPreference | null>(null);
    const [savingCustom, setSavingCustom] = useState(false);
    const [draft, setDraft] = useState<string | null>(null);
    const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
    const current = pending ?? profile?.statusPreference ?? null;
    const text = draft ?? profile?.customStatus ?? "";
    const customChanged = draft !== null && draft.trim() !== (profile?.customStatus ?? "");

    const failure = (result: Extract<SaveResult, { ok: false }>) => {
        if (result.status === 429) return tx(C.rateLimited);
        if (result.status === 401) return tx(C.signedOut);
        if (result.status === 0) return tx(C.offline);
        if (result.code === "invalid_field") return tx(C.invalid);
        return tx(C.failed);
    };

    const save = async (patch: AccountProfilePatch, success: Copy) => {
        const checked = sanitizeAccountPatch(patch);
        if (!checked.ok) {
            setMessage({ tone: "error", text: tx(C.invalid) });
            return false;
        }
        setMessage(null);
        const result = await saveOwnProfile(checked.patch);
        if (!result.ok) {
            setMessage({ tone: "error", text: failure(result) });
            return false;
        }
        announceOwnProfile(email, result.data);
        onSaved?.(result.data);
        setMessage({ tone: "success", text: tx(success) });
        return true;
    };

    const choose = async (preference: StatusPreference) => {
        if (pending || preference === current) return;
        setPending(preference);
        await save({ statusPreference: preference }, C.saved);
        setPending(null);
    };

    const saveCustom = async (event?: FormEvent) => {
        event?.preventDefault();
        if (savingCustom) return;
        setSavingCustom(true);
        if (await save({ customStatus: text.trim() }, C.saved)) setDraft(null);
        setSavingCustom(false);
    };

    const clearCustom = async () => {
        if (savingCustom) return;
        setSavingCustom(true);
        if (await save({ customStatus: "" }, C.cleared)) setDraft(null);
        setSavingCustom(false);
    };

    // Menu keys: arrows and Home/End move between the choices; Enter or Space picks one.
    const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']"));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        let next = -1;
        if (event.key === "ArrowDown") next = (index + 1) % items.length;
        else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = items.length - 1;
        if (next === -1) return;
        event.preventDefault();
        items[next]?.focus();
    };

    const remaining = PROFILE_TEXT_LIMITS.customStatus - Array.from(text).length;
    const hasCustom = Boolean(profile?.customStatus);

    return (
        <div className={className}>
            <p id={titleId} className="px-1 pb-1.5 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.title)}</p>
            <div role="menu" aria-labelledby={titleId} onKeyDown={onMenuKey} className="space-y-0.5">
                {STATUS_PREFERENCES.map((preference) => {
                    const checked = current === preference;
                    return (
                        <button
                            key={preference}
                            type="button"
                            role="menuitemradio"
                            aria-checked={checked}
                            aria-disabled={pending !== null || undefined}
                            tabIndex={checked || (current === null && preference === "auto") ? 0 : -1}
                            onClick={() => void choose(preference)}
                            className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${checked ? "bg-indigo-50 dark:bg-indigo-500/10" : "hover:bg-zinc-100 dark:hover:bg-white/[0.06]"}`}
                        >
                            <span className="grid h-5 w-5 shrink-0 place-items-center">
                                <PresenceMark status={PREFERENCE_MARKS[preference]} className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[14px] font-semibold text-zinc-900 dark:text-white">{tx(STATUS_PREFERENCE_COPY[preference].label)}</span>
                                <span className="block text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(STATUS_PREFERENCE_COPY[preference].hint)}</span>
                            </span>
                            <span className="grid h-5 w-5 shrink-0 place-items-center" aria-hidden="true">
                                {pending === preference ? <LoaderCircle className="h-4 w-4 animate-spin text-indigo-500" /> : checked ? <Check className="h-4 w-4 text-indigo-600 dark:text-indigo-300" /> : null}
                            </span>
                        </button>
                    );
                })}
            </div>

            <form onSubmit={(event) => void saveCustom(event)} className="mt-3 border-t border-zinc-100 pt-3 dark:border-white/[0.08]">
                <label htmlFor={customId} className="block px-1 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.custom)}</label>
                <input
                    id={customId}
                    type="text"
                    value={text}
                    maxLength={PROFILE_TEXT_LIMITS.customStatus}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={tx(C.placeholder)}
                    aria-describedby={hintId}
                    className="mt-1.5 h-10 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-[14px] outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-zinc-950"
                />
                <p id={hintId} className="mt-2 px-1 text-[11.5px] text-zinc-500 dark:text-zinc-400">
                    {tx(C.customHint)} <span className="tabular-nums">{tx(C.left, { count: Math.max(0, remaining) })}</span>
                </p>
                <div className="mt-2.5 flex justify-end gap-2">
                    {hasCustom ? (
                        <button type="button" onClick={() => void clearCustom()} disabled={savingCustom} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
                            <X className="h-3.5 w-3.5" aria-hidden="true" />{tx(C.clear)}
                        </button>
                    ) : null}
                    <button type="submit" disabled={!customChanged || savingCustom} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-[13px] font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
                        {savingCustom ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}{tx(C.save)}
                    </button>
                </div>
            </form>

            {message ? (
                <p role={message.tone === "error" ? "alert" : "status"} className={`mt-2 rounded-xl px-3 py-2 text-[12.5px] ${message.tone === "error" ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
                    {message.text}
                </p>
            ) : null}
        </div>
    );
}
