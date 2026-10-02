"use client";

import { Download, FileCode2, LoaderCircle, Lock, LogIn, Save, UsersRound } from "lucide-react";
import { useState } from "react";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import Modal, { buttonClasses } from "@/components/Editor/Modal";
import PresenceAvatar from "@/components/PresenceAvatar";
import { buildProjectZip, triggerDownload } from "@/components/Editor/editor-files";
import type { CollabFileContent } from "@/lib/collab/doc";
import type { EditorCollab } from "@/lib/collab/use-editor-collab";
import { useI18n, type Copy } from "@/lib/i18n";

const C = {
    joinTitle: { TR: "Canlı kod oturumuna katıl", EN: "Join the live coding session" },
    joinDescription: { TR: "{owner} seni “{title}” oturumuna davet etti.", EN: "{owner} invited you to “{title}”." },
    inSession: { TR: "Oturumdakiler", EN: "In the session" },
    full: { TR: "Oturum dolu (en fazla 5 kişi). Biri ayrılınca katılabilirsin.", EN: "The session is full (5 people at most). You can join when someone leaves." },
    readOnly: { TR: "Oturum sahibi şu anda düzenlemeyi kapatmış; katılınca izleyebilirsin.", EN: "The owner has turned editing off for now; you can watch after joining." },
    joinNote: { TR: "Katılınca kendi açık dosyaların korunur; oturumdan ayrılınca onlara geri dönersin. Adın, avatarın ve imlecin oturumdakilere görünür.", EN: "Your own open files are kept while you're in the session and come back when you leave. Your name, avatar and cursor are visible to the people in it." },
    join: { TR: "Katıl", EN: "Join" },
    notNow: { TR: "Şimdi değil", EN: "Not now" },
    endedTitle: { TR: "Canlı oturum sona erdi", EN: "The live session has ended" },
    leftTitle: { TR: "Oturumdan ayrıldın", EN: "You left the session" },
    lostTitle: { TR: "Canlı oturumla bağlantı kesildi", EN: "Lost the connection to the live session" },
    lostDescription: { TR: "Oturuma artık erişilemiyor; oturumunun süresi dolmuş olabilir. Elindeki son hâlin bir kopyasını saklayabilirsin.", EN: "The session can't be reached any more; your sign-in may have expired. You can keep a copy of the latest code you had." },
    endedDescription: { TR: "“{title}” oturumundaki kodun son hâli aşağıda. Bir kopyasını saklamak istersen editörüne ekleyebilir ya da ZIP olarak indirebilirsin.", EN: "Here is the final code of “{title}”. To keep a copy, add it to your editor or download it as a ZIP." },
    files: { TR: "{count} dosya", EN: "{count} files" },
    keep: { TR: "Kopyayı sakla", EN: "Keep a copy" },
    keepHint: { TR: "Dosyalar editörüne kaydedilmemiş sekmeler olarak eklenir.", EN: "The files are added to your editor as unsaved tabs." },
    zip: { TR: "ZIP olarak indir", EN: "Download as ZIP" },
    zipFailed: { TR: "ZIP dosyası oluşturulamadı.", EN: "The ZIP file couldn't be created." },
    close: { TR: "Kapat", EN: "Close" },
    chars: { TR: "{count} karakter", EN: "{count} characters" },
} satisfies Record<string, Copy>;

/**
 * The dialogs around a live session: joining from an invite link and, for
 * participants, keeping a copy of the final code ("Kopyayı sakla") when the
 * session ends or they leave.
 */
export default function CollabDialogs({ collab, onKeepCopy }: {
    collab: EditorCollab;
    /** Adds the files to the participant's own editor as unsaved tabs. */
    onKeepCopy: (files: CollabFileContent[]) => void;
}) {
    const { tx, locale } = useI18n();
    const [zipError, setZipError] = useState(false);
    const info = collab.joinInfo;
    const finished = collab.finished;
    const number = (value: number) => {
        try {
            return new Intl.NumberFormat(locale).format(value);
        } catch {
            return String(value);
        }
    };

    const downloadZip = async (files: CollabFileContent[], title: string) => {
        setZipError(false);
        try {
            const blob = await buildProjectZip(files.map((file) => ({ name: file.name, lang: file.lang, code: file.code })));
            const base = (title || "hanogt-live").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 100) || "hanogt-live";
            triggerDownload(blob, `${base}.zip`);
        } catch {
            setZipError(true);
        }
    };

    return (
        <>
            <Modal
                open={Boolean(info)}
                onClose={() => {
                    if (collab.busy !== "join") collab.dismissJoin();
                }}
                size="sm"
                title={tx(C.joinTitle)}
                description={info ? tx(C.joinDescription, { owner: info.owner.name, title: info.title }) : undefined}
                icon={<UsersRound className="h-5 w-5" aria-hidden />}
                footer={(
                    <>
                        <button type="button" className={buttonClasses.secondary} onClick={collab.dismissJoin} disabled={collab.busy === "join"}>{tx(C.notNow)}</button>
                        <button type="button" className={buttonClasses.primary} onClick={() => void collab.join()} disabled={collab.busy === "join" || Boolean(info?.full)}>
                            {collab.busy === "join" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
                            {tx(C.join)}
                        </button>
                    </>
                )}
            >
                {info && (
                    <div className="space-y-3 text-sm">
                        <div className="flex items-center gap-3">
                            <PresenceAvatar src={info.owner.avatar} name={info.owner.name} size="md" />
                            <div className="min-w-0">
                                <p className="truncate font-semibold" dir="auto">{info.title}</p>
                                <p className="truncate text-xs text-zinc-500" dir="auto">{info.owner.name}</p>
                            </div>
                        </div>
                        {info.participants.length > 0 && (
                            <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{tx(C.inSession)}</p>
                                <ul className="flex flex-wrap gap-1.5">
                                    {info.participants.map((person, index) => (
                                        <li key={`${person.name}-${index}`} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 py-0.5 pe-2.5 ps-0.5 text-xs dark:bg-white/[0.08]">
                                            <PresenceAvatar src={person.avatar} name={person.name} size="sm" />
                                            <span dir="auto">{person.name}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {info.full && <p role="alert" className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">{tx(C.full)}</p>}
                        {info.readOnly && !info.full && (
                            <p className="flex items-start gap-1.5 rounded-xl bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
                                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{tx(C.readOnly)}
                            </p>
                        )}
                        <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.joinNote)}</p>
                    </div>
                )}
            </Modal>

            <Modal
                open={Boolean(finished)}
                onClose={() => {
                    setZipError(false);
                    collab.dismissFinished();
                }}
                size="md"
                title={tx(finished?.reason === "left" ? C.leftTitle : finished?.reason === "unavailable" ? C.lostTitle : C.endedTitle)}
                description={finished ? (finished.reason === "unavailable" ? tx(C.lostDescription) : tx(C.endedDescription, { title: finished.title })) : undefined}
                icon={<FileCode2 className="h-5 w-5" aria-hidden />}
                footer={finished ? (
                    <>
                        <button type="button" className={buttonClasses.ghost} onClick={() => { setZipError(false); collab.dismissFinished(); }}>{tx(C.close)}</button>
                        <button type="button" className={buttonClasses.secondary} onClick={() => void downloadZip(finished.files, finished.title)} disabled={!finished.files.length}>
                            <Download className="h-4 w-4" aria-hidden />{tx(C.zip)}
                        </button>
                        <button
                            type="button"
                            className={buttonClasses.primary}
                            disabled={!finished.files.length}
                            onClick={() => {
                                onKeepCopy(finished.files);
                                setZipError(false);
                                collab.dismissFinished();
                            }}
                        >
                            <Save className="h-4 w-4" aria-hidden />{tx(C.keep)}
                        </button>
                    </>
                ) : null}
            >
                {finished && (
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{tx(C.files, { count: finished.files.length })}</p>
                        <ul className="max-h-56 space-y-1 overflow-y-auto pe-1 [scrollbar-width:thin]">
                            {finished.files.map((file) => (
                                <li key={file.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm">
                                    <LanguageIcon language={file.lang} size={16} />
                                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                                    <span className="shrink-0 text-xs text-zinc-400">{tx(C.chars, { count: number(file.code.length) })}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{tx(C.keepHint)}</p>
                        {zipError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{tx(C.zipFailed)}</p>}
                    </div>
                )}
            </Modal>
        </>
    );
}
