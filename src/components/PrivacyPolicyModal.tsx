"use client";

import Link from "next/link";
import { FileCheck2, ShieldCheck, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
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

export default function PrivacyPolicyModal({ onAccept, updated = false }: PrivacyPolicyModalProps) {
    const { tx } = useI18n();
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="legal-title">
            <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-900 text-white shadow-2xl">
                <div className="border-b border-zinc-800 bg-gradient-to-br from-blue-600 to-violet-700 p-7 sm:p-8">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15"><FileCheck2 className="h-5 w-5" /></div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">{tx({ TR: "Sürüm", EN: "Version" })} {LEGAL_VERSION} · {LEGAL_EFFECTIVE_DATE}</p>
                    <h1 id="legal-title" className="mt-2 text-2xl font-bold sm:text-3xl">{updated ? tx({ TR: "Gizlilik ve kullanım metinleri güncellendi", EN: "Our privacy and terms documents were updated" }) : tx({ TR: "Gizlilik ve kullanım bilgilendirmesi", EN: "Privacy and terms notice" })}</h1>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-blue-50">{tx({ TR: "Devam etmeden önce hangi verilerin işlendiğini, hizmet sağlayıcılarını ve kullanım kurallarını açık biçimde inceleyin.", EN: "Before you continue, review which data is processed, which service providers are involved and the rules of use." })}</p>
                </div>

                <div className="space-y-4 p-6 text-sm leading-6 text-zinc-300 sm:p-8">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Link href="/privacy-policy" target="_blank" className="rounded-2xl border border-zinc-700 bg-zinc-800/60 p-4 transition hover:border-blue-500"><strong className="block text-white">{tx({ TR: "Gizlilik Politikası", EN: "Privacy Policy" })}</strong><span className="mt-1 block text-xs text-zinc-400">{tx({ TR: "Veri, paylaşım, saklama ve güvenlik", EN: "Data, sharing, retention and security" })}</span></Link>
                        <Link href="/disclosure" target="_blank" className="rounded-2xl border border-zinc-700 bg-zinc-800/60 p-4 transition hover:border-blue-500"><strong className="block text-white">{tx({ TR: "Aydınlatma Metni", EN: "KVKK Notice" })}</strong><span className="mt-1 block text-xs text-zinc-400">{tx({ TR: "KVKK m.10 bilgilendirmesi", EN: "Information under KVKK Art. 10" })}</span></Link>
                        <Link href="/terms-of-use" target="_blank" className="rounded-2xl border border-zinc-700 bg-zinc-800/60 p-4 transition hover:border-blue-500"><strong className="block text-white">{tx({ TR: "Kullanım Şartları", EN: "Terms of Use" })}</strong><span className="mt-1 block text-xs text-zinc-400">{tx({ TR: "Hesap, içerik ve güvenlik kuralları", EN: "Account, content and security rules" })}</span></Link>
                    </div>
                    {updated ? (
                        <div className="rounded-2xl border border-blue-900/60 bg-blue-950/30 p-4 text-blue-100">
                            <p className="flex items-center gap-2 font-semibold text-white"><Sparkles className="h-4 w-4 text-blue-300" />{tx({ TR: "Bu sürümde neler değişti?", EN: "What changed in this version?" })}</p>
                            <ul className="mt-2 space-y-1 text-xs leading-5 text-blue-100/90">
                                {LEGAL_CHANGES[0].items.map((item) => <li key={item}>• {item}</li>)}
                            </ul>
                        </div>
                    ) : null}
                    <div className="flex gap-3 rounded-2xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-100"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><p>{tx({ TR: "Parolalar tek yönlü karma olarak saklanır. Reklam veya takip çerezi kullanılmaz. Kod çalıştırma ve yapay zeka hizmetleri yönetilen altyapı kullanabilir. Sesli aramalar kaydedilmez; güvenlik araçları tarayıcınızda çalışır.", EN: "Passwords are stored as one-way hashes. No advertising or tracking cookies are used. Code execution and AI services may use managed infrastructure. Voice calls are not recorded, and the security tools run in your browser." })}</p></div>
                    <p className="text-xs text-zinc-500">{tx({ TR: "“Okudum ve devam et” seçimi, aydınlatma metninin sunulduğunu kaydeder; pazarlama veya başka isteğe bağlı işlemler için toplu açık rıza oluşturmaz.", EN: "Choosing “I've read it, continue” records that the notice was shown to you; it is not a blanket consent to marketing or other optional processing." })}</p>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-zinc-800 p-6 sm:flex-row sm:justify-end">
                    <Link href="/" className="rounded-xl px-5 py-3 text-center font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-white">{tx({ TR: "Şimdi değil", EN: "Not now" })}</Link>
                    <button onClick={handleAccept} className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-500">{tx({ TR: "Okudum ve devam et", EN: "I've read it, continue" })}</button>
                </div>
            </div>
        </div>
    );
}
