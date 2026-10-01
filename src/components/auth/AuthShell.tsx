"use client";

import Link from "next/link";
import { ArrowLeft, Code2, Gamepad2, ShieldCheck, Users } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import ThemeToggle from "@/components/ThemeToggle";
import LangToggle from "@/components/LangToggle";
import { formatCopy, useI18n } from "@/lib/i18n";
import { LANGUAGE_STATS } from "@/lib/runtimes/languages";

type Props = {
    title: string;
    subtitle: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
};

export default function AuthShell({ title, subtitle, children, footer }: Props) {
    const { t } = useI18n();
    const features = [
        { icon: Code2, title: formatCopy(t("auth_feature_code"), { count: LANGUAGE_STATS.usable }), color: "from-sky-400 to-indigo-500" },
        { icon: Gamepad2, title: t("auth_feature_engine") || "C# ve C++ ile gerçek zamanlı 2D/3D oyunlar yap", color: "from-fuchsia-400 to-violet-500" },
        { icon: Users, title: t("auth_feature_community") || "Arcade ve Media'da paylaş, arkadaşlarınla üret", color: "from-emerald-400 to-teal-500" },
    ];

    return (
        <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-[1.05fr_1fr]">
            <aside className="relative hidden overflow-hidden bg-zinc-950 p-12 text-white lg:flex lg:flex-col">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,.45),transparent_45%),radial-gradient(circle_at_85%_70%,rgba(236,72,153,.32),transparent_45%),radial-gradient(circle_at_60%_10%,rgba(14,165,233,.28),transparent_40%)]" aria-hidden="true" />
                <div className="absolute inset-0 bg-grid opacity-40 mask-fade-b" aria-hidden="true" />
                <Link href="/" className="relative flex items-center gap-3">
                    <OptimizedImage src="/logo-dark.png" alt="" className="h-11 w-11 object-contain" priority />
                    <span className="text-lg font-bold tracking-tight">Hanogt Codev</span>
                </Link>
                <div className="relative mt-auto max-w-md">
                    <h2 className="text-4xl font-black leading-tight tracking-tight">{t("auth_brand_title") || "Kodla. Oyun yap. Paylaş."}</h2>
                    <p className="mt-4 text-base leading-7 text-zinc-300">{t("auth_brand_subtitle") || "Kurulum gerektirmeyen editör, tarayıcıda çalışan oyun motoru ve üreten bir topluluk tek hesapta."}</p>
                    <ul className="mt-10 space-y-4">
                        {features.map(({ icon: Icon, title: featureTitle, color }) => (
                            <li key={featureTitle} className="flex items-center gap-4">
                                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${color} shadow-lg`}><Icon className="h-5 w-5" /></span>
                                <span className="text-sm font-medium text-zinc-200">{featureTitle}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="relative mt-12 flex items-center gap-2 text-xs text-zinc-400"><ShieldCheck className="h-4 w-4 text-emerald-400" />{t("protected_by_hanogt_bot") || "Hanogt Security Bot ile korunuyor"}</p>
            </aside>

            <main id="main-content" className="relative flex flex-col px-5 py-6 sm:px-10">
                <div className="flex items-center justify-between">
                    <Link href="/" className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-900 dark:hover:text-white"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t("auth_back_home") || "Ana sayfa"}</Link>
                    <div className="flex items-center gap-1"><LangToggle /><ThemeToggle /></div>
                </div>
                <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
                    <Link href="/" className="mb-8 flex items-center gap-3 lg:hidden">
                        <OptimizedImage src="/logo-light.png" alt="" className="h-10 w-10 object-contain dark:hidden" priority />
                        <OptimizedImage src="/logo-dark.png" alt="" className="hidden h-10 w-10 object-contain dark:block" priority />
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
        <div className="my-6 flex items-center gap-4 text-xs font-medium uppercase tracking-wider text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />{label}<span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>
    );
}

export const inputClass = "h-12 w-full rounded-2xl border border-zinc-200 bg-white ps-11 pe-4 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white";
