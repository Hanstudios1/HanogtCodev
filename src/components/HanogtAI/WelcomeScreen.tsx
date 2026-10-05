"use client";

import { motion } from "framer-motion";
import { useSyncExternalStore, type ReactNode } from "react";
import Accented, { accent } from "@/components/Accented";
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

const EASE = [0.22, 1, 0.36, 1] as const;

/** The suggestion icons take the accent's colors in turn: purple, blue, pink, yellow. */
const ICON_TONES = ["text-violet-600 dark:text-violet-400", "text-blue-600 dark:text-blue-400", "text-pink-600 dark:text-pink-400", "text-amber-600 dark:text-amber-400"];

/**
 * The empty conversation: the logo and a serif greeting with the person's
 * name in the accent gradient, the composer (on the full page) and
 * suggestions, arriving one after another.
 */
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
    const greeting = firstName ? tx(C.named, { greeting: tx(C[part]), name: accent(firstName) }) : tx(C[part]);
    const page = variant === "page";
    const Heading = page ? motion.h1 : motion.h2;

    return (
        <div className={cx("flex flex-col items-center px-4 text-center", page ? "w-full" : "h-full justify-center py-8")} data-ai-welcome>
            <div className={cx("flex items-center gap-3", !page && "flex-col")}>
                <motion.span
                    initial={{ scale: 0.6, rotate: -14, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                    whileHover={{ rotate: [0, -10, 10, 0], transition: { duration: 0.5 } }}
                    className="inline-flex"
                >
                    <AiAvatar size={page ? 44 : 48} />
                </motion.span>
                <Heading
                    initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.6, delay: 0.08, ease: EASE }}
                    className={cx("font-serif font-normal tracking-tight text-ai-ink", page ? "text-[32px] leading-tight sm:text-[42px]" : "text-[24px] leading-snug")}
                >
                    <Accented text={greeting} />
                </Heading>
            </div>
            <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.18, ease: EASE }}
                className={cx("mt-2 max-w-md leading-relaxed text-ai-muted", page ? "text-[14.5px]" : "text-[13px]")}
            >
                {tx(C.subtitle[mode])}
            </motion.p>
            {composer ? (
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.26, ease: EASE }} className="mt-7 w-full">
                    {composer}
                </motion.div>
            ) : null}
            <div className={cx("mt-5 flex flex-wrap justify-center gap-2", page ? "max-w-3xl" : "max-w-sm")}>
                {STARTERS[mode].map((starter, index) => {
                    const Icon = starter.icon;
                    return (
                        <motion.button
                            key={`${mode}-${starter.title.EN}`}
                            type="button"
                            onClick={() => onPick(tx(starter.prompt))}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.34 + index * 0.06, ease: EASE }}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.97 }}
                            className="group inline-flex items-center gap-1.5 rounded-full border border-ai-line bg-ai-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ai-ink/75 shadow-sm shadow-black/[0.02] transition-colors hover:border-ai-ink/25 hover:text-ai-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30"
                        >
                            <Icon className={cx("h-3.5 w-3.5 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6", ICON_TONES[index % ICON_TONES.length])} aria-hidden />
                            {tx(starter.title)}
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
}
