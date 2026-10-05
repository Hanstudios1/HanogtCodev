"use client";

import { CheckCircle2, CircleAlert, Info, RefreshCw } from "lucide-react";
import Link from "next/link";
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


function StateIcon({ state }: { state: SecurityCheck["state"] }) {
    if (state === "ok") return <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-green" aria-hidden />;
    if (state === "action") return <CircleAlert className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />;
    return <Info className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />;
}

/**
 * The account's security at a glance (GET /api/account/security), with a
 * link to the setting behind each suggestion. Signed out: a sign-in prompt.
 */
export default function AccountSecurityCard({ onAction }: {
    /** In Account Settings: go to the setting on this page instead of following the link. */
    onAction?: (check: SecurityCheckId) => void;
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

    const frame = "rounded-3xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900 sm:p-6";

    if (shown.state === "signedOut") {
        return (
            <section aria-labelledby="account-security-title" className={frame} data-account-security="signed-out">
                <h2 id="account-security-title" className="text-lg font-black text-zinc-900 dark:text-white">{tx(C.title)}</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.signedOut)}</p>
                <Link href="/login?callbackUrl=%2Fsecurity" className="mt-4 inline-flex h-11 items-center rounded-xl bg-zinc-900 px-5 text-[14px] font-bold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">{tx(C.signIn)}</Link>
            </section>
        );
    }

    if (shown.state === "loading") {
        return (
            <section aria-labelledby="account-security-title" aria-busy="true" className={frame} data-account-security="loading">
                <h2 id="account-security-title" className="text-lg font-black text-zinc-900 dark:text-white">{tx(C.title)}</h2>
                <p className="sr-only">{tx(C.loading)}</p>
                <div className="mt-4 space-y-3" aria-hidden>
                    {[0, 1, 2, 3].map((row) => <div key={row} className="h-12 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/[0.06]" />)}
                </div>
            </section>
        );
    }

    if (shown.state === "failed") {
        return (
            <section aria-labelledby="account-security-title" className={frame} data-account-security="failed">
                <h2 id="account-security-title" className="text-lg font-black text-zinc-900 dark:text-white">{tx(C.title)}</h2>
                <p role="alert" className="mt-2 text-[14px] text-zinc-600 dark:text-zinc-400">{tx(C.failed)}</p>
                <button type="button" onClick={retry} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 px-4 text-[13.5px] font-bold transition hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5">
                    <RefreshCw className="h-4 w-4" aria-hidden />{tx(C.retry)}
                </button>
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

    return (
        <section aria-labelledby="account-security-title" className={frame} data-account-security="ready" data-open-actions={open}>
            <h2 id="account-security-title" className="text-lg font-black text-zinc-900 dark:text-white">{tx(C.title)}</h2>
            <p className={`mt-1 flex items-center gap-2 text-[14px] font-bold ${open === 0 ? "text-brand-green" : "text-amber-700 dark:text-amber-300"}`}>
                {open === 0 ? tx(C.good) : <>{tx(C.improve)}<span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11.5px]">{open === 1 ? tx(C.suggestion) : tx(C.suggestions, { count: open })}</span></>}
            </p>
            <ul className="mt-4 divide-y divide-zinc-100 dark:divide-white/[0.06]">
                {checks.map((check) => {
                    const { title, detail, action } = row(check);
                    return (
                        <li key={check.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0" data-security-check={check.id} data-state={check.state}>
                            <StateIcon state={check.state} />
                            <div className="min-w-0 flex-1">
                                <p className="text-[14px] font-bold text-zinc-900 dark:text-white">{tx(title)}</p>
                                <p className="mt-0.5 text-[13px] leading-snug text-zinc-600 dark:text-zinc-400">{detail}</p>
                            </div>
                            {action ? (
                                onAction ? (
                                    <button type="button" onClick={() => onAction(check.id)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold transition ${check.state === "action" ? "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200" : "text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"}`} data-security-action={check.id}>
                                        {tx(action)}
                                    </button>
                                ) : (
                                    <Link href={SETTINGS} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold transition ${check.state === "action" ? "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200" : "text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"}`}>
                                        {tx(action)}
                                    </Link>
                                )
                            ) : null}
                        </li>
                    );
                })}
            </ul>
            <p className="mt-4 border-t border-zinc-100 pt-3 text-[12px] text-zinc-500 dark:border-white/[0.06]">{tx(C.private)}</p>
        </section>
    );
}
