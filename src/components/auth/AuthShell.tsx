"use client";

import Link from "next/link";
import { ArrowLeft, Bot, Boxes, Code2, FileCheck2, Languages, LifeBuoy, ShieldCheck, UsersRound, type LucideIcon } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import ProductLogo from "@/components/ProductLogo";
import { logoSrc } from "@/lib/products";
import ThemeToggle from "@/components/ThemeToggle";
import LangToggle from "@/components/LangToggle";
import { LANGUAGES, formatCopy, useI18n, type Copy } from "@/lib/i18n";
import { LEGAL_VERSION } from "@/lib/legal";
import { LANGUAGE_STATS } from "@/lib/runtimes/languages";

type Props = {
    title: string;
    subtitle: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
};

const C = {
    brandText: {
        TR: "Kod editörü, Hanogt Engine V3, Hanogt AI ve topluluk: hepsi tek hesapta, kurulum yok.",
        EN: "Code editor, Hanogt Engine V3, Hanogt AI and the community: all in one account, nothing to install.",
    },
    codeText: {
        TR: "Tarayıcıda, kurulum olmadan. JavaScript, Python, SQL ve Lua anında çalışır.",
        EN: "In your browser, nothing to install. JavaScript, Python, SQL and Lua run instantly.",
    },
    engineTitle: { TR: "Hanogt Engine V3 ile oyun yap", EN: "Build games with Hanogt Engine V3" },
    engineText: {
        TR: "Tilemap, arayüz bileşenleri ve animasyon. C# ve C++ ile script yaz, Arcade'de yayınla.",
        EN: "Tilemaps, UI components and animation. Script in C# and C++, then publish to Arcade.",
    },
    aiTitle: { TR: "Hanogt AI yanında", EN: "Hanogt AI by your side" },
    aiText: {
        TR: "Kod, oyun ve güvenlik sorularını yanıtlar. Ajan modu yalnızca senin izninle işlem yapar.",
        EN: "Answers your code, game and security questions. Agent mode only acts with your permission.",
    },
    socialTitle: { TR: "Hanogt Social", EN: "Hanogt Social" },
    socialText: {
        TR: "Arkadaşlar, gruplar ve mesajlar tek yerde. Şimdi yayına alınıyor.",
        EN: "Friends, groups and messages in one place. Launching now.",
    },
    support: { TR: "Destek talepleri", EN: "Support tickets" },
    legal: { TR: "Yasal metinler v{version}", EN: "Legal texts v{version}" },
    protection: {
        TR: "İki adımlı doğrulama ve çok katmanlı güvenlikle korunur",
        EN: "Protected by two-step verification and layered security",
    },
} satisfies Record<string, Copy>;

type Feature = { icon: LucideIcon; color: string; title: string; text: string; badge?: string };

export default function AuthShell({ title, subtitle, children, footer }: Props) {
    const { t, tx } = useI18n();
    const features: Feature[] = [
        { icon: Code2, color: "from-sky-400 to-indigo-500", title: formatCopy(t("auth_feature_code"), { count: LANGUAGE_STATS.usable }), text: tx(C.codeText) },
        { icon: Boxes, color: "from-fuchsia-400 to-violet-500", title: tx(C.engineTitle), text: tx(C.engineText) },
        { icon: Bot, color: "from-amber-400 to-orange-500", title: tx(C.aiTitle), text: tx(C.aiText) },
        { icon: UsersRound, color: "from-emerald-400 to-teal-500", title: tx(C.socialTitle), text: tx(C.socialText), badge: t("lp_new") },
    ];
    const facts: Array<{ icon: LucideIcon; label: string }> = [
        { icon: Languages, label: formatCopy(t("lp_ui_languages"), { count: LANGUAGES.length }) },
        { icon: LifeBuoy, label: tx(C.support) },
        { icon: FileCheck2, label: tx(C.legal, { version: LEGAL_VERSION }) },
    ];

    return (
        <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-[1.05fr_1fr]">
            <aside className="scrollbar-thin relative hidden overflow-y-auto overflow-x-hidden bg-zinc-950 p-10 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:self-start xl:p-12 [@media(max-height:760px)]:py-7">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,.45),transparent_45%),radial-gradient(circle_at_85%_70%,rgba(236,72,153,.32),transparent_45%),radial-gradient(circle_at_60%_10%,rgba(14,165,233,.28),transparent_40%)]" aria-hidden="true" />
                <div className="absolute inset-0 bg-grid opacity-40 mask-fade-b" aria-hidden="true" />
                <Link href="/" className="relative flex items-center gap-3">
                    <OptimizedImage src={logoSrc("hanogt", 44, "dark")} alt="" width={44} height={44} className="h-11 w-11 object-contain" priority />
                    <span className="text-lg font-bold tracking-tight">Hanogt Codev</span>
                </Link>
                <div className="relative mt-auto max-w-md pt-10 [@media(max-height:760px)]:pt-4">
                    <h2 className="text-3xl font-black leading-tight tracking-tight xl:text-4xl">{t("auth_brand_title") || "Kodla. Oyun yap. Paylaş."}</h2>
                    <p className="mt-3 text-[15px] leading-6 text-zinc-300 [@media(max-height:760px)]:hidden">{tx(C.brandText)}</p>
                    <ul className="mt-7 space-y-3.5 [@media(max-height:760px)]:mt-5">
                        {features.map(({ icon: Icon, title: featureTitle, text, color, badge }) => (
                            <li key={featureTitle} className="flex items-start gap-4">
                                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${color} shadow-lg`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                                <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                                        {featureTitle}
                                        {badge ? <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wide text-emerald-300">{badge}</span> : null}
                                    </p>
                                    <p className="mt-0.5 text-[13px] leading-[1.15rem] text-zinc-300">{text}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <ul className="mt-6 flex flex-wrap gap-2">
                        {facts.map(({ icon: Icon, label }) => (
                            <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-zinc-200">
                                <Icon className="h-3.5 w-3.5 text-zinc-300" aria-hidden="true" />{label}
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="relative mt-8 flex items-center gap-2 text-xs text-zinc-400 [@media(max-height:760px)]:mt-5"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />{tx(C.protection)}</p>
            </aside>

            <main id="main-content" className="relative flex flex-col px-5 py-6 sm:px-10">
                <div className="flex items-center justify-between">
                    <Link href="/" className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-900 dark:hover:text-white"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t("auth_back_home") || "Ana sayfa"}</Link>
                    <div className="flex items-center gap-1"><LangToggle /><ThemeToggle /></div>
                </div>
                <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
                    <Link href="/" className="mb-8 flex items-center gap-3 lg:hidden">
                        <ProductLogo product="hanogt" size={40} priority />
                        <span className="text-lg font-bold">Hanogt Codev</span>
                    </Link>
                    <h1 className="text-3xl font-black tracking-tight">{title}</h1>
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
                    <div className="mt-8">{children}</div>
                    {footer && <div className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{footer}</div>}
                </div>
            </main>
        </div>
    );
}

export function GoogleButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-900 shadow-sm transition hover:-translate-y-px hover:shadow-md disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white">
            <OptimizedImage src="/google-logo.png" alt="" className="h-5 w-5" />
            {label}
        </button>
    );
}

export function Divider({ label }: { label: string }) {
    return (
        <div className="my-6 flex items-center gap-4 text-xs font-medium uppercase tracking-wider text-zinc-500">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />{label}<span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>
    );
}

/** "By continuing you accept…" with links to the legal texts and the version the visitor is agreeing to. */
export function LegalNotice() {
    const { t } = useI18n();
    return (
        <p className="mt-6 text-center text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {t("auth_terms_notice") || "Devam ederek Kullanım Şartları ve Gizlilik Politikası'nı kabul etmiş olursunuz."}{" "}
            <Link href="/terms-of-use" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">{t("terms_of_use") || "Kullanım Şartları"}</Link>
            {" · "}
            <Link href="/privacy-policy" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">{t("privacy_policy") || "Gizlilik Politikası"}</Link>
            {" · "}
            <span dir="ltr" className="whitespace-nowrap">v{LEGAL_VERSION}</span>
        </p>
    );
}

export const inputClass = "h-12 w-full rounded-2xl border border-zinc-200 bg-white ps-11 pe-4 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white";
