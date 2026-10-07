"use client";

import { KeyRound, LoaderCircle, RefreshCw } from "lucide-react";
import { useRawSession } from "@/components/Provider";
import { useI18n, type Copy } from "@/lib/i18n";
import type { LoginRecord } from "@/lib/login-history";
import { useAccountSecurity } from "./account-security-store";

const C = {
    title: { TR: "Son girişler", EN: "Recent sign-ins" },
    hint: { TR: "Hesabınıza yapılan son {count} giriş. Tanımadığınız bir giriş görürseniz şifrenizi değiştirin ve diğer oturumları kapatın.", EN: "The last {count} sign-ins to your account. If you see one you don't recognise, change your password and sign the other sessions out." },
    none: { TR: "Henüz kayıtlı bir giriş yok; bir sonraki girişinizden itibaren burada listelenir.", EN: "No sign-ins recorded yet; they're listed here from your next sign-in." },
    failed: { TR: "Girişler şu anda alınamadı.", EN: "Sign-ins couldn't be loaded right now." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    password: { TR: "Şifreyle", EN: "With a password" },
    google: { TR: "Google ile", EN: "With Google" },
    unknownDevice: { TR: "Bilinmeyen cihaz", EN: "Unknown device" },
    latest: { TR: "En son", EN: "Latest" },
    privacy: { TR: "IP adresiniz saklanmaz; yalnızca ülke ve tarayıcı türü tutulur.", EN: "Your IP address isn't stored; only the country and the kind of browser are." },
} satisfies Record<string, Copy>;

function GoogleMark() {
    return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
            <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
        </svg>
    );
}

function when(iso: string, locale: string) {
    try {
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
    } catch {
        return new Date(iso).toLocaleString();
    }
}

function countryName(code: string, locale: string) {
    try {
        return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
    } catch {
        return code;
    }
}

/** The account's last sign-ins (when, how, device family, country), from the shared security summary. */
export default function RecentSignIns({ className = "" }: { className?: string } = {}) {
    const { tx, locale } = useI18n();
    const auth = useRawSession();
    const owner = auth.status === "authenticated" ? auth.data?.user?.email ?? null : null;
    const { load, retry } = useAccountSecurity(owner);

    if (load.state === "signedOut") return null;
    const history: LoginRecord[] = load.state === "ready" ? load.summary.loginHistory : [];

    return (
        <div className={className} data-recent-sign-ins={load.state}>
            <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{tx(C.title)}</p>
            {load.state === "loading" ? (
                <p className="mt-2 inline-flex items-center gap-2 text-[13px] text-zinc-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /></p>
            ) : load.state === "failed" ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400" role="alert">
                    {tx(C.failed)}
                    <button type="button" onClick={retry} className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline dark:text-indigo-400"><RefreshCw className="h-3.5 w-3.5" aria-hidden />{tx(C.retry)}</button>
                </p>
            ) : history.length ? (
                <>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(C.hint, { count: history.length })}</p>
                    <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
                        {history.map((record, index) => (
                            <li key={`${record.at}-${index}`} className="flex items-center gap-3 px-3 py-2.5" data-sign-in={record.method}>
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
                                    {record.method === "google" ? <GoogleMark /> : <KeyRound className="h-4 w-4" aria-hidden />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-semibold text-zinc-900 dark:text-white">{record.device || tx(C.unknownDevice)}</span>
                                    <span className="block truncate text-[12px] text-zinc-500">
                                        {[tx(record.method === "google" ? C.google : C.password), record.country ? countryName(record.country, locale) : ""].filter(Boolean).join(" · ")}
                                    </span>
                                </span>
                                <span className="shrink-0 text-end text-[12px] text-zinc-500">
                                    {index === 0 ? <span className="block font-semibold text-brand-green">{tx(C.latest)}</span> : null}
                                    <time dateTime={record.at}>{when(record.at, locale)}</time>
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-[11.5px] text-zinc-500 dark:text-zinc-400">{tx(C.privacy)}</p>
                </>
            ) : (
                <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">{tx(C.none)}</p>
            )}
        </div>
    );
}
