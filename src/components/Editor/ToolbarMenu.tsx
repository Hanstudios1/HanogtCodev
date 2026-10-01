"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

export interface ToolbarMenuItem {
    id: string;
    label: string;
    icon?: ReactNode;
    /** Keyboard shortcut shown at the end of the row (already formatted for the platform). */
    shortcut?: string;
    disabled?: boolean;
    /** Destructive actions are shown in red. */
    danger?: boolean;
    /** Opens a page instead of running an action. */
    href?: string;
    /** Opens `href` in a new tab (the editor keeps its state). */
    external?: boolean;
    onSelect?: () => void;
}

export interface ToolbarMenuSection {
    id: string;
    /** Visible heading; also names the group for screen readers. */
    label?: string;
    items: ToolbarMenuItem[];
}

interface ToolbarMenuProps {
    /** Accessible name of the button and the menu. */
    label: string;
    sections: ToolbarMenuSection[];
    /** Content of the button (icon, text, chevron). */
    children: ReactNode;
    buttonClassName: string;
    title?: string;
    /** Menu width in pixels. */
    width?: number;
}

const ITEMS = "[role='menuitem']:not([disabled])";

/**
 * A menu button for the editor toolbar: arrow keys, Home/End and Escape work,
 * focus returns to the button, and the menu stays inside the viewport on
 * narrow screens.
 */
export default function ToolbarMenu({ label, sections, children, buttonClassName, title, width = 288 }: ToolbarMenuProps) {
    const { dir } = useI18n();
    const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuId = useId();
    const open = position !== null;

    const toggle = () => {
        if (open) {
            setPosition(null);
            return;
        }
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return;
        const menuWidth = Math.min(width, window.innerWidth - 16);
        const preferred = dir === "rtl" ? rect.left : rect.right - menuWidth;
        const left = Math.max(8, Math.min(preferred, window.innerWidth - menuWidth - 8));
        const top = rect.bottom + 4;
        setPosition({ top, left, width: menuWidth, maxHeight: Math.min(560, Math.max(160, window.innerHeight - top - 12)) });
    };

    useEffect(() => {
        if (!open) return;
        const frame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>(ITEMS)?.focus());
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && (menuRef.current?.contains(target) || buttonRef.current?.contains(target))) return;
            setPosition(null);
        };
        const onScroll = (event: Event) => {
            if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
            setPosition(null);
        };
        const onResize = () => setPosition(null);
        // Escape works wherever the focus is while the menu is open.
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setPosition(null);
            buttonRef.current?.focus();
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        return () => {
            window.cancelAnimationFrame(frame);
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
    }, [open]);

    const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
        const index = items.indexOf(document.activeElement as HTMLElement);
        const focus = (next: number) => items[(next + items.length) % items.length]?.focus();
        if (event.key === "ArrowDown") {
            event.preventDefault();
            focus(index + 1);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            focus(index - 1);
        } else if (event.key === "Home") {
            event.preventDefault();
            focus(0);
        } else if (event.key === "End") {
            event.preventDefault();
            focus(items.length - 1);
        } else if (event.key === "Tab") {
            setPosition(null);
        }
    };

    const select = (item: ToolbarMenuItem) => {
        setPosition(null);
        // Run after the menu is gone; actions such as "Find" move the focus into the editor.
        window.setTimeout(() => {
            item.onSelect?.();
            if (!document.activeElement || document.activeElement === document.body) buttonRef.current?.focus();
        }, 0);
    };

    const rowClass = (item: ToolbarMenuItem) => `flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${item.danger
        ? "text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10"
        : "text-zinc-700 hover:bg-zinc-100 focus:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10 dark:focus:bg-white/10"}`;
    const rowContent = (item: ToolbarMenuItem) => (
        <>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>{item.icon}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut && <kbd className="shrink-0 font-mono text-[10px] text-zinc-400">{item.shortcut}</kbd>}
        </>
    );

    const visibleSections = sections.filter((section) => section.items.length);
    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                aria-label={label}
                title={title ?? label}
                className={buttonClassName}
            >
                {children}
            </button>
            {position && (
                <div
                    ref={menuRef}
                    id={menuId}
                    role="menu"
                    aria-label={label}
                    onKeyDown={onMenuKeyDown}
                    style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
                    className="fixed z-[70] overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-white py-1 shadow-2xl [scrollbar-width:thin] dark:border-white/10 dark:bg-zinc-900"
                >
                    {visibleSections.map((section, sectionIndex) => (
                        <div key={section.id} role="group" aria-label={section.label}>
                            {sectionIndex > 0 && <div role="separator" className="my-1 border-t border-zinc-100 dark:border-white/5" />}
                            {section.label && <p aria-hidden className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{section.label}</p>}
                            {section.items.map((item) => item.href && !item.disabled ? (
                                item.external ? (
                                    <a key={item.id} role="menuitem" href={item.href} target="_blank" rel="noopener noreferrer" onClick={() => setPosition(null)} className={rowClass(item)}>
                                        {rowContent(item)}
                                    </a>
                                ) : (
                                    <Link key={item.id} role="menuitem" href={item.href} onClick={() => setPosition(null)} className={rowClass(item)}>
                                        {rowContent(item)}
                                    </Link>
                                )
                            ) : (
                                <button key={item.id} type="button" role="menuitem" disabled={item.disabled} onClick={() => select(item)} className={rowClass(item)}>
                                    {rowContent(item)}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
