"use client";

import Link from "next/link";
import { Github, Download, Code2, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";

type Platform = "windows" | "linux" | "android" | "macos";

const PLATFORMS: { id: Platform; name: string; logo: string; ext: string }[] = [
    { id: "windows", name: "Windows", logo: "/platforms/windows.png", ext: ".exe" },
    { id: "linux", name: "Linux", logo: "/platforms/linux.png", ext: ".AppImage" },
    { id: "android", name: "Android", logo: "/platforms/android.png", ext: ".apk" },
    { id: "macos", name: "macOS", logo: "/platforms/macos.png", ext: ".dmg" },
];

function detectPlatform(): Platform {
    if (typeof window === "undefined") return "windows";
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("android")) return "android";
    if (ua.includes("mac")) return "macos";
    if (ua.includes("linux")) return "linux";
    return "windows";
}

export default function Hero() {
    const { t } = useI18n();
    const { data: session } = useSession();
    const [showDropdown, setShowDropdown] = useState(false);
    const [detectedPlatform, setDetectedPlatform] = useState<Platform>("windows");

    useEffect(() => {
        setDetectedPlatform(detectPlatform());
    }, []);

    const handleDownload = (platform: Platform) => {
        const releaseBase = "https://github.com/Hanstudios1/HanogtCodev/releases/latest/download";

        if (platform === "windows") {
            window.location.href = `${releaseBase}/Hanogt.Codev.Setup.1.0.0.exe`;
        } else if (platform === "linux") {
            window.location.href = `${releaseBase}/Hanogt.Codev-1.0.0.AppImage`;
        } else if (platform === "macos") {
            window.location.href = `${releaseBase}/Hanogt.Codev-1.0.0-arm64.dmg`;
        } else if (platform === "android") {
            window.location.href = "/Hanogt-Codev.apk";
        }
        setShowDropdown(false);
    };

    // If logged in, go to dashboard; otherwise, go to signup
    const ctaHref = session?.user ? "/dashboard" : "/signup";

    return (
        <section className="flex flex-col items-center justify-center min-h-screen text-center px-4 relative pt-20">
            {/* Background Gradients */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-500/20 blur-[100px] rounded-full -z-10 dark:bg-purple-900/20" />

            {/* Watermark Logo */}
            <img
                src="/logo-light.png"
                alt="Watermark"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] opacity-5 pointer-events-none dark:hidden"
            />
            <img
                src="/logo-dark.png"
                alt="Watermark"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] opacity-5 pointer-events-none hidden dark:block"
            />

            {/* Main Heading */}
            <h1 className="text-4xl md:text-6xl font-extrabold text-zinc-900 dark:text-white max-w-4xl leading-tight">
                {t("hero_title_free")} <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-green-500">{t("start_coding")}</span>,
                <br />
                {t("hero_title_test")}
            </h1>

            {/* Subtext */}
            <p className="mt-6 text-lg md:text-xl text-zinc-600 dark:text-zinc-300 font-medium max-w-2xl">
                {t("hero_desc")}
            </p>

            {/* Buttons */}
            <div className="mt-10 flex flex-col md:flex-row items-center gap-4">
                {/* Main CTA - Goes to dashboard if logged in */}
                <Link
                    href={ctaHref}
                    className="px-8 py-4 rounded-full bg-green-600 hover:bg-green-700 text-white font-bold text-lg transition-all shadow-lg hover:shadow-green-500/30 flex items-center gap-2"
                >
                    <Code2 className="w-5 h-5" />
                    {session?.user ? (t("go_to_dashboard") || "Dashboard'a Git") : t("cta_start")}
                </Link>

                {/* Secondary Buttons */}
                <div className="flex items-center gap-4">
                    <Link
                        href="https://github.com/Hanstudios1/HanogtLanguageSoftwareScript"
                        target="_blank"
                        className="px-6 py-3 rounded-full bg-zinc-800 hover:bg-zinc-900 text-white font-medium transition-all shadow-md flex items-center gap-2 border border-zinc-700 hover:border-zinc-500"
                    >
                        <Github className="w-5 h-5" />
                        Github
                    </Link>

                    {/* Download Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all shadow-md flex items-center gap-2"
                        >
                            <Download className="w-5 h-5" />
                            {t("download_app") || "Bu Uygulamayı Cihazına İndir"}
                            <ChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
                        </button>

                        {/* Dropdown Menu */}
                        {showDropdown && (
                            <div className="absolute top-full mt-2 left-0 right-0 bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 z-50 min-w-[220px]">
                                {PLATFORMS.map((platform) => (
                                    <button
                                        key={platform.id}
                                        onClick={() => handleDownload(platform.id)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-left ${platform.id === detectedPlatform ? "bg-blue-50 dark:bg-blue-900/30" : ""
                                            }`}
                                    >
                                        <img src={platform.logo} alt={platform.name} className="w-6 h-6 object-contain" />
                                        <div>
                                            <span className="font-medium text-zinc-900 dark:text-white">{platform.name}</span>
                                            {platform.id === detectedPlatform && (
                                                <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">{t("recommended") || "Önerilen"}</span>
                                            )}
                                            <p className="text-xs text-zinc-500">{platform.ext}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
