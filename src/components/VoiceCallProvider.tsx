"use client";

import { doc, getDoc } from "firebase/firestore";
import { HeadphoneOff, Headphones, Mic, MicOff, Phone, PhoneOff, Settings2, ShieldCheck, Volume2, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import PresenceAvatar from "@/components/PresenceAvatar";
import { useFirebaseBridge } from "@/components/Provider";
import AudioSettingsDialog from "@/components/Social/AudioSettings";
import StaffBadge, { parseStaffRole } from "@/components/StaffBadge";
import { useOwnProfile } from "@/lib/account-profile-client";
import { callsApi, watchIncoming } from "@/lib/calls/client";
import type { IncomingCall } from "@/lib/calls/model";
import { CallSession, type CallNotice, type CallSessionState } from "@/lib/calls/session";
import { startTone } from "@/lib/calls/sounds";
import { db } from "@/lib/firebase";
import { useI18n, type Copy } from "@/lib/i18n";
import { setSocialAudio, useAudioDevices, useSocialAudio } from "@/lib/social/local-state";

export type CallPeer = { email: string; username: string; avatarUrl?: string; staffRole?: string | null };
export type VoiceCallStatus = "idle" | "incoming" | "calling" | "connecting" | "active";

type CallContextValue = {
    startCall: (peer: CallPeer) => Promise<void>;
    hangUp: () => void;
    status: VoiceCallStatus;
    /** The other person while a call rings or runs. */
    peer: CallPeer | null;
    /** When the audio connection came up (0 before). */
    connectedAt: number;
};

const VoiceCallContext = createContext<CallContextValue>({ startCall: async () => undefined, hangUp: () => undefined, status: "idle", peer: null, connectedAt: 0 });

export function useVoiceCall() {
    return useContext(VoiceCallContext);
}

const C = {
    region: { TR: "Sesli arama", EN: "Voice call" },
    incoming: { TR: "Gelen sesli arama…", EN: "Incoming voice call…" },
    preparing: { TR: "Arama hazırlanıyor…", EN: "Setting up the call…" },
    ringing: { TR: "Çalıyor…", EN: "Ringing…" },
    connecting: { TR: "Bağlanıyor…", EN: "Connecting…" },
    connected: { TR: "Sesli bağlantı · {time}", EN: "Voice connected · {time}" },
    accept: { TR: "Yanıtla", EN: "Accept" },
    decline: { TR: "Reddet", EN: "Decline" },
    hangUp: { TR: "Aramayı bitir", EN: "End call" },
    cancel: { TR: "Aramayı iptal et", EN: "Cancel call" },
    mute: { TR: "Mikrofonu sessize al", EN: "Mute" },
    unmute: { TR: "Mikrofonu aç", EN: "Unmute" },
    deafen: { TR: "Sesi kapat", EN: "Deafen" },
    undeafen: { TR: "Sesi aç", EN: "Undeafen" },
    close: { TR: "Kapat", EN: "Close" },
    privacy: { TR: "Ses kaydedilmez; geçici bağlantı verisi arama bitince silinir.", EN: "Audio is never recorded; temporary connection data is deleted when the call ends." },
    slow: { TR: "Bağlantı uzun sürüyor. Bazı ağlar (mobil veri, kurumsal veya okul ağları) doğrudan bağlantıyı engeller; bu ağlarda aramanın kurulması için sitenin bir TURN sunucusu kullanması gerekir.", EN: "Connecting is taking a while. Some networks (mobile data, company or school networks) block direct connections; on them the site needs a TURN server for calls to connect." },
    slowTurn: { TR: "Bağlantı uzun sürüyor; ağ bağlantını kontrol et.", EN: "Connecting is taking a while; check your network connection." },
    routeDirect: { TR: "Doğrudan bağlantı", EN: "Direct connection" },
    routeRelay: { TR: "TURN üzerinden", EN: "Via TURN relay" },
    settings: { TR: "Ses ayarları", EN: "Voice settings" },
    mutedWarning: { TR: "Mikrofonun kapalı: karşı taraf seni duymuyor.", EN: "Your microphone is off: the other person can't hear you." },
    deafenedWarning: { TR: "Sesin kapalı: karşı tarafı duymuyorsun.", EN: "Your sound is off: you can't hear the other person." },
    turnOn: { TR: "Aç", EN: "Turn on" },
    remoteMuted: { TR: "{name} mikrofonunu kapattı.", EN: "{name} has muted their microphone." },
    audioBlocked: { TR: "Tarayıcın sesi otomatik başlatmadı.", EN: "Your browser didn't start the audio by itself." },
    startAudio: { TR: "Sesi başlat", EN: "Start audio" },
    noIncomingAudio: { TR: "Karşı taraftan ses verisi gelmiyor; bağlantı kopmuş olabilir. Sorun sürerse aramayı bitirip yeniden dene.", EN: "No audio data is arriving from the other person; the connection may have dropped. If it continues, end the call and try again." },
    micSilent: { TR: "Mikrofonundan hiç ses gelmiyor gibi görünüyor. Doğru mikrofon seçili mi?", EN: "No sound seems to be coming from your microphone. Is the right one selected?" },
} satisfies Record<string, Copy>;

const NOTICES: Record<CallNotice, Copy> = {
    declined: { TR: "{name} aramayı reddetti.", EN: "{name} declined the call." },
    busy: { TR: "{name} şu anda başka bir görüşmede.", EN: "{name} is in another call." },
    unavailable: { TR: "{name} şu anda müsait değil.", EN: "{name} isn't available right now." },
    no_answer: { TR: "{name} yanıt vermedi.", EN: "{name} didn't answer." },
    missed: { TR: "Cevapsız arama: {name}", EN: "Missed call from {name}" },
    ended: { TR: "Arama sona erdi.", EN: "The call ended." },
    failed: { TR: "Bağlantı kurulamadı veya koptu. İnternet bağlantını kontrol edip tekrar dene.", EN: "The connection failed or dropped. Check your internet connection and try again." },
    failed_turn: {
        TR: "Bağlantı kurulamadı: ağın (ör. mobil veri, kurumsal veya okul ağı) doğrudan bağlantıya izin vermiyor olabilir. Bu ağlarda aramaların çalışması için site yönetiminin bir TURN sunucusu yapılandırması gerekir; şimdilik başka bir ağla (ör. ev Wi-Fi'ı) dene.",
        EN: "Couldn't connect: your network (e.g. mobile data, a company or school network) may block direct connections. For calls to work on such networks the site needs a TURN server; for now, try another network (e.g. home Wi-Fi).",
    },
    mic_denied: { TR: "Mikrofon izni verilmedi. Adres çubuğundaki kilit simgesinden mikrofona izin verip tekrar dene.", EN: "Microphone access was denied. Allow the microphone from the lock icon in the address bar and try again." },
    mic_missing: { TR: "Mikrofon bulunamadı. Bir mikrofon bağlayıp tekrar dene.", EN: "No microphone was found. Connect one and try again." },
    mic_busy: { TR: "Mikrofona erişilemedi; başka bir uygulama kullanıyor olabilir.", EN: "The microphone couldn't be opened; another app may be using it." },
    unsupported: { TR: "Bu tarayıcı sesli aramayı desteklemiyor (güvenli bağlantı ve güncel bir tarayıcı gerekir).", EN: "This browser doesn't support voice calls (a secure connection and an up-to-date browser are needed)." },
    ice: { TR: "Arama bağlantısı hazırlanamadı. Biraz sonra tekrar dene.", EN: "The call connection couldn't be prepared. Try again in a moment." },
    start_failed: { TR: "Arama başlatılamadı. Biraz sonra tekrar dene.", EN: "The call couldn't be started. Try again in a moment." },
    inactive: { TR: "Bu arama artık etkin değil.", EN: "This call is no longer active." },
    not_friend: { TR: "Yalnızca arkadaşlarını arayabilirsin.", EN: "You can only call your friends." },
    blocked: { TR: "Bu kişiyi engelledin; aramak için önce engeli kaldır.", EN: "You blocked this person; unblock them to call." },
    rate_limited: { TR: "Çok sık arama yapıyorsun. Biraz bekleyip tekrar dene.", EN: "You're calling too often. Wait a bit and try again." },
    network: { TR: "Sunucuya ulaşılamadı. Bağlantını kontrol et.", EN: "Couldn't reach the server. Check your connection." },
};

/** Notices that explain a problem stay a little longer than "call ended". */
const LONG_NOTICES = new Set<CallNotice>(["failed", "failed_turn", "mic_denied", "mic_missing", "mic_busy", "unsupported", "ice", "start_failed", "not_friend", "blocked", "rate_limited", "network"]);

type ActiveCall = { key: number; session: CallSession; peer: CallPeer; state: CallSessionState };

function publicStatus(call: ActiveCall | null): VoiceCallStatus {
    switch (call?.state.phase) {
        case "incoming": return "incoming";
        case "preparing":
        case "ringing": return "calling";
        case "connecting": return "connecting";
        case "active": return "active";
        default: return "idle";
    }
}

function duration(ms: number) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const clock = `${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    return hours ? `${hours}:${clock}` : clock;
}

/**
 * 1:1 voice calls on every page: ringing (a Firestore listener with the
 * Firebase bridge, polling /api/calls/incoming without it), the incoming-call
 * dialog and a Discord-style call bar that doesn't block the page, so people
 * keep chatting while they talk. Signalling always goes through the server
 * (/api/calls), so calls work whether or not the bridge is up.
 */
export default function VoiceCallProvider({ children }: { children: React.ReactNode }) {
    const { data: session } = useSession();
    const bridge = useFirebaseBridge();
    const email = session?.user?.email?.toLowerCase() || "";
    const live = bridge.ready;
    const audio = useSocialAudio();
    const devices = useAudioDevices();
    const [settingsOpen, setSettingsOpen] = useState(false);
    // Do Not Disturb declines incoming calls without ringing; the caller sees "unavailable".
    const doNotDisturb = useOwnProfile(email || null)?.statusPreference === "dnd";
    const [call, setCall] = useState<ActiveCall | null>(null);
    const sessionRef = useRef<CallSession | null>(null);
    const keyRef = useRef(0);
    const handledRef = useRef(new Set<string>());
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const settingsRef = useRef({ live, audio, devices, doNotDisturb });
    useEffect(() => {
        settingsRef.current = { live, audio, devices, doNotDisturb };
    });

    const begin = useCallback((role: "caller" | "callee", peer: CallPeer, callId: string | null) => {
        keyRef.current += 1;
        const key = keyRef.current;
        const settings = settingsRef.current;
        const created = new CallSession({
            role,
            peer: peer.email,
            callId,
            live: settings.live,
            muted: settings.audio.micOff,
            deafened: settings.audio.deafened,
            audio: audioElementRef.current,
            inputDeviceId: settings.devices.input,
            outputDeviceId: settings.devices.output,
            onChange: (state) => setCall((current) => (current && current.key === key ? { ...current, state } : current)),
        });
        sessionRef.current = created;
        setCall({ key, session: created, peer, state: created.current });
        return created;
    }, []);

    const startCall = useCallback(async (target: CallPeer) => {
        const peerEmail = target.email.trim().toLowerCase();
        if (!email || !peerEmail || peerEmail === email || sessionRef.current?.busy) return;
        unmuteForCall();
        const created = begin("caller", { ...target, email: peerEmail }, null);
        created.setMuted(false);
        created.setDeafened(false);
        // Still inside the click: lets the browser play the call audio later.
        created.unlock();
        await created.startOutgoing();
    }, [begin, email]);

    const acceptCall = useCallback((session: CallSession) => {
        unmuteForCall();
        session.setMuted(false);
        session.setDeafened(false);
        session.unlock();
        void session.accept();
    }, []);

    const hangUp = useCallback(() => sessionRef.current?.hangUp(), []);

    /* -------------------------------- ringing -------------------------------- */

    const onIncoming = useCallback((list: IncomingCall[]) => {
        const handled = handledRef.current;
        if (handled.size > 200) handled.clear();
        for (const incoming of list) {
            if (handled.has(incoming.id)) continue;
            handled.add(incoming.id);
            if (sessionRef.current?.busy) {
                void callsApi.decline(incoming.id, "busy").catch(() => undefined);
                continue;
            }
            if (settingsRef.current.doNotDisturb) {
                void callsApi.decline(incoming.id, "unavailable").catch(() => undefined);
                continue;
            }
            const person = incoming.person;
            const peer: CallPeer = { email: incoming.caller, username: person?.username || incoming.caller.split("@")[0], avatarUrl: person?.avatarUrl ?? undefined, staffRole: person?.staffRole ?? null };
            const created = begin("callee", peer, incoming.id);
            created.startIncoming();
            if (!person && settingsRef.current.live) {
                // The realtime listener only has the address: the name card comes from the public profile.
                void getDoc(doc(db, "public_profiles", incoming.caller)).then((snapshot) => {
                    const data = snapshot.data() ?? {};
                    setCall((current) => (current && current.session === created ? {
                        ...current,
                        peer: {
                            ...current.peer,
                            username: typeof data.username === "string" && data.username.trim() ? data.username.trim().slice(0, 60) : current.peer.username,
                            avatarUrl: typeof data.avatarUrl === "string" && /^https:\/\//.test(data.avatarUrl) ? data.avatarUrl : current.peer.avatarUrl,
                            staffRole: typeof data.staffRole === "string" ? data.staffRole : null,
                        },
                    } : current));
                }).catch(() => undefined);
            }
        }
    }, [begin]);

    const onIncomingRef = useRef(onIncoming);
    useEffect(() => {
        onIncomingRef.current = onIncoming;
    });

    useEffect(() => {
        if (!email) return;
        return watchIncoming({ email, live, onCalls: (list) => onIncomingRef.current(list) });
    }, [email, live]);

    // Signing out ends whatever is going on.
    useEffect(() => {
        if (!email) sessionRef.current?.hangUp();
    }, [email]);

    /* ------------------------------ side effects ----------------------------- */

    const phase = call?.state.phase ?? null;
    const notice = call?.state.notice ?? null;
    const callKey = call?.key ?? 0;

    // A finished call stays on screen briefly with its reason, then the bar goes away.
    useEffect(() => {
        if (phase !== "ended") return;
        const timer = window.setTimeout(() => setCall((current) => (current?.key === callKey ? null : current)), notice ? (LONG_NOTICES.has(notice) ? 12_000 : 5_000) : 0);
        return () => window.clearTimeout(timer);
    }, [callKey, notice, phase]);

    // Ring tones (not while deafened).
    useEffect(() => {
        if (audio.deafened) return;
        if (phase === "incoming") return startTone("incoming");
        if (phase === "ringing") return startTone("outgoing");
    }, [audio.deafened, phase]);

    // The microphone and headphone toggles of Hanogt Social apply to calls too (like Discord's).
    const activeSession = call?.session ?? null;
    useEffect(() => {
        activeSession?.setMuted(audio.micOff);
        activeSession?.setDeafened(audio.deafened);
    }, [activeSession, audio.deafened, audio.micOff]);

    // A microphone or speaker picked in the voice settings applies to the running call at once.
    useEffect(() => {
        void activeSession?.setInputDevice(devices.input);
        activeSession?.setOutputDevice(devices.output);
    }, [activeSession, devices.input, devices.output]);

    useEffect(() => {
        const onExit = () => sessionRef.current?.dispose();
        window.addEventListener("pagehide", onExit);
        return () => {
            window.removeEventListener("pagehide", onExit);
            onExit();
        };
    }, []);

    const status = publicStatus(call);
    const value = useMemo<CallContextValue>(() => ({
        startCall,
        hangUp,
        status,
        peer: status === "idle" ? null : call?.peer ?? null,
        connectedAt: call?.state.connectedAt ?? 0,
    }), [call?.peer, call?.state.connectedAt, hangUp, startCall, status]);

    return (
        <VoiceCallContext.Provider value={value}>
            {children}
            <audio ref={audioElementRef} autoPlay playsInline className="hidden" />
            {call && call.state.phase === "incoming" && (
                <IncomingCallDialog
                    peer={call.peer}
                    onAccept={() => acceptCall(call.session)}
                    onDecline={() => void call.session.decline("declined")}
                />
            )}
            {call && call.state.phase !== "incoming" && (
                <CallBar
                    call={call}
                    micOff={audio.micOff}
                    deafened={audio.deafened}
                    onHangUp={() => call.session.hangUp()}
                    onClose={() => setCall((current) => (current?.key === call.key ? null : current))}
                    onSettings={() => setSettingsOpen(true)}
                />
            )}
            {settingsOpen && <AudioSettingsDialog onClose={() => setSettingsOpen(false)} />}
        </VoiceCallContext.Provider>
    );
}

/**
 * A call always starts with the microphone and sound on: the Social toggles
 * are remembered between visits, and a forgotten "muted" made calls silent.
 */
function unmuteForCall() {
    setSocialAudio({ micOff: false, deafened: false });
}

function toggleMic(micOff: boolean) {
    setSocialAudio(micOff ? { micOff: false, deafened: false } : { micOff: true, deafened: false });
}

function toggleDeafen(deafened: boolean) {
    setSocialAudio(deafened ? { micOff: false, deafened: false } : { micOff: true, deafened: true });
}

function IncomingCallDialog({ peer, onAccept, onDecline }: { peer: CallPeer; onAccept: () => void; onDecline: () => void }) {
    const { tx } = useI18n();
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        ref.current?.focus();
    }, []);
    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm">
            <div ref={ref} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="incoming-call-name" aria-describedby="incoming-call-text" className="w-full max-w-[20rem] rounded-2xl bg-zinc-900 p-6 text-center text-white shadow-2xl outline-none ring-1 ring-white/10">
                <div className="relative mx-auto h-24 w-24">
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/25" aria-hidden />
                    <PresenceAvatar src={peer.avatarUrl ?? null} name={peer.username} size="xl" className="relative" />
                </div>
                <h2 id="incoming-call-name" className="mt-5 truncate text-xl font-bold">{peer.username}</h2>
                <StaffBadge role={parseStaffRole(peer.staffRole)} size="sm" className="mx-auto mt-1" />
                <p id="incoming-call-text" className="mt-1 text-sm text-zinc-400">{tx(C.incoming)}</p>
                <div className="mt-7 flex items-center justify-center gap-10">
                    <button type="button" onClick={onDecline} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 transition hover:bg-red-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400/50" aria-label={tx(C.decline)} title={tx(C.decline)}><PhoneOff className="h-6 w-6" aria-hidden /></button>
                    <button type="button" onClick={onAccept} className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/50" aria-label={tx(C.accept)} title={tx(C.accept)}><Phone className="h-6 w-6" aria-hidden /></button>
                </div>
                <p className="mt-6 flex items-start justify-center gap-1.5 text-start text-[11px] leading-4 text-zinc-500"><ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />{tx(C.privacy)}</p>
            </div>
        </div>
    );
}

function useClock(active: boolean) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [active]);
    return now;
}

/** The running call: a floating bar at the top that leaves the page usable. */
function CallBar({ call, micOff, deafened, onHangUp, onClose, onSettings }: { call: ActiveCall; micOff: boolean; deafened: boolean; onHangUp: () => void; onClose: () => void; onSettings: () => void }) {
    const { tx } = useI18n();
    const { state, peer } = call;
    const now = useClock(state.phase === "active");
    const ended = state.phase === "ended";
    const active = state.phase === "active";
    const statusText = active
        ? tx(C.connected, { time: duration(now - state.connectedAt) })
        : state.phase === "connecting" ? tx(C.connecting)
            : state.phase === "ringing" ? tx(C.ringing)
                : state.phase === "preparing" ? tx(C.preparing)
                    : state.notice ? tx(NOTICES[state.notice], { name: peer.username }) : tx(NOTICES.ended);
    const hint = !ended && state.slow ? tx(state.turnConfigured ? C.slowTurn : C.slow) : "";
    const longNotice = ended && state.notice && LONG_NOTICES.has(state.notice);
    // Why nobody hears anything, most actionable first; one line at a time.
    const problem = ended ? null
        : micOff ? { text: tx(C.mutedWarning), action: tx(C.turnOn), run: () => toggleMic(true), danger: true }
            : deafened ? { text: tx(C.deafenedWarning), action: tx(C.turnOn), run: () => toggleDeafen(true), danger: true }
                : state.audioBlocked ? { text: tx(C.audioBlocked), action: tx(C.startAudio), run: () => call.session.resumeAudio(), danger: true }
                    : active && state.micSilent ? { text: tx(C.micSilent), action: tx(C.settings), run: onSettings, danger: false }
                        : active && state.noIncomingAudio ? { text: tx(C.noIncomingAudio), action: null, run: null, danger: false }
                            : active && state.remoteMuted ? { text: tx(C.remoteMuted, { name: peer.username }), action: null, run: null, danger: false }
                                : null;

    return (
        // Below the site header (64 px) and Social's channel header (48 px), clear of the composer and the AI dock.
        <div className="pointer-events-none fixed inset-x-0 top-[4.25rem] z-[140] flex justify-center px-2">
            <section
                aria-label={tx(C.region)}
                data-call-phase={state.phase}
                data-call-route={state.route ?? ""}
                data-call-received-kb={state.receivedKb}
                data-remote-speaking={state.remoteSpeaking ? "true" : "false"}
                data-mic-off={micOff ? "true" : "false"}
                className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 text-white shadow-2xl shadow-black/30 backdrop-blur"
            >
                <div className="flex items-center gap-3 px-3 py-2">
                    <span className={`relative shrink-0 rounded-full transition-shadow ${state.remoteSpeaking ? "shadow-[0_0_0_3px_rgb(16,185,129)]" : ""}`}>
                        <PresenceAvatar src={peer.avatarUrl ?? null} name={peer.username} size="sm" />
                        {active && state.remoteMuted && (
                            <span className="absolute -bottom-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 ring-2 ring-zinc-900"><MicOff className="h-2.5 w-2.5" aria-hidden /></span>
                        )}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{peer.username}</p>
                        <p aria-live="polite" className={`truncate text-xs ${active ? "font-semibold text-emerald-400" : ended && longNotice ? "text-amber-300" : "text-zinc-400"}`}>
                            {longNotice ? tx(NOTICES.ended) : statusText}
                            {active && state.route ? <span className="ms-1.5 font-normal text-zinc-400">· {tx(state.route === "relay" ? C.routeRelay : C.routeDirect)}</span> : null}
                        </p>
                    </div>
                    {ended ? (
                        <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-label={tx(C.close)} title={tx(C.close)}><X className="h-5 w-5" aria-hidden /></button>
                    ) : (
                        <div className="flex shrink-0 items-center gap-1.5">
                            <BarButton label={tx(micOff ? C.unmute : C.mute)} pressed={micOff} danger={micOff} onClick={() => toggleMic(micOff)}>
                                {micOff ? <MicOff className="h-[18px] w-[18px]" aria-hidden /> : <Mic className={`h-[18px] w-[18px] ${state.localSpeaking ? "text-emerald-400" : ""}`} aria-hidden />}
                            </BarButton>
                            <BarButton label={tx(deafened ? C.undeafen : C.deafen)} pressed={deafened} danger={deafened} onClick={() => toggleDeafen(deafened)}>
                                {deafened ? <HeadphoneOff className="h-[18px] w-[18px]" aria-hidden /> : <Headphones className="h-[18px] w-[18px]" aria-hidden />}
                            </BarButton>
                            <BarButton label={tx(C.settings)} pressed={false} danger={false} onClick={onSettings}>
                                <Settings2 className="h-[18px] w-[18px]" aria-hidden />
                            </BarButton>
                            <button type="button" onClick={onHangUp} className="flex h-9 w-11 items-center justify-center rounded-full bg-red-500 transition hover:bg-red-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400/50" aria-label={tx(state.phase === "active" || state.phase === "connecting" ? C.hangUp : C.cancel)} title={tx(state.phase === "active" || state.phase === "connecting" ? C.hangUp : C.cancel)}>
                                <PhoneOff className="h-[18px] w-[18px]" aria-hidden />
                            </button>
                        </div>
                    )}
                </div>
                {problem && (
                    <div role="status" className={`flex items-center gap-2 border-t border-white/10 px-3 py-2 text-xs leading-5 ${problem.danger ? "bg-red-500/15 text-red-200" : "bg-amber-500/10 text-amber-200"}`}>
                        {state.audioBlocked && !micOff && !deafened ? <Volume2 className="h-4 w-4 shrink-0" aria-hidden /> : null}
                        <span className="min-w-0 flex-1">{problem.text}</span>
                        {problem.action && problem.run ? (
                            <button type="button" onClick={problem.run} className="shrink-0 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                                {problem.action}
                            </button>
                        ) : null}
                    </div>
                )}
                {(hint || longNotice) && (
                    <p role={longNotice ? "alert" : "status"} className="border-t border-white/10 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
                        {longNotice && state.notice ? tx(NOTICES[state.notice], { name: peer.username }) : hint}
                    </p>
                )}
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
            className={`flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${danger ? "bg-red-500/15 text-red-400 hover:bg-red-500/25" : "bg-white/10 text-zinc-200 hover:bg-white/20"}`}
        >
            {children}
        </button>
    );
}
