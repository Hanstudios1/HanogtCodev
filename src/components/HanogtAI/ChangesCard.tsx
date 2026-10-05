"use client";

import { Check, ChevronDown, Copy as CopyIcon, FileDiff, SquareArrowOutUpRight, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { diffHunks, type DiffOp } from "@/lib/ai/diff";
import type { AiEdit } from "@/lib/ai/conversations";
import type { ApplyStatus } from "@/lib/ai/editor-apply";
import type { ProposedEdit } from "@/lib/ai/file-edit";
import { useI18n, type Copy } from "@/lib/i18n";
import { cx, ICON_BUTTON, INK_BUTTON } from "./ui";

const C = {
    title: { TR: "Değişiklikler", EN: "Changes" },
    fromDiff: { TR: "fark olarak geldi", EN: "came as a diff" },
    show: { TR: "Farkı göster", EN: "Show the diff" },
    hide: { TR: "Farkı gizle", EN: "Hide the diff" },
    apply: { TR: "Editöre uygula", EN: "Apply to editor" },
    applied: { TR: "Uygulandı", EN: "Applied" },
    appliedHint: { TR: "Editörde Ctrl+Z (Mac'te Cmd+Z) ile geri alabilirsin.", EN: "Undo it in the editor with Ctrl+Z (Cmd+Z on a Mac)." },
    openInEditor: { TR: "Editörde aç", EN: "Open in editor" },
    copy: { TR: "Dosyayı kopyala", EN: "Copy the file" },
    copied: { TR: "Kopyalandı", EN: "Copied" },
    dismiss: { TR: "Yoksay", EN: "Dismiss" },
    dismissed: { TR: "Yoksayıldı", EN: "Dismissed" },
    changed: { TR: "{file}, Hanogt AI okuduktan sonra değişti. Uygularsan sonraki değişikliklerin kaybolur.", EN: "{file} changed after Hanogt AI read it. Applying overwrites your later changes." },
    applyAnyway: { TR: "Yine de uygula", EN: "Apply anyway" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    missing: { TR: "Bu dosya bu sayfadaki editörde açık değil; değişikliği yeni bir sekmede açabilirsin.", EN: "This file isn't open in an editor on this page; you can open the change in a new tab." },
    line: { TR: "Satır {line}", EN: "Line {line}" },
    more: { TR: "{count} değişiklik bölümü daha", EN: "{count} more changed sections" },
    added: { TR: "{count} satır eklendi", EN: "{count} lines added" },
    removed: { TR: "{count} satır silindi", EN: "{count} lines removed" },
} satisfies Record<string, Copy>;

const HUNKS_SHOWN = 20;

function DiffLine({ op }: { op: DiffOp }) {
    const sign = op.kind === "add" ? "+" : op.kind === "del" ? "−" : " ";
    return (
        <div className={cx("flex min-w-max", op.kind === "add" ? "bg-brand-green/[0.12]" : op.kind === "del" ? "bg-rose-500/[0.12]" : "")} data-diff-line={op.kind}>
            <span className="w-10 shrink-0 select-none pe-2 text-end text-ai-muted/70 tabular-nums">{op.oldLine ?? ""}</span>
            <span className="w-10 shrink-0 select-none pe-2 text-end text-ai-muted/70 tabular-nums">{op.newLine ?? ""}</span>
            <span className={cx("w-4 shrink-0 select-none text-center", op.kind === "add" ? "text-brand-green" : op.kind === "del" ? "text-rose-600 dark:text-rose-400" : "text-ai-muted/60")} aria-hidden>{sign}</span>
            <span className="whitespace-pre pe-4 text-ai-ink">{op.text || " "}</span>
        </div>
    );
}

/**
 * What an answer would change in the file its question carried, as a diff
 * (Codex-style): the lines added and removed, and "Apply to editor" when the
 * file is open in an editor on this page; otherwise it can be opened in a new
 * editor tab or copied.
 */
export default function ChangesCard({ edit, proposal, editorPresent, onApply, onDismiss, onOpenInEditor }: {
    edit: AiEdit;
    proposal: ProposedEdit;
    editorPresent: boolean;
    onApply: (force: boolean) => ApplyStatus | "none";
    onDismiss: () => void;
    onOpenInEditor: (language: string, code: string) => void;
}) {
    const { tx } = useI18n();
    const changedLines = proposal.added + proposal.removed;
    const [open, setOpen] = useState(changedLines <= 60);
    const [problem, setProblem] = useState<"changed" | "missing" | null>(null);
    const [copied, setCopied] = useState(false);
    const hunks = useMemo(() => diffHunks(proposal.ops, 3), [proposal.ops]);
    const applied = edit.status === "applied";
    const dismissed = edit.status === "dismissed";

    const apply = (force: boolean) => {
        const status = onApply(force);
        setProblem(status === "changed" || status === "missing" ? status : null);
    };
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(proposal.code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    return (
        <section className="overflow-hidden rounded-2xl border border-ai-line bg-ai-surface" aria-label={`${tx(C.title)}: ${edit.fileName}`} data-ai-changes={applied ? "applied" : dismissed ? "dismissed" : "ready"}>
            <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
                <FileDiff className="h-4 w-4 shrink-0 text-ai-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                        <span className="font-semibold text-ai-ink">{tx(C.title)}</span>
                        <span className="truncate font-mono text-[12.5px] text-ai-ink/80">{edit.fileName}</span>
                        <span className="font-mono text-[12px] tabular-nums">
                            <span className="text-brand-green" title={tx(C.added, { count: proposal.added })}>+{proposal.added}</span>{" "}
                            <span className="text-rose-600 dark:text-rose-400" title={tx(C.removed, { count: proposal.removed })}>−{proposal.removed}</span>
                        </span>
                        {proposal.kind === "diff" ? <span className="text-[11.5px] text-ai-muted">{tx(C.fromDiff)}</span> : null}
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setOpen(!open)} className={cx(ICON_BUTTON, "gap-1 px-2 text-[12px] font-semibold")} aria-expanded={open} data-ai-changes-toggle>
                        <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />{tx(open ? C.hide : C.show)}
                    </button>
                    <button type="button" onClick={() => void copy()} className={ICON_BUTTON} title={tx(copied ? C.copied : C.copy)} aria-label={tx(copied ? C.copied : C.copy)}>
                        {copied ? <Check className="h-3.5 w-3.5 text-brand-green" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    </button>
                    {applied ? (
                        <span className="inline-flex items-center gap-1 rounded-xl bg-brand-green/10 px-2.5 py-1.5 text-[12.5px] font-semibold text-brand-green" title={tx(C.appliedHint)} data-ai-changes-applied><Check className="h-3.5 w-3.5" aria-hidden />{tx(C.applied)}</span>
                    ) : dismissed ? (
                        <span className="px-2 text-[12px] text-ai-muted">{tx(C.dismissed)}</span>
                    ) : (
                        <>
                            {editorPresent ? (
                                <button type="button" onClick={() => apply(false)} className={cx(INK_BUTTON, "py-1.5 text-[12.5px]")} data-ai-apply>{tx(C.apply)}</button>
                            ) : (
                                <button type="button" onClick={() => onOpenInEditor(edit.language, proposal.code)} className={cx(INK_BUTTON, "py-1.5 text-[12.5px]")} data-ai-open-change><SquareArrowOutUpRight className="h-3.5 w-3.5" aria-hidden />{tx(C.openInEditor)}</button>
                            )}
                            <button type="button" onClick={onDismiss} className={ICON_BUTTON} title={tx(C.dismiss)} aria-label={tx(C.dismiss)}><X className="h-3.5 w-3.5" /></button>
                        </>
                    )}
                </div>
            </header>
            {applied ? <p className="border-t border-ai-line px-3.5 py-2 text-[12px] text-ai-muted">{tx(C.appliedHint)}</p> : null}
            {problem === "changed" ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-amber-400/40 bg-amber-500/[0.08] px-3.5 py-2 text-[12.5px] text-amber-900 dark:text-amber-100" role="alert" data-ai-apply-changed>
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">{tx(C.changed, { file: edit.fileName })}</span>
                    <button type="button" onClick={() => apply(true)} className="rounded-lg bg-amber-500/20 px-2.5 py-1 font-semibold hover:bg-amber-500/30" data-ai-apply-anyway>{tx(C.applyAnyway)}</button>
                    <button type="button" onClick={() => setProblem(null)} className="rounded-lg px-2 py-1 font-semibold hover:bg-amber-500/15">{tx(C.cancel)}</button>
                </div>
            ) : problem === "missing" ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-ai-line px-3.5 py-2 text-[12.5px] text-ai-ink/80" role="status">
                    <span className="min-w-0 flex-1">{tx(C.missing)}</span>
                    <button type="button" onClick={() => onOpenInEditor(edit.language, proposal.code)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-brand-green hover:bg-brand-green/10"><SquareArrowOutUpRight className="h-3.5 w-3.5" aria-hidden />{tx(C.openInEditor)}</button>
                </div>
            ) : null}
            {open ? (
                <div className="scrollbar-thin max-h-[22rem] overflow-auto border-t border-ai-line bg-ai-paper/60 py-1 font-mono text-[12px] leading-[1.6]" dir="ltr" data-ai-diff>
                    {hunks.slice(0, HUNKS_SHOWN).map((hunk, index) => (
                        <div key={`${hunk.oldStart}-${index}`}>
                            <div className="sticky start-0 px-3 pb-0.5 pt-1.5 text-[11px] font-semibold text-ai-muted">{tx(C.line, { line: hunk.newStart || hunk.oldStart })}</div>
                            {hunk.ops.map((op, line) => <DiffLine key={line} op={op} />)}
                        </div>
                    ))}
                    {hunks.length > HUNKS_SHOWN ? <p className="px-3 py-2 text-[11.5px] text-ai-muted">{tx(C.more, { count: hunks.length - HUNKS_SHOWN })}</p> : null}
                </div>
            ) : null}
        </section>
    );
}
