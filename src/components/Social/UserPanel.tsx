"use client";

import { HeadphoneOff, Headphones, Mic, MicOff, PhoneOff, Settings, Signal, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/components/Groups/ui";
import PresenceAvatar from "@/components/PresenceAvatar";
import StatusMenu from "@/components/StatusMenu";
import { useVoiceCall } from "@/components/VoiceCallProvider";
import { useI18n, type Copy } from "@/lib/i18n";
import { PRESENCE_STATUS_COPY } from "@/lib/presence";
import { formatFriendTag } from "@/lib/social/model";
import { useSocial } from "./context";

const C = {
    panel: { TR: "Hesabın", EN: "Your account" },
    status: { TR: "Durumunu değiştir ({status})", EN: "Change your status ({status})" },
    mute: { TR: "Mikrofonu sessize al", EN: "Mute microphone" },
    deafen: { TR: "Sesi kapat", EN: "Deafen" },
    statusMenu: { TR: "Durumun", EN: "Your status" },
    settings: { TR: "Hanogt Social ayarları", EN: "Hanogt Social settings" },
    inCall: { TR: "Ses bağlantısı kuruldu", EN: "Voice connected" },
    calling: { TR: "Aranıyor…", EN: "Calling…" },
    connecting: { TR: "Bağlanıyor…", EN: "Connecting…" },
    incoming: { TR: "Gelen arama…", EN: "Incoming call…" },
    disconnect: { TR: "Bağlantıyı kes", EN: "Disconnect" },
    audioHint: { TR: "Mikrofon kapalıyken görüşmede sesin gitmez; ses kapalıyken karşı tarafı duymazsın. Yeni bir arama başlatınca ya da yanıtlayınca ikisi de açılır.", EN: "With the microphone off you aren't heard in a call; with sound off you don't hear the other person. Both turn back on when you start or answer a call." },
    voiceSettings: { TR: "Ses ayarları (mikrofon ve hoparlör)", EN: "Voice settings (microphone and speaker)" },
} satisfies Record<string, Copy>;

/**
 * Bottom-left user panel: avatar with status (opens the status menu), name
 * and nickname#tag, microphone and headphone toggles for Hanogt Social's
 * voice messages, and the settings gear.
 */
export default function UserPanel() {
    const { tx } = useI18n();
    const { me, audio, ui } = useSocial();
    const call = useVoiceCall();
    const [open, setOpen] = useState(false);
    const menuId = useId();
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const statusLabel = tx(PRESENCE_STATUS_COPY[me.status]);
    const tag = formatFriendTag(me.nickname, me.nicknameTag);
    const subline = me.customStatus || tag || statusLabel;

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: PointerEvent) => {
            if (wrapRef.current && event.target instanceof Node && !wrapRef.current.contains(event.target)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
            }
        };
        document.addEventListener("pointerdown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <div ref={wrapRef} className="relative shrink-0" aria-label={tx(C.panel)} role="group">
            {call.status !== "idle" && call.peer && (
                // Discord's "Voice Connected" panel above the user panel.
                <div className="flex items-center gap-2 border-t border-zinc-200 bg-zinc-200/70 px-2.5 py-2 dark:border-white/5 dark:bg-black/40" role="status">
                    <span className="min-w-0 flex-1">
                        <span className={cx("flex items-center gap-1.5 text-[13px] font-bold", call.status === "active" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                            <Signal className="h-4 w-4 shrink-0" aria-hidden />
                            {tx(call.status === "active" ? C.inCall : call.status === "connecting" ? C.connecting : call.status === "incoming" ? C.incoming : C.calling)}
                        </span>
                        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {call.peer.username}{call.status === "active" && call.connectedAt ? <> · <CallTimer since={call.connectedAt} /></> : null}
                        </span>
                    </span>
                    {call.status !== "incoming" && (
                        <button type="button" onClick={call.hangUp} aria-label={tx(C.disconnect)} title={tx(C.disconnect)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400">
                            <PhoneOff className="h-[18px] w-[18px]" aria-hidden />
                        </button>
                    )}
                </div>
            )}
            <div className="flex h-[52px] items-center gap-0.5 bg-zinc-200/70 px-1.5 dark:bg-black/40">
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-controls={open ? menuId : undefined}
                    aria-label={tx(C.status, { status: statusLabel })}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-start transition hover:bg-zinc-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-white/10"
                >
                    <PresenceAvatar src={me.avatarUrl} name={me.username} status={me.status} size="sm" ring="bg-zinc-200 dark:bg-zinc-950" />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold leading-4 text-zinc-900 dark:text-white">{me.username}</span>
                        <span className="block truncate text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">{subline}</span>
                    </span>
                </button>
                <PanelButton label={tx(C.mute)} pressed={audio.micOff} danger={audio.micOff} onClick={audio.toggleMic}>
                    {audio.micOff ? <MicOff className="h-[18px] w-[18px]" aria-hidden /> : <Mic className="h-[18px] w-[18px]" aria-hidden />}
                </PanelButton>
                <PanelButton label={tx(C.deafen)} pressed={audio.deafened} danger={audio.deafened} onClick={audio.toggleDeafen}>
                    {audio.deafened ? <HeadphoneOff className="h-[18px] w-[18px]" aria-hidden /> : <Headphones className="h-[18px] w-[18px]" aria-hidden />}
                </PanelButton>
                <PanelButton label={tx(C.voiceSettings)} pressed={false} danger={false} onClick={() => ui.openSettings("voice")}>
                    <SlidersHorizontal className="h-[18px] w-[18px]" aria-hidden />
                </PanelButton>
                <PanelButton label={tx(C.settings)} pressed={false} danger={false} onClick={() => ui.openSettings("messages")}>
                    <Settings className="h-[18px] w-[18px]" aria-hidden />
                </PanelButton>
            </div>
            {open && (
                <div id={menuId} role="dialog" aria-label={tx(C.statusMenu)} className="absolute bottom-full start-1.5 z-30 mb-2 max-h-[70dvh] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
                    <StatusMenu email={me.email} />
                    {(audio.micOff || audio.deafened) && <p className="mt-3 border-t border-zinc-100 pt-2 text-[11px] leading-4 text-zinc-500 dark:border-white/[0.08] dark:text-zinc-400">{tx(C.audioHint)}</p>}
                </div>
            )}
        </div>
    );
}

function CallTimer({ since }: { since: number }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    const total = Math.max(0, Math.floor((now - since) / 1000));
    return <span className="tabular-nums">{`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`}</span>;
}

function PanelButton({ label, pressed, danger, onClick, children }: { label: string; pressed: boolean; danger: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            className={cx(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                danger ? "text-red-500 hover:bg-red-500/10" : "text-zinc-500 hover:bg-zinc-300/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white",
            )}
        >
            {children}
        </button>
    );
}
