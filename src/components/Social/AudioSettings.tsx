"use client";

import { LoaderCircle, Mic, Play, Square, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { setAudioDevices, useAudioDevices } from "@/lib/social/local-state";

const C = {
    title: { TR: "Ses ayarları", EN: "Voice settings" },
    close: { TR: "Kapat", EN: "Close" },
    input: { TR: "Mikrofon", EN: "Microphone" },
    output: { TR: "Hoparlör / kulaklık", EN: "Speaker / headphones" },
    systemDefault: { TR: "Sistem varsayılanı", EN: "System default" },
    unnamedInput: { TR: "Mikrofon {n}", EN: "Microphone {n}" },
    unnamedOutput: { TR: "Hoparlör {n}", EN: "Speaker {n}" },
    allowNames: { TR: "Aygıt adlarını görmek için mikrofon izni ver", EN: "Allow the microphone to see device names" },
    noSink: { TR: "Bu tarayıcı çıkış aygıtı seçmeye izin vermiyor; sistemin varsayılan hoparlörü kullanılır.", EN: "This browser doesn't let sites pick the output device; the system's default speaker is used." },
    micTest: { TR: "Mikrofon testi", EN: "Microphone test" },
    startTest: { TR: "Testi başlat", EN: "Start test" },
    stopTest: { TR: "Testi durdur", EN: "Stop test" },
    testHint: { TR: "Konuş: çubuk hareket ediyorsa mikrofonun çalışıyor.", EN: "Say something: if the bar moves, your microphone works." },
    testSilent: { TR: "Mikrofondan ses gelmiyor. Başka bir mikrofon seç ya da sistem ayarlarında mikrofonun kapalı olmadığını kontrol et.", EN: "No sound is coming from the microphone. Pick another one or check that it isn't muted in your system settings." },
    level: { TR: "Mikrofon seviyesi", EN: "Microphone level" },
    speakerTest: { TR: "Test sesi çal", EN: "Play a test sound" },
    speakerHint: { TR: "Sesi duyamıyorsan yukarıdan başka bir hoparlör seç.", EN: "If you can't hear it, pick another speaker above." },
    micDenied: { TR: "Mikrofon izni verilmedi. Adres çubuğundaki kilit simgesinden izin verip tekrar dene.", EN: "Microphone access was denied. Allow it from the lock icon in the address bar and try again." },
    micMissing: { TR: "Mikrofon bulunamadı.", EN: "No microphone was found." },
    micBusy: { TR: "Mikrofon açılamadı; başka bir uygulama kullanıyor olabilir.", EN: "The microphone couldn't be opened; another app may be using it." },
    stored: { TR: "Seçimlerin bu tarayıcıda saklanır; aramalarda ve sesli mesajlarda kullanılır.", EN: "Your choices are kept in this browser and used for calls and voice messages." },
} satisfies Record<string, Copy>;

type Device = { id: string; label: string };
type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

function micError(error: unknown) {
    const name = (error as { name?: string } | null)?.name ?? "";
    if (name === "NotFoundError" || name === "OverconstrainedError") return C.micMissing;
    if (name === "NotReadableError" || name === "AbortError") return C.micBusy;
    return C.micDenied;
}

async function listDevices(): Promise<MediaDeviceInfo[]> {
    try {
        return navigator.mediaDevices?.enumerateDevices ? await navigator.mediaDevices.enumerateDevices() : [];
    } catch {
        return [];
    }
}

function sinkSupported() {
    return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

/**
 * Discord's "Voice & Video" in small: the microphone and speaker used for
 * calls and voice messages, a live microphone meter and a test sound on the
 * chosen speaker. The choice lives in this browser (local-state.ts).
 */
export default function AudioSettingsDialog({ onClose }: { onClose: () => void }) {
    const { tx } = useI18n();
    const titleId = useId();
    const devices = useAudioDevices();
    const [inputs, setInputs] = useState<Device[]>([]);
    const [outputs, setOutputs] = useState<Device[]>([]);
    const [named, setNamed] = useState(true);
    const [error, setError] = useState<Copy | null>(null);
    const [testing, setTesting] = useState(false);
    const [starting, setStarting] = useState(false);
    const [level, setLevel] = useState(0);
    const [silent, setSilent] = useState(false);
    const closeRef = useRef<HTMLButtonElement | null>(null);
    const testRef = useRef<{ stream: MediaStream; context: AudioContext; frame: number } | null>(null);

    const refresh = useCallback(() => listDevices().then((list) => {
        const pick = (kind: MediaDeviceKind) => list
            .filter((device) => device.kind === kind && device.deviceId && device.deviceId !== "default" && device.deviceId !== "communications")
            .map((device, index) => ({ id: device.deviceId, label: device.label || tx(kind === "audioinput" ? C.unnamedInput : C.unnamedOutput, { n: index + 1 }) }));
        setInputs(pick("audioinput"));
        setOutputs(pick("audiooutput"));
        // Without permission the browser hides device names (and often the devices).
        setNamed(!list.length || list.some((device) => device.kind === "audioinput" && device.label));
    }), [tx]);

    const stopTest = useCallback(() => {
        const test = testRef.current;
        testRef.current = null;
        if (test) {
            window.cancelAnimationFrame(test.frame);
            test.stream.getTracks().forEach((track) => track.stop());
            void test.context.close().catch(() => undefined);
        }
        setTesting(false);
        setLevel(0);
        setSilent(false);
    }, []);

    useEffect(() => {
        closeRef.current?.focus();
        void refresh();
        const mediaDevices = navigator.mediaDevices;
        const onChange = () => void refresh();
        mediaDevices?.addEventListener?.("devicechange", onChange);
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            mediaDevices?.removeEventListener?.("devicechange", onChange);
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose, refresh]);

    // The test always uses the microphone currently chosen.
    useEffect(() => stopTest, [devices.input, stopTest]);

    const allowNames = async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            stream.getTracks().forEach((track) => track.stop());
            await refresh();
        } catch (failure) {
            setError(micError(failure));
        }
    };

    const startTest = async () => {
        if (testRef.current || starting) return;
        setError(null);
        setStarting(true);
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(devices.input ? { deviceId: { ideal: devices.input } } : {}) },
                video: false,
            });
        } catch (failure) {
            setStarting(false);
            setError(micError(failure));
            return;
        }
        void refresh();
        const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) {
            stream.getTracks().forEach((track) => track.stop());
            setStarting(false);
            return;
        }
        const context = new AudioContextClass();
        void context.resume().catch(() => undefined);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser);
        const buffer = new Uint8Array(analyser.fftSize);
        const started = performance.now();
        let loudest = 0;
        const frame = () => {
            const test = testRef.current;
            if (!test) return;
            analyser.getByteTimeDomainData(buffer);
            let sum = 0;
            for (const value of buffer) {
                const sample = (value - 128) / 128;
                sum += sample * sample;
            }
            const rms = Math.sqrt(sum / buffer.length);
            loudest = Math.max(loudest, rms);
            setLevel(Math.min(1, rms * 6));
            setSilent(performance.now() - started > 3_000 && loudest < 0.0004);
            test.frame = window.requestAnimationFrame(frame);
        };
        testRef.current = { stream, context, frame: window.requestAnimationFrame(frame) };
        setStarting(false);
        setTesting(true);
    };

    const playTestSound = async () => {
        const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        const context = new AudioContextClass();
        await context.resume().catch(() => undefined);
        // Played through an <audio> element so the chosen speaker (setSinkId) applies.
        const destination = context.createMediaStreamDestination();
        const now = context.currentTime + 0.05;
        [523.25, 659.25, 783.99].forEach((frequency, index) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0, now + index * 0.18);
            gain.gain.linearRampToValueAtTime(0.2, now + index * 0.18 + 0.02);
            gain.gain.linearRampToValueAtTime(0, now + index * 0.18 + 0.16);
            oscillator.connect(gain).connect(destination);
            oscillator.start(now + index * 0.18);
            oscillator.stop(now + index * 0.18 + 0.18);
        });
        const audio = new Audio() as SinkAudio;
        audio.srcObject = destination.stream;
        if (devices.output && typeof audio.setSinkId === "function") await audio.setSinkId(devices.output).catch(() => undefined);
        await audio.play().catch(() => undefined);
        window.setTimeout(() => {
            audio.pause();
            audio.srcObject = null;
            void context.close().catch(() => undefined);
        }, 900);
    };

    const select = "mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-white/10 dark:bg-zinc-950 dark:text-white";
    const inputKnown = !devices.input || inputs.some((device) => device.id === devices.input);
    const outputKnown = !devices.output || outputs.some((device) => device.id === devices.output);

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl dark:border-white/10 dark:bg-zinc-900 dark:text-white">
                <div className="flex items-center justify-between gap-3">
                    <h2 id={titleId} className="text-lg font-bold">{tx(C.title)}</h2>
                    <button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-white/10 dark:hover:text-white" aria-label={tx(C.close)}>
                        <X className="h-4 w-4" aria-hidden />
                    </button>
                </div>

                <label className="mt-4 block text-[12px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {tx(C.input)}
                    <select className={select} value={inputKnown ? devices.input ?? "" : ""} onChange={(event) => setAudioDevices({ input: event.target.value || null })}>
                        <option value="">{tx(C.systemDefault)}</option>
                        {inputs.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}
                    </select>
                </label>
                {!named && (
                    <button type="button" onClick={() => void allowNames()} className="mt-2 text-[13px] font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300">{tx(C.allowNames)}</button>
                )}

                <label className="mt-4 block text-[12px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {tx(C.output)}
                    {sinkSupported() ? (
                        <select className={select} value={outputKnown ? devices.output ?? "" : ""} onChange={(event) => setAudioDevices({ output: event.target.value || null })}>
                            <option value="">{tx(C.systemDefault)}</option>
                            {outputs.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}
                        </select>
                    ) : (
                        <span className="mt-1.5 block text-[13px] font-normal normal-case tracking-normal text-zinc-500 dark:text-zinc-400">{tx(C.noSink)}</span>
                    )}
                </label>

                <div className="mt-5 rounded-xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between gap-3">
                        <p className="flex items-center gap-2 text-sm font-semibold"><Mic className="h-4 w-4 text-zinc-500" aria-hidden />{tx(C.micTest)}</p>
                        <button type="button" onClick={() => (testing ? stopTest() : void startTest())} disabled={starting} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-[13px] font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60">
                            {starting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : testing ? <Square className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                            {tx(testing ? C.stopTest : C.startTest)}
                        </button>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" role="meter" aria-label={tx(C.level)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
                        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
                    </div>
                    <p className={`mt-2 text-[12.5px] leading-5 ${silent ? "font-semibold text-amber-600 dark:text-amber-300" : "text-zinc-500 dark:text-zinc-400"}`} aria-live="polite">
                        {tx(silent ? C.testSilent : C.testHint)}
                    </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
                    <button type="button" onClick={() => void playTestSound()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-[13px] font-semibold transition hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/10">
                        <Volume2 className="h-4 w-4" aria-hidden />{tx(C.speakerTest)}
                    </button>
                    <p className="min-w-0 flex-1 text-[12.5px] leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.speakerHint)}</p>
                </div>

                {error && <p role="alert" className="mt-3 text-[13px] font-semibold text-red-600 dark:text-red-400">{tx(error)}</p>}
                <p className="mt-4 text-[12px] leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.stored)}</p>
            </div>
        </div>
    );
}
