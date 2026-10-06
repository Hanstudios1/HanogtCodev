"use client";

import { collection, doc, onSnapshot, query, where, type FirestoreError } from "firebase/firestore";
import { ArrowUpRight, HeadphoneOff, Headphones, Mic, MicOff, PhoneOff, Volume2, X } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { UserAvatar, cx } from "@/components/Groups/ui";
import { useFirebaseBridge } from "@/components/Provider";
import { useVoiceCall } from "@/components/VoiceCallProvider";
import { playCue } from "@/lib/calls/sounds";
import { db } from "@/lib/firebase";
import { useI18n, type Copy } from "@/lib/i18n";
import { setSocialAudio, useAudioDevices, useSocialAudio } from "@/lib/social/local-state";
import { groupHref } from "@/lib/social/model";
import type { VoiceParticipant } from "@/lib/social/voice";
import { VoiceChannelSession, watchVoiceRoom, type VoiceNotice, type VoiceSessionState, type VoiceWatchers } from "@/lib/social/voice-session";

/** The channel a tab is in: the group and the channel's name (shown in the panels). */
export type VoiceGroup = { id: string; name: string; emoji: string; channel: string };
export type GroupVoiceNotice = VoiceNotice | "in_call";
export type GroupVoiceNoticeState = { groupId: string; code: GroupVoiceNotice; until: number; at: number };

type GroupVoiceValue = {
    /** The channel this tab is in or joining (null when it isn't). */
    group: VoiceGroup | null;
    state: VoiceSessionState | null;
    notice: GroupVoiceNoticeState | null;
    live: boolean;
    join: (group: VoiceGroup) => void;
    leave: () => void;
    dismissNotice: () => void;
    resumeAudio: () => void;
};

const GroupVoiceContext = createContext<GroupVoiceValue>({
    group: null,
    state: null,
    notice: null,
    live: false,
    join: () => undefined,
    leave: () => undefined,
    dismissNotice: () => undefined,
    resumeAudio: () => undefined,
});

export function useGroupVoice() {
    return useContext(GroupVoiceContext);
}

export const VOICE_COPY = {
    region: { TR: "Sesli kanal", EN: "Voice channel" },
    connected: { TR: "Ses bağlantısı kuruldu", EN: "Voice connected" },
    joining: { TR: "Bağlanıyor…", EN: "Connecting…" },
    disconnect: { TR: "Bağlantıyı kes", EN: "Disconnect" },
    openGroup: { TR: "Gruba git", EN: "Open the group" },
    mute: { TR: "Mikrofonu sessize al", EN: "Mute" },
    unmute: { TR: "Mikrofonu aç", EN: "Unmute" },
    deafen: { TR: "Sesi kapat", EN: "Deafen" },
    undeafen: { TR: "Sesi aç", EN: "Undeafen" },
    close: { TR: "Kapat", EN: "Close" },
    audioBlocked: { TR: "Tarayıcın sesi otomatik başlatmadı.", EN: "Your browser didn't start the audio by itself." },
    startAudio: { TR: "Sesi başlat", EN: "Start audio" },
    speaking: { TR: "{name} konuşuyor", EN: "{name} is speaking" },
} satisfies Record<string, Copy>;

export const VOICE_NOTICES: Record<GroupVoiceNotice, Copy> = {
    full: { TR: "Sesli kanal dolu (en fazla 5 kişi).", EN: "The voice channel is full (5 people at most)." },
    muted: { TR: "Bu grupta susturulduğun için sesli kanala katılamazsın.", EN: "You're timed out in this group, so you can't join its voice channel." },
    removed: { TR: "Bu grubun sesli kanalına artık erişimin yok.", EN: "You no longer have access to this group's voice channel." },
    moved: { TR: "Sesli kanala başka bir sekmeden veya cihazdan katıldın; buradaki bağlantı kapandı.", EN: "You joined the voice channel from another tab or device, so this one disconnected." },
    mic_denied: { TR: "Mikrofon izni verilmedi. Adres çubuğundaki kilit simgesinden mikrofona izin verip tekrar dene.", EN: "Microphone access was denied. Allow the microphone from the lock icon in the address bar and try again." },
    mic_unavailable: { TR: "Mikrofon bulunamadı veya açılamadı. Bir mikrofon bağlayıp tekrar dene.", EN: "No microphone was found or it couldn't be opened. Connect one and try again." },
    unsupported: { TR: "Bu tarayıcı sesli kanalları desteklemiyor (güvenli bağlantı ve güncel bir tarayıcı gerekir).", EN: "This browser doesn't support voice channels (a secure connection and an up-to-date browser are needed)." },
    ice: { TR: "Ses bağlantısı hazırlanamadı. Biraz sonra tekrar dene.", EN: "The voice connection couldn't be prepared. Try again in a moment." },
    rate_limited: { TR: "Çok sık deniyorsun. Biraz bekleyip tekrar dene.", EN: "You're trying too often. Wait a bit and try again." },
    network: { TR: "Sunucuya ulaşılamadı. Bağlantını kontrol et.", EN: "Couldn't reach the server. Check your connection." },
    failed: { TR: "Sesli kanal bağlantısı koptu. Tekrar katılmayı dene.", EN: "The voice channel connection dropped. Try joining again." },
    call_started: { TR: "Bir arama başladığı için sesli kanaldan ayrıldın.", EN: "You left the voice channel because a call started." },
    in_call: { TR: "Sesli kanala katılmak için önce aramayı bitir.", EN: "End your call first to join the voice channel." },
};

const MUTED_UNTIL: Copy = { TR: "Bu grupta susturuldun; {minutes} dakika sonra sesli kanala katılabilirsin.", EN: "You're timed out in this group; you can join its voice channel in {minutes} min." };

/** The notice as a sentence (a time-out says how long it lasts when known). */
export function useVoiceNoticeText() {
    const { tx } = useI18n();
    return useCallback((notice: GroupVoiceNoticeState) => (
        notice.code === "muted" && notice.until > notice.at
            ? tx(MUTED_UNTIL, { minutes: Math.max(1, Math.ceil((notice.until - notice.at) / 60_000)) })
            : tx(VOICE_NOTICES[notice.code])
    ), [tx]);
}

function warn(scope: string, error: unknown) {
    const code = (error as FirestoreError | null)?.code;
    console.warn(`[voice] ${scope} listener failed${code ? ` (${code})` : ""}; polling the server instead.`);
}

/** Firestore listeners for browsers with the Firebase bridge (the rules let members read the channel and their own signals). */
const watchers: VoiceWatchers = {
    room: (groupId, onRoom, onError) => onSnapshot(doc(db, "group_voice", groupId), (snapshot) => {
        // Only what the server confirmed: a cached copy may be older than this tab's seat.
        if (snapshot.metadata.fromCache) return;
        onRoom(snapshot.exists() ? snapshot.data() : null);
    }, (error) => {
        warn("room", error);
        onError();
    }),
    signals: (groupId, email, onSignals, onError) => onSnapshot(query(collection(db, "group_voice", groupId, "signals"), where("toEmail", "==", email)), (snapshot) => {
        onSignals(snapshot.docs.map((item) => ({ id: item.id, data: item.data() })));
    }, (error) => {
        warn("signals", error);
        onError();
    }),
};

/** Notices stay this long (the person can close them sooner). */
const NOTICE_MS = 12_000;

type Active = { key: number; group: VoiceGroup; session: VoiceChannelSession; state: VoiceSessionState };

/**
 * Group voice channels on every page: the tab's seat in one group's channel
 * (lib/social/voice-session.ts), the microphone and headphone switches and
 * devices of Hanogt Social, cues when people come and go, and a small bar
 * with the controls on pages outside Hanogt Social. A tab is in one channel
 * or one 1:1 call at a time: a call that starts takes it out of the channel.
 */
export default function GroupVoiceProvider({ children }: { children: React.ReactNode }) {
    const { data: session } = useSession();
    const email = session?.user?.email?.toLowerCase() || "";
    const bridge = useFirebaseBridge();
    const live = bridge.ready;
    const audio = useSocialAudio();
    const devices = useAudioDevices();
    const call = useVoiceCall();
    const pathname = usePathname() || "/";
    const [active, setActive] = useState<Active | null>(null);
    const [notice, setNotice] = useState<GroupVoiceNoticeState | null>(null);
    const sessionRef = useRef<VoiceChannelSession | null>(null);
    const keyRef = useRef(0);
    const settingsRef = useRef({ email, live, audio, devices, callStatus: call.status });
    useEffect(() => {
        settingsRef.current = { email, live, audio, devices, callStatus: call.status };
    });

    const join = useCallback((group: VoiceGroup) => {
        const settings = settingsRef.current;
        if (!settings.email) return;
        if (settings.callStatus !== "idle" && settings.callStatus !== "incoming") {
            setNotice({ groupId: group.id, code: "in_call", until: 0, at: Date.now() });
            return;
        }
        const current = sessionRef.current;
        if (current?.active && current.groupId === group.id) return;
        // Another group's channel: moving there leaves this one (like Discord).
        current?.leave();
        keyRef.current += 1;
        const key = keyRef.current;
        const created: VoiceChannelSession = new VoiceChannelSession({
            groupId: group.id,
            email: settings.email,
            live: settings.live,
            watchers: settings.live ? watchers : null,
            muted: settings.audio.micOff,
            deafened: settings.audio.deafened,
            inputDeviceId: settings.devices.input,
            outputDeviceId: settings.devices.output,
            onChange: (state) => {
                if (state.phase === "ended") {
                    if (sessionRef.current === created) sessionRef.current = null;
                    setActive((value) => (value?.key === key ? null : value));
                    if (state.notice) setNotice({ groupId: group.id, code: state.notice, until: state.mutedUntil, at: Date.now() });
                    return;
                }
                setActive((value) => (value?.key === key ? { ...value, state } : value));
            },
        });
        sessionRef.current = created;
        setNotice(null);
        setActive({ key, group, session: created, state: created.current });
        // Still inside the click: the microphone prompt and the audio need it.
        void created.join();
    }, []);

    const leave = useCallback(() => {
        const current = sessionRef.current;
        if (!current?.active) return;
        if (!settingsRef.current.audio.deafened) playCue("leave");
        current.leave();
    }, []);

    const dismissNotice = useCallback(() => setNotice(null), []);
    const resumeAudio = useCallback(() => sessionRef.current?.resumeAudio(), []);

    // Notices go away by themselves.
    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice((current) => (current === notice ? null : current)), NOTICE_MS);
        return () => window.clearTimeout(timer);
    }, [notice]);

    // A 1:1 call that starts (placed or answered) takes the tab out of the channel.
    useEffect(() => {
        if (call.status === "calling" || call.status === "connecting" || call.status === "active") {
            const current = sessionRef.current;
            if (current?.active) current.leave("call_started");
        }
    }, [call.status]);

    // The switches and devices of Hanogt Social apply to the channel at once.
    const activeSession = active?.session ?? null;
    useEffect(() => {
        activeSession?.setSwitches(audio.micOff, audio.deafened);
    }, [activeSession, audio.deafened, audio.micOff]);
    useEffect(() => {
        activeSession?.setInputDevice(devices.input);
        activeSession?.setOutputDevice(devices.output);
    }, [activeSession, devices.input, devices.output]);

    // Signing out or closing the page frees the seat.
    useEffect(() => {
        if (!email) sessionRef.current?.leave();
    }, [email]);
    useEffect(() => {
        const onExit = () => sessionRef.current?.dispose();
        window.addEventListener("pagehide", onExit);
        return () => {
            window.removeEventListener("pagehide", onExit);
            onExit();
        };
    }, []);

    // Cues: this tab joining, and others joining or leaving (not while the sound is off).
    const connected = active?.state.phase === "connected";
    const roster = connected ? active.state.participants.map((entry) => entry.id).sort().join("|") : "";
    const cueRef = useRef({ key: 0, ids: [] as string[] });
    useEffect(() => {
        const previous = cueRef.current;
        const key = active?.key ?? 0;
        const ids = roster ? roster.split("|") : [];
        cueRef.current = { key, ids };
        if (!roster || settingsRef.current.audio.deafened) return;
        if (previous.key !== key || !previous.ids.length) {
            playCue("join");
            return;
        }
        if (ids.some((id) => !previous.ids.includes(id))) playCue("join");
        else if (previous.ids.some((id) => !ids.includes(id))) playCue("leave");
    }, [active?.key, roster]);

    const value = useMemo<GroupVoiceValue>(() => ({
        group: active?.group ?? null,
        state: active?.state ?? null,
        notice,
        live,
        join,
        leave,
        dismissNotice,
        resumeAudio,
    }), [active?.group, active?.state, dismissNotice, join, leave, live, notice, resumeAudio]);

    // Hanogt Social has its own panels; phones there get the bar too (the panels sit in a drawer).
    const onSocial = pathname === "/social" || pathname.startsWith("/social/");
    const showBar = Boolean(active || notice);

    return (
        <GroupVoiceContext.Provider value={value}>
            {children}
            {showBar && (
                <VoiceBar
                    // Inside Social on phones: under the open navigation drawer (z-40/50), over the chat.
                    className={onSocial ? "z-30 md:hidden" : "z-[140]"}
                    active={active}
                    notice={notice}
                    micOff={audio.micOff}
                    deafened={audio.deafened}
                    showGroupLink={Boolean(active) && pathname !== groupHref(active?.group.id ?? "")}
                    onLeave={leave}
                    onDismiss={dismissNotice}
                    onResume={resumeAudio}
                />
            )}
        </GroupVoiceContext.Provider>
    );
}

/**
 * Who is in a group's channel, for the group's channel list: the tab's own
 * seat when it is in that channel, otherwise a listener (or polling) on it.
 */
export function useVoiceRoom(groupId: string | null): VoiceParticipant[] {
    const voice = useGroupVoice();
    const here = Boolean(groupId && voice.group?.id === groupId && voice.state);
    const [room, setRoom] = useState<{ groupId: string; participants: VoiceParticipant[] }>({ groupId: "", participants: [] });
    const live = voice.live;
    useEffect(() => {
        if (!groupId || here) return;
        return watchVoiceRoom({ groupId, live, watchers: live ? watchers : null, onParticipants: (participants) => setRoom({ groupId, participants }) });
    }, [groupId, here, live]);
    const own = here ? voice.state?.participants ?? [] : [];
    if (own.length) return own;
    return room.groupId === groupId ? room.participants : [];
}

/** The micro/headphone toggles shared with Hanogt Social's user panel (deafening also mutes). */
export function toggleVoiceMic(micOff: boolean) {
    setSocialAudio(micOff ? { micOff: false, deafened: false } : { micOff: true, deafened: false });
}

export function toggleVoiceDeafen(deafened: boolean) {
    setSocialAudio(deafened ? { micOff: false, deafened: false } : { micOff: true, deafened: true });
}

function VoiceBar({ className, active, notice, micOff, deafened, showGroupLink, onLeave, onDismiss, onResume }: {
    className: string;
    active: Active | null;
    notice: GroupVoiceNoticeState | null;
    micOff: boolean;
    deafened: boolean;
    showGroupLink: boolean;
    onLeave: () => void;
    onDismiss: () => void;
    onResume: () => void;
}) {
    const { tx } = useI18n();
    const noticeText = useVoiceNoticeText();
    const state = active?.state ?? null;
    const connected = state?.phase === "connected";
    const self = state?.self ?? null;
    return (
        // Below the site header, like the call bar (a tab is never in both).
        <div className={cx("pointer-events-none fixed inset-x-0 top-[4.25rem] flex justify-center px-2", className)}>
            <section
                aria-label={tx(VOICE_COPY.region)}
                data-voice-phase={state?.phase ?? "idle"}
                className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 text-white shadow-2xl shadow-black/30 backdrop-blur"
            >
                {active && state ? (
                    <div className="flex items-center gap-3 px-3 py-2">
                        <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", connected ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-300")}>
                            <Volume2 className={cx("h-[18px] w-[18px]", !connected && "motion-safe:animate-pulse")} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{active.group.channel} · {active.group.name}</p>
                            <p aria-live="polite" className={cx("truncate text-xs font-semibold", connected ? "text-emerald-400" : "text-amber-300")}>{tx(connected ? VOICE_COPY.connected : VOICE_COPY.joining)}</p>
                        </div>
                        <ul className="flex shrink-0 items-center max-[420px]:hidden" aria-label={tx(VOICE_COPY.region)}>
                            {state.participants.slice(0, 5).map((entry, index) => {
                                const speaking = state.speaking.includes(entry.id) && !(entry.id === self ? micOff : entry.muted);
                                return (
                                    <li key={entry.id} className={cx("rounded-full ring-2 ring-zinc-900 transition-shadow", index > 0 && "-ms-1.5", speaking && "shadow-[0_0_0_2px_rgb(16,185,129)]")} title={entry.name}>
                                        <UserAvatar name={entry.name} src={entry.avatarUrl} size="xs" />
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="flex shrink-0 items-center gap-1">
                            <BarButton label={tx(micOff ? VOICE_COPY.unmute : VOICE_COPY.mute)} pressed={micOff} danger={micOff} onClick={() => toggleVoiceMic(micOff)}>
                                {micOff ? <MicOff className="h-[18px] w-[18px]" aria-hidden /> : <Mic className="h-[18px] w-[18px]" aria-hidden />}
                            </BarButton>
                            <BarButton label={tx(deafened ? VOICE_COPY.undeafen : VOICE_COPY.deafen)} pressed={deafened} danger={deafened} onClick={() => toggleVoiceDeafen(deafened)}>
                                {deafened ? <HeadphoneOff className="h-[18px] w-[18px]" aria-hidden /> : <Headphones className="h-[18px] w-[18px]" aria-hidden />}
                            </BarButton>
                            {showGroupLink && (
                                <Link href={groupHref(active.group.id)} aria-label={tx(VOICE_COPY.openGroup)} title={tx(VOICE_COPY.openGroup)} className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                                    <ArrowUpRight className="h-[18px] w-[18px]" aria-hidden />
                                </Link>
                            )}
                            <button type="button" onClick={onLeave} className="flex h-9 w-11 items-center justify-center rounded-full bg-red-500 transition hover:bg-red-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400/50" aria-label={tx(VOICE_COPY.disconnect)} title={tx(VOICE_COPY.disconnect)}>
                                <PhoneOff className="h-[18px] w-[18px]" aria-hidden />
                            </button>
                        </div>
                    </div>
                ) : null}
                {state?.audioBlocked ? (
                    <p className="flex items-center gap-2 border-t border-white/10 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
                        <span className="min-w-0 flex-1">{tx(VOICE_COPY.audioBlocked)}</span>
                        <button type="button" onClick={onResume} className="shrink-0 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">{tx(VOICE_COPY.startAudio)}</button>
                    </p>
                ) : null}
                {notice ? (
                    <p role="alert" className={cx("flex items-start gap-2 px-3 py-2 text-xs leading-5 text-amber-200", active ? "border-t border-white/10 bg-amber-500/10" : "")}>
                        <Volume2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">{noticeText(notice)}</span>
                        <button type="button" onClick={onDismiss} className="-me-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-amber-200/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60" aria-label={tx(VOICE_COPY.close)} title={tx(VOICE_COPY.close)}>
                            <X className="h-4 w-4" aria-hidden />
                        </button>
                    </p>
                ) : null}
            </section>
        </div>
    );
}

function BarButton({ label, pressed, danger, onClick, children }: { label: string; pressed: boolean; danger: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            className={cx(
                "flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                danger ? "bg-white/10 text-red-400 hover:bg-white/15" : "text-zinc-300 hover:bg-white/10 hover:text-white",
            )}
        >
            {children}
        </button>
    );
}
