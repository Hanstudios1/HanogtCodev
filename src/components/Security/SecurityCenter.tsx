"use client";

import { motion } from "framer-motion";
import {
    Bot, Bug, CheckCircle2, ClipboardCheck, FileLock2, FlaskConical, Gauge, Globe2, KeyRound, Link2, Lock, MessageSquareWarning, Radar, Server, ShieldCheck,
    Siren, UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { useI18n, type Copy } from "@/lib/i18n";
import CodeAdvisor from "./CodeAdvisor";
import LinkChecker from "./LinkChecker";
import PasswordLab from "./PasswordLab";
import SecurityChecklist from "./SecurityChecklist";

type Tool = "advisor" | "password" | "links" | "checklist";

const TOOLS: Array<{ id: Tool; icon: typeof FlaskConical; label: Copy; hint: Copy }> = [
    { id: "advisor", icon: FlaskConical, label: { TR: "Kod Danışmanı", EN: "Code Advisor" }, hint: { TR: "Anahtar sızıntısı ve açıklar", EN: "Leaked keys & flaws" } },
    { id: "password", icon: KeyRound, label: { TR: "Parola Laboratuvarı", EN: "Password Lab" }, hint: { TR: "Ölç, sızıntı ara, üret", EN: "Measure, check, generate" } },
    { id: "links", icon: Link2, label: { TR: "Bağlantı Kontrolü", EN: "Link Check" }, hint: { TR: "Oltalama işaretleri", EN: "Phishing signs" } },
    { id: "checklist", icon: ClipboardCheck, label: { TR: "Kontrol Listesi", EN: "Checklist" }, hint: { TR: "Hesabını güçlendir", EN: "Harden your account" } },
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

    const openBot = () => window.dispatchEvent(new CustomEvent("hanogt:open-security-bot"));

    return (
        <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
            <Header />
            <main id="main-content">
                <section className="relative overflow-hidden bg-zinc-950 text-white">
                    <div className="absolute inset-0 bg-grid opacity-20" />
                    <div className="absolute -left-24 top-10 h-80 w-80 rounded-full bg-emerald-500/25 blur-3xl animate-float" />
                    <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-teal-400/20 blur-3xl animate-float" style={{ animationDelay: "-3s" }} />
                    <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-28 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[12px] font-bold text-emerald-300 animate-fade-up"><ShieldCheck className="h-3.5 w-3.5" />{tx({ TR: "Kodun ve parolan cihazından çıkmaz", EN: "Your code and password never leave your device" })}</span>
                            <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl animate-fade-up" style={{ animationDelay: "60ms" }}>Hanogt <span className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">Security</span></h1>
                            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-zinc-300 animate-fade-up" style={{ animationDelay: "120ms" }}>
                                {tx({ TR: "Kodundaki sızmış anahtarları ve açıkları bul, parolanı ölç, şüpheli bağlantıları incele. Güvenlik Danışmanı ve Security Bot her zaman yanında.", EN: "Find leaked keys and flaws in your code, measure passwords and inspect suspicious links. The Security Advisor and Security Bot are always at hand." })}
                            </p>
                            <div className="mt-7 flex flex-wrap gap-3 animate-fade-up" style={{ animationDelay: "180ms" }}>
                                <a href="#tools" onClick={() => setTool("advisor")} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-emerald-500 px-5 text-[15px] font-bold text-emerald-950 shadow-xl shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"><FlaskConical className="h-4.5 w-4.5" />{tx({ TR: "Kodumu tara", EN: "Scan my code" })}</a>
                                <button type="button" onClick={openBot} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-5 text-[15px] font-bold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/10"><Bot className="h-4.5 w-4.5" />{tx({ TR: "Security Bot'a sor", EN: "Ask Security Bot" })}</button>
                            </div>
                        </div>
                        <div className="relative hidden lg:block" aria-hidden="true">
                            <div className="relative mx-auto grid h-72 w-72 place-items-center">
                                {[0, 1, 2].map((ring) => (
                                    <motion.span key={ring} className="absolute rounded-full border border-emerald-400/30" style={{ width: `${100 - ring * 22}%`, height: `${100 - ring * 22}%` }} animate={{ scale: [1, 1.06, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity, delay: ring * 0.5 }} />
                                ))}
                                <motion.div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, rgba(16,185,129,0.35), transparent 25%)" }} animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} />
                                <div className="relative grid h-28 w-28 place-items-center rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-2xl shadow-emerald-500/40"><ShieldCheck className="h-14 w-14 text-white" /></div>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="tools" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 sm:px-6">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label={tx({ TR: "Güvenlik araçları", EN: "Security tools" })}>
                        {TOOLS.map((entry) => {
                            const active = tool === entry.id;
                            return (
                                <button
                                    key={entry.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => { setTool(entry.id); window.history.replaceState(null, "", `#${entry.id}`); }}
                                    className={`relative flex items-center gap-3 rounded-2xl border p-3.5 text-start transition ${active ? "border-emerald-500/50 bg-white shadow-lg shadow-emerald-500/10 dark:bg-zinc-900" : "border-zinc-200 bg-white/60 hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.02]"}`}
                                >
                                    {active ? <motion.span layoutId="security-tool" className="absolute inset-0 rounded-2xl ring-2 ring-emerald-500/60" transition={{ type: "spring", stiffness: 420, damping: 36 }} /> : null}
                                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white" : "bg-zinc-100 text-zinc-500 dark:bg-white/[0.06]"}`}><entry.icon className="h-5 w-5" /></span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-[14px] font-bold text-zinc-900 dark:text-white">{tx(entry.label)}</span>
                                        <span className="block truncate text-[12px] text-zinc-500">{tx(entry.hint)}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <motion.div key={tool} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mt-6" role="tabpanel">
                        {tool === "advisor" ? <CodeAdvisor /> : tool === "password" ? <PasswordLab /> : tool === "links" ? <LinkChecker /> : <SecurityChecklist />}
                    </motion.div>
                </section>

                <section className="border-y border-zinc-200/70 bg-white py-16 dark:border-white/[0.06] dark:bg-zinc-900/30">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6">
                        <h2 className="text-center text-3xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-4xl">{tx({ TR: "Platform seni nasıl koruyor?", EN: "How the platform protects you" })}</h2>
                        <p className="mx-auto mt-3 max-w-2xl text-center text-[15px] text-zinc-600 dark:text-zinc-400">{tx({ TR: "Tek bir sihirli kalkan yok; katman katman önlemler var. Hiçbiri kusursuz değildir ama birlikte riski büyük ölçüde azaltırlar.", EN: "There is no single magic shield, just layers. None is perfect, but together they cut risk dramatically." })}</p>
                        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {LAYERS.map((layer, index) => (
                                <motion.article key={layer.title.EN} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><layer.icon className="h-5 w-5" /></span>
                                    <h3 className="mt-3 text-[15px] font-black text-zinc-900 dark:text-white">{tx(layer.title)}</h3>
                                    <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(layer.text)}</p>
                                </motion.article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="mx-auto grid max-w-7xl gap-5 px-4 py-16 sm:px-6 lg:grid-cols-2">
                    <div className="rounded-3xl border border-zinc-200 bg-white p-7 dark:border-white/10 dark:bg-zinc-900/60">
                        <h2 className="flex items-center gap-2 text-2xl font-black text-zinc-900 dark:text-white"><Bug className="h-6 w-6 text-rose-500" />{tx({ TR: "Açık mı buldun?", EN: "Found a vulnerability?" })}</h2>
                        <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx({ TR: "Sorumlu bildirim sürecini izle; sana teşekkür etmekten mutluluk duyarız.", EN: "Please follow responsible disclosure; we'll be glad to thank you." })}</p>
                        <ol className="mt-4 space-y-2.5 text-[14px] text-zinc-700 dark:text-zinc-300">
                            {[
                                { TR: "Geri Bildirim sayfasından \"Güvenlik\" başlıklı bir bildirim oluştur.", EN: "Create a report titled \"Security\" on the Feedback page." },
                                { TR: "Yeniden üretme adımlarını, etkilenen sayfayı ve beklenen/gerçekleşen davranışı yaz.", EN: "Describe reproduction steps, the affected page and expected vs. actual behavior." },
                                { TR: "Gerçek parola, erişim anahtarı veya başkasına ait kişisel veri ekleme.", EN: "Don't include real passwords, access keys or other people's personal data." },
                                { TR: "Başka kullanıcıların verisine erişme, hizmeti aksatma veya veri silme.", EN: "Don't access other users' data, disrupt the service or delete data." },
                            ].map((step, index) => (
                                <li key={index} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-500/10 text-[12px] font-black text-rose-600 dark:text-rose-400">{index + 1}</span>{tx(step)}</li>
                            ))}
                        </ol>
                        <Link href="/feedback" className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-[14px] font-bold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-zinc-900"><MessageSquareWarning className="h-4 w-4" />{tx({ TR: "Güvenlik bildirimi gönder", EN: "Send a security report" })}</Link>
                    </div>
                    <div className="rounded-3xl border border-zinc-200 bg-gradient-to-br from-emerald-500/[0.08] to-teal-500/[0.08] p-7 dark:border-white/10">
                        <h2 className="flex items-center gap-2 text-2xl font-black text-zinc-900 dark:text-white"><Siren className="h-6 w-6 text-emerald-500" />{tx({ TR: "Hesabım ele geçirildi mi?", EN: "Was my account compromised?" })}</h2>
                        <ul className="mt-4 space-y-2.5 text-[14px] text-zinc-700 dark:text-zinc-300">
                            {[
                                { TR: "Hemen parolanı değiştir (Hesap Ayarları → Şifre Yönetimi). Google ile giriyorsan Google parolanı değiştir.", EN: "Change your password now (Account Settings → Password Management). If you use Google sign-in, change your Google password." },
                                { TR: "Aynı parolayı kullandığın diğer sitelerde de değiştir.", EN: "Change it on every other site where you reused it." },
                                { TR: "Projelerini, Media paylaşımlarını ve gruplarını tanımadığın değişikliklere karşı kontrol et.", EN: "Check projects, Media posts and groups for changes you don't recognize." },
                                { TR: "Geri Bildirim'den \"Güvenlik\" başlığıyla bize ulaş; hesabını birlikte güvenceye alalım.", EN: "Contact us via Feedback titled \"Security\" and we'll secure the account together." },
                            ].map((step, index) => <li key={index} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{tx(step)}</li>)}
                        </ul>
                        <button type="button" onClick={openBot} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-[14px] font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:-translate-y-0.5 hover:bg-emerald-500"><Bot className="h-4 w-4" />{tx({ TR: "Security Bot ile konuş", EN: "Talk to Security Bot" })}</button>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
