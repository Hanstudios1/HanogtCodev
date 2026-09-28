"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { NEWS_CATEGORIES } from "@/lib/news/sources";
import { timeAgo, type NewsItemView } from "@/components/News/NewsTypes";

/** The five newest headlines from /api/news, refreshed every 90 seconds. */
export default function LiveNewsMini({ limit = 5 }: { limit?: number }) {
    const { language, t } = useI18n();
    const locale = language === "TR" ? "tr" : "en";
    const [items, setItems] = useState<NewsItemView[]>([]);
    const [now, setNow] = useState(0);
    const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

    useEffect(() => {
        let disposed = false;
        const load = async () => {
            try {
                const response = await fetch("/api/news", { cache: "no-store" });
                const payload = await response.json() as { items?: NewsItemView[] };
                if (disposed) return;
                const list = (payload.items ?? []).slice(0, limit);
                setItems(list);
                setNow(Date.now());
                setState(list.length ? "ready" : "empty");
            } catch {
                if (!disposed) setState((current) => (current === "ready" ? current : "empty"));
            }
        };
        void load();
        const timer = window.setInterval(() => void load(), 90_000);
        return () => {
            disposed = true;
            window.clearInterval(timer);
        };
    }, [limit]);

    if (state === "loading") {
        return (
            <div className="space-y-2">
                {Array.from({ length: limit }, (_, index) => <div key={index} className="h-11 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/[0.05]" />)}
            </div>
        );
    }

    if (state === "empty") {
        return (
            <Link href="/news" className="flex items-center justify-between rounded-xl border border-dashed border-zinc-300 px-3 py-3 text-[13px] text-zinc-500 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-white/10">
                {t("lnm_open")}<ArrowRight className="h-4 w-4" />
            </Link>
        );
    }

    return (
        <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
                {items.map((item, index) => (
                    <motion.li
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 16 }}
                        transition={{ delay: index * 0.05 }}
                    >
                        <a href={item.link} target="_blank" rel="noopener noreferrer nofollow" className="group flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition hover:bg-zinc-100 dark:hover:bg-white/[0.05]">
                            <span className="mt-0.5 text-base leading-none">{NEWS_CATEGORIES.find((entry) => entry.id === item.category)?.emoji ?? "📰"}</span>
                            <span className="min-w-0 flex-1">
                                <span dir="auto" className="line-clamp-1 text-[13.5px] font-semibold text-zinc-800 group-hover:text-indigo-600 dark:text-zinc-100 dark:group-hover:text-indigo-300">{item.title}</span>
                                <span dir="auto" className="block text-[11px] text-zinc-400">{item.source.name} · {timeAgo(item.publishedAt, locale, now)}</span>
                            </span>
                        </a>
                    </motion.li>
                ))}
            </AnimatePresence>
        </ul>
    );
}
