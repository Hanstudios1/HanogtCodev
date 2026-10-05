"use client";

/**
 * Voice for Hanogt AI (the ai_voice feature, early access): dictation with
 * the browser's speech recognition and answers read aloud with its speech
 * synthesis. Nothing goes to Hanogt's servers; Chrome and Edge send the audio
 * of a dictation to their own speech service. Shown only when the team opened
 * the feature for the person and the browser supports it.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { appendDictation, speechChunksOf, speechLangOf, speechTextOf } from "@/lib/ai/voice";
import { useFeature } from "./features-store";

type RecognitionResult = { isFinal: boolean; 0?: { transcript?: string } };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type Recognition = {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    maxAlternatives: number;
    onresult: ((event: RecognitionEvent) => void) | null;
    onerror: ((event: { error?: string }) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
    if (typeof window === "undefined") return null;
    const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
const browserLanguage = () => (typeof navigator !== "undefined" && navigator.language) || "en-US";
const subscribeNothing = () => () => undefined;
/** Bit 1: dictation, bit 2: speech; 0 while rendering on the server. */
const readSupport = () => (recognitionConstructor() ? 1 : 0) | (speechSupported() ? 2 : 0);

/** The voice tools this person can use in this browser. */
export function useVoice() {
    const allowed = useFeature("ai_voice");
    const support = useSyncExternalStore(subscribeNothing, readSupport, () => 0);
    return { dictation: allowed && (support & 1) !== 0, speech: allowed && (support & 2) !== 0 };
}

// ------------------------------------------------------------------ reading aloud

const SPEECH_EVENT = "hanogt-ai:speech";
let speakingId: string | null = null;
/**
 * Which reading is current. cancel() ends the old queue's utterances with
 * events that arrive later; they belong to an older reading and are ignored
 * (otherwise stopping and restarting the same answer could end the new one).
 */
let reading = 0;

function setSpeaking(id: string | null) {
    speakingId = id;
    window.dispatchEvent(new Event(SPEECH_EVENT));
}

function subscribeSpeech(listener: () => void) {
    window.addEventListener(SPEECH_EVENT, listener);
    return () => window.removeEventListener(SPEECH_EVENT, listener);
}

/** Stops whatever Hanogt AI is reading aloud (leaving the chat, a new chat). */
export function stopSpeaking() {
    if (!speechSupported()) return;
    reading++;
    window.speechSynthesis.cancel();
    if (speakingId !== null) setSpeaking(null);
}

/** The voices this device can read with (they load late in some browsers). */
export function useSpeechVoices() {
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    useEffect(() => {
        if (!speechSupported()) return;
        const synth = window.speechSynthesis;
        const load = () => setVoices(synth.getVoices());
        load();
        synth.addEventListener("voiceschanged", load);
        return () => synth.removeEventListener("voiceschanged", load);
    }, []);
    return voices;
}

/** How answers are read: a voice by name ("" for the device's default for the language) and a speed. */
export type SpeechOptions = { voiceName?: string; rate?: number };

/** Reads one answer at a time; `speakingId` is the message being read. */
export function useSpeech() {
    const current = useSyncExternalStore(subscribeSpeech, () => speakingId, () => null);
    const speak = useCallback((id: string, markdown: string, language: string, codeBlockLabel: string, options: SpeechOptions = {}) => {
        if (!speechSupported()) return;
        const synth = window.speechSynthesis;
        synth.cancel();
        const turn = ++reading;
        const chunks = speechChunksOf(speechTextOf(markdown, codeBlockLabel));
        if (!chunks.length) {
            if (speakingId !== null) setSpeaking(null);
            return;
        }
        const lang = speechLangOf(language, browserLanguage());
        // The chosen voice if this device has it; otherwise the browser picks one for the language.
        const voice = options.voiceName ? synth.getVoices().find((entry) => entry.name === options.voiceName) ?? null : null;
        const rate = typeof options.rate === "number" && options.rate >= 0.5 && options.rate <= 2 ? options.rate : 1;
        const finish = () => {
            if (reading !== turn) return;
            reading++;
            setSpeaking(null);
        };
        setSpeaking(id);
        chunks.forEach((chunk, index) => {
            const utterance = new window.SpeechSynthesisUtterance(chunk);
            utterance.lang = voice?.lang || lang;
            if (voice) utterance.voice = voice;
            utterance.rate = rate;
            // A piece that fails stops the rest; the last piece ends the reading.
            utterance.onerror = () => {
                if (reading !== turn) return;
                finish();
                synth.cancel();
            };
            if (index === chunks.length - 1) utterance.onend = finish;
            synth.speak(utterance);
        });
    }, []);
    return { speakingId: current, speak, stop: stopSpeaking };
}

// ------------------------------------------------------------------ dictation

export type DictationError = "denied" | "failed";

/**
 * Dictation into the message box: one phrase per press (the browser stops
 * after a pause); what was heard is added to `text` through `onText`.
 * `heard` is the language to listen for (a BCP 47 tag from the Hanogt AI
 * settings); "site" or nothing follows the site's language.
 */
export function useDictation(language: string, text: string, onText: (next: string) => void, heard?: string) {
    const [listening, setListening] = useState(false);
    const [error, setError] = useState<DictationError | null>(null);
    const recognition = useRef<Recognition | null>(null);
    const latest = useRef({ text, onText });

    useEffect(() => {
        latest.current = { text, onText };
    });

    useEffect(() => () => recognition.current?.abort(), []);

    const stop = useCallback(() => recognition.current?.stop(), []);

    const start = useCallback(() => {
        const Constructor = recognitionConstructor();
        if (!Constructor) return;
        recognition.current?.abort();
        const next = new Constructor();
        next.lang = heard && heard !== "site" ? heard : speechLangOf(language, browserLanguage());
        next.interimResults = false;
        next.continuous = false;
        next.maxAlternatives = 1;
        next.onresult = (event) => {
            const heard = Array.from(event.results).filter((result) => result.isFinal).map((result) => result[0]?.transcript ?? "").join(" ");
            if (heard.trim()) latest.current.onText(appendDictation(latest.current.text, heard));
        };
        next.onerror = (event) => {
            // Silence and a stop by the person aren't errors.
            if (event.error === "no-speech" || event.error === "aborted") return;
            setError(event.error === "not-allowed" || event.error === "service-not-allowed" ? "denied" : "failed");
        };
        next.onend = () => {
            setListening(false);
            if (recognition.current === next) recognition.current = null;
        };
        recognition.current = next;
        setError(null);
        setListening(true);
        try {
            next.start();
        } catch {
            setListening(false);
            setError("failed");
        }
    }, [heard, language]);

    return { listening, error, start, stop };
}
