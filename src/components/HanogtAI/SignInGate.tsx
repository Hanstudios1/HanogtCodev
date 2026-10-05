"use client";

import { LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n, type Copy } from "@/lib/i18n";
import { PLAN_AI_LIMITS, aiWindowCopy } from "@/lib/plans";
import { AiAvatar, cx } from "./ui";

const C = {
    title: { TR: "Hanogt AI için giriş yap", EN: "Sign in to use Hanogt AI" },
    text: { TR: "Hanogt AI'la konuşmak için giriş yap ya da ücretsiz bir hesap aç. Ücretsiz planda {period} {count} mesaj; Plus ve Pro'da çok daha fazlası.", EN: "Sign in or create a free account to talk to Hanogt AI. The Free plan has {count} messages {period}; Plus and Pro have many more." },
    signIn: { TR: "Giriş yap", EN: "Sign in" },
    signUp: { TR: "Kaydol", EN: "Sign up" },
    plans: { TR: "Planları karşılaştır", EN: "Compare plans" },
} satisfies Record<string, Copy>;

/**
 * What a signed-out visitor sees instead of the chat: Hanogt AI is for
 * signed-in people (nothing is answered without an account, the offline
 * Core included). Sign-in and sign-up bring them back here.
 */
export default function SignInGate({ variant, onNavigate }: { variant: "panel" | "page"; onNavigate?: () => void }) {
    const { tx, locale } = useI18n();
    const pathname = usePathname() || "/ai";
    const back = encodeURIComponent(pathname.startsWith("/") ? pathname : "/ai");
    const free = PLAN_AI_LIMITS.free;
    return (
        <div className={cx("flex flex-col items-center text-center", variant === "page" ? "mx-auto max-w-md px-6 py-10" : "px-5 py-8")} data-ai-signin-gate>
            <AiAvatar size={variant === "page" ? 56 : 44} />
            <h2 className={cx("mt-4 font-black tracking-tight text-ai-ink", variant === "page" ? "text-2xl" : "text-lg")}>{tx(C.title)}</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ai-ink/75">{tx(C.text, { count: free.perWindow.toLocaleString(locale), period: tx(aiWindowCopy(free.windowDays)) })}</p>
            <div className="mt-5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Link href={`/login?callbackUrl=${back}`} onClick={onNavigate} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-ai-ink px-5 text-[13.5px] font-semibold text-ai-paper transition hover:opacity-90">
                    <LogIn className="h-4 w-4" aria-hidden />{tx(C.signIn)}
                </Link>
                <Link href={`/signup?callbackUrl=${back}`} onClick={onNavigate} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-ai-line px-5 text-[13.5px] font-semibold text-ai-ink transition hover:bg-ai-ink/[0.04] dark:border-white/15">
                    <UserPlus className="h-4 w-4" aria-hidden />{tx(C.signUp)}
                </Link>
            </div>
            <Link href="/plans" onClick={onNavigate} className="mt-4 text-[12.5px] font-semibold text-ai-muted underline-offset-2 hover:text-ai-ink hover:underline">{tx(C.plans)}</Link>
        </div>
    );
}
