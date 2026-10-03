"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";
import { GroupTile, Spinner, relativeTime } from "@/components/Groups/ui";
import PlanBadge from "@/components/PlanBadge";
import PresenceAvatar from "@/components/PresenceAvatar";
import StaffBadge from "@/components/StaffBadge";
import { useI18n, type Copy } from "@/lib/i18n";
import { groupColor } from "@/lib/groups";
import { LAST_SEEN_COPY, PRESENCE_STATUS_COPY, presenceTime } from "@/lib/presence";
import { formatFriendTag, groupHref, type SocialPerson, type SocialProfileResponse } from "@/lib/social/model";

const C = {
    about: { TR: "Hakkında", EN: "About me" },
    noBio: { TR: "Henüz bir şey yazılmamış.", EN: "Nothing here yet." },
    mutual: { TR: "Ortak gruplar — {count}", EN: "Mutual groups — {count}" },
    noMutual: { TR: "Ortak grubunuz yok.", EN: "You have no groups in common." },
    view: { TR: "Profili görüntüle", EN: "View full profile" },
    loading: { TR: "Profil yükleniyor", EN: "Loading the profile" },
} satisfies Record<string, Copy>;

function safeAccent(value: string) {
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : /^#[0-9a-fA-F]{3}$/.test(value) ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : "#6366f1";
}

/** Right column of a conversation: the other person's profile card (Discord's user profile panel). */
export default function DmProfileAside({ person, isFriend, profile, loading, now, onViewProfile }: {
    person: SocialPerson;
    isFriend: boolean;
    profile: SocialProfileResponse | null;
    loading: boolean;
    now: number;
    onViewProfile: () => void;
}) {
    const { tx, locale } = useI18n();
    const full = profile?.person;
    const accent = safeAccent(full?.accentColor || "");
    const banner = full?.bannerUrl && /^https:\/\/[^\s"'()<>\\]+$/.test(full.bannerUrl) ? full.bannerUrl : "";
    const tag = formatFriendTag(person.nickname, person.nicknameTag);
    const seen = person.status === "offline" ? presenceTime(person.lastSeenAt) : 0;

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="h-24 shrink-0" style={{ background: banner ? `url("${banner}") center/cover no-repeat` : `linear-gradient(135deg, ${accent}, ${accent}66)` }} aria-hidden />
            <div className="-mt-11 px-4">
                <PresenceAvatar src={person.avatarUrl} name={person.username} status={isFriend ? person.status : null} size="xl" ring="bg-zinc-50 dark:bg-zinc-950" className="rounded-full ring-[6px] ring-zinc-50 dark:ring-zinc-950" />
            </div>
            <div className="space-y-3 px-4 pb-6 pt-2">
                <div>
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h2 className="min-w-0 break-words text-xl font-black text-zinc-900 dark:text-white">{person.username}</h2>
                        <StaffBadge role={person.staffRole} size="sm" />
                        <PlanBadge plan={person.planBadge} size="sm" />
                    </div>
                    {tag && <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400">{tag}</p>}
                    {isFriend && (
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {tx(PRESENCE_STATUS_COPY[person.status])}
                            {seen ? <> · {tx(LAST_SEEN_COPY, { time: relativeTime(seen, now, locale) })}</> : null}
                        </p>
                    )}
                    {person.customStatus && <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">{person.statusEmoji} {person.customStatus}</p>}
                </div>
                <section className="rounded-xl bg-white p-3 dark:bg-zinc-900" aria-label={tx(C.about)}>
                    <h3 className="text-[11px] font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{tx(C.about)}</h3>
                    {loading && !full ? (
                        <span className="mt-2 flex" aria-label={tx(C.loading)}><Spinner className="h-4 w-4 text-indigo-500" /></span>
                    ) : (
                        <p className="mt-1.5 whitespace-pre-line break-words text-sm text-zinc-700 dark:text-zinc-200">{full?.bio || tx(C.noBio)}</p>
                    )}
                </section>
                <section className="rounded-xl bg-white p-3 dark:bg-zinc-900" aria-labelledby="dm-mutual-title">
                    <h3 id="dm-mutual-title" className="text-[11px] font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{tx(C.mutual, { count: profile?.mutualGroups.length ?? 0 })}</h3>
                    {profile && profile.mutualGroups.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                            {profile.mutualGroups.map((group) => (
                                <li key={group.id}>
                                    <Link href={groupHref(group.id)} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]">
                                        <GroupTile emoji={group.emoji} color={groupColor(group.color)} size="xs" />
                                        <span className="truncate">{group.name}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{loading && !profile ? "…" : tx(C.noMutual)}</p>
                    )}
                </section>
                <button type="button" onClick={onViewProfile} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-300 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
                    <UserRound className="h-4 w-4" aria-hidden />{tx(C.view)}
                </button>
            </div>
        </div>
    );
}
