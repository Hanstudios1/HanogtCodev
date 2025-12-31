"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";

export default function ImageSliderComparison() {
    const { t } = useI18n();
    const [sliderPosition, setSliderPosition] = useState(50);
    const [isDragging, setIsDragging] = useState(false);
    const [containerWidth, setContainerWidth] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMove = (clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percentage = (x / rect.width) * 100;
        setSliderPosition(Math.min(Math.max(percentage, 0), 100));
    };

    const handleMouseDown = () => setIsDragging(true);
    const handleMouseUp = () => setIsDragging(false);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) handleMove(e.clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        handleMove(e.touches[0].clientX);
    };

    useEffect(() => {
        const handleGlobalMouseUp = () => setIsDragging(false);
        window.addEventListener("mouseup", handleGlobalMouseUp);
        return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
    }, []);

    // Update container width on mount and resize
    useEffect(() => {
        const updateWidth = () => {
            if (containerRef.current) {
                setContainerWidth(containerRef.current.offsetWidth);
            }
        };
        updateWidth();
        window.addEventListener("resize", updateWidth);
        return () => window.removeEventListener("resize", updateWidth);
    }, []);

    return (
        <section className="py-20 bg-white dark:bg-zinc-950">
            <div className="max-w-5xl mx-auto px-6">
                {/* Quote */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="text-center mb-12"
                >
                    <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white italic">
                        "{t("comparison_quote") || "Karmaşıklığa Gerek Yok, Sadece Gerekli Olanlar Ve Sadelik Yeterli..."}"
                    </h2>
                </motion.div>

                {/* Slider Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    ref={containerRef}
                    className="relative w-full aspect-video rounded-2xl overflow-hidden cursor-ew-resize border-4 border-zinc-200 dark:border-zinc-800 shadow-2xl select-none"
                    onMouseMove={handleMouseMove}
                    onTouchMove={handleTouchMove}
                >
                    {/* Hanogt Image (Right - Full Background) */}
                    <div className="absolute inset-0">
                        <img
                            src="/comparison-hanogt.png"
                            alt="Hanogt Codev"
                            className="w-full h-full object-cover object-left"
                            draggable={false}
                        />
                        {/* Label */}
                        <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg z-20">
                            ✓ Hanogt Codev
                        </div>
                    </div>

                    {/* Replit Image (Left - Clipped with clip-path) */}
                    <div
                        className="absolute inset-0"
                        style={{
                            clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`
                        }}
                    >
                        <img
                            src="/comparison-replit.png"
                            alt="Replit.com"
                            className="w-full h-full object-cover object-left"
                            draggable={false}
                        />
                        {/* Label */}
                        <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg">
                            ✗ Replit
                        </div>
                    </div>

                    {/* Slider Handle */}
                    <div
                        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-10"
                        style={{ left: `${sliderPosition}%`, transform: "translateX(-50%)" }}
                        onMouseDown={handleMouseDown}
                        onTouchStart={() => setIsDragging(true)}
                    >
                        {/* Handle Circle */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white dark:bg-zinc-800 rounded-full shadow-xl flex items-center justify-center border-4 border-blue-500">
                            <div className="flex gap-0.5">
                                <div className="w-0.5 h-4 bg-blue-500 rounded-full" />
                                <div className="w-0.5 h-4 bg-blue-500 rounded-full" />
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Instructions */}
                <p className="text-center text-zinc-500 dark:text-zinc-400 mt-4 text-sm">
                    ← {t("drag_to_compare") || "Karşılaştırmak için sürükleyin"} →
                </p>
            </div>
        </section>
    );
}
