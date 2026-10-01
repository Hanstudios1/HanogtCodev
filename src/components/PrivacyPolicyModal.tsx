"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { FileCheck2, ShieldCheck, Sparkles } from "lucide-react";
import { useI18n, type Copy } from "@/lib/i18n";
import { LEGAL_CHANGES, LEGAL_EFFECTIVE_DATE, LEGAL_NOTICE_ID, LEGAL_VERSION } from "@/lib/legal";

interface PrivacyPolicyModalProps {
    onAccept: () => void;
    /** True when the user acknowledged an older version; the modal then lists what changed. */
    updated?: boolean;
}

/** Whether the current legal notice still has to be shown in this browser. */
export function legalNoticePending() {
    try {
        return localStorage.getItem("hanogt_privacy_accepted") !== "true" || localStorage.getItem("hanogt_legal_notice_version") !== LEGAL_NOTICE_ID;
    } catch {
        return false;
    }
}

export function legalNoticeUpdated() {
    try {
        return localStorage.getItem("hanogt_privacy_accepted") === "true" && localStorage.getItem("hanogt_legal_notice_version") !== LEGAL_NOTICE_ID;
    } catch {
        return false;
    }
}

const DOCUMENTS: ReadonlyArray<{ href: string; title: Copy; text: Copy }> = [
    { href: "/privacy-policy", title: { TR: "Gizlilik Politikası", EN: "Privacy Policy" }, text: { TR: "Veri, paylaşım, saklama ve güvenlik", EN: "Data, sharing, retention and security" } },
    { href: "/disclosure", title: { TR: "Aydınlatma Metni", EN: "KVKK Notice" }, text: { TR: "KVKK m.10 bilgilendirmesi", EN: "Information under KVKK Art. 10" } },
    { href: "/terms-of-use", title: { TR: "Kullanım Şartları", EN: "Terms of Use" }, text: { TR: "Hesap, içerik ve güvenlik kuralları", EN: "Account, content and security rules" } },
];

export default function PrivacyPolicyModal({ onAccept, updated = false }: PrivacyPolicyModalProps) {
    const { tx } = useI18n();
    const dialogRef = useRef<HTMLDivElement>(null);

    // Move focus into the dialog so keyboard and screen reader users start there.
    useEffect(() => {
        dialogRef.current?.focus();
    }, []);

    const handleAccept = () => {
        try {
            localStorage.setItem("hanogt_legal_notice_version", LEGAL_NOTICE_ID);
            localStorage.setItem("hanogt_privacy_accepted", "true");
        } catch {
            // The notice will simply be shown again next time.
        }
        onAccept();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-md">
            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="legal-title"
                aria-describedby="legal-description"
                className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            >
                <div className="shrink-0 bg-gradient-to-br from-blue-600 to-violet-700 p-6 text-white sm:p-8">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15"><FileCheck2 className="h-5 w-5" aria-hidden /></div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">{tx({ TR: "Sürüm", EN: "Version" })} {LEGAL_VERSION} · {tx(LEGAL_EFFECTIVE_DATE)}</p>
                    <h1 id="legal-title" className="mt-2 text-2xl font-bold sm:text-3xl">{updated ? tx({ TR: "Gizlilik ve kullanım metinleri güncellendi", EN: "Our privacy and terms documents were updated" }) : tx({ TR: "Gizlilik ve kullanım bilgilendirmesi", EN: "Privacy and terms notice" })}</h1>
                    <p id="legal-description" className="mt-3 max-w-xl text-sm leading-6 text-blue-50">{tx({ TR: "Devam etmeden önce hangi verilerin işlendiğini, hizmet sağlayıcılarını ve kullanım kurallarını açık biçimde inceleyin.", EN: "Before you continue, review which data is processed, which service providers are involved and the rules of use." })}</p>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6 text-sm leading-6 text-zinc-600 dark:text-zinc-300 sm:p-8">
                    <div className="grid gap-3 sm:grid-cols-3">
                        {DOCUMENTS.map((entry) => (
                            <Link key={entry.href} href={entry.href} target="_blank" className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800/60">
                                <strong className="block text-zinc-900 dark:text-white">{tx(entry.title)}</strong>
                                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{tx(entry.text)}</span>
                            </Link>
                        ))}
                    </div>
                    {updated ? (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
                            <p className="flex items-center gap-2 font-semibold text-blue-950 dark:text-white"><Sparkles className="h-4 w-4 text-blue-500 dark:text-blue-300" aria-hidden />{tx({ TR: "Bu sürümde neler değişti?", EN: "What changed in this version?" })}</p>
                            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-blue-900/90 dark:text-blue-100/90">
                                {LEGAL_CHANGES[0].items.map((item) => <li key={item.EN} className="flex gap-2"><span aria-hidden>•</span><span>{tx(item)}</span></li>)}
                            </ul>
                        </div>
                    ) : null}
                    <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                        <p>{tx({ TR: "Parolalar scrypt ile tek yönlü karmalanır, reklam veya takip çerezi kullanılmaz ve sesli aramalar kaydedilmez. Tarayıcıda çalışmayan dillerdeki kodunuz ve giriş yapmışken Hanogt AI'a yazdıklarınız üçüncü taraf hizmetlere iletilir; Hanogt AI ajanı yalnızca izin verdiğiniz işlemleri yapar.", EN: "Passwords are hashed one-way with scrypt, no advertising or tracking cookies are used and voice calls are not recorded. Code in languages that don't run in the browser, and what you write to Hanogt AI while signed in, are passed to third-party services; the Hanogt AI agent only takes the actions you allow." })}</p>
                    </div>
                    <p className="text-xs text-zinc-500">{tx({ TR: "“Okudum ve devam et” seçimi, aydınlatma metninin sunulduğunu kaydeder; pazarlama veya başka isteğe bağlı işlemler için toplu açık rıza oluşturmaz.", EN: "Choosing “I've read it, continue” records that the notice was shown to you; it is not a blanket consent to marketing or other optional processing." })}</p>
                </div>

                <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:justify-end sm:p-6">
                    <Link href="/" className="rounded-xl px-5 py-3 text-center font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white">{tx({ TR: "Şimdi değil", EN: "Not now" })}</Link>
                    <button type="button" onClick={handleAccept} className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-500">{tx({ TR: "Okudum ve devam et", EN: "I've read it, continue" })}</button>
                </div>
            </div>
        </div>
    );
}
