"use client";

import { AlertTriangle, HeadphoneOff, LoaderCircle, MicOff, ShieldCheck, Volume2 } from "lucide-react";
import { UserAvatar, cx } from "@/components/Groups/ui";
import { useGroupVoice, useVoiceRoom } from "@/components/GroupVoiceProvider";
import { useVoiceCall } from "@/components/VoiceCallProvider";
import { useI18n, type Copy } from "@/lib/i18n";
import { useSocialAudio } from "@/lib/social/local-state";
import { VOICE_LIMITS, type VoiceParticipant } from "@/lib/social/voice";
import { SectionLabel } from "./ui";

const C = {
    title: { TR: "Sesli kanallar", EN: "Voice channels" },
    join: { TR: "{name} sesli kanalına katıl", EN: "Join the {name} voice channel" },
    inChannel: { TR: "{name} sesli kanalındakiler", EN: "People in the {name} voice channel" },
    current: { TR: "{name} sesli kanalındasın", EN: "You're in the {name} voice channel" },
    full: { TR: "Dolu", EN: "Full" },
    fullHint: { TR: "Kanal dolu (en fazla {max} kişi).", EN: "The channel is full ({max} people at most)." },
    inCall: { TR: "Önce aramayı bitir.", EN: "End your call first." },
    count: { TR: "{count}/{max} kişi", EN: "{count} of {max} people" },
    you: { TR: "sen", EN: "you" },
    muted: { TR: "mikrofonu kapalı", EN: "muted" },
    deafened: { TR: "sesi kapalı", EN: "deafened" },
    connecting: { TR: "bağlanıyor", EN: "connecting" },
    failed: { TR: "bağlantı kurulamadı", EN: "couldn't connect" },
    privacy: { TR: "Ses kaydedilmez; kanalda kimlerin olduğunu yalnızca grup üyeleri görür.", EN: "Audio is never recorded; only group members can see who is in the channel." },
    turn: { TR: "Biriyle bağlantı kurulamadı. Bazı ağlar (mobil veri, kurumsal veya okul ağları) doğrudan bağlantıyı engeller; bu ağlarda sitenin bir TURN sunucusu kullanması gerekir.", EN: "Someone couldn't be connected. Some networks (mobile data, company or school networks) block direct connections; on them the site needs a TURN server." },
} satisfies Record<string, Copy>;

/**
 * The group's voice channel in the channel list: who is in it (with speaking
 * rings and microphone and sound marks, like Discord), and a click to join.
 * One channel per group, up to five people connected to each other.
 */
export default function VoiceChannelSection({ groupId, groupName, emoji, channel }: { groupId: string; groupName: string; emoji: string; channel: string }) {
    const { tx } = useI18n();
    const voice = useGroupVoice();
    const call = useVoiceCall();
    const audio = useSocialAudio();
    const participants = useVoiceRoom(groupId);
    const state = voice.group?.id === groupId ? voice.state : null;
    const connected = state?.phase === "connected";
    const joining = state?.phase === "joining";
    const max = VOICE_LIMITS.people;
    const full = !state && participants.length >= max;
    const inCall = call.status !== "idle" && call.status !== "incoming";
    const blockedReason = full ? tx(C.fullHint, { max }) : inCall ? tx(C.inCall) : "";
    const failed = connected && Object.values(state.connections).includes("failed");
    const listId = `voice-${groupId}`;

    return (
        <>
            <SectionLabel id="group-voice">{tx(C.title)}</SectionLabel>
            <ul aria-labelledby="group-voice" className="space-y-0.5">
                <li>
                    {state ? (
                        <p
                            aria-current="true"
                            aria-label={tx(C.current, { name: channel })}
                            className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1.5 text-[15px] font-semibold text-emerald-700 dark:text-emerald-300"
                        >
                            {joining ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" aria-hidden /> : <Volume2 className="h-5 w-5 shrink-0" aria-hidden />}
                            <span className="min-w-0 flex-1 truncate">{channel}</span>
                            <CountPill count={participants.length} max={max} />
                        </p>
                    ) : (
                        <button
                            type="button"
                            onClick={() => voice.join({ id: groupId, name: groupName, emoji, channel })}
                            disabled={Boolean(blockedReason)}
                            aria-label={tx(C.join, { name: channel })}
                            aria-describedby={participants.length ? listId : undefined}
                            title={blockedReason || tx(C.join, { name: channel })}
                            className="group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-start text-[15px] font-medium text-zinc-600 transition hover:bg-zinc-200/70 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100"
                        >
                            <Volume2 className="h-5 w-5 shrink-0 text-zinc-400 transition group-hover:text-emerald-500 group-disabled:group-hover:text-zinc-400" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{channel}</span>
                            {full ? <span className="shrink-0 rounded-full bg-zinc-200 px-1.5 text-[11px] font-bold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">{tx(C.full)}</span> : <CountPill count={participants.length} max={max} />}
                        </button>
                    )}
                    {participants.length > 0 && (
                        <ul id={listId} aria-label={tx(C.inChannel, { name: channel })} className="mt-0.5 space-y-px">
                            {participants.map((entry) => (
                                <Member
                                    key={entry.id}
                                    entry={entry}
                                    self={entry.id === state?.self}
                                    micOff={entry.id === state?.self ? audio.micOff || audio.deafened : entry.muted}
                                    deafened={entry.id === state?.self ? audio.deafened : entry.deafened}
                                    speaking={Boolean(connected && state.speaking.includes(entry.id))}
                                    connection={connected && entry.id !== state.self ? state.connections[entry.id] ?? "connecting" : null}
                                />
                            ))}
                        </ul>
                    )}
                    {failed && !state.turnConfigured && (
                        <p className="mx-2 mt-1 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-4 text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />{tx(C.turn)}
                        </p>
                    )}
                    {connected && (
                        <p className="mt-1 flex items-start gap-1.5 px-2 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                            <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />{tx(C.privacy)}
                        </p>
                    )}
                </li>
            </ul>
        </>
    );
}

function CountPill({ count, max }: { count: number; max: number }) {
    const { tx } = useI18n();
    if (!count) return null;
    return (
        <span className="shrink-0 rounded-full bg-zinc-200 px-1.5 text-[11px] font-semibold tabular-nums text-zinc-600 dark:bg-white/10 dark:text-zinc-300" aria-label={tx(C.count, { count, max })}>
            {count}/{max}
        </span>
    );
}

function Member({ entry, self, micOff, deafened, speaking, connection }: {
    entry: VoiceParticipant;
    self: boolean;
    micOff: boolean;
    deafened: boolean;
    speaking: boolean;
    connection: "connecting" | "connected" | "failed" | null;
}) {
    const { tx } = useI18n();
    const states = [
        self ? tx(C.you) : "",
        micOff ? tx(C.muted) : "",
        deafened ? tx(C.deafened) : "",
        connection === "connecting" ? tx(C.connecting) : connection === "failed" ? tx(C.failed) : "",
    ].filter(Boolean);
    return (
        <li data-speaking={speaking ? "true" : "false"} className="flex items-center gap-2 rounded-md py-1 pe-2 ps-8 text-[13px]">
            <span className={cx("shrink-0 rounded-full transition-shadow duration-150", speaking && !micOff && "shadow-[0_0_0_2px_rgb(16,185,129)]")}>
                <UserAvatar name={entry.name} src={entry.avatarUrl} size="xs" />
            </span>
            <span className={cx("min-w-0 flex-1 truncate", speaking && !micOff ? "font-semibold text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-zinc-400")}>
                {entry.name}
                {states.length ? <span className="sr-only">{` (${states.join(", ")})`}</span> : null}
            </span>
            {connection === "connecting" && <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" aria-hidden />}
            {connection === "failed" && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />}
            {micOff && <MicOff className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />}
            {deafened && <HeadphoneOff className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />}
        </li>
    );
}
