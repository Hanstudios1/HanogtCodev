"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import OptimizedImage from "@/components/OptimizedImage";
import { useI18n } from "@/lib/i18n";
import { GITHUB_URL } from "@/lib/site";

type Platform = "windows" | "linux" | "android" | "macos";

const PLATFORMS: Array<{ id: Platform; name: string; logo: string; ext: string; file: string }> = [
    { id: "windows", name: "Windows", logo: "/platforms/windows.png", ext: ".exe", file: "Hanogt.Codev.Setup.1.0.0.exe" },
    { id: "macos", name: "macOS", logo: "/platforms/macos.png", ext: ".dmg", file: "Hanogt.Codev-1.0.0-arm64.dmg" },
    { id: "linux", name: "Linux", logo: "/platforms/linux.png", ext: ".AppImage", file: "Hanogt.Codev-1.0.0.AppImage" },
    { id: "android", name: "Android", logo: "/platforms/android.png", ext: ".apk", file: "Hanogt-Codev.apk" },
];

function detectPlatform(): Platform {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("android")) return "android";
    if (ua.includes("mac")) return "macos";
    if (ua.includes("linux")) return "linux";
    return "windows";
}

export default function DownloadMenu() {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [detected, setDetected] = useState<Platform | null>(null);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => {
                    setDetected((current) => current ?? detectPlatform());
                    setOpen((value) => !value);
                }}
                aria-expanded={open}
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-zinc-200 bg-white/80 px-5 text-[14px] font-semibold text-zinc-800 backdrop-blur transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100"
            >
                <Download className="h-4 w-4" />{t("download_app") || "Uygulamayı indir"}<ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
                {open ? (
                    <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="absolute start-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                    >
                        {PLATFORMS.map((platform) => (
                            <a
                                key={platform.id}
                                href={`${GITHUB_URL}/releases/latest/download/${platform.file}`}
                                rel="noopener noreferrer"
                                onClick={() => setOpen(false)}
                                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-zinc-100 dark:hover:bg-white/[0.06] ${platform.id === detected ? "bg-indigo-500/[0.07]" : ""}`}
                            >
                                <OptimizedImage src={platform.logo} alt="" className="h-6 w-6 object-contain" />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[14px] font-semibold text-zinc-900 dark:text-white">{platform.name}</span>
                                    <span className="block text-[11.5px] text-zinc-500">{platform.ext}</span>
                                </span>
                                {platform.id === detected ? <span className="rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-bold text-white">{t("recommended") || "Önerilen"}</span> : null}
                            </a>
                        ))}
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
