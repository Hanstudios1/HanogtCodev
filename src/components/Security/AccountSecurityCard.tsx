"use client";

import { CheckCircle2, CircleAlert, Info, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useRawSession } from "@/components/Provider";
import { openActions, securityChecks, type SecurityCheck, type SecurityCheckId } from "@/lib/account-security";
import { useI18n, type Copy } from "@/lib/i18n";
import { useAccountSecurity, type SecurityLoad } from "./account-security-store";

const C = {
    title: { TR: "Hesabının güvenliği", EN: "Your account's security" },
    good: { TR: "Hesabın iyi korunuyor", EN: "Your account is well protected" },
    improve: { TR: "Hesabını güçlendirebilirsin", EN: "You can make your account stronger" },
    suggestions: { TR: "{count} öneri", EN: "{count} suggestions" },
    suggestion: { TR: "1 öneri", EN: "1 suggestion" },
    signedOut: { TR: "Şifreni, iki adımlı doğrulamayı ve oturumlarını burada görmek için giriş yap.", EN: "Sign in to see your password, two-step verification and sessions here." },
    signIn: { TR: "Giriş yap", EN: "Sign in" },
    failed: { TR: "Güvenlik bilgilerin şu anda alınamadı.", EN: "Your security details couldn't be loaded right now." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    loading: { TR: "Güvenlik bilgilerin yükleniyor", EN: "Loading your security details" },
    private: { TR: "Bu bilgileri yalnızca sen görürsün.", EN: "Only you can see this." },
    password: { TR: "Şifre", EN: "Password" },
    passwordSet: { TR: "Ayarlı.", EN: "Set." },
    passwordSetGoogle: { TR: "Ayarlı; Google ile girişten sonra da sorulur.", EN: "Set; it's asked after a Google sign-in too." },
    passwordNone: { TR: "Yok: Google ile giriyorsun. Şifre eklersen iki adımlı doğrulamayı da açabilirsin.", EN: "None: you sign in with Google. Add one to be able to turn on two-step verification too." },
    addPassword: { TR: "Şifre ekle", EN: "Add a password" },
    twoFactor: { TR: "İki adımlı doğrulama", EN: "Two-step verification" },
    twoFactorOn: { TR: "Açık: girişte şifrenden sonra uygulamadaki kod da sorulur.", EN: "On: the code from your app is asked after your password." },
    twoFactorOff: { TR: "Kapalı. Açınca şifren ele geçse bile hesabına girilemez.", EN: "Off. Turn it on and a stolen password alone won't get anyone in." },
    twoFactorNeedsPassword: { TR: "Kapalı. Açmak için önce bir şifre ekle.", EN: "Off. Add a password first to turn it on." },
    turnOn: { TR: "Aç", EN: "Turn on" },
    recovery: { TR: "Kurtarma kodları", EN: "Recovery codes" },
    recoveryLeft: { TR: "{count} kod kaldı.", EN: "{count} codes left." },
    recoveryLow: { TR: "Yalnızca {count} kod kaldı; yenilerini oluştur.", EN: "Only {count} left; make new ones." },
    recoveryNone: { TR: "Hiç kod kalmadı; yenilerini oluştur.", EN: "None left; make new ones." },
    renew: { TR: "Yenile", EN: "Renew" },
    sessions: { TR: "Oturumlar", EN: "Sessions" },
    lastLogin: { TR: "Son giriş: {date}.", EN: "Last sign-in: {date}." },
    sessionsHint: { TR: "Tanımadığın bir cihazda açık kaldıysa diğer oturumları kapat.", EN: "If it's still open on a device you don't know, sign the other sessions out." },
    manage: { TR: "Oturumları yönet", EN: "Manage sessions" },
} satisfies Record<string, Copy>;

const SETTINGS = "/account-settings#privacy";

type Variant = "page" | "settings";

/** The Security page shows the card on its own; Account Settings shows it like its other cards (h3 title, row paddings). */
const STYLES: Record<Variant, { frame: string; head: string; title: string; body: string; list: string; item: string; foot: string }> = {
    page: {
        frame: "rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900 sm:p-6",
        head: "",
        title: "text-lg font-black text-zinc-900 dark:text-white",
        body: "mt-4",
        list: "mt-4 divide-y divide-zinc-100 dark:divide-white/[0.06]",
        item: "flex items-start gap-3 py-3 first:pt-0 last:pb-0",
        foot: "mt-4 border-t border-zinc-100 pt-3 text-[12px] text-zinc-500 dark:border-white/[0.06]",
    },
    settings: {
        frame: "rounded-2xl border border-zinc-200 bg-white dark:border-white/[0.08] dark:bg-zinc-900",
        head: "px-5 pb-3.5 pt-4 sm:px-6",
        title: "text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white",
        body: "border-t border-zinc-100 px-5 py-4 sm:px-6 dark:border-white/[0.06]",
        list: "divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-white/[0.06] dark:border-white/[0.06]",
        item: "flex items-start gap-3 px-5 py-3.5 sm:px-6",
        foot: "border-t border-zinc-100 px-5 py-3 text-[12px] text-zinc-500 sm:px-6 dark:border-white/[0.06] dark:text-zinc-400",
    },
};

function Title({ variant, children }: { variant: Variant; children: string }) {
    return variant === "settings"
        ? <h3 id="account-security-title" className={STYLES.settings.title}>{children}</h3>
        : <h2 id="account-security-title" className={STYLES.page.title}>{children}</h2>;
}

function StateIcon({ state }: { state: SecurityCheck["state"] }) {
    if (state === "ok") return <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-green" aria-hidden />;
    if (state === "action") return <CircleAlert className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />;
    return <Info className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />;
}

/**
 * The account's security at a glance (GET /api/account/security), with a
 * link to the setting behind each suggestion. Signed out: a sign-in prompt.
 */
export default function AccountSecurityCard({ onAction, variant = "page" }: {
    /** In Account Settings: go to the setting on this page instead of following the link. */
    onAction?: (check: SecurityCheckId) => void;
    variant?: Variant;
} = {}) {
    const { tx, locale } = useI18n();
    const auth = useRawSession();
    const owner = auth.status === "authenticated" ? auth.data?.user?.email ?? null : null;
    const { load, retry } = useAccountSecurity(owner);

    const shown: SecurityLoad = auth.status === "unauthenticated" ? { state: "signedOut" } : auth.status === "loading" ? { state: "loading" } : load;
    const date = (iso: string) => {
        try {
            return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
        } catch {
            return new Date(iso).toLocaleString();
        }
    };

    const style = STYLES[variant];
    const header = (extra?: ReactNode) => (
        <div className={style.head}>
            <Title variant={variant}>{tx(C.title)}</Title>
            {extra}
        </div>
    );

    if (shown.state === "signedOut") {
        return (
            <section aria-labelledby="account-security-title" className={style.frame} data-account-security="signed-out">
                {header()}
                <div className={variant === "settings" ? style.body : ""}>
                    <p className={`${variant === "settings" ? "" : "mt-2 "}text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400`}>{tx(C.signedOut)}</p>
                    <Link href="/login?callbackUrl=%2Fsecurity" className="mt-4 inline-flex h-11 items-center rounded-xl bg-zinc-900 px-5 text-[14px] font-bold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">{tx(C.signIn)}</Link>
                </div>
            </section>
        );
    }

    if (shown.state === "loading") {
        return (
            <section aria-labelledby="account-security-title" aria-busy="true" className={style.frame} data-account-security="loading">
                {header()}
                <p className="sr-only">{tx(C.loading)}</p>
                <div className={`${style.body} space-y-3`} aria-hidden>
                    {[0, 1, 2, 3].map((row) => <div key={row} className="h-12 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/[0.06]" />)}
                </div>
            </section>
        );
    }

    if (shown.state === "failed") {
        return (
            <section aria-labelledby="account-security-title" className={style.frame} data-account-security="failed">
                {header()}
                <div className={variant === "settings" ? style.body : ""}>
                    <p role="alert" className={`${variant === "settings" ? "" : "mt-2 "}text-[14px] text-zinc-600 dark:text-zinc-400`}>{tx(C.failed)}</p>
                    <button type="button" onClick={retry} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 px-4 text-[13.5px] font-bold transition hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5">
                        <RefreshCw className="h-4 w-4" aria-hidden />{tx(C.retry)}
                    </button>
                </div>
            </section>
        );
    }

    const { summary } = shown;
    const checks = securityChecks(summary);
    const open = openActions(checks);
    const row = (check: SecurityCheck): { title: Copy; detail: string; action?: Copy } => {
        switch (check.id) {
            case "password":
                return summary.hasPassword
                    ? { title: C.password, detail: tx(summary.provider === "google" ? C.passwordSetGoogle : C.passwordSet) }
                    : { title: C.password, detail: tx(C.passwordNone), action: C.addPassword };
            case "twoFactor":
                if (summary.twoFactor.enabled) return { title: C.twoFactor, detail: tx(C.twoFactorOn) };
                return { title: C.twoFactor, detail: tx(summary.hasPassword ? C.twoFactorOff : C.twoFactorNeedsPassword), action: summary.hasPassword ? C.turnOn : C.addPassword };
            case "recovery": {
                const count = summary.twoFactor.recoveryCodesLeft;
                if (check.state === "ok") return { title: C.recovery, detail: tx(C.recoveryLeft, { count }) };
                return { title: C.recovery, detail: tx(count === 0 ? C.recoveryNone : C.recoveryLow, { count }), action: C.renew };
            }
            case "sessions":
                return { title: C.sessions, detail: [summary.lastLoginAt ? tx(C.lastLogin, { date: date(summary.lastLoginAt) }) : "", tx(C.sessionsHint)].filter(Boolean).join(" "), action: C.manage };
        }
    };
    // Account Settings uses its own accent for the suggested step; the Security page keeps its dark buttons.
    const actionTone = (check: SecurityCheck) => check.state === "action"
        ? (variant === "settings" ? "bg-indigo-600 text-white hover:bg-indigo-500" : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200")
        : (variant === "settings" ? "text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400" : "text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300");
    const actionClass = (check: SecurityCheck) => `shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${actionTone(check)}`;

    return (
        <section aria-labelledby="account-security-title" className={style.frame} data-account-security="ready" data-open-actions={open}>
            {header(
                <p className={`mt-1 flex flex-wrap items-center gap-2 ${variant === "settings" ? "text-[13px]" : "text-[14px]"} font-bold ${open === 0 ? "text-brand-green" : "text-amber-700 dark:text-amber-300"}`}>
                    {open === 0 ? tx(C.good) : <>{tx(C.improve)}<span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11.5px]">{open === 1 ? tx(C.suggestion) : tx(C.suggestions, { count: open })}</span></>}
                </p>,
            )}
            <ul className={style.list}>
                {checks.map((check) => {
                    const { title, detail, action } = row(check);
                    return (
                        <li key={check.id} className={style.item} data-security-check={check.id} data-state={check.state}>
                            <StateIcon state={check.state} />
                            <div className="min-w-0 flex-1">
                                <p className="text-[14px] font-bold text-zinc-900 dark:text-white">{tx(title)}</p>
                                <p className="mt-0.5 text-[13px] leading-snug text-zinc-600 dark:text-zinc-400">{detail}</p>
                            </div>
                            {action ? (
                                onAction ? (
                                    <button type="button" onClick={() => onAction(check.id)} className={actionClass(check)} data-security-action={check.id}>
                                        {tx(action)}
                                    </button>
                                ) : (
                                    <Link href={SETTINGS} className={actionClass(check)}>
                                        {tx(action)}
                                    </Link>
                                )
                            ) : null}
                        </li>
                    );
                })}
            </ul>
            <p className={style.foot}>{tx(C.private)}</p>
        </section>
    );
}
