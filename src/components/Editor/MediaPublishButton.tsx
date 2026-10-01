"use client";

import { ChevronDown, ClipboardCopy, ExternalLink, RefreshCw, Send, Trash2 } from "lucide-react";
import ToolbarMenu, { type ToolbarMenuSection } from "@/components/Editor/ToolbarMenu";
import { mediaPostPath, type MediaPublication } from "@/components/Editor/media-publish";
import { useI18n, type Copy } from "@/lib/i18n";

export const MEDIA_BUTTON_COPY = {
    publish: { TR: "Media'da yayınla", EN: "Publish on Media" },
    update: { TR: "Yayını güncelle", EN: "Update the post" },
    view: { TR: "Media'da görüntüle", EN: "View on Media" },
    copyLink: { TR: "Bağlantıyı kopyala", EN: "Copy link" },
    unpublish: { TR: "Yayından kaldır", EN: "Unpublish" },
    menu: { TR: "Media yayını", EN: "Media post" },
    published: { TR: "Media'da yayında: {title}", EN: "Published on Media: {title}" },
} satisfies Record<string, Copy>;

interface MediaPublishButtonProps {
    publication: MediaPublication | null;
    /** Opens the publish dialog (it updates the post when there is one). */
    onPublish: () => void;
    onCopyLink: () => void;
    onUnpublish: () => void;
    /** An unpublish request is running. */
    busy?: boolean;
}

const base = "inline-flex h-9 items-center gap-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
const accent = "border border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20";
const quiet = "rounded-xl border border-zinc-200 px-2 text-zinc-600 hover:border-indigo-500/40 hover:text-indigo-700 dark:border-white/10 dark:text-zinc-300 dark:hover:text-indigo-300";

/** The toolbar's Hanogt Media control: publish, or update/view/unpublish the workspace's post. */
export default function MediaPublishButton({ publication, onPublish, onCopyLink, onUnpublish, busy = false }: MediaPublishButtonProps) {
    const { tx } = useI18n();
    if (!publication) {
        return (
            <button type="button" onClick={onPublish} title={tx(MEDIA_BUTTON_COPY.publish)} aria-label={tx(MEDIA_BUTTON_COPY.publish)} className={`${base} ${accent} rounded-xl px-2.5`}>
                <Send className="h-4 w-4" aria-hidden />
                <span className="hidden xl:inline">{tx(MEDIA_BUTTON_COPY.publish)}</span>
            </button>
        );
    }
    const view = mediaPostPath(publication.postId);
    const sections: ToolbarMenuSection[] = [{
        id: "media",
        label: publication.title || tx(MEDIA_BUTTON_COPY.menu),
        items: [
            { id: "update", label: tx(MEDIA_BUTTON_COPY.update), icon: <RefreshCw className="h-4 w-4" />, onSelect: onPublish },
            { id: "view", label: tx(MEDIA_BUTTON_COPY.view), icon: <ExternalLink className="h-4 w-4" />, href: view, external: true },
            { id: "copy", label: tx(MEDIA_BUTTON_COPY.copyLink), icon: <ClipboardCopy className="h-4 w-4" />, onSelect: onCopyLink },
            { id: "unpublish", label: tx(MEDIA_BUTTON_COPY.unpublish), icon: <Trash2 className="h-4 w-4" />, danger: true, disabled: busy, onSelect: onUnpublish },
        ],
    }];
    const status = tx(MEDIA_BUTTON_COPY.published, { title: publication.title });
    const dot = <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />;
    return (
        <>
            {/* Phones: one button that opens every Media action. */}
            <div className="flex sm:hidden">
                <ToolbarMenu label={tx(MEDIA_BUTTON_COPY.menu)} title={status} sections={sections} buttonClassName={`${base} ${accent} rounded-xl px-2.5`}>
                    <Send className="h-4 w-4" aria-hidden />
                    {dot}
                </ToolbarMenu>
            </div>
            <div className="hidden items-center gap-1.5 sm:flex">
                <a href={view} target="_blank" rel="noopener noreferrer" title={tx(MEDIA_BUTTON_COPY.view)} aria-label={tx(MEDIA_BUTTON_COPY.view)} className={`${base} ${quiet}`}>
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    <span className="hidden 2xl:inline">{tx(MEDIA_BUTTON_COPY.view)}</span>
                </a>
                <div className="flex">
                    <button type="button" onClick={onPublish} title={status} aria-label={tx(MEDIA_BUTTON_COPY.update)} className={`${base} ${accent} rounded-s-xl border-e-0 px-2.5`}>
                        <RefreshCw className="h-4 w-4" aria-hidden />
                        <span className="hidden xl:inline">{tx(MEDIA_BUTTON_COPY.update)}</span>
                        {dot}
                    </button>
                    <ToolbarMenu label={tx(MEDIA_BUTTON_COPY.menu)} sections={sections} buttonClassName={`${base} ${accent} rounded-e-xl px-1.5`}>
                        <ChevronDown className="h-4 w-4" aria-hidden />
                    </ToolbarMenu>
                </div>
            </div>
        </>
    );
}
