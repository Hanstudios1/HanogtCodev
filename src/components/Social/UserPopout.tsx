"use client";

import { MessageCircle, Pencil, Phone, UserPlus, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Spinner, cx } from "@/components/Groups/ui";
import PlanBadge from "@/components/PlanBadge";
import PresenceAvatar from "@/components/PresenceAvatar";
import StaffBadge from "@/components/StaffBadge";
import type { PlanBadge as PlanBadgeId } from "@/lib/plan-badge";
import { useVoiceCall } from "@/components/VoiceCallProvider";
import { useI18n, type Copy } from "@/lib/i18n";
import { PRESENCE_STATUS_COPY, type PresenceStatus } from "@/lib/presence";
import { socialApi } from "@/lib/social/api";
import { dmHref, formatFriendTag, type SocialProfileResponse, type StaffRoleBadge } from "@/lib/social/model";
import { useSocial } from "./context";
import { loadSocialProfile } from "./profile";

const C = {
    card: { TR: "{name} profil kartı", EN: "{name}'s profile card" },
    about: { TR: "Hakkında", EN: "About me" },
    message: { TR: "Mesaj gönder", EN: "Message" },
    call: { TR: "Ara", EN: "Call" },
    callBusy: { TR: "Başka bir aramadasın", EN: "You're in another call" },
    profile: { TR: "Profili görüntüle", EN: "View full profile" },
    editProfile: { TR: "Profili düzenle", EN: "Edit profile" },
    addFriend: { TR: "Arkadaş ekle", EN: "Add friend" },
    requestSent: { TR: "{name} kişisine arkadaşlık isteği gönderildi.", EN: "Friend request sent to {name}." },
    nowFriends: { TR: "{name} ile artık arkadaşsınız!", EN: "You and {name} are friends now!" },
    noTag: { TR: "Bu kişinin takma adı yok; arkadaş eklemek için takma adını ve etiketini sor.", EN: "This person has no nickname; ask for their nickname and tag to add them." },
    blocked: { TR: "Bu kişiyi engelledin.", EN: "You blocked this person." },
    mutual: { TR: "{count} ortak grup", EN: "{count} mutual groups" },
} satisfies Record<string, Copy>;

/** What the place that opens the card already knows (a group member, a message author…). */
export type PopoutPerson = {
    email: string;
    username: string;
    avatarUrl: string | null;
    /** Presence; null shows none (people the user isn't connected to). */
    status?: PresenceStatus | null;
    nickname?: string;
    nicknameTag?: string;
    staffRole?: StaffRoleBadge | null;
    planBadge?: PlanBadgeId | null;
    customStatus?: string;
    statusEmoji?: string;
};

export type PopoutAnchor = { top: number; left: number; right: number; bottom: number };

/** An open card: who, and the element that opened it (clicking it again closes the card). */
export type PopoutState = { person: PopoutPerson; anchor: PopoutAnchor; trigger: HTMLElement };

/** Toggles the card for `person` from the clicked element. */
export function nextPopout(current: PopoutState | null, person: PopoutPerson, trigger: HTMLElement): PopoutState | null {
    if (current && current.trigger === trigger) return null;
    const rect = trigger.getBoundingClientRect();
    return { person, trigger, anchor: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom } };
}

const CARD_WIDTH = 300;
const GAP = 8;

function safeAccent(value: string) {
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : /^#[0-9a-fA-F]{3}$/.test(value) ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : "#5865f2";
}

/**
 * Discord's user popout: clicking an avatar or a name opens a small profile
 * card next to it (a sheet at the bottom on phones) with the banner, status,
 * "About me" and the main actions: message, call, add friend, full profile.
 * `badges` and `footer` let a group add the member's role and management.
 */
export default function UserPopout({ popout, onClose, onViewProfile, badges, footer }: {
    popout: PopoutState;
    onClose: () => void;
    /** "View full profile" (the opener shows ProfileModal, so it outlives the card). */
    onViewProfile: (email: string) => void;
    badges?: ReactNode;
    footer?: ReactNode;
}) {
    const { tx } = useI18n();
    const router = useRouter();
    const social = useSocial();
    const call = useVoiceCall();
    const { person, anchor, trigger } = popout;
    const cardRef = useRef<HTMLDivElement | null>(null);
    const self = person.email === social.me.email;
    const [profile, setProfile] = useState<SocialProfileResponse | null>(null);
    const [loading, setLoading] = useState(!self);
    const [busy, setBusy] = useState(false);
    const friend = social.isFriend(person.email);
    const blocked = social.isBlocked(person.email);
    const known = self ? { ...social.me, staffRole: null, planBadge: null, lastSeenAt: null } : social.person(person.email);

    useEffect(() => {
        if (self) return;
        let active = true;
        loadSocialProfile(person.email)
            .then((data) => { if (active) setProfile(data); })
            .catch(() => undefined)
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [person.email, self]);

    // Placed next to the anchor and kept inside the window (a bottom sheet on narrow screens).
    useLayoutEffect(() => {
        const card = cardRef.current;
        if (!card) return;
        const width = window.innerWidth;
        const height = window.innerHeight;
        if (width < 640) {
            card.style.left = `${GAP}px`;
            card.style.right = `${GAP}px`;
            card.style.bottom = `${GAP}px`;
            card.style.top = "auto";
            card.style.width = "auto";
            return;
        }
        const fitsRight = anchor.right + GAP + CARD_WIDTH <= width - GAP;
        const left = fitsRight ? anchor.right + GAP : Math.max(GAP, anchor.left - GAP - CARD_WIDTH);
        const top = Math.max(GAP, Math.min(anchor.top, height - GAP - card.offsetHeight));
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
    });

    // Focus moves into the card and back to whatever opened it.
    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        cardRef.current?.focus();
        return () => previous?.focus?.();
    }, []);

    useEffect(() => {
        const onPointer = (event: PointerEvent) => {
            if (!(event.target instanceof Node) || cardRef.current?.contains(event.target)) return;
            // The element that opened the card toggles it itself.
            if (trigger.contains(event.target)) return;
            onClose();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            onClose();
        };
        document.addEventListener("pointerdown", onPointer, true);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointer, true);
            document.removeEventListener("keydown", onKey);
        };
    }, [onClose, trigger]);

    const full = profile?.person;
    const username = known?.username || full?.username || person.username;
    const avatarUrl = known?.avatarUrl ?? full?.avatarUrl ?? person.avatarUrl;
    const nickname = person.nickname || known?.nickname || full?.nickname || "";
    const nicknameTag = person.nicknameTag || known?.nicknameTag || full?.nicknameTag || "";
    const tag = formatFriendTag(nickname, nicknameTag);
    const staffRole = person.staffRole ?? full?.staffRole ?? null;
    const planBadge = person.planBadge ?? known?.planBadge ?? full?.planBadge ?? null;
    const customStatus = known?.customStatus ?? full?.customStatus ?? person.customStatus ?? "";
    const statusEmoji = known?.statusEmoji ?? full?.statusEmoji ?? person.statusEmoji ?? "";
    // Presence only for people whose status the user may see (friends, the same group).
    const status: PresenceStatus | null = self ? social.me.status : person.status !== undefined ? person.status : friend ? known?.status ?? null : null;
    const accent = safeAccent(full?.accentColor || "");
    const banner = full?.bannerUrl && /^https:\/\/[^\s"'()<>\\]+$/.test(full.bannerUrl) ? full.bannerUrl : "";
    const inCall = call.status !== "idle";

    const go = (href: string) => {
        onClose();
        router.push(href);
    };

    const addFriend = async () => {
        if (!tag) {
            social.notify(tx(C.noTag), "info");
            return;
        }
        setBusy(true);
        try {
            const result = await socialApi.friendAction({ action: "request", tag });
            social.notify(tx(result.accepted ? C.nowFriends : C.requestSent, { name: username }), "success");
            await social.friends.refresh();
        } catch (error) {
            social.notify(social.errorText(error), "error");
        } finally {
            setBusy(false);
        }
    };

    const card = (
        <div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label={tx(C.card, { name: username })}
            tabIndex={-1}
            style={{ width: CARD_WIDTH }}
            className="fixed z-[120] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl outline-none dark:border-black/40 dark:bg-zinc-900 dark:text-zinc-100"
        >
            <div className="h-[60px]" style={{ background: banner ? `url("${banner}") center/cover no-repeat` : `linear-gradient(135deg, ${accent}, ${accent}99)` }} aria-hidden />
            <div className="-mt-9 px-4">
                <PresenceAvatar src={avatarUrl} name={username} status={status} size="lg" ring="bg-white dark:bg-zinc-900" className="rounded-full ring-[5px] ring-white dark:ring-zinc-900" />
            </div>
            <div className="px-4 pb-4 pt-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <h2 className="min-w-0 break-words text-lg font-black leading-6">{username}</h2>
                    <StaffBadge role={staffRole} size="sm" />
                    <PlanBadge plan={planBadge} size="sm" />
                    {badges}
                </div>
                {tag && <p className="font-mono text-[13px] text-zinc-500 dark:text-zinc-400">{tag}</p>}
                {status && !customStatus && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{tx(PRESENCE_STATUS_COPY[status])}</p>}
                {customStatus && <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-200">{statusEmoji ? `${statusEmoji} ` : ""}{customStatus}</p>}
                {!self && (full?.bio || loading) && (
                    <section className="mt-3 rounded-lg bg-zinc-100 p-2.5 dark:bg-black/30">
                        <h3 className="text-[11px] font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{tx(C.about)}</h3>
                        {loading && !full ? <span className="mt-1.5 flex"><Spinner className="h-4 w-4 text-indigo-500" /></span> : <p className="mt-1 line-clamp-6 whitespace-pre-line break-words text-sm text-zinc-700 dark:text-zinc-200">{full?.bio}</p>}
                    </section>
                )}
                {!self && profile && profile.mutualGroups.length > 0 && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.mutual, { count: profile.mutualGroups.length })}</p>}
                {blocked && <p className="mt-3 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{tx(C.blocked)}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                    {self ? (
                        <Link href="/account-settings" onClick={onClose} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-300 dark:bg-white/10 dark:hover:bg-white/15"><Pencil className="h-4 w-4" aria-hidden />{tx(C.editProfile)}</Link>
                    ) : friend && !blocked ? (
                        <>
                            <button type="button" onClick={() => go(dmHref(person.email))} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-indigo-500"><MessageCircle className="h-4 w-4" aria-hidden />{tx(C.message)}</button>
                            <button
                                type="button"
                                disabled={inCall}
                                onClick={() => {
                                    onClose();
                                    void call.startCall({ email: person.email, username, avatarUrl: avatarUrl ?? undefined, staffRole });
                                }}
                                title={inCall ? tx(C.callBusy) : tx(C.call)}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                            >
                                <Phone className="h-4 w-4" aria-hidden />{tx(C.call)}
                            </button>
                        </>
                    ) : !blocked ? (
                        <button type="button" disabled={busy} onClick={() => void addFriend()} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50">{busy ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" aria-hidden />}{tx(C.addFriend)}</button>
                    ) : null}
                    {!self && (
                        <button type="button" onClick={() => { onClose(); onViewProfile(person.email); }} className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-300 dark:bg-white/10 dark:hover:bg-white/15", blocked && "flex-1")} aria-label={tx(C.profile)} title={tx(C.profile)}>
                            <UserRound className="h-4 w-4" aria-hidden />{blocked && tx(C.profile)}
                        </button>
                    )}
                </div>
                {footer}
            </div>
        </div>
    );

    return createPortal(card, document.body);
}
