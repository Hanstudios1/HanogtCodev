"use client";

import { AlertTriangle, Check, LoaderCircle, MessageSquareText, Mic, UsersRound } from "lucide-react";
import { useId, useMemo, useState } from "react";
import CollabFriendPicker, { useCollabFriends } from "@/components/Editor/CollabFriendPicker";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import Modal, { buttonClasses } from "@/components/Editor/Modal";
import { COLLAB_LIMITS, isCollabFileId, randomId } from "@/lib/collab/protocol";
import type { CollabStartInput } from "@/lib/collab/use-editor-collab";
import { useI18n, type Copy } from "@/lib/i18n";

const C = {
    title: { TR: "Ekiple beraber kod düzenle", EN: "Edit code together with your team" },
    description: { TR: "Açık dosyalarını arkadaşlarınla aynı anda düzenle. Herkesin imlecini görürsün; oturum panelinden yazışıp sesli konuşabilirsiniz.", EN: "Edit your open files with friends at the same time. You see everyone's cursor and can chat and talk from the session panel." },
    name: { TR: "Oturum adı", EN: "Session name" },
    files: { TR: "Paylaşılacak dosyalar", EN: "Files to share" },
    filesHint: { TR: "En fazla {files} dosya; dosya başına 500.000, toplam 1.000.000 karakter.", EN: "Up to {files} files; 500,000 characters per file, 1,000,000 in total." },
    tooLarge: { TR: "500.000 karakterden büyük", EN: "larger than 500,000 characters" },
    totalTooLarge: { TR: "Seçilen dosyalar toplam 1.000.000 karakteri aşıyor.", EN: "The selected files exceed 1,000,000 characters in total." },
    tooMany: { TR: "En fazla {count} dosya seçebilirsin.", EN: "You can select up to {count} files." },
    invite: { TR: "Arkadaşlarını davet et", EN: "Invite friends" },
    inviteHint: { TR: "Yalnızca arkadaşların davet edilebilir. Davet edilenlere bildirim gider; davet bağlantısıyla da katılabilirler. Oturuma en fazla 5 kişi katılabilir.", EN: "Only your friends can be invited. They get a notification and can also join with the invite link. Up to 5 people can be in a session." },
    later: { TR: "Davetleri sonra da gönderebilirsin.", EN: "You can also invite people later." },
    features: { TR: "Canlı imleçler · sohbet · sesli konuşma · takip modu", EN: "Live cursors · chat · voice · follow mode" },
    start: { TR: "Oturumu başlat", EN: "Start the session" },
    starting: { TR: "Başlatılıyor…", EN: "Starting…" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    privacy: { TR: "Kod, sohbet ve adın yalnızca oturumdakilerle paylaşılır. Oturum bitince sohbet ve canlı veriler silinir; son hâl 24 saat sonra tamamen kaldırılır. Ses kaydedilmez.", EN: "Code, chat and your name are shared only with the people in the session. When it ends, the chat and live data are deleted; the final state is removed after 24 hours. Audio is never recorded." },
} satisfies Record<string, Copy>;

type SourceFile = { id: string; name: string; lang: string; code: string };

/** Files selected by default: in tab order while they fit the session's limits. */
function defaultSelection(files: readonly SourceFile[]) {
    const selected = new Set<string>();
    let total = 0;
    for (const file of files) {
        if (selected.size >= COLLAB_LIMITS.maxFiles || file.code.length > COLLAB_LIMITS.maxFileChars || total + file.code.length > COLLAB_LIMITS.maxTotalChars) continue;
        selected.add(file.id);
        total += file.code.length;
    }
    return selected;
}

export default function CollabStartDialog({ open, onClose, files, defaultTitle, busy, onStart }: {
    open: boolean;
    onClose: () => void;
    files: readonly SourceFile[];
    defaultTitle: string;
    busy: boolean;
    onStart: (input: CollabStartInput) => Promise<boolean>;
}) {
    const { tx } = useI18n();
    const titleId = useId();
    const [title, setTitle] = useState(defaultTitle);
    const [chosen, setChosen] = useState<Set<string>>(() => defaultSelection(files));
    const [invite, setInvite] = useState<Set<string>>(() => new Set());
    const { friends, failed, retry } = useCollabFriends(open);
    // Every opening starts from the current tabs.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setTitle(defaultTitle);
            setChosen(defaultSelection(files));
            setInvite(new Set());
        }
    }

    const selectedFiles = useMemo(() => files.filter((file) => chosen.has(file.id)), [chosen, files]);
    const total = selectedFiles.reduce((sum, file) => sum + file.code.length, 0);
    const tooMany = selectedFiles.length > COLLAB_LIMITS.maxFiles;
    const tooLarge = total > COLLAB_LIMITS.maxTotalChars;
    const canStart = !busy && selectedFiles.length > 0 && !tooMany && !tooLarge;

    const toggleFile = (id: string) => setChosen((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
    const toggleFriend = (email: string) => setInvite((current) => {
        const next = new Set(current);
        if (next.has(email)) next.delete(email);
        else if (next.size < COLLAB_LIMITS.maxParticipants - 1) next.add(email);
        return next;
    });

    const submit = async () => {
        if (!canStart) return;
        const ok = await onStart({
            title: title.trim() || defaultTitle,
            // Tab ids become file ids, so the owner's tabs receive the final content when the session ends.
            files: selectedFiles.map((file) => ({ id: isCollabFileId(file.id) ? file.id : `f-${randomId(12)}`, name: file.name, lang: file.lang, code: file.code })),
            invite: [...invite],
        });
        if (ok) onClose();
    };

    return (
        <Modal
            open={open}
            onClose={() => {
                if (!busy) onClose();
            }}
            size="lg"
            title={tx(C.title)}
            description={tx(C.description)}
            icon={<UsersRound className="h-5 w-5" aria-hidden />}
            footer={(
                <>
                    <p className="me-auto hidden items-center gap-3 text-xs text-zinc-500 md:flex dark:text-zinc-400">
                        <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                        <Mic className="-ms-2 h-3.5 w-3.5" aria-hidden />
                        {tx(C.features)}
                    </p>
                    <button type="button" className={buttonClasses.secondary} onClick={onClose} disabled={busy}>{tx(C.cancel)}</button>
                    <button type="button" className={buttonClasses.primary} onClick={() => void submit()} disabled={!canStart} aria-busy={busy || undefined}>
                        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <UsersRound className="h-4 w-4" aria-hidden />}
                        {tx(busy ? C.starting : C.start)}
                    </button>
                </>
            )}
        >
            <div className="grid gap-5 md:grid-cols-2">
                <section className="min-w-0 space-y-3">
                    <div>
                        <label htmlFor={titleId} className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">{tx(C.name)}</label>
                        <input
                            id={titleId}
                            value={title}
                            maxLength={COLLAB_LIMITS.maxTitle}
                            onChange={(event) => setTitle(event.target.value)}
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                        />
                    </div>
                    <fieldset className="min-w-0">
                        <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{tx(C.files)}</legend>
                        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.filesHint, { files: COLLAB_LIMITS.maxFiles })}</p>
                        <ul className="max-h-64 space-y-1 overflow-y-auto pe-1 [scrollbar-width:thin]">
                            {files.map((file) => {
                                const oversized = file.code.length > COLLAB_LIMITS.maxFileChars;
                                const checked = chosen.has(file.id) && !oversized;
                                return (
                                    <li key={file.id}>
                                        <label className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition ${oversized ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.06]"}`}>
                                            <input type="checkbox" className="peer sr-only" checked={checked} disabled={oversized} onChange={() => toggleFile(file.id)} />
                                            <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 ${checked ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-300 bg-white dark:border-white/20 dark:bg-zinc-950"}`}>
                                                {checked && <Check className="h-3.5 w-3.5" />}
                                            </span>
                                            <LanguageIcon language={file.lang} size={16} />
                                            <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-100">{file.name}</span>
                                            {oversized && <span className="shrink-0 text-[11px] text-amber-600 dark:text-amber-400">{tx(C.tooLarge)}</span>}
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                        {(tooMany || tooLarge) && (
                            <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                {tooMany ? tx(C.tooMany, { count: COLLAB_LIMITS.maxFiles }) : tx(C.totalTooLarge)}
                            </p>
                        )}
                    </fieldset>
                </section>
                <section className="min-w-0">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{tx(C.invite)}</h3>
                    <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.inviteHint)}</p>
                    <CollabFriendPicker friends={friends} failed={failed} onRetry={retry} selected={invite} onToggle={toggleFriend} max={COLLAB_LIMITS.maxParticipants - 1} />
                    {!invite.size && friends?.length ? <p className="mt-1 text-xs text-zinc-400">{tx(C.later)}</p> : null}
                </section>
            </div>
            <p className="mt-4 rounded-xl bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500 dark:bg-white/[0.04] dark:text-zinc-400">{tx(C.privacy)}</p>
        </Modal>
    );
}
