"use client";

import { Copy as CopyIcon, Download, MoreHorizontal, Pencil, Plus, X, XSquare } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import { useI18n, type Copy } from "@/lib/i18n";

export interface TabItem {
    id: string;
    name: string;
    lang: string;
    isSaved: boolean;
}

interface EditorTabsProps {
    tabs: TabItem[];
    activeId: string;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    onCloseOthers: (id: string) => void;
    onCloseToRight: (id: string) => void;
    /** Returns an error message when the name is not acceptable. */
    onRename: (id: string, name: string) => string | null;
    onDuplicate?: (id: string) => void;
    onDownload: (id: string) => void;
    onReorder: (fromId: string, toId: string) => void;
    /** Omitted when new tabs are not allowed (game scripts). */
    onNew?: () => void;
    /** Starts renaming a tab (e.g. from the command palette). */
    renameRequest?: { id: string; nonce: number } | null;
}

const C = {
    tabs: { TR: "Açık dosyalar", EN: "Open files" },
    newFile: { TR: "Yeni dosya", EN: "New file" },
    unsaved: { TR: "Kaydedilmemiş değişiklikler", EN: "Unsaved changes" },
    close: { TR: "Kapat", EN: "Close" },
    closeTab: { TR: "{name} sekmesini kapat", EN: "Close {name}" },
    closeOthers: { TR: "Diğerlerini kapat", EN: "Close others" },
    closeRight: { TR: "Sağdakileri kapat", EN: "Close to the right" },
    rename: { TR: "Yeniden adlandır", EN: "Rename" },
    duplicate: { TR: "Çoğalt", EN: "Duplicate" },
    download: { TR: "Bu dosyayı indir", EN: "Download this file" },
    menu: { TR: "{name} için işlemler", EN: "Actions for {name}" },
    renameLabel: { TR: "Yeni dosya adı", EN: "New file name" },
} satisfies Record<string, Copy>;

type MenuState = { id: string; x: number; y: number } | null;

export default function EditorTabs({ tabs, activeId, onSelect, onClose, onCloseOthers, onCloseToRight, onRename, onDuplicate, onDownload, onReorder, onNew, renameRequest }: EditorTabsProps) {
    const { tx, dir } = useI18n();
    const [menu, setMenu] = useState<MenuState>(null);
    const [renaming, setRenaming] = useState<{ id: string; value: string; error: string | null } | null>(null);
    const [dragOver, setDragOver] = useState<string | null>(null);
    const tabRefs = useRef(new Map<string, HTMLDivElement>());
    const menuRef = useRef<HTMLDivElement>(null);
    const handledRename = useRef<number | null>(null);
    const canClose = tabs.length > 1;

    const startRename = (id: string) => {
        const tab = tabs.find((item) => item.id === id);
        if (tab) setRenaming({ id, value: tab.name, error: null });
        setMenu(null);
    };

    useEffect(() => {
        if (!renameRequest || handledRename.current === renameRequest.nonce) return;
        const tab = tabs.find((item) => item.id === renameRequest.id);
        if (!tab) return;
        const frame = window.requestAnimationFrame(() => {
            handledRename.current = renameRequest.nonce;
            setRenaming({ id: tab.id, value: tab.name, error: null });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [renameRequest, tabs]);

    // Keep the active tab visible.
    useEffect(() => {
        tabRefs.current.get(activeId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [activeId]);

    useEffect(() => {
        if (!menu) return;
        const close = () => setMenu(null);
        const onPointer = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) close();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                close();
                tabRefs.current.get(menu.id)?.focus();
            }
        };
        window.addEventListener("pointerdown", onPointer, true);
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("resize", close);
        window.addEventListener("scroll", close, true);
        const frame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus());
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener("pointerdown", onPointer, true);
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("resize", close);
            window.removeEventListener("scroll", close, true);
        };
    }, [menu]);

    const openMenu = (id: string, anchor?: { x: number; y: number }) => {
        const rect = tabRefs.current.get(id)?.getBoundingClientRect();
        const x = anchor?.x ?? (rect ? rect.left : 0);
        const y = anchor?.y ?? (rect ? rect.bottom + 4 : 0);
        setMenu({ id, x: Math.min(x, window.innerWidth - 232), y: Math.min(y, window.innerHeight - 280) });
    };

    const commitRename = () => {
        if (!renaming) return;
        const tab = tabs.find((item) => item.id === renaming.id);
        const value = renaming.value.trim();
        if (!tab || !value || value === tab.name) {
            setRenaming(null);
            return;
        }
        const error = onRename(renaming.id, value);
        if (error) setRenaming({ ...renaming, error });
        else setRenaming(null);
    };

    const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, index: number, id: string) => {
        if (renaming?.id === id) return;
        const move = (delta: number) => {
            const next = tabs[(index + delta + tabs.length) % tabs.length];
            if (!next) return;
            onSelect(next.id);
            tabRefs.current.get(next.id)?.focus();
        };
        // Tabs flow right-to-left in RTL languages, so the arrow keys follow the visual order.
        const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
        const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
        if (event.key === forward) { event.preventDefault(); move(1); }
        else if (event.key === backward) { event.preventDefault(); move(-1); }
        else if (event.key === "Home") { event.preventDefault(); move(-index); }
        else if (event.key === "End") { event.preventDefault(); move(tabs.length - 1 - index); }
        else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(id); }
        else if (event.key === "F2") { event.preventDefault(); startRename(id); }
        else if (event.key === "Delete" && canClose) { event.preventDefault(); onClose(id); }
        else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); openMenu(id); }
    };

    const menuTab = menu ? tabs.find((tab) => tab.id === menu.id) : undefined;
    const menuIndex = menuTab ? tabs.indexOf(menuTab) : -1;
    const menuItem = (label: string, icon: ReactNode, onClick: () => void, disabled = false) => (
        <button type="button" role="menuitem" disabled={disabled} onClick={() => { setMenu(null); onClick(); }} className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-zinc-700 transition hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/10 dark:focus:bg-white/10">
            {icon}
            {label}
        </button>
    );

    return (
        <div className="flex h-11 shrink-0 items-stretch border-b border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950">
            <div role="tablist" aria-label={tx(C.tabs)} className="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]">
                {tabs.map((tab, index) => {
                    const active = tab.id === activeId;
                    const isRenaming = renaming?.id === tab.id;
                    return (
                        <div
                            key={tab.id}
                            ref={(element) => {
                                if (element) tabRefs.current.set(tab.id, element);
                                else tabRefs.current.delete(tab.id);
                            }}
                            role="tab"
                            aria-selected={active}
                            tabIndex={active ? 0 : -1}
                            draggable={!isRenaming}
                            onClick={() => onSelect(tab.id)}
                            onDoubleClick={() => startRename(tab.id)}
                            onAuxClick={(event) => {
                                if (event.button === 1 && canClose) {
                                    event.preventDefault();
                                    onClose(tab.id);
                                }
                            }}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                openMenu(tab.id, { x: event.clientX, y: event.clientY });
                            }}
                            onKeyDown={(event) => onTabKeyDown(event, index, tab.id)}
                            onDragStart={(event) => {
                                event.dataTransfer.setData("text/x-hanogt-tab", tab.id);
                                event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragOver={(event) => {
                                if (!event.dataTransfer.types.includes("text/x-hanogt-tab")) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setDragOver(tab.id);
                            }}
                            onDragLeave={() => setDragOver((current) => (current === tab.id ? null : current))}
                            onDrop={(event) => {
                                const from = event.dataTransfer.getData("text/x-hanogt-tab");
                                setDragOver(null);
                                if (from && from !== tab.id) {
                                    event.preventDefault();
                                    onReorder(from, tab.id);
                                }
                            }}
                            onDragEnd={() => setDragOver(null)}
                            title={tab.name}
                            className={`group relative flex min-w-0 max-w-[15rem] shrink-0 cursor-pointer select-none items-center gap-2 border-e border-zinc-200 ps-3 pe-1.5 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:border-white/10 ${active ? "bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-white" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-200"} ${dragOver === tab.id ? "bg-indigo-500/10" : ""}`}
                        >
                            {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-500 to-fuchsia-500" aria-hidden />}
                            <LanguageIcon language={tab.lang} size={16} />
                            {isRenaming ? (
                                <input
                                    autoFocus
                                    aria-label={tx(C.renameLabel)}
                                    aria-invalid={Boolean(renaming.error)}
                                    title={renaming.error ?? undefined}
                                    value={renaming.value}
                                    maxLength={120}
                                    onChange={(event) => setRenaming({ ...renaming, value: event.target.value, error: null })}
                                    onFocus={(event) => {
                                        const dot = event.target.value.lastIndexOf(".");
                                        event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length);
                                    }}
                                    onKeyDown={(event) => {
                                        event.stopPropagation();
                                        if (event.key === "Enter") commitRename();
                                        if (event.key === "Escape") setRenaming(null);
                                    }}
                                    onBlur={() => {
                                        if (renaming.error) setRenaming(null);
                                        else commitRename();
                                    }}
                                    onClick={(event) => event.stopPropagation()}
                                    className={`w-36 rounded-md border bg-white px-1.5 py-0.5 text-sm text-zinc-900 outline-none dark:bg-zinc-800 dark:text-white ${renaming.error ? "border-red-500" : "border-indigo-500"}`}
                                />
                            ) : (
                                <span className="truncate font-medium">{tab.name}</span>
                            )}
                            {!tab.isSaved && !isRenaming && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" title={tx(C.unsaved)} aria-label={tx(C.unsaved)} />}
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    openMenu(tab.id);
                                }}
                                className={`rounded p-0.5 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200 ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"}`}
                                aria-label={tx(C.menu, { name: tab.name })}
                                aria-haspopup="menu"
                            >
                                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            {canClose && (
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onClose(tab.id);
                                    }}
                                    className={`rounded p-0.5 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200 ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"}`}
                                    aria-label={tx(C.closeTab, { name: tab.name })}
                                    title={tx(C.close)}
                                >
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
            {onNew && (
                <button type="button" onClick={onNew} className="flex shrink-0 items-center gap-1.5 border-s border-zinc-200 px-3 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-500/10 dark:border-white/10 dark:text-indigo-300" title={tx(C.newFile)}>
                    <Plus className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">{tx(C.newFile)}</span>
                </button>
            )}

            {menu && menuTab && (
                <div ref={menuRef} role="menu" aria-label={tx(C.menu, { name: menuTab.name })} style={{ left: menu.x, top: menu.y }} className="fixed z-[85] w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
                    {menuItem(tx(C.rename), <Pencil className="h-4 w-4" aria-hidden />, () => startRename(menuTab.id))}
                    {onDuplicate && menuItem(tx(C.duplicate), <CopyIcon className="h-4 w-4" aria-hidden />, () => onDuplicate(menuTab.id))}
                    {menuItem(tx(C.download), <Download className="h-4 w-4" aria-hidden />, () => onDownload(menuTab.id))}
                    <div className="my-1 border-t border-zinc-100 dark:border-white/5" />
                    {menuItem(tx(C.close), <X className="h-4 w-4" aria-hidden />, () => onClose(menuTab.id), !canClose)}
                    {menuItem(tx(C.closeOthers), <XSquare className="h-4 w-4" aria-hidden />, () => onCloseOthers(menuTab.id), tabs.length < 2)}
                    {menuItem(tx(C.closeRight), <XSquare className="h-4 w-4" aria-hidden />, () => onCloseToRight(menuTab.id), menuIndex === tabs.length - 1)}
                </div>
            )}
        </div>
    );
}
