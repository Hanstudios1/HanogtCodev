"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Code2, Download, FilePlus2, FolderArchive, MoreHorizontal, Pencil, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { GROUP_LIMITS, NEW_FILE_TEMPLATES, fileNameProblem, languageFromFileName } from "@/lib/groups";
import { Modal, ModalHeader, Spinner, cx } from "../ui";
import { useWorkspace } from "./context";
import type { GroupFileItem } from "./model";

const C = {
    files: { TR: "Dosyalar", EN: "Files" },
    count: { TR: "{count}/{max}", EN: "{count}/{max}" },
    newFile: { TR: "Yeni dosya", EN: "New file" },
    filter: { TR: "Dosyalarda ara…", EN: "Filter files…" },
    filterLabel: { TR: "Dosyalarda ara", EN: "Filter files" },
    noMatch: { TR: "Eşleşen dosya yok.", EN: "No matching files." },
    empty: { TR: "Henüz dosya yok. İlk dosyayı oluştur!", EN: "No files yet. Create the first one!" },
    menu: { TR: "{name} için işlemler", EN: "Actions for {name}" },
    rename: { TR: "Yeniden adlandır", EN: "Rename" },
    download: { TR: "İndir", EN: "Download" },
    openInEditor: { TR: "Düzenleyici'de aç (kopya)", EN: "Open a copy in the Editor" },
    delete: { TR: "Sil", EN: "Delete" },
    downloadAll: { TR: "Tümünü ZIP olarak indir", EN: "Download all as ZIP" },
    openAll: { TR: "Tümünü Düzenleyici'de aç", EN: "Open all in the Editor" },
    renameLabel: { TR: "Yeni dosya adı", EN: "New file name" },
    save: { TR: "Kaydet", EN: "Save" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    editing: { TR: "{name} düzenliyor", EN: "{name} is editing" },
    dialogTitle: { TR: "Yeni dosya oluştur", EN: "Create a new file" },
    dialogText: { TR: "Bir başlangıç şablonu seç ve dosyaya bir ad ver. Uzantı, söz dizimi vurgulamasını belirler.", EN: "Pick a starter and name the file. The extension decides the syntax highlighting." },
    starter: { TR: "Başlangıç", EN: "Starter" },
    fileName: { TR: "Dosya adı", EN: "File name" },
    folderHint: { TR: "Klasör için \"/\" kullanabilirsin (ör. src/app.js); ZIP indirirken klasörler korunur.", EN: "Use \"/\" for folders (e.g. src/app.js); folders are kept in the ZIP download." },
    create: { TR: "Oluştur", EN: "Create" },
    language: { TR: "Dil: {language}", EN: "Language: {language}" },
} satisfies Record<string, Copy>;

const FILE_BADGES: Record<string, { label: string; className: string }> = {
    javascript: { label: "JS", className: "bg-yellow-400 text-yellow-950" },
    typescript: { label: "TS", className: "bg-blue-600 text-white" },
    python: { label: "PY", className: "bg-sky-600 text-yellow-200" },
    csharp: { label: "C#", className: "bg-violet-600 text-white" },
    cpp: { label: "C++", className: "bg-blue-700 text-white" },
    c: { label: "C", className: "bg-slate-600 text-white" },
    java: { label: "JV", className: "bg-red-600 text-white" },
    html: { label: "</>", className: "bg-orange-500 text-white" },
    css: { label: "CSS", className: "bg-blue-500 text-white" },
    scss: { label: "SC", className: "bg-pink-500 text-white" },
    less: { label: "LS", className: "bg-indigo-700 text-white" },
    php: { label: "PHP", className: "bg-indigo-500 text-white" },
    go: { label: "GO", className: "bg-cyan-500 text-white" },
    swift: { label: "SW", className: "bg-orange-600 text-white" },
    ruby: { label: "RB", className: "bg-red-700 text-white" },
    rust: { label: "RS", className: "bg-orange-800 text-white" },
    kotlin: { label: "KT", className: "bg-purple-500 text-white" },
    sql: { label: "SQL", className: "bg-teal-600 text-white" },
    lua: { label: "LUA", className: "bg-blue-900 text-white" },
    markdown: { label: "MD", className: "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" },
    json: { label: "{ }", className: "bg-amber-500 text-amber-950" },
    yaml: { label: "YML", className: "bg-rose-500 text-white" },
    xml: { label: "XML", className: "bg-emerald-600 text-white" },
    shell: { label: "SH", className: "bg-zinc-900 text-emerald-300" },
    dart: { label: "DT", className: "bg-sky-500 text-white" },
    r: { label: "R", className: "bg-blue-500 text-white" },
};

const LANGUAGE_NAMES: Record<string, string> = {
    javascript: "JavaScript", typescript: "TypeScript", python: "Python", csharp: "C#", cpp: "C++", c: "C", java: "Java", html: "HTML",
    css: "CSS", scss: "SCSS", less: "Less", php: "PHP", go: "Go", swift: "Swift", ruby: "Ruby", rust: "Rust", kotlin: "Kotlin", sql: "SQL",
    lua: "Lua", markdown: "Markdown", json: "JSON", yaml: "YAML", xml: "XML", shell: "Shell", dart: "Dart", r: "R", plaintext: "Text",
};

export function languageName(lang: string) {
    return LANGUAGE_NAMES[lang] || lang;
}

export function FileBadge({ lang, className }: { lang: string; className?: string }) {
    const badge = FILE_BADGES[lang] ?? { label: "TXT", className: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200" };
    return <span className={cx("inline-flex h-5 min-w-7 shrink-0 items-center justify-center rounded-md px-1 font-mono text-[9px] font-black leading-none", badge.className, className)} aria-hidden>{badge.label}</span>;
}

/** Name check shared by "new file" and "rename": valid characters and unique (case-insensitive). */
function useNameCheck(files: GroupFileItem[], ignoreId = "") {
    return (value: string): "file_name" | "file_exists" | null => {
        const name = value.trim();
        if (fileNameProblem(name)) return "file_name";
        if (files.some((file) => file.id !== ignoreId && file.name.toLowerCase() === name.toLowerCase())) return "file_exists";
        return null;
    };
}

type FilesPanelProps = {
    files: GroupFileItem[];
    loaded: boolean;
    activeId: string;
    onSelect: (fileId: string) => void;
    onCreate: (name: string, code: string) => Promise<string | null>;
    onRename: (file: GroupFileItem, name: string) => Promise<boolean>;
    onDelete: (file: GroupFileItem) => void;
    onDownload: (file: GroupFileItem) => void;
    onDownloadAll: () => void;
    onOpenInEditor: (files: GroupFileItem[]) => void;
    zipBusy: boolean;
    newFileOpen: boolean;
    newFileKey: number;
    onNewFile: () => void;
    onCloseNewFile: () => void;
};

export default function FilesPanel({ files, loaded, activeId, onSelect, onCreate, onRename, onDelete, onDownload, onDownloadAll, onOpenInEditor, zipBusy, newFileOpen, newFileKey, onNewFile, onCloseNewFile }: FilesPanelProps) {
    const { tx, locale } = useI18n();
    const { isManager, memberByEmail, me, now, errorText } = useWorkspace();
    const [filter, setFilter] = useState("");
    const [menuFor, setMenuFor] = useState("");
    const [renaming, setRenaming] = useState("");
    const [renameValue, setRenameValue] = useState("");
    const [renameError, setRenameError] = useState("");
    const [renameBusy, setRenameBusy] = useState(false);
    const checkRename = useNameCheck(files, renaming);

    useEffect(() => {
        if (!menuFor) return;
        const onPointer = (event: PointerEvent) => {
            if (!(event.target instanceof Element) || !event.target.closest("[data-file-menu]")) setMenuFor("");
        };
        const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuFor(""); };
        document.addEventListener("pointerdown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [menuFor]);

    const visible = useMemo(() => {
        const needle = filter.trim().toLocaleLowerCase(locale);
        return needle ? files.filter((file) => file.name.toLocaleLowerCase(locale).includes(needle)) : files;
    }, [files, filter, locale]);

    const startRename = (file: GroupFileItem) => {
        setMenuFor("");
        setRenaming(file.id);
        setRenameValue(file.name);
        setRenameError("");
    };

    const submitRename = async (event: FormEvent, file: GroupFileItem) => {
        event.preventDefault();
        const name = renameValue.trim();
        if (name === file.name) {
            setRenaming("");
            return;
        }
        const problem = checkRename(name);
        if (problem) {
            setRenameError(errorText(problem));
            return;
        }
        setRenameBusy(true);
        const done = await onRename(file, name);
        setRenameBusy(false);
        if (done) setRenaming("");
    };

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {tx(C.files)}
                    <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{tx(C.count, { count: files.length, max: GROUP_LIMITS.filesMax })}</span>
                </h2>
                <div className="flex items-center gap-0.5">
                    <button type="button" onClick={onDownloadAll} disabled={!files.length || zipBusy} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-white" title={tx(C.downloadAll)} aria-label={tx(C.downloadAll)}>
                        {zipBusy ? <Spinner className="h-4 w-4" /> : <FolderArchive className="h-4 w-4" aria-hidden />}
                    </button>
                    <button type="button" onClick={() => onOpenInEditor(files)} disabled={!files.length} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-white" title={tx(C.openAll)} aria-label={tx(C.openAll)}>
                        <Code2 className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" onClick={onNewFile} disabled={files.length >= GROUP_LIMITS.filesMax} className="rounded-lg bg-indigo-600 p-1.5 text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-40" title={tx(C.newFile)} aria-label={tx(C.newFile)}>
                        <FilePlus2 className="h-4 w-4" aria-hidden />
                    </button>
                </div>
            </div>
            {files.length > 8 && (
                <label className="relative mx-3 mb-2 block">
                    <span className="sr-only">{tx(C.filterLabel)}</span>
                    <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" aria-hidden />
                    <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={tx(C.filter)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pe-2 ps-8 text-xs outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-zinc-950" />
                </label>
            )}
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3" aria-label={tx(C.files)}>
                {!loaded && [0, 1, 2, 3].map((item) => <li key={item} className="mx-1 my-1 h-8 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />)}
                {loaded && !files.length && (
                    <li className="px-3 py-6 text-center text-xs text-zinc-500">
                        {tx(C.empty)}
                        <button type="button" onClick={onNewFile} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 font-bold text-white"><FilePlus2 className="h-3.5 w-3.5" aria-hidden />{tx(C.newFile)}</button>
                    </li>
                )}
                {loaded && files.length > 0 && !visible.length && <li className="px-3 py-4 text-center text-xs text-zinc-500">{tx(C.noMatch)}</li>}
                {visible.map((file) => {
                    const active = file.id === activeId;
                    const editor = file.updatedBy && file.updatedBy !== me.email && now - file.updatedAt < 20_000 ? memberByEmail.get(file.updatedBy) : undefined;
                    if (renaming === file.id) {
                        return (
                            <li key={file.id} className="rounded-xl bg-zinc-100 p-1.5 dark:bg-zinc-800">
                                <form onSubmit={(event) => void submitRename(event, file)} className="flex items-center gap-1">
                                    <FileBadge lang={languageFromFileName(renameValue)} />
                                    <input autoFocus value={renameValue} maxLength={GROUP_LIMITS.fileNameMax} onChange={(event) => { setRenameValue(event.target.value); setRenameError(""); }} onKeyDown={(event) => { if (event.key === "Escape") setRenaming(""); }} aria-label={tx(C.renameLabel)} className="min-w-0 flex-1 rounded-lg border border-indigo-500 bg-white px-2 py-1 text-sm outline-none dark:bg-zinc-950" spellCheck={false} />
                                    <button type="submit" disabled={renameBusy} className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-500/10" aria-label={tx(C.save)}>{renameBusy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" aria-hidden />}</button>
                                    <button type="button" onClick={() => setRenaming("")} className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700" aria-label={tx(C.cancel)}><X className="h-4 w-4" aria-hidden /></button>
                                </form>
                                {renameError && <p className="mt-1 px-1 text-[11px] text-red-600 dark:text-red-400" role="alert">{renameError}</p>}
                            </li>
                        );
                    }
                    return (
                        <li key={file.id} className="group relative">
                            <div className={cx("flex items-center rounded-xl transition", active ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/80")}>
                                <button type="button" aria-current={active ? "true" : undefined} onClick={() => onSelect(file.id)} onDoubleClick={() => startRename(file)} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 rounded-xl">
                                    <FileBadge lang={file.lang} />
                                    <span className={cx("truncate", active && "font-semibold")}>{file.name}</span>
                                    {editor && <span className="relative ms-auto flex h-2 w-2 shrink-0" title={tx(C.editing, { name: editor.username })}><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /><span className="sr-only">{tx(C.editing, { name: editor.username })}</span></span>}
                                </button>
                                <button type="button" onClick={() => setMenuFor(menuFor === file.id ? "" : file.id)} data-file-menu className={cx("me-1 rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 focus-visible:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-200", menuFor === file.id ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100")} aria-label={tx(C.menu, { name: file.name })} aria-haspopup="menu" aria-expanded={menuFor === file.id}>
                                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                                </button>
                            </div>
                            <AnimatePresence>
                                {menuFor === file.id && (
                                    <motion.div role="menu" data-file-menu initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={{ duration: 0.12 }} className="absolute end-1 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-2xl dark:border-white/10 dark:bg-zinc-800">
                                        <MenuItem icon={<Pencil className="h-4 w-4" aria-hidden />} label={tx(C.rename)} onClick={() => startRename(file)} />
                                        <MenuItem icon={<Download className="h-4 w-4" aria-hidden />} label={tx(C.download)} onClick={() => { setMenuFor(""); onDownload(file); }} />
                                        <MenuItem icon={<Code2 className="h-4 w-4" aria-hidden />} label={tx(C.openInEditor)} onClick={() => { setMenuFor(""); onOpenInEditor([file]); }} />
                                        {isManager && <MenuItem danger icon={<Trash2 className="h-4 w-4" aria-hidden />} label={tx(C.delete)} onClick={() => { setMenuFor(""); onDelete(file); }} />}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </li>
                    );
                })}
            </ul>
            <NewFileDialog key={newFileKey} open={newFileOpen} onClose={onCloseNewFile} files={files} onCreate={onCreate} />
        </div>
    );
}

function MenuItem({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
    return (
        <button type="button" role="menuitem" onClick={onClick} className={cx("flex w-full items-center gap-3 px-3.5 py-2 text-start text-sm transition", danger ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700")}>
            {icon}{label}
        </button>
    );
}

function NewFileDialog({ open, onClose, files, onCreate }: { open: boolean; onClose: () => void; files: GroupFileItem[]; onCreate: (name: string, code: string) => Promise<string | null> }) {
    const { tx } = useI18n();
    const { errorText } = useWorkspace();
    const [templateId, setTemplateId] = useState(NEW_FILE_TEMPLATES[2].id);
    const [name, setName] = useState(() => uniqueName(NEW_FILE_TEMPLATES[2].fileName, files));
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const nameTouched = useRef(false);
    const check = useNameCheck(files);
    const template = NEW_FILE_TEMPLATES.find((entry) => entry.id === templateId) ?? NEW_FILE_TEMPLATES[0];

    const pickTemplate = (id: string) => {
        const next = NEW_FILE_TEMPLATES.find((entry) => entry.id === id);
        if (!next) return;
        setTemplateId(id);
        if (!nameTouched.current) setName(uniqueName(next.fileName, files));
        setError("");
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmed = name.trim();
        const problem = files.length >= GROUP_LIMITS.filesMax ? "files_limit" : check(trimmed);
        if (problem) {
            setError(errorText(problem));
            return;
        }
        setBusy(true);
        const created = await onCreate(trimmed, template.code);
        setBusy(false);
        if (created) onClose();
    };

    return (
        <Modal open={open} onClose={onClose} labelledBy="new-file-title" size="md">
            <ModalHeader id="new-file-title" title={tx(C.dialogTitle)} description={tx(C.dialogText)} onClose={onClose} icon={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><FilePlus2 className="h-5 w-5" aria-hidden /></span>} />
            <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
                    <fieldset>
                        <legend className="text-sm font-semibold">{tx(C.starter)}</legend>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {NEW_FILE_TEMPLATES.map((entry) => (
                                <button key={entry.id} type="button" onClick={() => pickTemplate(entry.id)} aria-pressed={entry.id === templateId} className={cx("flex items-center gap-2 rounded-xl border px-3 py-2 text-start text-sm transition", entry.id === templateId ? "border-indigo-500 bg-indigo-500/10 font-semibold text-indigo-700 dark:text-indigo-300" : "border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5")}>
                                    <FileBadge lang={languageFromFileName(entry.fileName)} />
                                    <span className="truncate">{tx(entry.label)}</span>
                                </button>
                            ))}
                        </div>
                    </fieldset>
                    <div>
                        <label htmlFor="new-file-name" className="text-sm font-semibold">{tx(C.fileName)}</label>
                        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-950">
                            <FileBadge lang={languageFromFileName(name)} />
                            <input id="new-file-name" data-autofocus value={name} maxLength={GROUP_LIMITS.fileNameMax} onChange={(event) => { nameTouched.current = true; setName(event.target.value); setError(""); }} className="min-w-0 flex-1 bg-transparent py-3 font-mono text-sm outline-none" spellCheck={false} autoComplete="off" />
                        </div>
                        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.language, { language: languageName(languageFromFileName(name)) })} · {tx(C.folderHint)}</p>
                    </div>
                    {template.code && <pre className="max-h-40 overflow-auto rounded-2xl bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-200" aria-hidden>{template.code}</pre>}
                </div>
                <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 px-5 py-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <p className="min-h-5 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
                    <button type="submit" disabled={busy || !name.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50">
                        {busy ? <Spinner className="h-4 w-4" /> : <FilePlus2 className="h-4 w-4" aria-hidden />}{tx(C.create)}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function uniqueName(name: string, files: GroupFileItem[]) {
    const taken = new Set(files.map((file) => file.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    for (let index = 2; index < 100; index += 1) {
        const candidate = `${base}-${index}${extension}`;
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
}
