"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy as CopyIcon, Download, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Status = { enabled: boolean; hasPassword: boolean; recoveryCodesLeft: number; enabledAt: string | null };
type Setup = { secret: string; uri: string; qr: string };
type Phase = "idle" | "password" | "scan" | "codes" | "disable" | "regenerate";
type ApiResult = Partial<Status> & Partial<Setup> & { recoveryCodes?: string[]; code?: string; error?: string };

const inputClass = "w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-700 dark:bg-zinc-800";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60";
const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800";

/** Groups the base32 secret in fours so it can be typed into an app by hand. */
function groupSecret(secret: string) {
    return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Two-step verification (TOTP authenticator apps + one-time recovery codes)
 * for e-mail/password sign-in. Everything secret stays on the server; the
 * recovery codes are shown exactly once after enabling or regenerating.
 */
export default function TwoFactorSettings() {
    const { tx, locale } = useI18n();
    const [status, setStatus] = useState<Status | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [phase, setPhase] = useState<Phase>("idle");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [setup, setSetup] = useState<Setup | null>(null);
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState<"secret" | "codes" | null>(null);
    const [savedCodes, setSavedCodes] = useState(false);

    const describe = useCallback((errorCode: string | undefined) => {
        switch (errorCode) {
            case "wrong_password": return tx({ TR: "Şifre yanlış.", EN: "Wrong password." });
            case "invalid_code": return tx({ TR: "Kod geçersiz, süresi dolmuş ya da zaten kullanılmış. Uygulamadaki güncel kodu girin.", EN: "The code is invalid, expired or already used. Enter the current code from your app." });
            case "setup_expired": return tx({ TR: "Kurulumun süresi doldu (15 dakika). Baştan başlayın.", EN: "Setup expired (15 minutes). Start again." });
            case "rate_limited": return tx({ TR: "Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin.", EN: "Too many attempts. Try again in 15 minutes." });
            case "no_password": return tx({ TR: "İki adımlı doğrulama, e-posta ve şifreyle girişi korur. Önce yukarıdan bir şifre oluşturun.", EN: "Two-step verification protects e-mail and password sign-in. Create a password above first." });
            case "already_enabled": return tx({ TR: "İki adımlı doğrulama zaten açık.", EN: "Two-step verification is already on." });
            case "not_enabled": return tx({ TR: "İki adımlı doğrulama kapalı.", EN: "Two-step verification is off." });
            case "conflict": return tx({ TR: "Ayar başka bir oturumda değişti. Sayfayı yenileyin.", EN: "The setting changed in another session. Reload the page." });
            case "session": return tx({ TR: "Oturumunuz sona erdi. Tekrar giriş yapın.", EN: "Your session ended. Sign in again." });
            default: return tx({ TR: "İşlem tamamlanamadı. Lütfen tekrar deneyin.", EN: "Something went wrong. Please try again." });
        }
    }, [tx]);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/account/2fa", { cache: "no-store", credentials: "same-origin" })
            .then(async (response) => {
                if (!response.ok) throw new Error(String(response.status));
                return response.json() as Promise<Status>;
            })
            .then((data) => { if (!cancelled) setStatus(data); })
            .catch(() => { if (!cancelled) setLoadFailed(true); });
        return () => { cancelled = true; };
    }, []);

    const call = async (action: string, fields: Record<string, string> = {}) => {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch("/api/account/2fa", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...fields }),
            });
            const data = await response.json().catch(() => ({})) as ApiResult;
            if (!response.ok) {
                setError(describe(data.code));
                return null;
            }
            if (typeof data.enabled === "boolean") {
                setStatus({
                    enabled: data.enabled,
                    hasPassword: Boolean(data.hasPassword),
                    recoveryCodesLeft: Number(data.recoveryCodesLeft || 0),
                    enabledAt: data.enabledAt ?? null,
                });
            }
            return data;
        } catch {
            setError(describe(undefined));
            return null;
        } finally {
            setBusy(false);
        }
    };

    const reset = () => {
        setPhase("idle");
        setPassword("");
        setCode("");
        setSetup(null);
        setError(null);
    };

    const startSetup = async (event: React.FormEvent) => {
        event.preventDefault();
        const data = await call("setup", { password });
        if (data?.secret && data.uri && data.qr) {
            setSetup({ secret: data.secret, uri: data.uri, qr: data.qr });
            setPassword("");
            setCode("");
            setPhase("scan");
        }
    };

    const confirmSetup = async (event: React.FormEvent) => {
        event.preventDefault();
        const data = await call("enable", { code });
        if (data?.recoveryCodes) {
            setRecoveryCodes(data.recoveryCodes);
            setSavedCodes(false);
            setSetup(null);
            setCode("");
            setPhase("codes");
        }
    };

    const disable = async (event: React.FormEvent) => {
        event.preventDefault();
        const data = await call("disable", { password, code });
        if (data) reset();
    };

    const regenerate = async (event: React.FormEvent) => {
        event.preventDefault();
        const data = await call("regenerate", { code });
        if (data?.recoveryCodes) {
            setRecoveryCodes(data.recoveryCodes);
            setSavedCodes(false);
            setCode("");
            setPhase("codes");
        }
    };

    const copy = async (text: string, what: "secret" | "codes") => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(what);
            window.setTimeout(() => setCopied(null), 1600);
        } catch {
            // Clipboard can be blocked; the text stays selectable.
        }
    };

    const downloadCodes = () => {
        if (!recoveryCodes) return;
        const text = [
            tx({ TR: "Hanogt Codev — iki adımlı doğrulama kurtarma kodları", EN: "Hanogt Codev — two-step verification recovery codes" }),
            new Date().toLocaleString(locale),
            "",
            ...recoveryCodes,
            "",
            tx({ TR: "Her kod yalnızca bir kez kullanılabilir. Bu dosyayı güvenli bir yerde saklayın.", EN: "Each code can be used once. Keep this file somewhere safe." }),
        ].join("\n");
        const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "hanogt-recovery-codes.txt";
        link.click();
        URL.revokeObjectURL(url);
        setSavedCodes(true);
    };

    const codeInput = (allowRecovery: boolean) => (
        <input
            value={code}
            onChange={(event) => setCode(allowRecovery ? event.target.value.toUpperCase().slice(0, 20) : event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
            inputMode={allowRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            dir="ltr"
            required
            placeholder={allowRecovery ? tx({ TR: "123456 veya kurtarma kodu", EN: "123456 or a recovery code" }) : "123456"}
            aria-label={tx({ TR: "Doğrulama kodu", EN: "Verification code" })}
            className={`${inputClass} font-mono tracking-[0.2em]`}
        />
    );

    if (loadFailed) {
        return <p className="text-sm text-zinc-500">{tx({ TR: "İki adımlı doğrulama durumu yüklenemedi. Sayfayı yenileyin.", EN: "Couldn't load the two-step verification status. Reload the page." })}</p>;
    }
    if (!status) {
        return <div className="flex items-center gap-2 text-sm text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" /> {tx({ TR: "Yükleniyor…", EN: "Loading…" })}</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${status.enabled ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>
                        {status.enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
                    </span>
                    <div>
                        <p className="font-semibold">
                            {tx({ TR: "İki adımlı doğrulama", EN: "Two-step verification" })}
                            <span className={`ms-2 rounded-full px-2 py-0.5 text-xs font-bold ${status.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                                {status.enabled ? tx({ TR: "Açık", EN: "On" }) : tx({ TR: "Kapalı", EN: "Off" })}
                            </span>
                        </p>
                        <p className="mt-0.5 max-w-xl text-sm text-zinc-500">
                            {status.enabled
                                ? tx({ TR: "E-posta ve şifreyle girişte doğrulama uygulamanızdaki kod da istenir. Kalan kurtarma kodu: {count}.", EN: "Signing in with e-mail and password also asks for the code from your authenticator app. Recovery codes left: {count}." }, { count: status.recoveryCodesLeft })
                                : tx({ TR: "Şifreniz çalınsa bile hesabınızı korur: girişte telefonunuzdaki doğrulama uygulamasının ürettiği 6 haneli kod da istenir.", EN: "Protects your account even if your password leaks: signing in also needs the 6-digit code generated by an authenticator app on your phone." })}
                        </p>
                        <p className="mt-1 text-xs text-zinc-400">{tx({ TR: "Google ile girişler Google hesabınızın kendi doğrulamasıyla korunur.", EN: "Google sign-ins are protected by your Google account's own verification." })}</p>
                    </div>
                </div>
                {phase === "idle" && (
                    status.enabled ? (
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={secondaryButton} onClick={() => { setPhase("regenerate"); setError(null); }}>
                                <RefreshCw className="h-4 w-4" /> {tx({ TR: "Yeni kurtarma kodları", EN: "New recovery codes" })}
                            </button>
                            <button type="button" className={`${secondaryButton} text-red-600 dark:text-red-400`} onClick={() => { setPhase("disable"); setError(null); }}>
                                {tx({ TR: "Kapat", EN: "Turn off" })}
                            </button>
                        </div>
                    ) : (
                        <button type="button" className={primaryButton} disabled={!status.hasPassword} onClick={() => { setPhase("password"); setError(null); }}>
                            <Smartphone className="h-4 w-4" /> {tx({ TR: "Kur", EN: "Set up" })}
                        </button>
                    )
                )}
            </div>

            {!status.enabled && !status.hasPassword && phase === "idle" && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{describe("no_password")}</p>
            )}
            {status.enabled && status.recoveryCodesLeft <= 3 && phase === "idle" && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {tx({ TR: "Kurtarma kodlarınız azaldı. Telefonunuzu kaybederseniz hesabınıza erişebilmek için yeni kodlar oluşturun.", EN: "You are running low on recovery codes. Generate new ones so you can still get in if you lose your phone." })}
                </p>
            )}

            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

            {phase === "password" && (
                <form onSubmit={startSetup} className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <p className="text-sm font-semibold">{tx({ TR: "1/3 · Kimliğinizi doğrulayın", EN: "1/3 · Confirm it's you" })}</p>
                    <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder={tx({ TR: "Mevcut şifreniz", EN: "Your current password" })} className={inputClass} />
                    <div className="flex gap-2">
                        <button type="submit" className={primaryButton} disabled={busy || !password}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}{tx({ TR: "Devam", EN: "Continue" })}</button>
                        <button type="button" className={secondaryButton} onClick={reset}>{tx({ TR: "Vazgeç", EN: "Cancel" })}</button>
                    </div>
                </form>
            )}

            {phase === "scan" && setup && (
                <form onSubmit={confirmSetup} className="space-y-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <p className="text-sm font-semibold">{tx({ TR: "2/3 · QR kodu doğrulama uygulamanızla tarayın", EN: "2/3 · Scan the QR code with your authenticator app" })}</p>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        {/* eslint-disable-next-line @next/next/no-img-element -- server-generated SVG as a data URL */}
                        <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qr)}`} alt={tx({ TR: "Doğrulama uygulaması için QR kodu", EN: "QR code for the authenticator app" })} width={176} height={176} className="h-44 w-44 shrink-0 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-700" />
                        <div className="min-w-0 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                            <p>{tx({ TR: "Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden gibi bir uygulamada “hesap ekle”ye dokunup kodu tarayın.", EN: "In an app such as Google Authenticator, Microsoft Authenticator, Authy, 1Password or Bitwarden, tap “add account” and scan the code." })}</p>
                            <p className="text-xs text-zinc-500">{tx({ TR: "Tarayamıyor musunuz? Bu anahtarı elle girin (zamana dayalı, 6 hane):", EN: "Can't scan? Enter this key manually (time-based, 6 digits):" })}</p>
                            <div className="flex items-center gap-2">
                                <code dir="ltr" className="select-all break-all rounded-lg bg-zinc-100 px-2 py-1 font-mono text-xs dark:bg-zinc-800">{groupSecret(setup.secret)}</code>
                                <button type="button" onClick={() => void copy(setup.secret, "secret")} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label={tx({ TR: "Anahtarı kopyala", EN: "Copy key" })}>
                                    {copied === "secret" ? <Check className="h-4 w-4 text-emerald-500" /> : <CopyIcon className="h-4 w-4" />}
                                </button>
                            </div>
                            <a href={setup.uri} className="inline-block text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{tx({ TR: "Bu cihazdaki uygulamada aç", EN: "Open in an app on this device" })}</a>
                        </div>
                    </div>
                    <div>
                        <p className="mb-2 text-sm font-semibold">{tx({ TR: "3/3 · Uygulamanın gösterdiği 6 haneli kodu girin", EN: "3/3 · Enter the 6-digit code shown in the app" })}</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <div className="sm:w-48">{codeInput(false)}</div>
                            <button type="submit" className={primaryButton} disabled={busy || code.length !== 6}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}{tx({ TR: "Doğrula ve aç", EN: "Verify and turn on" })}</button>
                            <button type="button" className={secondaryButton} onClick={reset}>{tx({ TR: "Vazgeç", EN: "Cancel" })}</button>
                        </div>
                    </div>
                </form>
            )}

            {phase === "codes" && recoveryCodes && (
                <div className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                    <p className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300"><KeyRound className="h-4 w-4" /> {tx({ TR: "Kurtarma kodlarınızı kaydedin", EN: "Save your recovery codes" })}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">{tx({ TR: "Telefonunuza erişemezseniz bu kodlarla giriş yapabilirsiniz. Her kod bir kez çalışır ve bir daha gösterilmez.", EN: "If you can't reach your phone, you can sign in with these codes. Each works once and won't be shown again." })}</p>
                    <ol dir="ltr" className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-5">
                        {recoveryCodes.map((item) => <li key={item} className="rounded-lg bg-white px-2 py-1.5 text-center shadow-sm dark:bg-zinc-900">{item}</li>)}
                    </ol>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={secondaryButton} onClick={downloadCodes}><Download className="h-4 w-4" /> {tx({ TR: "İndir (.txt)", EN: "Download (.txt)" })}</button>
                        <button type="button" className={secondaryButton} onClick={() => { void copy(recoveryCodes.join("\n"), "codes"); setSavedCodes(true); }}>
                            {copied === "codes" ? <Check className="h-4 w-4 text-emerald-500" /> : <CopyIcon className="h-4 w-4" />} {tx({ TR: "Kopyala", EN: "Copy" })}
                        </button>
                        <button type="button" className={primaryButton} disabled={!savedCodes} onClick={() => { setRecoveryCodes(null); reset(); }}>{tx({ TR: "Kaydettim, bitir", EN: "I saved them, done" })}</button>
                    </div>
                </div>
            )}

            {phase === "disable" && (
                <form onSubmit={disable} className="space-y-3 rounded-2xl border border-red-200 p-4 dark:border-red-900/50">
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">{tx({ TR: "İki adımlı doğrulamayı kapat", EN: "Turn off two-step verification" })}</p>
                    <p className="text-sm text-zinc-500">{tx({ TR: "Kapatmak hesabınızı daha az güvenli yapar. Onaylamak için şifrenizi ve doğrulama kodunu (ya da bir kurtarma kodunu) girin.", EN: "Turning it off makes your account less secure. Confirm with your password and an authenticator code (or a recovery code)." })}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {status.hasPassword && <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder={tx({ TR: "Mevcut şifreniz", EN: "Your current password" })} className={inputClass} />}
                        {codeInput(true)}
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60" disabled={busy || !code || (status.hasPassword && !password)}>
                            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}{tx({ TR: "Kapat", EN: "Turn off" })}
                        </button>
                        <button type="button" className={secondaryButton} onClick={reset}>{tx({ TR: "Vazgeç", EN: "Cancel" })}</button>
                    </div>
                </form>
            )}

            {phase === "regenerate" && (
                <form onSubmit={regenerate} className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <p className="text-sm font-semibold">{tx({ TR: "Yeni kurtarma kodları oluştur", EN: "Generate new recovery codes" })}</p>
                    <p className="text-sm text-zinc-500">{tx({ TR: "Eski kodların tümü geçersiz olur. Onaylamak için doğrulama uygulamanızdaki kodu girin.", EN: "All old codes stop working. Confirm with the code from your authenticator app." })}</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="sm:w-64">{codeInput(true)}</div>
                        <button type="submit" className={primaryButton} disabled={busy || !code}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}{tx({ TR: "Oluştur", EN: "Generate" })}</button>
                        <button type="button" className={secondaryButton} onClick={reset}>{tx({ TR: "Vazgeç", EN: "Cancel" })}</button>
                    </div>
                </form>
            )}
        </div>
    );
}
