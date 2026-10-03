"use client";

import { AtSign, Ban, MoreVertical, Phone, PhoneOff, UserMinus, UserPlus, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { copyText } from "@/components/Groups/ui";
import { PresenceMark } from "@/components/PresenceAvatar";
import { useVoiceCall } from "@/components/VoiceCallProvider";
import { useI18n, type Copy } from "@/lib/i18n";
import { PRESENCE_STATUS_COPY } from "@/lib/presence";
import { SocialRequestError } from "@/lib/social/api";
import { useConversation, useVoiceMessagePlayer } from "@/lib/social/hooks";
import { dmChatId, previewText, type DmMessage, type SocialPerson, type SocialProfileResponse } from "@/lib/social/model";
import { useSocial } from "../context";
import { loadSocialProfile, useProfileViewer } from "../profile";
import { DropdownMenu, EmptyState, IconButton, MainHeader, SocialAside } from "../ui";
import UserPopout, { nextPopout, type PopoutState } from "../UserPopout";
import DmComposer from "./DmComposer";
import DmMessages, { ConversationIntro, formatDuration } from "./DmMessages";
import DmProfileAside from "./DmProfileAside";

const C = {
    profile: { TR: "Profil", EN: "Profile" },
    call: { TR: "Sesli arama başlat", EN: "Start a voice call" },
    hangUp: { TR: "Aramayı bitir", EN: "End call" },
    callBusy: { TR: "Başka bir aramadasın", EN: "You're in another call" },
    more: { TR: "Sohbet seçenekleri", EN: "Conversation options" },
    viewProfile: { TR: "Profili görüntüle", EN: "View profile" },
    remove: { TR: "Arkadaşlıktan çıkar", EN: "Remove friend" },
    block: { TR: "Engelle", EN: "Block" },
    unblock: { TR: "Engeli kaldır", EN: "Unblock" },
    close: { TR: "Sohbeti kapat", EN: "Close conversation" },
    addFriend: { TR: "Arkadaş ekle", EN: "Add friend" },
    removeTitle: { TR: "{name} arkadaşlıktan çıkarılsın mı?", EN: "Remove {name} as a friend?" },
    removeBody: { TR: "Sohbet geçmişiniz kalır ama birbirinize mesaj gönderemez ve arayamazsınız.", EN: "Your chat history stays, but you can't message or call each other." },
    blockTitle: { TR: "{name} engellensin mi?", EN: "Block {name}?" },
    blockBody: { TR: "Arkadaşlıktan çıkarılır, sana istek gönderemez ve bu sohbet listenden kalkar.", EN: "They're removed as a friend, can't send you requests and this conversation leaves your list." },
    removed: { TR: "Arkadaşlıktan çıkarıldı.", EN: "Friend removed." },
    blocked: { TR: "Kullanıcı engellendi.", EN: "User blocked." },
    unblocked: { TR: "Engel kaldırıldı.", EN: "User unblocked." },
    notFriend: { TR: "{name} ile artık arkadaş değilsiniz. Mesaj göndermek için yeniden arkadaş olun.", EN: "You and {name} aren't friends anymore. Become friends again to send messages." },
    youBlocked: { TR: "{name} kişisini engelledin. Mesaj göndermek için engeli kaldır.", EN: "You blocked {name}. Unblock them to send messages." },
    notFound: { TR: "Bu sohbet bulunamadı", EN: "This conversation wasn't found" },
    notFoundText: { TR: "Bağlantı hatalı olabilir ya da bu kişiyle bir sohbetin yok.", EN: "The link may be wrong, or you don't have a conversation with this person." },
    backHome: { TR: "Arkadaşlara dön", EN: "Back to Friends" },
    deleteTitle: { TR: "Mesaj silinsin mi?", EN: "Delete this message?" },
    deleteBody: { TR: "Mesaj ikiniz için de silinir.", EN: "The message is deleted for both of you." },
    deleteConfirm: { TR: "Mesajı sil", EN: "Delete message" },
    copied: { TR: "Mesaj panoya kopyalandı.", EN: "Message copied to the clipboard." },
    copyFailed: { TR: "Panoya kopyalanamadı.", EN: "Couldn't copy to the clipboard." },
    voiceLabel: { TR: "🎤 Sesli mesaj ({time})", EN: "🎤 Voice message ({time})" },
    deafened: { TR: "Sesin kapalı; sesli mesajları dinlemek için sol alttaki panelden aç.", EN: "Your sound is off; turn it on in the panel at the bottom left to listen." },
} satisfies Record<string, Copy>;

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function placeholder(email: string): SocialPerson {
    return { email, username: email.split("@")[0] || "Hanogt", avatarUrl: null, nickname: "", nicknameTag: "", staffRole: null, customStatus: "", statusEmoji: "", status: "offline", lastSeenAt: null };
}

/** A direct conversation: header, messages, composer and the other person's profile on the right. */
export default function DmView({ email }: { email: string }) {
    const { tx } = useI18n();
    const social = useSocial();
    const partnerEmail = email.trim().toLowerCase();
    const valid = EMAIL.test(partnerEmail) && partnerEmail !== social.me.email;
    if (!valid) {
        return (
            <main id="main-content" className="flex min-w-0 flex-1 flex-col bg-white dark:bg-zinc-900">
                <MainHeader aside={false}><h1 className="font-bold">{tx(C.notFound)}</h1></MainHeader>
                <EmptyState icon={<AtSign className="h-8 w-8" aria-hidden />} title={tx(C.notFound)} text={tx(C.notFoundText)}>
                    <Link href="/social" className="mt-5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500">{tx(C.backHome)}</Link>
                </EmptyState>
            </main>
        );
    }
    return <Conversation key={partnerEmail} partnerEmail={partnerEmail} />;
}

function Conversation({ partnerEmail }: { partnerEmail: string }) {
    const { tx } = useI18n();
    const router = useRouter();
    const social = useSocial();
    const { me: meState, mode, live, dms, isFriend, isBlocked, person, notify, errorText, confirm, friendAction, audio, now, markBroken } = social;
    const call = useVoiceCall();
    const inCallHere = call.status !== "idle" && call.peer?.email === partnerEmail;
    const busyElsewhere = call.status !== "idle" && !inCallHere;
    const chatId = dmChatId(meState.email, partnerEmail);
    const summary = dms.list.find((dm) => dm.chatId === chatId) ?? null;
    const friend = isFriend(partnerEmail);
    const blocked = isBlocked(partnerEmail);
    const [profile, setProfile] = useState<SocialProfileResponse | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileMissing, setProfileMissing] = useState(false);
    const [replyTo, setReplyTo] = useState<DmMessage | null>(null);
    const [editingId, setEditingId] = useState("");
    const [focusNonce, setFocusNonce] = useState(0);
    const [popout, setPopout] = useState<PopoutState | null>(null);
    const viewer = useProfileViewer();

    useEffect(() => {
        let active = true;
        loadSocialProfile(partnerEmail)
            .then((data) => { if (active) setProfile(data); })
            .catch((error: unknown) => { if (active && error instanceof SocialRequestError && error.code === "not_found") setProfileMissing(true); })
            .finally(() => { if (active) setProfileLoading(false); });
        return () => { active = false; };
    }, [partnerEmail]);

    const partner: SocialPerson = useMemo(() => {
        const known = person(partnerEmail) ?? summary?.partner ?? null;
        const fromProfile = profile?.person ?? null;
        if (known) return { ...(fromProfile ?? {}), ...known };
        return fromProfile ?? placeholder(partnerEmail);
    }, [partnerEmail, person, profile, summary]);

    const me: SocialPerson = useMemo(() => ({ ...meState, lastSeenAt: null, staffRole: null }), [meState]);

    const openProfile = useCallback((target: string, trigger: HTMLElement) => {
        const known = target === me.email ? me : partner;
        setPopout((current) => nextPopout(current, { ...known, status: target === me.email || friend ? known.status : null }, trigger));
    }, [friend, me, partner]);

    const onError = useCallback((error: unknown) => {
        // The rules refused a read that should work: use the server instead.
        if ((error as { code?: unknown } | null)?.code === "permission-denied") {
            markBroken();
            return;
        }
        notify(errorText(error), "error");
    }, [errorText, markBroken, notify]);

    const conversation = useConversation({ me: meState.email, partner: partnerEmail, mode, chatExists: Boolean(summary), active: true, onError });
    const player = useVoiceMessagePlayer({ with: partnerEmail }, (error) => notify(errorText(error), "error"));
    const canSend = !blocked && (conversation.canSend ?? friend);
    const notFound = profileMissing && !summary && !friend && !conversation.messages.length && conversation.loaded;

    const send = async (text: string) => {
        try {
            await conversation.sendMessage({ text, type: "text", replyTo: replyTo ? { id: replyTo.id, text: previewText(replyTo.text, 100), fromEmail: replyTo.fromEmail } : null });
            setReplyTo(null);
            return true;
        } catch (error) {
            notify(errorText(error, { TR: "Mesaj gönderilemedi.", EN: "The message couldn't be sent." }), "error");
            return false;
        }
    };

    const sendSticker = (emoji: string) => {
        void conversation.sendMessage({ text: emoji, type: "sticker", replyTo: null }).catch((error: unknown) => notify(errorText(error), "error"));
    };

    const sendVoice = (blob: Blob, mimeType: string, seconds: number) => {
        void conversation.sendVoice(blob, mimeType, seconds, tx(C.voiceLabel, { time: formatDuration(seconds) })).catch((error: unknown) => notify(errorText(error), "error"));
    };

    const saveEdit = async (message: DmMessage, text: string) => {
        try {
            await conversation.editMessage(message, text);
            setEditingId("");
            setFocusNonce((value) => value + 1);
        } catch (error) {
            notify(errorText(error), "error");
        }
    };

    const remove = async (message: DmMessage) => {
        if (!await confirm({ title: tx(C.deleteTitle), body: tx(C.deleteBody), confirmLabel: tx(C.deleteConfirm), tone: "danger" })) return;
        try {
            await conversation.deleteMessage(message);
        } catch (error) {
            notify(errorText(error), "error");
        }
    };

    const copyMessage = async (message: DmMessage) => {
        notify(tx(await copyText(message.text) ? C.copied : C.copyFailed), "info");
    };

    const toggleVoice = (message: DmMessage) => {
        if (audio.deafened) {
            notify(tx(C.deafened), "info");
            return;
        }
        void player.toggle(message);
    };

    const editLast = () => {
        const last = [...conversation.messages].reverse().find((message) => message.fromEmail === meState.email && message.type === "text" && !message.deleted && !message.pending);
        if (last) setEditingId(last.id);
    };

    // Deafening stops what is playing.
    const stopPlayer = player.stop;
    useEffect(() => {
        if (audio.deafened) stopPlayer();
    }, [audio.deafened, stopPlayer]);

    const removeFriend = async () => {
        if (!await confirm({ title: tx(C.removeTitle, { name: partner.username }), body: tx(C.removeBody), confirmLabel: tx(C.remove), tone: "danger" })) return;
        await friendAction({ action: "remove", targetEmail: partnerEmail }, C.removed);
    };
    const block = async () => {
        if (!await confirm({ title: tx(C.blockTitle, { name: partner.username }), body: tx(C.blockBody), confirmLabel: tx(C.block), tone: "danger" })) return;
        if (await friendAction({ action: "block", targetEmail: partnerEmail }, C.blocked)) router.push("/social");
    };
    const unblock = () => void friendAction({ action: "unblock", targetEmail: partnerEmail }, C.unblocked);
    const closeConversation = () => {
        dms.hide(chatId, summary?.lastMessageAt ?? Date.now());
        router.push("/social");
    };

    if (notFound) {
        return (
            <main id="main-content" className="flex min-w-0 flex-1 flex-col bg-white dark:bg-zinc-900">
                <MainHeader aside={false}><h1 className="font-bold">{tx(C.notFound)}</h1></MainHeader>
                <EmptyState icon={<AtSign className="h-8 w-8" aria-hidden />} title={tx(C.notFound)} text={tx(C.notFoundText)}>
                    <Link href="/social" className="mt-5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500">{tx(C.backHome)}</Link>
                </EmptyState>
            </main>
        );
    }

    const statusText = partner.customStatus ? `${partner.statusEmoji ? `${partner.statusEmoji} ` : ""}${partner.customStatus}` : tx(PRESENCE_STATUS_COPY[partner.status]);
    const disabledNotice = blocked ? (
        <span className="flex flex-wrap items-center gap-2">{tx(C.youBlocked, { name: partner.username })}<button type="button" onClick={unblock} className="rounded-lg bg-zinc-200 px-2.5 py-1 text-xs font-semibold hover:bg-zinc-300 dark:bg-white/10 dark:hover:bg-white/15">{tx(C.unblock)}</button></span>
    ) : !canSend ? (
        <span className="flex flex-wrap items-center gap-2">{tx(C.notFriend, { name: partner.username })}<Link href="/social?tab=add" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"><UserPlus className="h-3.5 w-3.5" aria-hidden />{tx(C.addFriend)}</Link></span>
    ) : null;

    const menuItems = [
        { id: "profile", label: tx(C.viewProfile), icon: <UserRound className="h-4 w-4" aria-hidden />, onSelect: () => void viewer.show(partnerEmail) },
        ...(friend ? [{ id: "remove", label: tx(C.remove), icon: <UserMinus className="h-4 w-4" aria-hidden />, onSelect: () => void removeFriend(), danger: true }] : []),
        blocked
            ? { id: "unblock", label: tx(C.unblock), icon: <Ban className="h-4 w-4" aria-hidden />, onSelect: unblock }
            : { id: "block", label: tx(C.block), icon: <Ban className="h-4 w-4" aria-hidden />, onSelect: () => void block(), danger: true },
        { id: "close", label: tx(C.close), icon: <X className="h-4 w-4" aria-hidden />, onSelect: closeConversation },
    ];

    return (
        <>
            <main id="main-content" className="flex min-w-0 flex-1 flex-col bg-white dark:bg-zinc-900">
                <MainHeader actions={(
                    <>
                        {friend && (inCallHere
                            ? <IconButton label={tx(C.hangUp)} onClick={call.hangUp} active><PhoneOff className="h-5 w-5 text-red-500" aria-hidden /></IconButton>
                            : <IconButton label={busyElsewhere ? tx(C.callBusy) : tx(C.call)} disabled={busyElsewhere} onClick={() => void call.startCall({ email: partnerEmail, username: partner.username, avatarUrl: partner.avatarUrl ?? undefined, staffRole: partner.staffRole })}><Phone className="h-5 w-5" aria-hidden /></IconButton>)}
                        <DropdownMenu label={tx(C.more)} trigger={<MoreVertical className="h-5 w-5" aria-hidden />} items={menuItems} />
                    </>
                )}>
                    <AtSign className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
                    <h1 className="min-w-0 truncate text-base font-bold">{partner.username}</h1>
                    {friend && <span className="flex min-w-0 items-center gap-1.5" title={tx(PRESENCE_STATUS_COPY[partner.status])}><PresenceMark status={partner.status} className="h-2.5 w-2.5" /><span className="hidden truncate text-[13px] text-zinc-500 sm:inline dark:text-zinc-400">{statusText}</span></span>}
                </MainHeader>
                <DmMessages
                    chatId={chatId}
                    me={me}
                    partner={partner}
                    messages={conversation.messages}
                    // Live, the conversation is subscribed once the list says the chat exists: wait for the list first.
                    loaded={conversation.loaded && (!live || dms.loaded)}
                    hasMore={conversation.hasMore}
                    onLoadOlder={conversation.loadOlder}
                    now={now}
                    editingId={editingId}
                    onStartEdit={(message) => setEditingId(message.id)}
                    onCancelEdit={() => { setEditingId(""); setFocusNonce((value) => value + 1); }}
                    onSaveEdit={saveEdit}
                    onReply={(message) => { setReplyTo(message); setFocusNonce((value) => value + 1); }}
                    onDelete={(message) => void remove(message)}
                    onCopy={(message) => void copyMessage(message)}
                    playingId={player.playingId}
                    loadingVoiceId={player.loadingId}
                    onToggleVoice={toggleVoice}
                    onOpenProfile={openProfile}
                    intro={<ConversationIntro partner={partner} />}
                />
                <DmComposer
                    partnerName={partner.username}
                    disabled={disabledNotice}
                    typing={conversation.typing && friend}
                    replyTo={replyTo}
                    replyAuthor={replyTo ? (replyTo.fromEmail === meState.email ? meState.username : partner.username) : ""}
                    onCancelReply={() => setReplyTo(null)}
                    onSend={send}
                    onSticker={sendSticker}
                    onVoice={sendVoice}
                    onVoiceError={(code) => notify(errorText(code), "error")}
                    onTyping={conversation.notifyTyping}
                    onEditLast={editLast}
                    focusNonce={focusNonce}
                />
            </main>
            <SocialAside label={tx(C.profile)}>
                <DmProfileAside person={partner} isFriend={friend} profile={profile} loading={profileLoading} now={now} onViewProfile={() => void viewer.show(partnerEmail)} />
            </SocialAside>
            {popout && <UserPopout key={`${popout.person.email}:${popout.anchor.top}`} popout={popout} onClose={() => setPopout(null)} onViewProfile={(target) => void viewer.show(target)} />}
            {viewer.element}
        </>
    );
}
