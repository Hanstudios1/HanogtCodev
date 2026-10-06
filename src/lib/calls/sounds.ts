"use client";

/**
 * Call tones made with Web Audio (no sound files): a two-note ring for an
 * incoming call and a soft ringback while calling. Browsers may keep the
 * audio context suspended until the page has been clicked; the tone is then
 * simply silent. Returns a function that stops it.
 */
export function startTone(kind: "incoming" | "outgoing"): () => void {
    let context: AudioContext | null = null;
    try {
        const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return () => undefined;
        context = new AudioContextClass();
        void context.resume().catch(() => undefined);
    } catch {
        return () => undefined;
    }
    const notes: Array<[frequency: number, start: number, duration: number]> = kind === "incoming"
        ? [[659.25, 0, 0.32], [880, 0.38, 0.32], [659.25, 0.9, 0.32], [880, 1.28, 0.32]]
        : [[440, 0, 0.9]];
    const level = kind === "incoming" ? 0.11 : 0.05;
    const play = () => {
        const audio = context;
        if (!audio || audio.state === "closed") return;
        const now = audio.currentTime + 0.02;
        for (const [frequency, start, duration] of notes) {
            const oscillator = audio.createOscillator();
            const envelope = audio.createGain();
            oscillator.type = "sine";
            oscillator.frequency.value = frequency;
            envelope.gain.setValueAtTime(0, now + start);
            envelope.gain.linearRampToValueAtTime(level, now + start + 0.03);
            envelope.gain.setValueAtTime(level, now + start + duration - 0.06);
            envelope.gain.linearRampToValueAtTime(0, now + start + duration);
            oscillator.connect(envelope);
            envelope.connect(audio.destination);
            oscillator.start(now + start);
            oscillator.stop(now + start + duration + 0.05);
        }
    };
    play();
    const timer = window.setInterval(play, kind === "incoming" ? 3_000 : 3_500);
    return () => {
        window.clearInterval(timer);
        void context?.close().catch(() => undefined);
        context = null;
    };
}

/**
 * A short cue for voice channels: two rising notes when someone joins
 * (yourself included), two falling ones when someone leaves.
 */
export function playCue(kind: "join" | "leave") {
    try {
        const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        const context = new AudioContextClass();
        void context.resume().catch(() => undefined);
        const notes: Array<[frequency: number, start: number]> = kind === "join" ? [[523.25, 0], [783.99, 0.09]] : [[783.99, 0], [523.25, 0.09]];
        const now = context.currentTime + 0.02;
        for (const [frequency, start] of notes) {
            const oscillator = context.createOscillator();
            const envelope = context.createGain();
            oscillator.type = "sine";
            oscillator.frequency.value = frequency;
            envelope.gain.setValueAtTime(0, now + start);
            envelope.gain.linearRampToValueAtTime(0.07, now + start + 0.02);
            envelope.gain.linearRampToValueAtTime(0, now + start + 0.16);
            oscillator.connect(envelope);
            envelope.connect(context.destination);
            oscillator.start(now + start);
            oscillator.stop(now + start + 0.2);
        }
        window.setTimeout(() => void context.close().catch(() => undefined), 600);
    } catch {
        // No audio: the cue is simply silent.
    }
}
