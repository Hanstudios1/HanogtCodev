"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Bot, Brain, ChevronDown, Cpu, FileCode2, Link2, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import type { AiThinking } from "@/lib/ai/conversations";
import type { ThinkingStep } from "@/lib/ai/thinking";
import { useI18n, type Copy } from "@/lib/i18n";
import { cx } from "./ui";

const C = {
    thinking: { TR: "Düşünüyor…", EN: "Thinking…" },
    thought: { TR: "{seconds} sn düşündü", EN: "Thought for {seconds} s" },
    thoughtBriefly: { TR: "Düşündü", EN: "Thought it through" },
    steps: { TR: "{count} adım", EN: "{count} steps" },
    core: { TR: "Çekirdek nasıl yanıtladı", EN: "How the Core answered" },
    coreIntent: { TR: "Anlaşılan konu: {intent} · güven %{confidence}", EN: "Understood as: {intent} · {confidence}% sure" },
    coreHint: { TR: "Bu yanıtı cihazında çalışan Hanogt AI Çekirdeği verdi; sorunu bir konuya eşleyip bilgi tabanından yanıtladı.", EN: "Hanogt AI Core answered on your device: it matched your question to a topic and answered from the knowledge base." },
    knowledge: { TR: "Hanogt bilgi tabanına bakıldı: {titles}", EN: "Looked in Hanogt's knowledge: {titles}" },
    link: { TR: "Bağlantı yapısal olarak kontrol edildi", EN: "Checked the link's structure" },
    error: { TR: "Hata mesajı tanındı ve açıklandı", EN: "Recognized and explained the error message" },
    code: { TR: "Kod güvenlik danışmanından geçirildi", EN: "Ran the code through the security advisor" },
    file: { TR: "Açık dosya okundu: {name}", EN: "Read the open file: {name}" },
    agentTools: { TR: "Ajan araçları hazır (her işlem için onay istenir)", EN: "Agent tools ready (each action asks first)" },
    agentUnsupported: { TR: "Model araçları desteklemedi; işlemleri Çekirdek önerecek", EN: "The model doesn't support tools; the Core will suggest actions" },
    show: { TR: "Düşünceyi göster", EN: "Show thinking" },
    hide: { TR: "Düşünceyi gizle", EN: "Hide thinking" },
} satisfies Record<string, Copy>;

function StepLine({ step }: { step: ThinkingStep }) {
    const { tx } = useI18n();
    const icon = "mt-0.5 h-3.5 w-3.5 shrink-0";
    switch (step.kind) {
        case "knowledge":
            return <li className="flex gap-2"><BookOpen className={cx(icon, "text-sky-600 dark:text-sky-400")} aria-hidden /><span>{tx(C.knowledge, { titles: step.titles.join(" · ") })}</span></li>;
        case "analyzer":
            return (
                <li className="flex gap-2">
                    {step.id === "link" ? <Link2 className={cx(icon, "text-emerald-600 dark:text-emerald-400")} aria-hidden /> : step.id === "error" ? <TriangleAlert className={cx(icon, "text-amber-600 dark:text-amber-400")} aria-hidden /> : <ShieldCheck className={cx(icon, "text-emerald-600 dark:text-emerald-400")} aria-hidden />}
                    <span>{tx(step.id === "link" ? C.link : step.id === "error" ? C.error : C.code)}</span>
                </li>
            );
        case "file":
            return <li className="flex gap-2"><FileCode2 className={cx(icon, "text-zinc-500")} aria-hidden /><span>{tx(C.file, { name: step.name })}</span></li>;
        case "agent":
            return <li className="flex gap-2"><Bot className={cx(icon, "text-zinc-500")} aria-hidden /><span>{tx(step.state === "tools" ? C.agentTools : C.agentUnsupported)}</span></li>;
    }
}

/**
 * What Hanogt AI thought before answering, Gemini-style: "Thinking…" while
 * the model reasons (open, streaming), then a collapsed "Thought for 6 s"
 * the reader can open. Shows the steps the server took (knowledge looked up,
 * analyzers, the open file, agent tools) and, for the offline Core, the
 * topic it recognized and how sure it was. Thinking is never sent back to
 * the model.
 */
export default function ThinkingPanel({ thinking, live, variant }: {
    thinking?: AiThinking;
    /** While the answer streams: the thinking and steps so far, and whether the answer text has started. */
    live?: { text: string; steps: ThinkingStep[]; answering: boolean; seconds: number | null };
    variant: "panel" | "page";
}) {
    const { tx, locale } = useI18n();
    const id = useId();
    // Open while the model is thinking; once the answer starts it folds away unless the reader chose otherwise.
    const [choice, setChoice] = useState<boolean | null>(null);
    const text = live ? live.text : thinking?.text ?? "";
    const steps = live ? live.steps : thinking?.steps ?? [];
    const core = live ? undefined : thinking?.core;
    const seconds = live ? live.seconds : thinking?.seconds ?? null;
    const thinkingNow = Boolean(live && !live.answering);
    if (!text.trim() && !steps.length && !core && !thinkingNow) return null;
    const open = choice ?? thinkingNow;

    const label = thinkingNow
        ? tx(C.thinking)
        : core && !text
            ? tx(C.core)
            : text.trim()
                ? (seconds ? tx(C.thought, { seconds: seconds.toLocaleString(locale) }) : tx(C.thoughtBriefly))
                : tx(C.steps, { count: steps.length });

    return (
        <div className={cx("rounded-2xl border border-zinc-200/80 bg-zinc-50/70 dark:border-white/[0.07] dark:bg-white/[0.03]", variant === "page" ? "text-[13px]" : "text-[12.5px]")} data-ai-thinking={thinkingNow ? "live" : "done"}>
            <button
                type="button"
                onClick={() => setChoice(!open)}
                aria-expanded={open}
                aria-controls={id}
                title={tx(open ? C.hide : C.show)}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-start font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 dark:text-zinc-300 dark:hover:text-white"
            >
                {thinkingNow ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-600 dark:text-sky-400" aria-hidden /> : core && !text ? <Cpu className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden /> : <Brain className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />}
                <span className="min-w-0 flex-1 truncate" role={thinkingNow ? "status" : undefined}>{label}</span>
                {!thinkingNow && text.trim() && steps.length ? <span className="text-[11px] font-medium text-zinc-400">{tx(C.steps, { count: steps.length })}</span> : null}
                <ChevronDown className={cx("h-4 w-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            <AnimatePresence initial={false}>
                {open ? (
                    <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                        <div className="space-y-2 border-t border-zinc-200/70 px-3 pb-3 pt-2 dark:border-white/[0.06]">
                            {steps.length ? <ul className="space-y-1 text-zinc-600 dark:text-zinc-300">{steps.map((step, index) => <StepLine key={index} step={step} />)}</ul> : null}
                            {core ? (
                                <div className="space-y-1 text-zinc-600 dark:text-zinc-300">
                                    <p className="font-semibold">{tx(C.coreIntent, { intent: core.intent.replace(/_/g, " "), confidence: Math.round(core.confidence * 100) })}</p>
                                    <p className="text-zinc-500 dark:text-zinc-400">{tx(C.coreHint)}</p>
                                </div>
                            ) : null}
                            {text.trim() ? (
                                <div className="scrollbar-thin max-h-72 overflow-y-auto whitespace-pre-wrap break-words border-s-2 border-sky-500/30 ps-3 leading-relaxed text-zinc-500 dark:text-zinc-400" dir="auto">
                                    {text.trim()}
                                    {thinkingNow ? <span className="ms-0.5 inline-block h-3.5 w-1 animate-pulse rounded-sm bg-sky-500 align-text-bottom" aria-hidden /> : null}
                                </div>
                            ) : null}
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
