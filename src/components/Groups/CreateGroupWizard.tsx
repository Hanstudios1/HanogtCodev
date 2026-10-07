"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, FileText, FolderGit2, Hash, Lock, Pin, Plus, ScrollText, Sparkles } from "lucide-react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { useI18n, type Copy } from "@/lib/i18n";
import {
    GROUP_COLORS,
    GROUP_COLOR_IDS,
    GROUP_EMOJIS,
    GROUP_LIMITS,
    GROUP_TEMPLATES,
    getGroupTemplate,
    isGroupId,
    seedLanguageFor,
    templateRules,
    toMillis,
    type GroupColor,
    type GroupTemplateId,
} from "@/lib/groups";
import SocialDisclaimer from "@/components/Social/Disclaimer";
import { GROUP_OWNER_NOTE } from "@/lib/social/disclaimer";
import { groupsApi, useGroupErrorText } from "./api";
import { GroupTile, Modal, ModalHeader, Spinner, cx } from "./ui";

const C = {
    title: { TR: "Yeni grup oluştur", EN: "Create a new group" },
    subtitle: { TR: "Birkaç adımda hazır bir çalışma alanı kur.", EN: "Set up a ready-to-use workspace in a few steps." },
    stepTemplate: { TR: "Şablon", EN: "Template" },
    stepDetails: { TR: "Ayrıntılar", EN: "Details" },
    stepReview: { TR: "Önizleme", EN: "Review" },
    stepOf: { TR: "Adım {current}/{total}", EN: "Step {current} of {total}" },
    templateHint: { TR: "Şablon; başlangıç dosyalarını, grubun Kurallar bölümünü, konuları ve sabitlenmiş karşılama mesajını hazırlar. Hepsini sonradan değiştirebilirsin.", EN: "A template prepares the starter files, the group's Rules section, topics and a pinned welcome message. You can change all of it later." },
    moreFiles: { TR: "+{count} dosya", EN: "+{count} files" },
    name: { TR: "Grup adı", EN: "Group name" },
    namePlaceholder: { TR: "Örn. Algoritma Kulübü", EN: "e.g. Algorithm Club" },
    description: { TR: "Açıklama", EN: "Description" },
    descriptionPlaceholder: { TR: "Bu grup ne için? Kimler katılmalı?", EN: "What is this group for? Who should join?" },
    optional: { TR: "(isteğe bağlı)", EN: "(optional)" },
    icon: { TR: "Simge", EN: "Icon" },
    color: { TR: "Vurgu rengi", EN: "Accent color" },
    visibilityTitle: { TR: "Gizli grup", EN: "Private group" },
    visibilityText: { TR: "Grup herkese açık listelenmez. Yalnızca davet ettiğin arkadaşların veya davet bağlantısı paylaştığın kişiler katılabilir; dosyalar ve sohbet yalnızca üyelere görünür.", EN: "The group isn't listed publicly. Only friends you invite or people you share an invite link with can join; files and chat are visible to members only." },
    project: { TR: "Projemden dosya aktar", EN: "Import files from my project" },
    noProject: { TR: "Aktarma — şablon dosyalarını kullan", EN: "Don't import — use the template files" },
    projectHint: { TR: "Seçersen projenin dosyaları aktarılır; şablon yalnızca README ve görev listesi gibi belgeleri ekler. Kurallar yine grubun Kurallar bölümünde olur.", EN: "If you pick one, its files are imported and the template only adds documents such as the README and task list. The rules still go into the group's Rules section." },
    loadingProjects: { TR: "Projeler yükleniyor…", EN: "Loading projects…" },
    preview: { TR: "Önizleme", EN: "Preview" },
    previewName: { TR: "Grup adın", EN: "Your group name" },
    willCreate: { TR: "Oluşturulacaklar", EN: "What will be created" },
    files: { TR: "Başlangıç dosyaları", EN: "Starter files" },
    projectFiles: { TR: "\"{name}\" projesinin dosyaları", EN: "Files from \"{name}\"" },
    topics: { TR: "Sohbet konuları", EN: "Chat topics" },
    rules: { TR: "Kurallar bölümü", EN: "Rules section" },
    rulesScreening: { TR: "Üyeler sohbet etmeden önce bu kuralları kabul eder.", EN: "Members accept these rules before they chat." },
    noRules: { TR: "Boş grup kuralsız başlar; kuralları istediğin zaman ekleyebilirsin.", EN: "A blank group starts without rules; you can add them any time." },
    rulesLater: { TR: "Kuralları Grup ayarları → Kurallar ve konular bölümünden değiştirebilirsin.", EN: "You can change the rules in Group settings → Rules & topics." },
    welcome: { TR: "Sabitlenmiş karşılama mesajı", EN: "Pinned welcome message" },
    contentLanguage: { TR: "Başlangıç içeriği Türkçe hazırlanır.", EN: "Starter content is written in English." },
    back: { TR: "Geri", EN: "Back" },
    next: { TR: "Devam", EN: "Continue" },
    create: { TR: "Grubu oluştur", EN: "Create group" },
    creating: { TR: "Oluşturuluyor…", EN: "Creating…" },
    nameShort: { TR: "En az 2 karakter girin.", EN: "Enter at least 2 characters." },
    createFailed: { TR: "Grup oluşturulamadı.", EN: "The group couldn't be created." },
    selected: { TR: "Seçili", EN: "Selected" },
    chars: { TR: "{count}/{max}", EN: "{count}/{max}" },
} satisfies Record<string, Copy>;

type ProjectOption = { id: string; name: string; updatedAt: number };

export default function CreateGroupWizard({ open, onClose, onCreated, email }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; email: string }) {
    const { tx, language } = useI18n();
    const errorText = useGroupErrorText();
    const lang = seedLanguageFor(language);
    const [step, setStep] = useState(0);
    const [templateId, setTemplateId] = useState<GroupTemplateId>("blank");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [emoji, setEmoji] = useState<string | null>(null);
    const [color, setColor] = useState<GroupColor | null>(null);
    const [projectId, setProjectId] = useState("");
    const [projects, setProjects] = useState<ProjectOption[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const template = getGroupTemplate(templateId);
    // Until the user picks their own icon/color, the template's defaults are used.
    const activeEmoji = emoji ?? template.emoji;
    const activeColor = color ?? template.color;
    const trimmedName = name.trim();
    const nameValid = trimmedName.length >= GROUP_LIMITS.nameMin && trimmedName.length <= GROUP_LIMITS.nameMax;
    const selectedProject = projects?.find((project) => project.id === projectId) ?? null;

    useEffect(() => {
        if (!open || !email || projects) return;
        let active = true;
        getDocs(query(collection(db, "projects"), where("email", "==", email), limit(50)))
            .then((snapshot) => {
                if (!active) return;
                setProjects(snapshot.docs
                    .filter((item) => isGroupId(item.id))
                    .map((item) => {
                        const value = item.data();
                        return { id: item.id, name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 80) : item.id, updatedAt: toMillis(value.updatedAt ?? value.createdAt) };
                    })
                    .sort((a, b) => b.updatedAt - a.updatedAt));
            })
            .catch(() => { if (active) setProjects([]); });
        return () => { active = false; };
    }, [email, open, projects]);

    const steps: Copy[] = [C.stepTemplate, C.stepDetails, C.stepReview];
    // The Rules section the group starts with, in the language its content is written in.
    const starterRules = useMemo(() => templateRules(templateId, lang), [lang, templateId]);
    const fileNames = useMemo(() => {
        const names = [...template.files[lang]];
        if (!selectedProject) return names;
        return names.filter((file) => /\.(md|txt)$/i.test(file) || file === "LICENSE");
    }, [lang, selectedProject, template]);

    const goNext = () => {
        if (step === 1 && !nameValid) {
            setError(tx(C.nameShort));
            return;
        }
        setError("");
        setStep((value) => Math.min(2, value + 1));
    };

    const create = async () => {
        if (!nameValid || busy) return;
        setBusy(true);
        setError("");
        try {
            const result = await groupsApi.action<{ success: true; id: string }>({
                action: "create",
                name: trimmedName,
                description: description.trim(),
                emoji: activeEmoji,
                color: activeColor,
                template: templateId,
                language,
                ...(projectId ? { projectId } : {}),
            });
            onCreated(result.id);
        } catch (createError) {
            setError(errorText(createError, C.createFailed));
            setBusy(false);
        }
    };

    const palette = GROUP_COLORS[activeColor];

    return (
        <Modal open={open} onClose={() => { if (!busy) onClose(); }} labelledBy="create-group-title" size="xl" dismissible={!busy}>
            <ModalHeader id="create-group-title" title={tx(C.title)} description={tx(C.subtitle)} onClose={() => { if (!busy) onClose(); }} icon={<GroupTile emoji={activeEmoji} color={activeColor} size="sm" />} />
            <ol className="flex items-center gap-2 border-b border-zinc-200 px-5 py-3 text-xs font-semibold dark:border-white/10 sm:px-6" aria-label={tx(C.stepOf, { current: step + 1, total: steps.length })}>
                {steps.map((label, index) => (
                    <li key={label.EN} className="flex min-w-0 items-center gap-2">
                        <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black transition", index < step ? "bg-emerald-500 text-white" : index === step ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400")} aria-current={index === step ? "step" : undefined}>
                            {index < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
                        </span>
                        <span className={cx("truncate", index === step ? "text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-zinc-400", index !== step && "hidden sm:inline")}>{tx(label)}</span>
                        {index < steps.length - 1 && <span className="h-px w-6 shrink-0 bg-zinc-200 dark:bg-white/10 sm:w-10" aria-hidden />}
                    </li>
                ))}
            </ol>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <AnimatePresence mode="wait" initial={false}>
                    {step === 0 && (
                        <motion.div key="template" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
                            <p className="mb-4 flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden />{tx(C.templateHint)}</p>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={tx(C.stepTemplate)}>
                                {GROUP_TEMPLATES.map((entry) => {
                                    const selected = entry.id === templateId;
                                    const entryPalette = GROUP_COLORS[entry.color];
                                    const files = entry.files[lang];
                                    return (
                                        <button
                                            key={entry.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            onClick={() => setTemplateId(entry.id)}
                                            onDoubleClick={() => { setTemplateId(entry.id); setStep(1); }}
                                            className={cx("relative flex h-full flex-col rounded-2xl border p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500", selected ? cx("border-transparent bg-white shadow-lg ring-2 dark:bg-zinc-800/80", entryPalette.ring) : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]")}
                                        >
                                            {selected && <span className="absolute end-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white"><Check className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">{tx(C.selected)}</span></span>}
                                            <GroupTile emoji={entry.emoji} color={entry.color} size="sm" />
                                            <span className="mt-3 block pe-6 font-bold">{tx(entry.name)}</span>
                                            <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(entry.description)}</span>
                                            <span className="mt-3 flex flex-wrap gap-1">
                                                {files.slice(0, 3).map((file) => <span key={file} className="rounded-md bg-zinc-200/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-white/10 dark:text-zinc-300">{file}</span>)}
                                                {files.length > 3 && <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">{tx(C.moreFiles, { count: files.length - 3 })}</span>}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {step === 1 && (
                        <motion.div key="details" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
                            <div className="space-y-5">
                                <div>
                                    <label htmlFor="group-name" className="flex items-center justify-between text-sm font-semibold"><span>{tx(C.name)}</span><span className={cx("text-xs tabular-nums", trimmedName.length > GROUP_LIMITS.nameMax ? "text-red-500" : "text-zinc-400")}>{tx(C.chars, { count: name.length, max: GROUP_LIMITS.nameMax })}</span></label>
                                    <input id="group-name" data-autofocus value={name} maxLength={GROUP_LIMITS.nameMax} onChange={(event) => { setName(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); goNext(); } }} placeholder={tx(C.namePlaceholder)} className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-950" autoComplete="off" />
                                </div>
                                <div>
                                    <label htmlFor="group-description" className="flex items-center justify-between text-sm font-semibold"><span>{tx(C.description)} <span className="font-normal text-zinc-400">{tx(C.optional)}</span></span><span className="text-xs tabular-nums text-zinc-400">{tx(C.chars, { count: description.length, max: GROUP_LIMITS.descriptionMax })}</span></label>
                                    <textarea id="group-description" value={description} maxLength={GROUP_LIMITS.descriptionMax} rows={3} onChange={(event) => setDescription(event.target.value)} placeholder={tx(C.descriptionPlaceholder)} className="mt-2 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-950" />
                                </div>
                                <fieldset>
                                    <legend className="text-sm font-semibold">{tx(C.icon)}</legend>
                                    <div className="mt-2 grid max-h-36 grid-cols-8 gap-1.5 overflow-y-auto rounded-2xl border border-zinc-200 p-2 dark:border-white/10 sm:grid-cols-10">
                                        {GROUP_EMOJIS.map((option) => (
                                            <button key={option} type="button" onClick={() => setEmoji(option)} aria-pressed={activeEmoji === option} aria-label={option} className={cx("flex aspect-square items-center justify-center rounded-xl text-xl transition hover:bg-zinc-100 dark:hover:bg-zinc-800", activeEmoji === option && "bg-indigo-500/15 ring-2 ring-indigo-500")}>{option}</button>
                                        ))}
                                    </div>
                                </fieldset>
                                <fieldset>
                                    <legend className="text-sm font-semibold">{tx(C.color)}</legend>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {GROUP_COLOR_IDS.map((option) => (
                                            <button key={option} type="button" onClick={() => setColor(option)} aria-pressed={activeColor === option} title={tx(GROUP_COLORS[option].name)} aria-label={tx(GROUP_COLORS[option].name)} className={cx("h-9 w-9 rounded-full bg-gradient-to-br transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900", GROUP_COLORS[option].gradient, activeColor === option && "ring-2 ring-zinc-900 ring-offset-2 dark:ring-white dark:ring-offset-zinc-900")} />
                                        ))}
                                    </div>
                                </fieldset>
                                <div>
                                    <label htmlFor="group-project" className="flex items-center gap-1.5 text-sm font-semibold"><FolderGit2 className="h-4 w-4 text-zinc-400" aria-hidden />{tx(C.project)} <span className="font-normal text-zinc-400">{tx(C.optional)}</span></label>
                                    <select id="group-project" value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={!projects} className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-indigo-500 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950">
                                        <option value="">{projects ? tx(C.noProject) : tx(C.loadingProjects)}</option>
                                        {projects?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                                    </select>
                                    <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.projectHint)}</p>
                                </div>
                            </div>
                            <aside className="space-y-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.preview)}</p>
                                <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950">
                                    <span className={cx("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", palette.gradient)} aria-hidden />
                                    <GroupTile emoji={activeEmoji} color={activeColor} size="lg" />
                                    <p className={cx("mt-4 break-words text-lg font-black", !trimmedName && "text-zinc-400")}>{trimmedName || tx(C.previewName)}</p>
                                    <p className="mt-1 line-clamp-3 break-words text-sm text-zinc-500 dark:text-zinc-400">{description.trim() || tx(template.description)}</p>
                                    <span className={cx("mt-4 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", palette.soft, palette.text)}>{template.emoji} {tx(template.name)}</span>
                                </div>
                                <div className="flex gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4">
                                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                                    <div>
                                        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{tx(C.visibilityTitle)}</p>
                                        <p className="mt-1 text-xs leading-5 text-emerald-900/80 dark:text-emerald-200/80">{tx(C.visibilityText)}</p>
                                    </div>
                                </div>
                            </aside>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div key="review" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
                            <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-950">
                                <span className={cx("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", palette.gradient)} aria-hidden />
                                <div className="flex items-center gap-3">
                                    <GroupTile emoji={activeEmoji} color={activeColor} size="md" />
                                    <div className="min-w-0">
                                        <p className="truncate text-lg font-black">{trimmedName}</p>
                                        <p className={cx("text-xs font-semibold", palette.text)}>{tx(template.name)}</p>
                                    </div>
                                </div>
                                {description.trim() && <p className="mt-4 whitespace-pre-line break-words text-sm text-zinc-600 dark:text-zinc-400">{description.trim()}</p>}
                                <p className="mt-4 flex items-start gap-2 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-white/5 dark:text-zinc-400"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{tx(C.visibilityText)}</p>
                            </div>
                            <div className="space-y-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.willCreate)}</p>
                                <section className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                                    <h3 className="flex items-center gap-2 text-sm font-bold"><FileText className="h-4 w-4 text-indigo-500" aria-hidden />{tx(C.files)}</h3>
                                    {selectedProject && <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"><FolderGit2 className="h-3.5 w-3.5" aria-hidden />{tx(C.projectFiles, { name: selectedProject.name })}</p>}
                                    <ul className="mt-2 flex flex-wrap gap-1.5">
                                        {fileNames.map((file) => <li key={file} className="rounded-lg bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-white/10 dark:text-zinc-200">{file}</li>)}
                                    </ul>
                                </section>
                                <section className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                                    <h3 className="flex items-center gap-2 text-sm font-bold"><Hash className="h-4 w-4 text-fuchsia-500" aria-hidden />{tx(C.topics)}</h3>
                                    <ul className="mt-2 flex flex-wrap gap-1.5">
                                        {template.topics[lang].map((topic) => <li key={topic} className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">#{topic}</li>)}
                                    </ul>
                                </section>
                                <section className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                                    <h3 className="flex items-center gap-2 text-sm font-bold"><ScrollText className="h-4 w-4 text-emerald-500" aria-hidden />{tx(C.rules)}</h3>
                                    {starterRules.rules.length ? (
                                        <>
                                            <ol className="mt-2 space-y-1">
                                                {starterRules.rules.map((rule, index) => (
                                                    <li key={rule.title} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-200"><span className="w-5 shrink-0 text-end font-bold tabular-nums text-zinc-400" aria-hidden>{index + 1}.</span><span className="min-w-0 break-words">{rule.title}</span></li>
                                                ))}
                                            </ol>
                                            {starterRules.screening && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.rulesScreening)}</p>}
                                        </>
                                    ) : <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.noRules)}</p>}
                                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.rulesLater)}</p>
                                </section>
                                <section className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                                    <h3 className="flex items-center gap-2 text-sm font-bold"><Pin className="h-4 w-4 text-amber-500" aria-hidden />{tx(C.welcome)}</h3>
                                    <p className="mt-2 rounded-xl bg-indigo-500/[0.06] p-3 text-sm leading-6 text-zinc-700 dark:text-zinc-200">{tx(template.welcome, { group: trimmedName })}</p>
                                </section>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">{tx(C.contentLanguage)}</p>
                                <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-5 text-zinc-700 dark:text-zinc-200">{tx(GROUP_OWNER_NOTE)}</p>
                                <SocialDisclaimer compact />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-zinc-200 px-5 py-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-h-5 text-sm font-medium text-red-600 dark:text-red-400" role="alert">{error}</div>
                <div className="flex gap-2">
                    {step > 0 && (
                        <button type="button" onClick={() => { setError(""); setStep((value) => value - 1); }} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:flex-none">
                            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{tx(C.back)}
                        </button>
                    )}
                    {step < 2 ? (
                        <button type="button" onClick={goNext} disabled={step === 1 && !nameValid} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50 sm:flex-none">
                            {tx(C.next)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
                        </button>
                    ) : (
                        <button type="button" onClick={() => void create()} disabled={busy || !nameValid} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:brightness-110 disabled:opacity-50 sm:flex-none">
                            {busy ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" aria-hidden />}{busy ? tx(C.creating) : tx(C.create)}
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
