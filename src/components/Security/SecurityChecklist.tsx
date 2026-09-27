"use client";

import { motion } from "framer-motion";
import { Check, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useI18n, type Copy } from "@/lib/i18n";

const KEY = "hanogt-security:checklist";

const ITEMS: Array<{ id: string; text: Copy; href?: string; link?: Copy }> = [
    { id: "unique-password", text: { TR: "Hanogt parolam en az 12 karakter ve başka hiçbir sitede kullanılmıyor.", EN: "My Hanogt password has 12+ characters and isn't used anywhere else." } },
    { id: "google-2fa", text: { TR: "Google ile giriş yapıyorsam Google hesabımda 2 adımlı doğrulama açık.", EN: "If I sign in with Google, 2-step verification is on for that account." } },
    { id: "privacy-settings", text: { TR: "Hesap Ayarları'nda profil görünürlüğü ve çevrimiçi durumunu gözden geçirdim.", EN: "I reviewed profile visibility and online status in Account Settings." }, href: "/account-settings", link: { TR: "Ayarlar", EN: "Settings" } },
    { id: "no-secrets", text: { TR: "Paylaştığım kodlarda API anahtarı veya parola bırakmıyorum (Danışman ile tarıyorum).", EN: "I never leave API keys or passwords in shared code (I scan with the Advisor)." } },
    { id: "check-links", text: { TR: "Tanımadığım bağlantılara tıklamadan önce Bağlantı Kontrolü'nü kullanıyorum.", EN: "I use Link Check before clicking unknown links." } },
    { id: "shared-device", text: { TR: "Ortak kullanılan cihazlarda işim bitince çıkış yapıyorum.", EN: "I sign out when I'm done on shared devices." } },
    { id: "codes", text: { TR: "Doğrulama kodlarımı ve parolamı kimseyle paylaşmıyorum; Hanogt bunları asla istemez.", EN: "I never share verification codes or passwords; Hanogt never asks for them." } },
    { id: "updates", text: { TR: "Tarayıcım ve işletim sistemim güncel.", EN: "My browser and operating system are up to date." } },
    { id: "backup", text: { TR: "Önemli projelerimi indirip yedekliyorum.", EN: "I download and back up important projects." } },
    { id: "report", text: { TR: "Bir güvenlik açığı görürsem kişisel veri eklemeden Geri Bildirim'den bildiriyorum.", EN: "If I spot a vulnerability I report it via Feedback without personal data." }, href: "/feedback", link: { TR: "Bildir", EN: "Report" } },
];

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: string[] } = { raw: null, value: [] };
const EMPTY: string[] = [];

function read(): string[] {
    let raw: string | null = null;
    try {
        raw = window.localStorage.getItem(KEY);
    } catch {
        raw = null;
    }
    if (raw === cache.raw) return cache.value;
    let value: string[] = EMPTY;
    try {
        const parsed = JSON.parse(raw ?? "[]") as unknown;
        if (Array.isArray(parsed)) value = parsed.filter((entry): entry is string => typeof entry === "string");
    } catch {
        value = EMPTY;
    }
    cache = { raw, value };
    return value;
}

function write(value: string[]) {
    try {
        window.localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
        // Progress is a convenience only.
    }
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key === KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

export default function SecurityChecklist() {
    const { tx } = useI18n();
    const done = useSyncExternalStore(subscribe, read, () => EMPTY);
    const progress = Math.round((done.filter((id) => ITEMS.some((item) => item.id === id)).length / ITEMS.length) * 100);

    const toggle = (id: string) => write(done.includes(id) ? done.filter((entry) => entry !== id) : [...done, id]);

    return (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-white/10 dark:bg-zinc-900/60">
                <div className="relative grid h-36 w-36 place-items-center">
                    <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-zinc-200 dark:stroke-white/10" />
                        <motion.circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-emerald-500" animate={{ pathLength: progress / 100 }} transition={{ duration: 0.6 }} />
                    </svg>
                    <div>
                        <p className="text-4xl font-black text-zinc-900 dark:text-white">%{progress}</p>
                        <p className="text-[12px] font-semibold text-zinc-500">{tx({ TR: "tamamlandı", EN: "complete" })}</p>
                    </div>
                </div>
                <p className="mt-4 text-[13px] text-zinc-600 dark:text-zinc-400">{progress === 100 ? tx({ TR: "Harika! Hesabın iyi korunuyor. 🛡️", EN: "Great! Your account is well protected. 🛡️" }) : tx({ TR: "İlerlemen yalnızca bu cihazda saklanır.", EN: "Progress is stored on this device only." })}</p>
                {done.length ? <button type="button" onClick={() => write([])} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-white"><RotateCcw className="h-3.5 w-3.5" />{tx({ TR: "Sıfırla", EN: "Reset" })}</button> : null}
            </div>
            <ul className="space-y-2">
                {ITEMS.map((item, index) => {
                    const checked = done.includes(item.id);
                    return (
                        <motion.li key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                            <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${checked ? "border-emerald-500/40 bg-emerald-500/[0.07]" : "border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900/60"}`}>
                                <button type="button" role="checkbox" aria-checked={checked} onClick={() => toggle(item.id)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition ${checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300 hover:border-emerald-400 dark:border-zinc-600"}`} aria-label={tx(item.text)}>
                                    {checked ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                                </button>
                                <span className={`flex-1 text-[14px] ${checked ? "text-zinc-500 line-through decoration-emerald-500/50" : "text-zinc-800 dark:text-zinc-100"}`}>{tx(item.text)}</span>
                                {item.href && item.link ? <Link href={item.href} className="shrink-0 text-[12.5px] font-bold text-emerald-600 hover:underline dark:text-emerald-400">{tx(item.link)} →</Link> : null}
                            </div>
                        </motion.li>
                    );
                })}
            </ul>
        </div>
    );
}
