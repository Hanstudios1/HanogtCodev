"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Bot, Brain, Check, ChevronDown, Cpu, FileCode2, Link2, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { AiThinking } from "@/lib/ai/conversations";
import type { ThinkingStep } from "@/lib/ai/thinking";
import { useI18n, type Copy } from "@/lib/i18n";
import { cx } from "./ui";

const C = {
    thinking: { TR: "Düşünüyor…", EN: "Thinking…" },
    thought: { TR: "{seconds} sn düşündü", EN: "Thought for {seconds} s" },
    thoughtBriefly: { TR: "Düşündü", EN: "Thought it through" },
    steps: { TR: "{count} adım", EN: "{count} steps" },
    workSteps: { TR: "Çalışma adımları", EN: "Work steps" },
    thoughts: { TR: "Düşünce", EN: "Thinking" },
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

/** One line of the work-step timeline: a small marked dot, the line to the next step, the text. */
function Step({ icon, last, children }: { icon: ReactNode; last: boolean; children: ReactNode }) {
    return (
        <li className="relative flex gap-2.5 pb-2.5 last:pb-0">
            {!last ? <span className="absolute bottom-0 start-[8.5px] top-5 w-px bg-ai-line" aria-hidden /> : null}
            <span className="relative mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-ai-surface ring-1 ring-ai-line" aria-hidden>{icon}</span>
            <div className="min-w-0 flex-1 pt-px">{children}</div>
        </li>
    );
}

function stepIcon(step: ThinkingStep) {
    const icon = "h-2.5 w-2.5";
    switch (step.kind) {
        case "knowledge":
            return <BookOpen className={cx(icon, "text-sky-600 dark:text-sky-400")} />;
        case "analyzer":
            return step.id === "link" ? <Link2 className={cx(icon, "text-brand-green")} /> : step.id === "error" ? <TriangleAlert className={cx(icon, "text-amber-600 dark:text-amber-400")} /> : <ShieldCheck className={cx(icon, "text-brand-green")} />;
        case "file":
            return <FileCode2 className={cx(icon, "text-ai-muted")} />;
        case "agent":
            return <Bot className={cx(icon, "text-ai-muted")} />;
    }
}

function stepText(step: ThinkingStep, tx: ReturnType<typeof useI18n>["tx"]) {
    switch (step.kind) {
        case "knowledge":
            return tx(C.knowledge, { titles: step.titles.join(" · ") });
        case "analyzer":
            return tx(step.id === "link" ? C.link : step.id === "error" ? C.error : C.code);
        case "file":
            return tx(C.file, { name: step.name });
        case "agent":
            return tx(step.state === "tools" ? C.agentTools : C.agentUnsupported);
    }
}

/**
 * What Hanogt AI did before answering: "Thinking…" while the model reasons
 * (open, streaming), then a collapsed "Thought for 6 s" (or "Work steps")
 * the reader can open. Inside, a timeline of the steps the server took
 * (knowledge looked up, analyzers, the open file, agent tools), the model's
 * thinking and, for the offline Core, the topic it recognized and how sure it
 * was. Thinking is never sent back to the model.
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
                : tx(C.workSteps);
    // The timeline: the steps, then the thinking (the Core's topic stands on its own).
    const items = steps.length + (text.trim() ? 1 : 0);

    return (
        <div className={cx("rounded-xl border border-ai-line bg-ai-surface/70", variant === "page" ? "text-[13px]" : "text-[12.5px]")} data-ai-thinking={thinkingNow ? "live" : "done"}>
            <button
                type="button"
                onClick={() => setChoice(!open)}
                aria-expanded={open}
                aria-controls={id}
                title={tx(open ? C.hide : C.show)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start font-semibold text-ai-ink/80 transition hover:text-ai-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30"
            >
                {thinkingNow
                    ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ai-muted motion-reduce:animate-none" aria-hidden />
                    : core && !text
                        ? <Cpu className="h-3.5 w-3.5 shrink-0 text-ai-muted" aria-hidden />
                        : <Check className="h-3.5 w-3.5 shrink-0 text-brand-green" aria-hidden />}
                <span className={cx("min-w-0 flex-1 truncate", thinkingNow && "text-shimmer")} role={thinkingNow ? "status" : undefined}>{label}</span>
                {steps.length ? <span className="rounded-full bg-ai-ink/[0.06] px-1.5 py-px text-[11px] font-semibold tabular-nums text-ai-muted" title={tx(C.steps, { count: steps.length })}>{tx(C.steps, { count: steps.length })}</span> : null}
                <ChevronDown className={cx("h-4 w-4 shrink-0 text-ai-muted transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            <AnimatePresence initial={false}>
                {open ? (
                    <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                        <div className="space-y-2.5 border-t border-ai-line px-3 pb-3 pt-2.5">
                            {core ? (
                                <div className="space-y-1 text-ai-ink/75">
                                    <p className="font-semibold">{tx(C.coreIntent, { intent: core.intent.replace(/_/g, " "), confidence: Math.round(core.confidence * 100) })}</p>
                                    <p className="text-ai-muted">{tx(C.coreHint)}</p>
                                </div>
                            ) : null}
                            {items ? (
                                <ol className="text-ai-ink/80" aria-label={tx(C.workSteps)}>
                                    {steps.map((step, index) => (
                                        <Step key={index} icon={stepIcon(step)} last={index === items - 1}>{stepText(step, tx)}</Step>
                                    ))}
                                    {text.trim() ? (
                                        <Step icon={<Brain className="h-2.5 w-2.5 text-ai-muted" />} last>
                                            <p className="font-semibold text-ai-ink/80">{tx(C.thoughts)}</p>
                                            <div className="scrollbar-thin mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed text-ai-muted" dir="auto">
                                                {text.trim()}
                                                {thinkingNow ? <span className="ms-0.5 inline-block h-3.5 w-1 animate-pulse rounded-sm bg-ai-muted align-text-bottom motion-reduce:animate-none" aria-hidden /> : null}
                                            </div>
                                        </Step>
                                    ) : null}
                                </ol>
                            ) : null}
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
