/**
 * Procedural sound effects (no audio files needed, works offline and in the
 * exported HTML build). Uses the Web Audio API.
 */
import type { SoundPreset } from "../types";

type Envelope = { attack: number; decay: number; sustain: number; release: number };

export class SoundEngine {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    volume = 0.7;
    muted = false;
    private lastPlayed = new Map<string, number>();

    private ensure(): AudioContext | null {
        if (typeof window === "undefined") return null;
        if (!this.context) {
            const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtor) return null;
            this.context = new AudioCtor();
            this.master = this.context.createGain();
            this.master.gain.value = this.volume;
            this.master.connect(this.context.destination);
        }
        if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
        return this.context;
    }

    /** Must be called from a user gesture (e.g. the Play button) on mobile browsers. */
    unlock() {
        this.ensure();
    }

    setVolume(value: number) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    }

    setMuted(muted: boolean) {
        this.muted = muted;
        if (this.master) this.master.gain.value = muted ? 0 : this.volume;
    }

    private noise(context: AudioContext) {
        if (!this.noiseBuffer) {
            const length = context.sampleRate;
            const buffer = context.createBuffer(1, length, context.sampleRate);
            const data = buffer.getChannelData(0);
            for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
            this.noiseBuffer = buffer;
        }
        return this.noiseBuffer;
    }

    private tone(type: OscillatorType, frequencies: Array<[number, number]>, envelope: Envelope, volume: number, pitch: number, when = 0) {
        const context = this.ensure();
        if (!context || !this.master) return;
        const start = context.currentTime + when;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        frequencies.forEach(([frequency, time], index) => {
            const value = Math.max(20, frequency * pitch);
            if (index === 0) oscillator.frequency.setValueAtTime(value, start + time);
            else oscillator.frequency.exponentialRampToValueAtTime(value, start + time);
        });
        const peak = Math.max(0.0001, volume);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + envelope.attack);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * envelope.sustain), start + envelope.attack + envelope.decay);
        const end = start + envelope.attack + envelope.decay + envelope.release;
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain);
        gain.connect(this.master);
        oscillator.start(start);
        oscillator.stop(end + 0.02);
    }

    private burst(duration: number, volume: number, filterFrom: number, filterTo: number, when = 0) {
        const context = this.ensure();
        if (!context || !this.master) return;
        const start = context.currentTime + when;
        const source = context.createBufferSource();
        source.buffer = this.noise(context);
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(filterFrom, start);
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), start + duration);
        const gain = context.createGain();
        gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        source.start(start);
        source.stop(start + duration + 0.05);
    }

    play(preset: SoundPreset | string, volume = 1, pitch = 1) {
        if (this.muted) return;
        const context = this.ensure();
        if (!context) return;
        // Avoid ear-splitting stacking when many objects trigger the same sound.
        const now = performance.now();
        const last = this.lastPlayed.get(preset) ?? 0;
        if (now - last < 30) return;
        this.lastPlayed.set(preset, now);
        const v = Math.max(0, Math.min(1, volume)) * 0.5;
        const p = Math.max(0.1, Math.min(4, pitch));
        switch (preset) {
            case "coin":
                this.tone("square", [[988, 0]], { attack: 0.005, decay: 0.07, sustain: 0.6, release: 0.05 }, v * 0.5, p);
                this.tone("square", [[1319, 0]], { attack: 0.005, decay: 0.12, sustain: 0.5, release: 0.15 }, v * 0.5, p, 0.07);
                break;
            case "jump":
                this.tone("square", [[260, 0], [640, 0.16]], { attack: 0.01, decay: 0.12, sustain: 0.4, release: 0.08 }, v * 0.45, p);
                break;
            case "hit":
                this.burst(0.18, v * 0.9, 3200, 300);
                this.tone("sine", [[180, 0], [60, 0.15]], { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.08 }, v * 0.8, p);
                break;
            case "explosion":
                this.burst(0.9, v * 1.2, 2200, 60);
                this.tone("sawtooth", [[120, 0], [30, 0.6]], { attack: 0.01, decay: 0.3, sustain: 0.3, release: 0.4 }, v * 0.5, p);
                break;
            case "laser":
            case "shoot":
                this.tone("sawtooth", [[1400, 0], [220, 0.18]], { attack: 0.005, decay: 0.12, sustain: 0.3, release: 0.08 }, v * 0.35, p);
                break;
            case "powerup":
                [523, 659, 784, 1046].forEach((frequency, index) => this.tone("triangle", [[frequency, 0]], { attack: 0.005, decay: 0.07, sustain: 0.6, release: 0.06 }, v * 0.45, p, index * 0.07));
                break;
            case "click":
                this.tone("square", [[1800, 0]], { attack: 0.001, decay: 0.02, sustain: 0.2, release: 0.02 }, v * 0.3, p);
                break;
            case "blip":
                this.tone("sine", [[880, 0]], { attack: 0.005, decay: 0.05, sustain: 0.5, release: 0.05 }, v * 0.5, p);
                break;
            case "lose":
                [392, 330, 262, 196].forEach((frequency, index) => this.tone("triangle", [[frequency, 0]], { attack: 0.01, decay: 0.12, sustain: 0.6, release: 0.12 }, v * 0.45, p, index * 0.16));
                break;
            case "win":
                [523, 659, 784, 1046, 1319].forEach((frequency, index) => this.tone("square", [[frequency, 0]], { attack: 0.005, decay: 0.08, sustain: 0.6, release: 0.1 }, v * 0.35, p, index * 0.09));
                break;
            case "step":
                this.burst(0.06, v * 0.4, 900, 200);
                break;
            default:
                this.tone("sine", [[660, 0]], { attack: 0.005, decay: 0.08, sustain: 0.4, release: 0.06 }, v * 0.4, p);
        }
    }

    dispose() {
        void this.context?.close().catch(() => undefined);
        this.context = null;
        this.master = null;
        this.noiseBuffer = null;
    }
}
