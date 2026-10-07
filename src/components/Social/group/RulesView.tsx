"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Pencil, Plus, ScrollText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import RulesList from "@/components/Groups/RulesList";
import { GroupTile, Spinner, relativeTime } from "@/components/Groups/ui";
import { RichText } from "@/components/Groups/workspace/MessageItem";
import { useI18n, type Copy } from "@/lib/i18n";
import { canModerate, toMillis } from "@/lib/groups";
import { groupHref } from "@/lib/social/model";
import { EmptyState, MainHeader } from "../ui";
import { useGroupSession } from "./GroupSession";

const C = {
    channel: { TR: "kurallar", EN: "rules" },
    headerHint: { TR: "Grubun kuralları; bu kanal yalnızca okunur.", EN: "The group's rules; this channel is read-only." },
    eyebrow: { TR: "Grup kuralları", EN: "Group rules" },
    intro: { TR: "Bu kurallar grubu herkes için güvenli, verimli ve keyifli tutar. Lütfen sohbete katılmadan önce oku.", EN: "These rules keep the group safe, productive and fun for everyone. Please read them before joining the chat." },
    introScreening: { TR: "Bu grupta mesaj yazmadan, tepki vermeden ve sesli kanala katılmadan önce kuralları kabul etmen gerekiyor.", EN: "In this group you accept the rules before you write, react or join the voice channel." },
    edit: { TR: "Düzenle", EN: "Edit" },
    updated: { TR: "Son güncelleme: {time}", EN: "Last updated {time}" },
    count: { TR: "Kural sayısı: {count}", EN: "Rules: {count}" },
    emptyTitle: { TR: "Henüz kural yok", EN: "No rules yet" },
    emptyManager: { TR: "Grubun kurallarını ekle; üyeler onları burada görür. İstersen sohbet etmeden önce kabul etmelerini de isteyebilirsin.", EN: "Add the group's rules; members see them here. You can also ask them to accept the rules before they chat." },
    emptyMember: { TR: "Bu grubun yöneticileri henüz kural eklemedi.", EN: "This group's admins haven't added any rules yet." },
    addRules: { TR: "Kural ekle", EN: "Add rules" },
    acceptTitle: { TR: "Sohbete katılmadan önce", EN: "Before you join the chat" },
    acceptText: { TR: "Bu grup, üyelerinin yazmadan önce kuralları kabul etmesini istiyor.", EN: "This group asks its members to accept the rules before they write." },
    acceptCheck: { TR: "Kuralları okudum ve kabul ediyorum", EN: "I've read the rules and accept them" },
    accept: { TR: "Kabul et", EN: "Accept" },
    accepting: { TR: "Kaydediliyor…", EN: "Saving…" },
    acceptedToast: { TR: "Kuralları kabul ettin. Sohbete hoş geldin!", EN: "You accepted the rules. Welcome to the chat!" },
    acceptedTitle: { TR: "Kuralları kabul ettin", EN: "You accepted the rules" },
    acceptedText: { TR: "Sohbete, tepkilere ve sesli kanala katılabilirsin.", EN: "You can join the chat, react and use the voice channel." },
    toChat: { TR: "Sohbete git", EN: "Go to the chat" },
    staffNote: { TR: "Sahip, yöneticiler ve moderatörler kuralları kabul etmeden de katılabilir.", EN: "The owner, admins and moderators can take part without accepting the rules." },
    staffScreening: { TR: "Üyeler sohbet etmeden önce bu kuralları kabul ediyor.", EN: "Members accept these rules before they chat." },
    noScreening: { TR: "Bu grupta kuralları ayrıca kabul etmek gerekmiyor; yine de herkesin uyması beklenir.", EN: "This group doesn't ask you to accept the rules separately, but everyone is expected to follow them." },
} satisfies Record<string, Copy>;

/**
 * The group's Rules section (a read-only channel, like Discord's rules
 * screen): the numbered rules and, when the group asks for it, the place
 * where a member accepts them before taking part.
 */
export default function RulesScreen() {
    const { tx, locale } = useI18n();
    const router = useRouter();
    const session = useGroupSession();
    const context = session.context!;
    const { group, groupId, role, isManager, now, notify } = context;
    const [checked, setChecked] = useState(false);
    const [busy, setBusy] = useState(false);
    const rules = group.rulesList;
    const staff = canModerate(role);
    const screening = group.rulesScreening && rules.length > 0;
    const updated = toMillis(group.rulesUpdatedAt);

    const onTopic = useCallback((topic: string) => router.push(groupHref(groupId, { topic })), [groupId, router]);
    const renderDescription = useCallback((text: string) => <RichText text={text} needle="" onTopic={onTopic} />, [onTopic]);

    const accept = async () => {
        if (!checked || busy) return;
        setBusy(true);
        const done = await session.acceptRules();
        setBusy(false);
        if (done) {
            setChecked(false);
            notify(tx(C.acceptedToast), "success");
        }
    };

    return (
        <main id="main-content" className="flex min-w-0 flex-1 flex-col bg-white dark:bg-zinc-900">
            <MainHeader>
                <ScrollText className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
                <h1 className="shrink-0 truncate text-base font-bold">{tx(C.channel)}</h1>
                <span className="mx-1 hidden h-5 w-px shrink-0 bg-zinc-200 dark:bg-white/10 md:block" aria-hidden />
                <p className="hidden min-w-0 truncate text-[13px] text-zinc-500 dark:text-zinc-400 md:block">{tx(C.headerHint)}</p>
            </MainHeader>
            <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60 dark:bg-zinc-950/40">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
                    <section aria-labelledby="group-rules-title" className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-6">
                        <div className="flex flex-wrap items-start gap-4">
                            <GroupTile emoji={group.emoji} color={group.color} size="md" />
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">{tx(C.eyebrow)}</p>
                                <h2 id="group-rules-title" className="mt-0.5 break-words text-xl font-black tracking-tight sm:text-2xl">{group.name}</h2>
                                {rules.length > 0 && <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{tx(screening && !staff ? C.introScreening : C.intro)}</p>}
                            </div>
                            {isManager && rules.length > 0 && (
                                <button type="button" onClick={() => session.openSettings("rules")} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800">
                                    <Pencil className="h-4 w-4" aria-hidden />{tx(C.edit)}
                                </button>
                            )}
                        </div>
                        {rules.length > 0 && (
                            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                <span>{tx(C.count, { count: rules.length })}</span>
                                {updated > 0 && <span>{tx(C.updated, { time: relativeTime(updated, now, locale) })}</span>}
                            </p>
                        )}
                    </section>

                    {rules.length === 0 ? (
                        <div className="mt-4 rounded-3xl border border-dashed border-zinc-300 bg-white dark:border-white/15 dark:bg-zinc-900">
                            <EmptyState icon={<ScrollText className="h-8 w-8" aria-hidden />} title={tx(C.emptyTitle)} text={tx(isManager ? C.emptyManager : C.emptyMember)}>
                                {isManager && (
                                    <button type="button" onClick={() => session.openSettings("rules")} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900">
                                        <Plus className="h-4 w-4" aria-hidden />{tx(C.addRules)}
                                    </button>
                                )}
                            </EmptyState>
                        </div>
                    ) : (
                        <>
                            <RulesList rules={rules} variant="cards" renderDescription={renderDescription} className="mt-4" />
                            <div className="mt-4">
                                {staff ? (
                                    <p className="flex items-start gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
                                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                                        <span>{tx(C.staffNote)}{screening && <> {tx(C.staffScreening)}</>}</span>
                                    </p>
                                ) : !screening ? (
                                    <p className="px-1 text-sm text-zinc-500 dark:text-zinc-400">{tx(C.noScreening)}</p>
                                ) : session.mustAcceptRules ? (
                                    <section aria-labelledby="rules-accept-title" className="rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.05] p-4 sm:p-5">
                                        <h3 id="rules-accept-title" className="text-sm font-black text-zinc-900 dark:text-white">{tx(C.acceptTitle)}</h3>
                                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{tx(C.acceptText)}</p>
                                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <label className="flex cursor-pointer items-start gap-2.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                                                <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} disabled={busy} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-indigo-600" />
                                                {tx(C.acceptCheck)}
                                            </label>
                                            <button type="button" onClick={() => void accept()} disabled={!checked || busy} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900">
                                                {busy ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}{busy ? tx(C.accepting) : tx(C.accept)}
                                            </button>
                                        </div>
                                    </section>
                                ) : (
                                    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
                                        <div className="flex items-start gap-2.5">
                                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                                            <div>
                                                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{tx(C.acceptedTitle)}</p>
                                                <p className="mt-0.5 text-sm text-emerald-900/80 dark:text-emerald-200/80">{tx(C.acceptedText)}</p>
                                            </div>
                                        </div>
                                        <Link href={groupHref(groupId)} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-600/30 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-200">
                                            {tx(C.toChat)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </motion.div>
            </div>
        </main>
    );
}
