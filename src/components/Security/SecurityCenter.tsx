"use client";

import { motion } from "framer-motion";
import {
    Bot, Bug, CheckCircle2, ClipboardCheck, FileLock2, FlaskConical, Gauge, Globe2, KeyRound, Link2, Lock, MessageSquareWarning, Radar, ScanSearch, Server,
    ShieldCheck, Siren, UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import GridBackdrop from "@/components/GridBackdrop";
import Header from "@/components/Header";
import ProductLogo from "@/components/ProductLogo";
import SiteFooter from "@/components/SiteFooter";
import { useI18n, type Copy } from "@/lib/i18n";
import AccountSecurityCard from "./AccountSecurityCard";
import CodeAdvisor from "./CodeAdvisor";
import LinkChecker from "./LinkChecker";
import PasswordLab from "./PasswordLab";
import SecurityChecklist from "./SecurityChecklist";

type Tool = "advisor" | "password" | "links" | "checklist";

const TOOLS: Array<{ id: Tool; icon: typeof FlaskConical; label: Copy; hint: Copy }> = [
    { id: "advisor", icon: FlaskConical, label: { TR: "Kod Danışmanı", EN: "Code Advisor" }, hint: { TR: "Anahtar sızıntısı ve açıklar", EN: "Leaked keys & flaws" } },
    { id: "links", icon: Link2, label: { TR: "Bağlantı Kontrolü", EN: "Link Check" }, hint: { TR: "Oltalama işaretleri", EN: "Phishing signs" } },
    { id: "password", icon: KeyRound, label: { TR: "Parola Laboratuvarı", EN: "Password Lab" }, hint: { TR: "Ölç, sızıntı ara, üret", EN: "Measure, check, generate" } },
    { id: "checklist", icon: ClipboardCheck, label: { TR: "İpuçları", EN: "Tips" }, hint: { TR: "Hesabını adım adım güçlendir", EN: "Harden your account step by step" } },
];

const LAYERS: Array<{ icon: typeof Server; title: Copy; text: Copy }> = [
    { icon: Radar, title: { TR: "Sunucu tarafı denetim", EN: "Server-side screening" }, text: { TR: "Kod çalıştırma, Media paylaşımları ve Arcade yayınları; ters kabuk, fork bomb, disk silme, kimlik bilgisi hırsızlığı, keylogger, kripto madenciliği ve konteyner kaçışı imzalarına karşı taranır.", EN: "Code runs, Media posts and Arcade releases are screened for reverse shells, fork bombs, disk wipes, credential theft, keyloggers, cryptomining and container escapes." } },
    { icon: Server, title: { TR: "İzole çalıştırıcı", EN: "Isolated runner" }, text: { TR: "Kod yalnızca yöneticinin yapılandırdığı, süre/bellek/ağ sınırlı izole bir ortamda çalışır; herkese açık yedek servislere düşülmez.", EN: "Code runs only in an administrator-configured isolated environment with time/memory/network limits; there is no public fallback." } },
    { icon: Lock, title: { TR: "Parola ve oturum", EN: "Passwords & sessions" }, text: { TR: "Parolalar benzersiz tuz ve scrypt ile tek yönlü karmalanır; kimlik bilgileri profil verisinden ayrı, istemciye kapalı tutulur.", EN: "Passwords are hashed one-way with scrypt and a unique salt; credentials are kept apart from profiles and closed to clients." } },
    { icon: Gauge, title: { TR: "Hız sınırları", EN: "Rate limits" }, text: { TR: "Kod çalıştırma, yorum, oy ve beğeni gibi işlemler kullanıcı veya bağlantı başına sınırlandırılır.", EN: "Runs, comments, votes and likes are limited per user or connection." } },
    { icon: FileLock2, title: { TR: "Veri erişim kuralları", EN: "Data access rules" }, text: { TR: "Hassas koleksiyonlar (yorumlar, oylar, oyun yayınları, önbellekler) tarayıcıdan doğrudan erişime kapalıdır; yalnızca doğrulanmış sunucu uç noktaları yazar.", EN: "Sensitive collections (comments, votes, game releases, caches) are closed to direct browser access; only verified server endpoints write them." } },
    { icon: Globe2, title: { TR: "Tarayıcı kalkanları", EN: "Browser shields" }, text: { TR: "İçerik Güvenliği Politikası (CSP), HSTS, çerçeveleme yasağı, MIME koklama koruması, sıkı Referrer ve izin politikaları.", EN: "Content Security Policy, HSTS, frame blocking, MIME-sniffing protection, strict referrer and permissions policies." } },
    { icon: UserCheck, title: { TR: "Topluluk moderasyonu", EN: "Community moderation" }, text: { TR: "Yorumlarda hakaret, spam ve kişisel veri (telefon, e-posta, T.C. kimlik, kart, IBAN) otomatik engellenir; paylaşımlar bildirilebilir.", EN: "Comments are filtered for abuse, spam and personal data (phone, e-mail, national ID, card, IBAN); posts can be reported." } },
    { icon: ShieldCheck, title: { TR: "Gizlilik öncelikli", EN: "Privacy first" }, text: { TR: "Sesli aramalar eşten eşe (WebRTC) ve kaydedilmez; yapay zeka arenası oyları tuzlanmış takma kimlikle saklanır.", EN: "Voice calls are peer-to-peer (WebRTC) and never recorded; AI arena votes are stored under a salted pseudonym." } },
];

/** What Hanogt Security Bot looks for before code runs on the server or gets published (src/lib/security/signatures.ts). */
const BOT_CATCHES: Copy[] = [
    { TR: "Ters kabuk ve uzaktan erişim", EN: "Reverse shells and remote access" },
    { TR: "Disk silme ve fork bomb", EN: "Disk wipes and fork bombs" },
    { TR: "Kimlik bilgisi ve jeton hırsızlığı", EN: "Credential and token theft" },
    { TR: "Tuş kaydı (keylogger)", EN: "Keyloggers" },
    { TR: "Kripto madenciliği", EN: "Cryptomining" },
    { TR: "Konteyner kaçışı ve yetki yükseltme", EN: "Container escapes and privilege escalation" },
];

const C = {
    heroNote: { TR: "Kodun ve parolan cihazından çıkmaz", EN: "Your code and password never leave your device" },
    heroText: { TR: "Hesabının güvenliğini tek bakışta gör, kodundaki sızmış anahtarları ve açıkları bul, şüpheli bağlantıları incele.", EN: "See your account's security at a glance, find leaked keys and flaws in your code and inspect suspicious links." },
    scanCode: { TR: "Kodumu tara", EN: "Scan my code" },
    checkLink: { TR: "Bağlantı kontrol et", EN: "Check a link" },
    askAi: { TR: "Hanogt AI'a sor", EN: "Ask Hanogt AI" },
    tools: { TR: "Güvenlik araçları", EN: "Security tools" },
    botTitle: { TR: "Hanogt Security Bot", EN: "Hanogt Security Bot" },
    botText: { TR: "Sunucuda çalışan otomatik bir ön eleme. Sunucuda çalışan dillerdeki kodu çalıştırmadan önce, Media'ya gönderilen projeleri ve Arcade'de yayımlanan oyunları bilinen zararlı kalıplara karşı tarar; riskli olanı engeller ve nedenini gösterir.", EN: "An automated pre-screen on the server. Before server-run code is executed, and when a project is sent to Media or a game is published on Arcade, it scans the code for known harmful patterns, blocks what is risky and tells you why." },
    botCatches: { TR: "Aradıkları", EN: "What it looks for" },
    botLimit: { TR: "Tarama her tehdidi yakalayacağını garanti etmez; paylaşmadan önce kodunu sen de kontrol et.", EN: "The scan can't promise to catch every threat; check your code yourself before you share it." },
    botSoon: { TR: "Yakında Hanogt Social gruplarında da: moderasyon komutları ve AutoMod.", EN: "Coming to Hanogt Social groups: moderation commands and AutoMod." },
    soon: { TR: "Yakında", EN: "Soon" },
    layersTitle: { TR: "Platform seni nasıl koruyor?", EN: "How the platform protects you" },
    layersText: { TR: "Tek bir sihirli kalkan yok; katman katman önlemler var. Hiçbiri kusursuz değildir ama birlikte riski büyük ölçüde azaltırlar.", EN: "There is no single magic shield, just layers. None is perfect, but together they cut risk dramatically." },
    reportTitle: { TR: "Açık mı buldun?", EN: "Found a vulnerability?" },
    reportText: { TR: "Sorumlu bildirim sürecini izle; sana teşekkür etmekten mutluluk duyarız.", EN: "Please follow responsible disclosure; we'll be glad to thank you." },
    report: { TR: "Güvenlik bildirimi gönder", EN: "Send a security report" },
    compromisedTitle: { TR: "Hesabım ele geçirildi mi?", EN: "Was my account compromised?" },
    talkToAi: { TR: "Hanogt AI ile konuş", EN: "Talk to Hanogt AI" },
} satisfies Record<string, Copy>;

const REPORT_STEPS: Copy[] = [
    { TR: "Geri Bildirim sayfasından \"Güvenlik\" başlıklı bir bildirim oluştur.", EN: "Create a report titled \"Security\" on the Feedback page." },
    { TR: "Yeniden üretme adımlarını, etkilenen sayfayı ve beklenen/gerçekleşen davranışı yaz.", EN: "Describe reproduction steps, the affected page and expected vs. actual behavior." },
    { TR: "Gerçek parola, erişim anahtarı veya başkasına ait kişisel veri ekleme.", EN: "Don't include real passwords, access keys or other people's personal data." },
    { TR: "Başka kullanıcıların verisine erişme, hizmeti aksatma veya veri silme.", EN: "Don't access other users' data, disrupt the service or delete data." },
];

const COMPROMISED_STEPS: Copy[] = [
    { TR: "Diğer tüm oturumları kapat ve parolanı değiştir (Hesap Ayarları → Gizlilik ve Güvenlik). Google ile giriyorsan Google parolanı da değiştir.", EN: "Sign out all other sessions and change your password (Account Settings → Privacy & Security). If you use Google sign-in, change your Google password too." },
    { TR: "Aynı parolayı kullandığın diğer sitelerde de değiştir.", EN: "Change it on every other site where you reused it." },
    { TR: "Projelerini, Media paylaşımlarını ve gruplarını tanımadığın değişikliklere karşı kontrol et.", EN: "Check projects, Media posts and groups for changes you don't recognize." },
    { TR: "Geri Bildirim'den \"Güvenlik\" başlığıyla bize ulaş; hesabını birlikte güvenceye alalım.", EN: "Contact us via Feedback titled \"Security\" and we'll secure the account together." },
];

export default function SecurityCenter() {
    const { tx } = useI18n();
    const [tool, setTool] = useState<Tool>("advisor");

    // Deep links such as /security#password open the matching tool.
    useEffect(() => {
        const apply = () => {
            const hash = window.location.hash.slice(1) as Tool;
            if (TOOLS.some((entry) => entry.id === hash)) {
                setTool(hash);
                document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" });
            }
        };
        const timer = window.setTimeout(apply, 0);
        window.addEventListener("hashchange", apply);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener("hashchange", apply);
        };
    }, []);

    const openTool = (id: Tool) => {
        setTool(id);
        window.history.replaceState(null, "", `#${id}`);
    };
    const openBot = () => window.dispatchEvent(new CustomEvent("hanogt:open-ai", { detail: { mode: "security" } }));

    return (
        <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <main id="main-content">
                <section className="relative isolate border-b border-zinc-200/70 bg-white dark:border-white/[0.06] dark:bg-zinc-950">
                    <GridBackdrop fade="bottom" />
                    <div className="mx-auto grid max-w-7xl items-start gap-10 px-4 pb-14 pt-28 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-32">
                        <div>
                            <div className="flex items-center gap-3">
                                <ProductLogo product="security" size={56} priority />
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-green/30 px-3 py-1 text-[12px] font-bold text-brand-green">
                                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />{tx(C.heroNote)}
                                </span>
                            </div>
                            <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">Hanogt <span className="text-gradient animate-gradient">Security</span></h1>
                            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.heroText)}</p>
                            <div className="mt-7 flex flex-wrap gap-3">
                                <a href="#advisor" onClick={(event) => { event.preventDefault(); openTool("advisor"); document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" }); }} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-zinc-900 px-5 text-[15px] font-bold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                                    <FlaskConical className="h-4.5 w-4.5" aria-hidden />{tx(C.scanCode)}
                                </a>
                                <a href="#links" onClick={(event) => { event.preventDefault(); openTool("links"); document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" }); }} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-zinc-300 px-5 text-[15px] font-bold transition hover:border-zinc-400 dark:border-white/15 dark:hover:border-white/30">
                                    <Link2 className="h-4.5 w-4.5" aria-hidden />{tx(C.checkLink)}
                                </a>
                                <button type="button" onClick={openBot} className="inline-flex h-12 items-center gap-2 rounded-2xl px-3 text-[15px] font-bold text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5">
                                    <Bot className="h-4.5 w-4.5" aria-hidden />{tx(C.askAi)}
                                </button>
                            </div>
                        </div>
                        <AccountSecurityCard />
                    </div>
                </section>

                <section id="tools" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 sm:px-6">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label={tx(C.tools)}>
                        {TOOLS.map((entry) => {
                            const active = tool === entry.id;
                            return (
                                <button
                                    key={entry.id}
                                    type="button"
                                    role="tab"
                                    id={`security-tab-${entry.id}`}
                                    aria-selected={active}
                                    aria-controls="security-tool-panel"
                                    onClick={() => openTool(entry.id)}
                                    className={`flex items-center gap-3 rounded-2xl border p-3.5 text-start transition ${active ? "border-zinc-900 bg-white dark:border-white dark:bg-zinc-900" : "border-zinc-200 bg-white/60 hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20"}`}
                                >
                                    <span className={`hidden h-10 w-10 shrink-0 place-items-center rounded-xl sm:grid ${active ? "bg-brand-green text-white" : "bg-zinc-100 text-zinc-500 dark:bg-white/[0.06]"}`}><entry.icon className="h-5 w-5" aria-hidden /></span>
                                    <span className="min-w-0">
                                        <span className="block text-[14px] font-bold leading-snug text-zinc-900 sm:truncate dark:text-white">{tx(entry.label)}</span>
                                        <span className="hidden truncate text-[12px] text-zinc-500 sm:block">{tx(entry.hint)}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <motion.div key={tool} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mt-6" role="tabpanel" id="security-tool-panel" aria-labelledby={`security-tab-${tool}`}>
                        {tool === "advisor" ? <CodeAdvisor /> : tool === "password" ? <PasswordLab /> : tool === "links" ? <LinkChecker /> : <SecurityChecklist />}
                    </motion.div>
                </section>

                <section aria-labelledby="security-bot-title" className="border-y border-zinc-200/70 bg-white py-16 dark:border-white/[0.06] dark:bg-zinc-900/30">
                    <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
                        <div>
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-green/10 text-brand-green"><ScanSearch className="h-6 w-6" aria-hidden /></span>
                            <h2 id="security-bot-title" className="mt-4 text-3xl font-black tracking-tight">{tx(C.botTitle)}</h2>
                            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.botText)}</p>
                            <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-zinc-500">{tx(C.botLimit)}</p>
                            <p className="mt-5 flex max-w-xl items-start gap-2 text-[13.5px] font-semibold text-zinc-700 dark:text-zinc-300">
                                <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">{tx(C.soon)}</span>
                                {tx(C.botSoon)}
                            </p>
                        </div>
                        <div className="rounded-3xl border border-zinc-200 p-6 dark:border-white/10">
                            <h3 className="text-[13px] font-black uppercase tracking-wider text-zinc-500">{tx(C.botCatches)}</h3>
                            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                                {BOT_CATCHES.map((item) => (
                                    <li key={item.EN} className="flex items-start gap-2.5 text-[14px] text-zinc-700 dark:text-zinc-300">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" aria-hidden />{tx(item)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </section>

                <section aria-labelledby="security-layers-title" className="py-16">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6">
                        <h2 id="security-layers-title" className="text-center text-3xl font-black tracking-tight sm:text-4xl">{tx(C.layersTitle)}</h2>
                        <p className="mx-auto mt-3 max-w-2xl text-center text-[15px] text-zinc-600 dark:text-zinc-400">{tx(C.layersText)}</p>
                        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {LAYERS.map((layer) => (
                                <article key={layer.title.EN} className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
                                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200"><layer.icon className="h-5 w-5" aria-hidden /></span>
                                    <h3 className="mt-3 text-[15px] font-black">{tx(layer.title)}</h3>
                                    <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(layer.text)}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="mx-auto grid max-w-7xl gap-5 px-4 pb-20 sm:px-6 lg:grid-cols-2">
                    <div className="rounded-3xl border border-zinc-200 bg-white p-7 dark:border-white/10 dark:bg-zinc-900/60">
                        <h2 className="flex items-center gap-2 text-2xl font-black"><Bug className="h-6 w-6 text-rose-500" aria-hidden />{tx(C.reportTitle)}</h2>
                        <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.reportText)}</p>
                        <ol className="mt-4 space-y-2.5 text-[14px] text-zinc-700 dark:text-zinc-300">
                            {REPORT_STEPS.map((step, index) => (
                                <li key={step.EN} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-100 text-[12px] font-black text-zinc-700 dark:bg-white/10 dark:text-zinc-200">{index + 1}</span>{tx(step)}</li>
                            ))}
                        </ol>
                        <Link href="/feedback" className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-[14px] font-bold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"><MessageSquareWarning className="h-4 w-4" aria-hidden />{tx(C.report)}</Link>
                    </div>
                    <div className="rounded-3xl border border-zinc-200 bg-white p-7 dark:border-white/10 dark:bg-zinc-900/60">
                        <h2 className="flex items-center gap-2 text-2xl font-black"><Siren className="h-6 w-6 text-amber-500" aria-hidden />{tx(C.compromisedTitle)}</h2>
                        <ul className="mt-4 space-y-2.5 text-[14px] text-zinc-700 dark:text-zinc-300">
                            {COMPROMISED_STEPS.map((step) => <li key={step.EN} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" aria-hidden />{tx(step)}</li>)}
                        </ul>
                        <button type="button" onClick={openBot} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-300 px-4 text-[14px] font-bold transition hover:border-zinc-400 dark:border-white/15 dark:hover:border-white/30"><Bot className="h-4 w-4" aria-hidden />{tx(C.talkToAi)}</button>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
