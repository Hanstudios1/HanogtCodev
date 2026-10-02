"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, PanelRightClose, PanelRightOpen } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/Groups/ui";
import { useI18n, type Copy } from "@/lib/i18n";
import { badgeLabel } from "@/lib/social/model";
import { useSocial } from "./context";

export const UI = {
    openMenu: { TR: "Gezinme menüsünü aç", EN: "Open the navigation menu" },
    showPanel: { TR: "Yan paneli göster", EN: "Show the side panel" },
    hidePanel: { TR: "Yan paneli gizle", EN: "Hide the side panel" },
    sidePanel: { TR: "Yan panel", EN: "Side panel" },
} satisfies Record<string, Copy>;

export function useMediaQuery(queryText: string) {
    return useSyncExternalStore(
        (onChange) => {
            const list = window.matchMedia(queryText);
            list.addEventListener("change", onChange);
            return () => list.removeEventListener("change", onChange);
        },
        () => window.matchMedia(queryText).matches,
        () => false,
    );
}

/**
 * Moves focus into a drawer when it opens and back to where it came from
 * when it closes, so keyboard users don't get lost behind the backdrop.
 */
export function useDrawerFocus(open: boolean, container: React.RefObject<HTMLElement | null>) {
    const previous = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (!open) return;
        previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const frame = window.requestAnimationFrame(() => {
            const target = container.current?.querySelector<HTMLElement>("[data-autofocus], a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex='-1'])");
            target?.focus();
        });
        return () => {
            window.cancelAnimationFrame(frame);
            previous.current?.focus?.();
        };
    }, [container, open]);
}

/** Square icon button with an accessible name and a native tooltip. */
export function IconButton({ label, onClick, children, active = false, pressed, className, disabled = false, controls, expanded }: {
    label: string;
    onClick: () => void;
    children: ReactNode;
    active?: boolean;
    pressed?: boolean;
    className?: string;
    disabled?: boolean;
    controls?: string;
    expanded?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            aria-controls={controls}
            aria-expanded={expanded}
            className={cx(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40",
                active ? "bg-zinc-200 text-zinc-900 dark:bg-white/10 dark:text-white" : "text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.07] dark:hover:text-white",
                className,
            )}
        >
            {children}
        </button>
    );
}

/**
 * Top bar of the main area (Discord's channel header): a menu button on
 * phones, the title, and actions on the right.
 */
export function MainHeader({ children, actions, aside = true }: { children: ReactNode; actions?: ReactNode; aside?: boolean }) {
    const { tx } = useI18n();
    const { ui } = useSocial();
    const asideShown = ui.wide ? !ui.asideCollapsed : ui.asideOpen;
    return (
        <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-zinc-200 bg-white px-2 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-black/40 dark:bg-zinc-900 sm:px-3">
            <IconButton label={tx(UI.openMenu)} onClick={() => ui.setNavOpen(true)} className="md:hidden" controls="social-nav" expanded={ui.navOpen}>
                <Menu className="h-5 w-5" aria-hidden />
            </IconButton>
            <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
            <div className="flex shrink-0 items-center gap-0.5">
                {actions}
                {aside && (
                    <IconButton label={tx(asideShown ? UI.hidePanel : UI.showPanel)} onClick={ui.toggleAside} pressed={asideShown} controls="social-aside">
                        {asideShown ? <PanelRightClose className="h-5 w-5" aria-hidden /> : <PanelRightOpen className="h-5 w-5" aria-hidden />}
                    </IconButton>
                )}
            </div>
        </header>
    );
}

/**
 * The right-hand column (members, profile card, pins): a column from the
 * `lg` breakpoint on (collapsible), a drawer from the right below it.
 */
export function SocialAside({ label, children }: { label: string; children: ReactNode }) {
    const { ui } = useSocial();
    const ref = useRef<HTMLElement | null>(null);
    const drawer = !ui.wide;
    useDrawerFocus(drawer && ui.asideOpen, ref);
    if (!drawer) {
        if (ui.asideCollapsed) return null;
        return (
            <aside id="social-aside" aria-label={label} className="flex h-full w-64 shrink-0 flex-col border-s border-zinc-200 bg-zinc-50 dark:border-black/40 dark:bg-zinc-950">
                {children}
            </aside>
        );
    }
    return (
        <>
            {ui.asideOpen && <div className="fixed inset-0 z-40 bg-zinc-950/50 backdrop-blur-[1px]" onClick={ui.closeAside} aria-hidden />}
            <aside
                ref={ref}
                id="social-aside"
                aria-label={label}
                role="dialog"
                aria-modal={ui.asideOpen ? true : undefined}
                data-social-drawer
                inert={!ui.asideOpen ? true : undefined}
                className={cx(
                    "fixed inset-y-0 end-0 z-50 flex w-[min(20rem,88vw)] flex-col border-s border-zinc-200 bg-zinc-50 shadow-2xl transition-transform duration-200 dark:border-black/40 dark:bg-zinc-950",
                    ui.asideOpen ? "translate-x-0" : "translate-x-full rtl:-translate-x-full",
                )}
            >
                {children}
            </aside>
        </>
    );
}

/** Small uppercase heading of a sidebar section (Discord's category label). */
export function SectionLabel({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
    return (
        <div className="mt-4 flex items-center justify-between gap-2 px-2 pb-1 first:mt-1">
            <h2 id={id} className="truncate text-[11px] font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{children}</h2>
            {action}
        </div>
    );
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
    if (count <= 0) return null;
    return <span className={cx("inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-[18px] tabular-nums text-white", className)}>{badgeLabel(count)}</span>;
}

/** A row in the second column (Arkadaşlar, a channel, Files…). */
export function SidebarLink({ href, active, icon, label, badge = 0, muted = false, onClick }: {
    href: string;
    active: boolean;
    icon: ReactNode;
    label: string;
    badge?: number;
    muted?: boolean;
    onClick?: () => void;
}) {
    return (
        <Link
            href={href}
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            className={cx(
                "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[15px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                active ? "bg-zinc-300/60 text-zinc-900 dark:bg-white/10 dark:text-white" : muted ? "text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200" : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100",
            )}
        >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <CountBadge count={badge} />
        </Link>
    );
}

export function EmptyState({ icon, title, text, children }: { icon: ReactNode; title: string; text?: string; children?: ReactNode }) {
    return (
        <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">{icon}</span>
            <p className="mt-4 text-base font-bold text-zinc-800 dark:text-zinc-100">{title}</p>
            {text && <p className="mt-1.5 max-w-sm text-sm leading-6 text-zinc-500 dark:text-zinc-400">{text}</p>}
            {children}
        </div>
    );
}

export type MenuItem = {
    id: string;
    label: string;
    icon?: ReactNode;
    onSelect: () => void;
    danger?: boolean;
    disabled?: boolean;
    /** Marks a radio-style choice (e.g. the notification level). */
    checked?: boolean;
    hint?: string;
    /** A small heading drawn above this item (starts a section). */
    heading?: string;
    /** A divider line above this item. */
    separator?: boolean;
};

/**
 * A button that opens a small menu (arrow keys, Home/End, Escape, a click
 * outside closes it). `trigger` renders the button's content.
 */
export function DropdownMenu({ label, trigger, items, align = "end", triggerClassName, menuClassName, placement = "below" }: {
    label: string;
    trigger: ReactNode;
    items: MenuItem[];
    align?: "start" | "end";
    triggerClassName?: string;
    menuClassName?: string;
    placement?: "below" | "above";
}) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const menuId = useId();

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: PointerEvent) => {
            if (wrapRef.current && event.target instanceof Node && !wrapRef.current.contains(event.target)) setOpen(false);
        };
        document.addEventListener("pointerdown", onPointer);
        const frame = window.requestAnimationFrame(() => wrapRef.current?.querySelector<HTMLButtonElement>("[role^='menuitem']:not([disabled])")?.focus());
        return () => {
            document.removeEventListener("pointerdown", onPointer);
            window.cancelAnimationFrame(frame);
        };
    }, [open]);

    const close = (refocus = true) => {
        setOpen(false);
        if (refocus) buttonRef.current?.focus();
    };

    const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        const entries = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role^='menuitem']:not([disabled])"));
        const index = entries.indexOf(document.activeElement as HTMLButtonElement);
        let next = -1;
        if (event.key === "ArrowDown") next = (index + 1) % entries.length;
        else if (event.key === "ArrowUp") next = (index - 1 + entries.length) % entries.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = entries.length - 1;
        else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
        } else if (event.key === "Tab") {
            close(false);
            return;
        }
        if (next < 0) return;
        event.preventDefault();
        entries[next]?.focus();
    };

    return (
        <div ref={wrapRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                aria-label={label}
                title={label}
                className={triggerClassName ?? "inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-200/70 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400 dark:hover:bg-white/[0.07] dark:hover:text-white"}
            >
                {trigger}
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        id={menuId}
                        role="menu"
                        aria-label={label}
                        onKeyDown={onMenuKey}
                        initial={{ opacity: 0, y: placement === "below" ? -4 : 4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: placement === "below" ? -4 : 4, scale: 0.97 }}
                        transition={{ duration: 0.12 }}
                        className={cx(
                            "absolute z-40 min-w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-2xl dark:border-white/10 dark:bg-zinc-900",
                            align === "end" ? "end-0" : "start-0",
                            placement === "below" ? "top-full mt-1" : "bottom-full mb-1",
                            menuClassName,
                        )}
                    >
                        {items.map((item, index) => (
                            <div key={item.id} role="none">
                                {item.heading && <p role="presentation" className={cx("px-2.5 pb-1 text-[10px] font-black uppercase tracking-wide text-zinc-400", index ? "mt-1 border-t border-zinc-100 pt-2 dark:border-white/[0.06]" : "pt-1")}>{item.heading}</p>}
                                {!item.heading && item.separator && index > 0 && <div role="separator" className="my-1 h-px bg-zinc-100 dark:bg-white/[0.06]" />}
                                <button
                                    type="button"
                                    role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                                    aria-checked={item.checked}
                                    disabled={item.disabled}
                                    onClick={() => {
                                        close(false);
                                        item.onSelect();
                                    }}
                                    className={cx(
                                        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm transition focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                                        item.danger ? "text-red-600 hover:bg-red-50 focus-visible:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus-visible:bg-red-500/10" : "text-zinc-700 hover:bg-indigo-500/10 hover:text-indigo-700 focus-visible:bg-indigo-500/10 focus-visible:text-indigo-700 dark:text-zinc-200 dark:hover:text-white dark:focus-visible:text-white",
                                    )}
                                >
                                    {item.icon && <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span>}
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-medium">{item.label}</span>
                                        {item.hint && <span className="block text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">{item.hint}</span>}
                                    </span>
                                    {item.checked !== undefined && <span aria-hidden className={cx("mt-1 h-3 w-3 shrink-0 rounded-full border-2", item.checked ? "border-indigo-600 bg-indigo-600 dark:border-indigo-400 dark:bg-indigo-400" : "border-zinc-400")} />}
                                </button>
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
