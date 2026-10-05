"use client";

import { Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { cx, storageGet, storageSet } from "@/components/Groups/ui";
import { useI18n, type Copy } from "@/lib/i18n";
import { SOCIAL_DISCLAIMER, SOCIAL_DISCLAIMER_TITLE, SOCIAL_GROUP_REPORT, SOCIAL_NOTICE_PATH } from "@/lib/social/disclaimer";

const C = {
    support: { TR: "Destek talebi oluştur", EN: "Open a support ticket" },
    terms: { TR: "Kullanım Şartları", EN: "Terms of Use" },
    privacy: { TR: "Gizlilik Politikası", EN: "Privacy Policy" },
    welcome: { TR: "Hanogt Social'a hoş geldin", EN: "Welcome to Hanogt Social" },
    welcomeText: { TR: "Gruplarda Hanogt Security Bot ve AutoMod kuralları geçerlidir; Hanogt AI'a /ai ile soru sorabilirsin. Mesajlaşma ayarlarını sol alttaki dişli simgesinden değiştirebilirsin.", EN: "Groups follow Hanogt Security Bot and AutoMod rules; you can ask Hanogt AI with /ai. Change your messaging settings with the gear at the bottom left." },
    gotIt: { TR: "Anladım", EN: "Got it" },
} satisfies Record<string, Copy>;

const NOTICE_KEY = "hanogt:social:disclaimer-seen";
const noticeListeners = new Set<() => void>();
const subscribeNotice = (listener: () => void) => {
    noticeListeners.add(listener);
    return () => { noticeListeners.delete(listener); };
};

/** Shown once on Hanogt Social's home until dismissed (this browser remembers it). */
export function FirstRunNotice() {
    const { tx } = useI18n();
    const seen = useSyncExternalStore(subscribeNotice, () => storageGet(NOTICE_KEY) === "1", () => true);
    if (seen) return null;
    const dismiss = () => {
        storageSet(NOTICE_KEY, "1");
        for (const listener of noticeListeners) listener();
    };
    return (
        <section className="mb-4 rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.05] p-4" aria-labelledby="social-welcome-title">
            <h2 id="social-welcome-title" className="flex items-center gap-2 text-sm font-black text-zinc-900 dark:text-white"><ShieldCheck className="h-4 w-4 text-indigo-500" aria-hidden />{tx(C.welcome)}</h2>
            <p className="mt-1.5 text-[13px] leading-6 text-zinc-600 dark:text-zinc-300">{tx(C.welcomeText)}</p>
            <p className="mt-1.5 text-[13px] leading-6 text-zinc-600 dark:text-zinc-300">{tx(SOCIAL_DISCLAIMER)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={dismiss} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500">{tx(C.gotIt)}</button>
                <Link href="/terms-of-use#groups" className="text-[13px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{tx(C.terms)}</Link>
            </div>
        </section>
    );
}

/** Hanogt Social's disclaimer with the way to report unlawful content (Terms of Use: Hanogt Social, notices and liability). */
export default function SocialDisclaimer({ compact = false, className }: { compact?: boolean; className?: string }) {
    const { tx } = useI18n();
    return (
        <section className={cx("rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-[13px] leading-6 text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300", className)} aria-labelledby="social-disclaimer-title">
            <h3 id="social-disclaimer-title" className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white"><Scale className="h-4 w-4 text-zinc-400" aria-hidden />{tx(SOCIAL_DISCLAIMER_TITLE)}</h3>
            <p className="mt-1.5">{tx(SOCIAL_DISCLAIMER)}</p>
            {!compact && <p className="mt-2">{tx(SOCIAL_NOTICE_PATH)}</p>}
            {!compact && <p className="mt-2">{tx(SOCIAL_GROUP_REPORT)}</p>}
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold">
                {!compact && <Link href="/feedback" className="text-indigo-600 hover:underline dark:text-indigo-300">{tx(C.support)}</Link>}
                <Link href="/terms-of-use#groups" className="text-indigo-600 hover:underline dark:text-indigo-300">{tx(C.terms)}</Link>
                <Link href="/privacy-policy" className="text-indigo-600 hover:underline dark:text-indigo-300">{tx(C.privacy)}</Link>
            </p>
        </section>
    );
}
