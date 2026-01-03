"use client";

import { useEffect, useState, useRef } from "react";

export default function ScrollLines() {
    const [scrollY, setScrollY] = useState(0);
    const [isVisible, setIsVisible] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleScroll = () => {
            setScrollY(window.scrollY);
            // Check if lines should be visible (only on first section)
            setIsVisible(window.scrollY < window.innerHeight * 2);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    if (!isVisible) return null;

    // Calculate line positions based on scroll
    const line1Offset = scrollY * 0.3;
    const line2Offset = scrollY * 0.5;
    const line3Offset = scrollY * 0.4;

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 pointer-events-none overflow-hidden z-0"
            style={{ opacity: Math.max(0, 1 - scrollY / 800) }}
        >
            {/* Line 1 - Cyan/Teal curved line on left */}
            <svg
                className="absolute left-0 top-0 h-[200%] w-32"
                viewBox="0 0 100 1000"
                preserveAspectRatio="none"
                style={{
                    transform: `translateY(${-50 + line1Offset}px)`,
                    transition: "transform 0.1s ease-out",
                }}
            >
                <path
                    d="M 20 0 Q 80 250 30 500 Q -20 750 50 1000"
                    fill="none"
                    stroke="url(#gradient1)"
                    strokeWidth="2"
                    strokeLinecap="round"
                />
                <defs>
                    <linearGradient id="gradient1" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#00d9ff" stopOpacity="0" />
                        <stop offset="30%" stopColor="#00d9ff" stopOpacity="0.8" />
                        <stop offset="70%" stopColor="#06b6d4" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#0891b2" stopOpacity="0" />
                    </linearGradient>
                </defs>
            </svg>

            {/* Line 2 - Purple/Pink curved line on right */}
            <svg
                className="absolute right-0 top-0 h-[200%] w-32"
                viewBox="0 0 100 1000"
                preserveAspectRatio="none"
                style={{
                    transform: `translateY(${-100 + line2Offset}px)`,
                    transition: "transform 0.1s ease-out",
                }}
            >
                <path
                    d="M 80 0 Q 20 200 70 400 Q 120 600 50 800 Q -10 950 60 1000"
                    fill="none"
                    stroke="url(#gradient2)"
                    strokeWidth="2"
                    strokeLinecap="round"
                />
                <defs>
                    <linearGradient id="gradient2" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
                        <stop offset="30%" stopColor="#a855f7" stopOpacity="0.8" />
                        <stop offset="70%" stopColor="#ec4899" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                    </linearGradient>
                </defs>
            </svg>

            {/* Line 3 - Green/Lime curved line in center-left */}
            <svg
                className="absolute left-1/4 top-0 h-[200%] w-32"
                viewBox="0 0 100 1000"
                preserveAspectRatio="none"
                style={{
                    transform: `translateY(${-80 + line3Offset}px)`,
                    transition: "transform 0.1s ease-out",
                }}
            >
                <path
                    d="M 50 0 Q 90 300 40 500 Q -10 700 80 1000"
                    fill="none"
                    stroke="url(#gradient3)"
                    strokeWidth="2"
                    strokeLinecap="round"
                />
                <defs>
                    <linearGradient id="gradient3" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="0" />
                        <stop offset="30%" stopColor="#22c55e" stopOpacity="0.6" />
                        <stop offset="70%" stopColor="#84cc16" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#a3e635" stopOpacity="0" />
                    </linearGradient>
                </defs>
            </svg>

            {/* Decorative circles that also move with scroll */}
            <div
                className="absolute left-[10%] top-[20%] w-64 h-64 rounded-full border border-zinc-700/30"
                style={{
                    transform: `translateY(${line1Offset * 0.5}px) scale(${1 + scrollY * 0.0002})`,
                    transition: "transform 0.15s ease-out",
                }}
            />
            <div
                className="absolute right-[15%] top-[40%] w-48 h-48 rounded-full border border-zinc-700/20"
                style={{
                    transform: `translateY(${line2Offset * 0.3}px) scale(${1 + scrollY * 0.0001})`,
                    transition: "transform 0.15s ease-out",
                }}
            />
        </div>
    );
}
