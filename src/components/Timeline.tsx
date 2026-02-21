"use client";

import { motion } from "framer-motion";
import { Code2, Zap, Shield, Globe, Sparkles, Rocket } from "lucide-react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

const FEATURES = [
    {
        icon: Code2,
        titleKey: "feature_multi_lang",
        descKey: "feature_multi_lang_desc",
        titleFallback: "Çoklu Dil Desteği",
        descFallback: "Python, JavaScript, C++, Java ve daha fazlası. 12+ programlama dili ile istediğiniz projelerinizi geliştirin.",
    },
    {
        icon: Zap,
        titleKey: "feature_instant_run",
        descKey: "feature_instant_run_desc",
        titleFallback: "Anında Çalıştırma",
        descFallback: "Kodunuzu tek tıkla çalıştırın. Piston API ile güçlendirilmiş hızlı ve güvenli kod yürütme.",
    },
    {
        icon: Shield,
        titleKey: "feature_secure",
        descKey: "feature_secure_desc",
        titleFallback: "Güvenli & Gizli",
        descFallback: "Verileriniz sadece sizin sunucularımızda. Hiçbir veri üçüncü taraflarla paylaşılmaz.",
    },
    {
        icon: Globe,
        titleKey: "feature_cloud",
        descKey: "feature_cloud_desc",
        titleFallback: "Her Yerden Erişim",
        descFallback: "Bulut tabanlı depolama ile projelerinize her cihazdan ulaşın. Firebase ile senkronize.",
    },
    {
        icon: Sparkles,
        titleKey: "feature_ai",
        descKey: "feature_ai_desc",
        titleFallback: "AI Asistan",
        descFallback: "Yapay zeka destekli kodlama yardımcısı. Sorularınızı sorun, kodlarınızı düzeltin.",
    },
    {
        icon: Rocket,
        titleKey: "feature_free",
        descKey: "feature_free_desc",
        titleFallback: "%100 Ücretsiz",
        descFallback: "Hiçbir gizli ücret yok. Sınırsız proje, reklamsız deneyim. Tamamen ücretsiz.",
    },
];

export default function Timeline() {
    const { t } = useI18n();
    const { data: session } = useSession();

    // If logged in, go to dashboard
    const ctaHref = session?.user ? "/dashboard" : "/signup";

    return (
        <section className="py-24 bg-zinc-100 dark:bg-zinc-950 relative overflow-hidden transition-colors">
            {/* Background Gradients */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-zinc-300/30 dark:bg-zinc-800/30 rounded-full blur-[120px]" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-zinc-300/30 dark:bg-zinc-800/30 rounded-full blur-[120px]" />

            <div className="max-w-6xl mx-auto px-6 relative">
                {/* Section Title */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="text-center mb-20"
                >
                    <h2 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-white mb-4">
                        {t("why_features") || "Neden"} <span className="text-zinc-700 dark:text-zinc-300">Hanogt Codev</span>?
                    </h2>
                    <p className="text-zinc-600 dark:text-zinc-400 text-lg max-w-2xl mx-auto">
                        {t("features_subtitle") || "Modern geliştiriciler için tasarlandı. Her özellik, kodlama deneyiminizi daha iyi hale getirmek için düşünüldü."}
                    </p>
                </motion.div>

                {/* Timeline Container */}
                <div className="relative">
                    {/* Central Line - Black/White based on theme */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-zinc-400 dark:bg-zinc-600 hidden md:block" />

                    {/* Features */}
                    <div className="space-y-12 md:space-y-24">
                        {FEATURES.map((feature, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50, y: 30 }}
                                whileInView={{ opacity: 1, x: 0, y: 0 }}
                                transition={{ duration: 0.6, delay: index * 0.1 }}
                                viewport={{ once: true, margin: "-100px" }}
                                className={`flex items-center gap-8 ${index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                                    } flex-col`}
                            >
                                {/* Content Card */}
                                <div className={`flex-1 ${index % 2 === 0 ? "md:text-right" : "md:text-left"}`}>
                                    <div className="bg-white dark:bg-zinc-900 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all hover:shadow-xl">
                                        <div className={`inline-flex items-center gap-3 mb-4 ${index % 2 === 0 ? "md:flex-row-reverse" : ""}`}>
                                            {/* Icon - Black/White based on theme */}
                                            <div className="w-12 h-12 rounded-xl bg-zinc-900 dark:bg-white flex items-center justify-center">
                                                <feature.icon className="w-6 h-6 text-white dark:text-zinc-900" />
                                            </div>
                                            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                                                {t(feature.titleKey) || feature.titleFallback}
                                            </h3>
                                        </div>
                                        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                            {t(feature.descKey) || feature.descFallback}
                                        </p>
                                    </div>
                                </div>

                                {/* Timeline Dot - Black/White based on theme */}
                                <div className="hidden md:flex items-center justify-center z-10">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        whileInView={{ scale: 1 }}
                                        transition={{ duration: 0.4, delay: index * 0.1 + 0.2 }}
                                        viewport={{ once: true }}
                                        className="w-5 h-5 rounded-full bg-zinc-900 dark:bg-white ring-4 ring-zinc-100 dark:ring-zinc-950"
                                    />
                                </div>

                                {/* Spacer for alternating layout */}
                                <div className="flex-1 hidden md:block" />
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Bottom CTA - Session aware and themed */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="text-center mt-20"
                >
                    <Link
                        href={ctaHref}
                        className="inline-flex items-center gap-2 px-8 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 font-bold rounded-2xl transition-all shadow-lg"
                    >
                        <Rocket className="w-5 h-5" />
                        {session?.user ? (t("go_to_dashboard") || "Dashboard'a Git") : (t("cta_start") || "Hemen Başla")}
                    </Link>
                </motion.div>
            </div>
        </section>
    );
}
