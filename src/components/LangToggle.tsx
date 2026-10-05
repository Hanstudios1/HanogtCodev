"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotionConfig } from "framer-motion";
import { Check, Globe, Search } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { LANGUAGES, languageInfo, useI18n, type Language } from "@/lib/i18n";

/**
 * Where the menu opens relative to its button: "down" or "up", lined up with
 * the "start" or "end" edge of the button (reading direction aware). It is
 * only a preference: the menu flips to the other side when it doesn't fit.
 */
export type LangMenuPlacement = "down-end" | "down-start" | "up-end" | "up-start";

export type LangMenuPosition = {
    /** Fixed-position offsets in px, relative to the viewport. */
    left: number;
    /** Set for menus that open downwards. */
    top?: number;
    /** Set for menus that open upwards; they grow away from the button, so filtering never detaches them. */
    bottom?: number;
    width: number;
    maxHeight: number;
    side: "up" | "down";
    origin: string;
};

const MENU_WIDTH = 288;
const LIST_MAX_HEIGHT = 320;
const LIST_PADDING = 6;
/** Search row (8 + 32 + 8 + 1px border) and the menu's own 1px borders. */
const MENU_CHROME_HEIGHT = 51;
const MENU_MAX_HEIGHT = MENU_CHROME_HEIGHT + LIST_MAX_HEIGHT;
/** Below this a side of the button is too cramped to be worth opening on. */
const MIN_USABLE_HEIGHT = 200;
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;
const PAGE_STEP = 8;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Fixed position of the menu for a button at `anchor` (viewport coordinates).
 * Opens on the preferred side when the whole menu fits there, otherwise on the
 * other side, otherwise on the roomier one with a shorter, scrolling list. It
 * lines up with the preferred edge of the button, switches to the other edge
 * when that is the only one that fits, and is finally clamped to the viewport.
 */
export function placeLangMenu({ anchor, viewport, placement, rtl }: {
    anchor: { left: number; right: number; top: number; bottom: number };
    viewport: { width: number; height: number };
    placement: LangMenuPlacement;
    rtl: boolean;
}): LangMenuPosition {
    const width = Math.max(0, Math.min(MENU_WIDTH, viewport.width - 2 * VIEWPORT_MARGIN));

    const room = {
        down: Math.max(0, viewport.height - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN),
        up: Math.max(0, anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN),
    };
    const preferred = placement.startsWith("up") ? "up" : "down";
    const opposite = preferred === "up" ? "down" : "up";
    const side = room[preferred] >= MENU_MAX_HEIGHT || room[opposite] <= room[preferred] ? preferred : opposite;

    // Both sides cramped (a phone held sideways): cover the button rather than show a sliver.
    const cramped = Math.min(MENU_MAX_HEIGHT, room[side]) < MIN_USABLE_HEIGHT;
    const maxHeight = cramped ? Math.min(MENU_MAX_HEIGHT, viewport.height - 2 * VIEWPORT_MARGIN) : Math.min(MENU_MAX_HEIGHT, room[side]);
    const vertical: Pick<LangMenuPosition, "top" | "bottom"> = cramped
        ? { top: VIEWPORT_MARGIN }
        : side === "down" ? { top: anchor.bottom + ANCHOR_GAP } : { bottom: viewport.height - anchor.top + ANCHOR_GAP };

    // "end" lines the menu's end edge up with the button's end edge; that is the right edge in LTR.
    const rightAligned = (align: "start" | "end") => (align === "end") !== rtl;
    const leftFor = (align: "start" | "end") => (rightAligned(align) ? anchor.right - width : anchor.left);
    const fits = (left: number) => left >= VIEWPORT_MARGIN && left + width <= viewport.width - VIEWPORT_MARGIN;
    const wanted = placement.endsWith("end") ? "end" : "start";
    const other = wanted === "end" ? "start" : "end";
    const align = !fits(leftFor(wanted)) && fits(leftFor(other)) ? other : wanted;
    const left = clamp(leftFor(align), VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.width - VIEWPORT_MARGIN - width));

    // The menu grows out of the middle of the button, wherever the clamping left it.
    const shownSide = cramped ? "down" : side;
    const originX = Math.round(clamp((anchor.left + anchor.right) / 2 - left, 0, width));
    return { left, ...vertical, width, maxHeight, side: shownSide, origin: `${originX}px ${shownSide === "down" ? "top" : "bottom"}` };
}

function measureMenu(trigger: HTMLElement, placement: LangMenuPlacement) {
    const root = document.documentElement;
    return placeLangMenu({
        anchor: trigger.getBoundingClientRect(),
        viewport: { width: root.clientWidth, height: root.clientHeight },
        placement,
        rtl: getComputedStyle(trigger).direction === "rtl",
    });
}

/** Scrolls the list just far enough to show `option`, or to centre it. */
function revealOption(list: HTMLElement, option: HTMLElement, center: boolean) {
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (center) list.scrollTop = top - (list.clientHeight - option.offsetHeight) / 2;
    else if (top < list.scrollTop) list.scrollTop = top - LIST_PADDING;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + LIST_PADDING;
}

type OpenMenu = { id: number; position: LangMenuPosition; autoFocus: boolean; viaKeyboard: boolean };

export default function LangToggle({ compact = false, placement = "down-end" }: { compact?: boolean; placement?: LangMenuPlacement }) {
    const { language, t } = useI18n();
    const [menu, setMenu] = useState<OpenMenu | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const opened = useRef(0);
    const uid = useId();
    const current = languageInfo(language);

    const close = useCallback((restoreFocus: boolean) => {
        setMenu(null);
        if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
    }, []);

    const open = (viaKeyboard: boolean) => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        opened.current += 1;
        // With a finger the search box stays unfocused, otherwise the on-screen keyboard
        // would cover most of the list.
        const autoFocus = viaKeyboard || !window.matchMedia("(pointer: coarse)").matches;
        setMenu({ id: opened.current, position: measureMenu(trigger, placement), autoFocus, viaKeyboard });
    };

    const onClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
        if (menu) {
            close(false);
            return;
        }
        // Pressing Enter or Space on a button clicks it with detail 0.
        open(event.detail === 0);
    };

    const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        if (menu) document.getElementById(`${uid}-search`)?.focus({ preventScroll: true });
        else open(true);
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={onClick}
                onKeyDown={onTriggerKeyDown}
                aria-haspopup="listbox"
                aria-expanded={menu !== null}
                aria-controls={menu ? `${uid}-list` : undefined}
                aria-label={`${t("lt_choose")}: ${current.name} (${current.code})`}
                className={`flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200/80 px-2.5 text-[13px] font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-900/5 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10 ${compact ? "" : "min-w-[4.5rem]"}`}
            >
                <Globe className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                <span>{current.code}</span>
            </button>

            <AnimatePresence>
                {menu ? (
                    <LanguageMenu
                        key={menu.id}
                        uid={uid}
                        initial={menu.position}
                        autoFocus={menu.autoFocus}
                        viaKeyboard={menu.viaKeyboard}
                        placement={placement}
                        triggerRef={triggerRef}
                        onClose={close}
                    />
                ) : null}
            </AnimatePresence>
        </>
    );
}

/**
 * The language list. It lives in a portal on <body>: the footer clips its
 * children (overflow-hidden) and the header's backdrop filter would turn
 * `fixed` into "fixed to the header", so neither can hold the menu.
 * Focus stays in the search box; the highlighted language is announced with
 * aria-activedescendant.
 */
function LanguageMenu({ uid, initial, autoFocus, viaKeyboard, placement, triggerRef, onClose }: {
    uid: string;
    initial: LangMenuPosition;
    autoFocus: boolean;
    viaKeyboard: boolean;
    placement: LangMenuPlacement;
    triggerRef: RefObject<HTMLButtonElement | null>;
    onClose: (restoreFocus: boolean) => void;
}) {
    const { language, setLanguage, t } = useI18n();
    const present = useIsPresent();
    const reduceMotion = useReducedMotionConfig();
    const [position, setPosition] = useState(initial);
    const [query, setQuery] = useState("");
    const [activeCode, setActiveCode] = useState<Language | null>(language);
    const [byKeyboard, setByKeyboard] = useState(viaKeyboard);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<HTMLUListElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const revealed = useRef(false);

    const needle = query.trim().toLocaleLowerCase();
    const list = LANGUAGES.filter((entry) => !needle || `${entry.name} ${entry.english} ${entry.code}`.toLocaleLowerCase().includes(needle));
    const active = list.find((entry) => entry.code === activeCode) ?? list[0] ?? null;

    useEffect(() => {
        if (autoFocus) inputRef.current?.focus({ preventScroll: true });
    }, [autoFocus]);

    // Closes on outside clicks, Escape and scrolling; keeps up with the viewport resizing.
    useEffect(() => {
        const viewportWidth = document.documentElement.clientWidth;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            // The button toggles the menu by itself.
            if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
            onClose(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            // Only this menu closes: an open mobile menu around the button stays.
            event.preventDefault();
            event.stopPropagation();
            onClose(true);
        };
        const onScroll = (event: Event) => {
            // The language list scrolls on its own.
            if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
            onClose(false);
        };
        const onResize = () => {
            // A narrower or wider window (rotation, split view) moves the button;
            // a taller or shorter one is just the address bar or the on-screen keyboard.
            if (document.documentElement.clientWidth !== viewportWidth) {
                onClose(false);
                return;
            }
            const trigger = triggerRef.current;
            if (trigger) setPosition(measureMenu(trigger, placement));
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("scroll", onScroll, { capture: true, passive: true });
        window.addEventListener("resize", onResize);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
    }, [onClose, placement, triggerRef]);

    // Keeps the highlighted language in view: centred on opening, "nearest" afterwards.
    useEffect(() => {
        const option = active ? listRef.current?.querySelector<HTMLElement>(`[data-code="${active.code}"]`) : null;
        if (!listRef.current || !option) return;
        revealOption(listRef.current, option, !revealed.current);
        revealed.current = true;
    }, [active]);

    const choose = (code: Language) => {
        setLanguage(code);
        onClose(true);
    };

    const move = (step: number, wrap: boolean) => {
        if (!list.length) return;
        const index = Math.max(0, list.findIndex((entry) => entry.code === active?.code));
        const next = wrap ? (index + step + list.length) % list.length : clamp(index + step, 0, list.length - 1);
        setByKeyboard(true);
        setActiveCode(list[next].code);
    };

    const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                move(1, true);
                break;
            case "ArrowUp":
                event.preventDefault();
                move(-1, true);
                break;
            case "PageDown":
                event.preventDefault();
                move(PAGE_STEP, false);
                break;
            case "PageUp":
                event.preventDefault();
                move(-PAGE_STEP, false);
                break;
            case "Enter":
                event.preventDefault();
                if (active) choose(active.code);
                break;
            case "Tab":
                // Continue from the button, not from the end of the page where the portal lives.
                triggerRef.current?.focus({ preventScroll: true });
                onClose(false);
                break;
        }
    };

    const offset = position.side === "down" ? -6 : 6;
    return createPortal(
        <motion.div
            ref={menuRef}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: offset, scale: 0.97 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: offset, scale: 0.97 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
            onKeyDown={onKeyDown}
            style={{ left: position.left, top: position.top, bottom: position.bottom, width: position.width, maxHeight: position.maxHeight, transformOrigin: position.origin }}
            className={`fixed z-[110] flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-zinc-900 ${present ? "" : "pointer-events-none"}`}
        >
            <div className="shrink-0 border-b border-zinc-100 p-2 dark:border-white/[0.06]">
                <div className="relative">
                    <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        id={`${uid}-search`}
                        type="text"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={list.length ? `${uid}-list` : undefined}
                        aria-autocomplete="list"
                        aria-activedescendant={active ? `${uid}-${active.code}` : undefined}
                        aria-label={t("lt_search")}
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        enterKeyHint="go"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setActiveCode(null);
                        }}
                        placeholder={t("lt_search")}
                        className="h-8 w-full rounded-lg bg-zinc-100 pe-2 ps-8 text-[13px] text-zinc-800 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-indigo-500/30 dark:bg-white/[0.06] dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                </div>
            </div>
            {list.length ? (
                <ul
                    id={`${uid}-list`}
                    ref={listRef}
                    role="listbox"
                    aria-label={t("lt_languages")}
                    style={{ maxHeight: LIST_MAX_HEIGHT }}
                    className="scrollbar-thin relative grid min-h-0 flex-1 grid-cols-2 content-start gap-0.5 overflow-y-auto overscroll-contain p-1.5"
                >
                    {list.map((entry) => {
                        const selected = entry.code === language;
                        const highlighted = entry.code === active?.code;
                        return (
                            <li
                                key={entry.code}
                                id={`${uid}-${entry.code}`}
                                role="option"
                                aria-selected={selected}
                                data-code={entry.code}
                                lang={entry.locale}
                                dir={entry.dir}
                                title={entry.english}
                                onClick={() => choose(entry.code)}
                                onMouseMove={() => {
                                    setByKeyboard(false);
                                    setActiveCode(entry.code);
                                }}
                                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[13px] transition-colors ${selected ? "bg-indigo-500/10 font-semibold text-indigo-700 dark:text-indigo-300" : "text-zinc-700 dark:text-zinc-300"} ${highlighted && !selected ? "bg-zinc-100 dark:bg-white/[0.06]" : ""} ${highlighted && byKeyboard ? "ring-2 ring-inset ring-indigo-500/60" : ""}`}
                            >
                                <span aria-hidden="true">{entry.flag}</span>
                                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                                {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <span className="text-[10px] text-zinc-500 dark:text-zinc-400" aria-hidden="true">{entry.code}</span>}
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p role="status" className="px-3 py-6 text-center text-[12px] text-zinc-500 dark:text-zinc-400">{t("lt_no_results")}</p>
            )}
        </motion.div>,
        document.body,
    );
}
