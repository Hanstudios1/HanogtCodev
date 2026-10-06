/**
 * Game audio with the Web Audio API: procedural sound effects (no files
 * needed, works offline and in the exported HTML build) and, since V4,
 * uploaded audio files: sound effects, looping sounds and a music channel
 * with fades. Files are decoded once (by hash) before or while the game runs.
 */
import type { AudioAsset, SoundPreset } from "../types";

type Envelope = { attack: number; decay: number; sustain: number; release: number };

/** A playing uploaded sound (AudioSource.Stop, looping sounds). */
export interface SoundHandle {
    stop(fadeSeconds?: number): void;
    readonly playing: boolean;
}

/** Bytes of an audio file by its asset entry (the player supplies where they come from). */
export type AudioBytesLoader = (asset: AudioAsset) => Promise<ArrayBuffer | null>;

export class SoundEngine {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private sfxBus: GainNode | null = null;
    private musicBus: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    volume = 0.7;
    musicVolume = 1;
    sfxVolume = 1;
    muted = false;
    private lastPlayed = new Map<string, number>();
    /** Decoded uploaded files by hash, and the decodes still running. */
    private readonly clips = new Map<string, AudioBuffer>();
    private readonly decoding = new Map<string, Promise<AudioBuffer | null>>();
    private offline: OfflineAudioContext | null = null;
    private music: { hash: string; source: AudioBufferSourceNode; gain: GainNode } | null = null;
    /** Music asked for before its file was ready: started when it is. */
    private wantedMusic: { hash: string; volume: number; fade: number } | null = null;
    private readonly playingSounds = new Set<SoundHandle>();

    private ensure(): AudioContext | null {
        if (typeof window === "undefined") return null;
        if (!this.context) {
            const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtor) return null;
            this.context = new AudioCtor();
            this.master = this.context.createGain();
            this.master.gain.value = this.muted ? 0 : this.volume;
            this.master.connect(this.context.destination);
            this.sfxBus = this.context.createGain();
            this.sfxBus.gain.value = this.sfxVolume;
            this.sfxBus.connect(this.master);
            this.musicBus = this.context.createGain();
            this.musicBus.gain.value = this.musicVolume;
            this.musicBus.connect(this.master);
        }
        if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
        return this.context;
    }

    /** Decodes the project's audio files in the background (needs no user gesture). */
    preload(assets: readonly AudioAsset[], load: AudioBytesLoader) {
        for (const asset of assets) void this.decode(asset, load);
    }

    private decode(asset: AudioAsset, load: AudioBytesLoader): Promise<AudioBuffer | null> {
        const ready = this.clips.get(asset.hash);
        if (ready) return Promise.resolve(ready);
        let pending = this.decoding.get(asset.hash);
        if (!pending) {
            pending = (async () => {
                const bytes = await load(asset).catch(() => null);
                if (!bytes || typeof window === "undefined") {
                    // Forgotten so a later attempt (back online, file uploaded) can succeed.
                    this.decoding.delete(asset.hash);
                    return null;
                }
                // A realtime context can't start before a user gesture; decoding works offline too.
                const decoder: BaseAudioContext | null = this.context ?? this.offlineContext();
                if (!decoder) return null;
                const buffer = await decoder.decodeAudioData(bytes.slice(0)).catch(() => null);
                if (!buffer) {
                    this.decoding.delete(asset.hash);
                    return null;
                }
                this.clips.set(asset.hash, buffer);
                if (this.wantedMusic?.hash === asset.hash) {
                    const wanted = this.wantedMusic;
                    this.wantedMusic = null;
                    this.playMusic(wanted.hash, wanted.volume, wanted.fade);
                }
                return buffer;
            })();
            this.decoding.set(asset.hash, pending);
        }
        return pending;
    }

    private offlineContext(): OfflineAudioContext | null {
        if (this.offline) return this.offline;
        const OfflineCtor = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
        if (!OfflineCtor) return null;
        this.offline = new OfflineCtor(1, 1, 44_100);
        return this.offline;
    }

    /** Whether an uploaded file is decoded and can play right away. */
    isReady(hash: string) {
        return this.clips.has(hash);
    }

    /** Decodes one file and resolves when it can play (the editor's preview). */
    async load(asset: AudioAsset, load: AudioBytesLoader): Promise<boolean> {
        return Boolean(await this.decode(asset, load));
    }

    /**
     * Plays an uploaded file as a sound effect (or a looping sound). A file
     * still decoding starts when it is ready: a looping sound whenever that is,
     * a one-shot sound only within a second (later it would feel out of place).
     * Null when the file isn't known.
     */
    playClip(hash: string, volume = 1, pitch = 1, loop = false): SoundHandle | null {
        if (this.muted && !loop) return null;
        const buffer = this.clips.get(hash);
        if (!buffer) {
            const pending = this.decoding.get(hash);
            return pending ? this.playWhenDecoded(pending, hash, volume, pitch, loop) : null;
        }
        const context = this.ensure();
        if (!context || !this.sfxBus) return null;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;
        source.playbackRate.value = Math.max(0.1, Math.min(4, pitch));
        const gain = context.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume));
        source.connect(gain);
        gain.connect(this.sfxBus);
        let playing = true;
        const handle: SoundHandle = {
            stop: (fade = 0) => {
                if (!playing) return;
                playing = false;
                this.playingSounds.delete(handle);
                const end = context.currentTime + Math.max(0, fade);
                if (fade > 0) {
                    gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
                    gain.gain.linearRampToValueAtTime(0, end);
                }
                try {
                    source.stop(end + 0.01);
                } catch {
                    // Already stopped.
                }
            },
            get playing() {
                return playing;
            },
        };
        source.onended = () => {
            playing = false;
            this.playingSounds.delete(handle);
        };
        this.playingSounds.add(handle);
        source.start();
        return handle;
    }

    private playWhenDecoded(pending: Promise<AudioBuffer | null>, hash: string, volume: number, pitch: number, loop: boolean): SoundHandle {
        const asked = Date.now();
        let inner: SoundHandle | null = null;
        let cancelled = false;
        const handle: SoundHandle = {
            stop: (fade = 0) => {
                cancelled = true;
                this.playingSounds.delete(handle);
                inner?.stop(fade);
            },
            get playing() {
                return !cancelled && (inner ? inner.playing : true);
            },
        };
        this.playingSounds.add(handle);
        void pending.then((buffer) => {
            this.playingSounds.delete(handle);
            if (cancelled || !buffer || (!loop && Date.now() - asked > 1000)) {
                cancelled = true;
                return;
            }
            inner = this.playClip(hash, volume, pitch, loop);
            if (!inner) cancelled = true;
        });
        return handle;
    }

    /** Starts looping music (fading out what played before); waits for the file when it isn't decoded yet. */
    playMusic(hash: string, volume = 1, fade = 0.5) {
        const buffer = this.clips.get(hash);
        if (!buffer) {
            this.wantedMusic = { hash, volume, fade };
            return;
        }
        const context = this.ensure();
        if (!context || !this.musicBus) return;
        if (this.music?.hash === hash) {
            this.music.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), context.currentTime, Math.max(0.01, fade / 3));
            return;
        }
        this.stopMusic(fade);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = context.createGain();
        const target = Math.max(0, Math.min(1, volume));
        gain.gain.setValueAtTime(fade > 0 ? 0 : target, context.currentTime);
        if (fade > 0) gain.gain.linearRampToValueAtTime(target, context.currentTime + fade);
        source.connect(gain);
        gain.connect(this.musicBus);
        source.start();
        this.music = { hash, source, gain };
    }

    stopMusic(fade = 0.5) {
        this.wantedMusic = null;
        const current = this.music;
        if (!current || !this.context) return;
        this.music = null;
        const end = this.context.currentTime + Math.max(0, fade);
        current.gain.gain.setValueAtTime(current.gain.gain.value, this.context.currentTime);
        current.gain.gain.linearRampToValueAtTime(0, end);
        try {
            current.source.stop(end + 0.02);
        } catch {
            // Already stopped.
        }
    }

    get musicPlaying() {
        return Boolean(this.music || this.wantedMusic);
    }

    get currentMusic(): string | null {
        return this.music?.hash ?? this.wantedMusic?.hash ?? null;
    }

    setMusicVolume(value: number) {
        this.musicVolume = Math.max(0, Math.min(1, value));
        if (this.musicBus) this.musicBus.gain.value = this.musicVolume;
    }

    setSfxVolume(value: number) {
        this.sfxVolume = Math.max(0, Math.min(1, value));
        if (this.sfxBus) this.sfxBus.gain.value = this.sfxVolume;
    }

    /** Stops music and every uploaded sound (the game stopped or restarts). */
    stopAll() {
        this.stopMusic(0);
        for (const handle of [...this.playingSounds]) handle.stop(0);
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
        gain.connect(this.sfxBus ?? this.master);
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
        gain.connect(this.sfxBus ?? this.master);
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
        this.stopAll();
        void this.context?.close().catch(() => undefined);
        this.context = null;
        this.master = null;
        this.sfxBus = null;
        this.musicBus = null;
        this.noiseBuffer = null;
        this.clips.clear();
        this.decoding.clear();
        this.offline = null;
    }
}
