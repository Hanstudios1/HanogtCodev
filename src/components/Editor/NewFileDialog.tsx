"use client";

import { Boxes, Check, Cpu, Eye, FileCode2, FilePlus2, Globe, Languages, Search, Server, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { matchScore } from "@/components/Editor/search";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import Modal, { buttonClasses } from "@/components/Editor/Modal";
import { uniqueFileName } from "@/components/Editor/editor-files";
import { useI18n, type Copy } from "@/lib/i18n";
import { ENGINE_LABELS, LANGUAGE_CATEGORIES, LANGUAGES, ensureFileExtension, getLanguage, type LanguageCategory, type LanguageEngine, type LanguageInfo } from "@/lib/runtimes/languages";
import { PROJECT_TEMPLATES, templatesForLanguage, type ProjectTemplate } from "@/lib/runtimes/templates";

export interface NewFileRequest {
    name: string;
    language: string;
    code: string;
    stdin?: string;
}

interface NewFileDialogProps {
    open: boolean;
    onClose: () => void;
    existingNames: string[];
    onCreateFile: (file: NewFileRequest) => void;
    onCreateProject: (template: ProjectTemplate) => void;
    /** Restricts the choice (game scripts allow only C# and C++). */
    allowedLanguages?: readonly string[];
}

const C = {
    title: { TR: "Yeni dosya", EN: "New file" },
    description: { TR: "Bir dil veya hazır şablon seçin. Çift tıklama doğrudan oluşturur.", EN: "Pick a language or a ready-made template. Double-click creates it right away." },
    search: { TR: "Dil veya şablon ara…", EN: "Search languages or templates…" },
    all: { TR: "Tümü", EN: "All" },
    popular: { TR: "Popüler", EN: "Popular" },
    projects: { TR: "Proje şablonları", EN: "Project templates" },
    languages: { TR: "Diller", EN: "Languages" },
    noResults: { TR: "Aramanızla eşleşen dil yok.", EN: "No language matches your search." },
    fileName: { TR: "Dosya adı", EN: "File name" },
    template: { TR: "Şablon", EN: "Template" },
    hello: { TR: "Merhaba Dünya", EN: "Hello World" },
    helloDescription: { TR: "En kısa çalışan örnek.", EN: "The shortest working example." },
    empty: { TR: "Boş dosya", EN: "Empty file" },
    emptyDescription: { TR: "Hiçbir kod olmadan başlayın.", EN: "Start without any code." },
    create: { TR: "Oluştur", EN: "Create" },
    createProject: { TR: "{count} dosya oluştur", EN: "Create {count} files" },
    pick: { TR: "Soldan bir dil seçin.", EN: "Pick a language on the left." },
    nameTaken: { TR: "Bu adla açık bir dosya var; {name} olarak oluşturulacak.", EN: "A file with this name is open; it will be created as {name}." },
    inputNote: { TR: "Bu şablon Girdi sekmesine örnek girdi yazar.", EN: "This template fills the Input tab with sample input." },
} satisfies Record<string, Copy>;

const ENGINE_ICONS: Record<LanguageEngine, typeof Cpu> = { browser: Cpu, server: Server, preview: Eye, none: FileCode2 };
const ENGINE_BADGES: Record<LanguageEngine, string> = {
    browser: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    server: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    preview: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    none: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

export function EngineBadge({ engine, compact = false }: { engine: LanguageEngine; compact?: boolean }) {
    const { tx } = useI18n();
    const Icon = ENGINE_ICONS[engine];
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ENGINE_BADGES[engine]}`} title={tx(ENGINE_LABELS[engine].description)}>
            <Icon className="h-3 w-3" aria-hidden />
            {!compact && tx(ENGINE_LABELS[engine].short)}
        </span>
    );
}

type Filter = "all" | "popular" | LanguageCategory;

function useLanguageSearch(query: string, filter: Filter, allowed?: readonly string[]) {
    return useMemo(() => {
        const pool = LANGUAGES.filter((language) => !allowed || allowed.includes(language.id));
        const filtered = pool.filter((language) => filter === "all" || (filter === "popular" ? language.popular : language.category === filter));
        if (!query.trim()) {
            return [...filtered].sort((a, b) => Number(Boolean(b.popular)) - Number(Boolean(a.popular)));
        }
        return filtered
            .map((language) => ({ language, score: Math.max(matchScore(query, language.name), matchScore(query, [language.id, ...(language.aliases ?? []), ...language.extensions].join(" ")) * 0.8) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((entry) => entry.language);
    }, [query, filter, allowed]);
}

export default function NewFileDialog({ open, onClose, existingNames, onCreateFile, onCreateProject, allowedLanguages }: NewFileDialogProps) {
    const { tx } = useI18n();
    const searchRef = useRef<HTMLInputElement>(null);
    const detailsRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [templateId, setTemplateId] = useState("hello");
    const [nameDraft, setNameDraft] = useState<{ language: string; value: string } | null>(null);
    const languages = useLanguageSearch(query, filter, allowedLanguages);
    const projects = allowedLanguages ? [] : PROJECT_TEMPLATES.filter((project) => !query.trim() || matchScore(query, `${tx(project.title)} ${project.files.map((file) => file.name).join(" ")}`) > 0);
    const selected = selectedId ? getLanguage(selectedId) : undefined;
    const templates = selected ? templatesForLanguage(selected.id) : [];

    const defaultName = selected ? uniqueFileName(selected.defaultFileName, existingNames) : "";
    const name = nameDraft && nameDraft.language === selected?.id ? nameDraft.value : defaultName;
    const requestedName = selected ? ensureFileExtension(name.trim() || selected.defaultFileName, selected.id) : "";
    const finalName = selected ? uniqueFileName(requestedName, existingNames) : "";
    const chosen = templates.find((template) => template.id === templateId);
    const code = !selected ? "" : templateId === "empty" ? "" : chosen?.code ?? selected.template;

    const reset = () => {
        setQuery("");
        setFilter("all");
        setSelectedId(null);
        setTemplateId("hello");
        setNameDraft(null);
    };
    const close = () => {
        reset();
        onClose();
    };
    const select = (language: LanguageInfo) => {
        setSelectedId(language.id);
        setTemplateId("hello");
        setNameDraft(null);
        window.requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    };
    const create = (language: LanguageInfo | undefined = selected, useDefaults = false) => {
        if (!language) return;
        const fileName = useDefaults ? uniqueFileName(language.defaultFileName, existingNames) : finalName;
        const fileCode = useDefaults ? language.template : code;
        onCreateFile({ name: fileName, language: language.id, code: fileCode, stdin: useDefaults ? undefined : chosen?.stdin });
        reset();
    };

    const filters: Array<{ id: Filter; label: string }> = [
        { id: "all", label: tx(C.all) },
        { id: "popular", label: tx(C.popular) },
        ...LANGUAGE_CATEGORIES.filter((category) => LANGUAGES.some((language) => language.category === category.id && (!allowedLanguages || allowedLanguages.includes(language.id)))).map((category) => ({ id: category.id as Filter, label: tx(category.label) })),
    ];

    return (
        <Modal open={open} onClose={close} size="xl" icon={<FilePlus2 className="h-5 w-5" aria-hidden />} title={tx(C.title)} description={tx(C.description)} initialFocus={searchRef} bodyClassName="p-0">
            <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="min-w-0 space-y-4 p-4 lg:max-h-[68vh] lg:overflow-y-auto">
                    <label className="relative block">
                        <span className="sr-only">{tx(C.search)}</span>
                        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                        <input
                            ref={searchRef}
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && languages[0]) select(languages[0]);
                            }}
                            placeholder={tx(C.search)}
                            className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pe-4 ps-10 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900"
                        />
                    </label>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={tx({ TR: "Kategoriler", EN: "Categories" })}>
                        {filters.map((item) => (
                            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter === item.id ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"}`}>
                                {item.label}
                            </button>
                        ))}
                    </div>

                    {projects.length > 0 && filter === "all" && (
                        <section aria-labelledby="new-file-projects">
                            <h3 id="new-file-projects" className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"><Boxes className="h-4 w-4" aria-hidden />{tx(C.projects)}</h3>
                            <div className="grid gap-2 sm:grid-cols-3">
                                {projects.map((project) => (
                                    <button key={project.id} type="button" onClick={() => { onCreateProject(project); reset(); }} className="group flex flex-col gap-2 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/5 p-3 text-start transition hover:-translate-y-0.5 hover:border-indigo-500/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                        <span className="flex items-center gap-2">
                                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">{project.kind === "web" ? <Globe className="h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}</span>
                                            <span className="text-sm font-semibold">{tx(project.title)}</span>
                                        </span>
                                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{tx(project.description)}</span>
                                        <span className="flex flex-wrap gap-1">
                                            {project.files.map((file) => (
                                                <span key={file.name} className="inline-flex items-center gap-1 rounded-md bg-white/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-white/5 dark:text-zinc-300"><LanguageIcon language={file.language} size={10} />{file.name}</span>
                                            ))}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    <section aria-labelledby="new-file-languages">
                        <h3 id="new-file-languages" className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"><Languages className="h-4 w-4" aria-hidden />{tx(C.languages)} <span className="font-normal normal-case tracking-normal">({languages.length})</span></h3>
                        {languages.length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-white/10">{tx(C.noResults)}</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                                {languages.map((language) => (
                                    <button
                                        key={language.id}
                                        type="button"
                                        aria-pressed={selectedId === language.id}
                                        onClick={() => select(language)}
                                        onDoubleClick={() => create(language, true)}
                                        className={`flex items-center gap-2.5 rounded-2xl border p-2.5 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${selectedId === language.id ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-200 hover:border-indigo-500/40 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5"}`}
                                    >
                                        <LanguageIcon language={language.id} size={28} />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-semibold">{language.name}</span>
                                            <EngineBadge engine={language.engine} />
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                <div ref={detailsRef} className="border-t border-zinc-100 bg-zinc-50/60 p-4 dark:border-white/5 dark:bg-white/[0.02] lg:max-h-[68vh] lg:overflow-y-auto lg:border-s lg:border-t-0">
                    {!selected ? (
                        <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
                            <FileCode2 className="h-8 w-8" aria-hidden />
                            {tx(C.pick)}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <LanguageIcon language={selected.id} size={36} />
                                <div className="min-w-0">
                                    <p className="font-bold">{selected.name}</p>
                                    <EngineBadge engine={selected.engine} />
                                </div>
                            </div>
                            <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(ENGINE_LABELS[selected.engine].description)}</p>
                            <label className="block">
                                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{tx(C.fileName)}</span>
                                <input
                                    value={name}
                                    maxLength={120}
                                    onChange={(event) => setNameDraft({ language: selected.id, value: event.target.value })}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") create();
                                    }}
                                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900"
                                />
                                {finalName !== requestedName && <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-400">{tx(C.nameTaken, { name: finalName })}</span>}
                            </label>
                            <fieldset>
                                <legend className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{tx(C.template)}</legend>
                                <div className="mt-1 space-y-1.5">
                                    {[
                                        { id: "hello", title: tx(C.hello), description: tx(C.helloDescription) },
                                        ...templates.map((template) => ({ id: template.id, title: tx(template.title), description: tx(template.description) })),
                                        { id: "empty", title: tx(C.empty), description: tx(C.emptyDescription) },
                                    ].map((option) => (
                                        <label key={option.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-sm transition ${templateId === option.id ? "border-indigo-500 bg-indigo-500/5" : "border-zinc-200 hover:bg-white dark:border-white/10 dark:hover:bg-white/5"}`}>
                                            <input type="radio" name="new-file-template" value={option.id} checked={templateId === option.id} onChange={() => setTemplateId(option.id)} className="mt-1 accent-indigo-600" />
                                            <span>
                                                <span className="block font-medium">{option.title}</span>
                                                <span className="text-xs text-zinc-500 dark:text-zinc-400">{option.description}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                            {code && (
                                <pre className="max-h-48 overflow-auto rounded-xl border border-zinc-200 bg-white p-3 font-mono text-[11.5px] leading-5 text-zinc-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">{code.split("\n").slice(0, 18).join("\n")}{code.split("\n").length > 18 ? "\n…" : ""}</pre>
                            )}
                            {chosen?.stdin && <p className="text-[11px] text-indigo-600 dark:text-indigo-300">{tx(C.inputNote)}</p>}
                            <button type="button" onClick={() => create()} className={`${buttonClasses.primary} w-full`}>
                                <Check className="h-4 w-4" aria-hidden />
                                {tx(C.create)}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}

/** Changes the language mode of the open file (status bar / quick actions). */
export function LanguagePickerDialog({ open, onClose, current, onPick, allowedLanguages }: { open: boolean; onClose: () => void; current: string; onPick: (language: string) => void; allowedLanguages?: readonly string[] }) {
    const { tx } = useI18n();
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const languages = useLanguageSearch(query, "all", allowedLanguages);
    const close = () => {
        setQuery("");
        onClose();
    };
    return (
        <Modal open={open} onClose={close} size="sm" align="top" icon={<Languages className="h-5 w-5" aria-hidden />} title={tx({ TR: "Dil modunu seç", EN: "Select language mode" })} description={tx({ TR: "Sözdizimi vurgulamasını ve Çalıştır davranışını değiştirir; kod aynı kalır.", EN: "Changes syntax highlighting and what Run does; the code stays the same." })} initialFocus={inputRef}>
            <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && languages[0]) {
                        onPick(languages[0].id);
                        close();
                    }
                }}
                placeholder={tx({ TR: "Dil ara…", EN: "Search languages…" })}
                className="mb-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900"
            />
            <div className="max-h-[50vh] space-y-0.5 overflow-y-auto">
                {languages.map((language) => (
                    <button key={language.id} type="button" onClick={() => { onPick(language.id); close(); }} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-sm transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-white/5 ${language.id === current ? "bg-indigo-500/10" : ""}`}>
                        <LanguageIcon language={language.id} size={18} />
                        <span className="min-w-0 flex-1 truncate font-medium">{language.name}</span>
                        <span className="font-mono text-[10px] text-zinc-400">.{language.extensions[0] ?? language.fileNames?.[0]}</span>
                        <EngineBadge engine={language.engine} compact />
                        {language.id === current && <Check className="h-4 w-4 text-indigo-500" aria-hidden />}
                    </button>
                ))}
            </div>
        </Modal>
    );
}
