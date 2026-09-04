"use client";

import Link from "next/link";
import { FileCheck2, ShieldCheck } from "lucide-react";

interface PrivacyPolicyModalProps {
    onAccept: () => void;
}
export default function PrivacyPolicyModal({ onAccept }: PrivacyPolicyModalProps) {
    const handleAccept = () => {
        localStorage.setItem("hanogt_legal_notice_version", "2.0-2026-09-03");
        localStorage.setItem("hanogt_privacy_accepted", "true");
        onAccept();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="legal-title">
            <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-900 text-white shadow-2xl">
                <div className="border-b border-zinc-800 bg-gradient-to-br from-blue-600 to-violet-700 p-7 sm:p-8">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15"><FileCheck2 className="h-5 w-5" /></div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">Sürüm 2.0 · 3 Eylül 2026</p>
                    <h1 id="legal-title" className="mt-2 text-2xl font-bold sm:text-3xl">Gizlilik ve kullanım bilgilendirmesi</h1>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-blue-50">Devam etmeden önce hangi verilerin işlendiğini, hizmet sağlayıcılarını ve kullanım kurallarını açık biçimde inceleyin.</p>
                </div>

                <div className="space-y-4 p-6 text-sm leading-6 text-zinc-300 sm:p-8">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Link href="/privacy-policy" target="_blank" className="rounded-2xl border border-zinc-700 bg-zinc-800/60 p-4 transition hover:border-blue-500"><strong className="block text-white">Gizlilik Politikası</strong><span className="mt-1 block text-xs text-zinc-400">Veri, paylaşım, saklama ve güvenlik</span></Link>
                        <Link href="/disclosure" target="_blank" className="rounded-2xl border border-zinc-700 bg-zinc-800/60 p-4 transition hover:border-blue-500"><strong className="block text-white">Aydınlatma Metni</strong><span className="mt-1 block text-xs text-zinc-400">KVKK m.10 bilgilendirmesi</span></Link>
                        <Link href="/terms-of-use" target="_blank" className="rounded-2xl border border-zinc-700 bg-zinc-800/60 p-4 transition hover:border-blue-500"><strong className="block text-white">Kullanım Şartları</strong><span className="mt-1 block text-xs text-zinc-400">Hesap, içerik ve güvenlik kuralları</span></Link>
                    </div>
                    <div className="flex gap-3 rounded-2xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-100"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><p>Parolalar tek yönlü karma olarak saklanır. Kod çalıştırma ve AI hizmetleri üçüncü taraf veya yönetilen altyapı kullanabilir. Sesli aramalar kaydedilmez; geçici bağlantı kayıtları arama bitince silinir.</p></div>
                    <p className="text-xs text-zinc-500">“Okudum ve devam et” seçimi, aydınlatma metninin sunulduğunu kaydeder; pazarlama veya başka isteğe bağlı işlemler için toplu açık rıza oluşturmaz.</p>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-zinc-800 p-6 sm:flex-row sm:justify-end">
                    <Link href="/" className="rounded-xl px-5 py-3 text-center font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-white">Şimdi değil</Link>
                    <button onClick={handleAccept} className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-500">Okudum ve devam et</button>
                </div>
            </div>
        </div>
    );
}
