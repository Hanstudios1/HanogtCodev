"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";

export default function Comparison() {
    const { t, language } = useI18n();

    const varies = language === "TR" ? "Sağlayıcıya göre" : "Varies by provider";
    const included = language === "TR" ? "Dahil" : "Included";
    const COMPARISONS = [
        { feature: t("f_free"), hanogt: included, alternative: varies },
        { feature: t("f_no_ads"), hanogt: included, alternative: varies },
        { feature: t("f_setup"), hanogt: included, alternative: varies },
        { feature: t("f_unlimited"), hanogt: included, alternative: varies },
        { feature: t("f_ai"), hanogt: language === "TR" ? "İsteğe bağlı" : "Optional", alternative: varies },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="w-full max-w-4xl mx-auto overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-900"
        >
            <div className="grid grid-cols-3 bg-zinc-50 dark:bg-zinc-950 p-4 border-b border-zinc-200 dark:border-zinc-800">
                <div className="col-span-1 font-bold text-zinc-500 dark:text-zinc-400 flex items-center">{t("comp_features")}</div>
                <div className="col-span-1 font-bold text-center text-blue-600 dark:text-blue-400 text-lg">Hanogt Codev</div>
                <div className="col-span-1 font-bold text-center text-zinc-500 dark:text-zinc-400">{language === "TR" ? "Diğer bulut editörleri" : "Other cloud editors"}</div>
            </div>

            {COMPARISONS.map((item, idx) => (
                <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.1 }}
                    viewport={{ once: true }}
                    className="grid grid-cols-3 p-4 border-b last:border-0 border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                    <div className="col-span-1 font-medium text-zinc-700 dark:text-zinc-300 flex items-center">{item.feature}</div>

                    <div className="col-span-1 flex justify-center items-center">
                        <span className="inline-flex items-center gap-1.5 text-center text-sm font-semibold text-green-600 dark:text-green-400">
                            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {item.hanogt}
                        </span>
                    </div>

                    <div className="col-span-1 flex justify-center items-center">
                        <span className="text-center text-sm text-zinc-500">{item.alternative}</span>
                    </div>
                </motion.div>
            ))}
        </motion.div>
    );
}
