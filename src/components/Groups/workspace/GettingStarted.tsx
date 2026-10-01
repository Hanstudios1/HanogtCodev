"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, FilePlus2, MessageSquare, Phone, Pin, Rocket, ScrollText, UserPlus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { Spinner, cx } from "../ui";

export type ChecklistStepId = "invite" | "rules" | "file" | "message" | "call" | "pin";
export type ChecklistStep = { id: ChecklistStepId; done: boolean; onAction: () => void };

const STEP_COPY: Record<ChecklistStepId, { title: Copy; text: Copy; action: Copy; icon: ReactNode }> = {
    invite: { title: { TR: "Bir arkadaşını davet et", EN: "Invite a friend" }, text: { TR: "Arkadaşlarına davet gönder ya da süreli bir davet bağlantısı paylaş.", EN: "Send invitations to friends or share an invite link that expires." }, action: { TR: "Davet et", EN: "Invite" }, icon: <UserPlus className="h-4 w-4" aria-hidden /> },
    rules: { title: { TR: "Açıklamayı ve kuralları belirle", EN: "Set the description and rules" }, text: { TR: "Grubun amacını ve birlikte çalışma kurallarını yaz.", EN: "Describe what the group is for and how you work together." }, action: { TR: "Düzenle", EN: "Edit" }, icon: <ScrollText className="h-4 w-4" aria-hidden /> },
    file: { title: { TR: "İlk dosyanı oluştur veya düzenle", EN: "Create or edit your first file" }, text: { TR: "Yeni bir dosya ekle ya da hazır dosyalardan birini düzenle; herkes canlı görür.", EN: "Add a file or edit one of the starter files; everyone sees it live." }, action: { TR: "Dosya oluştur", EN: "New file" }, icon: <FilePlus2 className="h-4 w-4" aria-hidden /> },
    message: { title: { TR: "İlk mesajını gönder", EN: "Send your first message" }, text: { TR: "Sohbette ekibini selamla; @ ile birinden bahsedebilirsin.", EN: "Say hello in the chat; use @ to mention someone." }, action: { TR: "Yaz", EN: "Write" }, icon: <MessageSquare className="h-4 w-4" aria-hidden /> },
    call: { title: { TR: "Sesli arama başlat", EN: "Start a voice call" }, text: { TR: "Üyeler listesinden arkadaşın olan bir üyeyi tek tıkla ara.", EN: "Call a member who is also your friend from the member list." }, action: { TR: "Üyeleri aç", EN: "Open members" }, icon: <Phone className="h-4 w-4" aria-hidden /> },
    pin: { title: { TR: "Önemli bir mesajı sabitle", EN: "Pin an important message" }, text: { TR: "Bir mesajın üzerine gel ve 📌 simgesine bas; herkes kolayca bulur.", EN: "Hover a message and press 📌 so everyone can find it." }, action: { TR: "Sohbete git", EN: "Go to chat" }, icon: <Pin className="h-4 w-4" aria-hidden /> },
};

const C = {
    title: { TR: "Grubunu hazırlayalım", EN: "Let's get your group ready" },
    progress: { TR: "{done}/{total} tamamlandı", EN: "{done} of {total} done" },
    doneTitle: { TR: "Her şey hazır! 🎉", EN: "You're all set! 🎉" },
    doneText: { TR: "Grubun kullanıma hazır. Bu rehberi kapatabilirsin; Ayarlar → Üyelik bölümünden tekrar açılır.", EN: "Your group is ready. You can close this guide; it can be reopened from Settings → Membership." },
    dismiss: { TR: "Rehberi kapat", EN: "Dismiss the guide" },
    collapse: { TR: "Rehberi daralt", EN: "Collapse the guide" },
    expand: { TR: "Rehberi genişlet", EN: "Expand the guide" },
    managersOnly: { TR: "Yalnızca sahip ve yöneticiler görür.", EN: "Visible to the owner and admins only." },
} satisfies Record<string, Copy>;

export default function GettingStarted({ steps, onDismiss, dismissing }: { steps: ChecklistStep[]; onDismiss: () => void; dismissing: boolean }) {
    const { tx } = useI18n();
    const [collapsed, setCollapsed] = useState(false);
    const done = steps.filter((step) => step.done).length;
    const complete = done === steps.length;
    const percent = Math.round((done / steps.length) * 100);

    return (
        <motion.section initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="relative shrink-0 overflow-hidden rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/[0.07] via-white to-fuchsia-500/[0.07] dark:via-zinc-900" aria-labelledby="getting-started-title">
            <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/25"><Rocket className="h-4.5 w-4.5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                    <h2 id="getting-started-title" className="truncate text-sm font-black">{complete ? tx(C.doneTitle) : tx(C.title)}</h2>
                    <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label={tx(C.progress, { done, total: steps.length })}>
                            <motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" initial={false} animate={{ width: `${percent}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
                        </div>
                        <span className="shrink-0 text-[11px] font-bold tabular-nums text-zinc-500 dark:text-zinc-400">{tx(C.progress, { done, total: steps.length })}</span>
                    </div>
                </div>
                <button type="button" onClick={() => setCollapsed((value) => !value)} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/60 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-expanded={!collapsed} aria-label={tx(collapsed ? C.expand : C.collapse)}>
                    <ChevronDown className={cx("h-4 w-4 transition", collapsed && "-rotate-90 rtl:rotate-90")} aria-hidden />
                </button>
                <button type="button" onClick={onDismiss} disabled={dismissing} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/60 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(C.dismiss)} title={tx(C.dismiss)}>
                    {dismissing ? <Spinner className="h-4 w-4" /> : <X className="h-4 w-4" aria-hidden />}
                </button>
            </div>
            <AnimatePresence initial={false}>
                {!collapsed && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        {complete ? (
                            <p className="px-4 pb-4 text-sm text-zinc-600 dark:text-zinc-300">{tx(C.doneText)}</p>
                        ) : (
                            <ol className="grid max-h-[40dvh] gap-2 overflow-y-auto px-3 pb-3 sm:max-h-none sm:grid-cols-2 xl:grid-cols-3">
                                {steps.map((step) => {
                                    const copy = STEP_COPY[step.id];
                                    return (
                                        <li key={step.id} className={cx("flex items-start gap-2.5 rounded-xl border p-2.5 transition", step.done ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-zinc-200 bg-white/80 dark:border-white/10 dark:bg-zinc-900/70")}>
                                            <span className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", step.done ? "bg-emerald-500 text-white" : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300")}>
                                                {step.done ? <Check className="h-3.5 w-3.5" aria-hidden /> : copy.icon}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className={cx("block text-[13px] font-bold", step.done && "text-zinc-500 line-through decoration-emerald-500/60 dark:text-zinc-400")}>{tx(copy.title)}</span>
                                                {!step.done && <span className="mt-0.5 block text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">{tx(copy.text)}</span>}
                                            </span>
                                            {!step.done && <button type="button" onClick={step.onAction} className="shrink-0 rounded-lg bg-indigo-600 px-2 py-1 text-[11px] font-bold text-white transition hover:bg-indigo-500">{tx(copy.action)}</button>}
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                        <p className="px-4 pb-3 text-[10px] text-zinc-400">{tx(C.managersOnly)}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.section>
    );
}
