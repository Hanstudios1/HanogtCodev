"use client";

import { Crosshair, Crown, Link2, LoaderCircle, Lock, LockOpen, LogOut, MicOff, Power, Radio, UserPlus, UserX, Wifi, WifiOff, X } from "lucide-react";
import { useMemo, useState } from "react";
import CollabChat from "@/components/Editor/CollabChat";
import CollabFriendPicker, { useCollabFriends } from "@/components/Editor/CollabFriendPicker";
import CollabVoice from "@/components/Editor/CollabVoice";
import { buttonClasses, useConfirm } from "@/components/Editor/Modal";
import PresenceAvatar from "@/components/PresenceAvatar";
import { collabErrorCode } from "@/lib/collab/api";
import { COLLAB_COPY, COLLAB_ERROR_COPY } from "@/lib/collab/copy";
import { IDLE_CALL, SELF_PEER } from "@/lib/collab/mesh-call";
import { collabColor, type CollabErrorCode, type CollabInvitee, type CollabMeta } from "@/lib/collab/protocol";
import type { CollabFileView, CollabPeer, CollabSession } from "@/lib/collab/session-client";
import { useCollabValue } from "@/lib/collab/use-editor-collab";
import { useI18n, type Copy } from "@/lib/i18n";
import type { PresenceStatus } from "@/lib/presence";

const C = {
    panel: { TR: "Canlı oturum", EN: "Live session" },
    people: { TR: "Katılımcılar ({count}/{max})", EN: "Participants ({count}/{max})" },
    peopleList: { TR: "Katılımcılar", EN: "Participants" },
    editing: { TR: "{file} düzenliyor", EN: "editing {file}" },
    viewing: { TR: "{file} dosyasında", EN: "in {file}" },
    away: { TR: "Sekme arka planda", EN: "Tab in the background" },
    notConnected: { TR: "Bağlı değil", EN: "Not connected" },
    follow: { TR: "{name} adlı kişiyi takip et", EN: "Follow {name}" },
    unfollow: { TR: "Takibi bırak", EN: "Stop following" },
    following: { TR: "Takip ediliyor", EN: "Following" },
    remove: { TR: "{name} adlı kişiyi oturumdan çıkar", EN: "Remove {name} from the session" },
    removeTitle: { TR: "Oturumdan çıkarılsın mı?", EN: "Remove from the session?" },
    removeMessage: { TR: "{name} oturumdan çıkarılacak ve yeniden davet etmedikçe katılamayacak.", EN: "{name} will be removed and can't join again unless you invite them." },
    removeConfirm: { TR: "Çıkar", EN: "Remove" },
    pending: { TR: "Bekleyen davetler", EN: "Pending invitations" },
    cancelInvite: { TR: "{name} davetini geri al", EN: "Withdraw {name}'s invitation" },
    inviteSend: { TR: "Davet gönder", EN: "Send invitations" },
    inviteClose: { TR: "Davet listesini kapat", EN: "Close the invite list" },
    alreadyIn: { TR: "Oturumda", EN: "In the session" },
    alreadyInvited: { TR: "Davet edildi", EN: "Invited" },
    invitesSent: { TR: "Davetler gönderildi.", EN: "Invitations sent." },
    readOnlyOn: { TR: "Diğerlerinin düzenlemesini kapat", EN: "Stop others from editing" },
    readOnlyOff: { TR: "Diğerlerinin düzenlemesine izin ver", EN: "Let others edit" },
    readOnlyNote: { TR: "Oturum salt okunur: yalnızca sahip düzenleyebilir.", EN: "Read-only session: only the owner can edit." },
    phoneNote: { TR: "Telefonda izleme modundasın.", EN: "You're watching on a phone." },
    frozenNote: { TR: "Oturum boyut sınırını aştı; değişiklikler artık kaydedilmiyor.", EN: "The session exceeded its size limit; changes are no longer saved." },
    endTitle: { TR: "Oturum bitirilsin mi?", EN: "End the session?" },
    endMessage: { TR: "Herkes oturumdan çıkar ve kodun son hâli projene kaydedilir. Katılımcılar bir kopyasını saklayabilir; sohbet silinir.", EN: "Everyone leaves the session and the final code is saved to your project. Participants can keep a copy; the chat is deleted." },
    leaveTitle: { TR: "Oturumdan ayrılınsın mı?", EN: "Leave the session?" },
    leaveMessage: { TR: "Kendi açık dosyalarına dönersin. Ayrıldıktan sonra kodun bir kopyasını saklayabilirsin.", EN: "You go back to your own open files. After leaving you can keep a copy of the code." },
    you: { TR: "sen", EN: "you" },
    muted: { TR: "Mikrofonu kapalı", EN: "Microphone muted" },
    inVoice: { TR: "Seste", EN: "In voice" },
} satisfies Record<string, Copy>;

const NO_PEERS: CollabPeer[] = [];
const NO_INVITES: CollabInvitee[] = [];
const NO_FILES: CollabFileView[] = [];

/**
 * The team panel of a live session (a tab of the editor's side panel):
 * people with presence and what they edit, follow mode, invitations, the
 * owner's controls, voice chat and the chat.
 */
export default function CollabPanel({ session, visible, onCopyLink }: {
    session: CollabSession;
    /** The panel is on screen (chat messages count as read). */
    visible: boolean;
    onCopyLink: () => void;
}) {
    const { tx } = useI18n();
    const [confirmDialog, confirm] = useConfirm();
    const meta: CollabMeta | null = useCollabValue(session, (state) => state.meta, null);
    const me = useCollabValue(session, (state) => state.me, null);
    const peers = useCollabValue(session, (state) => state.peers, NO_PEERS);
    const invited = useCollabValue(session, (state) => state.invited, NO_INVITES);
    const files = useCollabValue(session, (state) => state.files, NO_FILES) ?? NO_FILES;
    const follow = useCollabValue(session, (state) => state.follow, null);
    const phase = useCollabValue(session, (state) => state.phase, "connecting");
    const realtime = useCollabValue(session, (state) => state.realtime, false);
    const phoneMode = useCollabValue(session, (state) => state.phoneMode, false);
    const call = useCollabValue(session, (state) => state.call, IDLE_CALL);
    const [inviting, setInviting] = useState(false);
    const [chosen, setChosen] = useState<Set<string>>(() => new Set());
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<CollabErrorCode | null>(null);
    const [notice, setNotice] = useState<Copy | null>(null);
    const { friends, failed, retry } = useCollabFriends(inviting);
    const isOwner = me?.role === "owner";
    const fileNames = useMemo(() => new Map(files.map((file) => [file.id, file.name])), [files]);

    const run = async (key: string, action: () => Promise<void>, success?: Copy) => {
        setBusy(key);
        setError(null);
        setNotice(null);
        try {
            await action();
            if (success) setNotice(success);
        } catch (failure) {
            setError(collabErrorCode(failure));
        } finally {
            setBusy(null);
        }
    };

    if (!meta || !me) {
        return (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500" role="status">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(COLLAB_COPY.connecting)}
            </div>
        );
    }

    const byKey = new Map<string, CollabPeer[]>();
    for (const peer of peers) byKey.set(peer.key, [...(byKey.get(peer.key) ?? []), peer]);
    const people = [...meta.participants].sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.joinedAt - b.joinedAt));
    const pending = invited.filter((invitee) => !invitee.joined);
    const unavailable = new Map<string, Copy>(invited.map((invitee) => [invitee.email, invitee.joined ? C.alreadyIn : C.alreadyInvited]));
    // The owner's plan decides both (meta.maxPeople / maxInvites).
    const roomForInvites = Math.max(0, meta.maxInvites - invited.length);
    const statusOf = (key: string): PresenceStatus => {
        if (key === me.key) return "online";
        const tabs = byKey.get(key) ?? [];
        if (!tabs.length) return "offline";
        return tabs.some((tab) => !tab.away) ? "online" : "idle";
    };

    const endOrLeave = async () => {
        const accepted = await confirm(isOwner
            ? { title: tx(C.endTitle), message: tx(C.endMessage), confirmLabel: tx(COLLAB_COPY.end), destructive: true }
            : { title: tx(C.leaveTitle), message: tx(C.leaveMessage), confirmLabel: tx(COLLAB_COPY.leave), destructive: true });
        if (!accepted) return;
        await run("end", () => (isOwner ? session.end() : session.leave()));
    };

    /** Removes a participant (after a confirmation) or withdraws a pending invitation. */
    const removePerson = async (email: string, name: string, joined: boolean) => {
        if (joined) {
            const accepted = await confirm({ title: tx(C.removeTitle), message: tx(C.removeMessage, { name }), confirmLabel: tx(C.removeConfirm), destructive: true });
            if (!accepted) return;
        }
        await run(`remove:${email}`, () => session.remove(email));
    };

    const sendInvites = async () => {
        const emails = [...chosen];
        if (!emails.length) return;
        await run("invite", async () => {
            await session.invite(emails);
            setChosen(new Set());
            setInviting(false);
        }, C.invitesSent);
    };

    const connection = phase === "reconnecting" ? COLLAB_COPY.reconnecting : phase === "connecting" ? COLLAB_COPY.connecting : realtime ? COLLAB_COPY.realtime : COLLAB_COPY.polling;
    const iconButton = "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white";

    return (
        <div role="region" className="flex h-full min-h-0 flex-col overflow-y-auto [scrollbar-width:thin]" aria-label={tx(C.panel)}>
            {/* Header */}
            <div className="border-b border-zinc-200 px-3 py-2.5 dark:border-white/10">
                <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${phase === "live" ? "bg-emerald-500" : phase === "reconnecting" ? "animate-pulse bg-amber-500" : "bg-zinc-400"}`} aria-hidden />
                    <h2 className="min-w-0 flex-1 truncate text-sm font-bold" dir="auto">{meta.title}</h2>
                    <button type="button" onClick={onCopyLink} className={iconButton} title={tx(COLLAB_COPY.copyLink)} aria-label={tx(COLLAB_COPY.copyLink)}>
                        <Link2 className="h-4 w-4" aria-hidden />
                    </button>
                    {isOwner && (
                        <button
                            type="button"
                            onClick={() => void run("readOnly", () => session.setReadOnly(!meta.readOnly))}
                            disabled={busy !== null}
                            aria-pressed={meta.readOnly}
                            className={`${iconButton} ${meta.readOnly ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : ""}`}
                            title={tx(meta.readOnly ? C.readOnlyOff : C.readOnlyOn)}
                            aria-label={tx(meta.readOnly ? C.readOnlyOff : C.readOnlyOn)}
                        >
                            {busy === "readOnly" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : meta.readOnly ? <Lock className="h-4 w-4" aria-hidden /> : <LockOpen className="h-4 w-4" aria-hidden />}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => void endOrLeave()}
                        disabled={busy !== null}
                        className={`${iconButton} text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10`}
                        title={tx(isOwner ? COLLAB_COPY.end : COLLAB_COPY.leave)}
                        aria-label={tx(isOwner ? COLLAB_COPY.end : COLLAB_COPY.leave)}
                    >
                        {busy === "end" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : isOwner ? <Power className="h-4 w-4" aria-hidden /> : <LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
                    </button>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400" role="status">
                    {phase === "reconnecting" ? <WifiOff className="h-3 w-3" aria-hidden /> : realtime ? <Radio className="h-3 w-3" aria-hidden /> : <Wifi className="h-3 w-3" aria-hidden />}
                    {tx(connection)}
                </p>
                {(meta.readOnly || phoneMode || meta.frozen) && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200">
                        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {tx(meta.frozen ? C.frozenNote : phoneMode && !meta.readOnly ? C.phoneNote : C.readOnlyNote)}
                    </p>
                )}
                {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">{tx(COLLAB_ERROR_COPY[error])}</p>}
                {notice && !error && <p role="status" className="mt-2 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-800 dark:text-emerald-200">{tx(notice)}</p>}
            </div>

            {/* People */}
            <section className="border-b border-zinc-200 px-3 py-2.5 dark:border-white/10" aria-labelledby="collab-people">
                <div className="mb-1.5 flex items-center gap-2">
                    <h3 id="collab-people" className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{tx(C.people, { count: people.length, max: meta.maxPeople })}</h3>
                    {isOwner && (
                        <button
                            type="button"
                            onClick={() => setInviting((value) => !value)}
                            aria-expanded={inviting}
                            disabled={!inviting && roomForInvites === 0}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 dark:text-indigo-300"
                        >
                            {inviting ? <X className="h-3.5 w-3.5" aria-hidden /> : <UserPlus className="h-3.5 w-3.5" aria-hidden />}
                            {tx(inviting ? C.inviteClose : COLLAB_COPY.invite)}
                        </button>
                    )}
                </div>
                <ul className="space-y-1" aria-label={tx(C.peopleList)}>
                    {people.map((person) => {
                        const mine = person.key === me.key;
                        const tabs = byKey.get(person.key) ?? [];
                        const focus = tabs.find((tab) => !tab.away && tab.file) ?? tabs.find((tab) => tab.file);
                        const fileName = focus?.file ? fileNames.get(focus.file) : undefined;
                        const status = statusOf(person.key);
                        const voice = mine ? (call.status === "active" ? { on: true, muted: call.muted, deafened: call.deafened } : null) : tabs.find((tab) => tab.call?.on)?.call ?? null;
                        const speaking = mine ? call.speaking.includes(SELF_PEER) : tabs.some((tab) => call.speaking.includes(`${tab.key}:${tab.clientID}`));
                        const followed = follow === person.key;
                        const invitee = invited.find((entry) => entry.key === person.key);
                        return (
                            <li key={person.key} className={`group flex items-center gap-2.5 rounded-xl px-2 py-1.5 ${followed ? "bg-indigo-500/[0.08] ring-1 ring-indigo-500/30" : ""}`}>
                                <span className={`rounded-full ${speaking ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950" : ""}`}>
                                    <PresenceAvatar src={person.avatar} name={person.name} status={status} size="sm" ring="bg-white dark:bg-zinc-950" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: collabColor(person.color) }} aria-hidden />
                                        <span className="truncate text-sm font-semibold" dir="auto">{person.name}</span>
                                        {mine && <span className="shrink-0 text-xs text-zinc-400">({tx(C.you)})</span>}
                                        {person.role === "owner" && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label={tx(COLLAB_COPY.owner)} />}
                                        {voice && (voice.muted ? <MicOff className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-label={tx(C.muted)} /> : <Radio className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label={tx(C.inVoice)} />)}
                                    </span>
                                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                                        {mine
                                            ? null
                                            : status === "offline"
                                                ? tx(C.notConnected)
                                                : fileName
                                                    ? `${tx(focus?.selection ? C.editing : C.viewing, { file: fileName })}${focus?.line ? `:${focus.line}` : ""}${focus?.away ? ` · ${tx(C.away)}` : ""}`
                                                    : focus?.away ? tx(C.away) : null}
                                    </span>
                                </span>
                                {!mine && status !== "offline" && (
                                    <button
                                        type="button"
                                        onClick={() => session.follow(followed ? null : person.key)}
                                        aria-pressed={followed}
                                        className={`${iconButton} ${followed ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" : ""}`}
                                        title={followed ? tx(C.unfollow) : tx(C.follow, { name: person.name })}
                                        aria-label={followed ? tx(C.unfollow) : tx(C.follow, { name: person.name })}
                                    >
                                        <Crosshair className="h-4 w-4" aria-hidden />
                                    </button>
                                )}
                                {isOwner && !mine && invitee && (
                                    <button
                                        type="button"
                                        onClick={() => void removePerson(invitee.email, person.name, true)}
                                        disabled={busy !== null}
                                        className={`${iconButton} hover:text-red-600 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100`}
                                        title={tx(C.remove, { name: person.name })}
                                        aria-label={tx(C.remove, { name: person.name })}
                                    >
                                        <UserX className="h-4 w-4" aria-hidden />
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {follow && <p className="mt-1 px-2 text-[11px] text-indigo-600 dark:text-indigo-300" role="status">{tx(C.following)}</p>}

                {isOwner && inviting && (
                    <div className="mt-2 rounded-xl border border-zinc-200 p-2 dark:border-white/10">
                        <CollabFriendPicker friends={friends} failed={failed} onRetry={retry} selected={chosen} onToggle={(email) => setChosen((current) => {
                            const next = new Set(current);
                            if (next.has(email)) next.delete(email);
                            else next.add(email);
                            return next;
                        })} unavailable={unavailable} max={roomForInvites} />
                        <div className="mt-2 flex justify-end">
                            <button type="button" className={buttonClasses.primary} disabled={!chosen.size || busy !== null} onClick={() => void sendInvites()}>
                                {busy === "invite" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
                                {tx(C.inviteSend)}
                            </button>
                        </div>
                    </div>
                )}

                {isOwner && pending.length > 0 && (
                    <div className="mt-2">
                        <h4 className="px-2 text-[11px] font-semibold text-zinc-500">{tx(C.pending)}</h4>
                        <ul className="mt-1 space-y-1">
                            {pending.map((invitee) => (
                                <li key={invitee.email} className="flex items-center gap-2.5 rounded-xl px-2 py-1">
                                    <PresenceAvatar src={invitee.avatar} name={invitee.name} size="sm" ring="bg-white dark:bg-zinc-950" className="opacity-70" />
                                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-300" dir="auto">{invitee.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => void removePerson(invitee.email, invitee.name, false)}
                                        disabled={busy !== null}
                                        className={iconButton}
                                        title={tx(C.cancelInvite, { name: invitee.name })}
                                        aria-label={tx(C.cancelInvite, { name: invitee.name })}
                                    >
                                        <X className="h-4 w-4" aria-hidden />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>

            <CollabVoice session={session} />
            <CollabChat session={session} visible={visible} />
            {confirmDialog}
        </div>
    );
}
