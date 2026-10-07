"use client";

import { motion } from "framer-motion";
import { LoaderCircle, Upload, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { MediaApiError } from "@/components/Editor/media-api";
import { mediaTagSuggestions } from "@/components/Editor/media-publish";
import { useI18n } from "@/lib/i18n";
import { languageDisplayName } from "@/lib/runtimes/languages";
import { M } from "./copy";
import { errorMessage, useDialogFocus } from "./helpers";
import PostFieldsForm from "./PostFieldsForm";
import type { PostFields, PublishableProject } from "./types";

const panel = "border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const field = "mt-2 w-full rounded-2xl border border-zinc-200 bg-transparent px-4 py-3 outline-none focus:border-blue-500 dark:border-zinc-700";

/** Publishes a project saved to the cloud from the editor ("publish" action). */
export default function PublishProjectDialog({ consent, onClose, onPublished, mutate }: { consent: boolean; onClose: () => void; onPublished: () => void; mutate: (body: Record<string, unknown>) => Promise<unknown> }) {
    const { tx, language } = useI18n();
    const [projects, setProjects] = useState<PublishableProject[]>([]);
    const [projectsState, setProjectsState] = useState<"loading" | "ready" | "error">("loading");
    const [projectId, setProjectId] = useState("");
    const [fields, setFields] = useState<PostFields>({ title: "", description: "", tags: [], license: "all-rights-reserved", showAuthor: true });
    const [contribute, setContribute] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<{ message: string; findings: string[] } | null>(null);
    const titleId = useId();
    const ref = useDialogFocus(true, onClose);
    const project = projects.find((item) => item.id === projectId);

    // The project list comes from the server: a client Firestore query needs a
    // composite index and a live Firebase session, and was silently empty without them.
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/media?scope=my-projects", { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                const data = await response.json().catch(() => ({})) as { projects?: PublishableProject[] };
                if (!response.ok) throw new Error("projects");
                setProjects(data.projects || []);
                setProjectsState("ready");
            })
            .catch((projectError: unknown) => {
                if (controller.signal.aborted) return;
                console.warn("Publishable projects could not be loaded:", projectError);
                setProjectsState("error");
            });
        return () => controller.abort();
    }, []);

    const publish = async () => {
        if (!projectId || !fields.title.trim()) return;
        setBusy(true);
        setProblem(null);
        try {
            await mutate({ action: "publish", projectId, ...fields, contribute: consent && contribute });
            onPublished();
        } catch (publishError) {
            const findings = publishError instanceof MediaApiError ? publishError.findings : [];
            setProblem({ message: errorMessage(publishError, M.publishFailed, tx, language), findings });
        } finally {
            setBusy(false);
        }
    };

    const loading = projectsState === "loading";
    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
            <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} initial={{ opacity: 0, scale: .96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }} onMouseDown={(event) => event.stopPropagation()} className={`${panel} max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl p-5 sm:p-6`}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 id={titleId} className="text-2xl font-black">{tx({ TR: "Projeyi Media’da yayımla", EN: "Publish a project on Media" })}</h2>
                        <p className="mt-1 text-sm text-zinc-500">{tx({ TR: "Kaynak dosyalarının anlık bir kopyası paylaşılır.", EN: "A snapshot of the source files is shared." })}</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label={tx(M.close)}><X className="h-5 w-5" aria-hidden /></button>
                </div>
                <div className="mt-6 space-y-4">
                    <label className="block text-sm font-semibold">
                        {tx({ TR: "Proje", EN: "Project" })}
                        <select data-autofocus value={projectId} disabled={loading} onChange={(event) => {
                            const chosen = projects.find((item) => item.id === event.target.value);
                            setProjectId(event.target.value);
                            setFields((current) => ({ ...current, title: current.title || chosen?.name || "" }));
                        }} className={`${field} disabled:opacity-60`}>
                            <option value="">{loading ? tx({ TR: "Projeler yükleniyor…", EN: "Loading projects…" }) : projects.length ? tx({ TR: "Proje seçin", EN: "Choose a project" }) : tx({ TR: "Kayıtlı kod projeniz yok", EN: "You have no saved code projects" })}</option>
                            {projects.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {tx(item.fileCount > 1 ? M.projectOptionMany : M.projectOption, { name: item.name, language: languageDisplayName(item.lang), count: item.fileCount })}
                                </option>
                            ))}
                        </select>
                        {projectsState === "error" && <span role="alert" className="mt-2 block text-xs font-normal text-red-600 dark:text-red-400">{tx(M.projectsFailed)}</span>}
                        {projectsState === "ready" && projects.length === 0 && <span className="mt-2 block text-xs font-normal leading-5 text-zinc-500">{tx({ TR: "Önce kod editöründe bir projeyi kaydedin; kaydedilen projeler burada listelenir.", EN: "Save a project in the code editor first; saved projects are listed here." })}</span>}
                    </label>
                    <p className="rounded-2xl bg-blue-50 p-3 text-xs leading-5 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                        {tx(M.editorHint)}{" "}
                        <Link href="/editor" className="font-semibold underline">{tx(M.openEditor)}</Link>
                    </p>
                    <PostFieldsForm value={fields} onChange={setFields} tagSuggestions={project ? mediaTagSuggestions([project.lang]) : []} />
                    {consent && (
                        <label className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                            <input type="checkbox" checked={contribute} onChange={(event) => setContribute(event.target.checked)} className="mt-1 h-4 w-4" />
                            <span>
                                <strong className="block text-sm text-emerald-800 dark:text-emerald-200">{tx({ TR: "Bu projeyi güvenlik katkısına dahil et", EN: "Include this project in the security contribution" })}</strong>
                                <span className="text-xs leading-5 text-emerald-700 dark:text-emerald-300">{tx({ TR: "Otomatik eğitim yapılmaz; uygunluk ve amaç sınırı insan denetimiyle değerlendirilir.", EN: "There is no automatic training; eligibility and purpose limits are reviewed by people." })}</span>
                            </span>
                        </label>
                    )}
                    {problem && (
                        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                            <strong className="block">{problem.message}</strong>
                            {problem.findings.length > 0 && (
                                <>
                                    <ul className="mt-2 list-disc space-y-1 ps-5 text-xs leading-5">{problem.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>
                                    <p className="mt-2 text-xs opacity-80">{tx({ TR: "Yanlış bir eşleşme olduğunu düşünüyorsanız Geri Bildirim sayfasından inceleme isteyebilirsiniz.", EN: "If you think this is a false match, you can request a review from the Feedback page." })}</p>
                                </>
                            )}
                        </div>
                    )}
                    <button type="button" disabled={busy || !projectId || !fields.title.trim()} onClick={() => void publish()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                        {busy ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : <Upload className="h-5 w-5" aria-hidden />}
                        {tx({ TR: "Güvenlik kontrolüyle yayımla", EN: "Publish with a security check" })}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
