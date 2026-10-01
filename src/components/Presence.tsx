"use client";

import { Check } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRawSession } from "@/components/Provider";
import { useI18n } from "@/lib/i18n";
import {
    AUTO_IDLE_MS,
    PRESENCE_CHOICES,
    PRESENCE_COPY,
    PRESENCE_HEARTBEAT_MS,
    isPresenceChoice,
    publicPresence,
    type PresenceChoice,
    type PresenceState,
} from "@/lib/presence";

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

const COLORS: Record<PresenceState, string> = {
    online: "#23a55a",
    idle: "#f0b232",
    dnd: "#f23f43",
    offline: "#80848e",
};

/**
 * Discord-style status badge: green dot (online), crescent moon (idle), red
 * circle with a bar (do not disturb) and a hollow grey ring (offline). Place it
 * inside a `relative` avatar wrapper; `ringClassName` should match the surface
 * behind the avatar so the badge looks cut out of it.
 */
export function PresenceDot({
    state,
    size = 14,
    className = "absolute -bottom-0.5 -end-0.5",
    ringClassName = "bg-white dark:bg-zinc-900",
    label,
}: {
    state: PresenceState;
    size?: number;
    className?: string;
    ringClassName?: string;
    label?: string;
}) {
    const { tx } = useI18n();
    const maskId = useId().replace(/:/g, "");
    const inner = Math.max(6, size - 4);
    const title = label ?? tx(PRESENCE_COPY[state].label);
    return (
        <span role="img" aria-label={title} title={title} className={`inline-grid place-items-center rounded-full ${ringClassName} ${className}`} style={{ width: size, height: size }}>
            <svg viewBox="0 0 16 16" width={inner} height={inner} aria-hidden="true">
                {state === "online" ? <circle cx="8" cy="8" r="8" fill={COLORS.online} /> : null}
                {state === "idle" ? (
                    <>
                        <mask id={`m${maskId}`}>
                            <rect width="16" height="16" fill="white" />
                            <circle cx="3.5" cy="3.5" r="6" fill="black" />
                        </mask>
                        <circle cx="8" cy="8" r="8" fill={COLORS.idle} mask={`url(#m${maskId})`} />
                    </>
                ) : null}
                {state === "dnd" ? (
                    <>
                        <circle cx="8" cy="8" r="8" fill={COLORS.dnd} />
                        <rect x="3.5" y="6.5" width="9" height="3" rx="1.5" fill="white" />
                    </>
                ) : null}
                {state === "offline" ? (
                    <>
                        <mask id={`m${maskId}`}>
                            <rect width="16" height="16" fill="white" />
                            <circle cx="8" cy="8" r="3.5" fill="black" />
                        </mask>
                        <circle cx="8" cy="8" r="8" fill={COLORS.offline} mask={`url(#m${maskId})`} />
                    </>
                ) : null}
            </svg>
        </span>
    );
}

// ---------------------------------------------------------------------------
// Own presence: choice, auto-idle and the server heartbeat
// ---------------------------------------------------------------------------

type PresenceContextValue = {
    /** What the person picked. */
    choice: PresenceChoice;
    /** How the person appears to themselves (invisible shows as offline). */
    state: PresenceState;
    autoIdle: boolean;
    setChoice: (choice: PresenceChoice) => void;
};

const PresenceContext = createContext<PresenceContextValue>({ choice: "online", state: "offline", autoIdle: false, setChoice: () => undefined });

export function usePresence() {
    return useContext(PresenceContext);
}

const STORAGE_KEY = "hanogt_presence";

function storedChoice(): PresenceChoice | null {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        return isPresenceChoice(value) ? value : null;
    } catch {
        return null;
    }
}

function rememberChoice(choice: PresenceChoice) {
    try {
        localStorage.setItem(STORAGE_KEY, choice);
    } catch {
        // Storage can be blocked; the server still keeps the choice.
    }
}

/**
 * Keeps the signed-in person's presence fresh on every page (the editor, chat
 * and game engine included) through /api/presence, so it doesn't depend on the
 * browser's Firebase connection.
 */
export function PresenceProvider({ children }: { children: React.ReactNode }) {
    const auth = useRawSession();
    const email = auth.status === "authenticated" ? auth.data?.user?.email?.toLowerCase() ?? null : null;
    const [choice, setChoiceState] = useState<PresenceChoice>("online");
    const [autoIdle, setAutoIdle] = useState(false);
    const lastActivity = useRef(0);
    const stopped = useRef(false);

    // Last known choice right away, then the server's copy for this account.
    useEffect(() => {
        if (!email) return;
        stopped.current = false;
        let active = true;
        const timer = window.setTimeout(() => {
            const local = storedChoice();
            if (local && active) setChoiceState(local);
        }, 0);
        fetch("/api/presence", { cache: "no-store", credentials: "same-origin" })
            .then((response) => (response.ok ? response.json() : null))
            .then((data: { choice?: unknown } | null) => {
                if (!active || !data || !isPresenceChoice(data.choice)) return;
                setChoiceState(data.choice);
                rememberChoice(data.choice);
            })
            .catch(() => undefined);
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [email]);

    // Auto-idle after a while without input; any input brings the person back.
    useEffect(() => {
        if (!email) return;
        lastActivity.current = Date.now();
        let throttle = 0;
        const onActivity = () => {
            const now = Date.now();
            if (now - throttle < 2_000) return;
            throttle = now;
            lastActivity.current = now;
            setAutoIdle(false);
        };
        const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "focus"] as const;
        events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
        const check = window.setInterval(() => {
            if (Date.now() - lastActivity.current > AUTO_IDLE_MS) setAutoIdle(true);
        }, 30_000);
        return () => {
            events.forEach((name) => window.removeEventListener(name, onActivity));
            window.clearInterval(check);
        };
    }, [email]);

    // Heartbeat: immediately on every change, then every 45 seconds.
    useEffect(() => {
        if (!email || stopped.current) return;
        const send = () => {
            if (stopped.current) return;
            fetch("/api/presence", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ choice, idle: autoIdle, active: true }),
                keepalive: true,
            }).then((response) => {
                // Not configured or no account: don't keep knocking until the next page load.
                if (response.status === 401 || response.status === 404 || response.status === 503) stopped.current = true;
            }).catch(() => undefined);
        };
        send();
        const heartbeat = window.setInterval(send, PRESENCE_HEARTBEAT_MS);
        const leave = () => {
            const payload = new Blob([JSON.stringify({ choice, active: false })], { type: "text/plain" });
            navigator.sendBeacon?.("/api/presence", payload);
        };
        window.addEventListener("pagehide", leave);
        return () => {
            window.clearInterval(heartbeat);
            window.removeEventListener("pagehide", leave);
        };
    }, [email, choice, autoIdle]);

    const setChoice = useCallback((next: PresenceChoice) => {
        rememberChoice(next);
        setChoiceState(next);
    }, []);

    const value = useMemo<PresenceContextValue>(() => ({
        choice,
        autoIdle,
        state: email ? publicPresence(choice, { active: true, autoIdle, showOnline: true }).presence : "offline",
        setChoice,
    }), [autoIdle, choice, email, setChoice]);

    return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

// ---------------------------------------------------------------------------
// Status picker (header profile menu, Hanogt Social)
// ---------------------------------------------------------------------------

const CHOICE_STATE: Record<PresenceChoice, PresenceState> = { online: "online", idle: "idle", dnd: "dnd", invisible: "offline" };

export function PresencePicker({ onPicked, compact = false }: { onPicked?: () => void; compact?: boolean }) {
    const { tx } = useI18n();
    const { choice, setChoice } = usePresence();
    return (
        <div role="radiogroup" aria-label={tx({ TR: "Durum", EN: "Status" })} className="space-y-0.5">
            {PRESENCE_CHOICES.map((value) => {
                const selected = value === choice;
                return (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                            setChoice(value);
                            onPicked?.();
                        }}
                        className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-start transition ${selected ? "bg-indigo-500/10" : "hover:bg-zinc-100 dark:hover:bg-white/[0.06]"}`}
                    >
                        <PresenceDot state={CHOICE_STATE[value]} size={14} className="mt-0.5 shrink-0" ringClassName="bg-transparent" label={tx(PRESENCE_COPY[value].label)} />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-semibold text-zinc-800 dark:text-zinc-100">{tx(PRESENCE_COPY[value].label)}</span>
                            {compact ? null : <span className="block text-[11.5px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(PRESENCE_COPY[value].hint)}</span>}
                        </span>
                        {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" /> : null}
                    </button>
                );
            })}
        </div>
    );
}
