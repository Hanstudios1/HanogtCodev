"use client";

import { AlertTriangle, Headphones, HeadphoneOff, LoaderCircle, Mic, MicOff, PhoneCall, PhoneOff, ShieldCheck } from "lucide-react";
import { COLLAB_COPY } from "@/lib/collab/copy";
import { IDLE_CALL, SELF_PEER, type MeshCallState } from "@/lib/collab/mesh-call";
import type { CollabPeer, CollabSession } from "@/lib/collab/session-client";
import { useCollabValue } from "@/lib/collab/use-editor-collab";
import { useI18n, type Copy } from "@/lib/i18n";

const C = {
    title: { TR: "Sesli sohbet", EN: "Voice chat" },
    idleHint: { TR: "Oturumdakilerle sesli konuş (en fazla 5 kişi).", EN: "Talk with the people in the session (up to 5)." },
    inCall: { TR: "Seste: {names}", EN: "In voice: {names}" },
    nobody: { TR: "Henüz sende başka kimse yok.", EN: "Nobody else is in voice yet." },
    joining: { TR: "Mikrofon hazırlanıyor…", EN: "Preparing the microphone…" },
    mute: { TR: "Mikrofonu kapat", EN: "Mute microphone" },
    unmute: { TR: "Mikrofonu aç", EN: "Unmute microphone" },
    deafen: { TR: "Sesi kapat (sağırlaştır)", EN: "Deafen" },
    undeafen: { TR: "Sesi aç", EN: "Undeafen" },
    micDenied: { TR: "Mikrofon izni verilmedi. Tarayıcının adres çubuğundan izin verip tekrar dene.", EN: "Microphone permission was denied. Allow it from the browser's address bar and try again." },
    micUnavailable: { TR: "Kullanılabilir bir mikrofon bulunamadı.", EN: "No usable microphone was found." },
    ice: { TR: "Ses bağlantısı hazırlanamadı. Biraz sonra tekrar dene.", EN: "The voice connection couldn't be prepared. Try again shortly." },
    unsupported: { TR: "Bu tarayıcı sesli sohbeti desteklemiyor.", EN: "This browser doesn't support voice chat." },
    noTurn: { TR: "Bazı ağlarda bağlantı için TURN sunucusu gerekebilir.", EN: "Some networks may need a TURN server to connect." },
    failed: { TR: "{name} ile ses bağlantısı kurulamadı; yeniden deneniyor.", EN: "Couldn't connect audio with {name}; retrying." },
    privacy: { TR: "Ses doğrudan katılımcılar arasında iletilir, kaydedilmez.", EN: "Audio goes directly between participants and is never recorded." },
} satisfies Record<string, Copy>;

const NO_PEERS: CollabPeer[] = [];

/** Join/leave, mute and deafen for the session's voice mesh. */
export default function CollabVoice({ session }: { session: CollabSession }) {
    const { tx } = useI18n();
    const call: MeshCallState = useCollabValue(session, (state) => state.call, IDLE_CALL);
    const peers = useCollabValue(session, (state) => state.peers, NO_PEERS);
    const active = useCollabValue(session, (state) => state.meta?.status === "active", false);
    const inVoice = peers.filter((peer) => peer.call?.on);
    const names = [...new Set(inVoice.map((peer) => peer.name))];
    const failed = inVoice.filter((peer) => call.connections[`${peer.key}:${peer.clientID}`] === "failed");
    const iconButton = (pressed: boolean) => `grid h-9 w-9 place-items-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${pressed ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"}`;
    const error = call.error === "mic_denied" ? C.micDenied : call.error === "mic_unavailable" ? C.micUnavailable : call.error === "ice" ? C.ice : call.error === "unsupported" ? C.unsupported : null;

    return (
        <section className="border-b border-zinc-200 px-3 py-2.5 dark:border-white/10" aria-label={tx(C.title)}>
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{tx(C.title)}</h3>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {call.status === "joining" ? tx(C.joining) : names.length ? tx(C.inCall, { names: names.join(", ") }) : call.status === "active" ? tx(C.nobody) : tx(C.idleHint)}
                    </p>
                </div>
                {call.status === "active" ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button type="button" onClick={() => session.toggleMute()} aria-pressed={call.muted} aria-label={tx(call.muted ? C.unmute : C.mute)} title={tx(call.muted ? C.unmute : C.mute)} className={`${iconButton(call.muted)} ${call.speaking.includes(SELF_PEER) ? "ring-2 ring-emerald-500" : ""}`}>
                            {call.muted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
                        </button>
                        <button type="button" onClick={() => session.toggleDeafen()} aria-pressed={call.deafened} aria-label={tx(call.deafened ? C.undeafen : C.deafen)} title={tx(call.deafened ? C.undeafen : C.deafen)} className={iconButton(call.deafened)}>
                            {call.deafened ? <HeadphoneOff className="h-4 w-4" aria-hidden /> : <Headphones className="h-4 w-4" aria-hidden />}
                        </button>
                        <button type="button" onClick={() => session.leaveCall()} aria-label={tx(COLLAB_COPY.leaveCall)} title={tx(COLLAB_COPY.leaveCall)} className="grid h-9 w-9 place-items-center rounded-xl bg-red-600 text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                            <PhoneOff className="h-4 w-4" aria-hidden />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => void session.joinCall()}
                        disabled={call.status === "joining" || !active}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60 dark:focus-visible:ring-offset-zinc-950"
                    >
                        {call.status === "joining" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <PhoneCall className="h-4 w-4" aria-hidden />}
                        {tx(COLLAB_COPY.joinCall)}
                    </button>
                )}
            </div>
            {error && (
                <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{tx(error)}
                </p>
            )}
            {call.status === "active" && failed.length > 0 && (
                <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-300">{tx(C.failed, { name: failed.map((peer) => peer.name).join(", ") })}</p>
            )}
            {call.status === "active" && !call.turnConfigured && failed.length > 0 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{tx(C.noTurn)}</p>}
            {call.status === "active" && (
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-400"><ShieldCheck className="h-3 w-3" aria-hidden />{tx(C.privacy)}</p>
            )}
        </section>
    );
}
