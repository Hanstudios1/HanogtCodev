"use client";

import { ArrowLeft, Command, Download, FilePlus2, FolderDown, Keyboard, Moon, Save, Settings, Share2, Sun, Upload } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export interface EditorActions {
    onNewFile?: () => void;
    onUpload?: () => void;
    onSave: () => void;
    onDownload: () => void;
    onDownloadProject: () => void;
    onShare: () => void;
    onPalette: () => void;
    onShortcuts: () => void;
}

interface SidebarProps extends EditorActions {
    backHref?: string;
    saveShortcut: string;
    paletteShortcut: string;
}

export const SIDEBAR_COPY = {
    back: { TR: "Önceki çalışma alanına dön", EN: "Back to the previous workspace" },
    newFile: { TR: "Yeni dosya veya şablon", EN: "New file or template" },
    upload: { TR: "Dosya yükle (metin veya ZIP)", EN: "Upload files (text or ZIP)" },
    save: { TR: "Kaydet", EN: "Save" },
    download: { TR: "Bu dosyayı indir", EN: "Download this file" },
    downloadProject: { TR: "Projeyi ZIP olarak indir", EN: "Download the project as ZIP" },
    share: { TR: "Kod parçacığını paylaş", EN: "Share snippet" },
    palette: { TR: "Hızlı işlemler", EN: "Quick actions" },
    shortcuts: { TR: "Klavye kısayolları", EN: "Keyboard shortcuts" },
    settings: { TR: "Editör ayarları", EN: "Editor settings" },
    light: { TR: "Açık temaya geç", EN: "Switch to light theme" },
    dark: { TR: "Koyu temaya geç", EN: "Switch to dark theme" },
    toolbar: { TR: "Editör işlemleri", EN: "Editor actions" },
} satisfies Record<string, Copy>;

function ActionButton({ label, shortcut, onClick, children, accent = false }: { label: string; shortcut?: string; onClick: () => void; children: ReactNode; accent?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={shortcut ? `${label} (${shortcut})` : label}
            aria-label={label}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${accent ? "text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"}`}
        >
            {children}
        </button>
    );
}

/** The editor's vertical activity bar (tablet and desktop). */
export default function Sidebar({ backHref = "/dashboard", saveShortcut, paletteShortcut, onNewFile, onUpload, onSave, onDownload, onDownloadProject, onShare, onPalette, onShortcuts }: SidebarProps) {
    const { tx } = useI18n();
    const { theme, toggle } = useTheme();
    return (
        <nav aria-label={tx(SIDEBAR_COPY.toolbar)} className="hidden h-full w-14 shrink-0 flex-col items-center justify-between border-e border-zinc-200 bg-white py-2 dark:border-white/10 dark:bg-zinc-950 md:flex">
            <div className="flex flex-col items-center gap-1">
                <Link href={backHref} title={tx(SIDEBAR_COPY.back)} aria-label={tx(SIDEBAR_COPY.back)} className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white">
                    <ArrowLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
                </Link>
                {onNewFile && <ActionButton label={tx(SIDEBAR_COPY.newFile)} onClick={onNewFile} accent><FilePlus2 className="h-5 w-5" aria-hidden /></ActionButton>}
                {onUpload && <ActionButton label={tx(SIDEBAR_COPY.upload)} onClick={onUpload}><Upload className="h-5 w-5" aria-hidden /></ActionButton>}
                <ActionButton label={tx(SIDEBAR_COPY.save)} shortcut={saveShortcut} onClick={onSave}><Save className="h-5 w-5" aria-hidden /></ActionButton>
                <ActionButton label={tx(SIDEBAR_COPY.download)} onClick={onDownload}><Download className="h-5 w-5" aria-hidden /></ActionButton>
                <ActionButton label={tx(SIDEBAR_COPY.downloadProject)} onClick={onDownloadProject}><FolderDown className="h-5 w-5" aria-hidden /></ActionButton>
                <ActionButton label={tx(SIDEBAR_COPY.share)} onClick={onShare}><Share2 className="h-5 w-5" aria-hidden /></ActionButton>
                <div className="my-1 h-px w-6 bg-zinc-200 dark:bg-white/10" />
                <ActionButton label={tx(SIDEBAR_COPY.palette)} shortcut={paletteShortcut} onClick={onPalette}><Command className="h-5 w-5" aria-hidden /></ActionButton>
                <ActionButton label={tx(SIDEBAR_COPY.shortcuts)} onClick={onShortcuts}><Keyboard className="h-5 w-5" aria-hidden /></ActionButton>
            </div>
            <div className="flex flex-col items-center gap-1">
                <ActionButton label={tx(theme === "dark" ? SIDEBAR_COPY.light : SIDEBAR_COPY.dark)} onClick={toggle}>
                    {theme === "dark" ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
                </ActionButton>
                <Link href="/settings" title={tx(SIDEBAR_COPY.settings)} aria-label={tx(SIDEBAR_COPY.settings)} className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white">
                    <Settings className="h-5 w-5" aria-hidden />
                </Link>
            </div>
        </nav>
    );
}
