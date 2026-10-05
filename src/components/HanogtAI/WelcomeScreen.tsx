"use client";

import { motion } from "framer-motion";
import { useSyncExternalStore, type ReactNode } from "react";
import type { AiMode } from "@/lib/ai/local-engine";
import { useI18n, type Copy } from "@/lib/i18n";
import { STARTERS } from "./chat-copy";
import { AiAvatar, cx } from "./ui";

const C = {
    morning: { TR: "Günaydın", EN: "Good morning" },
    afternoon: { TR: "İyi günler", EN: "Good afternoon" },
    evening: { TR: "İyi akşamlar", EN: "Good evening" },
    night: { TR: "İyi geceler", EN: "Good night" },
    named: { TR: "{greeting}, {name}", EN: "{greeting}, {name}" },
    subtitle: {
        general: { TR: "Kod, oyun, gruplar ya da site hakkında ne istersen sor; izin verirsen işleri senin için ben yaparım.", EN: "Ask about code, games, groups or the site; with your permission I can do things for you." },
        code: { TR: "Kod yazar, açıklar ve hataları birlikte ayıklarız. Yazdığım kodu editörde açabilirim.", EN: "We'll write, explain and debug code together. I can open what I write in the editor." },
        security: { TR: "Şüpheli bağlantıları ve kodu incelerim, hesabını korumana yardım ederim.", EN: "I inspect suspicious links and code and help you keep your account safe." },
    } satisfies Record<AiMode, Copy>,
};

function partOfDay(): keyof Pick<typeof C, "morning" | "afternoon" | "evening" | "night"> {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 18) return "afternoon";
    if (hour >= 18 && hour < 23) return "evening";
    return "night";
}

const noop = () => () => undefined;

/** The empty conversation: a greeting, the composer (on the full page) and suggestion chips. */
export default function WelcomeScreen({ variant, mode, userName, onPick, composer }: {
    variant: "panel" | "page";
    mode: AiMode;
    userName: string | null;
    onPick: (prompt: string) => void;
    onNavigate?: () => void;
    /** Rendered under the greeting on the full page (centered composer). */
    composer?: ReactNode;
}) {
    const { tx } = useI18n();
    // The time of day is only known in the browser.
    const part = useSyncExternalStore(noop, partOfDay, () => "afternoon" as const);
    const firstName = userName?.split(/\s+/)[0] ?? null;
    const greeting = firstName ? tx(C.named, { greeting: tx(C[part]), name: firstName }) : tx(C[part]);
    const page = variant === "page";

    return (
        <div className={cx("flex flex-col items-center px-4 text-center", page ? "w-full" : "h-full justify-center py-8")}>
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20 }} className="flex items-center gap-3">
                <AiAvatar size={page ? "h-10 w-10" : "h-12 w-12"} />
                {page ? <h1 className="font-serif text-[30px] font-semibold tracking-tight text-zinc-800 sm:text-[38px] dark:text-zinc-100">{greeting}</h1> : null}
            </motion.div>
            {!page ? <h2 className="mt-4 font-serif text-[22px] font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">{greeting}</h2> : null}
            <p className={cx("mt-2 max-w-md leading-relaxed text-zinc-500 dark:text-zinc-400", page ? "text-[14.5px]" : "text-[13px]")}>{tx(C.subtitle[mode])}</p>
            {composer ? <div className="mt-7 w-full">{composer}</div> : null}
            <div className={cx("mt-5 flex flex-wrap justify-center gap-2", page ? "max-w-3xl" : "max-w-sm")}>
                {STARTERS[mode].map((starter) => (
                    <button
                        key={starter.title.EN}
                        type="button"
                        onClick={() => onPick(tx(starter.prompt))}
                        className="rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-zinc-600 transition hover:border-violet-300 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:border-violet-400/40 dark:hover:text-violet-300"
                    >
                        {tx(starter.title)}
                    </button>
                ))}
            </div>
        </div>
    );
}
