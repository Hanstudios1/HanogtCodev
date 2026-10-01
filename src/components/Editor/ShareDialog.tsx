"use client";

import { CheckCircle2, ClipboardCopy, FileCode2, FileJson, Share2, Text } from "lucide-react";
import { useState, type ReactNode } from "react";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import Modal from "@/components/Editor/Modal";
import { useI18n } from "@/lib/i18n";
import { languageDisplayName } from "@/lib/runtimes/languages";

interface ShareDialogProps {
    open: boolean;
    onClose: () => void;
    file: { name: string; lang: string; code: string } | null;
    onDownloadSnippet: () => void;
    onDownloadSource: () => void;
}

/** Fence long enough that the code itself cannot close it. */
export function markdownFence(code: string, language: string): string {
    const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((match) => match[0].length));
    const fence = "`".repeat(longest + 1);
    return `${fence}${language}\n${code.replace(/\n$/, "")}\n${fence}\n`;
}

export default function ShareDialog({ open, onClose, file, onDownloadSnippet, onDownloadSource }: ShareDialogProps) {
    const { tx } = useI18n();
    const [copied, setCopied] = useState<"code" | "markdown" | null>(null);
    const copy = async (kind: "code" | "markdown") => {
        if (!file) return;
        try {
            await navigator.clipboard.writeText(kind === "code" ? file.code : markdownFence(file.code, file.lang === "plaintext" ? "" : file.lang));
            setCopied(kind);
            window.setTimeout(() => setCopied(null), 1600);
        } catch {
            setCopied(null);
        }
    };
    const option = (icon: ReactNode, title: string, description: string, onClick: () => void, done = false) => (
        <button type="button" onClick={onClick} className="flex w-full items-start gap-3 rounded-2xl border border-zinc-200 p-3 text-start transition hover:-translate-y-0.5 hover:border-indigo-500/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-white/10 dark:hover:border-indigo-400/40">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-300">{done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden /> : icon}</span>
            <span className="min-w-0">
                <span className="block font-semibold">{title}</span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">{description}</span>
            </span>
        </button>
    );
    return (
        <Modal open={open} onClose={onClose} size="md" icon={<Share2 className="h-5 w-5" aria-hidden />} title={tx({ TR: "Kod parçacığını paylaş", EN: "Share snippet" })} description={file ? tx({ TR: "{name} · {language}", EN: "{name} · {language}" }, { name: file.name, language: languageDisplayName(file.lang) }) : undefined}>
            {file && (
                <div className="space-y-2">
                    <div className="mb-3 flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
                        <LanguageIcon language={file.lang} size={16} />
                        {tx({ TR: "{lines} satır · {chars} karakter", EN: "{lines} lines · {chars} characters" }, { lines: file.code.split("\n").length, chars: file.code.length })}
                    </div>
                    {option(<FileJson className="h-5 w-5" aria-hidden />, tx({ TR: "Hanogt parçacık dosyası indir", EN: "Download a Hanogt snippet file" }), tx({ TR: "Ad, dil ve kod tek dosyada (.hanogt.json). Karşı taraf Dosya yükle ile aynı sekmeyi açar.", EN: "Name, language and code in one file (.hanogt.json). The recipient opens the same tab with Upload file." }), () => { onDownloadSnippet(); onClose(); })}
                    {option(<FileCode2 className="h-5 w-5" aria-hidden />, tx({ TR: "Kaynak dosyayı indir", EN: "Download the source file" }), tx({ TR: "Kodu {name} olarak kaydeder.", EN: "Saves the code as {name}." }, { name: file.name }), () => { onDownloadSource(); onClose(); })}
                    {option(<ClipboardCopy className="h-5 w-5" aria-hidden />, tx({ TR: "Kodu kopyala", EN: "Copy the code" }), tx({ TR: "Panoya düz metin olarak kopyalar.", EN: "Copies the code as plain text." }), () => void copy("code"), copied === "code")}
                    {option(<Text className="h-5 w-5" aria-hidden />, tx({ TR: "Markdown olarak kopyala", EN: "Copy as Markdown" }), tx({ TR: "Sohbet, README veya forumlar için kod bloğu.", EN: "A code block for chats, READMEs or forums." }), () => void copy("markdown"), copied === "markdown")}
                </div>
            )}
        </Modal>
    );
}
