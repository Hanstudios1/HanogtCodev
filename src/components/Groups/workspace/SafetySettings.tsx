"use client";

import { Ban, Check, Flag, Gavel, Link2, MicOff, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { PLAN_GROUP_FEATURES } from "@/lib/plans";
import { AUTOMOD_LIMITS, AUTOMOD_RULE_COPY, DEFAULT_AUTOMOD, isAutoModRule, normalizeDomain, type AutoModConfig } from "@/lib/social/automod-config";
import { groupsApi, type GroupModerationResponse } from "../api";
import { Spinner, cx, fullDateTime } from "../ui";
import { useWorkspace } from "./context";

const C = {
    automod: { TR: "AutoMod", EN: "AutoMod" },
    automodHint: { TR: "Hanogt Security Bot mesajları gönderilmeden önce bu kurallara göre denetler; takılan mesaj gruba hiç düşmez ve yalnızca yazan kişi neden engellendiğini görür.", EN: "Hanogt Security Bot checks messages against these rules before they are sent; a message that hits one never reaches the group and only its writer sees why." },
    readOnly: { TR: "AutoMod'u grup sahibi ve yöneticiler değiştirir.", EN: "The owner and admins change AutoMod." },
    enabled: { TR: "AutoMod açık", EN: "AutoMod on" },
    filters: { TR: "Neyi durdursun", EN: "What it stops" },
    profanity: { TR: "Küfür (Türkçe ve İngilizce)", EN: "Swearing (Turkish and English)" },
    profanityHint: { TR: "\"s1kt1r\" ya da \"siiiktir\" gibi gizlenmiş yazımları da yakalar.", EN: "Also catches disguised spellings like \"sh1t\" or \"shiiit\"." },
    slang: { TR: "Argo ve hakaret", EN: "Slang and insults" },
    slangHint: { TR: "\"salak\", \"aptal\", \"stupid\" gibi daha hafif sözler.", EN: "Milder words like \"stupid\" or \"idiot\"." },
    customWords: { TR: "Grubun yasaklı kelimeleri", EN: "The group's banned words" },
    customWordsHint: { TR: "Virgülle ya da satır satır yaz ({count}/{max}; sınır grup sahibinin planına göredir: Ücretsiz {free}, Plus {plus}, Pro {pro}). Bu listeyi üyeler göremez.", EN: "Separate with commas or new lines ({count}/{max}; the limit follows the group owner's plan: Free {free}, Plus {plus}, Pro {pro}). Members can't see this list." },
    customWordsHidden: { TR: "Grubun yasaklı kelimelerini yalnızca sahip ve yöneticiler görür.", EN: "Only the owner and admins can see the group's banned words." },
    spam: { TR: "Spam: aynı mesajın tekrarı ve seri mesaj", EN: "Spam: repeated messages and bursts" },
    maxMentions: { TR: "Bir mesajdaki en fazla bahsetme", EN: "Most mentions in one message" },
    maxMentionsHint: { TR: "0 bu denetimi kapatır.", EN: "0 turns this check off." },
    links: { TR: "Bağlantılar", EN: "Links" },
    linksAllow: { TR: "Hepsine izin ver", EN: "Allow all" },
    linksBlock: { TR: "Hepsini engelle", EN: "Block all" },
    linksAllowlist: { TR: "Yalnızca izin verilen siteler", EN: "Only allowed sites" },
    allowlist: { TR: "İzin verilen siteler", EN: "Allowed sites" },
    addDomain: { TR: "Site ekle", EN: "Add site" },
    domainPlaceholder: { TR: "örn. github.com", EN: "e.g. github.com" },
    domainInvalid: { TR: "Geçerli bir alan adı yaz (örn. github.com).", EN: "Enter a valid domain (e.g. github.com)." },
    removeDomain: { TR: "{domain} sitesini kaldır", EN: "Remove {domain}" },
    caps: { TR: "Çoğunlukla büyük harfle yazılmış mesajlar", EN: "Messages written mostly in capitals" },
    personal: { TR: "Kişisel veri (e-posta, telefon, T.C. kimlik, kart, IBAN)", EN: "Personal data (e-mail, phone, ID, card and IBAN numbers)" },
    action: { TR: "Ne yapsın", EN: "What it does" },
    actionBlock: { TR: "Yalnızca engelle", EN: "Block only" },
    actionWarn: { TR: "Engelle ve uyar", EN: "Block and warn" },
    muteAfter: { TR: "Kaç uyarıda sustursun (30 gün içinde)", EN: "Mute after this many warnings (in 30 days)" },
    muteAfterHint: { TR: "0 otomatik susturmayı kapatır. Uyarılar moderatörlerin /uyar komutundan da gelir.", EN: "0 turns automatic muting off. Warnings also come from moderators' /warn." },
    muteMinutes: { TR: "Susturma süresi (dakika)", EN: "Mute length (minutes)" },
    exempt: { TR: "AutoMod'un dokunmadığı roller", EN: "Roles AutoMod leaves alone" },
    exemptOwner: { TR: "Grup sahibi her zaman muaftır.", EN: "The owner is always exempt." },
    moderators: { TR: "Moderatörler", EN: "Moderators" },
    admins: { TR: "Yöneticiler", EN: "Admins" },
    save: { TR: "AutoMod'u kaydet", EN: "Save AutoMod" },
    saved: { TR: "AutoMod kaydedildi.", EN: "AutoMod saved." },
    reports: { TR: "Açık raporlar", EN: "Open reports" },
    reportsEmpty: { TR: "Açık rapor yok. Üyeler /rapor @kişi sebep ile bildirebilir.", EN: "No open reports. Members can report with /report @person reason." },
    reportLine: { TR: "{reporter} → {target}", EN: "{reporter} → {target}" },
    resolve: { TR: "Çözüldü", EN: "Resolved" },
    resolved: { TR: "Rapor kapatıldı.", EN: "Report closed." },
    mutes: { TR: "Susturulanlar", EN: "Muted members" },
    mutesEmpty: { TR: "Şu anda susturulan kimse yok.", EN: "Nobody is muted right now." },
    until: { TR: "{time} tarihine kadar", EN: "Until {time}" },
    byAutoMod: { TR: "AutoMod", EN: "AutoMod" },
    unmute: { TR: "Susturmayı kaldır", EN: "Unmute" },
    unmuted: { TR: "Susturma kaldırıldı.", EN: "Mute lifted." },
    events: { TR: "AutoMod'un son engelledikleri", EN: "AutoMod's latest stops" },
    eventsEmpty: { TR: "AutoMod son zamanlarda bir mesaj engellemedi.", EN: "AutoMod hasn't stopped a message lately." },
    unknown: { TR: "Ayrılmış üye", EN: "Former member" },
    refresh: { TR: "Yenile", EN: "Refresh" },
    loadFailed: { TR: "Güvenlik bilgileri yüklenemedi.", EN: "The safety details couldn't be loaded." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
} satisfies Record<string, Copy>;

function Card({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
    return (
        <section className="rounded-2xl border border-zinc-200 p-4 sm:p-5 dark:border-white/10">
            <div className="flex items-center gap-2">
                <h3 className="flex flex-1 items-center gap-2 text-sm font-black">{icon}{title}</h3>
                {action}
            </div>
            <div className="mt-3">{children}</div>
        </section>
    );
}

function Check2({ label, hint, checked, disabled, onChange }: { label: string; hint?: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
    return (
        <label className={cx("flex items-start gap-3 py-2", disabled ? "cursor-default" : "cursor-pointer")}>
            <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-indigo-600 disabled:opacity-60" />
            <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                {hint && <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>}
            </span>
        </label>
    );
}

/** Group settings › Safety: AutoMod (owners and admins change it), reports, mutes and the latest AutoMod stops (moderators and up). */
export default function SafetySettings() {
    const { tx, locale } = useI18n();
    const { groupId, notify, errorText, limits } = useWorkspace();
    const [data, setData] = useState<GroupModerationResponse | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [config, setConfig] = useState<AutoModConfig>(DEFAULT_AUTOMOD);
    const [words, setWords] = useState("");
    const [domain, setDomain] = useState("");
    const [domainError, setDomainError] = useState("");
    const [busy, setBusy] = useState("");

    useEffect(() => {
        let active = true;
        groupsApi.moderation(groupId)
            .then((result) => {
                if (!active) return;
                setData(result);
                setConfig(result.automod);
                setWords((result.customWords ?? []).join("\n"));
                setFailed(false);
            })
            .catch(() => { if (active) setFailed(true); });
        return () => { active = false; };
    }, [attempt, groupId]);

    if (failed && !data) {
        return (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">{tx(C.loadFailed)}</p>
                <button type="button" onClick={() => setAttempt((value) => value + 1)} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-zinc-800"><RefreshCw className="h-4 w-4" aria-hidden />{tx(C.retry)}</button>
            </div>
        );
    }
    if (!data) return <div className="flex justify-center py-12"><Spinner className="h-6 w-6 text-indigo-500" /></div>;

    const editable = data.canEdit;
    // Distinct words as the server counts them (case and repeats don't count twice).
    const wordCount = new Set(words.split(/[\n,]/).map((word) => word.trim().toLocaleLowerCase("tr")).filter((word) => word.length >= 2)).size;
    const set = <K extends keyof AutoModConfig>(key: K, value: AutoModConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));
    const person = (entry: { name: string } | null) => entry?.name ?? tx(C.unknown);
    const when = (iso: string | null) => (iso ? fullDateTime(Date.parse(iso), locale) : "");

    const addDomain = (event: FormEvent) => {
        event.preventDefault();
        const normalized = normalizeDomain(domain);
        if (!normalized) {
            setDomainError(tx(C.domainInvalid));
            return;
        }
        if (!config.linkAllowlist.includes(normalized) && config.linkAllowlist.length < AUTOMOD_LIMITS.allowlist) set("linkAllowlist", [...config.linkAllowlist, normalized]);
        setDomain("");
        setDomainError("");
    };

    const saveAutoMod = async () => {
        setBusy("automod");
        try {
            const customWords = words.split(/[\n,]/).map((word) => word.trim()).filter(Boolean);
            const result = await groupsApi.moderate<{ success: true; automod: AutoModConfig; customWords: string[] }>({ action: "save-automod", groupId, config, ...(data.customWords !== null ? { customWords } : {}) });
            setConfig(result.automod);
            setWords(result.customWords.join("\n"));
            notify(tx(C.saved), "success");
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    const resolve = async (reportId: string) => {
        setBusy(reportId);
        try {
            await groupsApi.moderate({ action: "resolve-report", groupId, reportId });
            setData((current) => (current ? { ...current, reports: current.reports.filter((report) => report.id !== reportId) } : current));
            notify(tx(C.resolved), "success");
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    const unmute = async (email: string) => {
        setBusy(email);
        try {
            await groupsApi.moderate({ action: "unmute", groupId, targetEmail: email });
            setData((current) => (current ? { ...current, mutes: current.mutes.filter((mute) => mute.person?.email !== email) } : current));
            notify(tx(C.unmuted), "success");
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    const radio = "rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60";
    const number = "w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-500 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950";
    const off = !config.enabled;

    return (
        <div className="space-y-4">
            <Card title={tx(C.automod)} icon={<ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden />} action={(
                <button type="button" onClick={() => setAttempt((value) => value + 1)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(C.refresh)} title={tx(C.refresh)}><RefreshCw className="h-4 w-4" aria-hidden /></button>
            )}>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{tx(C.automodHint)}</p>
                {!editable && <p className="mt-2 rounded-xl bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-300">{tx(C.readOnly)}</p>}
                <div className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
                    <Check2 label={tx(C.enabled)} checked={config.enabled} disabled={!editable} onChange={(value) => set("enabled", value)} />
                    <div className={cx("py-2", off && "opacity-60")}>
                        <p className="pt-1 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.filters)}</p>
                        <Check2 label={tx(C.profanity)} hint={tx(C.profanityHint)} checked={config.profanity} disabled={!editable || off} onChange={(value) => set("profanity", value)} />
                        <Check2 label={tx(C.slang)} hint={tx(C.slangHint)} checked={config.slang} disabled={!editable || off} onChange={(value) => set("slang", value)} />
                        <Check2 label={tx(C.spam)} checked={config.spam} disabled={!editable || off} onChange={(value) => set("spam", value)} />
                        <Check2 label={tx(C.caps)} checked={config.caps} disabled={!editable || off} onChange={(value) => set("caps", value)} />
                        <Check2 label={tx(C.personal)} checked={config.personalData} disabled={!editable || off} onChange={(value) => set("personalData", value)} />
                        <label className="flex flex-wrap items-center justify-between gap-3 py-2">
                            <span><span className="block text-sm font-semibold">{tx(C.maxMentions)}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400">{tx(C.maxMentionsHint)}</span></span>
                            <input type="number" min={0} max={AUTOMOD_LIMITS.maxMentions} value={config.maxMentions} disabled={!editable || off} onChange={(event) => set("maxMentions", Math.max(0, Math.min(AUTOMOD_LIMITS.maxMentions, Number(event.target.value) || 0)))} className={number} />
                        </label>
                        <div className="py-2">
                            <p className="flex items-center gap-1.5 text-sm font-semibold"><Link2 className="h-4 w-4 text-zinc-400" aria-hidden />{tx(C.links)}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={tx(C.links)}>
                                {([["allow", C.linksAllow], ["block", C.linksBlock], ["allowlist", C.linksAllowlist]] as const).map(([value, label]) => (
                                    <button key={value} type="button" role="radio" aria-checked={config.links === value} disabled={!editable || off} onClick={() => set("links", value)} className={cx(radio, config.links === value ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5")}>{tx(label)}</button>
                                ))}
                            </div>
                            {config.links === "allowlist" && (
                                <div className="mt-2">
                                    <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{tx(C.allowlist)}</p>
                                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                        {config.linkAllowlist.map((entry) => (
                                            <li key={entry} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-1 pe-1.5 ps-2.5 text-xs font-semibold dark:bg-white/10">
                                                {entry}
                                                {editable && <button type="button" onClick={() => set("linkAllowlist", config.linkAllowlist.filter((item) => item !== entry))} className="rounded-full p-0.5 hover:bg-zinc-200 dark:hover:bg-white/10" aria-label={tx(C.removeDomain, { domain: entry })}><X className="h-3 w-3" aria-hidden /></button>}
                                            </li>
                                        ))}
                                    </ul>
                                    {editable && (
                                        <form onSubmit={addDomain} className="mt-2 flex gap-2">
                                            <input value={domain} onChange={(event) => { setDomain(event.target.value); setDomainError(""); }} placeholder={tx(C.domainPlaceholder)} aria-label={tx(C.addDomain)} dir="ltr" className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-zinc-950" />
                                            <button type="submit" className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-zinc-800">{tx(C.addDomain)}</button>
                                        </form>
                                    )}
                                    {domainError && <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{domainError}</p>}
                                </div>
                            )}
                        </div>
                        <div className="py-2">
                            <p className="text-sm font-semibold">{tx(C.customWords)}</p>
                            {data.customWords === null ? (
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.customWordsHidden)}</p>
                            ) : (
                                <>
                                    <textarea value={words} disabled={!editable || off} onChange={(event) => setWords(event.target.value)} rows={3} className="mt-1.5 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950" aria-label={tx(C.customWords)} />
                                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.customWordsHint, { count: wordCount, max: limits.bannedWords, free: PLAN_GROUP_FEATURES.free.bannedWords, plus: PLAN_GROUP_FEATURES.plus.bannedWords, pro: PLAN_GROUP_FEATURES.pro.bannedWords })}</p>
                                </>
                            )}
                        </div>
                    </div>
                    <div className={cx("py-2", off && "opacity-60")}>
                        <p className="pt-1 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.action)}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={tx(C.action)}>
                            {([["block", C.actionBlock], ["block_warn", C.actionWarn]] as const).map(([value, label]) => (
                                <button key={value} type="button" role="radio" aria-checked={config.action === value} disabled={!editable || off} onClick={() => set("action", value)} className={cx(radio, config.action === value ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5")}>{tx(label)}</button>
                            ))}
                        </div>
                        <label className="mt-2 flex flex-wrap items-center justify-between gap-3 py-2">
                            <span><span className="block text-sm font-semibold">{tx(C.muteAfter)}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400">{tx(C.muteAfterHint)}</span></span>
                            <input type="number" min={0} max={AUTOMOD_LIMITS.muteAfterWarnings} value={config.muteAfterWarnings} disabled={!editable || off} onChange={(event) => set("muteAfterWarnings", Math.max(0, Math.min(AUTOMOD_LIMITS.muteAfterWarnings, Number(event.target.value) || 0)))} className={number} />
                        </label>
                        {config.muteAfterWarnings > 0 && (
                            <label className="flex flex-wrap items-center justify-between gap-3 py-2">
                                <span className="text-sm font-semibold">{tx(C.muteMinutes)}</span>
                                <input type="number" min={1} max={AUTOMOD_LIMITS.muteMinutes} value={config.muteMinutes} disabled={!editable || off} onChange={(event) => set("muteMinutes", Math.max(1, Math.min(AUTOMOD_LIMITS.muteMinutes, Number(event.target.value) || 1)))} className={number} />
                            </label>
                        )}
                    </div>
                    <div className={cx("py-2", off && "opacity-60")}>
                        <p className="pt-1 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.exempt)}</p>
                        {(["moderator", "admin"] as const).map((rank) => (
                            <Check2 key={rank} label={tx(rank === "moderator" ? C.moderators : C.admins)} checked={config.exempt.includes(rank)} disabled={!editable || off} onChange={(value) => set("exempt", value ? [...new Set([...config.exempt, rank])] : config.exempt.filter((entry) => entry !== rank))} />
                        ))}
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{tx(C.exemptOwner)}</p>
                    </div>
                </div>
                {editable && (
                    <div className="mt-3 flex justify-end">
                        <button type="button" disabled={Boolean(busy)} onClick={() => void saveAutoMod()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50">
                            {busy === "automod" ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" aria-hidden />}{tx(C.save)}
                        </button>
                    </div>
                )}
            </Card>

            <Card title={tx(C.reports)} icon={<Flag className="h-4 w-4 text-red-500" aria-hidden />}>
                {!data.reports.length ? <p className="text-sm text-zinc-500 dark:text-zinc-400">{tx(C.reportsEmpty)}</p> : (
                    <ul className="space-y-2">
                        {data.reports.map((report) => (
                            <li key={report.id} className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/5">
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold">{tx(C.reportLine, { reporter: person(report.reporter), target: person(report.target) })}</p>
                                        {report.reason && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-zinc-600 dark:text-zinc-300">{report.reason}</p>}
                                        <p className="mt-0.5 text-[11px] text-zinc-400">{when(report.createdAt)}</p>
                                    </div>
                                    <button type="button" disabled={Boolean(busy)} onClick={() => void resolve(report.id)} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">{busy === report.id ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" aria-hidden />}{tx(C.resolve)}</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            <Card title={tx(C.mutes)} icon={<MicOff className="h-4 w-4 text-amber-500" aria-hidden />}>
                {!data.mutes.length ? <p className="text-sm text-zinc-500 dark:text-zinc-400">{tx(C.mutesEmpty)}</p> : (
                    <ul className="space-y-1.5">
                        {data.mutes.map((mute, index) => (
                            <li key={mute.person?.email ?? index} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/5">
                                <div className="min-w-0 flex-1">
                                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">{person(mute.person)}{mute.byAutoMod && <span className="rounded bg-amber-500/15 px-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">{tx(C.byAutoMod)}</span>}</p>
                                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{tx(C.until, { time: when(mute.until) })}{mute.reason ? ` · ${mute.reason}` : ""}</p>
                                </div>
                                {mute.person && <button type="button" disabled={Boolean(busy)} onClick={() => void unmute(mute.person!.email)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300">{busy === mute.person.email ? <Spinner className="h-3.5 w-3.5" /> : tx(C.unmute)}</button>}
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            <Card title={tx(C.events)} icon={<Gavel className="h-4 w-4 text-indigo-500" aria-hidden />}>
                {!data.events.length ? <p className="text-sm text-zinc-500 dark:text-zinc-400">{tx(C.eventsEmpty)}</p> : (
                    <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                        {data.events.map((event, index) => (
                            <li key={`${event.createdAt}-${index}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-sm">
                                <Ban className="h-3.5 w-3.5 text-red-500" aria-hidden />
                                <span className="font-semibold">{person(event.person)}</span>
                                <span className="text-zinc-500 dark:text-zinc-400">{isAutoModRule(event.rule) ? tx(AUTOMOD_RULE_COPY[event.rule]) : event.rule}</span>
                                <span className="ms-auto text-[11px] text-zinc-400">{when(event.createdAt)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}
