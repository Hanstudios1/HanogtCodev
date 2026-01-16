"use client";

import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import Image from "next/image";

// Step data with image paths
const steps = [
    { id: 1, image: "/how-it-works/step01.png", key: "hiw_step1" },
    { id: 2, image: "/how-it-works/step02.png", key: "hiw_step2" },
    { id: 3, image: "/how-it-works/step03.png", key: "hiw_step3" },
    { id: 4, image: "/how-it-works/step04.png", key: "hiw_step4" },
    { id: 5, image: "/how-it-works/step05.png", key: "hiw_step5" },
    { id: 6, image: "/how-it-works/step06.png", key: "hiw_step6" },
    { id: 7, image: "/how-it-works/step07.png", key: "hiw_step7" },
    { id: 8, image: "/how-it-works/step08.png", key: "hiw_step8" },
    { id: 9, image: "/how-it-works/step09.png", key: "hiw_step9" },
    { id: 10, image: "/how-it-works/step10.png", key: "hiw_step10" },
    { id: 11, image: "/how-it-works/step11.png", key: "hiw_step11" },
    { id: 12, image: "/how-it-works/step12.png", key: "hiw_step12" },
    { id: 13, image: "/how-it-works/step13.png", key: "hiw_step13" },
    { id: 14, image: "/how-it-works/step14.png", key: "hiw_step14" },
    { id: 15, image: "/how-it-works/step15.png", key: "hiw_step15" },
    { id: 16, image: "/how-it-works/step16.png", key: "hiw_step16" },
    { id: 17, image: "/how-it-works/step17.png", key: "hiw_step17" },
    { id: 18, image: "/how-it-works/step18.png", key: "hiw_step18" },
    { id: 19, image: "/how-it-works/step19.png", key: "hiw_step19" },
];

export default function HowItWorks() {
    const { t } = useI18n();

    return (
        <section className="py-20 bg-white dark:bg-zinc-950">
            <div className="max-w-5xl mx-auto px-6">
                {/* Section Title */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <h2 className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-white mb-4">
                        {t("hiw_title") || "Nasıl Çalışır?"}
                    </h2>
                    <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
                        {t("hiw_subtitle") || "Hanogt Codev'i kullanmaya başlamak çok kolay. Aşağıdaki adımları takip edin."}
                    </p>
                </motion.div>

                {/* Steps */}
                <div className="space-y-16">
                    {steps.map((step, index) => (
                        <motion.div
                            key={step.id}
                            initial={{ opacity: 0, y: 50 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            viewport={{ once: true, margin: "-100px" }}
                            className="flex flex-col items-center"
                        >
                            {/* Step Number Badge */}
                            <div className="flex items-center gap-3 mb-6">
                                <span className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
                                    {step.id}
                                </span>
                                <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">
                                    {t(`hiw_step${step.id}_title`) || `Adım ${step.id}`}
                                </h3>
                            </div>

                            {/* Image Container */}
                            <div className="relative w-full max-w-4xl rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-xl bg-zinc-900">
                                <Image
                                    src={step.image}
                                    alt={t(`hiw_step${step.id}_title`) || `Adım ${step.id}`}
                                    width={1200}
                                    height={675}
                                    className="w-full h-auto"
                                    priority={index < 3}
                                />
                            </div>

                            {/* Description */}
                            <p className="mt-6 text-center text-zinc-600 dark:text-zinc-400 max-w-2xl text-base leading-relaxed">
                                {t(`hiw_step${step.id}_desc`) || "Bu adımda yapılacak işlemleri açıklayan metin."}
                            </p>

                            {/* Divider line between steps */}
                            {index < steps.length - 1 && (
                                <div className="mt-12 w-px h-16 bg-gradient-to-b from-blue-500 to-transparent" />
                            )}
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
